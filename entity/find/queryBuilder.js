import { nonSnake2Snake } from "../../misc/miscFunctions.js"
import { parseFindWiki } from "./find.js"
import { mergeRelationsScope } from "./relations.js"
import { deproxifyScopeProxy, classWiki2ScopeProxy } from "./scopeProxies.js"
import { parentJoin } from "./joins.js"
import { eagerLoadCTEsPostgres } from "./sqlClients/postgresFuncs.js"
import { eagerLoadCTEsSqlite } from "./sqlClients/sqliteFuncs.js"

export function generateQueryStrWithCTEs(findWiki, joinStatements, whereObj, eagerLoad, classWiki, sqlClient) {
    let flatFilteredCte = generateFlatFilteredCte(findWiki, joinStatements, whereObj.statements)
    let relationsWiki = classWiki2ScopeProxy(classWiki)
    let eagerLoadCteArr

    if (eagerLoad) {
        mergeRelationsScope(relationsWiki, eagerLoad)
        relationsWiki = deproxifyScopeProxy(relationsWiki, true)
        const columnObj = generateColumnObj(relationsWiki)
        let rootCte = generateRootCte(relationsWiki, columnObj)
        const [aliasedFindMap] = parseFindWiki(relationsWiki, 'b')
        eagerLoadCteArr = generateEagerLoadCTEsArr(aliasedFindMap, columnObj, sqlClient)
        let queryStr = flatFilteredCte + `, ` + rootCte + `, ` + eagerLoadCteArr.join(`, `)
        if (sqlClient === `postgresql`) queryStr += ` SELECT json FROM selected_cte`
        else queryStr += ` SELECT * FROM selected_cte`

        return [queryStr, relationsWiki]
    }
    else {
        relationsWiki = deproxifyScopeProxy(relationsWiki, true)
        relationsWiki.alias = `b1`
        const columnObj = generateColumnObj(findWiki, false)
        let rootCte = generateRootCte(findWiki, columnObj)
        let queryStr = flatFilteredCte + `, ` + rootCte
        return [queryStr + ` SELECT * FROM root_cte`, relationsWiki]
    }
}

function generateFlatFilteredCte(findWiki, joinStatements, whereStatements, queryStr = ``) {
    queryStr += `SELECT DISTINCT ${findWiki.alias}.id FROM ${nonSnake2Snake(findWiki.className)} a1 `
    if (joinStatements.length) queryStr += joinStatements.join(` `) + ` `
    if (whereStatements.length) queryStr += `WHERE (` + whereStatements.join(`) AND (`) + `) `
    return `WITH root_ids AS (${queryStr})`
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

    let columnNamingStr = ``
    for (const [index, arr] of snakeCasedColumnNames2dArr.entries())
        columnNamingStr += arr.map(name => `b${index + 1}.${name} AS b1_${name}`).join(`, `) + `, `

    let cteStr = `root_cte AS (SELECT ${columnNamingStr.slice(0, -2)} FROM root_ids r JOIN ${nonSnake2Snake(findWiki.className)} ${aliasBase}1 ON ${aliasBase}1.id = r.id`
    if (findWiki.parent) return cteStr + ` ` + joinStatements.join(` `) + `)`
    else return cteStr + `)`
}


function generateEagerLoadCTEsArr(findWiki, columnObj, sqlClient) {
    if (sqlClient === "postgresql") return eagerLoadCTEsPostgres(findWiki, [], true)
    else return eagerLoadCTEsSqlite(findWiki, columnObj)
}


function generateColumnObj(findWiki, relationalRecusrion = true, columnObj = {}) {
    const className = findWiki.className
    if (columnObj[className]) return

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
