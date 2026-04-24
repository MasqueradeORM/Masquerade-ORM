// Copyright 2026 B.G (github.com/MasqueradeORM)
// SPDX-License-Identifier: Apache-2.0

import { Entity } from '../index.js'
import { jsonGenerator } from './miscFunctions.js'
/**@typedef {import('../index.js').integer} integer */
/**@typedef {import('../index.js').Unique} Unique */
/** 
 * @template {import('../src/entity/entity.js').Entity} T
 * @typedef {import('../src/misc/types.js').ClassSettings<T>} ClassSettings 
 */

export class House extends Entity {
   /**@type {Person | undefined}*/ owner
   /**@type {Person[] | undefined}*/ tenants
   constructor(/**@type {Person}*/ owner, /**@type {Person[]}*/ tenants) {
      super()
      this.owner = owner
      this.tenants = tenants
   }

   /**@type {ClassSettings<House>}*/ static $ormClassSettings = {
      idType: 'UUID',
      twoWayRelations: {
         owner: 'mother',
         tenants: 'father'
      }
   }
}

export class Person extends Entity {
   /**@type {string}*/ fullName
   /**@type {integer}*/ age
   /**@type {Person | undefined}*/ mother
   /**@type {Person | undefined}*/ father
   /**@type {Person[]}*/ children = []

   // /**@type {Person[]}*/ siblings = []
   // /**@type {integer}*/ numOfSiblings = this.siblings.length
   constructor(/**@type {string}*/ fullName, /**@type {integer}*/ age, /**@type {Person | undefined}*/ father = undefined, /**@type {Person | undefined}*/ mother = undefined) {
      super()
      this.fullName = fullName
      this.age = age
      this.father = father
      this.mother = mother
   }
}


/**
 * @typedef {Object} MyJSON
 * @property {boolean} booleanField
 * @property {string[]} stringArr
 * @property {number} floatVal
 * @property {number} someInt
 */

export class NonRelationalClass extends Entity {
   /**@type {bigint}*/ bigint = 57n
   /**@type {integer}*/ int = 57
   /**@type {number}*/ float = 57.7
   /**@type {(MyJSON & object)[]}*/ jsonArr = [jsonGenerator()]
   /**@satisfies {MyJSON & object}*/ json = jsonGenerator()

   constructor() {
      super()
   }

   /**@type {ClassSettings<NonRelationalClass>}*/ static $ormClassSettings = { idType: 'UUID' }
}

export class NonRelationalClass2 extends NonRelationalClass {
   /**@type {boolean}*/ boolean = true
   /**@type {string[]}*/ stringArr = ['hello', 'world']

   // /**@type {Person | undefined}*/ typesChildRelation
   constructor() {
      super()
   }
   /**@type {ClassSettings<NonRelationalClass2>}*/ static $ormClassSettings = { idType: 'UUID' }
}


export class User extends Entity {
   /**@type {string | Unique}*/ username
   /**@type {string | Unique}*/ email
   /**@type {string}*/ password
   /**@type {TestChat[]}*/ chats = []

   constructor(username, email, password) {
      super()
      this.username = username
      this.email = email
      this.password = password

   }
    /**@type {ClassSettings<User>}*/ static $ormClassSettings = {
      twoWayRelations:
      {
         chats: 'users'
      }
   }
}

// export class User2 extends User {
//    /**@type {string}*/ hello = 'world'
//    constructor(username, email, password) {
//       super(username, email, password)
//    }
// }

export class TestChat extends Entity {
   /**@type {string}*/ chatName
   /**@type {User[]}*/ users = []
   /**@type {TestMessage[]}*/ messages = []

   constructor(/**@type {string}*/ chatName, /**@type {User}*/ user) {
      super()
      this.chatName = chatName
      this.users = [user]
   }
}

export class TestMessage extends Entity {
   /**@type {string}*/ text
   /**@type {User}*/ sender

   constructor(text, /**@type {User}*/ user) {
      super()
      this.text = text
      this.sender = user
   }
}

