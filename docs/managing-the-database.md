

# Managing Database Tables

With time, databases can get messy with unused tables or columns that need dropping.    
On booting, the ORM will warn you of any such tables or columns, to allow you to keep track of any redundancies.    

We offer a simple way to clean up your database using the `DbManager` class and its static methods.


```js
import { DbManager } from 'masquerade'
// will drop all unused columns in the database
await DbManager.dropUnusedColumns() 
// will drop all unused columns in entity_table
await DbManager.dropUnusedColumns('entity_table') 

// will delete unused entity tables in the database
await DbManager.dropUnusedTables() 
// will delete the table 'unused_entity_table' (won't delete a table that is connected to the ORM)
await DbManager.dropUnusedTables('unused_entity_table') 

// will delete unused junction tables in the database
await DbManager.dropUnusedJunctions() 
// will delete the table 'unused_junction_table' (won't delete a table that is connected to the ORM)
await DbManager.dropUnusedJunctions('unused_junction_table') 
```

<br>
<div align="center">
  <strong>
    © 2026 
    <a href="https://github.com/MasqueradeORM">MasqueradeORM </a>
		-
    Released under the MIT License
  </strong>
</div>
