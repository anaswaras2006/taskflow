# TaskFlow

A calm, simple task manager — built as a learning project to practice full-stack web development.

## What it does

- Sign up / log in with your own account
- Add tasks with a due date and priority (High/Low)
- Organize tasks into folders
- Mark tasks complete
- See reminders for tasks due today and tomorrow
- Each user only sees their own tasks — data is kept private per account

## Built with

- **Front-end:** HTML, CSS, JavaScript (no frameworks)
- **Back-end:** Node.js + Express
- **Database:** MongoDB (via Mongoose)
- **Authentication:** express-session + bcrypt (passwords are hashed, never stored as plain text)

## Project structure

```
taskflow/
  frontend/       → the website itself (HTML, CSS, JS, images)
  node/           → the backend server that talks to MongoDB
    server.js
    package.json
```

## How to run it locally

1. Make sure MongoDB is running on your computer.
2. Open a terminal inside the `node` folder.
3. Install dependencies:
   ```
   npm install
   ```
4. Start the server:
   ```
   node server.js
   ```
5. Open your browser to:
   ```
   http://localhost:3000
   ```

## Status

This is a personal learning project — built step by step while learning Node.js, MongoDB, and basic authentication.
