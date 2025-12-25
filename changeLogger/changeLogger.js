import { OrmStoreSymb } from "../misc/constants.js"
import { handleRelationalChanges, handleUpserts, organizeChangeObj } from "./save.js"
import { postgresSaveQuery } from "./sqlClients/postgres.js"
import { sqliteSaveQuery } from "./sqlClients/sqlite.js"

export class ChangeLogger {
  static scheduledFlush = false
    static flushChanges() {
        const dbChangesObj = globalThis[OrmStoreSymb].dbChangesObj
        if (!Object.keys(dbChangesObj).length || this.scheduledFlush) return
        console.log("flush called")
        // let success = false
        this.scheduledFlush = true
        const func = async () => {
            await ChangeLogger.save(dbChangesObj)
            //  success = await save(dbChangesObj)
            // if (success) this.scheduledFlush = false
            // this[dbChangesObj] = {}
            // if (success) this[dbChangesSymb] = {}
        }



        // setImmediate(func)
        // console.log("setImmediate triggered")


        // queueMicrotask(async () => {
        //   console.log('in microtask')
        //   success = await save(this[dbChangesSymb])
        //   console.log(`success = ${success}`)
        //   this.scheduledFlush = false
        //   if (success) this[dbChangesSymb] = {}
        // })
    }


    static async save(/**@type {any}*/ dbChanges = null) {
        if (!dbChanges) dbChanges = globalThis[OrmStoreSymb].dbChangesObj
        else if (!Object.keys(dbChanges).length) return false
        else console.log("flush save")

        let paramIndex = 1
        const { sqlClient, dbConnection } = globalThis[OrmStoreSymb]
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

