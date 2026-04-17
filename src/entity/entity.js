// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0



import { LazyPromise } from "../misc/classes.js"
import { ChangeLogger } from "../changeLogger/changeLogger.js"
import { dependenciesSymb, referencesSymb } from "../misc/constants.js"
import { coloredBackgroundConsoleLog, getJunctionName, nonSnake2Snake, snake2Pascal } from "../misc/miscFunctions.js"
import { OrmStore } from "../misc/ormStore.js"
import { insertProxyIntoEntityMap, promiseExecutor, proxifyEntityInstance, rowObj2InstanceProxy, searchEntityMap } from "../proxies/instanceProxy.js"
import { throwDeletionErr, throwImproperDecouplingErr, validateDependentDataDecoupling } from "./delete/delete.js"
import { insertDependentsData, internalFind } from "./delete/getDependents.js"
import { executeFindQuery, parseFindWiki, destructureAndValidateArg } from "./find/find.js"
import { mergeOrderByScope } from "./find/orderBy.js"
import { createStatementsDict, queryBuilder } from "./find/queryBuilder.js"
import { deproxifyScopeProxy, classWiki2ScopeProxy } from "./find/scopeProxies.js"
import { postgres2JsTyping, postgresCreateProxyArray } from "./find/sqlClients/postgresFuncs.js"
import { sqlite2JsTyping, sqliteCreateProxyArray } from "./find/sqlClients/sqliteFuncs.js"
import { mergeTemplateScope } from "./find/templateProxies.js"
import { mergeWhereScope } from "./find/where.js"
import { createRelationalArrayProxy } from "../proxies/relationalArrayProxy.js"

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
    const { classWikiDict, idLogger, entityMapsObj, dbChangesObj } = OrmStore.store
    if (!classWikiDict) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
    else if (!classWikiDict[className])
      throw new Error(`Cannot create an instance of class '${className}' since it is either an abstract class or was not passed into the boot method.`)

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

    const proxy = proxifyEntityInstance(this)
    const entityMap = entityMapsObj[className] ??= new Map()
    insertProxyIntoEntityMap(proxy, entityMap)
    const classChangeObj = dbChangesObj[className] ??= {}
    classChangeObj[idVal] ??= { id: idVal, updatedAt: this.updatedAt }
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
    const [relationsArg, whereArg, templateWhereArg, orderByArg, limitArg, offsetArg] = destructureAndValidateArg(findObj)
    let findWiki
    const baseProxyMap = classWiki2ScopeProxy(classWiki)
    if (whereArg) mergeWhereScope(baseProxyMap, whereArg)
    if (templateWhereArg) findWiki = mergeTemplateScope(baseProxyMap, templateWhereArg, "templateWhere")
    if (orderByArg) mergeOrderByScope(baseProxyMap, orderByArg)
    findWiki = deproxifyScopeProxy(baseProxyMap)

    const [aliasedScopeWiki, joinStatements, whereOutput, orderByOutput] = parseFindWiki(findWiki)
    const statementsObj = createStatementsDict(whereOutput, orderByOutput, limitArg, offsetArg, sqlClient)
    const [queryString, relationsScopeObj] = queryBuilder(aliasedScopeWiki, joinStatements, statementsObj, relationsArg, classWiki, sqlClient)
    const queryResult = await executeFindQuery(queryString, statementsObj.params, dbConnection, sqlClient)
    const instanceArr = sqlClient === "postgres"
      ? postgresCreateProxyArray(queryResult, relationsScopeObj, entities, relationsArg)
      : sqliteCreateProxyArray(queryResult, relationsScopeObj, entities, relationsArg, !!statementsObj.orderByStr)

    return instanceArr
  }


  /**
  * Finds an instance with the provided `id`.
  *
  * - If the instance exists in the entity's in-memory map, it is returned immediately without a database call.
  * - Otherwise, the instance is fetched from the database.
  *
  * @template T
  * @this {{ new(...args: any[]): T }}
  * @param {string | number | bigint} id - The unique identifier of the entity.
  * @returns {Promise<T | undefined>} Resolves to the entity instance if found, otherwise `undefined`.
  */
  static async fetch(id) {
    const className = this.constructor.name
    const { entityMapsObj } = OrmStore.store

    const entityMap = entityMapsObj[className] ??= new Map()
    const mapResponse = searchEntityMap(id, [], entityMap)
    if (mapResponse) return Promise.resolve(mapResponse[0])
    const { sqlClient, dbConnection, entities, classWikiDict } = OrmStore.store
    if (!classWikiDict) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
    const classWiki = classWikiDict[className]
    if (!classWiki) throw new Error(`Cannot fetch an instance of class '${className}' since it was not passed to the boot method.`)
    let queryStr = `SELECT * FROM "${nonSnake2Snake(className)}" WHERE id = `

    try {
      let queryResult
      if (sqlClient === "postgres") queryResult = (await dbConnection.query(queryStr + `$1`, [id])).rows
      else {
        queryResult = dbConnection.prepare(queryStr + `?`).all(id)
      }
      queryResult = queryResult[0]
      const instanceClass = entities[className]
      const instance = Object.create(instanceClass.prototype)
      let uncalledRelationalProps = Object.keys(classWiki.junctions ?? {})
      if (classWiki.parent) {
        let currentParent = classWiki.parent
        while (currentParent) {
          uncalledRelationalProps = { ...uncalledRelationalProps, ...Object.keys(currentParent.junctions ?? {}) }
          currentParent = currentParent.parent
        }
      }

      for (const property of uncalledRelationalProps) {
        let currentWiki = classWiki
        while (!currentWiki.junctions[property]) currentWiki = currentWiki.parent
        const uncalledJunctionObj = currentWiki.junctions[property] // this is a duplication from instanceProxy.js, search for uncalledJunctionObj
        const nameOfMapWithJunction = uncalledJunctionObj.className // maybe no need to change until rework
        const promiseType = uncalledJunctionObj.isArray ? nameOfMapWithJunction + `[]` : nameOfMapWithJunction
        instance[property] = new LazyPromise(instance, property, promiseType, (resolve, reject) => promiseExecutor(instance, property, resolve, reject))
      }

      const proxy = proxifyEntityInstance(instance, uncalledRelationalProps)
      insertProxyIntoEntityMap(proxy, entityMap)
      return proxy
    }
    catch (e) {
      coloredBackgroundConsoleLog(`Fetch failed. ${e}\n`, `failure`)
      return undefined
    }
  }

  /**
  * Get all instances from memory by accessing the corresponding Entity Map.
  * @template T
  * @this {{ new(...args: any[]): T }}
  * @returns {T[]}
  */
  static getAllLoaded() {
    const className = this.constructor.name
    const { entityMapsObj } = OrmStore.store
    const entityMap = entityMapsObj[className]
    if (!entityMap) return []
    const instances = [...entityMap.values()]
    return instances
  }

  /**
  * Removes the instance's changes from the save queue and atomically.
  * 
  * @throws {Error} if the save fails.
  */
  async save() {
    const { dbConnection, classWikiDict } = OrmStore.store
    if (!dbConnection) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
    const className = this.constructor.name
    const classWiki = classWikiDict[className]
    if (!classWiki) throw new Error(`The class ${className} is not integrated into the ORM. Please include it in the boot method and restart.`)
    // @ts-ignore
    if (this._isDeleted_) return
    // @ts-ignore
    await ChangeLogger.save({ classWiki, instance: this.source_ })
  }

  /**
  * Hard deletes the instance from the database. May require a pre-deletion step - the 'getDependents' method.
  */
  delete() {
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
      })
    )

    let targetTableName

    if (classWiki.parent) {
      let currentWiki = classWiki
      while (currentWiki.parent) {
        targetTableName = currentWiki.parent.className
        currentWiki = currentWiki.parent
      }
    }
    else targetTableName = className

    const deletionDict = dbChangesObj.$deletedInstances ??= {}
    const classDeletionArr = deletionDict[nonSnake2Snake(targetTableName)] ??= []
    classDeletionArr.push(id4Deletion)
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

    if (referencesContext) {
      for (const [className, relationalProps] of Object.entries(referencesContext ?? {})) {
        const referencesMap = classWikiDict[className]
        returnedObj[className] = [await internalFind(referencesMap, relationalProps, referencedId), relationalProps]
      }
    }

    const dependencyContext = classWiki[dependenciesSymb]
    if (!dependencyContext) {
      if (!referencesContext) return undefined
      return returnedObj
    }

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

  /**
  * Discards unsaved changes from the save queue and syncs the instance with the database state.
  */
  async fetchDbState() {
    const { dbConnection, classWikiDict, sqlClient, entities, dbChangesObj } = OrmStore.store
    if (!dbConnection) throw new Error("ORM is not initialized. Please call the appropriate ORM boot method before use.")
    const className = this.constructor.name
    const classWiki = classWikiDict[className]
    if (!classWiki) throw new Error(`The class ${className} is not integrated into the ORM. Please include it in the boot method and restart.`)
    const { junctions, columns } = classWiki

    const queryFunc = sqlClient === "postgres"
      ? async (queryStr, id) => await dbConnection.query(queryStr + `$1`, [id]).rows
      : (queryStr, id) => dbConnection.prepare(queryStr + `?`).all(id)

    const valCorrector = sqlClient === "postgres" ? postgres2JsTyping : sqlite2JsTyping
    let queryStr = `SELECT * FROM "${nonSnake2Snake(className)}" WHERE id = `
    const queryResult = (await queryFunc(queryStr, this.id))[0]
    delete queryResult.id
    for (const [key, val] of Object.entries(queryResult)) {
      const camelCasedProp = snake2Pascal(key, true)
      this[camelCasedProp] = valCorrector(val, columns[camelCasedProp])
    }
    // to reset the values we need to put the values directly, now, this can pose a problem as we know that arrays and objects, relational or otherwise, 
    // require proxies for proper state keeping. so, any of these will need to be properly proxified.
    // relational data can be inserted through the proxy to self correct but the dbchanges will need to be nulled.
    // ok so, just do everything through the proxy and then remove its dbchanges, it is much easier that way.

    for (const [relationalProp, joinedTableWiki] of Object.entries(junctions)) {
      if (this[relationalProp] instanceof LazyPromise) continue
      const snakedJoinedTableName = nonSnake2Snake(joinedTableWiki.className)
      const isArray = joinedTableWiki.isArray
      const junctionName = getJunctionName(nonSnake2Snake(className), nonSnake2Snake(relationalProp))
      const queryStr = `SELECT entity.* FROM ${junctionName} jt` +
        ` LEFT JOIN "${snakedJoinedTableName}" entity ON jt.joined_id = entity.id WHERE jt.joining_id = `
      const queryResult = await queryFunc(queryStr, this.id)
      queryResult.forEach(row => {
        const rowWithCamelCasedProps = Object.fromEntries(Object.entries(row).map(([key, val]) => [snake2Pascal(key, true), val]))
        return rowObj2InstanceProxy(rowWithCamelCasedProps, joinedTableWiki, entities)
      })

      if (isArray) this[relationalProp] = createRelationalArrayProxy(this, relationalProp, queryResult)
      else this[relationalProp] = queryResult[0]
    }

    delete dbChangesObj[className][this.id]
  }
}




