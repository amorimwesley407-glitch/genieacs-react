/**
 * Módulo compartilhado de conexão SQLite.
 * centraliza a abertura do banco de dados para evitar
 * múltiplas conexões concorrentes entre server.js, cadastrousers.js e admin-users.js.
 */
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
  path.join(__dirname, "database.db"),
  (err) => {
    if (err) console.error("❌ DB error:", err.message);
    else console.log("📦 SQLite conectado");
  }
);

module.exports = db;