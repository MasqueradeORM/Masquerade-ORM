
# Defining Classes: In-Depth

## 1) Special Property Typing Cases

**TypseScript**
```ts
import { Entity, integer } from 'masquerade'

type MyJSON = {
    booleanField: boolean
    stringArr: string[]
    nestedObj: object
}

class ExampleClass extends Entity {

    // Maps to INTEGER column
    integer: integer = 57

    // Maps to REAL/DOUBLE PRECISION column
    float: number = 15.7

    // Allowed
    stringArrWithUndefineds: (string | undefined)[] = [
        'hello', 'world' , undefined
        ]

    // Can use `satisfies` instead
    json: MyJSON = {
        booleanField: false,
        stringArr: ['a', 'b', 'c'],
        nestedObj: {}
    }

    // Can use `satisfies` instead
    jsonArr: MyJSON[] = [
        {
            booleanField: false,
            stringArr: ['a', 'b', 'c'],
            nestedObj: {}
        }
    ]
}
```
**JavaScript**
```js
import { Entity } from 'masquerade'
/**@typedef {import('masquerade').integer} integer */

/**
 * @typedef {Object} MyJSON
 * @property {boolean} booleanField
 * @property {string[]} stringArr
 * @property {object} nestedObj
 */

class ExampleClass extends Entity {
    // Will map to an INTEGER column
    /**@type {integer}*/ integer = 57

    // Will map to an REAL/DOUBLE PRECISION column
    /**@type {number}*/ float = 15.7

    // Allowed
    /**@type {(string | undefined)[]}*/ stringArrWithUndefineds = [
        'hello', 'world' , undefined
        ]

    // MUST use 'satisfies'
    /**@satisfies {MyJSON}*/ json = {
        booleanField: false,
        stringArr: ['a', 'b', 'c']
        nestedObj: {}
    }

    // MUST use 'satisfies'
    /**@satisfies {MyJSON[]}*/ jsonArr = [{
        booleanField: false,
        stringArr: ['a', 'b', 'c'],
        nestedObj: {}
    }]
}
```

### Operational Edge Cases in Regards to the `json` and `jsonArr` Properties

The ORM can keep track of **assigments** on the first layer of an `object` (`MyJSON` object in the our case). 

```js
const newInstance = new ExampleClass()
// These will mutate the instances 
// but the ORM will not detect these changes. 
// The objects need assigment, not mutation.
newInstance.json.stringArr.push('d') 
newInstance.jsonArr.stringArr.push('d')
// This mutation IS an assigment, but it is
// nested, and therefore will also not be persisted.
newInstance.json.nestedObj.someProp = 'hola mundo'

// First solution - property assigment
const jsonStringArr = newInstance.json.stringArr
const captureNesting = newInstance.json.nestedObj
newInstance.json.stringArr = [...jsonStringArr]
newInstance.jsonArr.stringArr = [...jsonStringArr]
newInstance.nestedObj = { ...captureNesting }
// why destructure? if an assigment is 
// strict-equal the ORM will ignore it.

// Second solution - reassigning on the instance
newInstance.json = { ...newInstance.json }
newInstance.jsonArr = [...newInstance.jsonArr]
```
Both approaches will allow for proper detection and persisting of such changes.


## 2) Overriding the Default Id-Type

```js
import { Entity } from 'masquerade'

class ClassA extends Entity {
    // to avoid bugs put 'ormClassSettings_' as the first property.
    static ormClassSettings_ = {idType: 'INT'} // | 'UUID' | 'BIGINT'
    // properties and constructor...
}
``` 

The above code lets you override the default id-type that is assigned to all Entity's descendants from the the ORM-config object passed to the `ORM.boot` function.    

Setting the `idType` is only possible on a **direct child of Entity**.    

```ts
import { Entity } from 'masquerade'

class ClassA extends Entity {
    // properties and constructor...
}

class ClassB extends ClassA {
    static ormClassSettings_ = {idType: 'INT'}
    // properties and constructor...
}
```
In the example above, `idType` has no effect because `ClassB` does not extend `Entity`. If `static ormClassSettings_ = {idType: 'INT'}` was instead on `ClassA`, the id type of `ClassA` and all of its descendants would have an id type of `integer`.

At the moment, this is the only class setting supported, but it may evolve in the future.


## 3) Abstract Classes

### How to Create an Abstract Class When Using JSDoc:
Put the decorator `/**@abstract*/` right above the constructor of the class.   
```js
import { Entity } from 'masquerade'

class User extends Entity {
    // properties...

    /**@abstract*/
    constructor() {
        super()
    }
}
```

### How is an abstract class mapped to the database?  
Abstract classes do not get a table on the database. Instead, the non-abstract descendant classes of the abstract class will inherit all its properties/columns.   
For example, `abstract ClassA` has two children, `abstract ClassB` and `non-abstract ClassC`, with *ClassB* having a `non-abstract` child `ClassD`.
this means *ClassD's* table will inherit columns from both *ClassA* and *ClassB*, while *ClassC's* table will inherit columns from *ClassA*.



## 4) Guidelines for Classes

Classes that are connected to the ORM and mapped to database tables must follow a few simple rules:
- **Rule 1:** Class must either directly extend Entity (imported from the package) or extend another class that has Entity as an ancestor.
- **Rule 2:** Class properties must have a single “main” type: a `primitive`, a `primitive array`, an `object`, or a class that follows **Rule 1**.
- **Rule 3:** Class names must be PascalCasde.
- **Rule 4:** Class property names must be camelCased.

As long as these rules are adhered to, the class is valid.  


<br>
<div align="center">
  <strong>
    © 2026 
    <a href="https://github.com/MasqueradeORM">MasqueradeORM </a>
		-
    Released under the MIT License
  </strong>
</div>