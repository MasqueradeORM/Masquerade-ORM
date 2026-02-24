# Saving to the Database
In MasqueradeORM, changes to instances will be persisted automatically and `implicitly`.
If you prefer you can always `explicitly` write to the database using the `save()` method.


## Implicit Persistence
The code below is all that is needed to write a new class instance into the database:
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

### How does this work under the hood?  

When you mutate a class instance, changing a value or adding/removing a relation, the ORM doesn’t write to the database immediately.   
Instead, it tracks those changes and batches them together to optimize the save operation.

Whenever the server is about to perform an async operation (for example, when execution hits an await), the ORM assumes that a database read might happen next. Before that happens, it automatically saves everything that’s pending.


Below is the order of operations:   
**create/change data → hit an async boundary → ORM saves → safe to read**

### Shutting Off Server for Implicit Save Enjoyers

When shutting off the server, to guarantee that all instance/row mutations are saved safely, perform a read operation:

```js
async function shutdown() {
  console.log('Shutting down gracefully…')

  await SomeClass.find({ where: { updatedAt: new Date() } })

  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
}
```

## Explicit Persistence

```js
const user = await User.find({where: id: 123)})
user.isAdmin = true
try {
  await user.save()
} 
catch (e) {
  console.log(e)
}
```

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