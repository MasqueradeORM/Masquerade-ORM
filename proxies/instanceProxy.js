
import { setMaxListeners } from 'events'
import { newEntityInstanceSymb, OrmStoreSymb } from '../misc/constants.js'
import { fillCalledRelationsOnInstance, junctionProp2Wiki, getRelationalPropNames, traverseResultObjRelationalScope } from '../entity/find/find.js'
import { postgresDbValHandling } from '../entity/find/sqlClients/postgresFuncs.js'
import { sqliteDbValHandling } from '../entity/find/sqlClients/sqliteFuncs.js'
import { LazyPromise } from '../misc/classes.js'
import { FinalizationRegistrySymb, ORM } from '../ORM.js'
import { coloredBackgroundConsoleLog, getPropertyClassification, js2dbTyping, nonSnake2Snake, postgres2sqliteQueryStr, snake2Pascal } from '../misc/miscFunctions.js'
import { createNonRelationalArrayProxy } from './nonRelationalArrayProxy.js'
import { createObjectProxy } from './objectProxy.js'
import { createRelationalArrayProxy } from './relationalArrayProxy.js'
import { ChangeLogger } from '../changeLogger/changeLogger.js'
setMaxListeners(577)


export function rowObj2InstanceProxy(resultObj, findWiki, Entities) {
    const className = findWiki.className
    const { nonRelationalProperties, relationalProperties, uncalledRelationalProperties } = getCategorizedClassProperties(findWiki)

    const { entityMapsObj, sqlClient } = globalThis[OrmStoreSymb]
    if (!entityMapsObj[className]) entityMapsObj[className] = new Map()
    let entityMap = entityMapsObj[className]
    const instanceOnLogger = searchEntityMap(resultObj, relationalProperties, entityMap)

    if (instanceOnLogger) {
        const [proxy, relationalProperties2Add] = instanceOnLogger
        const deproxied = proxy.source_
        let existingRelations2Traverse
        if (relationalProperties2Add.length) {
            //adding relational data to the source of the proxy that is on the entityMap
            fillCalledRelationsOnInstance(deproxied, resultObj, findWiki, relationalProperties2Add, Entities)
            existingRelations2Traverse = relationalProperties.filter(relation => !relationalProperties2Add.includes(relation))
        }
        else existingRelations2Traverse = relationalProperties
        //also need to account for relations that are already loaded and dont need to be added, traversing their scope and potentially expanding it.
        for (const relation2Traverse of existingRelations2Traverse) {
            const mapWithRelation = junctionProp2Wiki(findWiki, relation2Traverse)
            traverseResultObjRelationalScope(resultObj[relation2Traverse], mapWithRelation, Entities)
        }
        return proxy
    }
    else {
        //data from db
        const instanceClass = Entities[className]
        const instance = Object.create(instanceClass.prototype)

        for (const propertyName of nonRelationalProperties) {
            let value = resultObj[propertyName]
            if (!value) {
                instance[propertyName] = undefined
                continue
            }

            if (sqlClient === `postgresql`) postgresDbValHandling(instance, propertyName, value, findWiki)
            else sqliteDbValHandling(instance, propertyName, value, findWiki)
        }

        if (relationalProperties.length) fillCalledRelationsOnInstance(instance, resultObj, findWiki, relationalProperties, Entities)

        if (uncalledRelationalProperties.length) {
            for (const property of uncalledRelationalProperties) {
                let currentWiki = findWiki
                while (!currentWiki.uncalledJunctions[property]) currentWiki = currentWiki.parent
                const uncalledJunctionObj = currentWiki.uncalledJunctions[property]
                const nameOfMapWithJunction = uncalledJunctionObj.className
                const promiseOf = uncalledJunctionObj.isArray ? nameOfMapWithJunction + `[]` : nameOfMapWithJunction
                instance[property] = new LazyPromise(promiseOf)
            }
        }

        const proxy = proxifyEntityInstanceObj(instance, uncalledRelationalProperties)
        insertProxyIntoEntityMap(proxy, entityMap)
        return proxy
    }
}

export function insertProxyIntoEntityMap(proxy, entityMap) {
    entityMap.set(proxy.id, new WeakRef(proxy))
    ORM[FinalizationRegistrySymb].register(proxy, [proxy.constructor.name, proxy.id])
}

export function instanceProxyGetHandler(target, key, classWiki) {
    const val = target[key]
    if (!(val instanceof LazyPromise)) return val

    const { sqlClient, dbConnection } = globalThis[OrmStoreSymb]
    const [classification, joinedClassMap, mapWithProp] = getPropertyClassification(key, classWiki)
    let joinedTable

    if (classification === "Join") joinedTable = classWiki.junctions[key]
    else joinedTable = mapWithProp.junctions[key]

    const isArrayOfInstances = joinedClassMap.isArray

    let queryStr = `SELECT entity.* FROM ${nonSnake2Snake(mapWithProp.className)}___${nonSnake2Snake(key)}_jt jt` +
        ` LEFT JOIN ${nonSnake2Snake(joinedClassMap.className)} entity ON jt.joined_id = entity.id WHERE jt.joining_id = `
    queryStr += sqlClient === "postgresql" ? `$1` : `?`

    let queryFunc
    if (sqlClient === "postgresql") queryFunc = (queryStr, id) => dbConnection.query(queryStr, [id])
    else queryFunc = (queryStr, id) => dbConnection.prepare(queryStr).all(id)

    let promise
    try {
        let queryRes = queryFunc(queryStr, target.id)
        promise = createLazyPromise(target, key, queryRes, mapWithProp.junctions[key], isArrayOfInstances, sqlClient)
        promise.then(res => target[key] = res)
    }
    catch (e) {
        coloredBackgroundConsoleLog(`Lazy loading failed. ${e}\n`, `failure`)
    }

    return promise
}

export function instanceProxySetHandler(target, key, value, eventListenersObj, classWiki, dbChangesObj) {
    let oldValue = target[key]
    if (value === null) value = undefined
    const entityClass = target.constructor.name
    let valChanged = true

    const [classification, columnType, classContainingProperty] = getPropertyClassification(key, classWiki)
    const isArray = columnType.isArray

    if (oldValue instanceof LazyPromise) uncalledPropertySetHandler(target, key, value, [classification, columnType, classContainingProperty])
    // if (oldValue instanceof LazyPromise) coloredBackgroundConsoleLog(`Do not overwrite a LazyPromise value. Please use the static 'setUnloadedVal' method of LazyPromise instead. Note: this will wipe any unloaded relational data.`, `warning`)
    else if (key === "id") coloredBackgroundConsoleLog(`Warning: do not assign id values. Id value is unchanged.`, `warning`)
    else if (classification === "Primitive" || classification === "ParentPrimitive") {
        const expectedValType = columnType.type
        const valType = Array.isArray(value) ? "array" : value instanceof Date ? "Date" : typeof value
        //date is considered an object and shouldnt be proxified

        if (valType === "array") {
            if (isArray && expectedValType === `object`) target[key] = createNonRelationalArrayProxy(target, key, value, expectedValType, true)
            else if (isArray) target[key] = createNonRelationalArrayProxy(target, key, value, expectedValType) //includes only valid data
            else {
                valChanged = false
                if (oldValue !== undefined) coloredBackgroundConsoleLog(`Warning: do not assign arrays to property '${key}' of class ${entityClass} which is of type ${expectedValType}. Value remains unchanged.`, `warning`)
            }
        }
        else if (valType === "object") {
            if (expectedValType === 'object') target[key] = createObjectProxy(target, key, value)
            else {
                valChanged = false
                if (oldValue !== undefined) coloredBackgroundConsoleLog(`Warning: do not assign objects to property '${key}' of class ${entityClass} which is of type ${expectedValType}. Value remains unchanged.`, `warning`)
            }
        }
        else if (valType !== expectedValType) {
            if (!value && columnType.optional) target[key] = value
            else {
                valChanged = false
                if (oldValue !== undefined) coloredBackgroundConsoleLog(`Warning: do not assign values of type '${valType}' to property '${key}' of class ${entityClass}. This property expects a value of type '${expectedValType}'. Value remains unchanged.`, `warning`)
            }
        }
        else target[key] = value

        if (valChanged) insertIntoDbChanges(target, key, value, dbChangesObj, entityClass, isArray, expectedValType)
    }
    else if (classification === "Join" || classification === "ParentJoin") {
        const expectedValType = columnType.className
        const isOptional = columnType.optional
        dbChangesObj[entityClass] ??= {}
        const instanceChangeObj = dbChangesObj[entityClass][target.id] ??= {}

        if (isArray) {
            const isVald = validateRelationalValSetting(target, key, value, isArray, expectedValType, isOptional, oldValue, entityClass)
            if (!isVald) return

            const newArray = createRelationalArrayProxy(target, key, value, expectedValType) //includes only valid data
            target[key] = newArray

            const oldIds = oldValue === undefined ? [] : oldValue.length ? oldValue.map(entity => entity.id) : []
            const newIds = newArray.length ? newArray.map(entity => entity.id) : []

            const added = newIds.length ? newIds.filter(id => !oldIds.includes(id)) : []
            const removed = oldIds.length ? oldIds.filter(id => !newIds.includes(id)) : []
            if (added.length || removed.length) {
                const changeLogger = instanceChangeObj[key] ??= { added: [], removed: [] }
                changeLogger.added.push(...added)
                changeLogger.removed.push(...removed)

                const prefilteredAdded = [...changeLogger.added]
                const prefilteredRemoved = [...changeLogger.removed]

                changeLogger.added = prefilteredAdded.filter(id => !prefilteredRemoved.includes(id))
                changeLogger.removed = prefilteredRemoved.filter(id => !prefilteredAdded.includes(id))
            }
        }
        else if (!isArray) {
            const isValid = validateRelationalValSetting(target, key, value, isArray, expectedValType, isOptional, oldValue, entityClass)
            if (!isValid) return

            target[key] = value
            const changeLogger = instanceChangeObj[key] ??= { added: [], removed: [] }
            if (value) {
                addEventListener2Proxy(target, key, eventListenersObj, oldValue)
                const index = changeLogger.removed.indexOf(value.id)
                if (index !== -1) changeLogger.removed.splice(index, 1)
                else changeLogger.added.push(value.id)
            }
            if (oldValue) {
                const index = changeLogger.added.indexOf(oldValue.id)
                if (index !== -1) changeLogger.added.splice(index, 1)
                else changeLogger.removed.push(oldValue.id)
            }
        }
        setUpdatedAtValue(target, instanceChangeObj)
    }
    else target[key] = value
}

export function setUpdatedAtValue(targetInstance, instanceChangeObj) {
    const now = new Date()
    targetInstance.updatedAt = now
    instanceChangeObj.updatedAt = now
}

function validateRelationalValSetting(target, key, value, isArray, expectedValType, isOptional, oldValue, entityClass) {
    if (isArray) {
        if (!Array.isArray(value)) {
            if (!value && isOptional) target[key] = value
            else {
                if (oldValue !== undefined) {
                    let warningStr = `Warning: improper value assigment to property '${key}' of class ${entityClass}. Expected value of type ${expectedValType}[]`
                    warningStr += isOptional ? ` | undefined.` : `.`
                    coloredBackgroundConsoleLog(warningStr + ` Value remains unchanged.`, `warning`)
                }
                return false
            }
        }
    }
    else {
        if (!value) {
            if (isOptional) target[key] = value
            else {
                if (oldValue !== undefined) coloredBackgroundConsoleLog(`Warning: do not assign values of type 'undefined' to property '${key}' of class ${entityClass}. This property expects a value of type '${expectedValType}'. Value remains unchanged.`, `warning`)
                return false
            }
        }
        else if (!value.id || value.constructor.name !== expectedValType) {
            let warningStr = `Warning: improper value assigment to property '${key}' of class ${entityClass}. Expected value of type ${expectedValType}`
            warningStr += isOptional ? ` | undefind.` : `.`
            if (oldValue !== undefined) coloredBackgroundConsoleLog(warningStr + ` Value remains unchanged.`, `warning`)
            return false
        }
    }
    return true
}

function insertIntoDbChanges(target, key, value, changesObj, entityClass, isArray, columnType) {
    changesObj[entityClass] ??= {}
    const entityChangeObj = changesObj[entityClass][target.id] ??= {}
    if (isArray && columnType === `object`) entityChangeObj[key] = JSON.stringify(value)
    else entityChangeObj[key] = value
    setUpdatedAtValue(target, entityChangeObj)
    ChangeLogger.flushChanges()
}

export function addEventListener2Proxy(listeningInstance, key, eventListenersObj, oldListened2Proxy) {
    const newListened2Proxy = listeningInstance[key]
    if (!newListened2Proxy) return
    const oldEventFunc = eventListenersObj[key]
    const emitter = newListened2Proxy.eEmitter_
    if (oldEventFunc) oldListened2Proxy.eEmitter_.removeEventListener("delete", oldEventFunc)
    if (!newListened2Proxy || !newListened2Proxy.id) return

    const newEventFunc = (event) => {
        console.log(`Delete event received by ${listeningInstance.id}_${listeningInstance.constructor.name} on property '${key}' from ${newListened2Proxy.id}_${newListened2Proxy.constructor.name}`)
        const id2delete = event.detail.id
        if (listeningInstance[key].id === id2delete) {
            listeningInstance[key] = undefined
            delete eventListenersObj[key]
        }
    }
    eventListenersObj[key] = newEventFunc

    emitter.addEventListener(
        "delete",
        newEventFunc,
        { once: true }
    )
}

export function findOrInsertInInstanceLogger(instance, classLoggingMap, nonRelationalPropertiesObj, instanceRelations) {
    let instanceOnLogger = classLoggingMap.get(instance.id)
    const nonRelationalProperties = Object.keys(nonRelationalPropertiesObj)
    const instanceProperties = Object.keys(instance)

    for (const prop of instanceProperties) {
        if (nonRelationalProperties.includes(prop)) continue
        instanceRelations[prop] = instance[prop]
    }

    if (instanceOnLogger) {
        instanceOnLogger = instanceOnLogger.deref()
        for (const prop of nonRelationalProperties) instanceRelations[prop] = instanceOnLogger[prop]
        return instanceOnLogger
    }

    let relationlessInstance = structuredClone(instanceRelations)
    for (const prop of nonRelationalProperties) {
        relationlessInstance[prop] = instance[prop]
        instanceRelations[prop] = instance[prop]
    }

    insertIntoEntityMap(relationlessInstance, classLoggingMap)
    return relationlessInstance
}

export function createLazyLoadQueryStr(property, classWiki) {
    const joinedTable = classWiki.junctions[property]
    const baseTableName = nonSnake2Snake(classWiki.className)

    const baseJtName = `${baseTableName}___${nonSnake2Snake(property)}_jt`
    const promisedEntityTableName = nonSnake2Snake(joinedTable.className)

    let selectStr = `SELECT entity.*`
    let queryStr = ` FROM ${baseJtName} jt \n`
    queryStr += `LEFT JOIN ${promisedEntityTableName} entity ON jt.${promisedEntityTableName}_id = entity.id \n`

    if (joinedTable.parent) {
        let currentTable = joinedTable
        let i = 1
        while (currentTable.parent) {
            selectStr += `, entity${i}.*`
            queryStr += ` LEFT JOIN ${nonSnake2Snake(currentTable.parent.className)} entity${i} ON entity${i === 1 ? '' : i - 1}.id = entity${i}.id \n`
            currentTable = currentTable.parent
            i++
        }
    }
    queryStr += `WHERE jt.${baseTableName}_id = $1;`
    queryStr = selectStr + queryStr

    if (globalThis[OrmStoreSymb].sqlClient === "sqlite") queryStr = postgres2sqliteQueryStr(queryStr)
    return queryStr
}


export function createLazyPromise(target, key, queryRes, classWiki, isArrayOfInstances, client) {
    return new Promise(async (resolve) => {
        let resultArr
        try {
            if (client === "postgresql") resultArr = (await queryRes).rows
            else resultArr = queryRes

            if (!resultArr.length) {
                if (isArrayOfInstances) {
                    target[key] = []
                    resolve([])
                }
                else {
                    target[key] = undefined
                    resolve(undefined)
                }
            }

            const { className, columns, junctions } = classWiki
            const findWiki = { className, columns, uncalledJunctions: junctions }
            let currentWiki = classWiki
            let currentScopedMap = findWiki
            while (currentWiki.parent) {
                const { className, columns, junctions } = currentWiki.parent
                currentScopedMap.parent = { className, columns, uncalledJunctions: junctions }
                currentScopedMap = currentScopedMap.parent
                currentWiki = currentWiki.parent
            }

            const proxyArr = []
            for (const row of resultArr) {
                const rowWithCamelCasedProps = Object.fromEntries(Object.entries(row).map(([key, val]) => [snake2Pascal(key, true), val]))
                proxyArr.push(rowObj2InstanceProxy(rowWithCamelCasedProps, findWiki, globalThis[OrmStoreSymb].entities))
            }

            if (isArrayOfInstances) {
                target[key] = createRelationalArrayProxy(target, key, proxyArr, classWiki.className)
                resolve(target[key])
            }
            else {
                target[key] = proxyArr[0]
                resolve(target[key])
            }
        }
        catch (e) {
            coloredBackgroundConsoleLog(`Lazy loading failed. ${e}\n`, `failure`)
        }
    })
}


export function uncalledPropertySetHandler(target, key, value, columnClassificationArr) {
    const [propertyType, propertyTypeObj, mapWithProp] = columnClassificationArr
    const joiningId = target.id
    const nameOfClassWithProp = mapWithProp.className
    // if (propertyType === "Join" || propertyType === "ParentJoin") {   
    // }
    //todo check if is optional against a potentially undefined value

    const { dbChangesObj, sqlClient } = globalThis[OrmStoreSymb]
    const classChangeObj = dbChangesObj[target.constructor.name] ??= {}
    const instanceChangeObj = classChangeObj[target.id] ??= {}
    const { isArray, optional } = propertyTypeObj

    if (!value && optional) target[key] = value
    else if (isArray && Array.isArray(value)) {
        target[key] = createRelationalArrayProxy(target, key, [], propertyTypeObj.className)
        for (const instance of value) target[key].push(instance)
        setUpdatedAtValue(target, instanceChangeObj)
    }
    else if (!isArray && !Array.isArray(value)) {
        target[key] = value
        instanceChangeObj[key] = { added: [value.id], removed: [] }
        setUpdatedAtValue(target, instanceChangeObj)
    }
    else {
        coloredBackgroundConsoleLog(`Warning: Incorrect value type assigment attempt to property '${key}' of class ${nameOfClassWithProp}. Promise value remains unchanged.`, `warning`)
        return
    }

    const junctionTableName = `${nonSnake2Snake(nameOfClassWithProp)}___${nonSnake2Snake(key)}_jt`
    const idType = js2dbTyping(sqlClient, mapWithProp.columns.id.type)

    const uncalledPropChangeObj = dbChangesObj.deletedUncalledRelationsArr ??= {}
    const junctionChangeArr = uncalledPropChangeObj[junctionTableName] ??= { idType, params: [] }
    junctionChangeArr.params.push(joiningId)
}


export function getCategorizedClassProperties(classWiki) {
    let nonRelationalProperties = [...Object.keys(classWiki.columns ?? {})]
    const relationalProperties = [...Object.keys(classWiki.junctions ?? {})]
    const uncalledRelationalProperties = [...Object.keys(classWiki.uncalledJunctions ?? {})]
    if (classWiki.parent) {
        let currentClass = classWiki
        while (currentClass.parent) {
            nonRelationalProperties.push(...Object.keys(currentClass.parent.columns ?? {}))
            relationalProperties.push(...Object.keys(currentClass.parent.junctions ?? {}))
            uncalledRelationalProperties.push(...Object.keys(currentClass.parent.uncalledJunctions ?? {}))
            currentClass = currentClass.parent
        }
        nonRelationalProperties = nonRelationalProperties.filter(property => property !== 'id')
        nonRelationalProperties.unshift('id')
    }

    return { nonRelationalProperties, relationalProperties, uncalledRelationalProperties }
}


export function proxifyEntityInstanceObj(instance, uncalledRelationalProperties) {
    // TODO POTENTIALLY CHECK IF IT IS A PROXY AND IF SO RETURN
    // TODO is there a point in even checking if new values are proxies????

    if (instance === undefined || !instance.id) return instance
    const instanceClassName = instance.constructor.name
    const { classWikiDict, dbChangesObj } = globalThis[OrmStoreSymb]
    const classWiki = classWikiDict[instanceClassName]

    if (!uncalledRelationalProperties) {
        //new instance
        dbChangesObj[instanceClassName] ??= {}
        const newEntityChangeObj = dbChangesObj[instanceClassName][instance.id] ??= {}

        // const idVal = instance.id
        //newEntityChangeObj.id = typeof idVal === `bigint` ? idVal.toString() : idVal
        newEntityChangeObj.id = instance.id
        newEntityChangeObj.updatedAt = instance.updatedAt
        newEntityChangeObj[newEntityInstanceSymb] = true
    }


    const emitter = new EventTarget()
    const eventListenersObj = {}
    const handler = {
        get(target, key, receiver) {
            if (key === "constructor") return instance.constructor
            else if (key === "source_") return target
            else if (key === "eEmitter_") return emitter
            else if (key === "eListener_") return eventListenersObj
            return instanceProxyGetHandler(target, key, classWiki)
        },
        set: (target, /**@type {string}*/ key, value) => {
            instanceProxySetHandler(target, key, value, eventListenersObj, classWiki, dbChangesObj)
            return true
        },
        defineProperty: (target, /**@type {string}*/ key, definePropObj) => {
            instanceProxySetHandler(target, key, definePropObj.value, eventListenersObj, classWiki, dbChangesObj)
            return true
        }
    }
    const proxy = new Proxy(instance, handler)
    if (uncalledRelationalProperties) { //found instance
        const relational1To1Props = getRelationalPropNames(classWiki, true)
        const relational1To1sExcludingPromises = relational1To1Props.filter(propName => !uncalledRelationalProperties.includes(propName))
        for (const prop of relational1To1sExcludingPromises) addEventListener2Proxy(proxy.source_, prop, eventListenersObj)
    }
    return proxy
}


export function insertIntoEntityMap(instance, entityMap) {
    entityMap.set(instance.id, new WeakRef(instance))
    ORM[FinalizationRegistrySymb].register(instance, [instance.constructor.name, instance.id])
}


export function searchEntityMap(resultObj, calledRelationalPropNamesArr, entityMap) {
    //searches for the instance on the map and returns either false or returns an array containing the instance + the relational prop names to add as an arr
    const instanceId = resultObj.id
    let proxyOnLogger = entityMap.get(instanceId)
    if (proxyOnLogger) {
        proxyOnLogger = proxyOnLogger.deref()
        if (!calledRelationalPropNamesArr.length) return [proxyOnLogger, []]
        let unproxied = proxyOnLogger.source_
        const relationalProperties2Add = []

        for (const relationalProp of calledRelationalPropNamesArr) {
            const onLoggerVal = unproxied[relationalProp]
            if (onLoggerVal instanceof LazyPromise) relationalProperties2Add.push(relationalProp)
        }
        return [proxyOnLogger, relationalProperties2Add]
    }
    else return false
}