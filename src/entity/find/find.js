
import { coloredBackgroundConsoleLog, getType, jsValue2SqliteValue } from "../../misc/miscFunctions.js"
import { rowObj2InstanceProxy } from "../../proxies/instanceProxy.js"
import { createRelationalArrayProxy } from "../../proxies/relationalArrayProxy.js"
import { junctionJoin, parentJoin } from "./joins.js"
import { parseTemplateWhere, whereValues2Statements } from "./where.js"
import { createFullAndFlatAliasObj } from "./templateProxies.js"
import { orderByValues2Statements, parseTemplateOrderBy } from "./orderBy.js"

// export const proxyType = Symbol('proxyType')

export const proxyKeyDict = {
    className_: true,
    parent_: true,
    columns_: true,
    uncalledJunctions_: true,
    junctions_: true,
    isArray_: true,
    where_: true,
    templateWhere_: true,
    $templateWhere_: true,
    orderBy_: true,
    $templateOrderBy_: true
}

export function destructureAndValidateArg(findObj) {
    let { relations: eagerLoad, where, templateWhere, orderBy, limit, offset } = findObj

    if (eagerLoad) {
        const type = getType(eagerLoad)
        if (type !== "object") throw new Error(`\nInvalid value in the 'eagerLoad' field of the 'find' function's argument. Expected an object.`)
        else if (Object.keys(eagerLoad).length === 0) eagerLoad = undefined
    }

    if (where) {
        const type = getType(where)
        if (type !== "object") throw new Error(`\nInvalid value in the 'where' field of the 'find' function's argument. Expected an object.`)
        else if (Object.keys(where).length === 0) where = undefined
    }

    if (templateWhere) {
        const type = getType(templateWhere)
        if (type !== "function") throw new Error(`\nInvalid value in the 'templateWhere' field of the 'find' function's argument. Expected a function.`)
    }

    if (orderBy) {
        const type = getType(orderBy)
        if (type !== "object") throw new Error(`\nInvalid value in the 'orderBy' field of the 'find' function's argument. Expected an object.`)
    }

    if (limit) {
        const type = getType(limit)
        if (type !== "number") throw new Error(`\nInvalid value in the 'limit' field of the 'find' function's argument. Expected a number.`)
    }

    if (offset) {
        const type = getType(offset)
        if (type !== "number") throw new Error(`\nInvalid value in the 'offset' field of the 'find' function's argument. Expected a number.`)
    }
    return [eagerLoad, where, templateWhere, orderBy, limit, offset]
}

export function removeRelationFromUnusedRelations(classMap, key) {
    const filteredUnusedRelations = Object.fromEntries(
        Object.entries(classMap.uncalledJunctions_).filter(([prop, val]) => prop !== key)
    )
    classMap.uncalledJunctions_ = filteredUnusedRelations
}

export function parseFindWiki(findWiki,
    aliasBase = 'a',
    aliasArr = [],
    joinStatements = [],
    /**@type {any}*/ whereDict = { statements: [], params: [] },
    orderByDict = { statements: {}, params: [] }
) {
    let returnedWiki = findWiki
    if (aliasBase === 'a') {
        returnedWiki = {}
        for (const key of Object.keys(findWiki)) returnedWiki[key.slice(0, -1)] = findWiki[key]
    }
    const alias = returnedWiki.alias = `${aliasBase}${aliasArr.length + 1}`
    aliasArr.push(alias)

    let parent = returnedWiki.parent
    if (parent) {
        const parentAlias = `${aliasBase}${aliasArr.length + 1}`
        if (aliasBase === 'a') joinStatements.push(parentJoin(parent, parentAlias, returnedWiki))
        returnedWiki.parent = parseFindWiki(parent, aliasBase, aliasArr, joinStatements, whereDict, orderByDict)[0]
    }

    if (returnedWiki.junctions) {
        for (const key of Object.keys(returnedWiki.junctions)) {
            const joinedTable = returnedWiki.junctions[key]
            const joinedTableAlias = `${aliasBase}${aliasArr.length + 1}`
            if (aliasBase === 'a') joinStatements.push(junctionJoin(joinedTable, joinedTableAlias, returnedWiki, key))
            returnedWiki.junctions[key] = parseFindWiki(joinedTable, aliasBase, aliasArr, joinStatements, whereDict, orderByDict)[0]
        }
    }
    const { templateWhere, where, orderBy, templateOrderBy } = returnedWiki
    let templateAliasObj
    if (templateOrderBy || templateWhere) templateAliasObj = createFullAndFlatAliasObj(returnedWiki)
    if (templateWhere) parseTemplateWhere(templateWhere, templateAliasObj, whereDict)
    if (where) whereValues2Statements(returnedWiki, where, whereDict)
    if (templateOrderBy) parseTemplateOrderBy(templateOrderBy, templateAliasObj, orderByDict)
    if (orderBy) orderByValues2Statements(returnedWiki, orderBy, orderByDict)

    return [returnedWiki, joinStatements, whereDict, orderByDict]
}

export async function executeFindQuery(queryStr, params, dbConnection, sqlClient) {
    try {
        let queryResult
        if (sqlClient === "postgres") queryResult = (await dbConnection.query(queryStr, params)).rows
        else {
            const formattedParams = []
            for (const param of params) formattedParams.push(jsValue2SqliteValue(param))
            queryResult = dbConnection.prepare(queryStr).all(...formattedParams)
        }
        return queryResult
    }
    catch (e) {
        coloredBackgroundConsoleLog(`Find failed. ${e}\n`, `failure`)
        return []
    }
}

export function findColumnObjOnWiki(propertyName, scopedWiki) {
    let currentWiki = scopedWiki
    let columnObj
    while (!columnObj) {
        columnObj = currentWiki.columns[propertyName]
        currentWiki = currentWiki.parent
    }
    return columnObj
}

export function junctionProp2Wiki(scopedWiki, propertyName) {
    let mapWithJunction
    if (scopedWiki.junctions[propertyName]) mapWithJunction = scopedWiki.junctions[propertyName]
    else {
        let currentParent = scopedWiki.parent
        while (!currentParent.junctions[propertyName]) currentParent = currentParent.parent
        mapWithJunction = currentParent.junctions[propertyName]
    }
    return mapWithJunction
}

export function fillCalledRelationsOnInstance(instance, resultObj, scopedWiki, relationalProperties2Add, Entities) {
    for (const propertyName of relationalProperties2Add) {
        const scopedMap4Junction = junctionProp2Wiki(scopedWiki, propertyName)
        if (scopedMap4Junction.isArray) {
            if (!resultObj[propertyName].length) {
                instance[propertyName] = createRelationalArrayProxy(instance, propertyName)
                continue
            }

            instance[propertyName] = []
            for (let i = 0; i < resultObj[propertyName].length; i++) {
                const instanceProxy = rowObj2InstanceProxy(resultObj[propertyName][i], scopedMap4Junction, Entities)
                instance[propertyName][i] = instanceProxy
            }
            instance[propertyName] = createRelationalArrayProxy(instance, propertyName, instance[propertyName])
        }
        else {
            instance[propertyName] = undefined
            if (!resultObj[propertyName]) continue
            const instanceProxy = rowObj2InstanceProxy(resultObj[propertyName], scopedMap4Junction, Entities)
            instance[propertyName] = instanceProxy
        }
    }
}

export function getRelationalPropNames(classWiki, only1To1Relations = false) {
    let relationalPropsEntries = Object.entries(classWiki.junctions ?? {})
    let currentWiki = classWiki
    while (currentWiki.parent) {
        let parentRelationalPropEntries = Object.entries(currentWiki.parent.junctions ?? {})
        relationalPropsEntries.push(...parentRelationalPropEntries)
        currentWiki = currentWiki.parent
    }
    if (only1To1Relations) relationalPropsEntries = relationalPropsEntries.filter(([propName, junctionObj]) => !junctionObj.isArray)
    return relationalPropsEntries.map(([propName, junctionObj]) => propName)
}

export function traverseResultObjRelationalScope(instanceArrOrInstanceObj, scopedWiki, entitiesFuncsArr) {
    if (!instanceArrOrInstanceObj) return
    else if (Array.isArray(instanceArrOrInstanceObj)) {
        if (!instanceArrOrInstanceObj.length) return
        for (const instance of instanceArrOrInstanceObj) rowObj2InstanceProxy(instance, scopedWiki, entitiesFuncsArr)
    }
    else rowObj2InstanceProxy(instanceArrOrInstanceObj, scopedWiki, entitiesFuncsArr)
}
