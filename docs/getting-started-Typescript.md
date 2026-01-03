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

```
abstract class MyClass
```   

**How is an abstract class mapped to the database?**   
Abstract classes do not get a table on the database. Instead, the non-abstract descendant classes of the abstract class will inherit all its properties/columns.   
For example, **abstract ClassA** has two children, **abstract ClassB** and **non-abstract ClassC**, with ClassB having a **non-abstract** child **ClassD**.
this means ClassD's table will inherit columns from both ClassA and ClassB, while ClassC's table will inherit columns from ClassA.

#### 2) Making a Table Column Nullable:  

```
propertyName?: string // or propertyName: string | undefined
```   

#### 3) Making a Table Column Unique:

```
propertyName: string | Unique
```   
(you can import Unique from the package or just define ```type Unique = never```)

#### 4) Relational Properties
Assuming we have the following classes extending Entity: User, Chat and Message.    

```ts
class Example {
    // one-to-one relationship with a User instance
    prop1: User

    // one-to-one relationship with a User instance,
    // but may be undefined if no relationship is established yet
    prop2?: User

    // one-to-many relationship with Message instances
    prop3: Message[]

    // one-to-many relationship with Chat instances,
    // but may be undefined if no relationships are established yet
    prop4?: Chat[]
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
```ts
import type { OrmConfigObj } from "masquerade"

const ormConfig: OrmConfigObj = { 
    dbConnection: yourDbConnection,
    primaryType: 'UUID', // | 'INT' | 'BIGINT'
    skipTableCreation: true // false by default
  }
```

primaryType sets the default id type on all classes, which can be overridden as explained in **'Defining Classes' - section 5**.

#### 3-a) Build Step - Webpack:
```
// in your webpack.config file add:
import { MasqueradePlugin } from './plugin.js'

//other fields
  plugins: [
        //other plugins...
        new MasqueradePlugin() //this should be last
    ],
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: ['ts-loader', 'masquerade-loader'],
                exclude: /node_modules/,
            },
        ],
    },
//other fields
```

#### 3-b) Build Step - Without Webpack:
First run ```npx orm-ts-setup``` in your terminal before your compile step. Then, compile and import ```Setup4Typescript``` into your entry point, and run it before the boot method (shown below in **section 4**).    

**Note:**  
Whenever you make changes to classes that descend from `Entity`, `Setup4Typescript` must be rebuilt or updated.  
To prevent the ORM from being out of sync with the actual classes passed in, it is recommended to combine `npx orm-ts-setup` with your build step.  

**Example:** ```npx orm-ts-setup && tsc```

#### 4) Boot ORM:

```ts
import * as classes from "./classes"
import * as moreClasses from "./moreClasses"
import { SomeClass } from "./aSingleClass"
import { Setup4Typescript } from "some/path"
Setup4Typescript()
await ORM.typescriptBoot(ormConfig, classes, moreClasses, someClass)
```

**And you are done!**
