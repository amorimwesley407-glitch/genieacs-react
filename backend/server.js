// ⚠️ dotenv DEVE ser o primeiro require — antes de qualquer outro módulo
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const authRoutes  = require("./cadastrousers");
const adminRoutes = require("./admin-users");
const { searchPppoeUsers, searchPppoeByDevice } = require("./ixcClient");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/auth", adminRoutes);

/* ================= AUTH MIDDLEWARE ================= */

const jwt = require("jsonwebtoken");
const db = require("./db");
const JWT_SECRET = process.env.JWT_SECRET || "segredo_super_secreto_desenvolvimento";

// Verifica token JWT e injeta req.user
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

// Bloqueia perfis sem permissão de escrita (viewer)
function requireOperator(req, res, next) {
  const role = req.user?.role;
  if (role !== "admin" && role !== "operator") {
    return res.status(403).json({ error: "Sem permissão para realizar esta ação. Perfil: " + (role || "desconhecido") });
  }
  next();
}

// Registra ação no audit_log
function auditDevice(actor, action, deviceId, details, req) {
  const ip = req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "-";
  const ua = req?.headers?.["user-agent"] || "-";
  db.run(
    `INSERT INTO audit_log (actor_id, actor_user, action, target_type, target_id, target_label, details, ip, user_agent)
     VALUES (?, ?, ?, 'device', ?, ?, ?, ?, ?)`,
    [
      actor?.id || null,
      actor?.user || "?",
      action,
      deviceId,
      deviceId,
      details ? JSON.stringify(details) : null,
      ip,
      ua,
    ],
    (err) => { if (err) console.error("Audit log error:", err.message); }
  );
}

/* ================= CONFIG GENIEACS ================= */

const REQUIRED_ENV = ["GENIEACS_URL", "GENIEACS_USER", "GENIEACS_PASS", "PORT"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`ERRO: Variável ${key} não está definida no arquivo .env`);
    process.exit(1);
  }
}

const GENIEACS_URL = process.env.GENIEACS_URL;
const GENIEACS_USER = process.env.GENIEACS_USER;
const GENIEACS_PASS = process.env.GENIEACS_PASS;
const PORT = Number(process.env.PORT);

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const GENIEACS_MAX_DEVICES = Number(process.env.GENIEACS_MAX_DEVICES || 100000);

const api = axios.create({
  baseURL: GENIEACS_URL,
  auth: { username: GENIEACS_USER, password: GENIEACS_PASS },
  timeout: 30000,
});

/* ================= HELPERS ================= */

function collectValues(obj, key) {
  const values = [];
  function walk(o) {
    if (!o || typeof o !== "object") return;
    for (const k in o) {
      if (k === key && o[k]?._value !== undefined) {
        values.push(o[k]._value);
      } else {
        walk(o[k]);
      }
    }
  }
  walk(obj);
  return [...new Set(values)];
}

function getFirst(obj, key) {
  const v = collectValues(obj, key);
  return v.length ? v[0] : "-";
}

function formatDateBR(timestamp) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function getUptimeSeconds(d) {
  return (
    d?.InternetGatewayDevice?.DeviceInfo?.UpTime?._value ??
    d?.Device?.DeviceInfo?.UpTime?._value ??
    null
  );
}

const isOnline = (lastInform) => {
  if (!lastInform) return false;
  return new Date(lastInform).getTime() > Date.now() - ONLINE_THRESHOLD_MS;
};

/**
 * Retorna os hosts conectados como array estruturado.
 * Substitui a explosão de 90 campos separados (hostname1..30, lanmac1..30, iphost1..30).
 */
function extractConnectedHosts(d, maxHosts = 30) {
  const hosts = [];
  const lanHosts =
    d?.InternetGatewayDevice?.LANDevice?.["1"]?.Hosts?.Host;
  if (!lanHosts) return hosts;

  for (let i = 1; i <= maxHosts; i++) {
    const host = lanHosts[String(i)];
    if (!host) continue;
    const hostname = host.HostName?._value;
    const mac = host.MACAddress?._value;
    const ip = host.IPAddress?._value;
    if (hostname || mac || ip) {
      hosts.push({
        index: i,
        hostname: hostname || "-",
        mac: mac || "-",
        ip: ip || "-",
      });
    }
  }
  return hosts;
}

/**
 * Resolve o MAC WAN de forma genérica,
 * evitando a cadeia de 25+ optional-chains duplicadas.
 */
function extractWanMac(d) {
  const wanDevice =
    d?.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice;
  if (!wanDevice) return "-";

  for (const wan of Object.values(wanDevice)) {

    if (wan?.WANPPPConnection) {
      for (const conn of Object.values(wan.WANPPPConnection)) {
        const mac = conn?.MACAddress?._value;
        if (mac) return mac;
      }
    }

    if (wan?.WANIPConnection) {
      for (const conn of Object.values(wan.WANIPConnection)) {
        const mac = conn?.MACAddress?._value;
        if (mac) return mac;
      }
    }
  }

  return "-";
}

/**
 * Monta a query de busca para o GenieACS.
 * Separado da rota para facilitar manutenção e testes.
 */
function buildSearchQuery(search) {
  const regex = { $regex: search.trim(), $options: "i" };
  const wanPppUsernameQueries = [];
  const wanConnectionIndices = [1, 2, 3, 4, 5, 11, 13, 24, 45];

  for (const wanConnection of wanConnectionIndices) {
    for (const pppConnection of [1, 2, 3]) {
      wanPppUsernameQueries.push({
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wanConnection}.WANPPPConnection.${pppConnection}.Username`]:
          regex,
      });
    }
  }
  wanPppUsernameQueries.push({
    "InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.Username":
      regex,
  });

  return {
    $or: [
      { _id: regex },
      { "_deviceId._Manufacturer": regex },
      { "_deviceId._SerialNumber": regex },
      { "_deviceId._OUI": regex },
      { "_deviceId._ProductClass": regex },
      { "InternetGatewayDevice.DeviceInfo.HardwareVersion": regex },
      ...wanPppUsernameQueries,
      {
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": regex,
      },
      {
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID": regex,
      },
      {
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID": regex,
      },
      {
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress":
          regex,
      },
      {
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPAddress":
          regex,
      },
    ],
  };
}

/* ================= ROOT ================= */

/* ================= WIFI / WAN HELPERS ================= */

/**
 * Busca um campo em um WLANConfiguration tentando múltiplos índices.
 * indices: array de strings, ex: ["1"] para 2.4GHz, ["2","3"] para 5GHz
 */
function extractWlanField(d, indices, field) {
  const wlanBase = d?.InternetGatewayDevice?.LANDevice?.["1"]?.WLANConfiguration;
  if (!wlanBase) return null;
  for (const idx of indices) {
    const val = wlanBase?.[idx]?.[field]?._value;
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return null;
}

/**
 * Extrai sinal Wi-Fi (RSSI) tentando múltiplos nomes de campo em ordem de preferência.
 * Cobre TP-Link (X_TP_SignalStrength), padrão TR-069 (SignalStrength),
 * e outros fabricantes (RSSI, X_RSSI, X_TP_RSSI).
 *
 * BUG CORRIGIDO: TransmitPower removido — é potência de saída (+dBm), nunca RSSI do cliente.
 * RSSI é sempre negativo; valores >= 0 ou < -120 são descartados.
 */
function extractWlanSignal(d, indices) {
  const SIGNAL_FIELDS = [
    "X_TP_SignalStrength",  // TP-Link (maioria dos modelos)
    "SignalStrength",        // TR-069 padrão
    "RSSI",                  // Alguns firmwares
    "X_RSSI",                // Variante com prefixo
    "X_TP_RSSI",             // TP-Link alternativo
  ];
  for (const field of SIGNAL_FIELDS) {
    const val = extractWlanField(d, indices, field);
    if (val === null || val === undefined) continue;
    const num = Number(val);
    if (isNaN(num)) continue;
    // RSSI válido é sempre negativo e dentro de um range realista
    if (num >= 0 || num < -120) continue;
    return num;
  }
  return null;
}

/**
 * Busca um campo dentro de Stats de WLANConfiguration.
 */
function extractWlanStats(d, indices, field) {
  const wlanBase = d?.InternetGatewayDevice?.LANDevice?.["1"]?.WLANConfiguration;
  if (!wlanBase) return null;
  for (const idx of indices) {
    const val = wlanBase?.[idx]?.Stats?.[field]?._value;
    if (val !== undefined && val !== null) return val;
    // Alguns firmwares colocam direto no nível da WLAN
    const val2 = wlanBase?.[idx]?.[field]?._value;
    if (val2 !== undefined && val2 !== null) return val2;
  }
  return null;
}

/**
 * Conta dispositivos associados (clientes wi-fi) por AssociatedDevice ou TotalAssociations.
 */
function countAssociatedDevices(d, indices) {
  const wlanBase = d?.InternetGatewayDevice?.LANDevice?.["1"]?.WLANConfiguration;
  if (!wlanBase) return 0;
  for (const idx of indices) {
    const wlan = wlanBase?.[idx];
    if (!wlan) continue;
    // Primeiro tenta TotalAssociations
    const total = wlan?.TotalAssociations?._value;
    if (total !== undefined && total !== null) return Number(total);
    // Fallback: conta entradas em AssociatedDevice
    const assoc = wlan?.AssociatedDevice;
    if (assoc && typeof assoc === "object") {
      return Object.keys(assoc).filter(k => !isNaN(Number(k))).length;
    }
  }
  return 0;
}

/**
 * Extrai potência óptica GPON (RXPower / TXPower).
 * Paths tentados:
 *   - WANGponInterafceConfig.GponOpticalStats  (typo TP-Link legado)
 *   - WANGponInterfaceConfig.GponOpticalStats  (path correto)
 *   - X_TP_GponOptical (alguns firmwares mais novos)
 *
 * Escalonamento:
 *   TP-Link reporta em dBm * 100 como inteiro positivo.
 *   Ex: RXPower = 2750 → -27.50 dBm | TXPower = 275 → 2.75 dBm
 *   A regra "|valor| > 100 → escalonado" falha para valores entre 100~999 dBm
 *   que são obviamente impossíveis na física → qualquer |valor| > 50 é escalonado.
 */
function extractGponPower(d, field) {
  const wanDevices = d?.InternetGatewayDevice?.WANDevice;
  if (!wanDevices) return null;

  for (const wanDev of Object.values(wanDevices)) {
    if (typeof wanDev !== "object") continue;

    const gponStats =
      wanDev?.WANGponInterafceConfig?.GponOpticalStats ??
      wanDev?.WANGponInterfaceConfig?.GponOpticalStats ??
      wanDev?.X_TP_GponOptical;

    if (!gponStats) continue;

    const raw = gponStats?.[field]?._value;
    if (raw === undefined || raw === null) continue;
    const num = Number(raw);
    if (isNaN(num)) continue;

    // TP-Link reporta potência óptica como inteiro positivo em escala dBm*100 ou dBm*1000.
    // Exemplos reais observados:
    //   RXPower = 3780  → -37.80 dBm  (dBm*100, escala mais comum)
    //   TXPower = 5660  → 5.660  dBm  (se fosse dBm*100 seria 56.6 — fisicamente impossível)
    //               ↑ nesse caso o firmware usa dBm*1000: 5660/1000 = 5.66 dBm ✓
    //
    // Algoritmo: divide por 100. Se o resultado ainda estiver fora da faixa física,
    // divide por 10 novamente (totalizando /1000).
    // Faixas físicas GPON ITU-T G.984:
    //   RX: -8 a -35 dBm (nunca positivo, nunca menor que -50)
    //   TX: -1 a +7 dBm (nunca maior que +15)

    if (Math.abs(num) <= 50) {
      // Valor já está em dBm direto (raro, mas alguns firmwares fazem isso)
      const dbm = parseFloat(num.toFixed(2));
      if (field === "RXPower") return dbm > 0 ? -dbm : dbm;
      return dbm;
    }

    // Primeiro estágio: divide por 100
    let dbm = parseFloat((num / 100).toFixed(2));

    // Segundo estágio: se fisicamente impossível, divide por 10 novamente (/1000 total)
    // RX > 0 após /100 é impossível (tratado abaixo), mas TX > 15 é impossível
    if (field === "TXPower" && dbm > 15) {
      dbm = parseFloat((num / 1000).toFixed(3));
    }
    // RX nunca é positivo; se veio positivo após /100, nega
    if (field === "RXPower") {
      return dbm > 0 ? -dbm : dbm;
    }
    return dbm;
  }
  return null;
}

/**
 * Busca velocidade máxima upstream/downstream da WAN.
 */
function extractWanRate(d, field, altField) {
  const wanDevices = d?.InternetGatewayDevice?.WANDevice;
  if (!wanDevices) return null;

  // Tenta em TODOS os WANDevice (não só índice "1")
  for (const wanDev of Object.values(wanDevices)) {
    if (typeof wanDev !== "object") continue;
    const wanConnDev = wanDev?.WANConnectionDevice;
    if (wanConnDev) {
      for (const connDev of Object.values(wanConnDev)) {
        if (typeof connDev !== "object") continue;
        for (const ppp of Object.values(connDev?.WANPPPConnection || {})) {
          const v = ppp?.[field]?._value ?? ppp?.[altField]?._value;
          if (v !== undefined && v !== null && Number(v) > 0) return Number(v);
        }
        for (const ip of Object.values(connDev?.WANIPConnection || {})) {
          const v = ip?.[field]?._value ?? ip?.[altField]?._value;
          if (v !== undefined && v !== null && Number(v) > 0) return Number(v);
        }
      }
    }
    const common = wanDev?.WANCommonInterfaceConfig;
    const v = common?.[field]?._value ?? common?.[altField]?._value;
    if (v !== undefined && v !== null && Number(v) > 0) return Number(v);
  }
  return null;
}

/**
 * Busca TX/RX bytes na interface WAN.
 * Tenta múltiplos paths em TODOS os WANDevice, ignorando zeros e nulos.
 */
function extractWanStat(d, field) {
  const candidates = [];
  const wanDevices = d?.InternetGatewayDevice?.WANDevice;
  if (!wanDevices) return null;

  for (const wanDev of Object.values(wanDevices)) {
    if (typeof wanDev !== "object") continue;

    // 1) WANConnectionDevice → PPPoE / IP
    const wanConnDev = wanDev?.WANConnectionDevice;
    if (wanConnDev) {
      for (const connDev of Object.values(wanConnDev)) {
        if (typeof connDev !== "object") continue;
        for (const ppp of Object.values(connDev?.WANPPPConnection || {})) {
          const v = ppp?.[field]?._value ?? ppp?.Stats?.[field]?._value;
          if (v !== undefined && v !== null) candidates.push(Number(v));
        }
        for (const ip of Object.values(connDev?.WANIPConnection || {})) {
          const v = ip?.[field]?._value ?? ip?.Stats?.[field]?._value;
          if (v !== undefined && v !== null) candidates.push(Number(v));
        }
      }
    }

    // 2) WANCommonInterfaceConfig
    const common = wanDev?.WANCommonInterfaceConfig;
    if (common?.[field]?._value !== undefined) candidates.push(Number(common[field]._value));

    // 3) WANEthernetInterfaceConfig.Stats e direto (TP-Link alguns modelos)
    const eth = wanDev?.WANEthernetInterfaceConfig;
    if (eth?.Stats?.[field]?._value !== undefined) candidates.push(Number(eth.Stats[field]._value));
    if (eth?.[field]?._value !== undefined) candidates.push(Number(eth[field]._value));

    // 4) WANDSLInterfaceConfig — modelos ADSL/VDSL (XC220-G3)
    const dsl = wanDev?.WANDSLInterfaceConfig;
    if (dsl?.Stats?.Showtime?.[field]?._value !== undefined)
      candidates.push(Number(dsl.Stats.Showtime[field]._value));
    if (dsl?.Stats?.Total?.[field]?._value !== undefined)
      candidates.push(Number(dsl.Stats.Total[field]._value));
  }

  const nonZero = candidates.filter(v => !isNaN(v) && v > 0);
  if (nonZero.length > 0) return Math.max(...nonZero);
  if (candidates.length > 0) return null;
  return null;
}

app.get("/", requireAuth, (_req, res) => {
  res.send("API GenieACS rodando corretamente!");
});

/* ================= IXC ================= */

app.get("/api/ixc/pppoe", requireAuth, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const mac = String(req.query.mac || "").trim();
    const ip = String(req.query.ip || "").trim();
    const limit = Number(req.query.limit || 10);
    const type = String(req.query.type || "auto");
    const users = search
      ? await searchPppoeUsers(search, limit, type)
      : await searchPppoeByDevice({ mac, ip, limit });

    res.json({
      total: users.length,
      users,
    });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    res.status(status).json({
      error: err.message || "Erro ao consultar PPPoE no IXC",
      details: err.response?.data || undefined,
    });
  }
});

/* ================= SUMMARY PARA GRÁFICOS (todos os devices, sem paginação) ================= */

app.get("/api/devices/summary", requireAuth, async (req, res) => {
  try {
    // Projeção mínima: só os campos necessários para os gráficos do dashboard
    const projection = [
      "_id", "_lastInform",
      "_deviceId._Manufacturer",
      "_deviceId._ProductClass",
      "InternetGatewayDevice.DeviceInfo.UpTime",
      "InternetGatewayDevice.DeviceInfo.HardwareVersion",
      "Device.DeviceInfo.HardwareVersion",
      "InternetGatewayDevice.WANDevice",
      "InternetGatewayDevice.X_HW_VLAN",
    ].join(",");

    const summaryLimit = process.env.GENIEACS_SUMMARY_LIMIT
      ? `&limit=${Number(process.env.GENIEACS_SUMMARY_LIMIT)}`
      : "";
    const { data } = await api.get(`/devices?projection=${encodeURIComponent(projection)}${summaryLimit}`);

    const summary = data.map((d) => {
      const online = isOnline(d._lastInform);
      const uptime = getUptimeSeconds(d);

      // VLAN — tenta múltiplos paths (reutiliza a mesma lógica do getFirst)
      const vlan =
        getFirst(d, "VLANIDMark") !== "-" ? getFirst(d, "VLANIDMark") :
        getFirst(d, "X_HW_VLAN")  !== "-" ? getFirst(d, "X_HW_VLAN") :
        "-";

      return {
        manufacturer: d._deviceId?._Manufacturer || "-",
        hardversion: getFirst(d, "HardwareVersion") || "-",
        online,
        uptime: typeof uptime === "number" ? uptime : null,
        vlan,
      };
    });

    res.json({ total: summary.length, devices: summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= LISTAR DEVICES ================= */

app.get("/api/devices", async (req, res) => {
  try {
    let { page = 1, limit = 50, search = "", status = "all" } = req.query;

    page = Math.max(1, parseInt(page));
    limit = Math.min(100, Math.max(10, parseInt(limit)));
    const skip = (page - 1) * limit;

    /* 1. Stats globais */
    const { data: globalSummary } = await api.get(
      `/devices?projection=_id,_lastInform&limit=${GENIEACS_MAX_DEVICES}`
    );

    const stats = globalSummary.reduce(
      (acc, d) => {
        acc.total++;
        isOnline(d._lastInform) ? acc.online++ : acc.offline++;
        return acc;
      },
      { total: 0, online: 0, offline: 0 }
    );

    /* 2. Query de busca + filtro de fabricante */
    // BUG CORRIGIDO: manufacturer era recebido no req.query mas nunca aplicado na query ao GenieACS,
    // por isso clicar no gráfico de fabricante sempre retornava todos os dispositivos.
    const { manufacturer = "all" } = req.query;
    let queryObj = search.trim() ? buildSearchQuery(search) : {};

    if (manufacturer && manufacturer !== "all") {
      const mfrFilter = {
        "_deviceId._Manufacturer": {
          $regex: `^${manufacturer.trim()}$`,
          $options: "i",
        },
      };
      queryObj =
        Object.keys(queryObj).length > 0
          ? { $and: [queryObj, mfrFilter] }
          : mfrFilter;
    }

    // Filtro por versão de hardware (gráfico de Hardversion)
    const { hardversion = "" } = req.query;
    if (hardversion && hardversion !== "-") {
      const hvFilter = {
        "InternetGatewayDevice.DeviceInfo.HardwareVersion": {
          $regex: `^${hardversion.trim()}$`,
          $options: "i",
        },
      };
      queryObj =
        Object.keys(queryObj).length > 0
          ? { $and: [queryObj, hvFilter] }
          : hvFilter;
    }

    const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
    const { vlan = "" } = req.query;

    /* 3. Resumo filtrado — inclui uptime para filtrar por bucket */
    const filteredSummaryProjection = [
      "_id",
      "_lastInform",
      "InternetGatewayDevice.DeviceInfo.UpTime",
      "Device.DeviceInfo.UpTime",
      ...(vlan ? ["InternetGatewayDevice.WANDevice"] : []),
      "InternetGatewayDevice.X_HW_VLAN",
    ].join(",");

    const summaryUrl = `/devices?projection=${encodeURIComponent(filteredSummaryProjection)}&limit=${GENIEACS_MAX_DEVICES}${
      Object.keys(queryObj).length > 0 ? "&query=" + encodedQuery : ""
    }`;
    const { data: summaryData } = await api.get(summaryUrl);

    let filtered = summaryData.map((d) => ({
      _id: d._id,
      online: isOnline(d._lastInform),
      uptime: getUptimeSeconds(d),
      vlan:
        getFirst(d, "VLANIDMark") !== "-" ? getFirst(d, "VLANIDMark") :
        getFirst(d, "X_HW_VLAN")  !== "-" ? getFirst(d, "X_HW_VLAN") :
        "-",
    }));

    if (status === "online") filtered = filtered.filter((d) => d.online);
    if (status === "offline") filtered = filtered.filter((d) => !d.online);

    // Filtro por bucket de uptime (enviado pelo frontend via ?uptime=)
    const { uptime: uptimeBucket = "" } = req.query;
    if (uptimeBucket) {
      filtered = filtered.filter((d) => {
        if (uptimeBucket === "Offline") return !d.online;
        if (!d.online) return false;
        const s = Number(d.uptime);
        if (!s || isNaN(s)) return false;
        if (uptimeBucket === "< 1h")   return s < 3600;
        if (uptimeBucket === "1–24h")  return s >= 3600 && s < 86400;
        if (uptimeBucket === "1–7d")   return s >= 86400 && s < 7 * 86400;
        if (uptimeBucket === "7–30d")  return s >= 7 * 86400 && s < 30 * 86400;
        if (uptimeBucket === "> 30d")  return s >= 30 * 86400;
        return true;
      });
    }

    if (vlan) {
      const targetVlan = vlan === "N/A" ? "-" : String(vlan);
      filtered = filtered.filter((d) => d.vlan === targetVlan);
    }

    filtered.sort((a, b) => a._id.localeCompare(b._id));
    const totalFiltered = filtered.length;
    const pageIds = filtered.slice(skip, skip + limit).map((d) => d._id);

    let devices = [];

    /* 4. Dados completos da página */
    if (pageIds.length > 0) {
      const pageQuery = encodeURIComponent(
        JSON.stringify({ _id: { $in: pageIds } })
      );
      const { data: devicesData } = await api.get(
        `/devices?query=${pageQuery}`
      );

      const map = new Map(devicesData.map((d) => [d._id, d]));

      devices = pageIds
        .map((id) => {
          const d = map.get(id);
          if (!d) return null;

          const uptime = getUptimeSeconds(d);
          const eventsInform =
            typeof uptime === "number" && uptime < 600 ? "BOOT" : "PERIODIC";

          return {
            id: d._id,
            serial: d._deviceId?._SerialNumber || d._id,
            manufacturer: d._deviceId?._Manufacturer || "-",
            produtoclass: d._deviceId?._ProductClass || "-",
            uptime: getFirst(d, "UpTime") || "-",
            events: eventsInform,
            lastInformDate: formatDateBR(d._lastInform),
            pppoe: getFirst(d, "Username"),
            ssid: collectValues(d, "SSID"),
            ssid2:
              d?.InternetGatewayDevice?.LANDevice?.["1"]
                ?.WLANConfiguration?.["1"]?.SSID?._value || "-",
            ssid5:
              d?.InternetGatewayDevice?.LANDevice?.["1"]
                ?.WLANConfiguration?.["2"]?.SSID?._value ||
              d?.InternetGatewayDevice?.LANDevice?.["1"]
                ?.WLANConfiguration?.["3"]?.SSID?._value ||
              "-",
            mac: extractWanMac(d),
            ip: getFirst(d, "ExternalIPAddress") || getFirst(d, "IPAddress"),
            ipv6: getFirst(d, "X_TP_ExternalIPv6Address"),
            passwordwifi: getFirst(d, "X_TP_PreSharedKey"),
            passwordwifi5g:
              d?.InternetGatewayDevice?.LANDevice?.["1"]
                ?.WLANConfiguration?.["2"]?.X_TP_PreSharedKey?._value || "-",
            passwordppoe: getFirst(d, "Password"),
            hardversion: getFirst(d, "HardwareVersion"),
            softversion: getFirst(d, "SoftwareVersion") || getFirst(d, "FirmwareVersion") || "-",
            connectedHosts: extractConnectedHosts(d),
            vlan:
              (getFirst(d, "VLANIDMark") !== "-" &&
                getFirst(d, "VLANIDMark")) ||
              (getFirst(d, "X_HW_VLAN") !== "-" && getFirst(d, "X_HW_VLAN")) ||
              "-",
            online: isOnline(d._lastInform),
            // GPON Optical Power (RXPower em dBm*100 ou dBm direto dependendo do firmware)
            gpon_rxpower: extractGponPower(d, "RXPower"),
            gpon_txpower: extractGponPower(d, "TXPower"),
            // Wi-Fi stats — helper que tenta múltiplos paths comuns (TP-Link, Huawei, ZTE, etc.)
            wifi24_channel: extractWlanField(d, ["1"], "Channel"),
            wifi24_signal: extractWlanSignal(d, ["1"]),
            wifi24_clients: countAssociatedDevices(d, ["1"]),
            wifi24_txbytes: extractWlanStats(d, ["1"], "BytesSent"),
            wifi24_rxbytes: extractWlanStats(d, ["1"], "BytesReceived"),
            // 5 GHz — TP-Link usa índice 2 ou 3
            wifi5_channel: extractWlanField(d, ["2","3"], "Channel"),
            wifi5_signal: extractWlanSignal(d, ["2","3"]),
            wifi5_clients: countAssociatedDevices(d, ["2","3"]),
            wifi5_txbytes: extractWlanStats(d, ["2","3"], "BytesSent"),
            wifi5_rxbytes: extractWlanStats(d, ["2","3"], "BytesReceived"),
            // WAN stats
            wan_txbytes: extractWanStat(d, "BytesSent"),
            wan_rxbytes: extractWanStat(d, "BytesReceived"),
            wan_txrate: extractWanRate(d, "UpstreamMaxBitRate", "X_TP_UpstreamMaxBitRate"),
            wan_rxrate: extractWanRate(d, "DownstreamMaxBitRate", "X_TP_DownstreamMaxBitRate"),
          };
        })
        .filter(Boolean);
    }

    res.json({
      devices,
      stats,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalFiltered / limit),
        hasMore: skip + devices.length < totalFiltered,
      },
    });
  } catch (error) {
    console.error("❌ Erro em /api/devices:", error.message);
    res.status(500).json({
      error: "Erro ao buscar dispositivos do GenieACS",
      details: error.message,
    });
  }
});

/* ================= EXPORTAR TODOS OS DEVICES ================= */

app.get("/api/devices/export/all", requireAuth, async (req, res) => {
  try {
    const { manufacturer = "", hardversion = "", vlan = "" } = req.query;

    let queryObj = {};
    if (manufacturer && manufacturer !== "all") {
      queryObj = {
        "_deviceId._Manufacturer": { $regex: `^${manufacturer.trim()}$`, $options: "i" },
      };
    }

    if (hardversion && hardversion !== "-") {
      const hvFilter = {
        "InternetGatewayDevice.DeviceInfo.HardwareVersion": { $regex: `^${hardversion.trim()}$`, $options: "i" },
      };
      queryObj = Object.keys(queryObj).length > 0
        ? { $and: [queryObj, hvFilter] }
        : hvFilter;
    }

    const encodedQuery = Object.keys(queryObj).length > 0
      ? `&query=${encodeURIComponent(JSON.stringify(queryObj))}`
      : "";

    const { data: devicesData } = await api.get(
      `/devices?limit=${GENIEACS_MAX_DEVICES}${encodedQuery}`
    );

    const devices = devicesData.map((d) => {
      const hosts = extractConnectedHosts(d);
      const vlanValue =
        (getFirst(d, "VLANIDMark") !== "-" && getFirst(d, "VLANIDMark")) ||
        (getFirst(d, "X_HW_VLAN") !== "-" && getFirst(d, "X_HW_VLAN")) ||
        "-";

      return {
        id: d._id,
        serialNumber: d._deviceId?._SerialNumber || d._id,
        manufacturer: d._deviceId?._Manufacturer || "-",
        produtoclass: d._deviceId?._ProductClass || "-",
        hardversion: getFirst(d, "HardwareVersion") || "-",
        softversion: getFirst(d, "SoftwareVersion") || getFirst(d, "FirmwareVersion") || "-",
        online: isOnline(d._lastInform),
        ip: getFirst(d, "ExternalIPAddress") || getFirst(d, "IPAddress") || "-",
        ipv6: getFirst(d, "X_TP_ExternalIPv6Address") || "-",
        macAddress: extractWanMac(d),
        vlan: vlanValue,
        uptime: getUptimeSeconds(d),
        lastInformDate: formatDateBR(d._lastInform),
        pppoe_user: getFirst(d, "Username") || "-",
        wifi24_ssid: d?.InternetGatewayDevice?.LANDevice?.["1"]?.WLANConfiguration?.["1"]?.SSID?._value || "-",
        wifi5_ssid: d?.InternetGatewayDevice?.LANDevice?.["1"]?.WLANConfiguration?.["2"]?.SSID?._value || "-",
        hosts_count: hosts.length,
        gpon_rxpower: extractGponPower(d, "RXPower"),
        gpon_txpower: extractGponPower(d, "TXPower"),
        wifi24_clients: countAssociatedDevices(d, ["1"]),
        wifi5_clients: countAssociatedDevices(d, ["2","3"]),
      };
    });

    res.json({ total: devices.length, devices });
  } catch (error) {
    console.error("❌ Erro em /api/devices/export/all:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ================= OFFLINE ÚLTIMAS 24H ================= */

app.get("/api/devices/offline-24h", requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    const onlineThreshold = now - ONLINE_THRESHOLD_MS;
    const limit24h = now - 24 * 60 * 60 * 1000;

    const { data } = await api.get(
      `/devices?projection=_id,_lastInform,_deviceId&limit=${GENIEACS_MAX_DEVICES}`
    );

    const offlineDevices = data
      .filter((d) => {
        if (!d._lastInform) return true;
        const last = new Date(d._lastInform).getTime();
        return last < onlineThreshold && last >= limit24h;
      })
      .map((d) => {
        const ts = d._lastInform ? new Date(d._lastInform).getTime() : 0;
        return {
          id: d._id,
          serialNumber: d._deviceId?._SerialNumber || d._id,
          lastInformDate: d._lastInform
            ? new Date(ts).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })
            : "Nunca informou",
          timestamp: ts,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log("🔴 OFFLINE 24H:", offlineDevices.length);
    res.json(offlineDevices);
  } catch (error) {
    console.error("❌ Erro em /api/devices/offline-24h:", error.message);
    res.status(500).json({ error: "Erro ao buscar dispositivos offline" });
  }
});

/* ================= REBOOT DEVICE ================= */

app.post("/api/devices/:id/reboot", requireAuth, requireOperator, async (req, res) => {
  const deviceId = req.params.id;

  try {
    await api.post(
      `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`,
      { name: "reboot" }
    );

    auditDevice(req.user, "DEVICE_REBOOT", deviceId, null, req);

    res.json({
      success: true,
      message: "Comando de reboot enviado com sucesso",
      deviceId,
    });
  } catch (error) {
    console.error(
      "❌ Erro ao enviar reboot:",
      error.response?.data || error.message
    );
    res.status(500).json({
      success: false,
      message: "Erro ao enviar comando de reboot",
      details: error.response?.data || error.message,
    });
  }
});

/* ================= CONFIGURAR WI-FI ================= */

app.post("/api/devices/:id/wifi", requireAuth, requireOperator, async (req, res) => {
  const { id } = req.params;
  let { ssid, password, ssid2, password2, ssid5, passwordwifi5g } = req.body;

  // Compatibilidade com chamada legada
  if (ssid && password && !ssid2 && !ssid5) {
    ssid2 = ssid;
    password2 = password;
    ssid5 = ssid;
    passwordwifi5g = password;
  }
  if (password && !password2) password2 = password;

  const has24 = !!(ssid2?.trim() && password2?.trim());
  const has5 = !!(ssid5?.trim() && passwordwifi5g?.trim());

  if (!has24 && !has5) {
    return res.status(400).json({
      error:
        "É necessário informar pelo menos uma banda com SSID e senha válidos",
    });
  }
  if (has24 && password2.length < 8) {
    return res
      .status(400)
      .json({ error: "A senha Wi-Fi 2.4 GHz deve ter no mínimo 8 caracteres" });
  }
  if (has5 && passwordwifi5g.length < 8) {
    return res
      .status(400)
      .json({ error: "A senha Wi-Fi 5 GHz deve ter no mínimo 8 caracteres" });
  }

  const parameterValues = [];
  if (has24) {
    parameterValues.push(
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
        ssid2.trim(),
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_TP_PreSharedKey",
        password2.trim(),
        "xsd:string",
      ]
    );
  }
  if (has5) {
    parameterValues.push(
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID",
        ssid5.trim(),
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.X_TP_PreSharedKey",
        passwordwifi5g.trim(),
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID",
        ssid5.trim(),
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.KeyPassphrase",
        passwordwifi5g.trim(),
        "xsd:string",
      ]
    );
  }

  try {
    // BUG CORRIGIDO: usava fetch nativo misturado com axios; padronizado para axios
    const response = await api.post(
      `/devices/${encodeURIComponent(id)}/tasks?connection_request`,
      { name: "setParameterValues", parameterValues }
    );

    auditDevice(req.user, "DEVICE_WIFI_CHANGE", id, {
      ssid2: ssid2 || null,
      ssid5: ssid5 || null,
    }, req);

    console.log(
      `Wi-Fi atualizado → Device: ${id} | Status: ${response.status}`
    );

    res.json({
      success: true,
      message:
        "Configuração Wi-Fi enviada com sucesso. Pode levar alguns minutos para aplicar.",
      genieacsStatus: response.status,
    });
  } catch (error) {
    console.error("❌ Erro ao configurar Wi-Fi:", error.message);
    res.status(error.response?.status || 500).json({
      error: "Falha ao enviar configuração Wi-Fi para o GenieACS",
      details: error.response?.data || error.message,
    });
  }
});

/* ================= CONFIGURAR PPPoE ================= */

app.post("/api/devices/:id/pppoe", requireAuth, requireOperator, async (req, res) => {
  const { id } = req.params;
  const { username, password } = req.body;

  if (!username?.trim() || !password?.trim()) {
    return res
      .status(400)
      .json({ error: "Usuário e senha são obrigatórios" });
  }

  const wanIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24];
  const parameterValues = wanIndices.flatMap((index) => {
    const base = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${index}.WANPPPConnection.1`;
    return [
      [`${base}.Username`, username.trim(), "xsd:string"],
      [`${base}.Password`, password.trim(), "xsd:string"],
    ];
  });

  try {
    console.log(`[PPPoE] Atualizando device ${id} com user: ${username}`);

    // BUG CORRIGIDO: usava fetch nativo misturado com axios; padronizado para axios
    const response = await api.post(
      `/devices/${encodeURIComponent(id)}/tasks?connection_request`,
      { name: "setParameterValues", parameterValues }
    );

    auditDevice(req.user, "DEVICE_PPPOE_CHANGE", id, { username: username.trim() }, req);

    console.log(`[PPPoE] Status GenieACS: ${response.status}`);

    res.json({
      success: true,
      message:
        "PPPoE configurado com sucesso. Pode levar alguns minutos para aplicar.",
      genieacsStatus: response.status,
    });
  } catch (error) {
    console.error("[PPPoE] Erro:", error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: "Falha ao comunicar com GenieACS",
      details: error.response?.data || error.message,
    });
  }
});

/* ================= DEBUG: inspeciona campos brutos de um device ================= */
app.get('/api/devices/:id/raw', requireAuth, async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const query = encodeURIComponent(JSON.stringify({ _id: id }));
    const { data } = await api.get(`/devices?query=${query}`);
    if (!data || data.length === 0) return res.status(404).json({ error: 'Device nao encontrado' });
    const d = data[0];

    // WLANConfiguration
    const wlanConf = d?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration || {};
    const wlanDiag = {};
    for (const [idx, wlan] of Object.entries(wlanConf)) {
      if (typeof wlan !== 'object') continue;
      wlanDiag[idx] = {};
      for (const [k, v] of Object.entries(wlan)) {
        if (v && typeof v === 'object' && '_value' in v) wlanDiag[idx][k] = v._value;
      }
      if (wlan.Stats && typeof wlan.Stats === 'object') {
        wlanDiag[idx]['_Stats'] = {};
        for (const [k, v] of Object.entries(wlan.Stats)) {
          if (v && typeof v === 'object' && '_value' in v) wlanDiag[idx]['_Stats'][k] = v._value;
        }
      }
      if (wlan.AssociatedDevice && typeof wlan.AssociatedDevice === 'object') {
        wlanDiag[idx]['_AssociatedDeviceKeys'] = Object.keys(wlan.AssociatedDevice);
      }
    }

    // WANDevice: Common + GPON + PPPConnection Stats
    const wanDevice = d?.InternetGatewayDevice?.WANDevice || {};
    const wanDiag = {};
    for (const [wi, wanD] of Object.entries(wanDevice)) {
      if (typeof wanD !== 'object') continue;
      wanDiag[wi] = {};

      // WANCommonInterfaceConfig
      for (const [k, v] of Object.entries(wanD?.WANCommonInterfaceConfig || {})) {
        if (v && typeof v === 'object' && '_value' in v) wanDiag[wi][k] = v._value;
      }

      // GPON — tenta os dois paths (com e sem typo)
      const gponStats =
        wanD?.WANGponInterafceConfig?.GponOpticalStats ??
        wanD?.WANGponInterfaceConfig?.GponOpticalStats ??
        wanD?.X_TP_GponOptical;
      if (gponStats) {
        wanDiag[wi]['_GponOpticalStats'] = {};
        for (const [k, v] of Object.entries(gponStats)) {
          if (v && typeof v === 'object' && '_value' in v) wanDiag[wi]['_GponOpticalStats'][k] = v._value;
        }
      }

      // WANConnectionDevice — PPPoE/IP stats
      const connDevs = wanD?.WANConnectionDevice || {};
      for (const [ci, connDev] of Object.entries(connDevs)) {
        if (typeof connDev !== 'object') continue;
        for (const [pi, ppp] of Object.entries(connDev?.WANPPPConnection || {})) {
          if (typeof ppp !== 'object') continue;
          const key = `WANConnectionDevice.${ci}.WANPPPConnection.${pi}`;
          wanDiag[wi][key] = {};
          for (const [k, v] of Object.entries(ppp)) {
            if (v && typeof v === 'object' && '_value' in v) wanDiag[wi][key][k] = v._value;
          }
          if (ppp.Stats) {
            wanDiag[wi][key]['_Stats'] = {};
            for (const [k, v] of Object.entries(ppp.Stats)) {
              if (v && typeof v === 'object' && '_value' in v) wanDiag[wi][key]['_Stats'][k] = v._value;
            }
          }
        }
      }
    }

    res.json({
      _id: d._id,
      _manufacturer: d._deviceId?._Manufacturer,
      _productClass: d._deviceId?._ProductClass,
      DeviceInfo: Object.fromEntries(
        Object.entries(d?.InternetGatewayDevice?.DeviceInfo || {})
          .filter(([, v]) => v?._value !== undefined)
          .map(([k, v]) => [k, v._value])
      ),
      WLANConfiguration: wlanDiag,
      WANDiag: wanDiag,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ================= HISTÓRICO DO DISPOSITIVO ================= */

/**
 * GET /api/devices/:id/history
 * Retorna eventos do dispositivo a partir do audit_log do SQLite.
 * Ordenado do mais recente para o mais antigo.
 */
app.get("/api/devices/:id/history", requireAuth, (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  db.all(
    `SELECT id, actor_user, action, target_type, target_id, target_label, details, ip, created_at
     FROM audit_log
     WHERE target_type = 'device' AND target_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [id, Number(limit)],
    (err, rows) => {
      if (err) {
        console.error("❌ Erro ao buscar histórico:", err.message);
        return res.status(500).json({ error: "Erro ao buscar histórico" });
      }
      res.json({ events: rows || [] });
    }
  );
});

app.get("/api/devices/:id/history/genieacs", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const query = encodeURIComponent(JSON.stringify({ _id: id }));
    const { data } = await api.get(`/devices?query=${query}&projection=tasks`);
    const tasks = data?.[0]?.tasks || {};
    const events = Object.entries(tasks)
      .map(([key, value]) => ({
        id: key,
        name: value.name || "desconhecido",
        status: value.status || value.result?.[0]?.[1] || "pendente",
        fault: value.fault || null,
        created: value.creationDate || null,
        completed: value.completedDate || null,
      }))
      .sort((a, b) => {
        const dateA = a.created ? new Date(a.created).getTime() : 0;
        const dateB = b.created ? new Date(b.created).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, Number(req.query.limit || 50));
    res.json({ events });
  } catch (err) {
    console.warn("Aviso ao buscar histórico GenieACS:", err.response?.status || err.message);
    res.json({ events: [] });
  }
});


/* ================= DIAGNÓSTICO REMOTO ================= */

const { execSync } = require("child_process");

/**
 * Helper: resolve o IP do device (fallback: GenieACS)
 */
async function resolveDeviceIp(deviceId, fallbackIp) {
  if (fallbackIp && fallbackIp !== "-" && fallbackIp !== "—") return fallbackIp;
  try {
    const q = encodeURIComponent(JSON.stringify({ _id: deviceId }));
    const { data } = await api.get(`/devices?query=${q}&projection=InternetGatewayDevice.DeviceInfo`);
    const wanIp = data?.[0]?.InternetGatewayDevice?.WANDevice?.['1']?.WANCommonInterfaceConfig?.WANIPConnection?.['1']?.ExternalIPAddress?._value;
    if (wanIp && wanIp !== "-") return wanIp;
  } catch {}
  const q2 = encodeURIComponent(JSON.stringify({ _id: deviceId }));
  const { data: d2 } = await api.get(`/devices?query=${q2}&projection=InternetGatewayDevice.WANDevice`);
  try {
    for (const wan of Object.values(d2?.[0]?.InternetGatewayDevice?.WANDevice || {})) {
      if (typeof wan !== 'object') continue;
      for (const conn of Object.values(wan?.WANConnectionDevice || {})) {
        if (typeof conn !== 'object') continue;
        for (const ppp of Object.values(conn?.WANPPPConnection || {})) {
          if (typeof ppp !== 'object') continue;
          const ip = ppp?.ExternalIPAddress?._value;
          if (ip && ip !== "-") return ip;
        }
        for (const ipc of Object.values(conn?.WANIPConnection || {})) {
          if (typeof ipc !== 'object') continue;
          const ip = ipc?.ExternalIPAddress?._value;
          if (ip && ip !== "-") return ip;
        }
      }
    }
  } catch {}
  return null;
}

/**
 * POST /api/devices/:id/diagnostics/ping
 * Body: { target?: string }
 */
app.post("/api/devices/:id/diagnostics/ping", requireAuth, async (req, res) => {
  const target = req.body?.target?.trim();
  const count = 4;
  try {
    const ip = target || await resolveDeviceIp(req.params.id, target);
    if (!ip) return res.status(400).json({ error: "IP do dispositivo não disponível. Informe um IP manualmente." });

    const isWin = process.platform === "win32";
    const cmd = isWin ? `ping -n ${count} ${ip}` : `ping -c ${count} -W 5 ${ip}`;

    const start = Date.now();
    const output = execSync(cmd, { timeout: 30000, encoding: "utf8" });
    const elapsed = Date.now() - start;
    const lines = output.split("\n").map(l => l.trim()).filter(Boolean);

    const times = [];
    const timeRegex = /(?:tempo|time|ttl)\s*=\s*(\d+)\s*ms/i;
    for (const line of lines) {
      const m = line.match(timeRegex);
      if (m) times.push(parseInt(m[1], 10));
    }
    // Fallback: words "Média", "Average", "min/médio/max"
    const avgLine = lines.find(l => /m[eê]dia|average|m[eé]dio/i.test(l));
    if (avgLine) {
      const nums = [...avgLine.matchAll(/\d+\s*ms/gi)].map(n => parseInt(n[0], 10));
      if (nums.length >= 3) { // min, max, avg
        if (times.length === 0) { times.push(nums[2]); }
      }
    }

    const lossRegex = /(\d+)%\s*(?:perdidos|perda|loss|lost)/i;
    const lossMatch = output.match(lossRegex);
    const loss = lossMatch ? parseInt(lossMatch[1], 10) : 0;
    const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

    try { auditDevice(req.user, "DEVICE_DIAGNOSTIC", req.params.id, { tool: "ping", target: ip, avg, loss }, req); } catch {}

    res.json({
      success: true, tool: "ping", target: ip,
      output: lines.slice(0, 20),
      stats: {
        sent: count,
        received: count - Math.round(count * loss / 100),
        loss, avg_ms: avg, time_ms: elapsed,
        min_ms: times.length ? Math.min(...times) : null,
        max_ms: times.length ? Math.max(...times) : null,
      },
    });
  } catch (err) {
    const msg = err.stderr || err.message || "Erro ao executar ping";
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/devices/:id/diagnostics/traceroute
 * Body: { target?: string }
 */
app.post("/api/devices/:id/diagnostics/traceroute", requireAuth, async (req, res) => {
  const target = req.body?.target?.trim();
  try {
    const ip = target || await resolveDeviceIp(req.params.id, target);
    if (!ip) return res.status(400).json({ error: "IP do dispositivo não disponível." });

    const isWin = process.platform === "win32";
    const cmd = isWin ? `tracert -h 15 ${ip}` : `traceroute -m 15 -n ${ip}`;

    const start = Date.now();
    const output = execSync(cmd, { timeout: 60000, encoding: "utf8" });
    const elapsed = Date.now() - start;
    const lines = output.split("\n").map(l => l.trim()).filter(Boolean);

    try { auditDevice(req.user, "DEVICE_DIAGNOSTIC", req.params.id, { tool: "traceroute", target: ip }, req); } catch {}

    res.json({
      success: true, tool: "traceroute", target: ip,
      output: lines.slice(0, 30),
      stats: { hops: lines.length - 1, time_ms: elapsed },
    });
  } catch (err) {
    const msg = err.stderr || err.message || "Erro no traceroute";
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/devices/:id/diagnostics/speedtest
 * Teste de qualidade de link (latência, jitter, perda)
 */
app.post("/api/devices/:id/diagnostics/speedtest", requireAuth, async (req, res) => {
  const target = req.body?.target?.trim();
  try {
    const ip = target || await resolveDeviceIp(req.params.id, target);
    if (!ip) return res.status(400).json({ error: "IP do dispositivo não disponível." });

    const isWin = process.platform === "win32";
    const pingCount = 10;
    const cmd = isWin ? `ping -n ${pingCount} ${ip}` : `ping -c ${pingCount} -W 3 ${ip}`;

    const start = Date.now();
    const output = execSync(cmd, { timeout: 40000, encoding: "utf8" });
    const elapsed = Date.now() - start;
    const lines = output.split("\n").map(l => l.trim()).filter(Boolean);

    const times = [];
    const timeRegex = /(?:tempo|time|ttl)\s*=\s*(\d+)\s*ms/i;
    for (const line of lines) {
      const m = line.match(timeRegex);
      if (m) times.push(parseInt(m[1], 10));
    }
    // Fallback: linha de média
    const avgLine = lines.find(l => /m[eê]dia|average|m[eé]dio/i.test(l));
    if (avgLine) {
      const nums = [...avgLine.matchAll(/\d+\s*ms/gi)].map(n => parseInt(n[0], 10));
      if (nums.length >= 3 && times.length === 0) { times.push(nums[2]); }
    }

    const lossRegex = /(\d+)%\s*(?:perdidos|perda|loss|lost)/i;
    const lossMatch = output.match(lossRegex);
    const loss = lossMatch ? parseInt(lossMatch[1], 10) : 0;
    const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
    const jitter = times.length > 1
      ? Math.round(times.slice(1).reduce((sum, t, i) => sum + Math.abs(t - times[i]), 0) / (times.length - 1))
      : null;

    let rating = "excelente";
    if (loss > 10 || avg > 300) rating = "ruim";
    else if (loss > 3 || avg > 150) rating = "regular";
    else if (loss > 0 || avg > 80) rating = "bom";

    try { auditDevice(req.user, "DEVICE_DIAGNOSTIC", req.params.id, { tool: "speedtest", target: ip, avg, jitter, loss, rating }, req); } catch {}

    res.json({
      success: true, tool: "speedtest", target: ip,
      stats: {
        latency_ms: avg, jitter_ms: jitter,
        loss_pct: loss, rating,
        samples: times.length, time_ms: elapsed,
      },
      output: lines.slice(0, 15),
    });
  } catch (err) {
    const msg = err.stderr || err.message || "Erro no teste de velocidade";
    res.status(500).json({ error: msg });
  }
});

/* ================= LOGOUT ================= */

app.post("/auth/logout", requireAuth, (req, res) => {
  try {
    const adminRouter = require("./admin-users");
    if (adminRouter.auditLogout) {
      adminRouter.auditLogout(req.user.id, req.user.user, req);
    }
  } catch {}
  res.json({ success: true, message: "Logout registrado com sucesso" });
});

/* ================= START SERVER ================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend GenieACS rodando na porta ${PORT}`);
  console.log(`   Conectado ao GenieACS → ${GENIEACS_URL}`);
  console.log(`   Usuário configurado    → ${GENIEACS_USER}`);
  console.log(`   Acesse: http://localhost:${PORT}`);
});
