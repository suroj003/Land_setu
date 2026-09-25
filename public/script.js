"use strict";

/* =====================================================
   LANDSETU FRONTEND
   Talks to the Express/MySQL backend in server.js.
===================================================== */

const state = { role: null, page: "dashboard", user: null, userId: null, charts: [], after: null, renderId: 0 };
const cache = {};
let authToken = sessionStorage.getItem("ls_token");

const PASSWORD_RE = /^\d{5}$/;
const LAND_STATUS = ["pending", "under_review", "verification", "compensation", "acquired"];
const LAND_TYPES = ["agricultural", "residential", "commercial", "government", "other"];
const CASE_STATUS = ["application_submitted", "document_review", "land_verification", "notification_issued",
    "objection_period", "compensation_pending", "approved", "rejected", "completed", "disputed"];
const CASE_FLOW = ["application_submitted", "document_review", "land_verification", "notification_issued",
    "objection_period", "compensation_pending", "approved", "completed"];
const DOC_TYPES = ["land_record", "identity_proof", "bank_details", "sale_deed", "ownership_proof",
    "valuation_report", "notice", "other"];
const GRIEVANCE_CATEGORIES = ["land", "document", "acquisition", "compensation", "other"];
const PAYMENT_STATUS = ["pending", "approved", "processing", "partially_paid", "paid"];
const PROJECT_STATUS = ["planned", "ongoing", "completed"];

const BADGES = {
    green: ["completed", "approved", "acquired", "verified", "paid", "resolved", "active", "ongoing"],
    orange: ["compensation_pending", "compensation", "processing", "partially_paid", "objection_period",
        "notification_issued", "open", "planned"],
    blue: ["land_verification", "document_review", "under_review", "verification", "application_submitted"],
    red: ["rejected", "disputed", "inactive"]
};

/* ================= UTILITIES ================= */

const $ = id => document.getElementById(id);

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function humanize(value) {
    return String(value ?? "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");

function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(String(value).replace(" ", "T"));
    return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status) {
    const color = Object.keys(BADGES).find(c => BADGES[c].includes(status)) || "gray";
    return `<span class="badge ${color}">${esc(humanize(status))}</span>`;
}

function toast(message, type = "success") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function setBusy(btn, busy) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = "Please wait…"; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
    btn.disabled = busy;
}

const loadingHtml = () => `<div class="loading"><div class="spinner"></div>Loading…</div>`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

/* ================= API ================= */

async function apiRequest(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    let res;
    try {
        res = await fetch(path, { ...options, headers });
    } catch (e) {
        throw new Error("Cannot reach the server. Check your connection and try again.");
    }

    let body = null;
    try { body = await res.json(); } catch (e) { /* empty or non-JSON body */ }

    if (res.status === 401 && authToken) {
        expireSession();
        throw new Error("Your session has expired. Please log in again.");
    }
    if (!res.ok) {
        throw new Error((body && body.message) || `Request failed (${res.status})`);
    }
    return body;
}
const api = apiRequest;
const post = (path, payload) => api(path, { method: "POST", body: JSON.stringify(payload) });

/* ================= AUTH ================= */

function showAuthTab(tab) {
    const login = tab === "login";
    $("loginForm").classList.toggle("hidden", !login);
    $("registerForm").classList.toggle("hidden", login);
    $("tabLogin").classList.toggle("active", login);
    $("tabRegister").classList.toggle("active", !login);
    $("loginError").classList.add("hidden");
    $("registerError").classList.add("hidden");
}

function showAuthError(id, message) {
    const box = $(id);
    box.textContent = message;
    box.classList.remove("hidden");
}

function applyUser(u) {
    state.role = u.role;
    state.user = u.name;
    state.userId = u.user_id;
}

async function login() {
    const username = $("username").value.trim();
    const password = $("password").value;
    const role = $("loginRole").value;
    $("loginError").classList.add("hidden");

    if (!username || !password) return showAuthError("loginError", "Enter your username and password.");
    if (!PASSWORD_RE.test(password)) return showAuthError("loginError", "Password must be exactly 5 digits.");

    const btn = $("loginBtn");
    setBusy(btn, true);
    try {
        const data = await post("/api/auth/login", { username, password, role });
        authToken = data.token;
        sessionStorage.setItem("ls_token", authToken);
        applyUser(data);
        $("password").value = "";
        await enterApp();
    } catch (err) {
        showAuthError("loginError", err.message);
    } finally {
        setBusy(btn, false);
    }
}

async function register() {
    const name = $("regName").value.trim();
    const username = $("regUsername").value.trim();
    const email = $("regEmail").value.trim();
    const phone = $("regPhone").value.trim();
    const district = $("regDistrict").value.trim();
    const password = $("regPassword").value;
    $("registerError").classList.add("hidden");

    if (!name || !username || !email || !password) return showAuthError("registerError", "Please fill in all required fields.");
    if (!PASSWORD_RE.test(password)) return showAuthError("registerError", "Password must be exactly 5 digits.");
    if (password !== $("regConfirm").value) return showAuthError("registerError", "Passwords do not match.");

    const btn = $("registerBtn");
    setBusy(btn, true);
    try {
        await post("/api/users", { name, username, email, password, phone: phone || undefined, district: district || undefined });
        const data = await post("/api/auth/login", { username, password, role: "citizen" });
        authToken = data.token;
        sessionStorage.setItem("ls_token", authToken);
        applyUser(data);
        $("registerForm").reset();
        toast("Account created. Welcome to LandSetu!");
        await enterApp();
    } catch (err) {
        showAuthError("registerError", err.message);
    } finally {
        setBusy(btn, false);
    }
}

async function enterApp() {
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    state.page = "dashboard";
    showPage("dashboard");
    refreshNotificationDot();
}

async function restoreSession() {
    if (!authToken) return;
    try {
        const { user } = await api("/api/auth/me");
        applyUser(user);
        await enterApp();
    } catch (e) {
        resetSession();
    }
}

function resetSession() {
    authToken = null;
    sessionStorage.removeItem("ls_token");
    state.role = state.user = state.userId = null;
    destroyCharts();
    closeModal();
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
    showAuthTab("login");
}

function expireSession() {
    resetSession();
    toast("Your session has expired. Please log in again.", "error");
}

function logout() {
    resetSession();
}

function toggleSidebar() {
    $("sidebar").classList.toggle("open");
}

/* ================= NAVIGATION ================= */

const NAV = {
    citizen: [["dashboard", "▦", "Dashboard"], ["land", "⌂", "My Land"], ["cases", "◷", "Acquisition Cases"],
        ["compensation", "₹", "Compensation"], ["documents", "▤", "Documents"], ["grievances", "!", "Grievances"],
        ["map", "⌖", "Land Map"]],
    officer: [["dashboard", "▦", "Dashboard"], ["cases", "◷", "Assigned Cases"], ["land", "⌂", "Land Verification"],
        ["compensation", "₹", "Compensation"], ["documents", "▤", "Documents"], ["grievances", "!", "Grievances"],
        ["map", "⌖", "Map"]],
    admin: [["dashboard", "▦", "Dashboard"], ["projects", "▣", "Projects"], ["land", "⌂", "Land"],
        ["cases", "◷", "Cases"], ["compensation", "₹", "Compensation"], ["documents", "▤", "Documents"],
        ["grievances", "!", "Grievances"], ["users", "♙", "Users"], ["analytics", "◈", "Analytics"],
        ["map", "⌖", "Project Map"]]
};

function buildNavigation() {
    const items = NAV[state.role] || NAV.citizen;
    $("navigation").innerHTML = items.map(([key, icon, label]) => `
        <button class="nav-item ${state.page === key ? "active" : ""}" onclick="showPage('${key}')">
            <span>${icon}</span> ${label}
        </button>`).join("");

    $("profileName").textContent = state.user || "";
    $("profileRole").textContent = state.role === "officer" ? "Land Officer" : humanize(state.role);
    $("avatar").textContent = (state.user || "?").charAt(0).toUpperCase();
}

function pageTitle(page) {
    const titles = {
        dashboard: "Dashboard",
        land: state.role === "citizen" ? "My Land" : state.role === "officer" ? "Land Verification" : "Land",
        cases: state.role === "officer" ? "Assigned Cases" : "Acquisition Cases",
        compensation: "Compensation", documents: "Documents", grievances: "Grievances",
        map: "Land Map", projects: "Projects", users: "Users", analytics: "Analytics", profile: "Profile"
    };
    return titles[page] || "Dashboard";
}

function destroyCharts() {
    state.charts.forEach(c => c.destroy());
    state.charts = [];
}

function makeChart(id, config) {
    const canvas = $(id);
    if (!canvas || typeof Chart === "undefined") return;
    state.charts.push(new Chart(canvas, config));
}

function chartOptions(extra = {}) {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } }
        },
        ...extra
    };
}

async function showPage(page) {
    const renderId = ++state.renderId;
    state.page = page;
    state.after = null;
    destroyCharts();
    buildNavigation();
    $("pageTitle").textContent = pageTitle(page);
    $("content").innerHTML = loadingHtml();
    if (window.innerWidth < 760) $("sidebar").classList.remove("open");

    try {
        const html = await (PAGES[page] || dashboardPage)();
        if (renderId !== state.renderId) return;
        $("content").innerHTML = html;
        if (state.after) state.after();
    } catch (err) {
        if (renderId !== state.renderId) return;
        $("content").innerHTML = `<div class="card"><div class="empty">${esc(err.message)}<br><br>
            <button class="btn" onclick="showPage('${esc(page)}')">Retry</button></div></div>`;
    }
}

/* ================= UI BUILDING BLOCKS ================= */

function stat(icon, label, value, change) {
    return `<div class="stat-card">
        <div class="stat-top"><span class="stat-label">${esc(label)}</span><span class="stat-icon">${icon}</span></div>
        <div class="stat-value">${esc(value)}</div>
        <div class="stat-change">${esc(change)}</div>
    </div>`;
}

function detail(title, value, raw = false) {
    return `<div class="detail-item"><small>${esc(title)}</small><strong>${raw ? value : esc(value ?? "—")}</strong></div>`;
}

function timeline(title, date, cls) {
    return `<div class="timeline-item ${cls}"><div class="timeline-dot"></div>
        <div><strong>${esc(title)}</strong><span>${esc(date)}</span></div></div>`;
}

function table(heads, rows, empty) {
    if (!rows.length) return `<div class="empty">${esc(empty || "No records found.")}</div>`;
    return `<div class="table-wrap"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("")}</tbody></table></div>`;
}

function indicator(title, pct) {
    const value = Math.max(0, Math.min(100, Math.round(pct)));
    return `<div class="progress-row"><header><span>${esc(title)}</span><strong>${value}%</strong></header>
        <div class="progress"><span style="width:${value}%"></span></div></div>`;
}

function actionRow(title, subtitle, badgeHtml) {
    return `<div class="action-row"><div><strong style="font-size:12px">${esc(title)}</strong>
        <small>${esc(subtitle)}</small></div>${badgeHtml}</div>`;
}

function intro(title, text, buttonHtml = "") {
    return `<div class="page-intro"><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>${buttonHtml}</div>`;
}

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/* ---- forms ---- */

function field(id, label, { type = "text", value = "", placeholder = "", full = false, attrs = "" } = {}) {
    return `<div class="form-group${full ? " full-col" : ""}"><label for="${id}">${label}</label>
        <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attrs}></div>`;
}

function selectField(id, label, optionsHtml, full = false) {
    return `<div class="form-group${full ? " full-col" : ""}"><label for="${id}">${label}</label>
        <select id="${id}">${optionsHtml}</select></div>`;
}

function textField(id, label, placeholder = "") {
    return `<div class="form-group full-col"><label for="${id}">${label}</label>
        <textarea id="${id}" placeholder="${esc(placeholder)}"></textarea></div>`;
}

function enumOptions(list, selected) {
    return list.map(v => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(humanize(v))}</option>`).join("");
}

function itemOptions(items, selected, placeholder) {
    const first = placeholder ? `<option value="">${esc(placeholder)}</option>` : "";
    return first + items.map(i => `<option value="${esc(i.value)}"${String(i.value) === String(selected) ? " selected" : ""}>${esc(i.label)}</option>`).join("");
}

const val = id => ($(id) ? $(id).value.trim() : "");

function formModal(title, introText, body, submitLabel, handler) {
    openModal(`<h2>${esc(title)}</h2><p>${esc(introText)}</p>
        <div class="form-grid" style="margin-top:16px">${body}</div>
        <div id="formError" class="form-error hidden"></div>
        <button class="primary-btn" style="margin-top:18px" onclick="${handler}(this)">${esc(submitLabel)}</button>`);
}

function formError(message) {
    const box = $("formError");
    if (box) { box.textContent = message; box.classList.remove("hidden"); }
}

async function runSubmit(btn, fn) {
    const box = $("formError");
    if (box) box.classList.add("hidden");
    setBusy(btn, true);
    try {
        await fn();
    } catch (err) {
        formError(err.message);
    } finally {
        setBusy(btn, false);
    }
}

function done(message) {
    closeModal();
    toast(message);
    showPage(state.page);
}

/* ---- modal ---- */

function openModal(html) {
    $("modalContent").innerHTML = html;
    $("modal").classList.remove("hidden");
}

function closeModal() {
    $("modal").classList.add("hidden");
}

$("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ================= DASHBOARD ================= */

async function dashboardPage() {
    const [s, casesRes] = await Promise.all([api("/api/dashboard/stats"), api("/api/cases")]);
    cache.cases = casesRes.cases;

    if (state.role === "citizen") return citizenDashboard(s, casesRes.cases);
    if (state.role === "officer") return officerDashboard(s, casesRes.cases);
    const { projects } = await api("/api/projects");
    return adminDashboard(s, casesRes.cases, projects);
}

function statusChartAfter(s) {
    const keys = Object.keys(s.statusCounts);
    makeChart("statusChart", {
        type: "bar",
        data: { labels: keys.map(humanize), datasets: [{ data: keys.map(k => s.statusCounts[k]), backgroundColor: "#0b2a7a", borderRadius: 7 }] },
        options: chartOptions()
    });
}

function trendChartAfter(s, id) {
    makeChart(id, {
        type: "line",
        data: { labels: s.monthly.map(m => m.month), datasets: [{ data: s.monthly.map(m => m.total), borderColor: "#ff9933", backgroundColor: "#ff9933", tension: .35, borderWidth: 3, pointRadius: 3 }] },
        options: chartOptions()
    });
}

function citizenDashboard(s, cases) {
    const c = s.compensation;
    const active = s.totalCases - (s.statusCounts.completed || 0) - (s.statusCounts.rejected || 0);
    const pending = Math.max(c.approved - c.paid, 0);
    const openG = s.grievances.open + s.grievances.under_review;
    const latest = cases[0];

    let progressCard;
    if (latest) {
        const idx = CASE_FLOW.indexOf(latest.status);
        const progress = idx >= 0 ? Math.round((idx / (CASE_FLOW.length - 1)) * 100) : 0;
        progressCard = `
            <div class="progress-row"><header><span>${esc(humanize(latest.status))}</span><strong>${progress}%</strong></header>
            <div class="progress"><span style="width:${progress}%"></span></div></div>
            <div class="timeline">${CASE_FLOW.map((st, i) =>
                timeline(humanize(st), i < idx ? "Done" : i === idx ? "Current stage" : "Pending", i < idx ? "done" : i === idx ? "current" : "")).join("")}</div>`;
    } else {
        progressCard = `<div class="empty">You have no acquisition cases yet.</div>`;
    }

    return `
        ${intro(`${greeting()}, ${state.user}`, "Track your land, acquisition status and compensation.",
            `<button class="primary-btn" onclick="showPage('grievances')">Grievances</button>`)}
        <div class="stats-grid">
            ${stat("⌂", "Total Land", s.totalLand, "Registered parcels")}
            ${stat("◷", "Active Cases", active, `${s.totalCases} total`)}
            ${stat("₹", "Compensation Paid", money(c.paid), `${money(pending)} pending`)}
            ${stat("!", "Open Grievances", openG, `${s.grievances.resolved} resolved`)}
        </div>
        <div class="grid-2">
            <div class="card">
                <div class="card-header"><h3>Acquisition Progress</h3><span>${latest ? esc(latest.case_number) : ""}</span></div>
                ${progressCard}
            </div>
            <div class="card">
                <div class="card-header"><h3>Compensation Summary</h3></div>
                <div class="detail-list">
                    ${detail("Assessed", money(c.assessed))}${detail("Approved", money(c.approved))}
                    ${detail("Paid", money(c.paid))}${detail("Pending", money(pending))}
                </div>
                <button class="btn" style="margin-top:15px" onclick="showPage('compensation')">View payment details →</button>
            </div>
        </div>
        <div class="card table-card">
            <div class="card-header"><h3>Recent Cases</h3><button class="link-btn" onclick="showPage('cases')">View all</button></div>
            ${caseTable(cases.slice(0, 5))}
        </div>`;
}

function officerDashboard(s, cases) {
    const sc = s.statusCounts;
    const verification = (sc.land_verification || 0) + (sc.document_review || 0);
    const priority = cases.filter(c => ["land_verification", "document_review", "compensation_pending", "objection_period"].includes(c.status)).slice(0, 5);
    state.after = () => statusChartAfter(s);

    return `
        ${intro("Officer Control Center", "Review assigned land acquisition cases and pending actions.",
            `<button class="primary-btn" onclick="showPage('cases')">View Assigned Cases</button>`)}
        <div class="stats-grid">
            ${stat("◷", "Assigned Cases", s.totalCases, `${sc.completed || 0} completed`)}
            ${stat("⌂", "Verification Pending", verification, "Land and documents")}
            ${stat("₹", "Compensation Pending", sc.compensation_pending || 0, "Cases awaiting payment")}
            ${stat("!", "Open Grievances", s.grievances.open + s.grievances.under_review, `${s.grievances.open} new`)}
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3>Cases by Status</h3></div>
                <div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>
            <div class="card"><div class="card-header"><h3>Priority Actions</h3><span>Needs attention</span></div>
                ${priority.length ? priority.map(c => actionRow(c.case_number, `${c.owner_name} · ${c.survey_number}`, statusBadge(c.status))).join("")
                    : `<div class="empty">Nothing needs attention right now.</div>`}
            </div>
        </div>
        <div class="card table-card">
            <div class="card-header"><h3>Assigned Cases</h3><button class="link-btn" onclick="showPage('cases')">Open queue</button></div>
            ${caseTable(cases.slice(0, 8))}
        </div>`;
}

function projectProgress(p) {
    return Math.round(pct(Number(p.completed_cases), Number(p.case_count)));
}

function adminDashboard(s, cases, projects) {
    const c = s.compensation;
    state.after = () => { trendChartAfter(s, "trendChart"); statusChartAfter(s); };

    return `
        ${intro("Land Acquisition Overview", "Monitor projects, land parcels, acquisition progress and compensation.",
            `<button class="primary-btn" onclick="showPage('analytics')">View Analytics</button>`)}
        <div class="stats-grid">
            ${stat("▣", "Projects", s.totalProjects, "All projects")}
            ${stat("⌂", "Land Parcels", s.totalLand, "Registered records")}
            ${stat("◷", "Acquisition Cases", s.totalCases, `${s.statusCounts.completed || 0} completed`)}
            ${stat("₹", "Compensation Paid", money(c.paid), `of ${money(c.approved)} approved`)}
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3>Cases Created per Month</h3></div>
                <div class="chart-wrap"><canvas id="trendChart"></canvas></div></div>
            <div class="card"><div class="card-header"><h3>Project Progress</h3><span>Completed cases</span></div>
                ${projects.length ? projects.slice(0, 6).map(p => indicator(p.project_name, projectProgress(p))).join("")
                    : `<div class="empty">No projects yet.</div>`}
            </div>
        </div>
        <div class="grid-map" style="margin-top:18px">
            <div class="card"><div class="card-header"><h3>Case Status Distribution</h3></div>
                <div class="chart-wrap small"><canvas id="statusChart"></canvas></div></div>
            <div class="card table-card" style="margin-top:0">
                <div class="card-header"><h3>Latest Cases</h3><button class="link-btn" onclick="showPage('cases')">View all</button></div>
                ${caseTable(cases.slice(0, 4))}
            </div>
        </div>`;
}

/* ================= CASES ================= */

function caseTable(rows) {
    return table(["Case No.", "Survey", "Owner", "Project", "Status", "Applied", ""],
        rows.map(c => `<tr>
            <td><strong>${esc(c.case_number)}</strong></td><td>${esc(c.survey_number)}</td>
            <td>${esc(c.owner_name)}</td><td>${esc(c.project_name)}</td><td>${statusBadge(c.status)}</td>
            <td>${fmtDate(c.application_date)}</td>
            <td><button class="link-btn" onclick="openCase(${Number(c.case_id)})">View</button></td></tr>`),
        "No cases found.");
}

async function casesPage() {
    const { cases } = await api("/api/cases");
    cache.cases = cases;
    return `
        ${intro(state.role === "officer" ? "Assigned Acquisition Queue" : "Acquisition Cases",
            "Track each case from application through final acquisition.",
            `<button class="primary-btn" onclick="openCaseForm()">+ New Case</button>`)}
        <div class="card">
            <div class="table-tools">
                <input class="search" id="caseSearch" oninput="filterCases()" placeholder="Search case no., survey, owner…">
                <select class="filter" id="caseFilter" onchange="filterCases()">
                    <option value="">All Status</option>${enumOptions(CASE_STATUS)}
                </select>
            </div>
            <div id="caseTable">${caseTable(cases)}</div>
        </div>`;
}

function filterCases() {
    const q = val("caseSearch").toLowerCase();
    const f = $("caseFilter").value;
    const rows = cache.cases.filter(c =>
        (!q || [c.case_number, c.survey_number, c.owner_name, c.project_name].join(" ").toLowerCase().includes(q)) &&
        (!f || c.status === f));
    $("caseTable").innerHTML = caseTable(rows);
}

async function openCase(id) {
    openModal(loadingHtml());
    try {
        const { case: c, history } = await api(`/api/cases/${Number(id)}`);
        const items = [timeline("Application submitted", fmtDate(c.application_date), "done")];
        history.forEach((h, i) => {
            const isLast = i === history.length - 1 && c.status !== "completed";
            items.push(timeline(humanize(h.new_status) + (h.remarks ? ` — ${h.remarks}` : ""),
                `${fmtDate(h.changed_at)} · ${h.changed_by_name}`, isLast ? "current" : "done"));
        });

        const canUpdate = state.role === "admin" || (state.role === "officer" && c.officer_id === state.userId);
        const updateForm = canUpdate ? `
            <h3 style="margin:22px 0 10px;font-size:14px">Update Status</h3>
            <div class="form-grid">
                ${selectField("f_status", "New status", enumOptions(CASE_STATUS, c.status))}
                ${field("f_remarks", "Remarks (optional)")}
            </div>
            <div id="formError" class="form-error hidden"></div>
            <button class="primary-btn" style="margin-top:14px" onclick="submitStatus(this, ${Number(c.case_id)})">Update Case Status</button>` : "";

        openModal(`
            <h2>${esc(c.case_number)} · Acquisition Case</h2>
            <p>Survey ${esc(c.survey_number)} (${esc(c.land_code)})</p>
            <div class="detail-list">
                ${detail("Owner", c.owner_name)}${detail("Project", c.project_name)}
                ${detail("Status", statusBadge(c.status), true)}${detail("Officer", c.officer_name || "Unassigned")}
                ${detail("Applied", fmtDate(c.application_date))}${detail("Expected completion", fmtDate(c.expected_completion_date))}
                ${c.remarks ? detail("Remarks", c.remarks) : ""}
            </div>
            <h3 style="margin:22px 0 10px;font-size:14px">Acquisition Timeline</h3>
            <div class="timeline">${items.join("")}</div>
            ${updateForm}`);
    } catch (err) {
        openModal(`<h2>Case</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

function submitStatus(btn, caseId) {
    return runSubmit(btn, async () => {
        const status = val("f_status");
        if (["rejected", "disputed"].includes(status) &&
            !confirm(`Mark this case as ${humanize(status)}? The owner will be notified.`)) return;
        await api(`/api/cases/${caseId}/status`, { method: "PATCH", body: JSON.stringify({ status, remarks: val("f_remarks") || undefined }) });
        done("Case status updated.");
    });
}

async function openCaseForm() {
    openModal(loadingHtml());
    try {
        const calls = [api("/api/lands"), api("/api/projects")];
        if (state.role === "admin") calls.push(api("/api/users"));
        const [landsRes, projectsRes, usersRes] = await Promise.all(calls);

        if (!landsRes.lands.length) return openModal(`<h2>New Case</h2><p>Add a land record first, then create a case for it.</p>`);
        if (!projectsRes.projects.length) return openModal(`<h2>New Case</h2><p>No projects exist yet. An administrator must create a project first.</p>`);

        const landItems = landsRes.lands.map(l => ({
            value: l.land_id, label: `${l.survey_number} · ${l.village}${state.role === "citizen" ? "" : " · " + l.owner_name}`
        }));
        const projectItems = projectsRes.projects.map(p => ({ value: p.project_id, label: p.project_name }));
        const officers = usersRes ? usersRes.users.filter(u => u.role === "officer" && u.account_status === "active")
            .map(u => ({ value: u.user_id, label: u.name })) : [];

        formModal("Create Acquisition Case", "Select the land parcel and project for this case.", `
            ${selectField("f_land", "Land parcel", itemOptions(landItems))}
            ${selectField("f_project", "Project", itemOptions(projectItems))}
            ${state.role === "admin" ? selectField("f_officer", "Assign officer", itemOptions(officers, "", "Unassigned"), true) : ""}
            ${field("f_applied", "Application date", { type: "date", value: new Date().toISOString().slice(0, 10) })}
            ${field("f_expected", "Expected completion (optional)", { type: "date" })}
            ${textField("f_remarks", "Remarks (optional)")}`, "Create Case", "submitCase");
    } catch (err) {
        openModal(`<h2>New Case</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

function submitCase(btn) {
    return runSubmit(btn, async () => {
        const payload = {
            land_id: Number(val("f_land")), project_id: Number(val("f_project")),
            officer_id: val("f_officer") ? Number(val("f_officer")) : undefined,
            application_date: val("f_applied"), expected_completion_date: val("f_expected") || undefined,
            remarks: val("f_remarks") || undefined
        };
        if (!payload.land_id || !payload.project_id || !payload.application_date) throw new Error("Land, project and application date are required.");
        const res = await post("/api/cases", payload);
        done(`Case ${res.case_number} created.`);
    });
}

/* ================= LAND ================= */

function landTable(rows) {
    return table(["Survey No.", "Owner", "Area", "Village", "Project", "Status", ""],
        rows.map(l => `<tr>
            <td><strong>${esc(l.survey_number)}</strong></td><td>${esc(l.owner_name)}</td>
            <td>${esc(Number(l.area_acres))} acres</td><td>${esc(l.village)}</td>
            <td>${esc(l.project_name || "—")}</td><td>${statusBadge(l.status)}</td>
            <td><button class="link-btn" onclick="openLand(${Number(l.land_id)})">Details</button></td></tr>`),
        "No land records found.");
}

async function landPage() {
    const { lands } = await api("/api/lands");
    cache.lands = lands;
    return `
        ${intro(state.role === "citizen" ? "My Land Parcels" : "Land Records", "Search, filter and open detailed land records.",
            `<button class="primary-btn" onclick="openLandForm()">+ Add Land Record</button>`)}
        <div class="card table-card" style="margin-top:0">
            <div class="table-tools">
                <input class="search" id="landSearch" oninput="filterLand()" placeholder="Search survey number, owner, village…">
                <select class="filter" id="landFilter" onchange="filterLand()">
                    <option value="">All Status</option>${enumOptions(LAND_STATUS)}
                </select>
            </div>
            <div id="landTable">${landTable(lands)}</div>
        </div>`;
}

function filterLand() {
    const q = val("landSearch").toLowerCase();
    const f = $("landFilter").value;
    const rows = cache.lands.filter(l =>
        (!q || [l.survey_number, l.owner_name, l.village, l.district, l.land_code, l.project_name].join(" ").toLowerCase().includes(q)) &&
        (!f || l.status === f));
    $("landTable").innerHTML = landTable(rows);
}

function openLand(id) {
    const l = (cache.lands || []).find(item => item.land_id === Number(id));
    if (!l) return;
    openModal(`
        <h2>Land Record · ${esc(l.survey_number)}</h2>
        <p>Digital land record overview.</p>
        <div class="detail-list">
            ${detail("Record ID", l.land_code)}${detail("Owner", l.owner_name)}
            ${detail("Area", `${Number(l.area_acres)} acres`)}${detail("Land type", humanize(l.land_type))}
            ${detail("Village", l.village)}${detail("District", l.district)}
            ${detail("State", l.state)}${detail("Project", l.project_name || "—")}
            ${detail("Status", statusBadge(l.status), true)}
            ${detail("Coordinates", l.latitude != null && l.longitude != null ? `${Number(l.latitude)}, ${Number(l.longitude)}` : "Not recorded")}
        </div>
        <h3 style="margin:22px 0 10px;font-size:14px">Quick Actions</h3>
        <button class="btn" onclick="closeModal(); showPage('cases')">Cases</button>
        <button class="btn" onclick="closeModal(); showPage('documents')">Documents</button>
        <button class="btn" onclick="closeModal(); showPage('map')">View on Map</button>`);
}

async function openLandForm() {
    openModal(loadingHtml());
    try {
        const calls = [api("/api/projects")];
        if (state.role !== "citizen") calls.push(api("/api/users"));
        const [projectsRes, usersRes] = await Promise.all(calls);
        const citizens = usersRes ? usersRes.users.filter(u => u.role === "citizen").map(u => ({ value: u.user_id, label: `${u.name} (${u.username})` })) : [];
        const projects = projectsRes.projects.map(p => ({ value: p.project_id, label: p.project_name }));

        formModal("Add Land Record", "Create a new digital land record.", `
            ${state.role !== "citizen" ? selectField("f_owner", "Owner", itemOptions(citizens, "", "Select owner"), true) : ""}
            ${field("f_survey", "Survey number")}
            ${field("f_area", "Area (acres)", { type: "number", attrs: 'min="0.01" step="0.01"' })}
            ${field("f_village", "Village")}${field("f_district", "District")}
            ${field("f_state", "State")}
            ${selectField("f_type", "Land type", enumOptions(LAND_TYPES))}
            ${selectField("f_project", "Project (optional)", itemOptions(projects, "", "None"))}
            ${field("f_lat", "Latitude (optional)", { type: "number", attrs: 'step="any"' })}
            ${field("f_lng", "Longitude (optional)", { type: "number", attrs: 'step="any"' })}`, "Save Land Record", "submitLand");
    } catch (err) {
        openModal(`<h2>Add Land Record</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

function submitLand(btn) {
    return runSubmit(btn, async () => {
        const payload = {
            owner_id: val("f_owner") ? Number(val("f_owner")) : undefined,
            survey_number: val("f_survey"), area_acres: Number(val("f_area")),
            village: val("f_village"), district: val("f_district"), state: val("f_state"),
            land_type: val("f_type"), project_id: val("f_project") ? Number(val("f_project")) : undefined,
            latitude: val("f_lat") !== "" ? Number(val("f_lat")) : undefined,
            longitude: val("f_lng") !== "" ? Number(val("f_lng")) : undefined
        };
        if (!payload.survey_number || !payload.village || !payload.district || !payload.state) throw new Error("Survey number, village, district and state are required.");
        if (!(payload.area_acres > 0)) throw new Error("Area must be greater than 0.");
        if (state.role !== "citizen" && !payload.owner_id) throw new Error("Select the land owner.");
        const res = await post("/api/lands", payload);
        done(`Land record ${res.land_code} saved.`);
    });
}

/* ================= COMPENSATION ================= */

async function compensationPage() {
    const [{ compensation }, s] = await Promise.all([api("/api/compensation"), api("/api/dashboard/stats")]);
    cache.compensation = compensation;
    const c = s.compensation;
    const pending = Math.max(c.approved - c.paid, 0);
    const latest = compensation[0];
    const canEdit = state.role !== "citizen";
    state.after = () => makeChart("compChart", {
        type: "doughnut",
        data: { labels: ["Paid", "Pending"], datasets: [{ data: [c.paid, pending], backgroundColor: ["#138808", "#ff9933"], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });

    return `
        ${intro("Compensation Management", "Track assessed, approved, paid and pending compensation.",
            canEdit ? `<button class="primary-btn" onclick="openCompForm()">+ Record Payment</button>` : "")}
        <div class="stats-grid">
            ${stat("₹", "Total Assessed", money(c.assessed), "Across your cases")}
            ${stat("✓", "Approved", money(c.approved), `${Math.round(pct(c.approved, c.assessed))}% of assessed`)}
            ${stat("↗", "Paid", money(c.paid), `${Math.round(pct(c.paid, c.approved))}% of approved`)}
            ${stat("◷", "Pending", money(pending), "Approved, not yet paid")}
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3>Payment Progress</h3></div>
                <div class="chart-wrap"><canvas id="compChart"></canvas></div></div>
            <div class="card"><div class="card-header"><h3>Latest Update</h3></div>
                ${latest ? `<div class="detail-list">
                    ${detail("Case", latest.case_number)}${detail("Status", statusBadge(latest.payment_status), true)}
                    ${detail("Approved", money(latest.approved_amount))}${detail("Paid", money(latest.paid_amount))}
                    ${detail("Reference", latest.payment_reference || "—")}${detail("Payment date", fmtDate(latest.payment_date))}
                </div>` : `<div class="empty">No compensation has been recorded yet.</div>`}
            </div>
        </div>
        <div class="card table-card">
            <div class="card-header"><h3>Compensation Records</h3></div>
            ${table(["Case", "Owner", "Assessed", "Approved", "Paid", "Status", ...(canEdit ? [""] : [])],
                compensation.map(r => `<tr>
                    <td><strong>${esc(r.case_number)}</strong></td><td>${esc(r.owner_name)}</td>
                    <td>${money(r.assessed_amount)}</td><td>${money(r.approved_amount)}</td><td>${money(r.paid_amount)}</td>
                    <td>${statusBadge(r.payment_status)}</td>
                    ${canEdit ? `<td><button class="link-btn" onclick="openCompForm(${Number(r.case_id)})">Edit</button></td>` : ""}</tr>`),
                "No compensation records yet.")}
        </div>`;
}

async function openCompForm(caseId) {
    openModal(loadingHtml());
    try {
        const { cases } = await api("/api/cases");
        if (!cases.length) return openModal(`<h2>Record Payment</h2><p>There are no cases to record compensation for.</p>`);
        const existing = (cache.compensation || []).find(r => r.case_id === Number(caseId)) || {};
        const items = cases.map(c => ({ value: c.case_id, label: `${c.case_number} · ${c.owner_name}` }));

        formModal("Compensation Record", "Saving again for the same case updates its record.", `
            ${selectField("f_case", "Case", itemOptions(items, caseId), true)}
            ${field("f_assessed", "Assessed amount (₹)", { type: "number", value: existing.assessed_amount ?? "", attrs: 'min="0" step="0.01"' })}
            ${field("f_approved", "Approved amount (₹)", { type: "number", value: existing.approved_amount ?? "", attrs: 'min="0" step="0.01"' })}
            ${field("f_paid", "Paid amount (₹)", { type: "number", value: existing.paid_amount ?? "", attrs: 'min="0" step="0.01"' })}
            ${selectField("f_pstatus", "Payment status", enumOptions(PAYMENT_STATUS, existing.payment_status || "pending"))}
            ${field("f_ref", "Payment reference", { value: existing.payment_reference || "" })}
            ${field("f_pdate", "Payment date", { type: "date", value: existing.payment_date || "" })}`, "Save Payment", "submitComp");
    } catch (err) {
        openModal(`<h2>Record Payment</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

function submitComp(btn) {
    return runSubmit(btn, async () => {
        const payload = {
            case_id: Number(val("f_case")), assessed_amount: Number(val("f_assessed") || 0),
            approved_amount: Number(val("f_approved") || 0), paid_amount: Number(val("f_paid") || 0),
            payment_status: val("f_pstatus"), payment_reference: val("f_ref") || undefined,
            payment_date: val("f_pdate") || undefined
        };
        if (!payload.case_id) throw new Error("Select a case.");
        if (payload.paid_amount > payload.approved_amount) throw new Error("Paid amount cannot exceed the approved amount.");
        await post("/api/compensation", payload);
        done("Compensation saved.");
    });
}

/* ================= DOCUMENTS ================= */

async function documentsPage() {
    const { documents } = await api("/api/documents");
    cache.documents = documents;
    return `
        ${intro("Documents", "Record and monitor verification of acquisition documents.",
            `<button class="primary-btn" onclick="openDocumentForm()">+ Add Document</button>`)}
        <div class="notice">Documents are recorded by name and an optional link to where the file is stored (for example a Drive or cloud link).</div>
        <div class="card">
            ${table(["Document", "Type", "Case", "Added", "Verification", ""],
                documents.map(d => `<tr>
                    <td><strong>▤ ${esc(d.file_name)}</strong></td><td>${esc(humanize(d.document_type))}</td>
                    <td>${esc(d.case_number)}</td><td>${fmtDate(d.uploaded_at)}</td>
                    <td>${statusBadge(d.verification_status)}</td>
                    <td><button class="btn" onclick="openDocument(${Number(d.document_id)})">View</button></td></tr>`),
                "No documents recorded yet.")}
        </div>`;
}

function openDocument(id) {
    const d = (cache.documents || []).find(item => item.document_id === Number(id));
    if (!d) return;
    const link = d.file_url && /^https?:\/\//i.test(d.file_url)
        ? `<a class="link" href="${esc(d.file_url)}" target="_blank" rel="noopener noreferrer">Open file ↗</a>` : "No link recorded";
    openModal(`<h2>${esc(d.file_name)}</h2>
        <div class="detail-list">
            ${detail("Type", humanize(d.document_type))}${detail("Case", d.case_number)}
            ${detail("Added by", d.uploaded_by_name)}${detail("Added", fmtDate(d.uploaded_at))}
            ${detail("Verification", statusBadge(d.verification_status), true)}${detail("File", link, true)}
        </div>`);
}

async function openDocumentForm() {
    openModal(loadingHtml());
    try {
        const { cases } = await api("/api/cases");
        if (!cases.length) return openModal(`<h2>Add Document</h2><p>Create an acquisition case first, then attach documents to it.</p>`);
        const items = cases.map(c => ({ value: c.case_id, label: `${c.case_number} · ${c.survey_number}` }));
        formModal("Add Document", "Attach a document record to one of your cases.", `
            ${selectField("f_case", "Case", itemOptions(items))}
            ${selectField("f_type", "Document type", enumOptions(DOC_TYPES))}
            ${field("f_name", "File name", { placeholder: "e.g. Land Record.pdf", full: true })}
            ${field("f_url", "File link (optional)", { type: "url", placeholder: "https://…", full: true })}`, "Save Document", "submitDocument");
    } catch (err) {
        openModal(`<h2>Add Document</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

function submitDocument(btn) {
    return runSubmit(btn, async () => {
        const payload = { case_id: Number(val("f_case")), document_type: val("f_type"), file_name: val("f_name"), file_url: val("f_url") || undefined };
        if (!payload.case_id || !payload.file_name) throw new Error("Case and file name are required.");
        await post("/api/documents", payload);
        done("Document recorded.");
    });
}

/* ================= GRIEVANCES ================= */

async function grievancesPage() {
    const { grievances } = await api("/api/grievances");
    cache.grievances = grievances;
    const count = s => grievances.filter(g => g.status === s).length;

    return `
        ${intro("Grievances & Support", "Raise an issue and track its resolution.",
            state.role === "citizen" ? `<button class="primary-btn" onclick="openGrievanceForm()">+ Raise Grievance</button>` : "")}
        <div class="stats-grid">
            ${stat("!", "Open", count("open"), "Awaiting response")}
            ${stat("◷", "Under Review", count("under_review"), "Being processed")}
            ${stat("✓", "Resolved", count("resolved"), "Closed successfully")}
            ${stat("✕", "Rejected", count("rejected"), "Not upheld")}
        </div>
        <div class="card">
            <div class="card-header"><h3>Grievances</h3></div>
            ${grievances.length ? grievances.map(g => `
                <div class="list-row">
                    <div><strong style="font-size:12px">${esc(g.grievance_number)} · ${esc(g.subject)}</strong>
                        <small>${esc(g.case_number)} · ${esc(humanize(g.category))} · ${fmtDate(g.created_at)}${state.role !== "citizen" ? " · " + esc(g.citizen_name) : ""}</small></div>
                    <div>${statusBadge(g.status)}
                        <button class="link-btn" style="margin-left:8px" onclick="openGrievance(${Number(g.grievance_id)})">View</button></div>
                </div>`).join("") : `<div class="empty">No grievances found.</div>`}
        </div>`;
}

function openGrievance(id) {
    const g = (cache.grievances || []).find(item => item.grievance_id === Number(id));
    if (!g) return;
    openModal(`<h2>${esc(g.grievance_number)}</h2><p><strong>${esc(g.subject)}</strong></p>
        <div class="detail-list">
            ${detail("Case", g.case_number)}${detail("Category", humanize(g.category))}
            ${detail("Status", statusBadge(g.status), true)}${detail("Filed by", g.citizen_name)}
            ${detail("Submitted", fmtDate(g.created_at))}${detail("Resolved", fmtDate(g.resolved_at))}
        </div>
        <p style="margin-top:16px"><strong>Description</strong><br>${esc(g.description)}</p>
        ${g.resolution ? `<p style="margin-top:12px"><strong>Resolution</strong><br>${esc(g.resolution)}</p>` : ""}`);
}

async function openGrievanceForm() {
    openModal(loadingHtml());
    try {
        const { cases } = await api("/api/cases");
        if (!cases.length) return openModal(`<h2>Raise a Grievance</h2><p>You need an acquisition case before you can raise a grievance.</p>`);
        const items = cases.map(c => ({ value: c.case_id, label: `${c.case_number} · ${c.survey_number}` }));
        formModal("Raise a Grievance", "Submit an issue related to land, documents, acquisition or compensation.", `
            ${selectField("f_case", "Case", itemOptions(items))}
            ${selectField("f_category", "Category", enumOptions(GRIEVANCE_CATEGORIES, "compensation"))}
            ${field("f_subject", "Subject", { full: true, attrs: 'maxlength="200"' })}
            ${textField("f_desc", "Description", "Describe the issue…")}`, "Submit Grievance", "submitGrievance");
    } catch (err) {
        openModal(`<h2>Raise a Grievance</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

function submitGrievance(btn) {
    return runSubmit(btn, async () => {
        const payload = { case_id: Number(val("f_case")), category: val("f_category"), subject: val("f_subject"), description: val("f_desc") };
        if (!payload.case_id || !payload.subject || !payload.description) throw new Error("Case, subject and description are required.");
        const res = await post("/api/grievances", payload);
        done(`Grievance ${res.grievance_number} submitted.`);
    });
}

/* ================= MAP ================= */

const PIN_COLORS = { acquired: "#138808", compensation: "#ff9933", under_review: "#0b2a7a", verification: "#0b2a7a", pending: "#dc2626" };

async function mapPage() {
    const { lands } = await api("/api/lands");
    cache.lands = lands;
    const pts = lands.filter(l => l.latitude != null && l.longitude != null)
        .map(l => ({ ...l, lat: Number(l.latitude), lng: Number(l.longitude) }));

    let pins = "";
    if (pts.length) {
        const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const spanLat = maxLat - minLat || 0.01, spanLng = maxLng - minLng || 0.01;
        pins = pts.map(p => {
            const x = 10 + ((p.lng - minLng) / spanLng) * 80;
            const y = 90 - ((p.lat - minLat) / spanLat) * 80;
            return `<button class="pin" title="${esc(p.survey_number)} · ${esc(p.village)}"
                style="left:${x}%;top:${y}%;background:${PIN_COLORS[p.status] || "#ff9933"}"
                onclick="openLand(${Number(p.land_id)})" aria-label="Survey ${esc(p.survey_number)}"></button>`;
        }).join("");
    }

    return `
        ${intro("Land Map", "Recorded parcel coordinates plotted by relative position.")}
        <div class="card">
            <div class="map" style="height:520px">
                <div class="map-controls"><input placeholder="Search survey no. + Enter" aria-label="Search survey number"
                    onkeydown="if(event.key==='Enter') searchMap(this.value)"></div>
                ${pts.length ? pins : `<div class="map-empty">No land records with latitude and longitude yet.<br>Add coordinates when creating a land record to see it here.</div>`}
            </div>
            <div class="legend">
                <span><i class="l-green"></i>Acquired</span><span><i class="l-orange"></i>Compensation / Other</span>
                <span><i class="l-blue"></i>Under review / Verification</span><span><i class="l-red"></i>Pending</span>
            </div>
            <p class="hint">Showing ${pts.length} of ${lands.length} parcels that have coordinates.</p>
        </div>`;
}

function searchMap(query) {
    const q = String(query).trim().toLowerCase();
    const land = (cache.lands || []).find(l => l.survey_number.toLowerCase() === q);
    if (land) openLand(land.land_id);
    else toast("No matching survey number found.", "error");
}

/* ================= PROJECTS (admin) ================= */

async function projectsPage() {
    const { projects } = await api("/api/projects");
    cache.projects = projects;
    state.after = () => makeChart("projectChart", {
        type: "bar",
        data: { labels: projects.map(p => p.project_name), datasets: [{ data: projects.map(projectProgress), backgroundColor: "#138808", borderRadius: 8 }] },
        options: chartOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" } } } })
    });

    return `
        ${intro("Projects", "Monitor acquisition progress project by project.",
            `<button class="primary-btn" onclick="openProjectForm()">+ Add Project</button>`)}
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3>Completion by Project</h3><span>Completed cases</span></div>
                <div class="chart-wrap"><canvas id="projectChart"></canvas></div></div>
            <div class="card"><div class="card-header"><h3>Project Summary</h3></div>
                ${projects.length ? projects.map(p => `
                    <div style="padding:12px 0;border-bottom:1px solid #edf1ee">
                        <strong style="font-size:12px">${esc(p.project_name)}</strong>
                        <span style="float:right">${statusBadge(p.status)}</span>
                        <div style="font-size:11px;color:#64708a;margin-top:6px">
                            ${esc(p.district)}, ${esc(p.state)} · ${Number(p.land_count)} parcels · ${Number(p.case_count)} cases · ${projectProgress(p)}% complete
                            ${p.target_date ? " · target " + fmtDate(p.target_date) : ""}
                        </div></div>`).join("") : `<div class="empty">No projects yet.</div>`}
            </div>
        </div>`;
}

function openProjectForm() {
    formModal("Add Project", "Create a new acquisition project.", `
        ${field("f_pname", "Project name", { full: true })}
        ${field("f_dept", "Department")}${field("f_target", "Target date", { type: "date" })}
        ${field("f_district", "District")}${field("f_state", "State")}
        ${selectField("f_pstatus", "Status", enumOptions(PROJECT_STATUS), true)}
        ${textField("f_desc", "Description (optional)")}`, "Create Project", "submitProject");
}

function submitProject(btn) {
    return runSubmit(btn, async () => {
        const payload = {
            project_name: val("f_pname"), department: val("f_dept") || undefined, district: val("f_district"),
            state: val("f_state"), target_date: val("f_target") || undefined, status: val("f_pstatus"),
            description: val("f_desc") || undefined
        };
        if (!payload.project_name || !payload.district || !payload.state) throw new Error("Project name, district and state are required.");
        await post("/api/projects", payload);
        done("Project created.");
    });
}

/* ================= USERS (admin) ================= */

function userTable(rows) {
    return table(["Name", "Username", "Email", "Role", "District", "Status"],
        rows.map(u => `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.username)}</td><td>${esc(u.email)}</td>
            <td>${esc(humanize(u.role))}</td><td>${esc(u.district || "—")}</td><td>${statusBadge(u.account_status)}</td></tr>`),
        "No users found.");
}

async function usersPage() {
    const { users } = await api("/api/users");
    cache.users = users;
    return `
        ${intro("User Management", "Manage citizens, officers and administrators.",
            `<button class="primary-btn" onclick="openUserForm()">+ Add User</button>`)}
        <div class="card">
            <div class="table-tools"><input class="search" id="userSearch" oninput="filterUsers()" placeholder="Search users…"></div>
            <div id="userTable">${userTable(users)}</div>
        </div>`;
}

function filterUsers() {
    const q = val("userSearch").toLowerCase();
    $("userTable").innerHTML = userTable(cache.users.filter(u => !q || [u.name, u.username, u.email, u.role, u.district].join(" ").toLowerCase().includes(q)));
}

function openUserForm() {
    formModal("Add User", "Create an account for a citizen, land officer or administrator.", `
        ${field("f_name", "Full name")}${field("f_username", "Username")}
        ${field("f_email", "Email", { type: "email" })}
        ${field("f_password", "Password (5 digits)", { type: "password", attrs: 'inputmode="numeric" pattern="\\d{5}" maxlength="5" autocomplete="new-password"' })}
        ${selectField("f_role", "Role", enumOptions(["citizen", "officer", "admin"], "officer"))}
        ${field("f_district", "District (optional)")}${field("f_phone", "Phone (optional)")}`, "Create User", "submitUser");
}

function submitUser(btn) {
    return runSubmit(btn, async () => {
        const payload = {
            name: val("f_name"), username: val("f_username"), email: val("f_email"), password: $("f_password").value,
            role: val("f_role"), district: val("f_district") || undefined, phone: val("f_phone") || undefined
        };
        if (!payload.name || !payload.username || !payload.email || !payload.password) throw new Error("Name, username, email and password are required.");
        if (!PASSWORD_RE.test(payload.password)) throw new Error("Password must be exactly 5 digits.");
        await post("/api/users", payload);
        done("User created.");
    });
}

/* ================= ANALYTICS (admin) ================= */

async function analyticsPage() {
    const s = await api("/api/dashboard/stats");
    const c = s.compensation;
    const g = s.grievances;
    const totalG = g.open + g.under_review + g.resolved + g.rejected;
    const completion = pct(s.statusCounts.completed || 0, s.totalCases);
    state.after = () => { trendChartAfter(s, "analyticsChart"); statusChartAfter(s); };

    return `
        ${intro("Analytics & Reports", "Acquisition performance based on live data.")}
        <div class="stats-grid">
            ${stat("✓", "Completion Rate", `${Math.round(completion)}%`, `${s.statusCounts.completed || 0} of ${s.totalCases} cases`)}
            ${stat("₹", "Approved", money(c.approved), `${money(c.assessed)} assessed`)}
            ${stat("↗", "Paid", money(c.paid), `${Math.round(pct(c.paid, c.approved))}% of approved`)}
            ${stat("!", "Open Grievances", g.open + g.under_review, `${g.resolved} resolved`)}
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3>Cases Created per Month</h3></div>
                <div class="chart-wrap"><canvas id="analyticsChart"></canvas></div></div>
            <div class="card"><div class="card-header"><h3>Operational Indicators</h3></div>
                ${indicator("Cases completed", completion)}
                ${indicator("Compensation paid vs approved", pct(c.paid, c.approved))}
                ${indicator("Compensation approved vs assessed", pct(c.approved, c.assessed))}
                ${indicator("Grievances resolved", pct(g.resolved, totalG))}
            </div>
        </div>
        <div class="card" style="margin-top:18px"><div class="card-header"><h3>Cases by Status</h3></div>
            <div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>`;
}

/* ================= PROFILE ================= */

async function profilePage() {
    const { user } = await api("/api/auth/me");
    return `
        ${intro("Profile", "Your account information.")}
        <div class="card"><div class="detail-list">
            ${detail("Name", user.name)}${detail("Username", user.username)}
            ${detail("Email", user.email)}${detail("Phone", user.phone || "—")}
            ${detail("Role", user.role === "officer" ? "Land Officer" : humanize(user.role))}${detail("District", user.district || "—")}
            ${detail("Account status", statusBadge(user.account_status), true)}${detail("Member since", fmtDate(user.created_at))}
        </div></div>`;
}

/* ================= NOTIFICATIONS ================= */

async function refreshNotificationDot() {
    try {
        const { notifications } = await api("/api/notifications");
        $("notifDot").classList.toggle("hidden", !notifications.some(n => !n.is_read));
    } catch (e) { /* non-critical */ }
}

async function showNotifications() {
    openModal(loadingHtml());
    try {
        const { notifications } = await api("/api/notifications");
        openModal(`<h2>Notifications</h2><div class="notification-list" style="margin-top:14px">
            ${notifications.length ? notifications.map(n => `<div class="notification"><strong>${esc(n.title)}</strong><br>${esc(n.message)}
                <small>${fmtDate(n.created_at)}</small></div>`).join("") : `<div class="empty">No notifications yet.</div>`}</div>`);
        if (notifications.some(n => !n.is_read)) {
            await api("/api/notifications/read", { method: "POST" });
            $("notifDot").classList.add("hidden");
        }
    } catch (err) {
        openModal(`<h2>Notifications</h2><div class="form-error">${esc(err.message)}</div>`);
    }
}

/* ================= ROUTER TABLE & START ================= */

const PAGES = {
    dashboard: dashboardPage, land: landPage, cases: casesPage, compensation: compensationPage,
    documents: documentsPage, grievances: grievancesPage, map: mapPage, projects: projectsPage,
    users: usersPage, analytics: analyticsPage, profile: profilePage
};

restoreSession();