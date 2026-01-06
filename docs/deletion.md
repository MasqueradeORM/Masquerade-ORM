# Deletion

### Soft Deletion
The ORM does not support soft deletion by default. To implement soft deletion, you need to add a `deleted` or `isDeleted` property to your classes and manually set this property value.

### Hard Deletion

Deletion of a class instance from an entity table involves a pre-deletion step.
```js

```