const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "segredo_super_secreto_desenvolvimento";

// ─── CRIAR TABELAS ────────────────────────────────────────────────────────────

db.serialize(() => {
  // Tabela de usuários com campos extras
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

  // Adicionar colunas novas se a tabela já existia sem elas
  db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN last_login TEXT`, () => {});

  // Tabela de audit log
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_user TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_label TEXT,
      details TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
});

// ─── MIDDLEWARE DE AUTENTICAÇÃO ───────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a administradores" });
  }
  next();
}

// ─── HELPER: REGISTRAR AUDIT LOG ─────────────────────────────────────────────

function auditLog(actor, action, targetType, targetId, targetLabel, details, req) {
  const ip = req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "-";
  const userAgent = req?.headers?.["user-agent"] || "-";

  db.run(
    `INSERT INTO audit_log 
     (actor_id, actor_user, action, target_type, target_id, target_label, details, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor?.id || null,
      actor?.user || "system",
      action,
      targetType || null,
      targetId ? String(targetId) : null,
      targetLabel || null,
      details ? JSON.stringify(details) : null,
      ip,
      userAgent,
    ],
    (err) => {
      if (err) console.error("❌ Erro ao registrar audit log:", err.message);
    }
  );
}

// ─── LISTAR TODOS OS USUÁRIOS ─────────────────────────────────────────────────

router.get("/admin/users", authMiddleware, adminOnly, (req, res) => {
  db.all(
    `SELECT id, user, name, email, role, active, created_at, last_login FROM users ORDER BY id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      auditLog(req.user, "LIST_USERS", "users", null, null, null, req);
      res.json(rows);
    }
  );
});

// ─── CRIAR USUÁRIO (ADMIN) ────────────────────────────────────────────────────

router.post("/admin/users", authMiddleware, adminOnly, async (req, res) => {
  const { user, name, email, password, role } = req.body;

  if (!user?.trim() || !name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Dados inválidos" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });
  }

  const allowedRoles = ["admin", "operator", "viewer"];
  const safeRole = allowedRoles.includes(role) ? role : "viewer";

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (user, name, email, password, role, active) VALUES (?, ?, ?, ?, ?, 1)`,
      [user.trim(), name.trim(), email.trim().toLowerCase(), hash, safeRole],
      function (err) {
        if (err) return res.status(400).json({ error: "Usuário ou email já existe" });

        auditLog(
          req.user,
          "CREATE_USER",
          "user",
          this.lastID,
          user.trim(),
          { name, email, role: safeRole },
          req
        );

        res.status(201).json({ success: true, id: this.lastID });
      }
    );
  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── EDITAR USUÁRIO ───────────────────────────────────────────────────────────

router.put("/admin/users/:id", authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { name, email, role, active, password } = req.body;

  const allowedRoles = ["admin", "operator", "viewer"];
  const safeRole = allowedRoles.includes(role) ? role : undefined;

  // Impede remover admin de si mesmo
  if (String(req.user.id) === String(id) && safeRole && safeRole !== "admin") {
    return res.status(400).json({ error: "Você não pode rebaixar a própria conta" });
  }

  try {
    // Busca usuário atual para diff
    db.get(`SELECT * FROM users WHERE id = ?`, [id], async (err, current) => {
      if (err || !current) return res.status(404).json({ error: "Usuário não encontrado" });

      const changes = {};
      const fields = [];
      const values = [];

      if (name && name !== current.name) {
        fields.push("name = ?");
        values.push(name.trim());
        changes.name = { from: current.name, to: name.trim() };
      }
      if (email && email !== current.email) {
        fields.push("email = ?");
        values.push(email.trim().toLowerCase());
        changes.email = { from: current.email, to: email.trim().toLowerCase() };
      }
      if (safeRole && safeRole !== current.role) {
        fields.push("role = ?");
        values.push(safeRole);
        changes.role = { from: current.role, to: safeRole };
      }
      if (active !== undefined && Number(active) !== current.active) {
        fields.push("active = ?");
        values.push(Number(active));
        changes.active = { from: current.active, to: Number(active) };
      }
      if (password && password.length >= 6) {
        const hash = await bcrypt.hash(password, 10);
        fields.push("password = ?");
        values.push(hash);
        changes.password = "alterada";
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Nenhuma alteração detectada" });
      }

      values.push(id);
      db.run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values, (err) => {
        if (err) return res.status(500).json({ error: err.message });

        auditLog(req.user, "EDIT_USER", "user", id, current.user, changes, req);
        res.json({ success: true, changes });
      });
    });
  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

// ─── DELETAR USUÁRIO ──────────────────────────────────────────────────────────

router.delete("/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;

  if (String(req.user.id) === String(id)) {
    return res.status(400).json({ error: "Não é possível deletar a própria conta" });
  }

  db.get(`SELECT id, user, name, email FROM users WHERE id = ?`, [id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });

    db.run(`DELETE FROM users WHERE id = ?`, [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      auditLog(req.user, "DELETE_USER", "user", id, user.user, { name: user.name, email: user.email }, req);
      res.json({ success: true });
    });
  });
});

// ─── ATIVAR / DESATIVAR USUÁRIO ───────────────────────────────────────────────

router.patch("/admin/users/:id/toggle", authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;

  if (String(req.user.id) === String(id)) {
    return res.status(400).json({ error: "Não é possível desativar a própria conta" });
  }

  db.get(`SELECT id, user, active FROM users WHERE id = ?`, [id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });

    const newActive = user.active ? 0 : 1;
    db.run(`UPDATE users SET active = ? WHERE id = ?`, [newActive, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      auditLog(
        req.user,
        newActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        "user",
        id,
        user.user,
        { active: newActive },
        req
      );
      res.json({ success: true, active: newActive });
    });
  });
});

// ─── RESETAR SENHA ────────────────────────────────────────────────────────────

router.post("/admin/users/:id/reset-password", authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });
  }

  db.get(`SELECT id, user FROM users WHERE id = ?`, [id], async (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });

    const hash = await bcrypt.hash(password, 10);
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [hash, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      auditLog(req.user, "RESET_PASSWORD", "user", id, user.user, null, req);
      res.json({ success: true });
    });
  });
});

// ─── AUDIT LOG: LISTAR ────────────────────────────────────────────────────────

router.get("/admin/audit-log", authMiddleware, adminOnly, (req, res) => {
  const { limit = 100, offset = 0, action, actor, target_id } = req.query;

  let where = [];
  let params = [];

  if (action) { where.push("action = ?"); params.push(action); }
  if (actor) { where.push("actor_user LIKE ?"); params.push(`%${actor}%`); }
  if (target_id) { where.push("target_id = ?"); params.push(String(target_id)); }

  const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) AS total FROM audit_log ${whereStr}`;
  const dataSql = `SELECT * FROM audit_log ${whereStr} ORDER BY id DESC LIMIT ? OFFSET ?`;

  db.get(countSql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    const total = row.total;
    db.all(dataSql, [...params, Number(limit), Number(offset)], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ total, entries: rows });
    });
  });
});

// ─── AUDIT LOG: ACTIONS DISPONÍVEIS ──────────────────────────────────────────

router.get("/admin/audit-log/actions", authMiddleware, adminOnly, (req, res) => {
  db.all(`SELECT DISTINCT action FROM audit_log ORDER BY action`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map((r) => r.action));
  });
});

// ─── ME: PERFIL DO USUÁRIO LOGADO ─────────────────────────────────────────────

router.get("/admin/me", authMiddleware, (req, res) => {
  db.get(
    `SELECT id, user, name, email, role, active, created_at, last_login FROM users WHERE id = ?`,
    [req.user.id],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
      res.json(user);
    }
  );
});

// ─── HOOK: REGISTRAR LOGIN NO AUDIT LOG + atualiza last_login ─────────────────
// Este export permite que o server.js chame após login bem-sucedido

router.auditLogin = function (userId, username, req) {
  db.run(`UPDATE users SET last_login = datetime('now') WHERE id = ?`, [userId]);
  auditLog({ id: userId, user: username }, "LOGIN", "user", userId, username, null, req);
};

router.auditLogout = function (userId, username, req) {
  auditLog({ id: userId, user: username }, "LOGOUT", "user", userId, username, null, req);
};

module.exports = router;
