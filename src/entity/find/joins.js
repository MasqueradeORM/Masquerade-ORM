import { nonSnake2Snake } from "../../misc/miscFunctions.js"

export function parentJoin(parentObj, parentAlias, childObj) {
    const childAlias = childObj.alias
    const parentName = nonSnake2Snake(parentObj.className_ ?? parentObj.className)
    return `\nLEFT JOIN ${parentName} ${parentAlias} ON ${parentAlias}.id = ${childAlias}.id`
}

export function junctionJoin(joinedTable, joinedTableAlias, baseTable, junctionPropertyName) {
    const baseTableName = nonSnake2Snake(baseTable.className)
    let baseTableAlias = baseTable.alias
    const joinedTableName = nonSnake2Snake(joinedTable.className_ ?? joinedTable.className)

    const junctionName = `${baseTableName}___${nonSnake2Snake(junctionPropertyName)}_jt`
    const junctionAlias = `jt_${baseTableAlias}_${joinedTableAlias}`

    let queryStr = `\nLEFT JOIN ${junctionName} ${junctionAlias} ON ${baseTableAlias}.id = ${junctionAlias}.joining_id `
    queryStr += ` \nLEFT JOIN ${joinedTableName} ${joinedTableAlias} ON ${junctionAlias}.joined_id = ${joinedTableAlias}.id \n`

    return queryStr
}

export function junctionJoinCte(joinedTable, baseTable, junctionPropertyName, /**@type {string}*/ sqlClient) {
    const baseTableName = nonSnake2Snake(baseTable.className)
    let baseTableAlias = baseTable.alias
    //const joinedTableName = nonSnake2Snake(joinedTable.className)
    const joinedTableAlias = joinedTable.alias

    const junctionName = `${baseTableName}___${nonSnake2Snake(junctionPropertyName)}_jt`
    const junctionAlias = `jt_${baseTableAlias}_${joinedTableAlias}`

    let queryStr = `\nLEFT JOIN ${junctionName} ${junctionAlias} ON ${baseTableAlias}.id = ${junctionAlias}.joining_id `
    if (sqlClient === 'postgresql') queryStr += ` \nLEFT JOIN ${joinedTableAlias}_cte ${joinedTableAlias} ON ${junctionAlias}.joined_id = ${joinedTableAlias}.id \n`
    else queryStr += ` \nLEFT JOIN ${joinedTableAlias}_cte ${joinedTableAlias} ON ${junctionAlias}.joined_id = ${joinedTableAlias}.${joinedTableAlias}_id \n`
    return queryStr
}


export function junctionJoinSelectedCte(joinedTable, baseTable, junctionPropertyName, sqlClient) {
    const baseTableName = nonSnake2Snake(baseTable.className)
    let baseTableAlias = baseTable.alias
    const joinedTableAlias = joinedTable.alias

    const junctionName = `${baseTableName}___${nonSnake2Snake(junctionPropertyName)}_jt`
    const junctionAlias = `jt_${baseTableAlias}_${joinedTableAlias}`

    let queryStr = `\nLEFT JOIN ${junctionName} ${junctionAlias} ON ${baseTableAlias}.${baseTableAlias}_id = ${junctionAlias}.joining_id `

    if (sqlClient === 'postgresql') queryStr += ` \nLEFT JOIN ${joinedTableAlias}_cte ${joinedTableAlias} ON ${junctionAlias}.joined_id = ${joinedTableAlias}.id \n`
    else queryStr += ` \nLEFT JOIN ${joinedTableAlias}_cte ${joinedTableAlias} ON ${junctionAlias}.joined_id = ${joinedTableAlias}.${joinedTableAlias}_id \n`
    return queryStr
}