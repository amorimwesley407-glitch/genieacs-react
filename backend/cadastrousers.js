const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn("AVISO: JWT_SECRET não definido no .env. Use uma chave forte em produção!");
}
const JWT_SECRET = SECRET || "segredo_super_secreto_desenvolvimento";

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  )
`);

/* CADASTRO PÚBLICO */
router.post("/register", async (req, res) => {
  const { user, name, email, password } = req.body;

  if (!user?.trim() || !name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Dados inválidos" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (user, name, email, password, role, active) VALUES (?, ?, ?, ?, 'viewer', 1)",
      [user.trim(), name.trim(), email.trim().toLowerCase(), hash],
      function (err) {
        if (err) {
          return res.status(400).json({ error: "Usuário ou email já existe" });
        }

        // Registra no audit log via adminRouter (lazy require para evitar circular)
        try {
          const adminRouter = require("./admin-users");
          if (adminRouter.auditLogin) {
            adminRouter.auditLogin(this.lastID, user.trim(), req);
          }
        } catch {}

        res.status(201).json({ success: true });
      }
    );
  } catch (err) {
    console.error("Erro no hash da senha:", err);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

/* LOGIN (EMAIL OU USERNAME) */
router.post("/login", (req, res) => {
  const { login, password } = req.body;

  if (!login?.trim() || !password) {
    return res.status(400).json({ error: "Login e senha são obrigatórios" });
  }

  db.get(
    "SELECT id, user, name, email, password, role, active FROM users WHERE email = ? OR user = ?",
    [login.trim(), login.trim()],
    async (err, user) => {
      if (err) {
        console.error("Erro ao consultar usuário:", err);
        return res.status(500).json({ error: "Erro interno no servidor" });
      }

      if (!user) {
        return res.status(401).json({ error: "Usuário não encontrado" });
      }

      if (!user.active) {
        return res.status(403).json({ error: "Conta desativada. Contate o administrador." });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Senha inválida" });
      }

      const token = jwt.sign(
        { id: user.id, user: user.user, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: "1d" }
      );

      // Atualiza last_login e registra audit
      db.run(`UPDATE users SET last_login = datetime('now') WHERE id = ?`, [user.id]);
      try {
        const adminRouter = require("./admin-users");
        if (adminRouter.auditLogin) adminRouter.auditLogin(user.id, user.user, req);
      } catch {}

      res.json({
        token,
        name: user.name,
        user: user.user,
        email: user.email,
        role: user.role,
      });
    }
  );
});

module.exports = router;
