// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

/**@typedef {import('../ORM/internalTypes').ClassWiki} ClassWiki*/
/**
* @typedef {Object} Store
* @property {Record<string, ClassWiki>} classWikiDict
* @property {string} sqlClient
* @property {any} dbChangesObj
*/


export class OrmStore {
    //@ts-ignore
    /**@type {Store}*/ static store = {}

   static getClassChangesObj(instanceClass) {
      const classChangesObj = this.store.dbChangesObj[instanceClass] ??= {}
      return classChangesObj
   }

   static clearDbChanges() {
      const dbChanges = this.store.dbChangesObj
      for (const key in dbChanges) delete dbChanges[key]
   }

   static getClassWiki(instanceClass) {
      if (typeof instanceClass === 'string')
         return this.store.classWikiDict[instanceClass]
      return this.store.classWikiDict[instanceClass.constructor.name]
   }
}

