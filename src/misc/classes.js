// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

/**@typedef {import('./types').PrimitivesNoNull} PrimitivesNoNull*/

import { nonSnake2Snake } from './miscFunctions.js'
import { OrmStore } from './ormStore.js'


/**
 * @template T
 */
export class SqlTemplateObj {
  constructor(/**@type {string[]}*/ strings, /**@type {(Alias | PrimitivesNoNull)[]}*/ params) {
    this.__strings__ = strings
    this.__params__ = params
  }
}


/**
 * @template T
 * @extends {Array<T>}
 */
export class OrArray extends Array {
  /**
   * @param {...T} items
   */
  constructor(...items) {
    super(...items)
  }
}

export const aliasSymb = Symbol("alias")

export class Alias {
  errMsg
  constructor(/**@type {string}*/ alias, /**@type {string | undefined}*/ errMsg = undefined) {
    this[aliasSymb] = alias
    if (errMsg) this.errMsg = errMsg
  }

  static createColumnId (aliasObj, propertyName) {
    return aliasObj.alias + `.${nonSnake2Snake(propertyName)}`
  }
}


export class LazyPromise {
  constructor(instance, property, promiseType, executor) {
    // if (typeof executor !== 'function') {
    //   throw new TypeError(
    //     `LazyPromise executor must be a function, got ${typeof executor}`
    //   )
    // }
    this.instanceContext = {
      instanceId: instance.id,
      instanceClass: instance.constructor.name,
      property,
      promiseType
    }
    this._executor = executor
    this._promise = null
  }

  _getPromise() {
    if (!this._promise) {
      this._promise = new Promise((resolve, reject) => {
        try {
          this._executor(resolve, reject)
        } catch (err) {
          reject(err)
        }
      })
    }
    return this._promise
  }

  then(onFulfilled, onRejected) {
    return this._getPromise().then(onFulfilled, onRejected)
  }

  catch(onRejected) {
    return this._getPromise().catch(onRejected)
  }

  finally(onFinally) {
    return this._getPromise().finally(onFinally)
  }

  toString() {
    return `Promise<${this.instanceContext.promiseType}>`
  }

  push(...items) {
    const { instanceClass, instanceId, property, promiseType } = this.instanceContext
    const cleanedType = promiseType.endsWith('[]') ? promiseType.slice(0, -2) : promiseType
    const addedIds = {}
    for (const item of items) {
      if (item.constructor.name !== cleanedType) throw new Error(`${item} is of type ${item.constructor.name} but must be of type ${cleanedType}.`)
      addedIds[item.id] = true
    }

    const changesObj = OrmStore.store.mutationsLog
    changesObj[instanceClass] ??= {}
    const instanceChangeObj = changesObj[instanceClass][instanceId] ??= {}
    const relationsLogger = instanceChangeObj[property] ??= { add: {}, remove: {} }
    Object.assign(relationsLogger.add, addedIds )
  }

}
