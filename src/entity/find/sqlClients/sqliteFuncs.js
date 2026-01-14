import { nonSnake2Snake, snake2Pascal, sqlite2JsTyping } from "../../../misc/miscFunctions.js"
import { rowObj2InstanceProxy } from "../../../proxies/instanceProxy.js"
import { createNonRelationalArrayProxy } from "../../../proxies/nonRelationalArrayProxy.js"
import { createObjectProxy } from "../../../proxies/objectProxy.js"
import { findColumnObjOnWiki } from "../find.js"
import { junctionJoinCte, junctionJoinSelectedCte, parentJoin } from "../joins.js"

export function sqliteCreateProxyArray(resultArray, findWiki, entitiesFuncArr, hadEagerLoading, is4UncalledJunctionPromise = false) {
    if (resultArray.length === 0) return []
    const proxyArr = []

    if (!hadEagerLoading) {
        const chars2delete = findWiki.alias.length + 1
        for (const row of resultArray) {
            for (const key of Object.keys(row)) {
                const newKey = snake2Pascal(key.slice(chars2delete), true)
                row[newKey] = row[key]
                delete row[key]
            }
            proxyArr.push(rowObj2InstanceProxy(row, findWiki, entitiesFuncArr))
        }
        return proxyArr
    }

    const ledger = {}
    const instanceWiki = createInstanceWiki(findWiki, is4UncalledJunctionPromise)

    for (const rowObj of resultArray) createNestedClassInstance(rowObj, instanceWiki, ledger, entitiesFuncArr, is4UncalledJunctionPromise)
    for (const instance of Object.values(ledger)) formatAndproxifyEntityInstanceObj(instance, findWiki, entitiesFuncArr, proxyArr)
    return proxyArr
}


function createInstanceWiki(findWiki, is4UncalledJunctionPromise) {
    /**@type {any}*/ const instanceWiki = {
        alias: findWiki.alias,
        columns: undefined,
        junctions: [],
        propertyName: findWiki.propertyName,
        className: findWiki.className,
        isArray: findWiki.isArray,
        uncalledJunctions: findWiki.uncalledJunctions
    }

    let instanceColumnsObj = formatColumns(findWiki, is4UncalledJunctionPromise)
    if (findWiki.junctions) instanceWiki.junctions.push(...formatJunctions4InstanceWiki(findWiki, is4UncalledJunctionPromise))
    if (findWiki.parent) {
        let currentAliasMap = findWiki
        const rootChildAlias = findWiki.alias
        while (currentAliasMap.parent) {
            const parentColumnsObj = formatColumns(currentAliasMap.parent, is4UncalledJunctionPromise, rootChildAlias)
            instanceColumnsObj = { ...instanceColumnsObj, ...parentColumnsObj }
            if (currentAliasMap.parent.junctions) instanceWiki.junctions.push(...formatJunctions4InstanceWiki(findWiki.parent, is4UncalledJunctionPromise))
            currentAliasMap = currentAliasMap.parent
        }
    }
    instanceWiki.columns = instanceColumnsObj
    return instanceWiki
}


function createNestedClassInstance(rowObj, instanceWiki, object4Nesting, entities, is4UncalledJunctionPromise) {
    const currentAlias = instanceWiki.alias
    const instanceId = is4UncalledJunctionPromise ? rowObj.id : rowObj[currentAlias + `_id`]
    if (!instanceId) return

    const currentClassName = instanceWiki.className

    if (!object4Nesting[instanceId]) {
        const target = object4Nesting[instanceId] = Object.create(entities[currentClassName].prototype)
        for (const [propertyName, columnTypeObj] of Object.entries(instanceWiki.columns)) {
            const val = rowObj[propertyName]
            target[columnTypeObj.propertyName] = val
        }
    }

    for (const junction of instanceWiki.junctions) {
        const target = object4Nesting[instanceId][junction.propertyName] ??= {}
        createNestedClassInstance(rowObj, junction, target, entities, is4UncalledJunctionPromise)
    }
}


export function formatAndproxifyEntityInstanceObj(instance, findWiki, entities, /**@type {any}*/ proxyArr = undefined) {
    const junctionEntries = Object.entries(findWiki.junctions ?? {})
    for (const [junctionKey, junctionObj] of junctionEntries) {
        if (junctionObj.isArray) {
            instance[junctionKey] = Object.values(instance[junctionKey])
            if (!instance[junctionKey]) continue
            for (const joinedInstance of instance[junctionKey]) formatAndproxifyEntityInstanceObj(joinedInstance, junctionObj, entities)
        }
        else {
            instance[junctionKey] = Object.values(instance[junctionKey])[0]
            if (!instance[junctionKey]) continue
            formatAndproxifyEntityInstanceObj(instance[junctionKey], junctionObj, entities)
        }
    }
    const proxy = rowObj2InstanceProxy(instance, findWiki, entities)
    if (proxyArr) proxyArr.push(proxy)
}


function formatColumns(aliasMap, is4UncalledJunctionPromise, /**@type {false | string}*/ rootChildAlias = false) {
    const returnedObj = {}
    let alias
    if (rootChildAlias) alias = rootChildAlias
    else alias = aliasMap.alias

    const entries = Object.entries(aliasMap.columns)

    if (is4UncalledJunctionPromise) {
        for (const [propertyName, columnObj] of entries) {
            columnObj.propertyName = propertyName
            returnedObj[nonSnake2Snake(propertyName)] = columnObj
        }
    }
    else {
        for (const [propertyName, columnObj] of entries) {
            columnObj.propertyName = propertyName
            returnedObj[alias + `_${nonSnake2Snake(propertyName)}`] = columnObj
        }
    }
    return returnedObj
}


function formatJunctions4InstanceWiki(aliasMap, is4UncalledJunctionPromise) {
    const entries = Object.entries(aliasMap.junctions)
    const returnedArr = []
    for (const [propertyName, junctionObj] of entries) {
        junctionObj.propertyName = propertyName
        returnedArr.push(createInstanceWiki(junctionObj, is4UncalledJunctionPromise))
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
        fromStatement += ` FROM ${nonSnake2Snake(findWiki.className)} ${baseAlias} `

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