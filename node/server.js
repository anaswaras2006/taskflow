// ============================================================
// TaskFlow backend — Express + MongoDB (via Mongoose)
// Now with user accounts, so each person only sees their own
// tasks and folders.
// ============================================================

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const PORT = 3000;

mongoose.connect("mongodb://127.0.0.1:27017/taskflow")
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Sessions — this is the "wristband" that lets the server
// remember who's logged in between requests.
app.use(session({
    secret: "change-this-to-any-random-text-you-like",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // stays logged in for 7 days
}));

app.use(express.static(path.join(__dirname, "..", "frontend")));

// ------------------------------------------------------------
// Schemas
// ------------------------------------------------------------

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true }
});

const taskSchema = new mongoose.Schema({
    text: { type: String, required: true },
    dueDate: { type: String, default: "" },
    priority: { type: String, default: "High" },
    completed: { type: Boolean, default: false },
    folder: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
});

const folderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const Folder = mongoose.model("Folder", folderSchema);

// ------------------------------------------------------------
// Auth routes
// ------------------------------------------------------------

// create a new account
app.post("/api/signup", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }
    const existing = await User.findOne({ username });
    if (existing) {
        return res.status(400).json({ error: "That username is already taken" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash });
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;
    res.json({ username: user.username });
});

// log in to an existing account
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(401).json({ error: "Incorrect username or password" });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ error: "Incorrect username or password" });
    }
    req.session.userId = user._id;
    req.session.username = user.username;
    res.json({ username: user.username });
});

// log out
app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// check who's currently logged in (frontend calls this on page load)
app.get("/api/me", (req, res) => {
    if (req.session.userId) {
        res.json({ username: req.session.username });
    } else {
        res.json({ username: null });
    }
});

// this "gatekeeper" blocks access to task/folder routes unless logged in
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not logged in" });
    }
    next();
}

// ------------------------------------------------------------
// Task routes (all require login, all scoped to the logged-in user)
// ------------------------------------------------------------

app.get("/api/tasks", requireAuth, async (req, res) => {
    const tasks = await Task.find({ userId: req.session.userId });
    res.json(tasks);
});

app.post("/api/tasks", requireAuth, async (req, res) => {
    const { text, dueDate, priority, folder } = req.body;
    const task = new Task({
        text, dueDate, priority,
        folder: folder || null,
        userId: req.session.userId
    });
    await task.save();
    res.json(task);
});

app.put("/api/tasks/:id", requireAuth, async (req, res) => {
    const task = await Task.findOneAndUpdate(
        { _id: req.params.id, userId: req.session.userId },
        req.body,
        { new: true }
    );
    res.json(task);
});

app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
    res.json({ success: true });
});

// ------------------------------------------------------------
// Folder routes (also scoped to the logged-in user)
// ------------------------------------------------------------

app.get("/api/folders", requireAuth, async (req, res) => {
    const folders = await Folder.find({ userId: req.session.userId });
    res.json(folders);
});

app.post("/api/folders", requireAuth, async (req, res) => {
    const { name } = req.body;
    const exists = await Folder.findOne({ name, userId: req.session.userId });
    if (exists) return res.status(400).json({ error: "Folder already exists" });
    const folder = new Folder({ name, userId: req.session.userId });
    await folder.save();
    res.json(folder);
});

app.put("/api/folders/:id", requireAuth, async (req, res) => {
    const { name: newName } = req.body;
    const folder = await Folder.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    const oldName = folder.name;
    folder.name = newName;
    await folder.save();
    await Task.updateMany(
        { folder: oldName, userId: req.session.userId },
        { folder: newName }
    );
    res.json(folder);
});

app.delete("/api/folders/:id", requireAuth, async (req, res) => {
    const folder = await Folder.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    await Task.deleteMany({ folder: folder.name, userId: req.session.userId });
    await Folder.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`🚀 TaskFlow running at http://localhost:${PORT}`);
});