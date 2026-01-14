

export const newEntityInstanceSymb = Symbol("newEntity")
export const dependenciesSymb = Symbol("dependencies")
export const referencesSymb = Symbol("references")


export const js2db = {
    postgresql: {
        string: "TEXT",
        number: "DOUBLE PRECISION",
        integer: "INTEGER",
        boolean: "BOOLEAN",
        object: "JSONB",
        Date: "TIMESTAMPTZ",
        bigint: "BIGINT",
        BIGINT: "BIGINT",
        INT: "INTEGER",
        UUID: "UUID"
    },
    sqlite: {
        string: "TEXT",
        number: "REAL",
        integer: "INTEGER",
        boolean: "INTEGER",
        object: "TEXT",         // Store JSON as TEXT (serialized JSON string)
        Date: "TEXT",
        bigint: "TEXT",
        BIGINT: "TEXT",
        INT: "INTEGER",
        UUID: "TEXT"
    }
}

export const floatColumnTypes = [
  "DOUBLE",
  "DOUBLE PRECISION",
  "REAL",
  "FLOAT",
  "FLOAT8"
]

