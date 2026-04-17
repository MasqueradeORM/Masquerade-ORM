// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { newEntityInstanceSymb } from "../misc/constants.js"
import { coloredBackgroundConsoleLog, getJunctionName, getPropertyClassification, jsValue2SqliteValue, nonSnake2Snake } from "../misc/miscFunctions.js"
import { OrmStore } from "../misc/ormStore.js"
import { junctionTableRemovalPostgres } from "./sqlClients/postgres.js"
import { junctionTableRemovalSqlite } from "./sqlClients/sqlite.js"

const idTypeSymb = Symbol(`idType`)

export function logSuccessfulSave() {
   coloredBackgroundConsoleLog(`Save ran successfully.\n`, `success`)
}

export function relogFailedChanges(failedChanges) {
   const { dbChangesObj } = OrmStore.store
   for (const [key, data2Merge] of Object.entries(failedChanges)) {
      if (dbChangesObj[key]) {
         const obj2Merge2 = dbChangesObj[key]
         if (key === '$deletedUnloadedRelations') {
            for (const [tableName, { idType, params: ids }] of Object.entries(data2Merge)) {
               const target = obj2Merge2[tableName]
               if (target) target.params.push(...ids)
               else obj2Merge2[tableName] = { idType, params: ids }
            }
         }
         else if (key === '$deletedInstances') {
            for (const [tableName, ids] of Object.entries(data2Merge)) {
               const target = obj2Merge2[tableName]
               if (target) target.push(...ids)
               else obj2Merge2[tableName] = ids
            }
         }
         else {
            for (const [tableName, instanceLoggers] of Object.entries(data2Merge)) {
               const classChanges = obj2Merge2[tableName]
               if (classChanges) {
                  const classWiki = OrmStore.getClassWiki(tableName)
                  for (const [instanceId, changes2Merge] of Object.entries(instanceLoggers)) {
                     if (classChanges[instanceId]) mergeFailedChanges(changes2Merge, classChanges[instanceId], classWiki)
                     else classChanges[instanceId] = changes2Merge
                  }
               }
               else obj2Merge2[tableName] = instanceLoggers
            }
         }
      }
      else dbChangesObj[key] = data2Merge
   }
}

function mergeFailedChanges(changes2Merge, target4Merge, classWiki) {
   for (const [prop, changes] of Object.entries(changes2Merge)) {
      if (target4Merge[prop]) {
         const [classification, ...rest] = getPropertyClassification(prop, classWiki)
         if (classification === 'Primitive' || classification === 'ParentPrimitive') continue
         else {
            const { add: targetAdd, remove: targetRemove } = target4Merge[prop]
            const { add, remove } = changes
            for (const id in add) {
               if (targetRemove[id]) delete targetRemove[id]
               else targetAdd[id] = true
            }

            for (const id in remove) {
               if (targetAdd[id]) delete targetAdd[id]
               else targetRemove[id] = true
            }
         }
      }
      else target4Merge[prop] = changes
   }
}

function expandBuffer(arr, lengthAdded) {
   arr.length += lengthAdded
   return arr
}

function passEntityColumns2AncestorMaps(id, instanceChangeObj, classWiki, cteDict, client) {
   cteDict.tables ??= {}
   const baseClassCteMap = cteDict.tables[classWiki.className] ??= {}
   baseClassCteMap[id] = { id }
   let currentWiki = classWiki
   while (currentWiki.parent) {
      const classCteMap = cteDict.tables[currentWiki.parent.className] ??= {}
      classCteMap[id] ??= { id }
      classCteMap[id][newEntityInstanceSymb] = instanceChangeObj[newEntityInstanceSymb]
      currentWiki = currentWiki.parent ?? currentWiki
   }
   const updatedAt = instanceChangeObj.updatedAt
   cteDict.tables[currentWiki.className][id].updatedAt = client === "postgres" ? updatedAt : updatedAt.toISOString()
}

export function handleRelationalChanges(tableName, tableChangesObj, queryObj, paramIndex, sqlClient) {
  /**@type {any}*/ const target = queryObj[tableName] = {}
   const categorizedIds = { add: {}, remove: {} }
   const {
      joinindIdType,
      joinedIdType,
      joiningIdUnique
   } = tableChangesObj[idTypeSymb]

   for (const [baseEntityId, ids2AddAndRemove] of Object.entries(tableChangesObj)) {
      if (ids2AddAndRemove.add) categorizedIds.add[baseEntityId] = Object.keys(ids2AddAndRemove.add)
      if (ids2AddAndRemove.remove) categorizedIds.remove[baseEntityId] = Object.keys(ids2AddAndRemove.remove)
   }

   let addedIds = Object.entries(categorizedIds.add)
   let removedIds = Object.entries(categorizedIds.remove)

   addedIds = addedIds.map(([joiningId, joinedIdArr]) => [typecastStringId(joiningId, joinindIdType), joinedIdArr])
   removedIds = removedIds.map(([joiningId, joinedIdArr]) => [typecastStringId(joiningId, joinindIdType), joinedIdArr])

   if (addedIds.length) [target.insertRelationsObj, paramIndex] = junctionTableInsertion(addedIds, tableName, joiningIdUnique, paramIndex, sqlClient)
   if (removedIds.length) [target.deleteRelationsObj, paramIndex] = sqlClient === `postgres`
      ? junctionTableRemovalPostgres(removedIds, tableName, paramIndex, [joinindIdType, joinedIdType])
      : junctionTableRemovalSqlite(removedIds, tableName)
   return paramIndex
}

function junctionTableInsertion(addedIds, tableName, joiningIdUnique, paramIndex, sqlClient) {
   const snakedTableName = nonSnake2Snake(tableName)
   let queryStr = `INSERT INTO "${snakedTableName}" (joining_id, joined_id) VALUES `
   const params = []
   for (const [joiningId, joinedIds] of addedIds) {
      while (joinedIds.length) {
         queryStr += sqlClient === "postgres" ? `($${paramIndex++}, $${paramIndex++}), ` : `(?, ?), `
         params.push(joiningId, joinedIds.pop())
      }
   }
   queryStr = queryStr.slice(0, -2)
   if (joiningIdUnique) queryStr += ` ON CONFLICT(joining_id) DO NOTHING`
   else queryStr += ` ON CONFLICT(joining_id, joined_id) DO NOTHING`
   if (sqlClient === "postgres") queryStr += ` RETURNING 1`

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
      if (Object.keys(instance).length === 1) continue
      if (instance[newEntityInstanceSymb]) inserts.push(instance)
      else updates.push(instance)
   }

   if (inserts.length) paramIndex = insertNewRows(inserts, tableName, queryObj, paramIndex, sqlClient)
   if (updates.length) paramIndex = updateRows(updates, tableName, queryObj, paramIndex, sqlClient)
   return paramIndex
}

export function typecastStringId(instanceId, idType) {
   if (idType === `number`) return parseInt(instanceId, 10)
   return instanceId
}

function insertNewRows(newRows, tableName, queryObj, paramIndex, client) {
  /**@type {any}*/ const target = queryObj[tableName].insert = { queryStr: ``, params: [] }
   const snakedTableName = nonSnake2Snake(tableName)
   const classWiki = OrmStore.store.classWikiDict[tableName]
   const columns = Object.keys(classWiki.columns)

   if (classWiki.parent) queryObj[tableName].parent = classWiki.parent.className

   target.params = expandBuffer(target.params, newRows.length * columns.length)
   let i = 0
   let queryStr = `INSERT INTO "${snakedTableName}" (${columns.map(column => nonSnake2Snake(column)).join(', ')}) VALUES `

   for (const instance of newRows) {
      if (client === "postgres") queryStr += `(${columns.map(column => `$${paramIndex++}`).join(', ')}), \n`
      else queryStr += `(${columns.map(column => `?`).join(', ')}), \n`

      for (const column of columns) target.params[i++] = instance[column]
   }

   if (client === "postgres") target.queryStr = queryStr.slice(0, -3) + ` RETURNING 1`
   else target.queryStr = queryStr.slice(0, -3)
   return paramIndex
}

function updateRows(updatedRows, tableName, queryObj, paramIndex, client) {
  /**@type {any}*/ const target = queryObj[tableName].update = { queryStrArr: [], params2dArr: [] }
   const snakedTableName = nonSnake2Snake(tableName)
   const idType = OrmStore.getClassWiki(tableName).columns.id.type

   for (const row of updatedRows) {
      let rowId = row.id
      delete row.id
      const updatedColumns = Object.entries(row)
      //if (!updatedColumns.length) continue
      rowId = typecastStringId(rowId, idType)
      let queryStr = ``
      let params = []

      queryStr += `UPDATE "${snakedTableName}" SET `
      for (const [columnName, val] of updatedColumns) {
         if (client === "postgres") queryStr += `${nonSnake2Snake(columnName)} = $${paramIndex++}, `
         else queryStr += `${nonSnake2Snake(columnName)} = ?, `

         params.push(val)
      }
      if (client === "postgres") queryStr = queryStr.slice(0, -2) + ` WHERE id = $${paramIndex++} RETURNING 1`
      else queryStr = queryStr.slice(0, -2) + ` WHERE id = ?`

      params.push(rowId)
      target.queryStrArr.push(queryStr)
      target.params2dArr.push(params)
   }
   return paramIndex
}

export function organizeChangeObj(dbChanges, cteDict, client) {
   const classNames = Object.keys(dbChanges)

   for (const className of classNames) {
      const tableChangeObj = dbChanges[className]
      const classWiki = OrmStore.getClassWiki(className)
      const propClassificationDict = {}
      for (const [instanceId, instanceChangeObj] of Object.entries(tableChangeObj)) {
         let properties = Object.keys(instanceChangeObj)

         if (classWiki.parent) {
            passEntityColumns2AncestorMaps(instanceId, instanceChangeObj, classWiki, cteDict, client)
            properties = properties.filter(prop => prop !== "id" && prop !== "updatedAt")
         }

         for (const property of properties) {
            if (!propClassificationDict[property]) {
               propClassificationDict[property] = getPropertyClassification(property, classWiki)
            }
            const [classification, columnType, mapWithProp] = propClassificationDict[property]

            if (classification === "Join" || classification === "ParentJoin") {
               const add = Object.keys(instanceChangeObj[property].add)
               const remove = Object.keys(instanceChangeObj[property].remove)
               if (!add.length && !remove.length) continue

               const junctionTableName = getJunctionName(nonSnake2Snake(mapWithProp.className), nonSnake2Snake(property))
               

               cteDict.junctions ??= {}
               const tableLog = cteDict.junctions[junctionTableName] ??= {}
               tableLog[idTypeSymb] = {
                  joinindIdType: mapWithProp.columns.id.type,
                  joinedIdType: columnType.columns.id.type,
                  joiningIdUnique: !columnType.isArray
               }

               if (add.length) {
                  tableLog[instanceId] ??= {}
                  tableLog[instanceId].add = instanceChangeObj[property].add
               }
               if (remove.length) {
                  tableLog[instanceId] ??= {}
                  tableLog[instanceId].remove = instanceChangeObj[property].remove
               }
            }
            else {
               const tableName = mapWithProp.className
               cteDict.tables ??= {}
               const tableLog = cteDict.tables[tableName] ??= {}
               const instanceLog = tableLog[instanceId] ??= {}
               //tableLog[idTypeSymb] = [mapWithProp.columns.id.type, columnType.type]

               if (client === "postgres") instanceLog[property] = instanceChangeObj[property]
               else {
                  const value = instanceChangeObj[property]
                  instanceLog[property] = jsValue2SqliteValue(value)
               }
               instanceLog[newEntityInstanceSymb] = instanceChangeObj[newEntityInstanceSymb] ? true : false
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