
/**
* @template T
* @typedef {import('../../../misc/classes').OrArray<T>} OrArray
*/


/**
* @template T
* @typedef {import('../../../misc/classes').AndArray<T>} AndArray
*/

/**@typedef {import('../../../misc/classes').SqlWhereObj} SqlWhereObjType */
/**@typedef {import('../../../misc/classes').Alias} Alias */

import { SqlWhereObj } from '../../../misc/classes.js'


/**
 * @template T
 * @param {...T | undefined | OrArray<T | SqlWhereObjType>} values 
 * @returns {AndArray<T>}
 */
export function AND(...values) {
  //@ts-ignore
  return new AndArray(values)
}


/**
 * @template T
 * @param {...T | undefined | AndArray<T | SqlWhereObjType>} values 
 * @returns {OrArray<T>}
 */
export function OR(...values) {
  //@ts-ignore
  return new OrArray(values)
}


/**
 * @template T
 *  */
export function sql(strings,/**@type { (Alias | T)[]}*/ ...values) {
  // strings = strings.filter((str) => str !== '')
  strings = strings.map((el) => el.trim())
  //@ts-ignore
  return new SqlWhereObj(strings, values)
}