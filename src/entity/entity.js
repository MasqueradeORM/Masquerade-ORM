

import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { dependenciesSymb, referencesSymb } from "../misc/constants.js"
import { nonSnake2Snake } from "../misc/miscFunctions.js"
import { OrmStore } from "../misc/ormStore.js"
import { insertProxyIntoEntityMap, proxifyEntityInstanceObj } from "../proxies/instanceProxy.js"
import { throwDeletionErr, throwImproperDecouplingErr, validateDependentDataDecoupling } from "./delete/delete.js"
import { insertDependentsData, internalFind } from "./delete/getDependents.js"
import { aliasedFindWiki2QueryRes, parseFindWiki, destructureAndValidateArg } from "./find/find.js"
import { deproxifyScopeProxy, classWiki2ScopeProxy } from "./find/scopeProxies.js"
import { postgresCreateProxyArray } from "./find/sqlClients/postgresFuncs.js"
import { sqliteCreateProxyArray } from "./find/sqlClients/sqliteFuncs.js"
import { mergeRelationalWhereScope } from "./find/where/relationalWhere.js"
import { mergeWhereScope } from "./find/where/where.js"

/**
 * @template T
 * @typedef {import("../misc/types.js").FindObj<T>} FindObj
 */

export class Entity {
  //@ts-ignore
  /**@type {string | number}*/ id
  /**@type {Date}*/ updatedAt

  /** @abstract */
  constructor() {
    const className = this.constructor.name

    const { classWikiDict, idLogger, entityMapsObj } = OrmStore.store
    if (!classWikiDict) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
    else if (!classWikiDict[className]) throw new Error(`Cannot create an instance of class '${className}' since it is an abstract class.`)

    let idVal
    if (typeof idLogger[className] === `function`) idVal = idLogger[className]()
    else idVal = ++idLogger[className]

    Object.defineProperty(this, 'id', {
      value: idVal,
      writable: false,
      enumerable: true,
      configurable: false
    })
    this.updatedAt = new Date()

    const proxy = proxifyEntityInstanceObj(this)
    const entityMap = entityMapsObj[className] ??= new Map()
    insertProxyIntoEntityMap(proxy, entityMap)
    ChangeLogger.flushChanges()
    return proxy
  }

  /**
   * Finds instances in the database that match the given argument.
   * Relations do not get filtered by any where condition, only the root instances get filtered.
   * (RootClass.find(arg)) => only RootClass instances matching the arg's where conditions get returned. 
   *
     * @template T
     * @this {{ new(...args: any[]): T }}
     * @param {FindObj<T>} findObj
     * @returns {Promise<T[]>}
     */
  static async find(findObj) {
    const { dbConnection, sqlClient, entities, classWikiDict } = OrmStore.store
    if (!dbConnection) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
    if (ChangeLogger.scheduledFlush) await ChangeLogger.save()

    let classWiki = classWikiDict[this.name]
    if (!classWiki) throw new Error(`The class '${this.name}' has not been included in the ORM boot method.`)
    const [relationsArg, whereArg, relationalWhereArg] = destructureAndValidateArg(findObj)
    let findWiki
    const baseProxyMap = classWiki2ScopeProxy(classWiki)
    if (whereArg) mergeWhereScope(baseProxyMap, whereArg)
    if (relationalWhereArg) findWiki = mergeRelationalWhereScope(baseProxyMap, relationalWhereArg)
    findWiki = deproxifyScopeProxy(baseProxyMap)

    const [aliasedFindMap, joinStatements, whereObj] = parseFindWiki(findWiki)
    const [queryResult, relationsScopeObj] = await aliasedFindWiki2QueryRes(aliasedFindMap, joinStatements, whereObj, relationsArg, classWiki, dbConnection)
    const instanceArr = sqlClient === "postgresql"
      ? postgresCreateProxyArray(queryResult, relationsScopeObj, entities, relationsArg)
      : sqliteCreateProxyArray(queryResult, relationsScopeObj, entities, relationsArg)

    return instanceArr
  }

  // async save() {
  //   const { dbConnection, classWikiDict } = OrmStore.store
  //   if (!dbConnection) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
  //   const className = this.constructor.name
  //   let classWiki = classWikiDict[className]

  //   const branchesCteArray = []
  //   const createdInstacesLogger = []

  //   newRootInsertionCte(this, classWiki, branchesCteArray, createdInstacesLogger)
  //   let queryObj = parseInsertionQueryObj(branchesCteArray)

  //   try {
  //     //@ts-ignore
  //     await pool.query(queryObj.queryStr, queryObj.values)
  //   }
  //   catch (e) {
  //     console.warn(e)
  //   }
  // }

  /**
  * Hard deletes the instance from the database. May require a pre-deletion step - the 'getDependents' method.
  */
  async delete() {
    const { dbConnection, classWikiDict, dependentsMapsObj, dbChangesObj } = OrmStore.store
    if (!dbConnection) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")

    const id4Deletion = this.id
    const className = this.constructor.name
    let classWiki = classWikiDict[className]
    const dependencyContext = classWiki[dependenciesSymb]
    if (dependencyContext) {
      let dependentsData
      if (!dependentsMapsObj[className]) throwDeletionErr(className, id4Deletion)
      else dependentsData = dependentsMapsObj[className].get(id4Deletion)

      dependentsData = dependentsData.deref()
      const isValid = validateDependentDataDecoupling(dependentsData, id4Deletion)
      if (!isValid) throwImproperDecouplingErr(className, id4Deletion)
    }

    //@ts-ignore
    const emitter = this.eEmitter_
    emitter.dispatchEvent(
      new CustomEvent("delete", {
        detail: {
          id: id4Deletion
        }
      }))

    let targetTableName

    if (classWiki.parent) {
      let currentWiki = classWiki
      while (currentWiki.parent) {
        targetTableName = currentWiki.parent.className
        currentWiki = currentWiki.parent
      }
    }
    else targetTableName = className

    dbChangesObj.deletedInstancesArr ??= []
    dbChangesObj.deletedInstancesArr.push([nonSnake2Snake(targetTableName), id4Deletion])
    if (dbChangesObj[className] && dbChangesObj[className][id4Deletion]) delete dbChangesObj[className][id4Deletion]

    //@ts-ignore
    this.source_._isDeleted_ = true
    ChangeLogger.flushChanges()
  }

  /**
  * A pre-deletion step that is required in certain cases.
  * Finds all instances that have a one-to-one relationship with the calling instance
  * where the related property cannot be set to `undefined`.
  * These relationships must be reassigned before the calling instance
  * can be safely deleted.
  */
  async getDependents() {
    if (!this.id) return undefined
    const returnedObj = {}
    const className = this.constructor.name
    const dependedOnId = this.id
    const { classWikiDict, dependentsMapsObj } = OrmStore.store

    const classWiki = classWikiDict[className]
    const dependencyContext = classWiki[dependenciesSymb]
    if (!dependencyContext) return undefined

    for (const [className, relationalProps] of Object.entries(dependencyContext)) {
      const dependentMap = classWikiDict[className]
      returnedObj[className] = [await internalFind(dependentMap, relationalProps, dependedOnId), relationalProps]
    }
    insertDependentsData(className, dependedOnId, returnedObj, dependentsMapsObj)
    return returnedObj
  }

  /**
   * Finds all instances that have a relation with the calling instance,
   * This method is a superset of the getDependents method, and is not meant as a pre-deletion step, but as a utility.
   */
  async getReferencers() {
    if (!this.id) return undefined
    const returnedObj = {}
    const className = this.constructor.name
    const referencedId = this.id
    const { classWikiDict, dependentsMapsObj } = OrmStore.store
    const classWiki = classWikiDict[className]

    const referencesContext = classWiki[referencesSymb]

    for (const [className, relationalProps] of Object.entries(referencesContext ?? {})) {
      const referencesMap = classWikiDict[className]
      returnedObj[className] = [await internalFind(referencesMap, relationalProps, referencedId), relationalProps]
    }

    const dependencyContext = classWiki[dependenciesSymb]
    if (!dependencyContext) return returnedObj

    const dependentsDataObj = {}
    for (const [className, relationalProps] of Object.entries(dependencyContext)) {
      const dependentMap = classWikiDict[className]
      const dependentInstanceArr = await internalFind(dependentMap, relationalProps, referencedId)
      dependentsDataObj[className] = [dependentInstanceArr, relationalProps]
      if (!returnedObj[className]) returnedObj[className] = [dependentInstanceArr, relationalProps]
      else {
        returnedObj[className][0].push(...dependentInstanceArr)
        let uniqueDependentInstances = [...new Set(returnedObj[className][0])]
        returnedObj[className][0] = [...uniqueDependentInstances]
        returnedObj[className][1].push(...relationalProps)
      }
    }
    insertDependentsData(className, referencedId, dependentsDataObj, dependentsMapsObj)
    return returnedObj
  }
}
