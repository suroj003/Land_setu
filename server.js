require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is not set in the environment.");
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
    res.json({ success: true, message: "LandSetu API is running" });
});

/* ---------------- helpers ---------------- */

const DUMMY_HASH = bcrypt.hashSync("00000", 10);
const PASSWORD_RE = /^\d{5}$/;

function asyncHandler(fn) {
    return (req, res, next) => fn(req, res, next).catch(next);
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ success: false, message: "Missing or invalid Authorization header" });
    }

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(401).json({ success: false, message: "Invalid or expired token" });
        }
        req.user = payload;
        next();
    });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "Insufficient permissions" });
        }
        next();
    };
}

const isMissing = v => v === undefined || v === null || v === "";
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toId = v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const toAmount = v => (isMissing(v) ? 0 : Number(v));
const humanize = v => String(v).replace(/_/g, " ");

function generateCode(prefix) {
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${prefix}-${Date.now().toString(36).toUpperCase()}${rand}`;
}

function resolveEnum(map, input) {
    if (isMissing(input)) return null;
    const key = String(input).trim().toLowerCase();
    if (Object.values(map).includes(key)) return key;
    return map[key] || null;
}

const ROLE_MAP = { citizen: "citizen", officer: "officer", admin: "admin" };
const LAND_STATUS_MAP = {
    "pending": "pending", "under review": "under_review", "verification": "verification",
    "compensation": "compensation", "acquired": "acquired"
};
const LAND_TYPE_MAP = {
    "agricultural": "agricultural", "residential": "residential", "commercial": "commercial",
    "government": "government", "other": "other"
};
const CASE_STATUS_MAP = {
    "application submitted": "application_submitted", "document review": "document_review",
    "land verification": "land_verification", "notification issued": "notification_issued",
    "objection period": "objection_period", "compensation pending": "compensation_pending",
    "approved": "approved", "rejected": "rejected", "completed": "completed", "disputed": "disputed"
};
const DOCUMENT_TYPE_MAP = {
    "land record": "land_record", "identity proof": "identity_proof", "bank details": "bank_details",
    "sale deed": "sale_deed", "ownership proof": "ownership_proof", "valuation report": "valuation_report",
    "notice": "notice", "other": "other"
};
const PROJECT_STATUS_MAP = { planned: "planned", ongoing: "ongoing", completed: "completed" };
const PAYMENT_STATUS_MAP = {
    "pending": "pending", "approved": "approved", "processing": "processing",
    "partially paid": "partially_paid", "paid": "paid"
};
const GRIEVANCE_CATEGORY_MAP = {
    land: "land", document: "document", acquisition: "acquisition", compensation: "compensation", other: "other"
};

/* ---------------- access-control helpers ---------------- */

const CASE_SELECT = `
    SELECT ac.*, l.survey_number, l.land_code, l.owner_id,
           u.name AS owner_name, p.project_name, o.name AS officer_name
    FROM acquisition_cases ac
    JOIN land l ON ac.land_id = l.land_id
    JOIN users u ON l.owner_id = u.user_id
    JOIN projects p ON ac.project_id = p.project_id
    LEFT JOIN users o ON ac.officer_id = o.user_id
`;

async function findCaseWithAccessInfo(caseId) {
    const [rows] = await pool.query(`${CASE_SELECT} WHERE ac.case_id = ?`, [caseId]);
    return rows[0] || null;
}

function canAccessCase(user, caseRow) {
    if (user.role === "admin") return true;
    if (user.role === "officer") return caseRow.officer_id === user.user_id;
    if (user.role === "citizen") return caseRow.owner_id === user.user_id;
    return false;
}

function caseScope(user) {
    if (user.role === "citizen") return { where: "l.owner_id = ?", params: [user.user_id] };
    if (user.role === "officer") return { where: "ac.officer_id = ?", params: [user.user_id] };
    return { where: "1 = 1", params: [] };
}

function grievanceScope(user) {
    if (user.role === "citizen") return { where: "g.citizen_id = ?", params: [user.user_id] };
    if (user.role === "officer") {
        return { where: "(g.assigned_officer_id = ? OR ac.officer_id = ?)", params: [user.user_id, user.user_id] };
    }
    return { where: "1 = 1", params: [] };
}

/* ---------------- auth ---------------- */

app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const { username, password, role } = req.body;

    if (isMissing(username) || isMissing(password)) {
        return res.status(400).json({ success: false, message: "username and password are required" });
    }

    const [rows] = await pool.query(
        "SELECT user_id, username, name, password_hash, role, account_status FROM users WHERE username = ?",
        [String(username).trim()]
    );
    const user = rows[0];

    // Always run bcrypt so response time does not reveal whether a username exists.
    const match = await bcrypt.compare(String(password), user ? user.password_hash : DUMMY_HASH);

    if (!user || !match) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (user.account_status !== "active") {
        return res.status(403).json({ success: false, message: "This account is inactive" });
    }

    if (!isMissing(role)) {
        const requestedRole = resolveEnum(ROLE_MAP, role);
        if (!requestedRole) {
            return res.status(400).json({ success: false, message: `Invalid role: ${role}` });
        }
        if (requestedRole !== user.role) {
            return res.status(401).json({
                success: false,
                message: `This account is registered as ${humanize(user.role)}, not ${humanize(requestedRole)}. Select the correct role and try again.`
            });
        }
    }

    const token = jwt.sign({ user_id: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });

    res.json({
        success: true, token,
        user_id: user.user_id, username: user.username, name: user.name, role: user.role
    });
}));

app.get("/api/auth/me", authenticateToken, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT user_id, username, name, email, phone, role, district, account_status, created_at
         FROM users WHERE user_id = ?`,
        [req.user.user_id]
    );
    if (rows.length === 0 || rows[0].account_status !== "active") {
        return res.status(401).json({ success: false, message: "Account not found or inactive" });
    }
    res.json({ success: true, user: rows[0] });
}));

/* ---------------- dashboard ---------------- */

app.get("/api/dashboard/stats", authenticateToken, asyncHandler(async (req, res) => {
    const cs = caseScope(req.user);
    const gs = grievanceScope(req.user);
    const isCitizen = req.user.role === "citizen";

    const [[land]] = await pool.query(
        `SELECT COUNT(*) AS total FROM land ${isCitizen ? "WHERE owner_id = ?" : ""}`,
        isCitizen ? [req.user.user_id] : []
    );
    const [[projects]] = await pool.query("SELECT COUNT(*) AS total FROM projects");

    const [statusRows] = await pool.query(
        `SELECT ac.status, COUNT(*) AS total
         FROM acquisition_cases ac JOIN land l ON ac.land_id = l.land_id
         WHERE ${cs.where} GROUP BY ac.status`,
        cs.params
    );
    const statusCounts = {};
    let totalCases = 0;
    statusRows.forEach(r => { statusCounts[r.status] = r.total; totalCases += r.total; });

    const [monthly] = await pool.query(
        `SELECT DATE_FORMAT(ac.created_at, '%Y-%m') AS month, COUNT(*) AS total
         FROM acquisition_cases ac JOIN land l ON ac.land_id = l.land_id
         WHERE ${cs.where} GROUP BY month ORDER BY month DESC LIMIT 12`,
        cs.params
    );

    const [[comp]] = await pool.query(
        `SELECT COALESCE(SUM(c.assessed_amount), 0) AS assessed,
                COALESCE(SUM(c.approved_amount), 0) AS approved,
                COALESCE(SUM(c.paid_amount), 0) AS paid
         FROM compensation c
         JOIN acquisition_cases ac ON c.case_id = ac.case_id
         JOIN land l ON ac.land_id = l.land_id
         WHERE ${cs.where}`,
        cs.params
    );

    const [grievanceRows] = await pool.query(
        `SELECT g.status, COUNT(*) AS total
         FROM grievances g JOIN acquisition_cases ac ON g.case_id = ac.case_id
         WHERE ${gs.where} GROUP BY g.status`,
        gs.params
    );
    const grievances = { open: 0, under_review: 0, resolved: 0, rejected: 0 };
    grievanceRows.forEach(r => { grievances[r.status] = r.total; });

    res.json({
        success: true,
        totalLand: land.total,
        totalProjects: projects.total,
        totalCases,
        statusCounts,
        monthly: monthly.reverse(),
        compensation: {
            assessed: Number(comp.assessed), approved: Number(comp.approved), paid: Number(comp.paid)
        },
        grievances
    });
}));

/* ---------------- projects ---------------- */

app.get("/api/projects", authenticateToken, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT p.*,
                (SELECT COUNT(*) FROM land l WHERE l.project_id = p.project_id) AS land_count,
                COUNT(ac.case_id) AS case_count,
                COALESCE(SUM(ac.status = 'completed'), 0) AS completed_cases
         FROM projects p
         LEFT JOIN acquisition_cases ac ON ac.project_id = p.project_id
         GROUP BY p.project_id
         ORDER BY p.created_at DESC`
    );
    res.json({ success: true, projects: rows });
}));

app.post("/api/projects", authenticateToken, requireRole("admin"), asyncHandler(async (req, res) => {
    const { project_name, description, department, district, state, target_date, status } = req.body;

    if (isMissing(project_name) || isMissing(district) || isMissing(state)) {
        return res.status(400).json({ success: false, message: "project_name, district and state are required" });
    }
    if (!isMissing(target_date) && !isDate(target_date)) {
        return res.status(400).json({ success: false, message: "target_date must be YYYY-MM-DD" });
    }

    const resolvedStatus = isMissing(status) ? "planned" : resolveEnum(PROJECT_STATUS_MAP, status);
    if (!resolvedStatus) {
        return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO projects (project_name, description, department, district, state, target_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [project_name.trim(), description || null, department || null, district.trim(), state.trim(),
             target_date || null, resolvedStatus]
        );
        res.json({ success: true, project_id: result.insertId });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "A project with this name already exists" });
        }
        throw error;
    }
}));

/* ---------------- land ---------------- */

app.get("/api/lands", authenticateToken, asyncHandler(async (req, res) => {
    const base = `
        SELECT l.*, u.name AS owner_name, p.project_name
        FROM land l
        JOIN users u ON l.owner_id = u.user_id
        LEFT JOIN projects p ON l.project_id = p.project_id
    `;
    let rows;
    if (req.user.role === "citizen") {
        [rows] = await pool.query(`${base} WHERE l.owner_id = ? ORDER BY l.created_at DESC`, [req.user.user_id]);
    } else {
        [rows] = await pool.query(`${base} ORDER BY l.created_at DESC`);
    }
    res.json({ success: true, lands: rows });
}));

app.post("/api/lands", authenticateToken, asyncHandler(async (req, res) => {
    const {
        owner_id, project_id, survey_number, area_acres, village, district, state,
        land_type, status, latitude, longitude
    } = req.body;

    if (isMissing(survey_number) || isMissing(area_acres) || isMissing(village) ||
        isMissing(district) || isMissing(state)) {
        return res.status(400).json({
            success: false,
            message: "survey_number, area_acres, village, district and state are required"
        });
    }
    if (!(Number(area_acres) > 0)) {
        return res.status(400).json({ success: false, message: "area_acres must be greater than 0" });
    }
    if (!isMissing(latitude) && !(Math.abs(Number(latitude)) <= 90)) {
        return res.status(400).json({ success: false, message: "latitude must be between -90 and 90" });
    }
    if (!isMissing(longitude) && !(Math.abs(Number(longitude)) <= 180)) {
        return res.status(400).json({ success: false, message: "longitude must be between -180 and 180" });
    }

    let resolvedOwnerId;
    if (req.user.role === "citizen") {
        resolvedOwnerId = req.user.user_id;
    } else {
        resolvedOwnerId = toId(owner_id);
        if (!resolvedOwnerId) {
            return res.status(400).json({ success: false, message: "owner_id is required" });
        }
    }

    const resolvedStatus = isMissing(status) ? "pending" : resolveEnum(LAND_STATUS_MAP, status);
    if (!resolvedStatus) {
        return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }
    const resolvedType = isMissing(land_type) ? "agricultural" : resolveEnum(LAND_TYPE_MAP, land_type);
    if (!resolvedType) {
        return res.status(400).json({ success: false, message: `Invalid land_type: ${land_type}` });
    }

    const land_code = generateCode("LD");

    try {
        const [result] = await pool.query(
            `INSERT INTO land
                (land_code, owner_id, project_id, survey_number, area_acres, village, district, state,
                 land_type, status, latitude, longitude)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                land_code, resolvedOwnerId, toId(project_id), survey_number.trim(), Number(area_acres),
                village.trim(), district.trim(), state.trim(), resolvedType, resolvedStatus,
                isMissing(latitude) ? null : Number(latitude),
                isMissing(longitude) ? null : Number(longitude)
            ]
        );
        res.json({ success: true, land_id: result.insertId, land_code });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false, message: "A land record already exists for this survey number, village and district"
            });
        }
        if (error.code === "ER_NO_REFERENCED_ROW" || error.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({
                success: false, message: "owner_id or project_id does not reference an existing record"
            });
        }
        throw error;
    }
}));

/* ---------------- cases ---------------- */

app.get("/api/cases", authenticateToken, asyncHandler(async (req, res) => {
    const cs = caseScope(req.user);
    const [rows] = await pool.query(`${CASE_SELECT} WHERE ${cs.where} ORDER BY ac.created_at DESC`, cs.params);
    res.json({ success: true, cases: rows });
}));

app.get("/api/cases/:id", authenticateToken, asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const caseRow = id ? await findCaseWithAccessInfo(id) : null;

    if (!caseRow) {
        return res.status(404).json({ success: false, message: "Case not found" });
    }
    if (!canAccessCase(req.user, caseRow)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const [history] = await pool.query(
        `SELECT h.old_status, h.new_status, h.remarks, h.changed_at, u.name AS changed_by_name
         FROM case_status_history h JOIN users u ON h.changed_by = u.user_id
         WHERE h.case_id = ? ORDER BY h.changed_at ASC, h.history_id ASC`,
        [id]
    );

    res.json({ success: true, case: caseRow, history });
}));

app.post("/api/cases", authenticateToken, asyncHandler(async (req, res) => {
    const { land_id, project_id, officer_id, application_date, expected_completion_date, remarks, status } = req.body;

    const landId = toId(land_id);
    const projectId = toId(project_id);
    if (!landId || !projectId || isMissing(application_date)) {
        return res.status(400).json({ success: false, message: "land_id, project_id and application_date are required" });
    }
    if (!isDate(application_date) || (!isMissing(expected_completion_date) && !isDate(expected_completion_date))) {
        return res.status(400).json({ success: false, message: "Dates must be in YYYY-MM-DD format" });
    }

    const [[land]] = await pool.query("SELECT land_id, owner_id FROM land WHERE land_id = ?", [landId]);
    if (!land) {
        return res.status(404).json({ success: false, message: "Land record not found" });
    }

    let resolvedOfficer = null;
    let resolvedStatus = "application_submitted";

    if (req.user.role === "citizen") {
        if (land.owner_id !== req.user.user_id) {
            return res.status(403).json({ success: false, message: "You can only apply for your own land" });
        }
    } else {
        resolvedOfficer = req.user.role === "officer" ? req.user.user_id : toId(officer_id);
        if (!isMissing(status)) {
            resolvedStatus = resolveEnum(CASE_STATUS_MAP, status);
            if (!resolvedStatus) {
                return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
            }
        }
    }

    const case_number = generateCode("ACQ");

    try {
        const [result] = await pool.query(
            `INSERT INTO acquisition_cases
                (case_number, land_id, project_id, officer_id, status, application_date, expected_completion_date, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [case_number, landId, projectId, resolvedOfficer, resolvedStatus, application_date,
             expected_completion_date || null, remarks || null]
        );
        res.json({ success: true, case_id: result.insertId, case_number });
    } catch (error) {
        if (error.code === "ER_NO_REFERENCED_ROW" || error.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({
                success: false, message: "land_id, project_id or officer_id does not reference an existing record"
            });
        }
        throw error;
    }
}));

app.patch("/api/cases/:id/status", authenticateToken, requireRole("officer", "admin"), asyncHandler(async (req, res) => {
    const { status, remarks } = req.body;
    const caseId = toId(req.params.id);

    const resolvedStatus = resolveEnum(CASE_STATUS_MAP, status);
    if (!caseId || !resolvedStatus) {
        return res.status(400).json({ success: false, message: `Invalid case id or status: ${status}` });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [[existing]] = await connection.query(
            `SELECT ac.status, ac.officer_id, ac.case_number, l.owner_id
             FROM acquisition_cases ac JOIN land l ON ac.land_id = l.land_id
             WHERE ac.case_id = ? FOR UPDATE`,
            [caseId]
        );

        if (!existing) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Case not found" });
        }
        if (req.user.role === "officer" && existing.officer_id !== req.user.user_id) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "You are not assigned to this case" });
        }
        if (existing.status === resolvedStatus) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "The case is already in this status" });
        }

        await connection.query("UPDATE acquisition_cases SET status = ? WHERE case_id = ?", [resolvedStatus, caseId]);

        await connection.query(
            `INSERT INTO case_status_history (case_id, changed_by, old_status, new_status, remarks)
             VALUES (?, ?, ?, ?, ?)`,
            [caseId, req.user.user_id, existing.status, resolvedStatus, remarks || null]
        );

        await connection.query(
            "INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)",
            [existing.owner_id, "Case status updated",
             `Case ${existing.case_number} moved to "${humanize(resolvedStatus)}".`]
        );

        await connection.commit();
        res.json({ success: true, message: "Status updated", old_status: existing.status, new_status: resolvedStatus });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (e) { /* connection already gone */ }
        }
        throw error;
    } finally {
        if (connection) connection.release();
    }
}));

/* ---------------- compensation ---------------- */

app.get("/api/compensation", authenticateToken, asyncHandler(async (req, res) => {
    const cs = caseScope(req.user);
    const [rows] = await pool.query(
        `SELECT c.*, ac.case_number, u.name AS owner_name
         FROM compensation c
         JOIN acquisition_cases ac ON c.case_id = ac.case_id
         JOIN land l ON ac.land_id = l.land_id
         JOIN users u ON l.owner_id = u.user_id
         WHERE ${cs.where}
         ORDER BY c.updated_at DESC`,
        cs.params
    );
    res.json({ success: true, compensation: rows });
}));

app.get("/api/compensation/:caseId", authenticateToken, asyncHandler(async (req, res) => {
    const caseId = toId(req.params.caseId);
    const caseRow = caseId ? await findCaseWithAccessInfo(caseId) : null;
    if (!caseRow) {
        return res.status(404).json({ success: false, message: "Case not found" });
    }
    if (!canAccessCase(req.user, caseRow)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const [rows] = await pool.query("SELECT * FROM compensation WHERE case_id = ?", [caseId]);
    if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "No compensation recorded for this case" });
    }
    res.json({ success: true, compensation: rows[0] });
}));

app.post("/api/compensation", authenticateToken, requireRole("officer", "admin"), asyncHandler(async (req, res) => {
    const { case_id, assessed_amount, approved_amount, paid_amount, payment_reference, payment_date, payment_status, remarks } = req.body;

    const caseId = toId(case_id);
    if (!caseId) {
        return res.status(400).json({ success: false, message: "case_id is required" });
    }

    const caseRow = await findCaseWithAccessInfo(caseId);
    if (!caseRow) {
        return res.status(404).json({ success: false, message: "Case not found" });
    }
    if (!canAccessCase(req.user, caseRow)) {
        return res.status(403).json({ success: false, message: "You are not assigned to this case" });
    }

    const assessed = toAmount(assessed_amount);
    const approved = toAmount(approved_amount);
    const paid = toAmount(paid_amount);
    if (![assessed, approved, paid].every(n => Number.isFinite(n) && n >= 0)) {
        return res.status(400).json({ success: false, message: "Amounts must be non-negative numbers" });
    }
    if (paid > approved) {
        return res.status(400).json({ success: false, message: "Paid amount cannot exceed the approved amount" });
    }
    if (!isMissing(payment_date) && !isDate(payment_date)) {
        return res.status(400).json({ success: false, message: "payment_date must be YYYY-MM-DD" });
    }

    const resolvedStatus = isMissing(payment_status) ? "pending" : resolveEnum(PAYMENT_STATUS_MAP, payment_status);
    if (!resolvedStatus) {
        return res.status(400).json({ success: false, message: `Invalid payment_status: ${payment_status}` });
    }

    await pool.query(
        `INSERT INTO compensation
            (case_id, assessed_amount, approved_amount, paid_amount, payment_reference, payment_date, payment_status, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            assessed_amount = VALUES(assessed_amount),
            approved_amount = VALUES(approved_amount),
            paid_amount = VALUES(paid_amount),
            payment_reference = VALUES(payment_reference),
            payment_date = VALUES(payment_date),
            payment_status = VALUES(payment_status),
            remarks = VALUES(remarks)`,
        [caseId, assessed, approved, paid, payment_reference || null, payment_date || null,
         resolvedStatus, remarks || null]
    );

    res.json({ success: true, message: "Compensation saved" });
}));

/* ---------------- grievances ---------------- */

app.get("/api/grievances", authenticateToken, asyncHandler(async (req, res) => {
    const gs = grievanceScope(req.user);
    const [rows] = await pool.query(
        `SELECT g.*, ac.case_number, u.name AS citizen_name
         FROM grievances g
         JOIN acquisition_cases ac ON g.case_id = ac.case_id
         JOIN users u ON g.citizen_id = u.user_id
         WHERE ${gs.where}
         ORDER BY g.created_at DESC`,
        gs.params
    );
    res.json({ success: true, grievances: rows });
}));

app.post("/api/grievances", authenticateToken, asyncHandler(async (req, res) => {
    const { case_id, citizen_id, category, subject, description } = req.body;

    const caseId = toId(case_id);
    if (!caseId || isMissing(category) || isMissing(subject) || isMissing(description)) {
        return res.status(400).json({ success: false, message: "case_id, category, subject and description are required" });
    }
    if (String(subject).length > 200) {
        return res.status(400).json({ success: false, message: "subject must be 200 characters or fewer" });
    }

    const resolvedCategory = resolveEnum(GRIEVANCE_CATEGORY_MAP, category);
    if (!resolvedCategory) {
        return res.status(400).json({ success: false, message: `Invalid category: ${category}` });
    }

    const caseRow = await findCaseWithAccessInfo(caseId);
    if (!caseRow) {
        return res.status(404).json({ success: false, message: "Case not found" });
    }
    if (!canAccessCase(req.user, caseRow)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const citizenId = req.user.role === "citizen" ? req.user.user_id : toId(citizen_id);
    if (!citizenId) {
        return res.status(400).json({ success: false, message: "citizen_id is required" });
    }

    const grievance_number = generateCode("GRV");

    const [result] = await pool.query(
        `INSERT INTO grievances (grievance_number, case_id, citizen_id, assigned_officer_id, category, subject, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [grievance_number, caseId, citizenId, caseRow.officer_id, resolvedCategory, subject.trim(), description.trim()]
    );

    res.json({ success: true, grievance_id: result.insertId, grievance_number });
}));

/* ---------------- documents ---------------- */

app.get("/api/documents", authenticateToken, asyncHandler(async (req, res) => {
    const cs = caseScope(req.user);
    const [rows] = await pool.query(
        `SELECT d.*, ac.case_number, u.name AS uploaded_by_name
         FROM documents d
         JOIN acquisition_cases ac ON d.case_id = ac.case_id
         JOIN land l ON ac.land_id = l.land_id
         JOIN users u ON d.uploaded_by = u.user_id
         WHERE ${cs.where}
         ORDER BY d.uploaded_at DESC`,
        cs.params
    );
    res.json({ success: true, documents: rows });
}));

app.get("/api/documents/:caseId", authenticateToken, asyncHandler(async (req, res) => {
    const caseId = toId(req.params.caseId);
    const caseRow = caseId ? await findCaseWithAccessInfo(caseId) : null;
    if (!caseRow) {
        return res.status(404).json({ success: false, message: "Case not found" });
    }
    if (!canAccessCase(req.user, caseRow)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const [rows] = await pool.query("SELECT * FROM documents WHERE case_id = ?", [caseId]);
    res.json({ success: true, documents: rows });
}));

app.post("/api/documents", authenticateToken, asyncHandler(async (req, res) => {
    const { case_id, document_type, file_name, file_url } = req.body;

    const caseId = toId(case_id);
    if (!caseId || isMissing(document_type) || isMissing(file_name)) {
        return res.status(400).json({ success: false, message: "case_id, document_type and file_name are required" });
    }

    const resolvedType = resolveEnum(DOCUMENT_TYPE_MAP, document_type);
    if (!resolvedType) {
        return res.status(400).json({ success: false, message: `Invalid document_type: ${document_type}` });
    }
    if (!isMissing(file_url) && !/^https?:\/\/\S+$/i.test(file_url)) {
        return res.status(400).json({ success: false, message: "file_url must be an http(s) link" });
    }

    const caseRow = await findCaseWithAccessInfo(caseId);
    if (!caseRow) {
        return res.status(404).json({ success: false, message: "Case not found" });
    }
    if (!canAccessCase(req.user, caseRow)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const [result] = await pool.query(
        `INSERT INTO documents (case_id, uploaded_by, document_type, file_name, file_url)
         VALUES (?, ?, ?, ?, ?)`,
        [caseId, req.user.user_id, resolvedType, file_name.trim(), file_url || null]
    );

    res.json({ success: true, document_id: result.insertId });
}));

/* ---------------- users ---------------- */

app.get("/api/users", authenticateToken, requireRole("admin", "officer"), asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT user_id, username, name, email, phone, role, district, account_status, created_at
         FROM users ORDER BY created_at DESC`
    );
    res.json({ success: true, users: rows });
}));

// Public self-registration always creates a citizen. Only an authenticated
// admin can create officer or admin accounts.
app.post("/api/users", asyncHandler(async (req, res) => {
    const { username, name, email, password, phone, role, district } = req.body;

    if (isMissing(username) || isMissing(name) || isMissing(email) || isMissing(password)) {
        return res.status(400).json({ success: false, message: "username, name, email and password are required" });
    }
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
        return res.status(400).json({
            success: false, message: "Username must be 3-50 characters: letters, numbers, dot, dash or underscore"
        });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
        return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }
    if (!PASSWORD_RE.test(String(password))) {
        return res.status(400).json({ success: false, message: "Password must be exactly 5 digits" });
    }
    if (String(name).length > 150 || (!isMissing(phone) && String(phone).length > 15)) {
        return res.status(400).json({ success: false, message: "Name or phone number is too long" });
    }

    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let requester = null;
    if (token) {
        try { requester = jwt.verify(token, JWT_SECRET); } catch (e) { requester = null; }
    }

    let resolvedRole = "citizen";
    if (!isMissing(role)) {
        const requestedRole = resolveEnum(ROLE_MAP, role);
        if (!requestedRole) {
            return res.status(400).json({ success: false, message: `Invalid role: ${role}` });
        }
        if (requestedRole !== "citizen" && (!requester || requester.role !== "admin")) {
            return res.status(403).json({ success: false, message: "Only an administrator can assign officer or admin roles" });
        }
        resolvedRole = requestedRole;
    }

    const password_hash = await bcrypt.hash(String(password), 10);

    try {
        const [result] = await pool.query(
            `INSERT INTO users (username, name, email, password_hash, phone, role, district)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username.trim(), name.trim(), email.trim().toLowerCase(), password_hash,
             phone || null, resolvedRole, district || null]
        );
        res.json({ success: true, user_id: result.insertId });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Username or email already exists" });
        }
        throw error;
    }
}));

/* ---------------- notifications ---------------- */

app.get("/api/notifications", authenticateToken, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [req.user.user_id]
    );
    res.json({ success: true, notifications: rows });
}));

app.post("/api/notifications/read", authenticateToken, asyncHandler(async (req, res) => {
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", [req.user.user_id]);
    res.json({ success: true });
}));

app.post("/api/notifications", authenticateToken, requireRole("admin", "officer"), asyncHandler(async (req, res) => {
    const { user_id, title, message } = req.body;

    const userId = toId(user_id);
    if (!userId || isMissing(title) || isMissing(message)) {
        return res.status(400).json({ success: false, message: "user_id, title and message are required" });
    }

    try {
        const [result] = await pool.query(
            "INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)",
            [userId, title, message]
        );
        res.json({ success: true, notification_id: result.insertId });
    } catch (error) {
        if (error.code === "ER_NO_REFERENCED_ROW" || error.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({ success: false, message: "user_id does not reference an existing user" });
        }
        throw error;
    }
}));

/* ---------------- fallbacks ---------------- */

app.use("/api", (req, res) => {
    res.status(404).json({ success: false, message: "Not found" });
});

app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Invalid JSON body" });
    }
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`LandSetu listening on port ${PORT}`);
});