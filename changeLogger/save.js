import { newEntityInstanceSymb, OrmStoreSymb } from "../misc/constants.js"
import { coloredBackgroundConsoleLog, getPropertyClassification, jsValue2SqliteValue, nonSnake2Snake } from "../misc/miscFunctions.js"
import { ChangeLogger } from "./changeLogger.js"
import { junctionTableRemovalPostgres } from "./sqlClients/postgres.js"
import { junctionTableRemovalSqlite } from "./sqlClients/sqlite.js"

const idTypeSymb = Symbol(`idType`)

export function successfullSaveOperation() {
  coloredBackgroundConsoleLog(`Save ran successfully.\n`, `success`)
  globalThis[OrmStoreSymb].dbChangesObj = {}
  ChangeLogger.scheduledFlush = false
}

function expandBuffer(arr, lengthAdded) {
  arr.length += lengthAdded
  return arr
}

function passEntityColumnsToAncestorMaps(id, entityInstanceChangeObj, classWiki, cteMap, client) {
  const isNewEntityInstance = entityInstanceChangeObj[newEntityInstanceSymb] ? true : false
  cteMap.tables ??= {}
  const baseClassCteMap = cteMap.tables[classWiki.className] ??= {}
  baseClassCteMap[id] = { id }
  let currentWiki = classWiki
  while (currentWiki.parent) {
    const classCteMap = cteMap.tables[currentWiki.parent.className] ??= {}
    classCteMap[id] ??= { id }
    classCteMap[id][newEntityInstanceSymb] = isNewEntityInstance
    currentWiki = currentWiki.parent ?? currentWiki
  }
  cteMap.tables[currentWiki.className][id].updatedAt = client === "postgresql" ? new Date() : new Date().toISOString()
}

export function handleRelationalChanges(tableName, tableChangesObj, queryObj, paramIndex, sqlClient) {
  /**@type {any}*/ const target = queryObj[tableName] = {}
  const categorizedIds = { added: {}, removed: {} }
  const entries = Object.entries(tableChangesObj)
  const idTypeArr = tableChangesObj[idTypeSymb]

  for (const [baseEntityId, addedAndRemovedIds] of entries) {
    if (addedAndRemovedIds.added) {
      categorizedIds.added[baseEntityId] = []
      for (const addedJoinId of addedAndRemovedIds.added) categorizedIds.added[baseEntityId].push(addedJoinId)
    }
    if (addedAndRemovedIds.removed) {
      categorizedIds.removed[baseEntityId] = []
      for (const removedJoinId of addedAndRemovedIds.removed) categorizedIds.removed[baseEntityId].push(removedJoinId)
    }
  }

  let addedIds = Object.entries(categorizedIds.added)
  let removedIds = Object.entries(categorizedIds.removed)

  addedIds = addedIds.map(([joiningId, joinedIdArr]) => [typeIdObjectKey(joiningId, idTypeArr[0]), joinedIdArr])
  removedIds = removedIds.map(([joiningId, joinedIdArr]) => [typeIdObjectKey(joiningId, idTypeArr[0]), joinedIdArr])

  if (addedIds.length) [target.newRelationsObj, paramIndex] = junctionTableInsertion(addedIds, tableName, paramIndex, sqlClient)
  if (removedIds.length) [target.deletedRelationsObj, paramIndex] = sqlClient === `postgresql`
    ? junctionTableRemovalPostgres(removedIds, tableName, paramIndex, idTypeArr)
    : junctionTableRemovalSqlite(removedIds, tableName)
  return paramIndex
}

function junctionTableInsertion(addedIds, tableName, paramIndex, sqlClient) {
  const snakedTableName = nonSnake2Snake(tableName)
  let queryStr = `INSERT INTO ${snakedTableName} (joining_id, joined_id) VALUES `
  const params = []
  //const [joiningIdTypeCast, joinedIdTypeCast] = [getPostgresIdTypeCasting(idTypeArr[0]), getPostgresIdTypeCasting(idTypeArr[1])]
  for (const baseAndJoinedIds of addedIds) {
    const baseId = baseAndJoinedIds[0]
    const joinedIds = baseAndJoinedIds[1]
    while (joinedIds.length) {
      queryStr += sqlClient === "postgresql" ? `($${paramIndex++}, $${paramIndex++}), ` : `(?, ?), `
      params.push(baseId, joinedIds.pop())
    }
  }
  queryStr = queryStr.slice(0, -2)
  if (sqlClient === "postgresql") queryStr += ` RETURNING 1`

  const returnedJunctionObj = { queryStr, params }
  return [returnedJunctionObj, paramIndex]
}


export function handleUpserts(tableName, classChangesObj, queryObj, paramIndex, sqlClient) {
  const classInstances = Object.entries(classChangesObj)
  const inserts = []
  const updates = []
  queryObj[tableName] ??= {}
  while (classInstances.length) {
    //@ts-ignore
    const [instanceId, instance] = classInstances.pop()
    if (instance[newEntityInstanceSymb]) inserts.push(instance)
    else updates.push(instance)
  }

  if (inserts.length) paramIndex = insertNewRows(inserts, tableName, queryObj, paramIndex, sqlClient)
  if (updates.length) paramIndex = updateRows(updates, tableName, queryObj, paramIndex, sqlClient)
  return paramIndex
}

export function typeIdObjectKey(instanceId, idType) {
  if (idType === `number`) return parseInt(instanceId, 10)
  return instanceId
}

function insertNewRows(newRows, tableName, queryObj, paramIndex, client) {
  /**@type {any}*/ const target = queryObj[tableName].insert = { queryStr: ``, params: [] }
  const snakedTableName = nonSnake2Snake(tableName)
  const classWiki = globalThis[OrmStoreSymb].classWikiDict[tableName]
  const columns = Object.keys(classWiki.columns)

  if (classWiki.parent) queryObj[tableName].parent = classWiki.parent.className

  target.params = expandBuffer(target.params, newRows.length * columns.length)
  let i = 0
  let queryStr = `INSERT INTO ${snakedTableName} (${columns.map(column => nonSnake2Snake(column)).join(', ')}) VALUES `

  for (const instance of newRows) {
    if (client === "postgresql") queryStr += `(${columns.map(column => `$${paramIndex++}`).join(', ')}), \n`
    else queryStr += `(${columns.map(column => `?`).join(', ')}), \n`

    for (const column of columns) target.params[i++] = instance[column]
  }

  if (client === "postgresql") target.queryStr = queryStr.slice(0, -3) + ` RETURNING 1`
  else target.queryStr = queryStr.slice(0, -3)
  return paramIndex
}

function updateRows(updatedRows, tableName, queryObj, paramIndex, client) {
  /**@type {any}*/ const target = queryObj[tableName].update = { queryStrArr: [], params2dArr: [] }
  const snakedTableName = nonSnake2Snake(tableName)

  for (const row of updatedRows) {
    let queryStr = ``
    let params = []

    const rowId = row.id
    delete row.id
    const updatedColumns = Object.entries(row)
    queryStr += `UPDATE ${snakedTableName} SET `
    for (const [columnName, val] of updatedColumns) {
      if (client === "postgresql") queryStr += `${nonSnake2Snake(columnName)} = $${paramIndex++}, `
      else queryStr += `${nonSnake2Snake(columnName)} = ?, `

      params.push(val)
    }
    if (client === "postgresql") queryStr = queryStr.slice(0, -2) + ` WHERE id = $${paramIndex++} RETURNING 1`
    else queryStr = queryStr.slice(0, -2) + ` WHERE id = ?`

    params.push(rowId)
    target.queryStrArr.push(queryStr)
    target.params2dArr.push(params)
  }
  return paramIndex
}

export function organizeChangeObj(dbChanges, cteMap, client) {
  const classNames = Object.keys(dbChanges)

  for (const className of classNames) {
    const tableChangeObj = dbChanges[className]
    const entityChangeObjects = Object.entries(tableChangeObj)

    for (const [instanceId, entityInstanceChangeObj] of entityChangeObjects) {

      const classWiki = globalThis[OrmStoreSymb].classWikiDict[className]
      let properties = Object.keys(entityInstanceChangeObj)

      if (classWiki.parent) {
        passEntityColumnsToAncestorMaps(instanceId, entityInstanceChangeObj, classWiki, cteMap, client)
        properties = properties.filter(prop => prop !== "id" && prop !== "updatedAt")
      }

      for (const property of properties) {
        const [classification, columnType, mapWithProp] = getPropertyClassification(property, classWiki)

        if (classification === "Join" || classification === "ParentJoin") {
          const added = entityInstanceChangeObj[property].added
          const removed = entityInstanceChangeObj[property].removed
          if (!added.length && !removed.length) continue

          const junctionTableName = `${nonSnake2Snake(mapWithProp.className)}___${nonSnake2Snake(property)}_jt`

          cteMap.junctions ??= {}
          const tableCteMap = cteMap.junctions[junctionTableName] ??= {}
          tableCteMap[idTypeSymb] = [mapWithProp.columns.id.type, columnType.columns.id.type]

          if (added.length) {
            tableCteMap[instanceId] ??= {}
            tableCteMap[instanceId].added = entityInstanceChangeObj[property].added
          }
          if (removed.length) {
            tableCteMap[instanceId] ??= {}
            tableCteMap[instanceId].removed = entityInstanceChangeObj[property].removed
          }
        }
        else {
          const tableName = mapWithProp.className
          cteMap.tables ??= {}
          const tableCteMap = cteMap.tables[tableName] ??= {}
          const entityInstanceMap = tableCteMap[instanceId] ??= {}
          //tableCteMap[idTypeSymb] = [mapWithProp.columns.id.type, columnType.type]

          if (client === "postgresql") entityInstanceMap[property] = entityInstanceChangeObj[property]
          else {
            const value = entityInstanceChangeObj[property]
            entityInstanceMap[property] = jsValue2SqliteValue(value)
          }
          entityInstanceMap[newEntityInstanceSymb] = entityInstanceChangeObj[newEntityInstanceSymb] ? true : false
        }
      }
    }
  }
}


// function getPostgresTypeCasting(columnObj) {
//   const { type, isArray } = columnObj
//   let returnedType
//   if (type === `string`) returnedType = `::text`
//   else if (type === `number`) returnedType = `::int`
//   else if (type === `bigint`) returnedType = `::bigint`
//   else if (type === `Date`) returnedType = `::timestamptz`
//   else if (type === `boolean`) returnedType = `::bool`
//   else if (type === `object`) returnedType = `::jsonb`
//   if (isArray && type !== `object`) returnedType += `[]`
//   return returnedType
// }