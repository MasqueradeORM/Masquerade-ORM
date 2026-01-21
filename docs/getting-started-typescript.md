
# Defining Classes

## 1) Declaring the Class:
```js
import { Entity } from 'masquerade'

class YourClass extends Entity {
  // class properties
}
```   
The class **MUST** extend `Entity` or a descendent of `Entity`.
## 2) Making a Table Column Nullable:  

```ts
propertyName?: string 
// OR propertyName: string | undefined
```   

## 3) Making a Table Column Unique:

```ts
import { Unique } from 'masquerade'
propertyName: string | Unique
```   

## 4) Relational Properties
Assuming we have the following classes extending Entity: `User`, `Chat` and `Message`.   

```ts
import { Entity } from 'masquerade'

class Example extends Entity {
    // one-to-one relationship with a User instance
    user: User

    // one-to-one relationship with a User instance,
    // but may be undefined if no relationship is established yet
    optionalUser?: User

    // one-to-many relationship with Message instances
    messages: Message[]

    // one-to-many relationship with Chat instances,
    // but may be undefined if no relationships are established yet
    optionalChats?: Chat[]
}
```
Each relational property will create a junction table named `className___propName_jt`.


# Booting Up the ORM

## 1) Database Connection Driver:
 
**SQLite**  

```ts
import { DatabaseSync } from 'node:sqlite'   
const yourDbConnection = new DatabaseSync('your-db-name')
```

**Postgresql**

```ts
import pkg from 'pg'
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

## 2) Configuration Object:
```ts
import type { OrmConfigObj } from "masquerade"

const ormConfig: OrmConfigObj = { 
    dbConnection: yourDbConnection,
    idTypeDefault: 'UUID', // | 'INT' | 'BIGINT'
    skipTableCreation: true // optional, false by default
  }
```

`idTypeDefault` sets the default id-type on all classes.    
To manually set the id-type on a class, read **[Defining Classes: In-Depth - Chapter 2](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/in-depth-class-definitions.md#2-overriding-the-default-id-type)**.

## 3) Build Step

### A) Universal Build Step:  

First run ```bash npx orm-ts-setup``` in your terminal before your compile step. Then, compile and import ```UniversalTsSetup``` into your entry point, and run it before the boot method. Detailed example below in **[Section 4](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-Typescript.md#4-boot-orm)**.    



**Note:**  
Any changes to classes that are descendents of `Entity` require `UniversalTsSetup` to be rebuilt.
To keep the ORM in sync with your entity definitions, include `npx orm-ts-setup` in your build step.

**Example:** ```bash
npx orm-ts-setup && tsc```


### B) Webpack Build Step:
```js
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
                // add 'masquerade-loader' in the 'use' field
                use: ['ts-loader', 'masquerade-loader'],
                exclude: /node_modules/,
            },
        ],
    },
//other fields
```

**Note:** The universal build step will work for projects using webpack as well.

## 4) Boot ORM:

```ts
import * as classes from "./classes"
import * as moreClasses from "./moreClasses"
import { SomeClass } from "./aSingleClass"
if (!usingWebpack) {
import { UniversalTsSetup } from "some/path/ormTypeScriptSetup"
UniversalTsSetup()
}
await ORM.typescriptBoot(ormConfig, classes, moreClasses, someClass)
```

<div align="center" > 
<strong style="font-size: 1.6em;">
All done!
</strong>
<br>
<br>

<br>
<div align="center">
  <strong>
    © 2026 
    <a href="https://github.com/MasqueradeORM">MasqueradeORM </a>
		-
    Released under the MIT License
  </strong>
</div>
