// ============================================================
// TaskFlow backend — Express + MongoDB (Mongoose)
// Handles: signup/login/logout, tasks CRUD, folders CRUD
// All tasks/folders are scoped to the logged-in user.
// ============================================================

// Force Node to use Google's public DNS for lookups — fixes
// "querySrv ECONNREFUSED" errors when connecting to MongoDB Atlas
// on some Windows networks/ISPs.
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Middleware
// ------------------------------------------------------------

app.use(cors({
    origin: "http://localhost:3000", // change if you serve frontend from a different port
    credentials: true
}));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true,
        secure: false // set to true once deployed behind HTTPS
    }
}));

// Serve the frontend folder as static files
// Assumes your folder structure is:
//   TODO-PROJECT/
//     backend/   <- server.js lives here
//     frontend/  <- html/css/js lives here
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ------------------------------------------------------------
// MongoDB connection
// ------------------------------------------------------------

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

// ------------------------------------------------------------
// Schemas / Models
// ------------------------------------------------------------

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true }
});

const taskSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    dueDate: { type: String, default: "" },
    priority: { type: String, enum: ["High", "Low"], default: "High" },
    folder: { type: String, default: null },
    completed: { type: Boolean, default: false }
});

const folderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const Folder = mongoose.model("Folder", folderSchema);

// ------------------------------------------------------------
// Auth helper middleware
// ------------------------------------------------------------

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not logged in." });
    }
    next();
}

// ------------------------------------------------------------
// Auth routes
// ------------------------------------------------------------

app.post("/api/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Password should be at least 6 characters." });
        }

        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: "That username is already taken." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, passwordHash });

        req.session.userId = user._id;
        req.session.username = user.username;
        res.json({ username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: "Invalid username or password." });
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(400).json({ error: "Invalid username or password." });
        }

        req.session.userId = user._id;
        req.session.username = user.username;
        res.json({ username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
    });
});

app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
        return res.json({ username: null });
    }
    res.json({ username: req.session.username });
});

// ------------------------------------------------------------
// Task routes (all require login, all scoped to req.session.userId)
// ------------------------------------------------------------

app.get("/api/tasks", requireLogin, async (req, res) => {
    const tasks = await Task.find({ userId: req.session.userId });
    res.json(tasks);
});

app.post("/api/tasks", requireLogin, async (req, res) => {
    try {
        const { text, dueDate, priority, folder } = req.body;
        if (!text) return res.status(400).json({ error: "Task text is required." });

        const task = await Task.create({
            userId: req.session.userId,
            text,
            dueDate: dueDate || "",
            priority: priority || "High",
            folder: folder || null
        });
        res.json(task);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not create task." });
    }
});

app.put("/api/tasks/:id", requireLogin, async (req, res) => {
    try {
        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, userId: req.session.userId },
            req.body,
            { new: true }
        );
        if (!task) return res.status(404).json({ error: "Task not found." });
        res.json(task);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not update task." });
    }
});

app.delete("/api/tasks/:id", requireLogin, async (req, res) => {
    try {
        await Task.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not delete task." });
    }
});

// ------------------------------------------------------------
// Folder routes
// ------------------------------------------------------------

app.get("/api/folders", requireLogin, async (req, res) => {
    const folders = await Folder.find({ userId: req.session.userId });
    res.json(folders);
});

app.post("/api/folders", requireLogin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Folder name is required." });

        const folder = await Folder.create({ userId: req.session.userId, name });
        res.json(folder);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not create folder." });
    }
});

app.put("/api/folders/:id", requireLogin, async (req, res) => {
    try {
        const folder = await Folder.findOneAndUpdate(
            { _id: req.params.id, userId: req.session.userId },
            { name: req.body.name },
            { new: true }
        );
        if (!folder) return res.status(404).json({ error: "Folder not found." });
        res.json(folder);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not rename folder." });
    }
});

app.delete("/api/folders/:id", requireLogin, async (req, res) => {
    try {
        await Folder.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not delete folder." });
    }
});

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`🚀 TaskFlow server running at http://localhost:${PORT}`);
});