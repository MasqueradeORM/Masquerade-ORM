# Saving to the Database

To create an entity table row, instantiate any class that was passed to the ORM.boot method:    
```js
new YourClass()
```

A natural question is whether this instance is automatically persisted - the answer is yes.   
The ORM performs an implicit save that is triggered in one of two situations:

- When the current environment scope exits
- Immediately before any find method is executed

This guarantees that all pending instances are flushed to the database before read operations occur.

**Manual Saves**
  
If you intend to execute raw SQL queries after using the ORM’s find methods within the same environment scope, you should explicitly call:
```js
await flush()
```
