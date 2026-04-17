# Find

```js
await ExampleClass.find(findObj)
```

The `find` method is the most complex part of the ORM. **Fortunately, it is fully covered by IntelliSense, and you are strongly encouraged to rely on it.**

It accepts a single argument, `findObj`, which contains three optional fields.
Because all fields are optional, `findObj` itself may be an empty object (although this is rarely useful, as it would return all instances of `ExampleClass`).

The 6 optional fields are:

- relations
- where
- templateWhere
- orderBy
- limit
- offset



## The `relations` Field

The `relations` field determines which relations are `eagerly-loaded` from the database.

A crucial detail to understand is that relations are **never filtered - they are either loaded or not loaded.** The ORM **never produces partial relational-data states.**

```js
// assume that relationalProp is a property of type SomeClass or SomeClass[]

const foundExamples = await ExampleClass.find(
    {
        relations: {relationalProp: true}, // eager-load relationalProp data
        where: {
            relationalProp: {
                id: 57
            }
        }
    }
)

const someClassId57 = await SomeClass.find({ where: { id: 57 } })
```

The example above translates to:   
**“`foundExamples` contains all the instances of ExampleClass whose relationalProp contains `someClassId57`”**

In other words, the below examples will always log `true`:  

```js
// 1-to-1 relation case
foundExamples.forEach(example =>
  console.log(example.relationalProp === someClassId57)
)
```

```js
// 1-to-many relation case
foundExamples.forEach(example =>
  console.log(example.relationalProp.includes(someClassId57))
)
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


## The `where` Field

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

- **Note:** The scope of the `where` condtions is agnostic to the scope of the `relations` (eager-loading).       
It is completely safe to filter based on specific relations without having said relations passed into the `relations` field.      

### Introduction to the `sql` and `OR` functions 

```js
import { sql, OR } from "masquerade-orm"

await Angel.find({
    where: {
        // name is "Micheal" OR "Gabriel"
        name: OR('Micheal', 'Gabriel'),

        // demonsSentToAbyss is greater than 5,700
        demonsSentToAbyss: sql`> 5700`
    }
})
```

### Using the `sql` function with explicit column ID placeholders   
In the previous example, the `sql` function implicitly inserted a column identifier placeholder (`#`) on the left side of the SQL statement. 
```js
// these two statements are equivalent
sql`> 5700`  
sql`# > 5700` 
```

In next example, `#` placeholders must be written explicitly because the SQL string uses `AND` conditional operators.

```js
import { sql } from "masquerade-orm"

const twoYearsAgo = new Date().setFullYear(new Date().getFullYear() - 2)
const oneYearAgo = new Date().setFullYear(new Date().getFullYear() - 1)

await User.find({
    where: {
        // donations between 1,200 and 5,700 cents (exclusive)
        donations: sql`1200 < # AND # < 5700`, 

        // account's age is between one and two years old (inclusive).
        createdAt: sql`${twoYearsAgo} <= # AND # <= ${oneYearAgo}` 
    }
})
```

**Equivalent Alternative Syntax:** 
```js
await User.find({
    where: {
        donations: (donations) => sql`1200 < ${donations} AND ${donations} < 5700`, 
        createdAt: (createdAt) => sql`${twoYearsAgo} <= ${createdAt} AND ${createdAt} <= ${oneYearAgo}` 
    }
})
```

### Using the `sql` function to create a `LIKE` `WHERE` condition 
```js
import { sql } from "masquerade-orm"
const likeParam = '%@gmail.com%'
await User.find({
    where: {
        // registered using a Gmail email
        email: sql`LIKE ${likeParam}`
    }
})
```

### Using the `sql` function to create a `WHERE` condition for matching JSON values

```ts
import { Entity } from "masquerade-orm"

type OrderOverview = {
  status: "pending" | "completed" | "cancelled"
  total: number
  currency: string
}

class Order extends Entity {
  overview: OrderOverview & object
  // other properties + constructor
}

const completedOrders = await Order.find({
  where:
    { 
        overview: {
            status: 'completed'
        } 
    }
})
```

- **Note:** for SQL-client specific guide for writing `WHERE` conditions involving JSON/object or array values, go to the bottom of this page or click **[here](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/find.md#array-and-json-where-conditions-guide)**.


## The `templateWhere` Field

```js
import { sql } from "masquerade-orm"

// Finds users that have at least one chat that contains at least one message whose sender's username is 'Glory2Christ'.
await User.find({
   templateWhere: (user) => sql`${user.chats.messages.sender.username} = 'Glory2Christ'`
})
```

```js
import { sql } from "masquerade-orm"

// Identical to the previous example, but here the 'templateWhere' is called from a different scope.
// note: the field has a $, to prevent any (rather impossible) name collisions.

await User.find({
  where: {
    chats: {
      $templateWhere: (chat) => sql`${chat.messages.sender.username} = 'Glory2Christ'`,
      // can be combined with regular 'where' conditions - below is valid code
      // chatName: 'The History of Orthodoxy' 
    }
  }
})
```

### Array and JSON `WHERE` Conditions Guide

The model we will use for the examples:

```ts
import { Entity } from "masquerade-orm"

type UserMetadata = {
  roles: string[]          // e.g. ["admin", "moderator"]
  lastLogin?: string       // optional, ISO date string
  preferences: {
    theme: "light" | "dark"
    notifications: boolean
  }
}

class User extends Entity {
  metadata: UserMetadata
  sessions: string[]
  // other properties + constructor
}
```

Assuming we are writing the condition for the property `metadata` or `sessions`  like so:
```ts
import { sql } from "masquerade-orm"
// 'metadata' find
const users = await User.find({where: {metadata: sql`_OPERATION_STRING_`}})

// 'sessions' find 
const users2 = await User.find({where: {sessions: sql`_OPERATION_STRING_`}})

// **if not specified, the default is the 'metadata' find

// replace _OPERATION_STRING_ with the appropriate 
// operation string from the table below
```

**Operation String Table**

| Operation    | SQLite      | PostgreSQL   |
|-------------|---------------|------------|
Array length <br>(example uses len = 2) | **'metadata' find** <br> `json_array_length(json_extract(#, '$.roles')) > 2` <br> **'sessions' find** <br> `json_array_length(json_extract(#)) > 2` | **'metadata' find** <br> `jsonb_array_length(#->'roles') > 2` <br> **'sessions' find** <br> `jsonb_array_length(#) > 2`|
| Access index `i` of array   | **'metadata' find** <br>`json_extract(#, '$.roles[i]') = 'admin'`<br> **'sessions' find** <br>`json_extract(#, '$[i]') = 'SOME_SESSION_ID'` | **'metadata' find** <br>`#->'roles'->>i = 'admin''`<br> **'sessions' find** <br>`#->>i = 'admin'` |
| Check if array contains a value | `json_extract(#, '$.roles') LIKE '%"admin"%'` | `#->'roles' @> '["admin"]'::jsonb` |
Check nested field | `json_extract(#, '$.preferences.theme') = 'dark'` | `#->'preferences'->>'theme' = 'dark'` |


## Understanding `null` vs `undefined` values in `WHERE` clauses

When constructing queries, null and undefined behave very differently in `WHERE` conditions (both in regular `where` or `templateWhere`):

<p style="text-align:center">
<strong>null === omit condition from query</strong><br>
<strong>undefined === SQL NULL</strong>
</p>

Passing `null` in a `WHERE` clause omits the condition entirely. This is useful for conditionally adding filters. While `undefined` is the same as saying “where this column value is NULL“.

```js
async function findUserById(lookupId, allowDeleted = false) {
    const resultArray = await User.find({
        where: { 
            id: lookupId, 
            deletedAt: allowDeleted ? null : undefined
            }
    })
    return resultArray[0]
}
```
Here, when `allowDeleted === true`, the `deletedAt` condition is ignored and the query returns a user regardless of `deletedAt` value and filters only by `id` value.

When `allowDeleted === false`, the result will only include a user who has a `deletedAt` value of NULL on the database.
The ORM maps SQL NULL values back to `undefined` values in your application code.

## The `limit` and `offset` fields

Before diving into the `orderBy` field, let’s quickly review the simple `limit` and `offset` fields:

- **`limit`** restricts the number of results returned to **N**, where N is the integer value of `limit`.  
- **`offset`** skips the first **N** results, where N is the integer value of `offset`.

Together, these fields allow for the implementation of pagination logic.


## The `orderBy` Field

The `orderBy` field determines how the **base entity instances in the returned array** are sorted. Similar to how `WHERE` arguments only determine which base instances are returned (without filtering relational data), `orderBy` conditions **affect only the order of the base entity instances**. In other words, `orderBy` will **NOT** sort relational data. 

The `orderBy` argument supports more than simple `ASC` (ascending) or `DESC` (descending) ordering; it can also use **aggregate functions** for sorting, which can take relational data and parameter values as arguments.

- **Top 10 largest donations with newest users first**
```js
// Breaking tied amounts first by newest user, then by newest donation.
const topTenDonations = await Donations.find({
    orderBy: {
        amount: 'DESC',
        user: {
            createdAt: 'DESC',
        },
        createdAt: 'DESC',
    },
    limit: 10
})
```

- **Top 10 largest donations from long term users**
```js
// Fetch top 10 largest donations from users older than 3 years, breaking ties first by oldest user, then by newest donation.

const threeYearsAgo = new Date();
threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

const topTenDonationsOldUsers = await Donations.find({
    orderBy: {
        amount: 'DESC',
        user: {
            createdAt: 'ASC',
        },
        createdAt: 'DESC',
    },
    limit: 10,
    where: {
        user: {
            createdAt: sql`<= ${threeYearsAgo}` 
        }
    }
})
```

- **Find products under a max price ordered by average rating:**

```js
// Assuming the class Product has a relational property 'reviews' of type Review[], with Review having a property of 'rating' that is of type number.

const maxPrice = 30
const products = await Product.find({
    orderBy: {
        $templateOrderBy: (product) => sql`AVG(${product.reviews.rating})`,
        $aggregate: true, // since AVG() is an aggregate function, this must be set to true
    },
    where: { price: sql`<= ${maxPrice}` }
})
```

- **Find pet shops near a user with weighted ranking and paginated results:**
```js
const userLocation = {
    latitude: 40.7128,
    longitude: -74.0060,
    city: `New York City`
}

// Weights for the ranking formula: how much each factor contributes to the overall score
const weights = {
    rating: 0.5,    // 50% weight for the shop's rating
    distance: 0.3,  // 30% weight for proximity (closer is better)
    price: 0.2      // 20% weight for affordability (lower priceLevel is better)
}

// Weighted score template for ORDER BY
// The formula calculates a single numeric score for each shop by combining three factors:
// 1. The shop's rating normalized to a 0–1 scale, multiplied by the rating weight.
// 2. The distance between the shop and the user's coordinates (calculated using the Haversine formula),
//    inverted so that closer shops produce a higher contribution to the score, multiplied by the distance weight.
// 3. The shop's price level normalized to a 0–1 scale (lower is better), multiplied by the price weight.
const orderByFunc = (shop) => sql`
  ${weights.rating} * (${shop.rating} / 5.0)
  +
  ${weights.distance} * (
    1 / (
      1 +
      6371 * acos(
        cos(radians(${userLocation.latitude})) *
        cos(radians(${shop.latitude})) *
        cos(radians(${shop.longitude}) - radians(${userLocation.longitude})) +
        sin(radians(${userLocation.latitude})) *
        sin(radians(${shop.latitude}))
      )
    )
  )
  +
  ${weights.price} * (1 - (${shop.priceLevel} / 4.0))
  `

const page = 2
const itemsInPage, limit = 20
const offset = (page - 1) * itemsInPage

const rankedPetShops = await Shop.find({
    where: {
        type: 'petshop',
        city: userLocation.city
    },
    orderBy: {
        $templateOrderBy: orderByFunc
    },
    limit,
    offset
})
```

### Resources on Aggregate Functions 

- [PostgreSQL](https://www.postgresql.org/docs/current/functions-aggregate.html)
- [SQLite](https://sqlite.org/lang_aggfunc.html) 

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