<div align="center">
  <a href="#">
  <img
  src="https://github.com/user-attachments/assets/3bf1ab31-f9c6-4362-b17d-1dfe7c414f17"
  alt="Masquerade ORM Logo"
  style="max-width: 50%; height: auto;"
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

MasqueradeORM improves readability, maintainability, and workflow simplicity through a unified coding approach and extremely minimal setup.    
No ORM offers a simpler start.    
There’s no need to manage heavy configuration layers, maintain secondary schema systems, or even plan your database structure separately.  
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
- **Write complex WHERE conditions using a template-literal helper** – enabling expressive comparisons like >=, LIKE, object-property access, and even array element matching, all without cluttering your query code.
- **SQL injection protection** – all queries are parameterized.
- **Lightweight** – minimal dependencies.
- **Strong typing even in JavaScript** – powered by JSDoc, no compile step required.
- **Reduced data transfer size** - improves performance in client-server setups (not applicable for embedded databases like SQLite).
- **Abstract and non-abstract inheritance** - enables the use of abstract classes, even in JavaScript.
- **Combines the convenience of embedded SQLite with the strict typing of RDBMS**
- **Eager and lazy relations**
- **Unidirectional, bidirectional, and self-referenced relations**


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
    settings: UserSettings = {
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
const user = await findUserByEmail('johnDoe@yahoo.com') // user's friendList is a promise
console.log(user.username === 'JohnDoe57') // true
```

### Mutating Data
All mutations are persisted implicitly and automatically, meaning that simply changing a value is enough for it to be reflected in the database.

**Mutating non-Relational Properties**
```ts
user.settings.theme = 'dark' 
```

**Mutating Relational Properties**
```ts
// lazy-load friendList
await user.friendList 
// add a new relation
user.friendList.push(new User('JaneDoe33', 'janeDoe@yahoo.com', 'passwordHash2')) 
// remove a relation
user.friendList.pop() 
```


# Further Reading

- **[Getting Started - Javascript](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-Javascript.md#class-definitions)**
- **[Getting Started - Typescript](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-Typescript.md#class-definitions)**
- **[Find Method](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/find.md#find)**
- **[Saving to the Database](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/saving-to-database.md#saving-to-the-database)**
- **[Deletion](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/deletion.md)**
- **[Managing the Database](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/managing-the-database.md)**
- **[Operational Edge Cases](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/operational-edge-cases.md)**




<br >
<div align="center" > 
<strong>
© 2026 MasqueradeORM. Released under the MIT License.
</div>





