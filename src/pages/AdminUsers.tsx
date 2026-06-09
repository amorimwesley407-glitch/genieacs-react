import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Role = "admin" | "operator" | "viewer";

interface User {
  id: number;
  user: string;
  name: string;
  email: string;
  role: Role;
  active: number;
  created_at: string;
  last_login: string | null;
}

interface AuditEntry {
  id: number;
  actor_user: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: string | null;
  ip: string;
  user_agent: string;
  created_at: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = sessionStorage.getItem("token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function roleBadge(role: Role) {
  const map: Record<Role, { label: string; cls: string }> = {
    admin:    { label: "Admin",     cls: "bg-rose-500/20 text-rose-500 border border-rose-500/30" },
    operator: { label: "Operador",  cls: "bg-amber-500/20 text-amber-500 border border-amber-500/30" },
    viewer:   { label: "Visualizador", cls: "bg-sky-500/20 text-sky-500 border border-sky-500/30" },
  };
  const r = map[role] ?? map.viewer;
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.cls}`}>{r.label}</span>;
}

const ACTION_MAP: Record<string, { label: string; icon: string; color: string }> = {
  LOGIN:            { label: "Login",            icon: "→", color: "text-emerald-500" },
  LOGOUT:           { label: "Logout",           icon: "←", color: "text-slate-400" },
  LIST_USERS:       { label: "Listou usuários",  icon: "☰", color: "text-slate-400" },
  CREATE_USER:      { label: "Criou usuário",    icon: "+", color: "text-emerald-500" },
  EDIT_USER:        { label: "Editou usuário",   icon: "✎", color: "text-amber-500" },
  DELETE_USER:      { label: "Deletou usuário",  icon: "✕", color: "text-rose-500" },
  ACTIVATE_USER:    { label: "Ativou usuário",   icon: "✓", color: "text-emerald-500" },
  DEACTIVATE_USER:  { label: "Desativou usuário",icon: "⊘", color: "text-orange-500" },
  RESET_PASSWORD:   { label: "Resetou senha",    icon: "🔑", color: "text-purple-500" },
  DEVICE_REBOOT:       { label: "Reboot de device",    icon: "↺", color: "text-amber-500" },
  DEVICE_WIFI_CHANGE:  { label: "Alterou Wi-Fi",       icon: "📶", color: "text-sky-500" },
  DEVICE_PPPOE_CHANGE: { label: "Alterou PPPoE",       icon: "🔌", color: "text-indigo-500" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "Z").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ─── MODAL GENÉRICO ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── FORM FIELD ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:bg-muted/80 transition-colors ${className}`}
    />
  );
}

function Select({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors ${className}`}
    >
      {children}
    </select>
  );
}

function Btn({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost" | "success" }) {
  const cls = {
    primary: "bg-primary hover:bg-primary/90 text-primary-foreground",
    danger:  "bg-destructive/80 hover:bg-destructive text-destructive-foreground",
    success: "bg-emerald-600/80 hover:bg-emerald-500 text-white",
    ghost:   "bg-muted/50 hover:bg-muted text-foreground border border-border",
  }[variant];
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls} ${className}`}
    />
  );
}

// ─── MODAL: CRIAR / EDITAR USUÁRIO ───────────────────────────────────────────

function UserFormModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const { toast } = useToast();
  const [form, setForm] = useState({
    user:     user?.user     || "",
    name:     user?.name     || "",
    email:    user?.email    || "",
    role:     user?.role     || "viewer",
    password: "",
    active:   user?.active !== undefined ? String(user.active) : "1",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { name: form.name, email: form.email, role: form.role };
      if (!isEdit) { body.user = form.user; body.password = form.password; }
      if (isEdit && form.password) body.password = form.password;
      if (isEdit) body.active = Number(form.active);

      const res = await fetch(
        isEdit ? `${API_BASE}/auth/admin/users/${user!.id}` : `${API_BASE}/auth/admin/users`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro desconhecido");
      toast({ title: isEdit ? "Usuário atualizado" : "Usuário criado" });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={isEdit ? `Editar — ${user!.user}` : "Novo usuário"} onClose={onClose}>
      <div className="space-y-4">
        {!isEdit && (
          <Field label="Usuário (login)">
            <Input value={form.user} onChange={(e) => set("user", e.target.value)} placeholder="joao.silva" />
          </Field>
        )}
        <Field label="Nome completo">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="João Silva" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="joao@empresa.com" />
        </Field>
        <Field label="Perfil">
          <Select value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="viewer">Visualizador — somente leitura</option>
            <option value="operator">Operador — pode editar dispositivos</option>
            <option value="admin">Administrador — acesso total</option>
          </Select>
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select value={form.active} onChange={(e) => set("active", e.target.value)}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </Select>
          </Field>
        )}
        <Field label={isEdit ? "Nova senha (deixe em branco para não alterar)" : "Senha"}>
          <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
        </Field>
        <div className="flex gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn onClick={handleSubmit} disabled={loading} className="flex-1">
            {loading ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar usuário"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL: RESET SENHA ───────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (pw.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo de 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Senha redefinida com sucesso" });
      onClose();
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Redefinir senha — ${user.user}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Digite a nova senha para <strong className="text-foreground">{user.name}</strong>.</p>
        <Field label="Nova senha">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoFocus />
        </Field>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn variant="success" onClick={handleReset} disabled={loading} className="flex-1">
            {loading ? "Redefinindo…" : "Redefinir senha"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL: DETALHES DO AUDIT LOG ─────────────────────────────────────────────

function AuditDetailModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  let parsed: unknown = null;
  try { parsed = entry.details ? JSON.parse(entry.details) : null; } catch {}

  return (
    <Modal title="Detalhes do evento" onClose={onClose}>
      <div className="space-y-3 text-sm">
        {[
          ["ID",        String(entry.id)],
          ["Data/hora", formatDate(entry.created_at)],
          ["Ator",      entry.actor_user],
          ["Ação",      ACTION_MAP[entry.action]?.label ?? entry.action],
          ["Alvo",      entry.target_label ?? "—"],
          ["IP",        entry.ip],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="text-muted-foreground w-24 shrink-0">{k}</span>
            <span className="text-foreground break-all">{v}</span>
          </div>
        ))}
        {parsed && (
          <div className="mt-2">
            <p className="text-muted-foreground mb-1">Alterações</p>
            <pre className="bg-muted/50 border border-border rounded-lg p-3 text-xs text-foreground/80 overflow-auto max-h-40">
              {JSON.stringify(parsed, null, 2)}
            </pre>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-1">User-Agent</p>
          <p className="text-xs text-muted-foreground/70 break-all">{entry.user_agent}</p>
        </div>
      </div>
    </Modal>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function AdminUsers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<"users" | "audit">("users");

  // users
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [modalUser, setModalUser] = useState<User | null | "new">(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  // audit log
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  const AUDIT_LIMIT = 50;

  // ── VERIFICAR ADMIN ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.role !== "admin") {
        toast({ title: "Acesso negado", description: "Apenas administradores", variant: "destructive" });
        navigate("/");
      }
    } catch {
      navigate("/login");
    }
  }, [navigate, toast]);

  // ── CARREGAR USUÁRIOS ────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${API_BASE}/auth/admin/users`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Erro ao carregar usuários");
      setUsers(await res.json());
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── CARREGAR AUDIT LOG ───────────────────────────────────────────────────────
  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams({
        limit: String(AUDIT_LIMIT),
        offset: String(auditPage * AUDIT_LIMIT),
      });
      if (filterAction) params.set("action", filterAction);
      if (filterActor)  params.set("actor", filterActor);

      const [logRes, actRes] = await Promise.all([
        fetch(`${API_BASE}/auth/admin/audit-log?${params}`, { headers: authHeaders() }),
        auditActions.length === 0
          ? fetch(`${API_BASE}/auth/admin/audit-log/actions`, { headers: authHeaders() })
          : Promise.resolve(null),
      ]);

      const logData = await logRes.json();
      setAudit(logData.entries ?? []);
      setAuditTotal(logData.total ?? 0);

      if (actRes) {
        const actData = await actRes.json();
        setAuditActions(actData);
      }
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingAudit(false);
    }
  }, [auditPage, filterAction, filterActor, auditActions.length, toast]);

  useEffect(() => {
    if (tab === "audit") fetchAudit();
  }, [tab, fetchAudit]);

  // ── DELETAR USUÁRIO ──────────────────────────────────────────────────────────
  const handleDelete = async (user: User) => {
    try {
      const res = await fetch(`${API_BASE}/auth/admin/users/${user.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Usuário removido" });
      fetchUsers();
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
    setConfirmDelete(null);
  };

  // ── TOGGLE ATIVO ─────────────────────────────────────────────────────────────
  const handleToggle = async (user: User) => {
    try {
      const res = await fetch(`${API_BASE}/auth/admin/users/${user.id}/toggle`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: data.active ? "Usuário ativado" : "Usuário desativado" });
      fetchUsers();
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const totalPages = Math.ceil(auditTotal / AUDIT_LIMIT);

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* MODAIS */}
      {modalUser === "new" && (
        <UserFormModal user={null} onClose={() => setModalUser(null)} onSaved={fetchUsers} />
      )}
      {modalUser && modalUser !== "new" && (
        <UserFormModal user={modalUser as User} onClose={() => setModalUser(null)} onSaved={fetchUsers} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
      {confirmDelete && (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja <span className="text-destructive font-semibold">deletar permanentemente</span> o usuário{" "}
              <strong className="text-foreground">{confirmDelete.name}</strong> ({confirmDelete.user})?
            </p>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => setConfirmDelete(null)} className="flex-1">Cancelar</Btn>
              <Btn variant="danger" onClick={() => handleDelete(confirmDelete)} className="flex-1">Deletar</Btn>
            </div>
          </div>
        </Modal>
      )}
      {detailEntry && (
        <AuditDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
      )}

      {/* HEADER */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
            ← Voltar
          </button>
          <span className="text-border">|</span>
          <h1 className="text-foreground font-semibold text-lg">Gestão de Usuários</h1>
        </div>
        <Btn onClick={() => setModalUser("new")}>+ Novo usuário</Btn>
      </div>

      {/* TABS */}
      <div className="flex border-b border-border px-6">
        {(["users", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users" ? `Usuários (${users.length})` : `Audit Log (${auditTotal})`}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* ─── USUÁRIOS ─────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["ID", "Usuário", "Nome", "Email", "Perfil", "Status", "Criado em", "Último login", "Ações"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr
                        key={u.id}
                        className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${!u.active ? "opacity-50" : ""}`}
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{u.id}</td>
                        <td className="px-4 py-3 font-mono text-primary">{u.user}</td>
                        <td className="px-4 py-3 text-foreground">{u.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3">{roleBadge(u.role)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.active ? "text-emerald-500" : "text-muted-foreground"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                            {u.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">{formatDate(u.last_login)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setModalUser(u)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar"
                            >✎</button>
                            <button
                              onClick={() => setResetUser(u)}
                              className="p-1.5 rounded hover:bg-purple-500/20 text-muted-foreground hover:text-purple-500 transition-colors"
                              title="Redefinir senha"
                            >🔑</button>
                            <button
                              onClick={() => handleToggle(u)}
                              className={`p-1.5 rounded transition-colors ${u.active
                                ? "hover:bg-orange-500/20 text-muted-foreground hover:text-orange-500"
                                : "hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-500"}`}
                              title={u.active ? "Desativar" : "Ativar"}
                            >{u.active ? "⊘" : "✓"}</button>
                            <button
                              onClick={() => setConfirmDelete(u)}
                              className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                              title="Deletar"
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">Nenhum usuário cadastrado</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── AUDIT LOG ────────────────────────────────────────────────────── */}
        {tab === "audit" && (
          <div className="space-y-4">
            {/* FILTROS */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Ação</span>
                <select
                  value={filterAction}
                  onChange={(e) => { setFilterAction(e.target.value); setAuditPage(0); }}
                  className="bg-transparent text-sm text-foreground focus:outline-none"
                >
                  <option value="">Todas</option>
                  {auditActions.map((a) => (
                    <option key={a} value={a}>{ACTION_MAP[a]?.label ?? a}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Usuário</span>
                <input
                  value={filterActor}
                  onChange={(e) => { setFilterActor(e.target.value); setAuditPage(0); }}
                  placeholder="buscar…"
                  className="bg-transparent text-sm text-foreground focus:outline-none w-28 placeholder-muted-foreground/50"
                />
              </div>
              <Btn variant="ghost" onClick={() => { setFilterAction(""); setFilterActor(""); setAuditPage(0); }}>
                Limpar filtros
              </Btn>
              <button
                onClick={fetchAudit}
                disabled={loadingAudit}
                className="ml-auto p-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                title="Atualizar"
              >
                ↺
              </button>
            </div>

            {/* TABELA */}
            {loadingAudit ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["#", "Data/hora", "Ator", "Ação", "Alvo", "IP", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e) => {
                      const meta = ACTION_MAP[e.action];
                      return (
                        <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground/60 tabular-nums text-xs">{e.id}</td>
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                            {formatDate(e.created_at)}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-primary text-xs">{e.actor_user}</td>
                          <td className="px-4 py-2.5">
                            <span className={`font-medium text-xs ${meta?.color ?? "text-muted-foreground"}`}>
                              <span className="mr-1.5">{meta?.icon ?? "·"}</span>
                              {meta?.label ?? e.action}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">
                            {e.target_label ?? e.target_id ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground/60 text-xs font-mono">{e.ip}</td>
                          <td className="px-4 py-2.5">
                            {e.details && (
                              <button
                                onClick={() => setDetailEntry(e)}
                                className="text-xs text-primary hover:text-primary/80 transition-colors"
                              >
                                detalhes
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {audit.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">Nenhum registro encontrado</div>
                )}
              </div>
            )}

            {/* PAGINAÇÃO */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {auditPage * AUDIT_LIMIT + 1}–{Math.min((auditPage + 1) * AUDIT_LIMIT, auditTotal)} de {auditTotal} registros
                </span>
                <div className="flex gap-2">
                  <Btn variant="ghost" disabled={auditPage === 0} onClick={() => setAuditPage((p) => p - 1)}>
                    ← Anterior
                  </Btn>
                  <span className="px-3 py-2 text-sm text-muted-foreground">
                    {auditPage + 1} / {totalPages}
                  </span>
                  <Btn variant="ghost" disabled={auditPage >= totalPages - 1} onClick={() => setAuditPage((p) => p + 1)}>
                    Próxima →
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}