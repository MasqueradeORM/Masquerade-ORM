<div align="center">
  <a href="#">
  <img
  src="https://github.com/user-attachments/assets/3bf1ab31-f9c6-4362-b17d-1dfe7c414f17"
  alt="Masquerade ORM Logo"
  style="max-width: 85%; height: auto;"
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
- **SQL injection protection** – all queries are parameterized.
- **Lightweight** – minimal dependencies.
- **Strong typing even in JavaScript** – powered by JSDoc, no compile step required.
- **Reduced data transfer size** - improves performance in client-server setups (not applicable for embedded databases like SQLite).
- **Abstract and non-abstract inheritance** - enables the use of abstract classes, even in JavaScript.
- **Combines the convenience of embedded SQLite with the strict typing of RDBMS**
- **Eager and lazy relations**
- **Unidirectional, bidirectional, and self-referenced relations**


# Example Code Implementation

```js
// Creating a new ORM-compatible class using JSDoc
import { Entity } from 'masquerade'

/**
 * @typedef {Object} ChatSettings
 * @property {boolean} isPrivate
 * @property {number} userLimit
 * @property {string[]} adminIds
 * @property {string[]} bannedIds
 */

export class TestChat extends Entity {
    /**@type {string}*/ chatName
    /**@type {TestUser[]}*/ users
    /**@type {TestMessage[]}*/ messages = []
    /**@satisfies {ChatSettings}*/ chatSettings // to map to JSON on the sql side, use 'satisfies'
    /**@type {Date}*/ createdAt = new Date()

    constructor (chatName, /**@type {TestUser}*/ creator) {
        super()
        this.chatName = chatName
        this.users = [creator]
        this.chatSettings = {
            isPrivate: true,
            userLimit: 20,
            adminIds: [creator.id],
            bannedIds: []
        }
    }
}

/**@typedef {import('masquerade').integer} integer */
export class Product extends Entity {
    /**@type {number}*/ price // maps to float column
    /**@type {integer}*/ itemsInStock // maps to integer column

    constructor (price, itemsInStock) {
        this.price = price
        this.itemsInStock = itemsInStock
    }
}
```

```js
// Handling a new chat message
const { chatId, senderId, messageContent } = requestParams

// Find a chat with the provided chatId, ensure that 
// the message sender is an actual user of the chat, 
// and eagerly-load the messages of the chat to add the new sent message.
const chat = (await Chat.find({
    relations: {
        messages: true
    },
    where: {
        id: chatId,
        users: { id: senderId } 
    }
}))[0]

if (!chat) {
    console.log("Chat not found or user is not a valid user of chat.")
    return
} 

const newMessage = new Message(senderId, messageContent, new Date()) // new row added to the message table.
chat.messages.push(newMessage) // new message is associated with the chat.
console.log("Request fulfilled successfully.")
```

```js
// Adding new chat admin
const { chatId, requestingAdminId, newAdminId } = requestParams

// Find a chat with the provided chatId, ensure the requesting user is an admin (based on adminIds in chatSettings),
// and confirm that the newAdminId is a user in the chat.
const chat = (await Chat.find({
    where: {
        id: chatId,
        // below is equivalent to chat.chatSettings.adminIds.includes(requestingAdminId)
        chatSettings: sql`json_extract(#, '$.adminIds') LIKE '%"${requestingAdminId}"%'`,
        users: { id: newAdminId }
    }
}))[0] 

if (!chat) {
    console.log("Bad Request")
    return
}

chat.chatSettings.adminIds.push(newAdminId) 
// 'chatSettings' object will be updated in db to include the new admin
console.log("Request fulfilled successfully.")
```

```js
// User registration
const { username, email, password } = requestParams

const uniqueCheck = await User.find({
    relationalWhere: (user) => sql`${user.username} = ${username} OR ${user.email} = ${email}`
})

if (uniqueCheck.length) {
    console.log("Username or email is already taken.")
    return
} 

const hashedPassword = await bcrypt.hash(password, 10)
const newUser = new User(username, email, hashedPassword) // user is saved implicitly
console.log("Request fulfilled successfully.")
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





