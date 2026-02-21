// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import type { DbPrimaryKey, OrmConfigObj } from '../misc/types.js'
import { Entity } from '../entity/entity.js'
export declare class ORM {

    /**
     * Boots the ORM in JavaScript environments.
     *
     * Initializes the ORM using the provided configuration object and registers
     * one or more entity classes. Each argument in `classes` may be either:
     *
     * - A class constructor (e.g., `class User {}`)
     * - An object mapping class names to class constructors
     *   (e.g., `{ User: class User {} }`)
     *
     * @param config - The ORM configuration used to initialize the system
     *                 (dbConnection, idTypeDefault, and skipTableCreation).
     * @param classes - One or more class constructors or dictionaries of
     *                  class constructors to register with the ORM.
     */
    static javascriptBoot(
        config: OrmConfigObj,
        ...classes: Array<
            Function | Record<string, Function>
        >
    ): Promise<void>

    /**
     * Boots the ORM in TypeScript environments.
     *
     * Initializes the ORM using the provided configuration object and registers
     * one or more entity classes. Each argument in `classes` may be either:
     *
     * - A class constructor (e.g., `class User {}`)
     * - An object mapping class names to class constructors
     *   (e.g., `{ User: class User {} }`)
     *
     * @param config - The ORM configuration used to initialize the system
     *                 (dbConnection, idTypeDefault, and skipTableCreation).
     * @param classes - One or more class constructors or dictionaries of
     *                  class constructors to register with the ORM.
     */
    static typescriptBoot(
        config: OrmConfigObj,
        ...classes: Array<
            Function | Record<string, Function>
        >
    ): Promise<void>

}

export const FinalizationRegistrySymb: unique symbol
export const DependentsFinalizationRegistry: unique symbol