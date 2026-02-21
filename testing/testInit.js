// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { ORM } from "../index.js"
import { DatabaseSync } from 'node:sqlite'
import { Pool } from 'pg'
/**@typedef {import('../index.js').OrmConfigObj} OrmConfigObj */


export function createConfigObj(client, /**@type {undefined | string}*/ dbPaswword = undefined) {
    if (client === `sqlite`) return {
        dbConnection: new DatabaseSync('test'),
        idTypeDefault: "INT"
    }

    return {
        dbConnection: new Pool({
            user: 'postgres',                   // e.g., 'postgres'
            host: 'localhost',                 // database host
            database: 'masquerade-test',      // database name
            password: `${dbPaswword}`,           // your password
            port: 5432,                     // default PostgreSQL port
        }),
        idTypeDefault: "INT"
    }
}

export async function initORM(configObj, ...classes) {
    await ORM.javascriptBoot(configObj, ...classes)
}

export async function resetPostgresDb(pool) {
    await pool.query(
        `DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;`
    )
}
