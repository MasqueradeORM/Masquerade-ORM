// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

/**@typedef {import('../ORM/internalTypes').ClassWiki} ClassWiki*/
/**
* @typedef {Object} Store
* @property {string} sqlClient
* @property {any} dbConnection
* @property {Record<string, Function>} entityFunctions
* @property {string} idTypeDefault
* @property {Record<string, number | Function>} idLogger
* @property {Record<string, ClassWiki>} classWikiDict
* @property {any} mutationsLog
* @property {Record<string, Map>} entityMapsObj
* @property {Record<string, Map>} dependentsMapsObj
*/


export class OrmStore {
    //@ts-ignore
    /**@type {Store}*/ static store = {}

   static getClassChangesObj(instanceClass) {
      const classChangesObj = this.store.mutationsLog[instanceClass] ??= {}
      return classChangesObj
   }

   static clearDbChanges() {
      const dbChanges = this.store.mutationsLog
      for (const key in dbChanges) delete dbChanges[key]
   }

   static getClassWiki(instanceClass) {
      if (typeof instanceClass === 'string')
         return this.store.classWikiDict[instanceClass]
      return this.store.classWikiDict[instanceClass.constructor.name]
   }
}

