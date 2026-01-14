import { OrmStore } from "../misc/ormStore.js"
import { handleRelationalChanges, handleUpserts, organizeChangeObj } from "./save.js"
import { postgresSaveQuery } from "./sqlClients/postgres.js"
import { sqliteSaveQuery } from "./sqlClients/sqlite.js"
import { setImmediate } from "node:timers/promises";

export class ChangeLogger {
    static scheduledFlush = false
    static currentlySaving = false
    static flushChanges() {
        const dbChangesObj = OrmStore.store.dbChangesObj
        if (!Object.keys(dbChangesObj).length || this.scheduledFlush) return
        this.scheduledFlush = true
        const func = async () => await ChangeLogger.save()
        //queueMicrotask(func)
        setImmediate(func)
    }


    static async save() {
        const dbChanges = OrmStore.store.dbChangesObj
        if (!Object.keys(dbChanges).length || ChangeLogger.currentlySaving) return
        // ChangeLogger.currentlySaving = true

        let paramIndex = 1
        const { sqlClient, dbConnection } = OrmStore.store
        const deletedInstancesArr = dbChanges.deletedInstancesArr
        const deletedUncalledRelationsArr = dbChanges.deletedUncalledRelationsArr //this has to fire first
        if (deletedInstancesArr) delete dbChanges.deletedInstancesArr
        if (deletedUncalledRelationsArr) delete dbChanges.deletedUncalledRelationsArr

        const organizedChangeObj = {}
        organizeChangeObj(dbChanges, organizedChangeObj, sqlClient)

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

        if (sqlClient === "postgresql") await postgresSaveQuery(deletedUncalledRelationsArr, classesQueryObj, junctionsQueryObj, deletedInstancesArr, paramIndex, dbConnection)
        else sqliteSaveQuery(deletedUncalledRelationsArr, classesQueryObj, junctionsQueryObj, deletedInstancesArr, dbConnection)
    }
}

