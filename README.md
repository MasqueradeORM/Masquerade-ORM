<div align="center">
  <a href="#">
  <img
  src="https://github.com/user-attachments/assets/3bf1ab31-f9c6-4362-b17d-1dfe7c414f17"
  alt="Masquerade ORM Logo"
  style="max-width: 100%; height: auto;"
  />
  </a>
  <br><br>
  <a href="">
      <br><br>
    <img src="https://img.shields.io/badge/License-MIT-teal.svg" alt="MIT License"/>
  </a>
  <br><br>
</div>

**MasqueradeORM** is a lightweight ORM for Node.js that works seamlessly with both TypeScript and JavaScript. Its goal is to hide SQL complexity while letting you work naturally in JS/TS syntax. Instead of forcing you into ORM-specific models, metadata systems, or decorators, MasqueradeORM lets you use **your own classes** directly, exactly as you normally would.

MasqueradeORM improves readability, maintainability, and workflow simplicity through a unified coding approach and extremely minimal setup — no ORM offers a simpler start. There’s no need to manage heavy configuration layers, maintain secondary schema systems, or even plan your database structure separately.  
Your schema and tables are generated automatically from a single source of truth: **Your class definitions.**

MasqueradeORM currently supports the following SQL clients: 
- **SQLite** 
- **Postgresql**

# Features
- **Effortless setup** – no ORM-specific structures; just use your classes.
- **Zero schema planning** – tables and schema are generated automatically.
- **Powerful IntelliSense** – easily build complex queries (CTRL + Space when in doubt).
- **Minimal memory usage** – One class instance per database row, minimizing memory usage and avoiding duplicates through smart state management.
- **Optimized querying** – fewer queries through intelligent transaction grouping without sacrificing data integrity.
- **Relational WHERE clauses** – easily write conditions that compare two columns within the same table or columns across different tables.
- **Write complex WHERE conditions using a template-literal helper** – enabling expressive comparisons like >=, LIKE, object-property access, and even array element matching—without cluttering your query code.
- **Safe by default** – every query is parameterized.
- **Lightweight** – minimal dependencies.
- **Strong typing even in JavaScript** – powered by JSDoc, no compile step required.
- **Reduced data transfer size** - improves performance in client-server setups (not applicable for embedded databases like SQLite).
- **Abstract and non-abstract inheritance** - abstract classes in JS? Yes.
- **Combines the convenience of embedded SQLite with the strict typing of RDBMS**
- **Eager and lazy relations**
- **Unidirectional, bidirectional, and self-referenced relations**


# Setting Up - Class Definitions

#### 1) Fundemental Rules:
Classes that are connected to the ORM and mapped to database tables must follow a few simple rules:
- **Rule 1:** Class must either directly extend Entity (imported from the package) or extend another class that has Entity as an ancestor.
- **Rule 2:** Class properties must have a single “main” type: a primitive, a primitive array (e.g., (string | undefined)[] is allowed), an object, or a class that follows **Rule 1**.
- **Rule 3:** Class names must be PascalCasde.
- **Rule 4:** Class property names must be camelCased.

As long as these rules are adhered to, the class is valid.  

#### 2) Creating an Abstract Class:
**Javascript:** Put the decorator ```/**@abstract*/``` right above the constructor.   
**Typescript:** ```abstract class MyClass```   

**How is an abstract class mapped to the database?**   
Abstract classes do not get a table on the database. Instead, the non-abstract descendant classes of the abstract class will inherit all its properties/columns.   
For example, **abstract ClassA** has two children, **abstract ClassB** and **non-abstract ClassC**, with ClassB having a **non-abstract** child **ClassD**.
this means ClassD's table will inherit columns from both ClassA and ClassB, while ClassC's table will inherit columns from ClassA.

#### 3) Making a Table Column Nullable:
**Javascript:** ```/**@type {string | undefined}*/ propertyName```   
**Typescript:** ```propertyName: string | undefined || propertyName?: string```   

#### 4) Making a Table Column Unique:
**Javascript:** ```/**@type {string | Unique}*/ propertyName```   
**Typescript:** ```propertyName: string | Unique```   
(you can import Unique from the package or just define ```type Unique = never```)

#### 5) Static ormClassSettings_ Property:
```Static ormClassSettings_ = {idType: 'UUID' | 'INT' | 'BIGINT'} || {primaryType: 'UUID' | 'INT' | 'BIGINT'}```   
The above code lets you override the default id type that is assigned to all Entity's descendants (this will be elaborated on in the next section).    
Setting the id type is only possible on a **direct descendant of Entity**, so for the example given in **section 2**, you can change the id type for ClassA, but not for any other class (assigning an id type to ClassB/C/D won't break anything, but it won't change the id type either).  

At the moment, this is the only class setting supported, but it may evolve in the future.

# Setting Up - Booting Up the ORM

#### 1) Database Connection Driver:
 
**SQLite**  

```js
import { DatabaseSync } from 'node:sqlite'   
const yourDbConnection = new DatabaseSync('your-db-name')
```

**Postgresql**

```js
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

#### 2) Configuration Object:
```js
/**@typedef {import('masquerade').OrmConfigObj} OrmConfigObj*/

/** @type {OrmConfigObj} */ const ormConfig = {
  dbConnection: yourDbConnection,
  primaryType: 'UUID', // | 'INT' | 'BIGINT'
  skipTableCreation: true // false by default
}
```

```ts
import type { OrmConfigObj } from "masquerade"

const ormConfig: OrmConfigObj = {
  dbConnection: yourDbConnection,
  primaryType: 'UUID', // | 'INT' | 'BIGINT'
  skipTableCreation: true // false by default
}
```

primaryType sets the default id type on all classes, which can be overridden as explained in **'Setting Up - Class Definitions' section 5**.

#### 3) Passed Classes:

```
import * as classes from './classes.js'
import * as moreClasses from './moreClasses.js'
import { someClass } from './aSingleClass.js'
let passedClasses
if (passing_multiple_modules) passedClasses = {...classes, ...moreClasses, someClass} 
else passedClasses = classes
```

#### 4) Boot ORM:

**Javascript**

```
await ORM.javascriptBoot(ormConfig, passedClasses)
```

**Typescript**

- **Build Step - Webpack**
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

- **Build Step - General**

First, run the following command **before your compile step**:
```bash
npx orm-ts-setup
```
Then, compile your project and import ```Setup4Typescript``` into your entry point. 
Make sure it is executed before calling ```ORM.typescriptBoot``` as shown below.     
Note: Every time your class model changes, ```Setup4Typescript``` must be rebuilt and updated.
For this reason, it is strongly recommended to run ```npx orm-ts-setup``` as part of your build step to ensure the ORM remains in sync with the actual classes passed to the boot method.       

(An example of a combined build step: ```npx orm-ts-setup && tsc```)


- **Booting - Runtime Step**
```
if (!usingWebpack) {
import Setup4Typescript from `some/path` 
Setup4Typescript()
}

await ORM.typescriptBoot(ormConfig, passedClasses)
```


# Saving to the Database

To create your first table row, instantiate any class that was passed to the `boot` method:    
```
new YourClass()
```

A natural question is whether this instance is automatically persisted - the answer is yes.   
The ORM performs an implicit save that is triggered in one of two situations:

- When the current environment scope exits
- Immediately before any find method is executed

This guarantees that all pending instances are flushed to the database before read operations occur.

**Manual Saves**
  
If you intend to execute raw SQL queries after using the ORM’s find methods within the same environment scope, you should explicitly call:
```
await flush()
```


# Find

```
await ExampleClass.find(findObj)
```

The find method is the most complex part of the ORM.

It accepts a single argument, findObj, which contains three optional fields.
Because all fields are optional, findObj itself may be an empty object — although this is rarely useful, as it would return all instances of ExampleClass.

The three optional fields are:

- relations
- where
- relationalWhere

Note: findObj is fully covered by IntelliSense. You are strongly encouraged to rely on it.


### 'relations' field:

The 'relations' field determines which relations are eagerly loaded from the database.

A crucial detail to understand is that relations are never filtered.
They are either loaded or not — the ORM never displays partial relational data.

```
// assume that relationalProp is a property of type SomeClass or SomeClass[]
await ExampleClass.find(
    {
        relations: {relationalProp: true},
        where: {
            relationalProp: {
                id: 57
            }
        }
    }
)
```

The example above translates to:   
**“Fetch all instances of ExampleClass whose relationalProp contains a SomeClass instance with id = 57.”**

In other words, the condition matches when either of the following is true:    
```exampleClassInstance.relationalProp = someClassId57```    
or    
```exampleClassInstance.relationalProp = [someClassId57, ...rest]```    

### 'where' field:

The 'where' field is for filtering the root instances, in the following case, Chat instances.
```
await Chat.find({
    where: {
        messages: {
            sender: {
                id: 12
            }
        }
    }
})
```
Translation: **“Find all chats that contain a message from a user with the id 12, without loading messages.“**     

Something to note is that the scope of the where condtions is agnostic to the scope of the relations/eager loading.       
It is completely safe to filter based on specific relations without having said relations passed into the 'relations' field.      

```
await Angel.find({
    where: {
        // Name is either "Micheal" OR "Gabriel"
        name: OR("Micheal", "Gabriel"),

        // demonsSentToAbyss is greater than 12,000 AND less than 57,000
        demonsSentToAbyss: AND(sql`> 12000`, sql`< 57000`),
    }
})
```

```
await User.find({
    where: {
        // donations between 1,200 and 5,700 cents (exclusive)
        donations: sql`1200 < # AND # < 5700`, 
        // similar to the example above, but instead of having an implicit # placeholder inserted
        // into the left side of the sql statement string, here #'s are written explicitly

        // registered using a Gmail email
        email: sql`LIKE '%@gmail.com%'`,
    }
})
```

### 'relationalWhere' field:

```
await User.find({
   relationalWhere: (user) => sql`${user.chats.messages.sender.username} = 'glory2Christ'`
})
// finds users that have at least one chat that contain at least one message whose sender's username is 'glory2Christ'
```

```
// finds users that have at least one chat that contain at least one message whose sender's username is 'glory2Christ'
await User.find({
  where: { 
    chats: {
     relationalWhere_: (chat) => sql`${chat.messages.sender.username} = 'glory2Christ'`
    }
  }
})
// identical to the previous example, but here relational where is called from a different scope.
```
**IntelliSense is your friend when writing relational where statements.**



# Miscellaneous
- **Importing types from package**

```/**@typedef {import('masquerade').OrmConfigObj} OrmConfigObj*/```















