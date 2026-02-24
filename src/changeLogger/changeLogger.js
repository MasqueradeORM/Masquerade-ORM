// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { nonSnake2Snake } from "../misc/miscFunctions.js"
import { OrmStore } from "../misc/ormStore.js"
import { handleRelationalChanges, handleUpserts, organizeChangeObj, relogFailedChanges } from "./save.js"
import { postgresSaveQuery } from "./sqlClients/postgres.js"
import { sqliteSaveQuery } from "./sqlClients/sqlite.js"
import { setImmediate } from "node:timers/promises"

export class ChangeLogger {
    static scheduledFlush = false
    static flushChanges() {
        const dbChangesObj = OrmStore.store.dbChangesObj
        if (!Object.keys(dbChangesObj).length || this.scheduledFlush) return
        this.scheduledFlush = true
        const func = async () => await ChangeLogger.save()
        //queueMicrotask(func)
        setImmediate(func)
    }


    static async save(/**@type {any}*/ instanceData = undefined) {
        const { dbChangesObj: dbChanges, sqlClient, dbConnection } = OrmStore.store
        if (!Object.keys(dbChanges).length) return
        let changes2Organize
        let $deletedInstances, $deletedUnloadedRelations
        let rethrowOnError = !!instanceData
        /**@type {any}*/ let data4Revert
        if (instanceData) {
            const { classWiki, instanceId } = instanceData
            const className = classWiki.className
            const classChangeObj = dbChanges[className]
            if (!classChangeObj) return
            const instanceLogger = classChangeObj[instanceId]
            if (!instanceLogger) return
            delete classChangeObj[instanceId]
            changes2Organize = {
                [className]: {
                    [instanceId]: instanceLogger
                }
            }
            data4Revert = { ...changes2Organize }
            $deletedUnloadedRelations = dbChanges.$deletedUnloadedRelations
            if ($deletedUnloadedRelations) {
                const deletedUnloadedRelations = {}
                const searchName = nonSnake2Snake(className)
                for (const tableName of Object.keys($deletedUnloadedRelations)) {
                    if (!tableName.startsWith(searchName)) continue
                    const [idType, instanceIds] = $deletedUnloadedRelations[tableName]
                    const index = instanceIds.indexOf(instanceId)
                    if (index === -1) continue
                    instanceIds.splice(index, 1)
                    deletedUnloadedRelations[tableName] = [idType, [instanceId]]
                }
                if (Object.keys(deletedUnloadedRelations).length) {
                    $deletedUnloadedRelations = deletedUnloadedRelations
                    data4Revert.$deletedUnloadedRelations = deletedUnloadedRelations
                }
            }
        }
        else {
            changes2Organize = { ...dbChanges }
            data4Revert = { ...dbChanges }
            OrmStore.clearDbChanges()
            ChangeLogger.scheduledFlush = false;
            ({ $deletedInstances, $deletedUnloadedRelations } = changes2Organize)
            if ($deletedInstances) delete changes2Organize.$deletedInstances
            if ($deletedUnloadedRelations) delete changes2Organize.$deletedUnloadedRelations
        }

        let paramIndex = 1
        const organizedChangeObj = {}
        organizeChangeObj(changes2Organize, organizedChangeObj, sqlClient)

        const entitiesChangeObj = organizedChangeObj.tables ?? {}
        const junctionTablesChangeObj = organizedChangeObj.junctions ?? {}

        const classesQueryObj = {}
        const junctionsQueryObj = {}

        for (const [tableName, classChangesObj] of Object.entries(entitiesChangeObj)) {
            if (!Object.keys(classChangesObj).length) continue
            paramIndex = handleUpserts(tableName, classChangesObj, classesQueryObj, paramIndex, sqlClient)
        }

        for (const [tableName, junctionChangesObj] of Object.entries(junctionTablesChangeObj)) {
            if (!Object.keys(junctionChangesObj).length) continue
            paramIndex = handleRelationalChanges(tableName, junctionChangesObj, junctionsQueryObj, paramIndex, sqlClient)
        }

        const saveContext = {
            deletedUnloadedRelations: $deletedUnloadedRelations,
            classesQueryObj,
            junctionsQueryObj,
            deletedInstances: $deletedInstances,
            dbConnection,
            paramIndex
        }

        try {
            if (sqlClient === "postgres") await postgresSaveQuery(saveContext)
            else sqliteSaveQuery(saveContext)
        }
        catch (err) {
            relogFailedChanges(data4Revert)
            if (rethrowOnError) throw (err)
        }
    }
}

