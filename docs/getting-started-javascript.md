
# Defining Classes

## 1) Declaring the Class:
```js
import { Entity } from 'masquerade-orm'

class YourClass extends Entity {
  // class properties
}
```   
The class **MUST** extend `Entity` or a descendent of `Entity`.

## 2) Making a Table Column Nullable:
```js
/**@type {string | undefined}*/ propertyName
```   
Do not use `string | undefined` as a property type, as `null` will cause unintended behavior as elaborated on [here](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/find.md#understanding-null-vs-undefined-values-in-where-clauses
), and will **NOT** make the column nullable.

## 3) Making a Table Column Unique:
```js
/**@typedef {import('masquerade-orm').integer} integer */
/**@type {string | Unique}*/ propertyName
```   

## 4) Relational Properties
Assuming we have the following classes extending Entity: `User`, `Chat` and `Message`.    

```js
import { Entity } from 'masquerade-orm'
import { User, Chat, Message } from './your/entities'

class Example extends Entity {
    // one-to-one relationship with a User instance
    /** @type {User} */ user
    
    // One-to-one relationship with a User instance.
    // May be undefined if no relationship is established yet. 
    /** @type {User | undefined} */ optionalUser
    
    // one-to-many relationship with Message instances
    /** @type {Message[]} */ messages
    
    // One-to-many relationship with Chat instances.
    // May be undefined if no relationships are established yet.
    /** @type {Chat[] | undefined} */ optionalChats
}
```
Each relational property will create a junction table named `className___propName_jt`.


** **For more in-depth documentation regarding class definitions **[click here](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/in-depth-class-definitions.md)**.** **

# Booting Up the ORM

## 1) Database Connection Driver:
 
**SQLite**  

```js
import { DatabaseSync } from 'node:sqlite'   
const yourDbConnection = new DatabaseSync('your-db-name')
```
or 
```js
import Database from 'better-sqlite3'
const yourDbConnection = new Database('your-db-name')
```
**note:** `better-sqlite3` provides better performance than `node:sqlite`.

**PostgreSQL**

```js
import { Pool } from 'pg'

// Create a pool instance
const yourDbConnection = new Pool({
    user: 'your_db_user',         // e.g., 'postgres'
    host: 'localhost',            // database host
    database: 'your_db_name',     // database name
    password: 'your_db_password', // your password
    port: 5432,                   // default PostgreSQL port
})
```

## 2) Configuration Object:
```js
/**@typedef {import('masquerade-orm').OrmConfigObj} OrmConfigObj*/

/** @type {OrmConfigObj} */ const ormConfig = {
    dbConnection: yourDbConnection,
    idTypeDefault: 'UUID', // | 'INT' | 'BIGINT'
    skipTableCreation: true // optional, false by default
}
```

`idTypeDefault` sets the default id-type on all classes.    
To manually set the id-type on a class, read **[Defining Classes: In-Depth - Chapter 2](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/in-depth-class-definitions.md#2-overriding-the-default-id-type)**.


## 3) Boot ORM:

```js
import * as classes from './classes.js'
import * as moreClasses from './moreClasses.js'
import { someClass } from './aSingleClass.js'
await ORM.javascriptBoot(ormConfig, classes, moreClasses, someClass)
```


<h1 align="center">All done!</h1>

<div align="center">

### **It is HIGHLY recommended to read [JSDoc – UX Tips](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/jsdoc-ux-tips.md)**

</div>

<br>
<div align="center">
  <strong>
    © 2026 
    <a href="https://github.com/MasqueradeORM">
    B.G (github.com/MasqueradeORM) 
    </a>    
    <br>
    Released under the <a href="https://github.com/MasqueradeORM/MasqueradeORM/blob/master/LICENSE">
    Apache License 2.0
    </a> 
  </strong>
</div>
