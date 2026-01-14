import { nonSnake2Snake, postgres2JsTyping, snake2Pascal } from "../../../misc/miscFunctions.js"
import { rowObj2InstanceProxy } from "../../../proxies/instanceProxy.js"
import { createNonRelationalArrayProxy } from "../../../proxies/nonRelationalArrayProxy.js"
import { createObjectProxy } from "../../../proxies/objectProxy.js"
import { findColumnObjOnWiki } from "../find.js"
import { junctionJoinCte, junctionJoinSelectedCte, parentJoin } from "../joins.js"

export function postgresCreateProxyArray(queryResult, scopeObj, entitiesFuncArr, hadEagerLoading) {
    if (!queryResult || queryResult.length === 0) return []

    const proxyArr = []
    for (const row of queryResult) {
        let resultObj = hadEagerLoading ? row.json : row
        if (!hadEagerLoading) {
            const chars2delete = scopeObj.alias.length + 1
            for (const key of Object.keys(row)) {
                const newKey = snake2Pascal(key.slice(chars2delete), true)
                row[newKey] = row[key]
                delete row[key]
            }
        }
        const filledInstance = rowObj2InstanceProxy(resultObj, scopeObj, entitiesFuncArr)
        proxyArr.push(filledInstance)
    }
    return proxyArr
}

export function eagerLoadCTEsPostgres(findWiki, cteArr2d = [], isSelectedCte = false, joinsJsonBuildStatements = [], joinStatements = []) {
    let cteStr = ``
    let fromStatement = ``
    const baseAlias = findWiki.alias
    let mainAndBridgeCteArr = []

    if (isSelectedCte) {
        const rootCteIdRef = `${baseAlias}.${baseAlias}_id`
        cteStr += `selected_cte AS ( SELECT ${rootCteIdRef} AS id, jsonb_build_object( 'id', `
        if (findWiki.columns.id.type === `bigint`) cteStr += `${rootCteIdRef}::text, `
        else cteStr += `${rootCteIdRef}, `
        fromStatement += ` FROM root_cte ${baseAlias} `

        let rootCteColumnNames = []
        let bigintColumnNames = []
        for (const [columnName, columnObj] of Object.entries(findWiki.columns)) {
            if (columnObj.type === `bigint`) bigintColumnNames.push(columnName)
            else rootCteColumnNames.push(columnName)
        }

        if (findWiki.parent) {
            let currentWiki = findWiki
            while (currentWiki.parent) {
                for (const [columnName, columnObj] of Object.entries(currentWiki.parent.columns)) {
                    if (columnObj.type === `bigint` && !columnObj.isArray) bigintColumnNames.push(columnName)
                    else rootCteColumnNames.push(columnName)
                }
                currentWiki = currentWiki.parent
            }
        }

        bigintColumnNames = bigintColumnNames.filter(columnName => columnName !== `id`)
        bigintColumnNames = bigintColumnNames.map(columnName => `'${columnName}', ${baseAlias}.${baseAlias}_${nonSnake2Snake(columnName)}::text`)
        rootCteColumnNames = rootCteColumnNames.filter(columnName => columnName !== `id`)
        rootCteColumnNames = rootCteColumnNames.map(columnName => `'${columnName}', ${baseAlias}.${baseAlias}_${nonSnake2Snake(columnName)}`)

        if (rootCteColumnNames.length) cteStr += rootCteColumnNames.join(`, `) + `, `
        if (bigintColumnNames.length) cteStr += bigintColumnNames.join(`, `) + `, `

        const joinedTableEntries = Object.entries(findWiki.junctions)

        for (const [propertyName, joinedTableObj] of joinedTableEntries) {
            const isJoiningArray = joinedTableObj.isArray
            if (isJoiningArray) {
                const bridgeCteAlias = `${baseAlias}${joinedTableObj.alias}`
                joinsJsonBuildStatements.push(`'${propertyName}', COALESCE(${bridgeCteAlias}.json, '[]'::jsonb)`)
                joinStatements.push(`LEFT JOIN ${bridgeCteAlias}_cte ${bridgeCteAlias} ON ${baseAlias}.${baseAlias}_id = ${bridgeCteAlias}.id`)
                mainAndBridgeCteArr.push(one2ManyPostgresBridgeCte(findWiki, joinedTableObj, propertyName))
            }
            else {
                joinsJsonBuildStatements.push(`'${propertyName}', ${joinedTableObj.alias}.json`)
                joinStatements.push(junctionJoinSelectedCte(joinedTableObj, findWiki, propertyName, 'postgresql'))
            }
            eagerLoadCTEsPostgres(joinedTableObj, cteArr2d)
        }
        cteStr += joinsJsonBuildStatements.join(`, `) + `) AS json` + fromStatement + joinStatements.join(` `) + `)`
    }
    else {
        const isArray = findWiki.isArray
        cteStr += `${baseAlias}_cte AS (SELECT ${baseAlias}.id, `
        fromStatement += ` FROM ${nonSnake2Snake(findWiki.className)} ${baseAlias} `

        let jsonBuildStatementsStr = ``
        joinsJsonBuildStatements =
            Object.keys(findWiki.columns)
                .filter(columnName => columnName !== 'id')
                .map(columnName => [columnName, baseAlias, findWiki.columns[columnName]])

        let joinStatements = []
        if (findWiki.parent) {
            let currentWiki = findWiki
            while (currentWiki.parent) {
                const currentParent = currentWiki.parent
                const parentAlias = currentParent.alias
                const parentColumns = Object.keys(currentParent.columns)
                    .filter(columnName => columnName !== 'id')
                    .map(columnName => [columnName, parentAlias, currentParent.columns[columnName]])
                joinsJsonBuildStatements.push(...parentColumns)
                joinStatements.push(parentJoin(currentParent, currentParent.alias, currentWiki))
                currentWiki = currentParent
            }
        }
        joinsJsonBuildStatements = joinsJsonBuildStatements.map(([columnName, alias, columnObj]) => {
            if (columnObj.type === `bigint` && !columnObj.isArray) return `'${columnName}', ${alias}.${nonSnake2Snake(columnName)}::text`
            else return `'${columnName}', ${alias}.${nonSnake2Snake(columnName)}`
        })

        const joinedTableEntries = Object.entries(findWiki.junctions ?? {})

        for (const [propertyName, joinedTableObj] of joinedTableEntries) {
            const isJoiningArray = joinedTableObj.isArray
            if (isJoiningArray) {
                const bridgeCteAlias = `${findWiki.alias}${joinedTableObj.alias}`
                joinsJsonBuildStatements.push(`'${propertyName}', COALESCE(${bridgeCteAlias}.json, '[]'::jsonb)`)
                joinStatements.push(`LEFT JOIN ${bridgeCteAlias}_cte ${bridgeCteAlias} ON ${findWiki.alias}.id = ${bridgeCteAlias}.id`)
                mainAndBridgeCteArr.push(one2ManyPostgresBridgeCte(findWiki, joinedTableObj, propertyName))
            }
            else {
                joinsJsonBuildStatements.push(`'${propertyName}', ${joinedTableObj.alias}.json`)
                joinStatements.push(junctionJoinCte(joinedTableObj, findWiki, propertyName, 'postgresql'))

            }
            eagerLoadCTEsPostgres(joinedTableObj, cteArr2d)
        }
        jsonBuildStatementsStr += joinsJsonBuildStatements.join(`, `)

        if (isArray) cteStr += `jsonb_build_object( 'id', ${baseAlias}.id, ${jsonBuildStatementsStr}) `
        else cteStr += `jsonb_build_object( 'id', ${baseAlias}.id, ${jsonBuildStatementsStr}) `

        cteStr += `AS json` + fromStatement + joinStatements.join(` `) + `)`

    }
    mainAndBridgeCteArr.push(cteStr)
    cteArr2d.push(mainAndBridgeCteArr)
    return cteArr2d
}

function one2ManyPostgresBridgeCte(baseTable, joinedTable, propertyName) {
    const baseNameSnaked = nonSnake2Snake(baseTable.className)
    const baseAlias = baseTable.alias
    const joinedAlias = joinedTable.alias
    const junctionName = `${baseNameSnaked}___${nonSnake2Snake(propertyName)}_jt`
    const junctionAlias = `jt_${baseAlias}_${joinedAlias}`
    const cteAlias = baseAlias + joinedAlias + `_cte`

    let queryStr = `${cteAlias} AS (SELECT ${junctionAlias}.joining_id AS id, `
    queryStr += `jsonb_agg(${joinedAlias}.json) AS json `
    queryStr += `FROM  ${junctionName} ${junctionAlias} `
    queryStr += `LEFT JOIN ${joinedAlias}_cte ${joinedAlias} ON ${junctionAlias}.joined_id = ${joinedAlias}.id `
    queryStr += `GROUP BY ${junctionAlias}.joining_id)`
    return queryStr
}


export function postgresDbValHandling(instance, propertyName, value, scopeObj) {
    const valType = Array.isArray(value) ? `array` : value instanceof Date ? `date` : typeof value
    if (valType === `array`) {
        const isArrayOfObjects = findColumnObjOnWiki(propertyName, scopeObj).type === `object`
        instance[propertyName] = createNonRelationalArrayProxy(instance, propertyName, value.map(el => el === null ? undefined : el), undefined, isArrayOfObjects)
    }
    else if (valType === `object`) instance[propertyName] = createObjectProxy(instance, propertyName, value)
    else if (valType === `string`) instance[propertyName] = postgres2JsTyping(value, findColumnObjOnWiki(propertyName, scopeObj))
    else instance[propertyName] = value
}