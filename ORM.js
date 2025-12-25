import { addChildrenToClasses, createBranches, createClassMap, createJunctionColumnContext, createTableObject, entities2NodeArr, formatForCreation, generateTableCreationQueryObject, getInitIdValues, handleSpecialSettingId, nodeArr2ClassDict, sendTableCreationQueries } from "./bootOrm.js"
import { OrmStoreSymb } from "./misc/constants.js"

/**@typedef {import('./misc/types.js').SqlClient} SqlClient */
/**@typedef {import('./misc/types.js').DbPrimaryKey} DbPrimaryKey */
/**@typedef {import('./misc/types.js').OrmConfigObj} OrmConfigObj */


export const FinalizationRegistrySymb = Symbol("FinalizationRegistry")
export const DependentsFinalizationRegistry = Symbol("DependentsFinalizationRegistry")
export class ORM {
  static [FinalizationRegistrySymb] = new FinalizationRegistry(([className, id]) => globalThis[OrmStoreSymb].entityMapsObj[className].delete(id))
  static [DependentsFinalizationRegistry] = new FinalizationRegistry(([className, id]) => globalThis[OrmStoreSymb].dependentsMapsObj[className].delete(id))

  static configure(/**@type {OrmConfigObj}*/ configObj) {
    const { primaryType, dbConnection, sqlClient } = configObj
    globalThis[OrmStoreSymb] = {
      primaryType,
      dbConnection,
      sqlClient,
      dbChangesObj: {},
      entityMapsObj: {},
      dependentsMapsObj: {},
      entities: undefined
    }
  }

  static async bootJavascript(entities, /**@type {boolean}*/ createDbTables = false) {
    if (!globalThis[OrmStoreSymb]) throw new Error("ORM not initialized, please call Entity.initOrm(pool) before using the ORM.")

    if (typeof entities === `function`) {
      const name = entities.name
      entities = { [name]: entities }
    }

    /**@type {{[key: string]: function}}*/ const entityDict = Object.fromEntries(Object.entries(entities))
    globalThis[OrmStoreSymb].entities = entityDict
    const nodeArray = entities2NodeArr(entityDict)
    const classDict = nodeArr2ClassDict(nodeArray)
    await ORM.bootTypescript(classDict, createDbTables)
  }

  static async bootTypescript(classDict, /**@type {boolean}*/ createDbTables) {
    addChildrenToClasses(classDict)
    const branchesArr = createBranches(classDict)
    const tablesDict = createTableObject(branchesArr)
    createJunctionColumnContext(tablesDict)
    handleSpecialSettingId(tablesDict)
    createClassMap(tablesDict) //JUNCTIONS MAY NOT EXIST ON ORM MAP, BUT COLUMNS ALWAYS WILL
    await getInitIdValues(tablesDict)

    if (!createDbTables) return
    const formattedTables = formatForCreation(tablesDict)
    const tableCreationObj = generateTableCreationQueryObject(formattedTables)
    await sendTableCreationQueries(tableCreationObj)
  }
}

// function columnsWithCasting(classWiki) {
//   const returnedArr = []
//   const Js2Db = {
//     string: "TEXT",
//     number: "INTEGER",
//     boolean: "BOOLEAN",
//     object: "JSONB",
//     OrmJSON: "JSONB",
//     Date: "TIMESTAMPTZ",
//     bigint: "BIGINT",
//     BIGINT: "BIGINT",
//     UUID: "UUID"
//   }
//   for (const [columnName, columnType] of Object.entries(classWiki.columns).filter(column => column[0] !== "id")) {
//     let type = Js2Db[columnType.type]
//     if (columnType.isArray) type += `[]`
//     returnedArr.push([columnName, type])
//   }

//   const idType = Js2Db[Entity[primaryTypeSymb]]
//   returnedArr.push(["id", idType])
//   return returnedArr
// }

// function toPgString(value) {
//   if (value === undefined || value === null) {
//     return null  // or you can decide how to handle nulls
//   }
//   else if (typeof value === 'string') {
//     return value  // assume already properly formatted or '_ORM_UNCHANGED_VAL_'
//   }
//   else if (typeof value === 'boolean' || typeof value === 'number') {
//     return value.toString()
//   }
//   else if (value instanceof Date) {
//     return value.toISOString()  // ISO string works well for timestamps
//   }
//   else if (Array.isArray(value)) {
//     // Convert JS array to Postgres array literal, e.g. {1,2,3}
//     // This handles only flat arrays of primitives (numbers or strings)
//     return '{' + value.map(item => {
//       if (typeof item === 'string') {
//         return item.replace(/"/g, '\\"') // escape quotes inside strings
//       }
//       return item;
//     }).join(',') + '}'
//   }
//   else if (typeof value === 'object') {
//     // For JSON or JSONB columns, convert object to JSON string
//     return JSON.stringify(value)
//   }
//   // Fallback: convert whatever else to string
//   return String(value)
// }

//   CAST($1 AS INTEGER) AS as_int,
//   CAST($1 AS BIGINT) AS as_bigint,
//   CAST($1 AS DATE) AS as_date,
//   CAST($1 AS BOOLEAN) AS as_boolean,
//   CAST($1 AS JSONB) AS as_jsonb,
//   CAST($1 AS TEXT[]) AS as_text_array,
//   CAST($1 AS INTEGER[]) AS as_int_array;





