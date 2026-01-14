import { addChildrenToClasses, alterTables, compareAgainstDb, createBranches, createClassMap, createJunctionColumnContext, createTableObject, entities2NodeArr, formatForCreation, generateTableCreationQueryObject, getInitIdValues, handleSpecialSettingId, nodeArr2ClassDict, returnEntityClassObj, sendTableCreationQueries } from "./bootOrm.js"
export { Entity } from "../entity/entity.js"
import { DatabaseSync } from "node:sqlite"
import { OrmStore } from "../misc/ormStore.js"
import { coloredBackgroundConsoleLog } from "../misc/miscFunctions.js"
/**@typedef {import('../misc/types.js').SqlClient} SqlClient */
/**@typedef {import('../misc/types.js').DbPrimaryKey} DbPrimaryKey */
/**@typedef {import('../misc/types.js').OrmConfigObj} OrmConfigObj */
/**@typedef {import('pg').Pool} Pool*/

export const FinalizationRegistrySymb = Symbol("FinalizationRegistry")
export const DependentsFinalizationRegistry = Symbol("DependentsFinalizationRegistry")
export class ORM {
  static [FinalizationRegistrySymb] = new FinalizationRegistry(([className, id]) => OrmStore.store.entityMapsObj[className].delete(id))
  static [DependentsFinalizationRegistry] = new FinalizationRegistry(([className, id]) => OrmStore.store.dependentsMapsObj[className].delete(id))


  /**
   * Boot the ORM when using JavaScript.
   * This method processes a combination of class constructor functions or class-like objects 
   * and bootstraps them into the ORM configuration.
   * 
   * You can pass either:
   * - **Class constructor functions** (e.g., `class MyClass {}`) or
   * - **Objects** that map class names to class constructors (e.g., `{ MyClass: class {}}`).
   * @param {OrmConfigObj} config - The ORM configuration object used to initialize the ORM system.
   * @param {...(function|object)} classes - A rest parameter that can accept multiple class constructors 
   *                                         (functions) or class dictionaries (objects) where the key is the 
   *                                         class name and the value is the class constructor.
   * @returns {Promise<void>}
   */
  static async javascriptBoot(config, ...classes) {
    let classFuncsDict = {}
    let i = 2
    for (const element of classes) {
      if (typeof element === 'function') classFuncsDict[element.name] = element
      else if (typeof element === 'object') classFuncsDict = { ...classFuncsDict, ...element }
      else throw new Error(`Argument number ${i} in 'javascriptBoot' is invalid.`)
      i++
    }

    /**@type {{[key: string]: function}}*/ const classFuncs = Object.fromEntries(Object.entries(classFuncsDict))
    const nodeArray = entities2NodeArr(classFuncs)
    const classDict = nodeArr2ClassDict(nodeArray)
    await universalBoot(classDict, classFuncs, config)
  }


  /**
   * Boot the ORM when using TypeScript.
   * This method processes a combination of class constructor functions or class-like objects 
   * and bootstraps them into the ORM configuration.
   * 
   * You can pass either:
   * - **Class constructor functions** (e.g., `class MyClass {}`) or
   * - **Objects** that map class names to class constructors (e.g., `{ MyClass: class {}}`).
   * @param {OrmConfigObj} config - The ORM configuration object used to initialize the ORM system.
   * @param {...(function|object)} classes - A rest parameter that can accept multiple class constructors 
   *                                         (functions) or class dictionaries (objects) where the key is the 
   *                                         class name and the value is the class constructor.
   * @returns {Promise<void>}
   */
  static async typescriptBoot(config, ...classes) {
    const classDict = globalThis.masqueradeClassDict_
    let classFuncsDict = {}
    let i = 2
    for (const element of classes) {
      if (typeof element === 'function') classFuncsDict[element.name] = element
      else if (typeof element === 'object') classFuncsDict = { ...classFuncsDict, ...element }
      else throw new Error(`Argument number ${i} in 'typescriptBoot' is invalid.`)
      i++
    }

    /**@type {{[key: string]: function}}*/ const classFuncs = Object.fromEntries(Object.entries(classFuncsDict))
    await universalBoot(classDict, classFuncs, config)
  }
}

async function universalBoot(classDict, classFuncs, /**@type {OrmConfigObj}*/ config) {
  configure(config)
  classDict.entity = returnEntityClassObj()
  OrmStore.store.entities = classFuncs
  addChildrenToClasses(classDict)
  const branchesArr = createBranches(classDict)
  const tablesDict = createTableObject(branchesArr)
  createJunctionColumnContext(tablesDict)
  handleSpecialSettingId(tablesDict)
  createClassMap(tablesDict) //JUNCTIONS MAY NOT EXIST ON ORM MAP, BUT COLUMNS ALWAYS WILL
  await compareAgainstDb(tablesDict)
  await getInitIdValues(tablesDict)

  if (config.skipTableCreation === true) return
  const [tables4creation, tables2alter] = formatForCreation(tablesDict)
  const tableCreationObj = generateTableCreationQueryObject(tables4creation)
  await sendTableCreationQueries(tableCreationObj)
  await alterTables(tables2alter)
  coloredBackgroundConsoleLog(`Updated the database successfully.\n`, `success`)
}


function configure(/**@type {OrmConfigObj}*/ configObj) {
  const { idTypeDefault, dbConnection } = configObj
  if (!idTypeDefault || !dbConnection) throw new Error("Invalid ORM configuration object.")
  const sqlClient = dbConnection instanceof DatabaseSync ? 'sqlite' : 'postgresql'
  OrmStore.store = {
    idTypeDefault,
    dbConnection,
    sqlClient,
    dbChangesObj: {},
    entityMapsObj: {},
    dependentsMapsObj: {},
    entities: undefined
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





