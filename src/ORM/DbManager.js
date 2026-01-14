import { OrmStore } from "../misc/ormStore.js"

export class DbManager {

    /**
    * Can be given an entity table name to delete unused columns in, otherwise will delete all unused columns across all entity tables.
    */
    static async dropUnusedColumns(/**@type {string | undefined}*/ tableName = undefined) {
        const queryFunc = getQueryFunc(false)
        const queryStrGenerator = (tableName, columnName) => `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`
        const columnDroppingDict = DbManagerStore.dropColumnsDict
        if (tableName) {
            const droppedColumnNames = columnDroppingDict[tableName]
            for (const columnName of droppedColumnNames) {
                const queryStr = queryStrGenerator(tableName, columnName)
                await queryFunc(queryStr)
            }
        }
        else {
            for (const [tableName, droppedColumnNames] of Object.entries(columnDroppingDict)) {
                for (const columnName of droppedColumnNames) {
                    const queryStr = queryStrGenerator(tableName, columnName)
                    await queryFunc(queryStr)
                }
            }
        }
    }

    /**
    * Can be given an entity table name to delete, otherwise will delete all unused entity tables.
    */
    static async dropUnusedTables(/**@type {string | undefined}*/ tableName = undefined) {
        const tableNameArr = tableName ? [tableName] : DbManagerStore.deleteTables
        if (!tableNameArr.length) return
        await dropTables(tableNameArr)
    }

    /**
    * Can be given a junction table name to delete, otherwise will delete all unused junction tables.
    */
    static async dropUnusedJunctions(/**@type {string | undefined}*/ tableName = undefined) {
        const junctionNameArr = tableName ? [tableName] : DbManagerStore.deleteJunctions
        if (!junctionNameArr.length) return
        await dropTables(junctionNameArr)
    }
}

async function dropTables(tableNameArr) {
    const queryFunc = getQueryFunc()
    if (!tableNameArr.length) return
    await queryFunc(tableNameArr)
}

function getQueryFunc(dropTables = true) {
    const { sqlClient, dbConnection } = OrmStore.store
    if (dropTables) {
        const queryFunc = sqlClient === `postgresql`
            ? async (junctionNameArr) => await dbConnection.query(`DROP TABLE IF EXISTS ${junctionNameArr.join(`, `)}`)
            : (junctionNameArr) => {
                for (const junctionName of junctionNameArr) dbConnection.exec(`DROP TABLE IF EXISTS ${junctionName}`)
            }
        return queryFunc
    }

    const queryFunc = sqlClient === `postgresql`
        ? dbConnection.query.bind(dbConnection)
        : dbConnection.exec.bind(dbConnection)
    return queryFunc
}

export class DbManagerStore {
    static dropColumnsDict = {}
    static deleteTables = []
    static deleteJunctions = []
}

