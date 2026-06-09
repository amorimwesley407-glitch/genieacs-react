const axios = require("axios");

const IXC_BASE_URL = process.env.IXC_BASE_URL;
const IXC_TOKEN = process.env.IXC_TOKEN;

function getIxcAuthHeader() {
  if (!IXC_TOKEN) return null;
  if (/^Basic\s+/i.test(IXC_TOKEN)) return IXC_TOKEN;
  return `Basic ${Buffer.from(IXC_TOKEN).toString("base64")}`;
}

function createIxcApi() {
  if (!IXC_BASE_URL || !IXC_TOKEN) return null;

  return axios.create({
    baseURL: IXC_BASE_URL.replace(/\/+$/, ""),
    timeout: 30000,
    headers: {
      Authorization: getIxcAuthHeader(),
      "Content-Type": "application/json",
      ixcsoft: "listar",
    },
  });
}

function normalizeIxcRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.registros)) return data.registros;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function pickFirst(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function cleanMac(value) {
  return String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function formatColonMac(value) {
  const clean = cleanMac(value);
  if (clean.length !== 12) return String(value || "").trim();
  return clean.match(/.{1,2}/g).join(":");
}

function looksLikeMac(value) {
  const clean = cleanMac(value);
  return clean.length === 12 || clean.length === 16;
}

function looksLikeIp(value) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || "").trim());
}

function normalizePppoeUser(record) {
  return {
    id: pickFirst(record, ["id", "id_radusuarios"]),
    customerId: pickFirst(record, ["id_cliente", "cliente_id"]),
    username: pickFirst(record, ["login", "usuario", "username"]),
    password: pickFirst(record, ["senha", "password", "senha_radius"]),
    planId: pickFirst(record, ["id_plano", "id_plano_velocidade", "plano"]),
    vlan: pickFirst(record, ["vlan", "id_vlan", "vlan_id"]),
    mac: pickFirst(record, ["mac"]),
    onuMac: pickFirst(record, ["onu_mac"]),
    status: pickFirst(record, ["ativo", "status", "online"]),
    raw: record,
  };
}

function isPresetLogin(value) {
  return String(value || "").trim().toLowerCase() === "preset@preset";
}

async function listRadUsers(api, body) {
  const { data } = await api.post("/radusuarios", body);
  return normalizeIxcRows(data)
    .map(normalizePppoeUser)
    .filter((user) => !isPresetLogin(user.username));
}

function uniqueByIdOrLogin(users) {
  const seen = new Set();
  return users.filter((user) => {
    const key = user.id || user.username;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchPppoeUsers(search, limit = 10, type = "auto") {
  const api = createIxcApi();
  if (!api) {
    const err = new Error("IXC_BASE_URL e IXC_TOKEN precisam estar configurados no .env");
    err.status = 503;
    throw err;
  }

  const query = String(search || "").trim();
  if (!query) {
    const err = new Error("Informe um login PPPoE, MAC ou IP para consultar no IXC");
    err.status = 400;
    throw err;
  }

  const rp = String(Math.min(Math.max(Number(limit) || 10, 1), 50));
  const baseBody = {
    oper: "L",
    page: "1",
    rp,
    sortname: "radusuarios.login",
    sortorder: "asc",
  };

  if (type === "mac" || (type === "auto" && looksLikeMac(query))) {
    const clean = cleanMac(query);
    const candidates = [];

    if (clean.length === 12) {
      candidates.push(
        { qtype: "radusuarios.mac", query: formatColonMac(clean) },
        { qtype: "radusuarios.onu_mac", query: clean }
      );
    } else {
      candidates.push({ qtype: "radusuarios.onu_mac", query: clean });
    }

    const results = [];
    for (const candidate of candidates) {
      const users = await listRadUsers(api, { ...baseBody, ...candidate });
      results.push(...users);
    }
    return uniqueByIdOrLogin(results).slice(0, Number(rp));
  }

  if (type === "ip" || (type === "auto" && looksLikeIp(query))) {
    const results = [];
    const candidates = [
      { qtype: "radusuarios.ip", query },
      { qtype: "radusuarios.ip_aviso", query },
    ];

    for (const candidate of candidates) {
      const users = await listRadUsers(api, { ...baseBody, ...candidate });
      results.push(...users);
    }
    return uniqueByIdOrLogin(results).slice(0, Number(rp));
  }

  return listRadUsers(api, {
    ...baseBody,
    qtype: "radusuarios.login",
    query,
  });
}

async function searchPppoeByDevice({ mac, ip, limit = 10 }) {
  const rp = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const results = [];

  if (looksLikeMac(mac)) {
    results.push(...await searchPppoeUsers(mac, rp, "mac"));
  }

  if (looksLikeIp(ip)) {
    results.push(...await searchPppoeUsers(ip, rp, "ip"));
  }

  return uniqueByIdOrLogin(results).slice(0, rp);
}

module.exports = {
  searchPppoeUsers,
  searchPppoeByDevice,
};
