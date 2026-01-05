<div align="center">
  <a href="#">
  <img
  src="https://github.com/user-attachments/assets/3bf1ab31-f9c6-4362-b17d-1dfe7c414f17"
  alt="Masquerade ORM Logo"
  style="max-width: 100%; height: auto;"
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
- **Abstract and non-abstract inheritance** - abstract classes in JS? Yes.
- **Combines the convenience of embedded SQLite with the strict typing of RDBMS**
- **Eager and lazy relations**
- **Unidirectional, bidirectional, and self-referenced relations**


# Example Code Implementation

```js
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body

  const uniqueCheck = await User.find({
    relationalWhere: (user) => sql`${user.username} = ${username} OR ${user.email} = ${email}`
  })

  if (uniqueCheck.length) return res.status(400).json({ message: 'User already exists.' })
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = new User(username, email, hashedPassword)
    res.status(201).json({ message: 'User registered successfully.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})
```

```js
app.post('/chat/add-admin', async (req, res) => {
  const { chatId, requestingAdminId, newAdminId } = req.body

  const chat = await Chat.find({
    where: {
      id: chatId,
      chatSettings: sql`json_extract(#, '$.adminIds') LIKE '%"${requestingAdminId}"%'`,
      users: { id: newAdminId }
    }
  })[0]

  if (!chat) return res.status(400).json({ message: 'Bad Request.' })
  
  try {
    chat.chatSettings.adminIds.push(newAdminId)
    res.status(200).json({ message: 'New chat admin added.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

```



```js
app.post('/chat/add-message', async (req, res) => {
  const { chatId, senderId, messageContent } = req.body

  const chat = await Chat.find({
    relations: {
      users: true,
      messages: true
    },
    where: {
      id: chatId,
      users: { id: senderId } 
    }
  })[0]

  if (!chat) return res.status(400).json({ message: 'Chat not found or user not part of chat.' })
  
  try {
    const newMessage = new Message(senderId, messageContent, new Date())
    chat.messages.push(newMessage)
    res.status(201).json({ message: 'Message sent successfully.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})
```

# Further Reading

- **[Getting Started - Javascript](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-Javascript.md#class-definitions)**
- **[Getting Started - Typescript](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/getting-started-Typescript.md#class-definitions)**
- **[Find Method](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/find.md#find)**
- **[Saving to the Database](https://github.com/MasqueradeORM/MasqueradeORM/blob/master/docs/saving-to-database.md#saving-to-the-database)**








