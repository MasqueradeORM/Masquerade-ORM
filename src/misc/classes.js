/**@typedef {import('./types').PrimitivesNoNull} PrimitivesNoNull*/


/**
 * @template T
 */
export class SqlWhereObj {
  constructor(/**@type {string[]}*/ strings, /**@type {(Alias | PrimitivesNoNull)[]}*/ params) {
    this.strings = strings
    this.params = params
  }
}


/**
 * @template T
 * @extends {Array<T>}
 */
export class AndArray extends Array {
  /**
   * @param {...T} items
   */
  constructor(...items) {
    super(...items)
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
}


export class LazyPromise {
  constructor(className) {
    this.promise =
      className

  }

  toString() {
    return `Promise<${this.promise}>`
  }
}