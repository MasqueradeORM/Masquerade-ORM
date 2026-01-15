# Saving to the Database
In MasqueradeORM there is no explicit save call.

The code below is all that is needed to persist a new class instance in the database:
```js
new YourClass() 
```

The code below is all that is needed to persist any mutation to a class instance:
```js
// toggles a boolean value and persists the change
yourInstance.booleanValue = !yourInstance.booleanValue

// overwrites a 1-to-1 relationship and persists it
yourInstance.exampleRelation = new ExampleRelation()
```

**How does this work under the hood?**  

When you mutate a class instance, changing a value or adding/removing a relation, the ORM doesn’t write to the database immediately.   
Instead, it tracks those changes and batches them together to optimize the save operation.

Whenever the server is about to perform an async operation (for example, when execution hits an await), the ORM assumes that a database read might happen next. Before that happens, it automatically saves everything that’s pending.


Below is the order of operations:   
**create/change data → hit an async boundary → ORM saves → safe to read**

