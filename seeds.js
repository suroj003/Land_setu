// One-time helper: creates 2 administrator and 2 land officer demo accounts,
// all with the password 12345.
// Run from the project root: node seed_demo_accounts.js
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("./db");

const ACCOUNTS = [
    { username: "admin1", name: "Administrator One", email: "admin1@example.com", role: "admin" },
    { username: "admin2", name: "Administrator Two", email: "admin2@example.com", role: "admin" },
    { username: "officer1", name: "Land Officer One", email: "officer1@example.com", role: "officer" },
    { username: "officer2", name: "Land Officer Two", email: "officer2@example.com", role: "officer" }
];

const PASSWORD = "12345";

(async () => {
    try {
        const hash = await bcrypt.hash(PASSWORD, 10);

        for (const acc of ACCOUNTS) {
            try {
                const [result] = await pool.query(
                    `INSERT INTO users (username, name, email, password_hash, role)
                     VALUES (?, ?, ?, ?, ?)`,
                    [acc.username, acc.name, acc.email, hash, acc.role]
                );
                console.log(`Created ${acc.role} "${acc.username}" (user_id ${result.insertId})`);
            } catch (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    console.log(`Skipped "${acc.username}" — username or email already exists.`);
                } else {
                    throw err;
                }
            }
        }
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();