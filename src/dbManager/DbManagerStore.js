// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

export class DbManagerStore {
    /**
     * Dictionary of tableName -> columnNames[] to drop
     * @type {Record<string, string[]>}
     */
    static dropColumnsDict = {}

    /**
     * Entity tables to delete
     * @type {string[]}
     */
    static deleteTables = []

    /**
     * Junction tables to delete
     * @type {string[]}
     */
    static deleteJunctions = []
}
