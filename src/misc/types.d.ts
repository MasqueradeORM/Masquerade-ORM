// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import type { UUID } from "crypto"
import { Entity } from "../entity/entity"
import { Alias, OR } from "../entity/find/findArgFuncs"
import { OrArray, SqlTemplateObj, LazyPromise } from "./classes"

type integer = number

type SqlClient = "postgres" | "sqlite"

type DbPrimaryKey = "UUID" | "INT" | "BIGINT"

// export interface ClassSettings<T extends Entity> {
//    idType?: DbPrimaryKey
//    twoWayRelations?: Partial<{
//       [K in RelationalProps<T>]: NonNullable<T[K]> extends Array<infer C>
//       ? { linkedProperty: RelationalProps<NonNullable<C>> }
//       : { linkedProperty: RelationalProps<NonNullable<T[K]>> }
//    }>
// }

export interface ClassSettings<T extends Entity> {
   idType?: DbPrimaryKey
   twoWayRelations?: Partial<{
      // The key (K) is the property on the CURRENT class (T)
      [K in RelationalProps<T>]:
      // The value is a string literal of a property on the LINKED class
      NonNullable<T[K]> extends Array<infer C>
      ? RelationalProps<NonNullable<C>>
      : RelationalProps<NonNullable<T[K]>>
   }>
}

type OrmConfigObj = {
   dbConnection: object,
   idTypeDefault: DbPrimaryKey,
   skipTableCreation?: boolean
}

type ConsoleLogType = "success" | "failure" | "warning"

type ColumnBase = {
   nullable?: boolean
   unique?: boolean
}

type ColumnTypeMap = {
   TEXT: ColumnBase & { type: "TEXT"; defaultValue?: string }
   INT: ColumnBase & { type: "INT"; defaultValue?: number }
   BOOLEAN: ColumnBase & { type: "BOOLEAN"; defaultValue?: boolean }
   TIMESTAMPTZ: ColumnBase & { type: "TIMESTAMPTZ"; defaultValue?: string }
   JSONB: ColumnBase & { type: "JSONB"; defaultValue?: Object }
   UUID: ColumnBase & { type: "UUID"; defaultValue?: string }
}

type ColumnDefinition = ColumnTypeMap[keyof ColumnTypeMap]

type TABLE = {
   name: string
   columns: {
      [key: string]: ColumnDefinition
   }
   references?: string
   junctions?: TABLE[]
   refTable?: string
   parent?: TABLE
}

type Unique = never
// type Primary = never
type ForeignKey<T, K extends keyof T> = T

// ---------------------------------------------------------
// ************ RELATIONS ************
// ---------------------------------------------------------

type RelationalProps<T> = {
   [K in keyof T]: NonNullable<T[K]> extends Entity
   ? K
   : NonNullable<T[K]> extends Array<infer U>
   ? U extends Entity
   ? K
   : never
   : never
}[keyof T]

type RelationsOnly<T> = {
   [K in RelationalProps<T>]: NonNullable<T[K]> extends Array<infer C>
   ? Partial<RelationsOnly<NonNullable<C>>> | true
   : Partial<RelationsOnly<NonNullable<T[K]>>> | true
}


// ---------------------------------------------------------
// ************ WHERE ************
// ---------------------------------------------------------

type ValidColumnKeys<T> = {
   [K in keyof T]: NonNullable<T[K]> extends Array<infer C>
   ? never
   : NonNullable<T[K]> extends Function
   ? never
   : NonNullable<T[K]> extends Entity
   ? never
   : K
}[keyof T]

type ValidColumnKeysArr<T> = {
   [K in keyof T]: NonNullable<T[K]> extends Array<infer C>
   ? NonNullable<C> extends Function
   ? never
   : NonNullable<C> extends Entity
   ? never
   : K
   : never
}[keyof T]


// stops recursion on primitives, built-in value objects, functions, etc.
type IsPlainObject<T> = T extends object
   ? T extends Array<any>
   ? false
   : T extends Function
   ? false
   : T extends Date | RegExp | Map<any, any> | Set<any> | Promise<any> | Error | BigInt | Symbol
   ? false
   : true   // only true for { ... } literal-like objects
   : false

type DeepJsonPartial<T> =
   T extends object
   ? IsPlainObject<T> extends true
   ? { [K in keyof T]?: DeepJsonPartial<T[K]> }
   : T   // stop recursion and ignores Date, RegExp, Array<T>, etc
   : T | SqlTemplateObj<T> | OrOptions<T>    // primitives stay as-is

type OrOptions<T> = OrArray<
   | T
   | undefined
>

type WhereOptions<V> =
   | V
   | SqlTemplateObj<V>
   | SqlArrowFn<Alias>
   | null
   | OrOptions<V>

type ColumnProperties<T> = Partial<{
   [K in ValidColumnKeys<T>]:
   NonNullable<T[K]> extends infer V
   ? IsPlainObject<V> extends true
   ? WhereOptions<DeepJsonPartial<V>>
   : WhereOptions<V>
   : never
}>


type ColumnPropertiesArr<T> = Partial<{
   [K in ValidColumnKeysArr<T>]: NonNullable<T[K]> extends Array<infer C>
   ?
   | T[K]
   | SqlTemplateObj<T[K] | Partial<C>>
   | SqlArrowFn<Alias>
   | null
   | OrOptions<NonNullable<T[K]> | DeepJsonPartial<C>>
   : never
}>


type WhereProperties<T> =
   ColumnProperties<T> &
   ColumnPropertiesArr<T> &
   Partial<RelationsWhere<T>>

type RelationsWhere<T> = {
   [K in RelationalProps<T>]?: NonNullable<T[K]> extends Array<infer C>
   ? WhereObj<NonNullable<C>> | templateSqlFn<NonNullable<C>>
   : WhereObj<NonNullable<T[K]>> | templateSqlFn<NonNullable<T[K]>>
}

type WhereObj<T> = WhereProperties<T>
   & {
      $templateWhere?: templateSqlFn<T>
   }

// ---------------------------------------------------------
// ************ SQL ************
// ---------------------------------------------------------

type SqlArrowFn<T> = (AliasObj: AliasObj<T>) => SqlTemplateObj<PrimitivesNoNull | AliasObj<T>>

type templateSqlFn<T> = (AliasObj: AliasObj<T>) => SqlTemplateObj<any>

type AliasObj<T> = T extends Entity
   ? AliasObjProperties<T> & AliasObjRelations<T>
   : Alias

type AliasObjRelations<T> = {
   [K in RelationalProps<T>]: NonNullable<T[K]> extends Array<infer C>
   ? AliasObj<NonNullable<C>>
   : AliasObj<NonNullable<T[K]>>
}

type AliasObjProperties<T> = {
   [K in ValidColumnKeys<T> | ValidColumnKeysArr<T>]: Alias
}

type NonRelationalProps<T> = Exclude<keyof T, RelationalProps<T>>

// ---------------------------------------------------------
// ************ FindObj ************
// ---------------------------------------------------------

export type FindObj<T> = {
   relations?: Partial<RelationsOnly<T>>
   where?: WhereObj<T>
   templateWhere?: templateSqlFn<T> | null
   orderBy?: Partial<OrderByObj<T>> & {
      $aggregate?: true
   }
   limit?: number
   offset?: number


}


// ---------------------------------------------------------
// ************ ORDER BY ************
// ---------------------------------------------------------

type OrderByColumns<T> = Partial<{
   [K in ValidColumnKeys<T>]:
   | 'ASC' | 'DESC' | SqlArrowFn<Alias>
}>

type OrderByColumnsArr<T> = Partial<{
   [K in ValidColumnKeysArr<T>]: NonNullable<T[K]> extends Array<infer C>
   ? 'ASC' | 'DESC' | SqlArrowFn<Alias>
   : never
}>

type OrderByObj<T> =
   OrderByColumns<T> &
   OrderByColumnsArr<T> &
   Partial<OrderByRelations<T>> & {
      $templateOrderBy?: templateSqlFn<T>
   }

type OrderByRelations<T> = {
   [K in RelationalProps<T>]?: NonNullable<T[K]> extends Array<infer C>
   ? OrderByObj<NonNullable<C>>
   : OrderByObj<NonNullable<T[K]>>
}

// ---------------------------------------------------------
// ************ Misc helpers ************
// ---------------------------------------------------------

type JSONValue =
   | string
   | number
   | boolean
   | null
   | undefined
   | JSONValue[]



type PlainObject = { [k: string]: Primitives }

export type Primitives =
   | string
   | number
   | boolean
   | Date
   | PlainObject
   | undefined
   | null


export type PrimitivesNoNull =
   | string
   | number
   | boolean
   | Date
   | PlainObject
   | undefined

type ArrColumnsRawParams =
   | (string | undefined)[]
   | (number | undefined)[]
   | (boolean | undefined)[]
   | (Date | undefined)[]
   | (PlainObject | undefined)[]


