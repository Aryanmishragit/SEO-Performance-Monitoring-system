require("dotenv").config();

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
host: process.env.DB_HOST || "localhost",
user: process.env.DB_USER || "root",
password: process.env.DB_PASSWORD || "",
database: process.env.DB_NAME || "seo_mini",
waitForConnections: true,
connectionLimit: 5,
queueLimit: 0
});

async function testConnection() {
const connection = await pool.getConnection();

try {
await connection.ping();
console.log("MySQL connected successfully.");
} finally {
connection.release();
}
}

module.exports = { pool, testConnection };
