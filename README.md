<div align="center">

  <a href="#">
    <picture>
        <source media="(prefers-color-scheme: dark)"
         srcset="https://github.com/MasqueradeORM/MasqueradeORM/releases/download/0.9/DARK-THEME-LOGO-transperent-bg.png">
        <source  media="(prefers-color-scheme: light)" 
        srcset="https://github.com/MasqueradeORM/MasqueradeORM/releases/download/0.9/LIGHT-THEME-LOGO-transperent-bg.png">
        <img style="max-width: 33%; height: auto;" alt="MasqueradeORM Logo" 
        src="https://github.com/MasqueradeORM/MasqueradeORM/releases/download/0.9/LIGHT-THEME-LOGO-transperent-bg.png">
    </picture>
  </a>
  <br><br>
  <a href="">
      <br><br>
  <picture>
        <source media="(prefers-color-scheme: dark)"
         srcset="https://img.shields.io/badge/License-Apache_2.0-gold">
        <source  media="(prefers-color-scheme: light)" 
        srcset="https://img.shields.io/badge/License-Apache_2.0-teal">
        <img alt="Apache License 2.0" 
        src="https://img.shields.io/badge/License-Apache_2.0-teal"
        >
  </picture>
  </a>
  <br><br>
</div>

**MasqueradeORM** is a lightweight ORM for Node.js that works seamlessly with both TypeScript and JavaScript.

Its goal is to hide SQL complexity while letting you work naturally in JS/TS syntax. 
Instead of forcing you into ORM-specific models, metadata systems, or decorators, MasqueradeORM lets you use **your own classes** directly, exactly as you normally would.

MasqueradeORM improves readability, maintainability, and workflow simplicity through a unified coding approach and extremely minimal setup. 
No ORM offers a simpler start.
There’s no need to manage heavy configuration layers, maintain secondary schema systems, or even plan your database structure separately. 
Your schema and tables are generated automatically from a single source of truth: **Your class definitions.**

MasqueradeORM currently supports the following SQL clients: 
- **SQLite** 
- **PostgreSQL**


# Installation

```bash
npm install masquerade-orm
```

# Features
- **Effortless setup** - No ORM-specific structures; just use your classes.
- **Zero schema planning** - Tables and schema are generated automatically.
- **Powerful IntelliSense** - Confidently build complex queries with real-time IDE guidance and warnings when something’s wrong.
- **Minimal memory usage** - Automatically prevents duplicate entity instances by maintaining a single in-memory representation per database row using an *Entity Map*.
- **Batched implicit writes** - Minimizes database round-trips by batching operations into optimized transactions while preserving consistency and state integrity.
- **Cross-column & cross-table conditions made effortless** - Use relational and non-relational data in *WHERE* and *ORDER BY* clauses with clean, IntelliSense-supported syntax that automatically handles the all the necessary joins for you.
Focus on your business logic while the ORM manages the tedious work.
- **Expressive template-literal *WHERE* clauses** - Write complex, readable conditions such as *LIKE*, ≥, *nested property access*, *array element matching* and more, by using IntelliSense-guided tagged template literals. Any valid SQL *WHERE* logic is possible, with safe parameter interpolation and full relational nesting support.

- **Advanced, flexible sorting with aggregates, relations & custom expressions** - 
Go far beyond basic *ASC*/*DESC*: support multi-column tie-breakers, *ORDER BY* with aggregates (*COUNT*, *AVG*, etc.), and fully custom computed expressions via template literals.
Perfect for leaderboards, recommendations, or relevance scoring: all IntelliSense-friendly.
- **Powerful relation capabilities** - Full support for eager & lazy loading, unidirectional / bidirectional / self-referencing relationships, and modifying associations even when they are not loaded.
- **SQL injection protection** - All queries are parameterized.
- **Minimal data transfer size** - Improves performance in client-server setups (not applicable for embedded databases like SQLite).
- **Soft deletion and hard deletion support**
- **Abstract and non-abstract inheritance** - Enables the use of *abstract classes*, even in JavaScript.
- **Strong typing even in JavaScript** - Powered by *JSDoc*, no compile step required.
- **Smart runtime schema cleanup** - Identifies unused tables and columns at runtime and provides actionable cleanup through a built-in class with static methods, reducing database bloat and maintaining optimal performance.
- **Lightweight** - Requires just two dependencies, keeping the library lean and easy to integrate.
- **Combines the convenience of embedded SQLite with the strict typing of RDBMS**


# Example Code Implementation

### Creating an ORM-Compatible Class
```ts
import { Entity } from 'masquerade'

type UserSettings = {
    theme: 'light' | 'dark' | 'system'
    twoStepVerification: boolean
    locale: 'en' | 'es' | 'fr' | 'de'
}

export class User extends Entity {
    username: string
    email: string
    password: string
    createdAt: Date = new Date()
    friendList: User[] = []
    settings: UserSettings & object = {
        locale: "en",
        theme: "system",
        twoStepVerification: false
    }

    constructor(username: string, email: string, password: string) {
        super()
        this.username = username
        this.email = email
        this.password = password
    }
}
```

### Basic Find Example
```ts		
// finds any User instance with email === lookupEmail
async function findUserByEmail(lookupEmail: string): Promise<User | undefined> {
    const resultArray = await User.find({
        where: { email: lookupEmail }
    })
    // the static 'find' method above is inherited from 'Entity'

    return resultArray[0]
}
```

### Saving Instances
```ts
// Creating a new table row in the User table
const newUser = new User('JohnDoe57', 'johnDoe@yahoo.com', 'passwordHash')
// newUser will be saved to the database automatically, no explicit save call is required.

// Finding a user by email
const user = await findUserByEmail('johnDoe@yahoo.com') // The user's 'friendList' is a LazyPromise (not yet loaded - will load once awaited)
console.log(user.username === 'JohnDoe57') // true
```

### Mutating Data
All mutations are persisted implicitly and automatically, meaning that simply changing a value is enough for it to be reflected in the database.

**Mutating non-Relational Values**
```ts
user.settings.theme = 'dark' 
```

**Mutating Relational Values**
```ts
// ** Assuming the user's 'friendList' is still a LazyPromise **

// add a new relation (without having to load 'friendList')
user.friendList.push(new User('JaneDoe33', 'janeDoe@yahoo.com', 'passwordHash2')) 

// load 'friendList'
await user.friendList 

// remove a relation (requires 'friendList' to be loaded)
user.friendList.pop() 
```


# Further Reading

- **[Getting Started - Javascript](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-javascript.md#class-definitions)**
- **[Getting Started - Typescript](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-typescript.md#class-definitions)**
- **[Defining Classes: In-Depth](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/in-depth-class-definitions.md)** **(important read)**
- **[Find Method](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/find.md#find)**
- **[Saving to Database](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/saving-to-database.md#saving-to-the-database)**
- **[Deleting Instances from the Database](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/deletion.md)**
- **[Managing Database Tables](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/managing-the-database.md)**
- **[JSDoc – UX Tips](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/jsdoc-ux-tips.md)**

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
