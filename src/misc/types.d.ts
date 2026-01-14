import type { UUID } from "crypto"

import { Entity } from "../entity/entity"
import { Alias, AND, OR } from "../entity/find/where/whereArgsFunctions"
import { OrArray, AndArray, SqlWhereObj, LazyPromise } from "./classes"
import type { Pool } from "pg"
import { DatabaseSync } from "node:sqlite"

type integer = number

type DbConnection<T extends 'pg' | 'sqlite'> =
  T extends 'pg' ? Pool : DatabaseSync

type OrmConfigObj = {
  dbConnection: Pool | DatabaseSync,
  //dbConnection: DbConnection,
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
// 🔑 RELATIONS
// ---------------------------------------------------------

type RelationsProperties<T> = {
  [K in keyof T]: NonNullable<T[K]> extends Entity
  ? K
  : NonNullable<T[K]> extends Array<infer U>
  ? U extends Entity
  ? K
  : never
  : never
}[keyof T]

type RelationsOnly<T> = {
  [K in RelationsProperties<T>]: NonNullable<T[K]> extends Array<infer C>
  ? Partial<RelationsOnly<NonNullable<C>>> | true
  : Partial<RelationsOnly<NonNullable<T[K]>>> | true
}

// ---------------------------------------------------------
// 🔑 WHERE
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


type ColumnProperties<T> = Partial<{
  [K in ValidColumnKeys<T>]:
  | T[K]
  | SqlWhereObj<T[K]>
  | AndArray<
    NonNullable<T[K]> | undefined | OrArray<NonNullable<T[K]> | undefined | SqlWhereObj<T[K]>>
  >
  | OrArray<
    NonNullable<T[K]> | undefined | AndArray<NonNullable<T[K]> | undefined | SqlWhereObj<T[K]>>
  >
  | sqlArrowFn<Alias>
  | null
}>

// type ColumnProperties<T> = Partial<{
//   [K in ValidColumnKeys<T>]:
//     | NonNullable<T[K]>
//     | SqlWhereObj
//     | AndArray
//     | OrArray
//     | sqlArrowFn<NonNullable<T[K]>>
//     | null
//     | undefined
// }>

// type ColumnPropertiesArr<T> = Partial<{
//   [K in ValidColumnKeysArr<T>]: NonNullable<T[K]> extends Array<infer C>
//     ?
//         | (NonNullable<C> | null | undefined)[]
//         | SqlWhereObj
//         | AndArray
//         | OrArray
//         | sqlArrowFn<NonNullable<C>>
//         | null
//         | undefined
//     : never
// }>

type ColumnPropertiesArr<T> = Partial<{
  [K in ValidColumnKeysArr<T>]: NonNullable<T[K]> extends Array<infer C>
  ?
  | T[K]
  | SqlWhereObj<T[K] | C>
  | AndArray<
    | NonNullable<T[K]>
    | undefined
    | OrArray<NonNullable<T[K]> | SqlWhereObj<T[K] | C> | undefined>
  >
  | OrArray<
    | NonNullable<T[K]>
    | undefined
    | AndArray<NonNullable<T[K]> | SqlWhereObj<T[K] | C> | undefined>
  >
  | sqlArrowFn<Alias>
  | null
  : never
}>


type WhereProperties<T> =
  ColumnProperties<T> &
  ColumnPropertiesArr<T> &
  Partial<RelationsWhere<T>>

type RelationsWhere<T> = {
  [K in RelationsProperties<T>]?: NonNullable<T[K]> extends Array<infer C>
  ? EnhancedWhereProperties<NonNullable<C>> | sqlArrowFnTable<NonNullable<C>> | sqlArrowFnTable<NonNullable<C>>[]
  : EnhancedWhereProperties<NonNullable<T[K]>> | sqlArrowFnTable<NonNullable<T[K]>> | sqlArrowFnTable<NonNullable<T[K]>>[]
}

type EnhancedWhereProperties<T> = WhereProperties<T> & {
  _relationalWhere?: sqlArrowFnTable<T> | sqlArrowFnTable<T>[]
}

// ---------------------------------------------------------
// 🔑SQL
// ---------------------------------------------------------

type sqlArrowFn<T> = (AliasObj: AliasObj<T>) => SqlWhereObj<PrimitivesNoNull | AliasObj<T>>

type sqlArrowFnTable<T> = (AliasObj: AliasObj<T>) => SqlWhereObj<any>

type AliasObj<T> = T extends Entity
  ? AliasObjProperties<T> & AliasObjRelations<T>
  : Alias

type AliasObjRelations<T> = {
  [K in RelationsProperties<T>]: NonNullable<T[K]> extends Array<infer C>
  ? AliasObj<NonNullable<C>>
  : AliasObj<NonNullable<T[K]>>
}

type AliasObjProperties<T> = {
  [K in ValidColumnKeys<T> | ValidColumnKeysArr<T>]: Alias
}

type NonRelationsProperties<T> = Exclude<keyof T, RelationsProperties<T>>

// ---------------------------------------------------------
// 🔑 FindObj
// ---------------------------------------------------------

export type FindObj<T> = {
  relations?: Partial<RelationsOnly<T>>
  where?: WhereProperties<T>
  relationalWhere?: sqlArrowFnTable<T> | (sqlArrowFn<T> | null)[] | null
}

// ---------------------------------------------------------
// 🔑 Misc helpers
// ---------------------------------------------------------

type JSONValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JSONValue[]


type SqlClient = "postgresql" | "sqlite"

type DbPrimaryKey = "UUID" | "INT" | "BIGINT"

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



// #region
///*
/////////////


///OLD
// import type { UUID } from "crypto"

// import { Entity } from "./entities/entity"
// import { Alias, SqlWhereObj } from "./ormClasses"
// import { OrArray, AndArray } from "./ormClasses"
// import { AND, OR } from "./entities/entityFunctions"


// type COLUMN_TYPE = "TEXT" | "INT" | "BOOLEAN" | "TIMESTAMPTZ" | "JSONB" | "UUID"

// type ColumnBase = {
//   nullable?: boolean
//   unique?: boolean
//   // primary?: boolean
// }

// type ColumnTypeMap = {
//   TEXT: ColumnBase & { type: "TEXT"; defaultValue?: string }
//   INT: ColumnBase & { type: "INT"; defaultValue?: number }
//   BOOLEAN: ColumnBase & { type: "BOOLEAN"; defaultValue?: boolean }
//   TIMESTAMPTZ: ColumnBase & { type: "TIMESTAMPTZ"; defaultValue?: string }
//   JSONB: ColumnBase & { type: "JSONB"; defaultValue?: Object }
//   UUID: ColumnBase & { type: "UUID"; defaultValue?: string }
// }

// type ColumnDefinition = ColumnTypeMap[keyof ColumnTypeMap]

// type TABLE = {
//   name: string
//   columns: {
//     [key: string]: ColumnDefinition
//   }
//   references?: string
//   junctions?: TABLE[]
// }

// type Unique = never
// // type Primary = never
// type ForeignKey<T, K extends keyof T> = T

// // ---------------------------------------------------------
// // 🔑 RELATIONS
// // ---------------------------------------------------------

// type RelationsProperties<T> = {
//   [K in keyof T]: NonNullable<T[K]> extends Entity
//     ? K
//     : NonNullable<T[K]> extends Array<infer U>
//     ? U extends Entity
//       ? K
//       : never
//     : never
// }[keyof T]

// type RelationsOnly<T> = {
//   [K in RelationsProperties<T>]: NonNullable<T[K]> extends Array<infer C>
//     ? Partial<RelationsOnly<NonNullable<C>>> | true
//     : Partial<RelationsOnly<NonNullable<T[K]>>> | true
// }

// // ---------------------------------------------------------
// // 🔑 WHERE
// // ---------------------------------------------------------

// type ValidColumnKeys<T> = {
//   [K in keyof T]: NonNullable<T[K]> extends Array<infer C>
//     ? never
//     : NonNullable<T[K]> extends Function
//     ? never
//     : NonNullable<T[K]> extends Entity
//     ? never
//     : K
// }[keyof T]

// type ValidColumnKeysArr<T> = {
//   [K in keyof T]: NonNullable<T[K]> extends Array<infer C>
//     ? NonNullable<C> extends Function
//       ? never
//       : NonNullable<C> extends Entity
//       ? never
//       : K
//     : never
// }[keyof T]

// // type AliasMap<T> = {
// //   [K in ValidColumnKeys<T> | ValidColumnKeysArr<T>]: string
// // }

// type ColumnProperties<T> = Partial<{
//   [K in ValidColumnKeys<T>]:
//     | T[K]
//     | SqlWhereObj
//     | AndArray<
//         NonNullable<T[K]> | undefined | OrArray<NonNullable<T[K]> | undefined>
//       >
//     | OrArray<
//         NonNullable<T[K]> | undefined | AndArray<NonNullable<T[K]> | undefined>
//       >
//     | sqlArrowFn<Alias>
//     | null
// }>

// // type ColumnProperties<T> = Partial<{
// //   [K in ValidColumnKeys<T>]:
// //     | NonNullable<T[K]>
// //     | SqlWhereObj
// //     | AndArray
// //     | OrArray
// //     | sqlArrowFn<NonNullable<T[K]>>
// //     | null
// //     | undefined
// // }>

// // type ColumnPropertiesArr<T> = Partial<{
// //   [K in ValidColumnKeysArr<T>]: NonNullable<T[K]> extends Array<infer C>
// //     ?
// //         | (NonNullable<C> | null | undefined)[]
// //         | SqlWhereObj
// //         | AndArray
// //         | OrArray
// //         | sqlArrowFn<NonNullable<C>>
// //         | null
// //         | undefined
// //     : never
// // }>

// type ColumnPropertiesArr<T> = Partial<{
//   [K in ValidColumnKeysArr<T>]: NonNullable<T[K]> extends Array<infer C>
//     ?
//         | T[K]
//         | SqlWhereObj
//         | AndArray<
//             | NonNullable<T[K]>
//             | undefined
//             | OrArray<NonNullable<T[K]> | undefined>
//           >
//         | OrArray<
//             | NonNullable<T[K]>
//             | undefined
//             | AndArray<NonNullable<T[K]> | undefined>
//           >
//         | sqlArrowFn<Alias>
//         | null
//     : never
// }>

// type RelationsWhere<T> = {
//   [K in RelationsProperties<T>]: NonNullable<T[K]> extends Array<infer C>
//     ? WhereProperties<NonNullable<C>> | sqlArrowFn<NonNullable<C>>
//     : WhereProperties<NonNullable<T[K]>> | sqlArrowFn<NonNullable<T[K]>>
// }


// type WhereProperties<T> = Exclude<
//   ColumnProperties<T> &
//     ColumnPropertiesArr<T> &
//     Partial<RelationsWhere<T>>,
//   undefined
// >

//   type RelationsWhere<T> = {
//   [K in RelationsProperties<T>]?: NonNullable<T[K]> extends Array<infer C>
//     ? EnhancedWhereProperties<NonNullable<C>> | sqlArrowFn<NonNullable<C>> | sqlArrowFn<NonNullable<C>>[]
//     : EnhancedWhereProperties<NonNullable<T[K]>> | sqlArrowFn<NonNullable<T[K]>> | sqlArrowFn<NonNullable<T[K]>>[]
// }

// type EnhancedWhereProperties<T> = WhereProperties<T> & {
//   _relationalWhere?: sqlArrowFn<T> | sqlArrowFn<T>[]
// }

// // ---------------------------------------------------------
// // 🔑SQL
// // ---------------------------------------------------------

// type sqlArrowFn<T> = (AliasObj: AliasObj<T>) => SqlWhereObj

// type AliasObj<T> = T extends Entity
//   ? AliasObjProperties<T> & AliasObjRelations<T>
//   : Alias

// type AliasObjRelations<T> = {
//   [K in RelationsProperties<T>]: NonNullable<T[K]> extends Array<infer C>
//     ? AliasObj<NonNullable<C>>
//     : AliasObj<NonNullable<T[K]>>
// }

// type AliasObjProperties<T> = {
//   [K in ValidColumnKeys<T> | ValidColumnKeysArr<T>]: Alias
// }

// type NonRelationsProperties<T> = Exclude<keyof T, RelationsProperties<T>>

// // ---------------------------------------------------------
// // 🔑 FindObj
// // ---------------------------------------------------------

// export type FindObj<T> = {
//   relations?: Partial<RelationsOnly<T>>
//   where?: WhereProperties<T>
//   relationalWhere?: sqlArrowFn<T> | sqlArrowFn<T>[]
// }

// // ---------------------------------------------------------
// // 🔑 Misc helpers
// // ---------------------------------------------------------

// type JSONValue =
//   | string
//   | number
//   | boolean
//   | null
//   | undefined
//   | { [key: string]: JSONValue }
//   | JSONValue[]

// type OrmJSON = {
//   [key: string]: JSONValue
// }

// type DbPrimaryKey = "UUID" | "INT" | "BIGINT"

// // ---------------------------------------------------------
// // 🔑 Raw
// // ---------------------------------------------------------

// // type RelationNames<T> = {
// //   [K in keyof T]: NonNullable<T[K]> extends Entity
// //   ? K
// //   : NonNullable<T[K]> extends Array<infer U>
// //   ? U extends Entity
// //   ? K
// //   : never
// //   : never
// // }[keyof T]

// // type RelationsOnly<T> = {
// //   [K in RelationNames<T>]: NonNullable<T[K]> extends Array<infer C>
// //   ? Partial<RelationsOnly<NonNullable<C>>> | true
// //   : Partial<RelationsOnly<NonNullable<T[K]>>> | true
// // }

// // type AliasObj<User2> = {
// //   username: Alias
// //   email: Alias
// //   password: Alias
// //   isBlocked: Alias
// //   isAdmin: Alias
// //   previouslyPaid: Alias
// //   sessions: Alias
// // //NON DB BELOW
// //   consultations = undefined
// //   /**@type {ConsultancyForm2[] }*/ consultancyForms = []
// //   /**@type {number}*/ maxSessions = 3
// // }

// function sql(
//   str: TemplateStringsArray,
//   ...args: (AliasObj | Primitives)[]
// ): SqlWhereObj

// type PlainObject = { [k: string]: Primitives }

// export type Primitives =
//   | string
//   | number
//   | boolean
//   | Date
//   | PlainObject
//   | undefined
//   | null

// type ArrColumnsRawParams =
//   | (string | undefined)[]
//   | (number | undefined)[]
//   | (boolean | undefined)[]
//   | (Date | undefined)[]
//   | (PlainObject | undefined)[]

// // type RawParam = Primitives | ArrColumnsRawParams

// // ---------------------------------------------------------
// // 🔑 AND & OR
// // ---------------------------------------------------------

// //TODO GET PROPER INTELLISENSE FOR ORS AND ANDS

// // export type AndOrArgs = (
// //   | OrArray
// //   | AndArray
// //   | SqlWhereObj
// //   | Exclude<Primitives, null>
// //   | undefined
// // )[]

// // type OrArray<T> = (SqlWhereObj | T & Primitives)[]

// // type AndArray<T> = (SqlWhereObj | T & Primitives)[]

// // type AND<T> = (...args: T) => AndArray<T>

// // type OR<T> = (...args: T) => OrArray<T>
// #endregion
