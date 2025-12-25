import type { DbPrimaryKey, FindObj } from "../ormTypes"

import { dbConnectionSymb } from "./ORM"
import { SqlClient } from "../ormTypes"
import type { OrmStoreSymb, sqlClientSymb } from "./constantsAndFunctions"

export declare class Entity {
  id: string | number | bigint
  updatedAt: Date

  static scheduledFlush = false

  static initOrm(dbConnection: Pool, sqlClient: SqlClient, primaryType: DbPrimaryKey): void {
    globalThis[OrmStoreSymb] = {
      primaryType,
      dbConnection,
      sqlClient,
      dbChangesObj: {},
      entityMapsObj: {},
      dependentsMapsObj: {},
      entityCreationFuncs: undefined
    }
  }

  static find<T extends Entity>(
    this: new (...args: any[]) => T,
    obj: FindObj<T>
  ): Promise<T[]>

  async save(): void {
  }

  async delete(): void {
  }

  async getDependents(): void {
  }

  async getReferencers(): void {
  }
}

