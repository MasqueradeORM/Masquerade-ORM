
export const OrmStoreSymb = Symbol("OrmStore")
export const newEntityInstanceSymb = Symbol("newEntity")
export const dependenciesSymb = Symbol("dependencies")
export const referencesSymb = Symbol("references")
export const ormAdvancedClassSettings = Symbol("classSettings")

export const js2db = {
    postgresql: {
        string: "TEXT",
        number: "INTEGER",
        boolean: "BOOLEAN",
        object: "JSONB",
        OrmJSON: "JSONB",
        Date: "TIMESTAMPTZ",
        bigint: "BIGINT",
        BIGINT: "BIGINT",
        INT: "INTEGER",
        UUID: "UUID"
    },
    sqlite: {
        string: "TEXT",
        number: "INTEGER",
        boolean: "INTEGER",
        object: "TEXT",         // Store JSON as TEXT (serialized JSON string)
        OrmJSON: "TEXT",        // Store JSON as TEXT (serialized JSON string)
        Date: "TEXT",
        bigint: "TEXT",
        BIGINT: "TEXT",
        INT: "INTEGER",
        UUID: "TEXT"
    }
}

