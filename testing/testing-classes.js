import { Entity } from 'masquerade'
import { jsonGenerator } from './miscFunctions.js'
/**@typedef {import('masquerade').integer} integer */


export class House extends Entity {
    /**@type {Person | undefined}*/ owner
    /**@type {Person[] | undefined}*/ tenants
    constructor(/**@type {Person}*/ owner, /**@type {Person[]}*/ tenants) {
        super()
        this.owner = owner
        this.tenants = tenants
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
 * @typedef {Object} JSON
 * @property {boolean} booleanField
 * @property {string[]} stringArr
 * @property {number} floatVal
 * @property {integer} someInt
 */

export class NonRelationalClass extends Entity {
    /**@type {bigint}*/ bigint = 57n
    /**@type {integer}*/ int = 57
    /**@type {number}*/ float = 57.7
    /**@satisfies {JSON[]}*/ jsonArr = [jsonGenerator()]
    /**@satisfies {JSON}*/ json = jsonGenerator()

    constructor() {
        super()
    }
}

export class NonRelationalClass2 extends NonRelationalClass {
/**@type {boolean}*/ boolean = true
/**@type {string[]}*/ stringArr = ['hello', 'world']

    // /**@type {Person | undefined}*/ typesChildRelation
    constructor() {
        super()
    }
}


export class TestUser extends Entity {
    /**@type {string}*/ username
    /**@type {string}*/ email
    /**@type {string}*/ password
    /**@type {TestChat[]}*/ chats = []

    constructor(username, email, password) {
        super()
        this.username = username
        this.email = email
        this.password = password

    }
}

export class TestChat extends Entity {
    /**@type {string}*/ chatName
    /**@type {TestUser[]}*/ users
    /**@type {TestMessage[]}*/ messages = []
    constructor(chatName, /**@type {TestUser}*/ user) {
        super()
        this.chatName = chatName
        this.users = [user]
    }
}

export class TestMessage extends Entity {
/**@type {string}*/ text
/**@type {TestUser}*/ sender

    constructor(text, /**@type {TestUser}*/ user) {
        super()
        this.text = text
        this.sender = user
    }
}

