// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { nonSnake2Snake } from "../../misc/miscFunctions.js"
import { parseFindWiki } from "./find.js"
import { mergeRelationsScope } from "./relations.js"
import { deproxifyScopeProxy, classWiki2ScopeProxy } from "./scopeProxies.js"
import { parentJoin } from "./joins.js"
import { eagerLoadCTEsPostgres, offsetStatementsPlaceholders } from "./sqlClients/postgresFuncs.js"
import { changeStatementsPlaceholders, eagerLoadCTEsSqlite } from "./sqlClients/sqliteFuncs.js"


/**
 * @returns {[string, any]}
 */
export function queryBuilder(findWiki, joinStatements, statementsObj, eagerLoad, classWiki, sqlClient) {
    const { orderByStr, limitStr, offsetStr } = statementsObj
    let flatFilteredCte = generateFlatFilteredCte(findWiki, joinStatements, statementsObj, sqlClient)
    let relationsWiki = classWiki2ScopeProxy(classWiki)
    let eagerLoadCteArr
    let queryStr
    let selectionStr
    if (eagerLoad) {
        mergeRelationsScope(relationsWiki, eagerLoad)
        relationsWiki = deproxifyScopeProxy(relationsWiki, true)
        const columnObj = generateColumnObj(relationsWiki)
        orderingPaginationContext(columnObj, orderByStr, limitStr, offsetStr)
        let rootCte = generateRootCte(relationsWiki, columnObj)
        const [aliasedFindMap] = parseFindWiki(relationsWiki, 'b')
        eagerLoadCteArr = generateEagerLoadCTEsArr(aliasedFindMap, columnObj, orderByStr, sqlClient)
        queryStr = flatFilteredCte + `, ` + rootCte + `, ` + eagerLoadCteArr.join(`, `)
        selectionStr = ` FROM selected_cte`
        if (orderByStr && sqlClient !== 'sqlite') selectionStr += ` ORDER BY row_order`
        if (sqlClient === `postgres`) selectionStr = ` SELECT json` + selectionStr
        else selectionStr = ` SELECT *` + selectionStr
    }
    else {
        relationsWiki = deproxifyScopeProxy(relationsWiki, true)
        relationsWiki.alias = `b1`
        const columnObj = generateColumnObj(findWiki, false)
        orderingPaginationContext(columnObj, orderByStr, limitStr, offsetStr)
        let rootCte = generateRootCte(findWiki, columnObj)
        queryStr = flatFilteredCte + `, ` + rootCte
        selectionStr = ` SELECT * FROM root_cte`
        if (orderByStr && sqlClient !== 'postgres') selectionStr += ` ORDER BY row_order`
    }
    return [queryStr + selectionStr, relationsWiki]
}

function generateFlatFilteredCte(findWiki, joinStatements, statementsObj, sqlClient, queryStr = `SELECT `) {
    const { whereStr, orderByStr, limitStr, offsetStr } = statementsObj
    const { alias, className, aggregate } = findWiki
    const idRefStr = `${alias}.id`
    queryStr += aggregate ? `${idRefStr}` : `DISTINCT ${idRefStr}`
    if (orderByStr) queryStr += orderByStr
    queryStr += ` FROM "${nonSnake2Snake(className)}" ${alias} `
    if (joinStatements.length) queryStr += joinStatements.join(` `) + ` `
    if (whereStr) queryStr += whereStr
    if (aggregate) queryStr += ` GROUP BY ${idRefStr}`
    queryStr = `WITH root_ids AS (${queryStr})`

    if (limitStr || offsetStr) {
        let paginationCte = `SELECT id`
        if (orderByStr) paginationCte += `, row_order`
        paginationCte += ` FROM root_ids`
        if (limitStr) paginationCte += limitStr
        if (offsetStr) {
            if (!limitStr && sqlClient === 'sqlite') paginationCte += ` LIMIT -1`
            paginationCte += offsetStr
        }
        return queryStr + `, pagination_cte AS (${paginationCte})`
    }
    return queryStr
}

function generateRootCte(findWiki, columnObj, aliasBase = 'b') {
    let snakeCasedColumnNames2dArr = [Object.values(columnObj[findWiki.className])]
    let joinStatements = []
    if (findWiki.parent) {
        let currentWiki = findWiki
        let i = 1
        while (currentWiki.parent) {
            currentWiki.alias = `${aliasBase}${i}`
            const parentName = currentWiki.parent.className

            let parentColumnsArr = Object.values(columnObj[parentName])
            const index = parentColumnsArr.indexOf(`id`)
            parentColumnsArr.splice(index, 1)
            snakeCasedColumnNames2dArr.push(parentColumnsArr)

            joinStatements.push(parentJoin(currentWiki.parent, `${aliasBase}${++i}`, currentWiki))
            currentWiki = currentWiki.parent
        }
        currentWiki.alias = `${aliasBase}${i}`
    }

    let selectFrom
    let columnNamingStr = ``
    for (const [index, arr] of snakeCasedColumnNames2dArr.entries())
        columnNamingStr += arr.map(name => `b${index + 1}.${name} AS b1_${name}`).join(`, `) + `, `

    if (columnObj.orderBy) columnNamingStr += `r.row_order, `

    if (columnObj.limit || columnObj.offset) selectFrom = `pagination_cte`
    else selectFrom = `root_ids`

    let cteStr = `root_cte AS (SELECT ${columnNamingStr.slice(0, -2)} FROM ${selectFrom} r JOIN "${nonSnake2Snake(findWiki.className)}" ${aliasBase}1 ON ${aliasBase}1.id = r.id`
    if (findWiki.parent) return cteStr + ` ` + joinStatements.join(` `) + `)`
    else return cteStr + `)`
}


function generateEagerLoadCTEsArr(findWiki, columnObj, orderBy, sqlClient) {
    if (sqlClient === "postgres") return eagerLoadCTEsPostgres(findWiki, [], orderBy, true)
    else return eagerLoadCTEsSqlite(findWiki, columnObj)
}


function generateColumnObj(findWiki, relationalRecusrion = true, columnObj = {}) {
    const className = findWiki.className
    if (columnObj[className]) return columnObj

    const classColumnObj = columnObj[className] = {}
    const columnNames = Object.keys(findWiki.columns)
    for (const columnName of columnNames) classColumnObj[columnName] = nonSnake2Snake(columnName)

    if (findWiki.parent) generateColumnObj(findWiki.parent, relationalRecusrion, columnObj)
    const relations = findWiki.junctions
    if (relations && relationalRecusrion) {
        for (const key of Object.keys(relations)) generateColumnObj(relations[key], relationalRecusrion, columnObj)
    }
    return columnObj
}

function orderingPaginationContext(columnObj, orderBy, limit, offset) {
    if (orderBy) columnObj.orderBy = true
    if (limit) columnObj.limit = true
    if (offset) columnObj.offset = true
}


export function createStatementsDict(whereOutput, orderByOutput, limitArg, offsetArg, sqlClient) {
    /**@type {any}*/ const statementsDict = {
        whereStr: undefined,
        orderByStr: undefined,
        limitStr: undefined,
        offsetStr: undefined
    }
    let queryParams
    let orderByStatements = orderByOutput.statements = Object.values(orderByOutput.statements)
    let whereStatements = whereOutput.statements

    if (sqlClient === `sqlite`) {
        queryParams = [...orderByOutput.params, ...whereOutput.params, ]
        whereStatements = changeStatementsPlaceholders(whereStatements)
        orderByStatements = changeStatementsPlaceholders(orderByStatements)
    }
    else {
        queryParams = [...orderByOutput.params, ...whereOutput.params, ]
        const offsetInt = orderByOutput.params.length
        if (offsetInt) whereStatements = offsetStatementsPlaceholders(whereStatements, offsetInt)
    }

    if (whereStatements.length) statementsDict.whereStr = createWhereStr(whereStatements)
    if (orderByStatements.length) statementsDict.orderByStr = createOrderByStr(orderByStatements)
    if (limitArg || offsetArg) {
        const placeholder = () => sqlClient === 'postgres' ? `$${queryParams.length + 1}` : `?`
        if (limitArg) {
            statementsDict.limitStr = ` LIMIT ${placeholder()}`
            queryParams.push(limitArg)
        }
        if (offsetArg) {
            statementsDict.offsetStr = ` OFFSET ${placeholder()}`
            queryParams.push(offsetArg)
        }
    }
    statementsDict.params = queryParams
    return statementsDict
}

function createWhereStr(whereStatements) {
    return ` WHERE (` + whereStatements.join(`) AND (`) + `)`
}

function createOrderByStr(orderByStatements) {
    return `, ROW_NUMBER() OVER (ORDER BY ` + orderByStatements.join(`, `) + `) AS row_order`
}