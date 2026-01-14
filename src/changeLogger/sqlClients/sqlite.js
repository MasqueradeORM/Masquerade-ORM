import { coloredBackgroundConsoleLog, nonSnake2Snake } from "../../misc/miscFunctions.js"
import { successfullSaveOperation } from "../save.js"

export function sqliteSaveQuery(deletedUncalledRelationsArr, classesQueryObj, junctionsQueryObj, deletedInstancesArr, dbConnection) {
    const classTableNames = Object.keys(classesQueryObj ?? {})
    const queryFuncWithTryCatch = (queryStr, params) => {
        try {
            const queryFunc = dbConnection.prepare(queryStr)
            queryFunc.run(...params)
            return true
        }
        catch (e) {
            coloredBackgroundConsoleLog(`Database save failed. ${e}\n`, `failure`)
            dbConnection.exec('ROLLBACK;')
            return false
        }
    }

    let visitedTables = []
    dbConnection.exec('BEGIN;')

    if (deletedUncalledRelationsArr) {
        for (const [tableName, idArr] of Object.entries(deletedUncalledRelationsArr)) {
            const queryStr = `DELETE FROM ${tableName} WHERE joining_id IN (${idArr.map(id => `?`).join(`, `)})`
            if (!queryFuncWithTryCatch(queryStr, idArr)) return
        }
    }

    for (const tableName of classTableNames) {
        if (visitedTables.includes(tableName)) continue
        const queryObj = classesQueryObj[tableName]

        visitedTables = queryObj.parent
            ? sqliteHandleAncestry(tableName, queryObj, visitedTables, classesQueryObj, queryFuncWithTryCatch)
            : queryQueryObj(queryObj, tableName, visitedTables, queryFuncWithTryCatch)
        if (!visitedTables) return
    }

    const junctionTableQueryObjects = Object.values(junctionsQueryObj ?? {})
    for (const queryObj of junctionTableQueryObjects) {
        if (queryObj.deletedRelationsObj)
            if (!queryFuncWithTryCatch(queryObj.deletedRelationsObj.queryStr, queryObj.deletedRelationsObj.params)) return

        if (queryObj.newRelationsObj)
            if (!queryFuncWithTryCatch(queryObj.newRelationsObj.queryStr, queryObj.newRelationsObj.params)) return
    }

    if (deletedInstancesArr) {
        for (const [tableName, param] of deletedInstancesArr) {
            const queryStr = `DELETE FROM ${tableName} WHERE id = ?;`
            if (!queryFuncWithTryCatch(queryStr, [param])) return
        }
    }

    dbConnection.exec('COMMIT;')
    successfullSaveOperation()
}


function queryQueryObj(queryObj, tableName, visitedTables, queryFuncWithTryCatch) {
    visitedTables.push(tableName)
    if (queryObj.insert) {
        if (!queryFuncWithTryCatch(queryObj.insert.queryStr, queryObj.insert.params)) return false
    }

    if (queryObj.update) {
        for (const [index, queryStr] of Object.entries(queryObj.update.queryStrArr))
            if (!queryFuncWithTryCatch(queryStr, queryObj.update.params2dArr[index])) return false
    }

    return visitedTables
}

function sqliteHandleAncestry(tableName, queryObj, visitedTables, classesQueryObj, queryFuncWithTryCatch) {
    if (visitedTables.includes(queryObj.parent)) {
        const queryRes = queryQueryObj(queryObj, tableName, visitedTables, queryFuncWithTryCatch)
        if (queryRes) {
            visitedTables = queryRes
            return visitedTables
        }
        return false
    }

    const ancestryArr = [tableName]
    let currentQueryObj = queryObj
    while (currentQueryObj.parent) {
        const parentName = currentQueryObj.parent
        ancestryArr.push(parentName)
        currentQueryObj = classesQueryObj[parentName]
    }

    while (ancestryArr.length) {
        const ancestorTableName = ancestryArr.pop()
        currentQueryObj = classesQueryObj[ancestorTableName]
        const queryRes = queryQueryObj(currentQueryObj, ancestorTableName, visitedTables, queryFuncWithTryCatch)
        if (queryRes) visitedTables = queryRes
        else return false
    }
    return visitedTables
}


export function junctionTableRemovalSqlite(removedIds, tableName) {
    const snakedTableName = nonSnake2Snake(tableName)
    let queryStr = ``
    const params = []

    queryStr = `DELETE FROM ${snakedTableName} WHERE (joining_id, joined_id) IN (`
    for (const idPairings of removedIds) {
        const baseId = idPairings[0]
        const nonBaseIds = idPairings[1]
        for (const removedId of nonBaseIds) {
            queryStr += `(?, ?), `
            params.push(baseId, removedId)
        }
    }
    queryStr = queryStr.slice(0, -2) + `)`
    const returnedJunctionObj = { queryStr, params }
    return [returnedJunctionObj, undefined]
}