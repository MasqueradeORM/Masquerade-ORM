// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { coloredBackgroundConsoleLog, nonSnake2Snake } from "../../misc/miscFunctions.js"
import { logSuccessfulSave } from "../save.js"

export function sqliteSaveQuery({
    deletedUnloadedRelations,
    classesQueryObj,
    junctionsQueryObj,
    deletedInstances,
    dbConnection
}) {
    let errMsg
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
            errMsg = e
            return false
        }
    }

    let visitedTables = []
    dbConnection.exec('BEGIN;')

    if (deletedUnloadedRelations) {
        for (const [tableName, idObj] of Object.entries(deletedUnloadedRelations)) {
            const { idType, params: idArr } = idObj
            const queryStr = `DELETE FROM "${tableName}" WHERE joining_id IN (${idArr.map(id => `?`).join(`, `)})`
            if (!queryFuncWithTryCatch(queryStr, idArr)) throw (errMsg)
        }
    }

    for (const tableName of classTableNames) {
        if (visitedTables.includes(tableName)) continue
        const queryObj = classesQueryObj[tableName]

        visitedTables = queryObj.parent
            ? sqliteHandleAncestry(tableName, queryObj, visitedTables, classesQueryObj, queryFuncWithTryCatch)
            : executeSave(queryObj, tableName, visitedTables, queryFuncWithTryCatch)
        if (!visitedTables) throw (errMsg)
    }

    const junctionTableQueryObjects = Object.values(junctionsQueryObj ?? {})
    for (const queryObj of junctionTableQueryObjects) {

        if (queryObj.deleteRelationsObj) {
            const { queryStr, params } = queryObj.deleteRelationsObj
            if (!queryFuncWithTryCatch(queryStr, params)) throw (errMsg)
        }

        if (queryObj.insertRelationsObj) {
            const { queryStr, params } = queryObj.insertRelationsObj
            if (!queryFuncWithTryCatch(queryStr, params)) throw (errMsg)
        }
    }

    if (deletedInstances) {
        for (const [tableName, deletedIds] of Object.entries(deletedInstances)) {
            const placeholders = deletedIds.map(id => `?`)
            const queryStr = `DELETE FROM "${tableName}" WHERE id IN (${placeholders.join(',')});`
            if (!queryFuncWithTryCatch(queryStr, deletedIds)) throw (errMsg)
        }
    }

    dbConnection.exec('COMMIT;')
    logSuccessfulSave()
}


function executeSave(queryObj, tableName, visitedTables, queryFuncWithTryCatch) {
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
        const queryRes = executeSave(queryObj, tableName, visitedTables, queryFuncWithTryCatch)
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
        const queryRes = executeSave(currentQueryObj, ancestorTableName, visitedTables, queryFuncWithTryCatch)
        if (queryRes) visitedTables = queryRes
        else return false
    }
    return visitedTables
}


export function junctionTableRemovalSqlite(removedIds, tableName) {
    const snakedTableName = nonSnake2Snake(tableName)
    let queryStr = ``
    const params = []

    queryStr = `DELETE FROM "${snakedTableName}" WHERE (joining_id, joined_id) IN (`
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