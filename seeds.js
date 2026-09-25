// Usage: node seed.js <username> "<Full Name>" <email> <5-digit-password>
// Creates the first administrator. Run once after importing main_db.sql.
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("./db");

(async () => {
    const [username, name, email, password] = process.argv.slice(2);

    if (!username || !name || !email || !password) {
        console.error('Usage: node seed.js <username> "<Full Name>" <email> <5-digit-password>');
        process.exit(1);
    }
    if (!/^\d{5}$/.test(password)) {
        console.error("Password must be exactly 5 digits.");
        process.exit(1);
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            `INSERT INTO users (username, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`,
            [username, name, email.toLowerCase(), hash]
        );
        console.log(`Admin created with user_id ${result.insertId}`);
    } catch (err) {
        console.error(err.code === "ER_DUP_ENTRY" ? "Username or email already exists." : err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();