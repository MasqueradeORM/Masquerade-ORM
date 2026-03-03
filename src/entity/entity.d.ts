// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0


import type { FindObj } from "../misc/types"

export declare class Entity {
  id: string | number | bigint
  updatedAt: Date

  /**
  * Finds instances in the database that match the given argument.
  * Relations do not get filtered by where conditions, only the root instances get filtered.
  * (RootClass.find(arg)) => only RootClass instances matching the where conditions get returned. 
  */
  static find<T extends Entity>(
    this: new (...args: any[]) => T,
    obj: FindObj<T>
  ): Promise<T[]>

  /**
  * Finds an instance with the provided id.
  *
  * - If the instance exists in the entity's in-memory map, it is returned immediately without a database call.
  * - Otherwise, the instance is fetched from the database.
  *
  * @returns Resolves to the entity instance if found, otherwise `undefined`.
  */
  static fetch<T extends Entity>(
    this: new (...args: any[]) => T,
    id: string | number | bigint
  ): Promise<T>

  /**
  * Get all instances from memory by accessing the corresponding Entity Map.
  */
  static getAllLoaded<T extends Entity>(
    this: new (...args: any[]) => T
  ): T[]

  /**
  * Saves all changes made to the instance.
  * 
  * @throws {Error} If the save fails.
  */
  save(): void

  /**
  * Hard deletes the instance from the database. May require a pre-deletion step - the 'getDependents' method.
  */
  delete(): void

  /**
  * A pre-deletion step that is required in certain cases.
  * Finds all instances that have a one-to-one relationship with the calling instance
  * where the related property cannot be set to `undefined`.
  * These relationships must be reassigned before the calling instance
  * can be safely deleted.
  * Returns undefined if there are no dependents.
  */
  getDependents(): Promise<DependentsDict | undefined>

  /**
   * Finds all instances that have a relation with the calling instance,
   * This method is a superset of the getDependents method, and is not meant as a pre-deletion step, but as a utility.
   */
  getReferencers(): Promise<DependentsDict | undefined>
}


type DependentsDict = {
  [key: string]: [
    dependentInstances: any[],
    dependentProps: string[]
  ]
}
