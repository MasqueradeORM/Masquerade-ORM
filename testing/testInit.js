import { ORM } from "masquerade"
import { DatabaseSync } from 'node:sqlite'
import { Pool } from 'pg'
/**@typedef {import('masquerade').OrmConfigObj} OrmConfigObj */


export function createConfigObj(client) {
    if (client === `sqlite`) return {
        dbConnection: new DatabaseSync('masquerade-test'),
        idTypeDefault: "INT"
    }

    return {
        dbConnection: new Pool({
            user: 'postgres',                   // e.g., 'postgres'
            host: 'localhost',                 // database host
            database: 'masquerade-test',      // database name
            password: '123456789',           // your password
            port: 5432,                     // default PostgreSQL port
        }),
        idTypeDefault: "INT"
    }
}

export async function initPostgresDb(configObj, ...classes) {
    await ORM.javascriptBoot(configObj, ...classes)
}

export async function resetPostgresDb(pool) {
    await pool.query(
        `DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;`
    )
}
