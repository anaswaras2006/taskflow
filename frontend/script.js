// ============================================================
// TaskFlow front-end — now talks to the MongoDB backend
// (server.js) over HTTP instead of using localStorage.
// ============================================================

const API = "/api";

let tasks = [];    // flat list of every task, loaded from the server
let folders = [];  // list of folder objects: { _id, name }

let currentTaskView = "all";

window.onload = async () => {
    // check if someone is actually logged in before showing anything
    const meRes = await fetch(`${API}/me`, { credentials: "include" });
    const me = await meRes.json();
    if(!me.username){
        window.location.href = "login.html";
        return;
    }
    const welcomeName = document.getElementById("welcomeUsername");
    if(welcomeName) welcomeName.textContent = me.username;

    const today = new Date().toISOString().split("T")[0];
    document.getElementById("dueDate").min = today;
    await showTab("home");
};

async function logout(){
    await fetch(`${API}/logout`, { method: "POST", credentials: "include" });
    window.location.href = "index.html";
}

async function showTab(tab){
    document.querySelectorAll(".main > div").forEach(d=>{ d.style.display="none"; });
    document.getElementById(tab+"Tab").style.display="block";
    document.querySelectorAll(".sidebar button").forEach(b=>{ b.classList.remove("active"); });
    const btn = document.getElementById("btn-" + tab);
    if(btn) btn.classList.add("active");
    await render();
}

// ------------------------------------------------------------
// Talking to the server
// ------------------------------------------------------------

async function loadData(){
    const [taskRes, folderRes] = await Promise.all([
        fetch(`${API}/tasks`, { credentials: "include" }),
        fetch(`${API}/folders`, { credentials: "include" })
    ]);
    tasks = await taskRes.json();
    folders = await folderRes.json();
}

async function addTask(){
    const text = document.getElementById("taskInput").value.trim();
    const dueDate = document.getElementById("dueDate").value;
    const priority = document.getElementById("priority").value;
    const folder = document.getElementById("folderSelect").value;

    if(!text) return;

    await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, dueDate, priority, folder: folder || null })
    });

    await showTab("tasks");
    document.getElementById("taskInput").value = "";
    document.getElementById("dueDate").value = "";
    document.getElementById("priority").value = "High";
    document.getElementById("folderSelect").value = "";
}

async function toggleTask(id){
    const task = tasks.find(t => t._id === id);
    if(!task) return;
    await fetch(`${API}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed: !task.completed })
    });
    await render();
}

async function updateTask(id){
    const task = tasks.find(t => t._id === id);
    if(!task) return;
    const newText = prompt("Update task", task.text);
    if(newText && newText.trim()){
        await fetch(`${API}/tasks/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ text: newText.trim() })
        });
        await render();
    }
}

async function deleteTask(id){
    await fetch(`${API}/tasks/${id}`, { method: "DELETE", credentials: "include" });
    await render();
}

async function createFolder(){
    const input = document.getElementById("folderInput");
    const name = input.value.trim();
    if(!name) return;
    await fetch(`${API}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name })
    });
    await showTab("folders");
    input.value = "";
}

async function deleteFolder(id){
    await fetch(`${API}/folders/${id}`, { method: "DELETE", credentials: "include" });
    await render();
}

async function updateFolder(id, oldName){
    const newName = prompt("Rename folder", oldName);
    if(!newName || !newName.trim()) return;
    await fetch(`${API}/folders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName.trim() })
    });
    await render();
}

// ------------------------------------------------------------
// View / filter helpers
// ------------------------------------------------------------

async function showTaskView(view){
    currentTaskView = view;
    await render();
    highlightFilter();
}

function highlightFilter(){
    document.querySelectorAll("#tasksTab button").forEach(b=>{ b.classList.remove("filter-active"); });
    let activeId = "";
    if(currentTaskView === "all") activeId = "filter-all";
    if(currentTaskView === "uncompleted") activeId = "filter-uncompleted";
    if(currentTaskView === "completed") activeId = "filter-completed";
    const btn = document.getElementById(activeId);
    if(btn) btn.classList.add("filter-active");
}

function getSortedTasks(){
    let all = [...tasks];
    all.sort((a,b)=>{
        if(a.completed !== b.completed){ return a.completed ? 1 : -1; }
        if(a.priority !== b.priority){ return a.priority === "High" ? -1 : 1; }
        return 0;
    });
    return {
        all,
        uncompleted: all.filter(t=>!t.completed),
        completed: all.filter(t=>t.completed)
    };
}

// ------------------------------------------------------------
// Rendering
// ------------------------------------------------------------

function taskCardHTML(t){
    return `
        <div class="task ${t.priority.toLowerCase()} ${t.completed ? "done" : ""}">
            <input type="checkbox" onchange="toggleTask('${t._id}')" ${t.completed ? "checked" : ""}>
            <span class="${t.completed ? "done-text" : ""}">
                ${t.text}
                <span class="meta">📅 ${t.dueDate || "No date"}</span>
                <span class="tag">${t.priority}</span>
                ${t.folder ? `<span class="tag folder-tag">📁 ${t.folder}</span>` : ""}
            </span>
            <button class="icon-btn" title="Update task" onclick="updateTask('${t._id}')">✏️</button>
            <button class="icon-btn" title="Delete task" onclick="deleteTask('${t._id}')">🗑️</button>
        </div>
    `;
}

async function render(){
    await loadData();

    const { all, uncompleted, completed } = getSortedTasks();
    let list;
    if(currentTaskView === "all") list = all;
    else if(currentTaskView === "uncompleted") list = uncompleted;
    else list = completed;

    const container = document.getElementById("taskContainer");
    if(container){
        container.innerHTML = list.length
            ? list.map(taskCardHTML).join("")
            : `<div class="empty-state">No tasks here yet. Add one from the sidebar.</div>`;
    }

    updateFolderSelect();
    renderFolders();
    renderReminders();
    renderStats();
    highlightFilter();
}

function renderStats(){
    const statPending = document.getElementById("statPending");
    if(!statPending) return;
    const todayStr = new Date().toISOString().split("T")[0];
    const pending = tasks.filter(t=>!t.completed).length;
    const done = tasks.filter(t=>t.completed).length;
    const dueToday = tasks.filter(t=>t.dueDate === todayStr && !t.completed).length;
    statPending.textContent = pending;
    document.getElementById("statDone").textContent = done;
    document.getElementById("statDueToday").textContent = dueToday;
}

function updateFolderSelect(){
    const sel = document.getElementById("folderSelect");
    if(!sel) return;
    sel.innerHTML = `<option value="">No folder</option>`;
    for(let f of folders){
        let opt = document.createElement("option");
        opt.value = f.name;
        opt.textContent = f.name;
        sel.appendChild(opt);
    }
}

function renderFolders(){
    const container = document.getElementById("folderContainer");
    if(!container) return;

    if(!folders.length){
        container.innerHTML =
            `<div class="empty-state">No folders yet. Create one from the sidebar to group your tasks.</div>`;
        return;
    }

    container.innerHTML = folders.map(f=>{
        const folderTasks = tasks.filter(t => t.folder === f.name);
        return `
        <div class="card folder-card">
            <h3>
                <span>📁 ${f.name}</span>
                <span class="folder-actions">
                    <button class="icon-btn" title="Rename folder" onclick="updateFolder('${f._id}', '${f.name}')">✏️</button>
                    <button class="icon-btn" title="Delete folder" onclick="deleteFolder('${f._id}')">🗑️</button>
                </span>
            </h3>
            <div class="folder-tasks">
                ${folderTasks.length ? folderTasks.map(taskCardHTML).join("") : `<div class="empty-state">This folder is empty.</div>`}
            </div>
        </div>
    `;
    }).join("");
}

function renderReminders(){
    const container = document.getElementById("reminderContainer");
    if(!container) return;

    let today = new Date();
    let tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    let todayStr = today.toISOString().split("T")[0];
    let tomorrowStr = tomorrow.toISOString().split("T")[0];

    let todayTasks = tasks.filter(t => t.dueDate === todayStr && !t.completed);
    let tomorrowTasks = tasks.filter(t => t.dueDate === tomorrowStr && !t.completed);

    container.innerHTML = `
        <div class="reminder-block">
            <h3>Today</h3>
            ${todayTasks.length ? todayTasks.map(taskCardHTML).join("") : `<div class="empty-state">No pending tasks today.</div>`}
        </div>
        <div class="reminder-block">
            <h3>Tomorrow</h3>
            ${tomorrowTasks.length ? tomorrowTasks.map(taskCardHTML).join("") : `<div class="empty-state">No pending tasks tomorrow.</div>`}
        </div>
    `;
}