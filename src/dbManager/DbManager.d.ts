export declare class DbManager {
    /**
     * Can be given an entity table name to delete unused columns in,
     * otherwise will delete all unused columns across all entity tables.
     */
    static dropUnusedColumns(tableName?: string): Promise<void>;

    /**
     * Can be given an entity table name to delete,
     * otherwise will delete all unused entity tables.
     */
    static dropUnusedTables(tableName?: string): Promise<void>;

    /**
     * Can be given a junction table name to delete,
     * otherwise will delete all unused junction tables.
     */
    static dropUnusedJunctions(tableName?: string): Promise<void>;
}

