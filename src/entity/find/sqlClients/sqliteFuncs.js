// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { nonSnake2Snake, postgres2sqliteQueryStr, snake2Pascal } from "../../../misc/miscFunctions.js"
import { rowObj2InstanceProxy } from "../../../proxies/instanceProxy.js"
import { createNonRelationalArrayProxy } from "../../../proxies/nonRelationalArrayProxy.js"
import { createObjectProxy } from "../../../proxies/objectProxy.js"
import { findColumnObjOnWiki } from "../find.js"
import { junctionJoinCte, junctionJoinSelectedCte, parentJoin } from "../joins.js"


export function sqlite2JsTyping(value, columnTypeObj) {
    if (value == null) return undefined
    const type = columnTypeObj.type
    if (columnTypeObj.isArray || type === 'object') return JSON.parse(value)
    else if (type === 'bigint') return BigInt(value)
    else if (type === 'boolean') return value === 1
    else if (type === 'Date') return new Date(value)
    else return value
}

export function sqliteCreateProxyArray(resultArray, findWiki, entitiesFuncArr, hasEagerLoading, isOrdered = false) {
    if (!resultArray || resultArray.length === 0) return []
    const proxyArr = []
    const orderDict = {}
    if (isOrdered) {
        const rootIdName = `${findWiki.alias}_id`
        const idDict = {}

        for (const row of resultArray) {
            const rowId = row[rootIdName]
            if (idDict[rowId]) continue
            idDict[rowId] = true
            orderDict[rowId] = row.row_order - 1
        }
    }

    if (!hasEagerLoading) {
        const chars2delete = findWiki.alias.length + 1
        for (const row of resultArray) {
            for (const key of Object.keys(row)) {
                const newKey = snake2Pascal(key.slice(chars2delete), true)
                row[newKey] = row[key]
                delete row[key]
            }
            proxyArr.push(rowObj2InstanceProxy(row, findWiki, entitiesFuncArr))
        }

    }
    else {
        const ledger = {}
        const instanceWiki = createInstanceWiki(findWiki)

        for (const rowObj of resultArray) createNestedClassInstance(rowObj, instanceWiki, ledger, entitiesFuncArr)
        for (const instance of Object.values(ledger)) formatAndProxifyEntityInstance(instance, findWiki, entitiesFuncArr, proxyArr)
    }

    if (isOrdered) {
        const indexOffset = Math.min(...Object.values(orderDict)) 
        const orderedProxyArr = new Array(Object.keys(orderDict).length)
        for (const proxy of proxyArr) {
            const index = orderDict[proxy.id]
            orderedProxyArr[index - indexOffset] = proxy
        }
        return orderedProxyArr
    }
    return proxyArr
}


function createInstanceWiki(findWiki) {
    /**@type {any}*/ const instanceWiki = {
        alias: findWiki.alias,
        columns: undefined,
        junctions: [],
        propertyName: findWiki.propertyName,
        className: findWiki.className,
        isArray: findWiki.isArray,
        uncalledJunctions: findWiki.uncalledJunctions
    }

    let instanceColumnsObj = formatColumns(findWiki)
    if (findWiki.junctions) instanceWiki.junctions.push(...formatJunctions4InstanceWiki(findWiki))
    if (findWiki.parent) {
        let currentAliasMap = findWiki
        const rootChildAlias = findWiki.alias
        while (currentAliasMap.parent) {
            const parentColumnsObj = formatColumns(currentAliasMap.parent, rootChildAlias)
            instanceColumnsObj = { ...instanceColumnsObj, ...parentColumnsObj }
            if (currentAliasMap.parent.junctions) instanceWiki.junctions.push(...formatJunctions4InstanceWiki(findWiki.parent))
            currentAliasMap = currentAliasMap.parent
        }
    }
    instanceWiki.columns = instanceColumnsObj
    return instanceWiki
}


function createNestedClassInstance(rowObj, instanceWiki, object4Nesting, entityFunctions) {
    const currentAlias = instanceWiki.alias
    const instanceId = rowObj[currentAlias + `_id`]
    if (!instanceId) return

    const currentClassName = instanceWiki.className

    if (!object4Nesting[instanceId]) {
        const target = object4Nesting[instanceId] = Object.create(entityFunctions[currentClassName].prototype)
        for (const [propertyName, columnTypeObj] of Object.entries(instanceWiki.columns)) {
            const val = rowObj[propertyName]
            target[columnTypeObj.propertyName] = val
        }
    }

    for (const junction of instanceWiki.junctions) {
        const target = object4Nesting[instanceId][junction.propertyName] ??= {}
        createNestedClassInstance(rowObj, junction, target, entityFunctions)
    }
}


export function formatAndProxifyEntityInstance(instance, findWiki, entityFunctions, /**@type {any}*/ proxyArr = undefined) {
    const junctionEntries = Object.entries(findWiki.junctions ?? {})
    for (const [junctionKey, junctionObj] of junctionEntries) {
        if (junctionObj.isArray) {
            instance[junctionKey] = Object.values(instance[junctionKey])
            if (!instance[junctionKey]) continue
            for (const joinedInstance of instance[junctionKey]) formatAndProxifyEntityInstance(joinedInstance, junctionObj, entityFunctions)
        }
        else {
            instance[junctionKey] = Object.values(instance[junctionKey])[0]
            if (!instance[junctionKey]) continue
            formatAndProxifyEntityInstance(instance[junctionKey], junctionObj, entityFunctions)
        }
    }
    const proxy = rowObj2InstanceProxy(instance, findWiki, entityFunctions)
    if (proxyArr) proxyArr.push(proxy)
}


function formatColumns(aliasMap, /**@type {false | string}*/ rootChildAlias = false) {
    const returnedObj = {}
    let alias
    if (rootChildAlias) alias = rootChildAlias
    else alias = aliasMap.alias

    const entries = Object.entries(aliasMap.columns)
    for (const [propertyName, columnObj] of entries) {
        columnObj.propertyName = propertyName
        returnedObj[alias + `_${nonSnake2Snake(propertyName)}`] = columnObj
    }

    return returnedObj
}


function formatJunctions4InstanceWiki(aliasMap) {
    const entries = Object.entries(aliasMap.junctions)
    const returnedArr = []
    for (const [propertyName, junctionObj] of entries) {
        junctionObj.propertyName = propertyName
        returnedArr.push(createInstanceWiki(junctionObj))
    }
    return returnedArr
}

export function sqliteDbValHandling(instance, propertyName, value, scopedMap) {
    value = sqlite2JsTyping(value, findColumnObjOnWiki(propertyName, scopedMap))
    const valType = Array.isArray(value) ? `array` : value instanceof Date ? `date` : typeof value
    if (valType === `array`) {
        const isArrayOfObjects = findColumnObjOnWiki(propertyName, scopedMap).type === `object`
        instance[propertyName] = createNonRelationalArrayProxy(instance, propertyName, value.map(el => el === null ? undefined : el), undefined, isArrayOfObjects)
    }
    else if (valType === `object`) instance[propertyName] = createObjectProxy(instance, propertyName, value)
    else instance[propertyName] = value
}


export function eagerLoadCTEsSqlite(findWiki, columnObj, cteArr = [], selectStatements = [], joinStatements = []) {
    let cteStr = ``
    let fromStatement = ``
    const baseAlias = findWiki.alias
    if (!cteArr.length) {
        cteStr += `selected_cte AS ( SELECT ${baseAlias}.*, `
        fromStatement += ` FROM root_cte ${baseAlias} `

        const joinedTableArr = []
        const joinedTableEntries = Object.entries(findWiki.junctions)

        for (const [propertyName, joinedTableObj] of joinedTableEntries) {
            selectStatements.push(`${joinedTableObj.alias}.*`)
            joinStatements.push(junctionJoinSelectedCte(joinedTableObj, findWiki, propertyName, 'sqlite'))
            joinedTableArr.push(joinedTableObj)
        }

        cteStr += selectStatements.join(`, `) + fromStatement + joinStatements.join(` `) + `)`
        cteArr.push(cteStr)

        for (const joinedTable of joinedTableArr) eagerLoadCTEsSqlite(joinedTable, columnObj, cteArr)
    }
    else {
        cteStr += `${baseAlias}_cte AS (SELECT `
        fromStatement += ` FROM "${nonSnake2Snake(findWiki.className)}" ${baseAlias} `

        const baseColumns = Object.values(columnObj[findWiki.className])
        let columnNamingStr = baseColumns.map(columnName => `${baseAlias}.${columnName} AS ${baseAlias}_${columnName}`).join(`, `) + `, `
        let joinStatements = []
        if (findWiki.parent) {
            let currentWiki = findWiki
            while (currentWiki.parent) {
                const parent = currentWiki.parent
                const parentName = parent.className
                const parentAlias = parent.alias

                let parentColumnsArr = Object.values(columnObj[parentName])
                const index = parentColumnsArr.indexOf(`id`)
                parentColumnsArr.splice(index, 1)

                columnNamingStr += parentColumnsArr.map(columnName => `${parentAlias}.${columnName} AS ${baseAlias}_${columnName}`).join(`, `) + `, `
                joinStatements.push(parentJoin(parent, parentAlias, currentWiki))
                currentWiki = currentWiki.parent
            }
        }

        let selectedCtesArr = []
        if (findWiki.junctions) {
            const relationEntries = Object.entries(findWiki.junctions)
            for (const [key, joinedTableObj] of relationEntries) {
                joinStatements.push(junctionJoinCte(joinedTableObj, findWiki, key, 'sqlite'))
                selectedCtesArr.push(`${joinedTableObj.alias}.*`)
                eagerLoadCTEsSqlite(joinedTableObj, columnObj, cteArr)
            }
        }

        cteStr += columnNamingStr.slice(0, -2) + ` `
        if (selectedCtesArr.length) cteStr += `,` + selectedCtesArr.join(`, `)
        cteStr += fromStatement + joinStatements.join(` `) + `)`
        cteArr.unshift(cteStr)
    }
    return cteArr
}

export function changeStatementsPlaceholders(statements) {
    return statements.map(statement => postgres2sqliteQueryStr(statement))
}