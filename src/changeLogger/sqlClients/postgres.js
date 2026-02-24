// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { coloredBackgroundConsoleLog, nonSnake2Snake } from "../../misc/miscFunctions.js"
import { logSuccessfulSave } from "../save.js"

export async function postgresSaveQuery({
    deletedUnloadedRelations,
    classesQueryObj,
    junctionsQueryObj,
    deletedInstances,
    dbConnection,
    paramIndex
}) {
    let i = 0
    let finalString = 'WITH'
    const finalParams = []
    paramIndex = 1
    let errMsg
    let queryFunc = dbConnection.query.bind(dbConnection)
    let queryFuncWithTryCatch = async (query, params, forDeletedUncalledRelations = false) => {
        try {
            await queryFunc(query, params)
            if (!forDeletedUncalledRelations) logSuccessfulSave()
        }
        catch (e) {
            coloredBackgroundConsoleLog(`Database save failed. ${e}\n`, `failure`)
            errMsg = e
        }
    }

    if (deletedUnloadedRelations) {
        const paramsArr = []
        let finalString = 'WITH'
        for (const [tableName, { idType, params: ids }] of Object.entries(deletedUnloadedRelations)) {
            const queryStr = `DELETE FROM ${tableName} WHERE joining_id = ANY($${paramIndex++}::${idType}[])`
            finalString += ` cte${i++} AS (` + queryStr + `), `
            paramsArr.push(ids)
        }
        await queryFuncWithTryCatch(finalString.slice(0, -2) + ` SELECT 1`, paramsArr, true)
        if (errMsg) throw (errMsg)
    }

    for (const upsertObj of Object.values(classesQueryObj)) {
        if (upsertObj.insert) {
            finalString += ` cte${i++} AS (` + upsertObj.insert.queryStr + `), `
            finalParams.push(...upsertObj.insert.params)
        }
        if (upsertObj.update) {
            finalString += upsertObj.update.queryStrArr.map((queryStr) => ` cte${i++} AS (${queryStr})`).join(', ') + `, `
            finalParams.push(...upsertObj.update.params2dArr.flat())
        }
    }

    for (const junctionObj of Object.values(junctionsQueryObj)) {
        if (junctionObj.insertRelationsObj) {
            finalString += ` cte${i++} AS (` + junctionObj.insertRelationsObj.queryStr + `), `
            finalParams.push(...junctionObj.insertRelationsObj.params)
        }

        if (junctionObj.deleteRelationsObj) {
            finalString += ` cte${i++} AS (` + junctionObj.deleteRelationsObj.queryStr + `), `
            finalParams.push(...junctionObj.deleteRelationsObj.params)
        }
    }

    if (deletedInstances) {
        paramIndex = finalParams.length + 1
        for (const [tableName, deletedIds] of Object.entries(deletedInstances)) {
            const queryStr = `DELETE FROM ${tableName} WHERE id = ANY($${paramIndex++})`
            finalString += ` cte${i++} AS (` + queryStr + `), `
            finalParams.push(deletedIds)
        }
    }

    finalString = finalString.slice(0, -2) + ` SELECT 1`
    await queryFuncWithTryCatch(finalString, finalParams)
    if (errMsg) throw (errMsg)
}


function getPostgresIdTypeCasting(idType) {
    if (idType === `string`) return `::uuid`
    else if (idType === `number`) return `::int`
    else return `::bigint`
}


export function junctionTableRemovalPostgres(removedIds, tableName, paramIndex, idTypeArr) {
    const snakedTableName = nonSnake2Snake(tableName)
    let queryStr = ``
    const params = []

    const [joiningIdTypeCast, joinedIdTypeCast] = [getPostgresIdTypeCasting(idTypeArr[0]), getPostgresIdTypeCasting(idTypeArr[1])]
    queryStr = `DELETE FROM ${snakedTableName} AS jt USING (VALUES`
    for (const idPairings of removedIds) {
        const joiningId = idPairings[0]
        const removedJoinedIds = idPairings[1]
        for (const removedId of removedJoinedIds) {
            queryStr += `($${paramIndex++}${joiningIdTypeCast}, $${paramIndex++}${joinedIdTypeCast}), `
            params.push(joiningId, removedId)
        }
    }
    queryStr = queryStr.slice(0, -2) + `) AS to_delete(joining_id, joined_id) `
    queryStr += `WHERE jt.joining_id = to_delete.joining_id AND jt.joined_id = to_delete.joined_id `
    queryStr += `RETURNING 1`

    const returnedJunctionObj = { queryStr, params }
    return [returnedJunctionObj, paramIndex]
}