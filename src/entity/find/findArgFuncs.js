// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0


/**@typedef {import('../../misc/classes.js').SqlTemplateObj} SqlTemplateObjType */
/**@typedef {import('../../misc/classes.js').Alias} Alias */

import { OrArray, SqlTemplateObj } from '../../misc/classes.js'


/**
 * @template T
 * @param {...T | undefined } values 
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
  //strings = strings.map((el) => el.trim())
  strings = [...strings]
  //@ts-ignore
  return new SqlTemplateObj(strings, values)
}