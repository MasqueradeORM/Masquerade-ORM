

import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { dependenciesSymb, OrmStoreSymb, referencesSymb } from "../misc/constants.js"
import { nonSnake2Snake } from "../misc/miscFunctions.js"
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
 * @typedef {import("../misc/types").FindObj<T>} FindObj
 */

export class Entity {
  //@ts-ignore
/**@type {string | number}*/ id
/**@type {Date}*/ updatedAt

  /** @abstract */
  constructor() {
    const className = this.constructor.name

    const { classWikiDict, idLogger, entityMapsObj } = globalThis[OrmStoreSymb]
    if (!classWikiDict) throw new Error("ORM not initialized, please call Entity.initOrm(pool) before using the ORM.")
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
   * @template T
   * @this {{ new(...args: any[]): T }}
   * @param {FindObj<T>} findObj
   * @returns {Promise<T[]>}
   */
  static async find(findObj) {
    const { dbConnection, sqlClient, entities, classWikiDict } = globalThis[OrmStoreSymb]
    if (!dbConnection) throw new Error("ORM not initialized, please call Entity.initOrm(pool) before using the ORM.")
    if (ChangeLogger.scheduledFlush) await ChangeLogger.save()

    let classWiki = classWikiDict[this.name]
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
  //   const { dbConnection, classWikiDict } = globalThis[OrmStoreSymb]
  //   if (!dbConnection) throw new Error("ORM not initialized, please call Entity.initOrm(pool) before using the ORM.")
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

  async delete() {
    const { dbConnection, classWikiDict, dependentsMapsObj, dbChangesObj } = globalThis[OrmStoreSymb]
    if (!dbConnection) throw new Error("ORM not initialized, please call Entity.initOrm(pool) before using the ORM.")

    const id4Deletion = this.id
    const className = this.constructor.name

    let dependentsData
    if (!dependentsMapsObj[className]) throwDeletionErr(className, id4Deletion)
    else dependentsData = dependentsMapsObj[className].get(id4Deletion)

    if (!dependentsData) throwDeletionErr(className, id4Deletion)
    dependentsData = dependentsData.deref()

    const isValid = validateDependentDataDecoupling(dependentsData, id4Deletion)
    if (!isValid) throwImproperDecouplingErr(className, id4Deletion)

    //@ts-ignore
    const emitter = this.eEmitter_
    emitter.dispatchEvent(
      new CustomEvent("delete", {
        detail: {
          id: id4Deletion,
        },
      }))

    let classWiki = classWikiDict[className]
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
  }

  async getDependents() {
    if (!this.id) return undefined
    const returnedObj = {}
    const className = this.constructor.name
    const dependedOnId = this.id
    const { classWikiDict, dependentsMapsObj } = globalThis[OrmStoreSymb]

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

  async getReferencers() {
    if (!this.id) return undefined
    const returnedObj = {}
    const className = this.constructor.name
    const referencedId = this.id
    const { classWikiDict, dependentsMapsObj } = globalThis[OrmStoreSymb]
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
