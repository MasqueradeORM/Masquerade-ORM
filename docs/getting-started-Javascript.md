# Class Definitions

### Fundemental Rules

Classes that are connected to the ORM and mapped to database tables must follow a few simple rules:
- **Rule 1:** Class must either directly extend Entity (imported from the package) or extend another class that has Entity as an ancestor.
- **Rule 2:** Class properties must have a single “main” type: a primitive, a primitive array (e.g., (string | undefined)[] is allowed), an object, or a class that follows **Rule 1**.
- **Rule 3:** Class names must be PascalCasde.
- **Rule 4:** Class property names must be camelCased.

As long as these rules are adhered to, the class is valid.  


### Defining Classes

#### 1) Creating an Abstract Class:
Put the decorator ```/**@abstract*/``` right above the constructor of the class.   

**How is an abstract class mapped to the database?**   
Abstract classes do not get a table on the database. Instead, the non-abstract descendant classes of the abstract class will inherit all its properties/columns.   
For example, **abstract ClassA** has two children, **abstract ClassB** and **non-abstract ClassC**, with ClassB having a **non-abstract** child **ClassD**.
this means ClassD's table will inherit columns from both ClassA and ClassB, while ClassC's table will inherit columns from ClassA.

#### 2) Making a Table Column Nullable:
```
/**@type {string | undefined}*/ propertyName
```   

#### 3) Making a Table Column Unique:
```
/**@type {string | Unique}*/ propertyName
```   
(you can import Unique from the package or just define ```type Unique = never```)


#### 4) Relational Properties
Assuming we have the following classes extending Entity: User, Chat and Message.    

```js
class Example {
    // one-to-one relationship with a User instance
    /** @type {User} */ prop1
    
    // One-to-one relationship with a User instance.
    // May be undefined if no relationship is established yet. 
    /** @type {User | undefined} */ prop2
    
    // one-to-many relationship with Message instances
    /** @type {Message[]} */ prop3
    
    // One-to-many relationship with Chat instances.
    // May be undefined if no relationships are established yet.
    /** @type {Chat[] | undefined} */ prop4
}
```
Each relational property will create a junction table named `className___propName_jt`.


#### 5) Static ormClassSettings_ Property:
```
Static ormClassSettings_ = {idType: 'UUID' | 'INT' | 'BIGINT'} // or {primaryType: 'UUID' | 'INT' | 'BIGINT'}
``` 

The above code lets you override the default id type that is assigned to all Entity's descendants (this will be elaborated on in the next section).    
Setting the id type is only possible on a **direct descendant of Entity**, so for the example given above in **section 1**, you can change the id type for ClassA, but not for any other class (assigning an id type to ClassB/C/D won't break anything, but it won't change the id type either).  

At the moment, this is the only class setting supported, but it may evolve in the future.

# Booting Up the ORM

#### 1) Database Connection Driver:
 
**SQLite**  

```
import { DatabaseSync } from 'node:sqlite'   
const yourDbConnection = new DatabaseSync('your-db-name')
```

**Postgresql**

```import pkg from 'pg'
const { Pool } = pkg

// Create a pool instance
const yourDbConnection = new Pool({
    user: 'your_db_user',         // e.g., 'postgres'
    host: 'localhost',            // database host
    database: 'your_db_name',     // database name
    password: 'your_db_password', // your password
    port: 5432,                   // default PostgreSQL port
})
```

#### 2) Configuration Object:
```js
/**@typedef {import('masquerade').OrmConfigObj} OrmConfigObj*/

/** @type {OrmConfigObj} */ const ormConfig = {
    dbConnection: yourDbConnection,
    primaryType: 'UUID', // | 'INT' | 'BIGINT'
    skipTableCreation: true // optional, false by default
}
```

primaryType sets the default id type on all classes, which can be overridden as explained in **'Defining Classes' - section 5**.


#### 3) Boot ORM:

```js
import * as classes from './classes.js'
import * as moreClasses from './moreClasses.js'
import { someClass } from './aSingleClass.js'
await ORM.javascriptBoot(ormConfig, classes, moreClasses, someClass)
```

**And you are done!**
