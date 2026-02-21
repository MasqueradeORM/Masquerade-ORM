# Deleting Instances from the Database

## Soft Deletion
The ORM does not support soft deletion by default. To implement soft deletion, just create an abstract class like so: 

**TypeScript**
```ts
export abstract class SoftDel extends Entity {
  isDeleted: boolean = false

    constructor() {
        super()
    }
}

export abstract class SoftDelUuid extends Entity {
  // switch 'UUID' to 'INT' or 'BIGINT' as needed.
  static ormClassSettings_ = { idType: 'UUID' } 
  isDeleted: boolean = false

  constructor() {
      super()
  }
}
```

**JavaScript**
```js
export class SoftDel extends Entity {
  /**@type {boolean}*/ isDeleted = false

  /** @abstract */
  constructor() {
      super()
  }
}

export class SoftDelUuid extends Entity {
  // switch 'UUID' to 'INT' or 'BIGINT' as needed.
  static ormClassSettings_ = { idType: 'UUID' }
  /**@type {boolean}*/ isDeleted = false

  /** @abstract */
  constructor() {
      super()
  }
}
```

Every class that extends these `SoftDel` classes will have a boolean property `isDeleted` that is `false` by default, allowing instances to be soft-deleted by setting the `isDeleted` value to `true`.

```ts
export class SoftDeletableUser extends SoftDelUuid {
  username: string
  email: string
  password: string

  constructor (username, email, password) {
    this.username = username
    this.email = email
    this.password = password
  }
}

const softDelUser = new SoftDeletableUser('JohnDoe', 'JohnDoe@gmail.com', 'hashedPassword')
// softDelUser has an 'isDeleted' property that can be toggled to true for soft deletion
// and has an id type of UUID.
```

**Note:** Unlike `Entity`, the `SoftDel` classes need to be passed into the `ORM.boot` method that is being called to init the ORM.

## Hard Deletion

```ts
import { sql } from "masquerade-orm"
const twoYearsAgo = new Date().setFullYear(new Date().getFullYear() - 2)

// finds all instances that haven't been mutated in over two years
const instances4Deletion = await ExampleClass.find({where: {updatedAt: sql`< ${twoYearsAgo}`}})

// delete all instances
instances4Deletion.forEach(instance => instance.delete())
```

The `delete` method hard-deletes the instance from the database; the instance cannot be recovered afterwards.

<div align="center">
<strong style="font-size: 1.2em;">
** This method will throw an error in case a pre-deletion step is required. **
 </strong>
</div>


## Pre-Deletion Step for Hard Deletion

### When is a pre-deletion step required?  
A pre-deletion step is required when the class instance has **dependents**.  


### What is a dependent?     
A dependent is a class that has a required 1-to-1 relationship with another class, meaning the relation cannot be undefined.

```ts
// dependent 1-to-1 relation, 'sender' cannot be undefined
sender: User 
```

For example, if a `Message` has a `sender` property of type `User`, then `Message` is dependent on `User`. As a result, a `User` instance cannot be safely deleted until all dependent `Message` instances are resolved of said dependency.

```ts
sender?: User // optional relation
sender: User | undefined // optional relation
```

If the property was optional or of type `User | undefined`, the `Message` class would **NOT** be dependent on `User`.
In such a case, when a `User` instance is deleted, any of its messages will have an `undefined` value in the `sender` property.


### How to find an instance's dependents? 
Assuming `User` has dependents:

```ts
// finds the user with a username of 'JohnDoe57'
const user = (await User.find({ where: {username: 'JohnDoe57'} }))[0]
const dependentsDict = await user.getDependents()
```

### What is the structure of dependentsDict? 

```ts
type DependentsDict<T extends Entity> = {
  [dependentClassName: string]: [
    dependentInstances: T[],
    dependentProps: string[]
  ]
}
```

Assuming the classes `Payment` and `Message` are dependents of the `User` class, with `Payment` having a dependent property of `sentBy` and `receivedBy`, and `Message` having a dependent property of `sender`.

```ts
// structure of dependentsDict
dependentsDict = {
  'Payment': [
    // all Payment instances that depend on the deleted User instance
    [paymentInstance1, paymentInstance2, ...],
    // all properties on Payment that depend on the deleted User instance
    ['sentBy', 'receivedBy']
  ],
  'Message': [
    // all Message instances that depend on the deleted User instance
    [messageInstance1, messageInstance2, ...],
    // all properties on Message that depend on the deleted User instance
    ['sender']
  ]
}
```

### Resolving dependencies
To resolve the dependencies, access the data as such:
```ts
const user = (await User.find({ where: { username: 'JohnDoe57' } }))[0]
const dependentsDict = await user.getDependents()
const deletedUserId = user.id

for (const dependentClassName of Object.keys(dependentsDict)) {
  const [dependentInstances, dependentProps] = dependentsDict[dependentClassName]

  for (const instance of dependentInstances) {
    dependentProps.forEach(prop => {
      if (instance[prop].id !== deletedUserId) continue
      // decoupling logic here
    })
  }
}
```

<br>
<div align="center">
  <strong>
    © 2026 
    <a href="https://github.com/MasqueradeORM">B.G (github.com/MasqueradeORM) </a>    
    <br>
    Released under the <a href="https://github.com/MasqueradeORM/MasqueradeORM/blob/master/LICENSE">
    Apache License 2.0
    </a> 
  </strong>
</div>