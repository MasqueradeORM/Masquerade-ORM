
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
