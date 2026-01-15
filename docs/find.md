# Find

```js
await ExampleClass.find(findObj)
```

The find method is the most complex part of the ORM - **IntelliSense is your friend.**

It accepts a single argument, findObj, which contains three optional fields.
Because all fields are optional, findObj itself may be an empty object (although this is rarely useful, as it would return all instances of ExampleClass).

The three optional fields are:

- relations
- where
- relationalWhere

**Note: findObj is fully covered by IntelliSense. You are strongly encouraged to rely on it.**


## The `relations` Field:

The `relations` field determines which relations are eagerly loaded from the database.

A crucial detail to understand is that relations are never filtered.
They are either loaded or not. The ORM never displays partial relational data.

```js
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

```js
// 1-to-1 relationship case
exampleClassInstance.relationalProp === someClassId57 
```    
or   
```js
// 1-to-many relationship case
exampleClassInstance.relationalProp.includes(someClassId57)
```    

### Lazy Loading

```js
// Assume the 'Chat' class has relational properties 'users' and 'messages'.
// Initially, we load only the 'messages' relation for a specific chat.

const resultArray = await Chat.find({
    relations: { messages: true }, // eager load the 'messages' relation
    where: { id: 123 } // fetch the chat with ID 123
})

const someChat = resultArray[0]

// At this point, 'someChat.users' is not loaded. 
// To load the 'users' relation, we need to await it.
await someChat.users
```


## The `where` Field:

The `where` field is for filtering the root instances, in the following case, Chat instances.
```js
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

- **note:** The scope of the `where` condtions is agnostic to the scope of the `relations` (eager-loading).       
It is completely safe to filter based on specific relations without having said relations passed into the `relations` field.      

### Introduction to the `sql`, `OR` and `AND`  functions 

```js
import { sql, AND, OR } from "masquerade"

await Angel.find({
    where: {
        // name is either "Micheal" OR "Gabriel"
        name: OR('Micheal', 'Gabriel'),

        // demonsSentToAbyss is greater than 12,000 AND less than 57,000
        demonsSentToAbyss: AND(sql`> 12000`, sql`< 57000`)
    }
})
```

### Using the `sql` function with explicit column identifiers   
In the previous example, the `sql` function implicitly inserted a column identifier (`#`) on the left side of the SQL statement. 
```js
// these two statements are equivalent
sql`> 12000`  
sql`# > 12000` 
```

In next example, `#` identifiers must be written explicitly because the SQL string uses `AND` conditional operators directly, rather than using the `AND()` helper function.

```js
import { sql } from "masquerade"

const twoYearsAgo = new Date().setFullYear(new Date().getFullYear() - 2)
const oneYearAgo = new Date().setFullYear(new Date().getFullYear() - 1)

await User.find({
    where: {
        // donations between 1,200 and 5,700 cents (exclusive)
        donations: sql`1200 < # AND # < 5700`, 

        // account's age is between one and two years old.
        createdAt: sql`${twoYearsAgo} <= # AND # <= ${oneYearAgo}` 
    }
})
// The ANDs are written directly inside the 'sql' string instead of 
// having to rely on helper functions to achieve the same result. 
// The 'sql' function gives you the ability to write powerful
// 'where' conditions in an easy-to-read and easy-to-write manner.
```

### Using the `sql` function to create a `LIKE` `WHERE` condition 
```js
import { sql } from "masquerade"

await User.find({
    where: {
        // registered using a Gmail email
        email: sql`LIKE '%@gmail.com%'`
    }
})
```

### Using the `sql` function to create a `WHERE` condition for matching JSON values

```ts
import { Entity } from "masquerade"

type OrderOverview = {
  status: "pending" | "completed" | "cancelled"
  total: number
  currency: string
}

class Order extends Entity {
  // other properties...
  metadata: UserMetadata
  // other properties + constructor...
}

const completedOrders = await Order.find({
  where:
    { overview: sql`json_extract(#, '$.status') = 'completed'` }
})
```

- **note:** for SQL-client specific guide for writing `WHERE` conditions involving JSON and array data, go to the bottom of this page or click **[here](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/find.md#array-and-json-where-conditions-guide)**.


## The `relationalWhere` Field:

```js
import { sql } from "masquerade"

// Finds users that have at least one chat that contains at least one message whose sender's username is 'Glory2Christ'.
await User.find({
   relationalWhere: (user) => sql`${user.chats.messages.sender.username} = 'Glory2Christ'`
})
```

```js
import { sql } from "masquerade"

// Identical to the previous example, but here the relational where is called from a different scope.
// note: the field has an underscore, to prevent any (rather impossible) name collisions.

await User.find({
  where: {
    chats: {
      relationalWhere_: (chat) => sql`${chat.messages.sender.username} = 'Glory2Christ'`,
      // can be combined with regular 'where' conditions - below is valid code
      // chatName: 'The History of Orthodoxy' 
    }
  }
})
```

### Array and JSON `WHERE` Conditions Guide

The model we will use for the examples:

```ts
import { Entity } from "masquerade"

type UserMetadata = {
  roles: string[]          // e.g., ["admin", "moderator"]
  lastLogin?: string       // optional, ISO date string
  preferences?: {
    theme?: "light" | "dark"
    notifications?: boolean
  }
}

class User extends Entity {
  // other properties...
  metadata: UserMetadata
  sessions: string[]
  // other properties + constructor...
}
```

Assuming we are writing the condition for the column/property `metadata` like so:
```ts
import { sql } from "masquerade"

const users = await User.find({where: {metadata: sql`_CONDITION_STRING_FROM_BELOW_`}})

// *for sessions* corresponds to the conditional of
const users = await User.find({where: {sessions: sql`_CONDITION_STRING_FROM_BELOW_`}})

// **if not specified, the default is the 'metadata' find
```

**Condition String Table**

| Operation    | SQLite      | PostgreSQL   |
|-------------|---------------|------------|
Array length | **for metadata** <br> `json_array_length(json_extract(#, '$.roles')) > 2` <br> **for sessions** <br> `json_array_length(json_extract(#)) > 2` | **for metadata** <br> `jsonb_array_length(#->'roles') > 2` <br> **for sessions** <br> `jsonb_array_length(#) > 2`|
| Access index `i` of array   | **for metadata** <br>`json_extract(#, '$.roles[i]') = 'admin'`<br> **for sessions** <br>`json_extract(#, '$[i]') = 'SOME_SESSION_ID'` | **for metadata** <br>`#->'roles'->>i = 'admin''`<br> **for sessions** <br>`#->>i = 'admin'` |
| Check if array contains a value | `json_extract(#, '$.roles') LIKE '%"admin"%'` | `#->'roles' @> '["admin"]'::jsonb` |
Check nested field | `json_extract(#, '$.preferences.theme') = 'dark'` | `#->'preferences'->>'theme' = 'dark'` |
| 


<br>
<div align="center">
  <strong>
    © 2026 
    <a href="https://github.com/MasqueradeORM">MasqueradeORM </a>
		-
    Released under the MIT License
  </strong>
</div>