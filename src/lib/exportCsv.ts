/**
 * Utilitário para exportar dados em formato CSV.
 * Funciona 100% no cliente (não precisa de servidor).
 */

/**
 * Converte um array de objetos para CSV e força o download.
 *
 * @param data - Array de objetos a serem exportados
 * @param filename - Nome do arquivo (sem extensão)
 * @param columns - Mapeamento opcional: { chave: "Nome da Coluna" }
 */
export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: Partial<Record<keyof T, string>>
) {
  if (!data.length) return;

  // Determina as colunas
  const keys = columns
    ? (Object.keys(columns) as (keyof T)[])
    : (Object.keys(data[0] as object) as (keyof T)[]);

  // Cabeçalho
  const header = keys
    .map((k) => {
      const label = columns?.[k] || String(k);
      return escapeCsvField(label);
    })
    .join(",");

  // Linhas
  const rows = data.map((item) =>
    keys
      .map((k) => {
        const val = item[k];
        if (val === null || val === undefined) return '""';
        if (typeof val === "object") return escapeCsvField(JSON.stringify(val));
        return escapeCsvField(String(val));
      })
      .join(",")
  );

  const csv = [header, ...rows].join("\r\n");
  downloadCsv(csv, `${filename}.csv`);
}

/**
 * Exporta um CSV cru a partir de um texto já formatado.
 */
export function downloadCsv(csvContent: string, filename: string) {
  // BOM para acentos funcionarem no Excel
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: string): string {
  // Se contém vírgula, aspas ou quebra de linha, envolve em aspas duplas
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}

/**
 * Prepara dados de dispositivos para exportação CSV.
 * Normaliza os campos complexos (wifi, pppoe, connectedHosts).
 */
export function prepareDeviceExportData(devices: { 
  serialNumber?: string;
  manufacturer?: string;
  produtoclass?: string;
  hardversion?: string;
  softversion?: string;
  status?: string;
  online?: boolean;
  ip?: string;
  ipv4?: string;
  ipv6?: string;
  macAddress?: string;
  vlan?: string;
  uptime?: string | number;
  lastInformDate?: string;
  pppoe?: { username?: string };
  wifi?: { ssid?: string | string[]; ssid2?: string; ssid5?: string };
  connectedHosts?: Array<{ hostname?: string; mac?: string; ip?: string }>;
  gpon_rxpower?: number | null;
  gpon_txpower?: number | null;
  wifi24_clients?: number;
  wifi5_clients?: number;
  [key: string]: unknown;
}[]) {
  return devices.map((d) => ({
    serial: d.serialNumber || "-",
    fabricante: d.manufacturer || "-",
    modelo: d.produtoclass || "-",
    hardversion: d.hardversion || "-",
    softversion: d.softversion || "-",
    status: d.online ? "Online" : "Offline",
    ipv4: d.ipv4 || d.ip || "-",
    ipv6: d.ipv6 || "-",
    mac: d.macAddress || "-",
    vlan: d.vlan || "-",
    uptime: typeof d.uptime === "number" ? formatUptime(d.uptime) : d.uptime || "-",
    ultimo_informe: d.lastInformDate || "-",
    pppoe_user: d.pppoe?.username || "-",
    wifi_24: d.wifi?.ssid2 || d.wifi?.ssid || "-",
    wifi_5: d.wifi?.ssid5 || "-",
    hosts_lan: d.connectedHosts?.length || 0,
    potencia_rx: d.gpon_rxpower != null ? `${d.gpon_rxpower} dBm` : "-",
    potencia_tx: d.gpon_txpower != null ? `${d.gpon_txpower} dBm` : "-",
    clientes_24: d.wifi24_clients || 0,
    clientes_5: d.wifi5_clients || 0,
  }));
}

function formatUptime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}