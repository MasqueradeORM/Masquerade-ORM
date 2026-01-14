import { coloredBackgroundConsoleLog, nonSnake2Snake } from "../../misc/miscFunctions.js"
import { successfullSaveOperation } from "../save.js"

export async function postgresSaveQuery(deletedUncalledRelationsArr, classesQueryObj, junctionsQueryObj, deletedInstancesArr, paramIndex, dbConnection) {
    let i = 0
    let finalString = 'WITH'
    const finalParams = []
    paramIndex = 1

    let queryFunc = dbConnection.query.bind(dbConnection)
    let queryFuncWithTryCatch = async (query, params, forDeletedUncalledRelations = false) => {
        try {
            await queryFunc(query, params)
            if (!forDeletedUncalledRelations) successfullSaveOperation()
        }
        catch (e) {
            coloredBackgroundConsoleLog(`Database save failed. ${e}\n`, `failure`)
        }
    }

    if (deletedUncalledRelationsArr) {
        const paramsArr = []
        let finalString = 'WITH'
        for (const [tableName, { idType, params }] of Object.entries(deletedUncalledRelationsArr)) {
            const queryStr = `DELETE FROM ${tableName} WHERE joining_id =  ANY($${paramIndex++}::${idType}[])`
            finalString += ` cte${i++} AS (` + queryStr + `), `
            paramsArr.push(params)
        }
        await queryFuncWithTryCatch(finalString.slice(0, -2) + ` SELECT 1`, paramsArr, true)
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
        if (junctionObj.newRelationsObj) {
            finalString += ` cte${i++} AS (` + junctionObj.newRelationsObj.queryStr + `), `
            finalParams.push(...junctionObj.newRelationsObj.params)
        }

        if (junctionObj.deletedRelationsObj) {
            finalString += ` cte${i++} AS (` + junctionObj.deletedRelationsObj.queryStr + `), `
            finalParams.push(...junctionObj.deletedRelationsObj.params)
        }
    }

    if (deletedInstancesArr) {
        paramIndex = finalParams.length + 1
        for (const [tableName, param] of deletedInstancesArr) {
            const queryStr = `DELETE FROM ${tableName} WHERE id = $${paramIndex++}`
            finalString += ` cte${i++} AS (` + queryStr + `), `
            finalParams.push(param)
        }
    }

    finalString = finalString.slice(0, -2) + ` SELECT 1`
    await queryFuncWithTryCatch(finalString, finalParams)
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