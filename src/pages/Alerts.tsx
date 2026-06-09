import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Zap, WifiOff, Clock, RefreshCw,
  ChevronRight, Home, Bell, CheckCircle2, Filter,
  ArrowUpDown, Signal, Router,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import UserMenu from "@/components/UserMenu";
import { Device } from "@/types/device";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Tipos ────────────────────────────────────────────────────────────────────
type AlertSeverity = "critical" | "warning" | "info";

interface Alert {
  id: string;
  deviceId: string;
  serial: string;
  manufacturer: string;
  severity: AlertSeverity;
  category: "gpon" | "offline" | "uptime" | "wifi";
  title: string;
  description: string;
  value?: string;
  timestamp: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function timeSince(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `há ${h}h${m > 0 ? ` ${m}m` : ""}`;
  return `há ${m}m`;
}

// ── Geração de alertas a partir dos dispositivos ─────────────────────────────
function generateAlerts(devices: Device[]): Alert[] {
  const alerts: Alert[] = [];

  devices.forEach((d) => {
    // 1) GPON RX Power crítico (< -30 dBm)
    if (d.gpon_rxpower != null && d.gpon_rxpower < -30) {
      alerts.push({
        id: `gpon-rx-${d.id}`,
        deviceId: d.id,
        serial: d.serialNumber,
        manufacturer: d.manufacturer,
        severity: d.gpon_rxpower < -35 ? "critical" : "warning",
        category: "gpon",
        title: "Potência GPON RX Crítica",
        description: `RX Power abaixo do limiar mínimo (−30 dBm). Pode indicar fibra danificada, conector sujo ou atenuação excessiva.`,
        value: `${d.gpon_rxpower.toFixed(1)} dBm`,
        timestamp: Date.now(),
      });
    }

    // 2) GPON RX em saturação (> -8 dBm)
    if (d.gpon_rxpower != null && d.gpon_rxpower > -8) {
      alerts.push({
        id: `gpon-rx-sat-${d.id}`,
        deviceId: d.id,
        serial: d.serialNumber,
        manufacturer: d.manufacturer,
        severity: "warning",
        category: "gpon",
        title: "Potência GPON em Saturação",
        description: `RX Power acima de −8 dBm. Sinal muito forte pode causar erros de demodulação.`,
        value: `${d.gpon_rxpower.toFixed(1)} dBm`,
        timestamp: Date.now(),
      });
    }

    // 3) GPON TX Power crítico (< -4 dBm)
    if (d.gpon_txpower != null && d.gpon_txpower < -4) {
      alerts.push({
        id: `gpon-tx-${d.id}`,
        deviceId: d.id,
        serial: d.serialNumber,
        manufacturer: d.manufacturer,
        severity: "critical",
        category: "gpon",
        title: "Potência GPON TX Baixa",
        description: `TX Power abaixo de −4 dBm. O transceiver pode estar degradado.`,
        value: `${d.gpon_txpower.toFixed(1)} dBm`,
        timestamp: Date.now(),
      });
    }

    // 4) Offline
    if (d.status === "offline") {
      const uptimeSec = Number(d.uptime) || 0;
      // Se uptime era > 7 dias antes de cair, é mais crítico
      const severity: AlertSeverity = uptimeSec > 7 * 86400 ? "critical" : "warning";
      alerts.push({
        id: `offline-${d.id}`,
        deviceId: d.id,
        serial: d.serialNumber,
        manufacturer: d.manufacturer,
        severity,
        category: "offline",
        title: "Dispositivo Offline",
        description: `Sem resposta ao TR-069. Último informe: ${d.lastInformDate || "desconhecido"}.`,
        value: d.lastInformDate || "—",
        timestamp: Date.now(),
      });
    }

    // 5) Uptime muito baixo em dispositivo online (< 1h = reiniciou recentemente)
    if (d.status === "online") {
      const uptimeSec = Number(d.uptime) || 0;
      if (uptimeSec > 0 && uptimeSec < 3600) {
        alerts.push({
          id: `uptime-low-${d.id}`,
          deviceId: d.id,
          serial: d.serialNumber,
          manufacturer: d.manufacturer,
          severity: "info",
          category: "uptime",
          title: "Reinicialização Recente",
          description: `O dispositivo reiniciou recentemente. Pode indicar queda de energia ou reboot automático.`,
          value: formatUptime(uptimeSec),
          timestamp: Date.now(),
        });
      }
    }

    // 6) Sinal Wi-Fi 2.4 GHz fraco (< -80 dBm)
    if (d.wifi24_signal != null && d.wifi24_signal < -80 && d.status === "online") {
      alerts.push({
        id: `wifi24-weak-${d.id}`,
        deviceId: d.id,
        serial: d.serialNumber,
        manufacturer: d.manufacturer,
        severity: "warning",
        category: "wifi",
        title: "Sinal Wi-Fi 2.4 GHz Fraco",
        description: `RSSI abaixo de −80 dBm. Clientes podem ter dificuldade de conexão.`,
        value: `${d.wifi24_signal} dBm`,
        timestamp: Date.now(),
      });
    }

    // 7) Sinal Wi-Fi 5 GHz fraco (< -80 dBm)
    if (d.wifi5_signal != null && d.wifi5_signal < -80 && d.status === "online") {
      alerts.push({
        id: `wifi5-weak-${d.id}`,
        deviceId: d.id,
        serial: d.serialNumber,
        manufacturer: d.manufacturer,
        severity: "warning",
        category: "wifi",
        title: "Sinal Wi-Fi 5 GHz Fraco",
        description: `RSSI abaixo de −80 dBm na banda de 5 GHz.`,
        value: `${d.wifi5_signal} dBm`,
        timestamp: Date.now(),
      });
    }
  });

  // Ordenar: critical > warning > info, depois por serial
  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return a.serial.localeCompare(b.serial);
  });
}

// ── Cores e ícones por severidade ────────────────────────────────────────────
const severityConfig = {
  critical: {
    icon: AlertTriangle,
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    row: "border-l-4 border-l-destructive",
    label: "Crítico",
    dot: "bg-destructive",
  },
  warning: {
    icon: AlertTriangle,
    badge: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    row: "border-l-4 border-l-yellow-500",
    label: "Atenção",
    dot: "bg-yellow-500",
  },
  info: {
    icon: CheckCircle2,
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    row: "border-l-4 border-l-blue-500",
    label: "Info",
    dot: "bg-blue-500",
  },
};

const categoryConfig = {
  gpon: { icon: Zap, label: "GPON" },
  offline: { icon: WifiOff, label: "Offline" },
  uptime: { icon: Clock, label: "Uptime" },
  wifi: { icon: Signal, label: "Wi-Fi" },
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function AlertsPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "all">("all");
  const [filterCategory, setFilterCategory] = useState<Alert["category"] | "all">("all");
  const [sortBy, setSortBy] = useState<"severity" | "serial" | "category">("severity");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/devices`, {
        params: { page: 1, limit: 5000 },
        timeout: 30000,
      });
      const raw: any[] = res.data?.devices || [];
      const mapped: Device[] = raw.map((d) => ({
        id: d.id,
        serialNumber: d.serial || "—",
        manufacturer: d.manufacturer || "Desconhecido",
        model: d.produtoclass || "—",
        produtoclass: d.produtoclass || "—",
        hardversion: d.hardversion || "—",
        macAddress: d.mac || "—",
        ip: d.ip || "—",
        ipv4: d.ip || "—",
        ipv6: d.ipv6 || "—",
        vlan: d.vlan || "—",
        status: d.online ? "online" : "offline",
        online: !!d.online,
        lastInformDate: d.lastInformDate || "—",
        uptime: d.uptime || 0,
        events: d.events || "—",
        softversion: d.softversion || "—",
        pppoe: { username: d.pppoe || "—", password: "" },
        wifi: { ssid: d.ssid2 || "—", ssid2: d.ssid2 || "—", ssid5: d.ssid5 || "—", password: "" },
        connectedHosts: Array.isArray(d.connectedHosts) ? d.connectedHosts : [],
        gpon_rxpower: d.gpon_rxpower != null ? Number(d.gpon_rxpower) : null,
        gpon_txpower: d.gpon_txpower != null ? Number(d.gpon_txpower) : null,
        wifi24_signal: d.wifi24_signal != null ? Number(d.wifi24_signal) : null,
        wifi5_signal: d.wifi5_signal != null ? Number(d.wifi5_signal) : null,
        wifi24_clients: Number(d.wifi24_clients) || 0,
        wifi5_clients: Number(d.wifi5_clients) || 0,
        wifi24_channel: d.wifi24_channel || "—",
        wifi5_channel: d.wifi5_channel || "—",
        wifi24_txbytes: null, wifi24_rxbytes: null,
        wifi5_txbytes: null, wifi5_rxbytes: null,
        wan_txbytes: null, wan_rxbytes: null,
        wan_txrate: null, wan_rxrate: null,
      }));
      setDevices(mapped);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Erro ao buscar dispositivos para alertas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 60_000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const allAlerts = useMemo(() => generateAlerts(devices), [devices]);

  const visibleAlerts = useMemo(() => {
    let list = allAlerts.filter((a) => !dismissedIds.has(a.id));
    if (filterSeverity !== "all") list = list.filter((a) => a.severity === filterSeverity);
    if (filterCategory !== "all") list = list.filter((a) => a.category === filterCategory);
    if (sortBy === "serial") list = [...list].sort((a, b) => a.serial.localeCompare(b.serial));
    if (sortBy === "category") list = [...list].sort((a, b) => a.category.localeCompare(b.category));
    return list;
  }, [allAlerts, filterSeverity, filterCategory, sortBy, dismissedIds]);

  const counts = useMemo(() => ({
    critical: allAlerts.filter((a) => a.severity === "critical" && !dismissedIds.has(a.id)).length,
    warning: allAlerts.filter((a) => a.severity === "warning" && !dismissedIds.has(a.id)).length,
    info: allAlerts.filter((a) => a.severity === "info" && !dismissedIds.has(a.id)).length,
  }), [allAlerts, dismissedIds]);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const handleDismissAll = () => {
    setDismissedIds(new Set(visibleAlerts.map((a) => a.id)));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Bell className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Central de Alertas</h1>
              <p className="text-xs text-muted-foreground">
                Monitoramento de anomalias da frota CPE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDevices}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Total de Alertas"
            value={counts.critical + counts.warning + counts.info}
            icon={Bell}
            colorClass="text-foreground"
            bgClass="bg-muted/50"
          />
          <KpiCard
            label="Críticos"
            value={counts.critical}
            icon={AlertTriangle}
            colorClass="text-destructive"
            bgClass="bg-destructive/10"
          />
          <KpiCard
            label="Atenção"
            value={counts.warning}
            icon={AlertTriangle}
            colorClass="text-yellow-500"
            bgClass="bg-yellow-500/10"
          />
          <KpiCard
            label="Informativos"
            value={counts.info}
            icon={CheckCircle2}
            colorClass="text-blue-500"
            bgClass="bg-blue-500/10"
          />
        </div>

        {/* Filtros + Controles */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Filtrar:
            </span>
            {/* Severidade */}
            {(["all", "critical", "warning", "info"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-all font-medium",
                  filterSeverity === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {s === "all" ? "Todos" : severityConfig[s].label}
              </button>
            ))}
            <span className="text-border">|</span>
            {/* Categoria */}
            {(["all", "gpon", "offline", "uptime", "wifi"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-all font-medium",
                  filterCategory === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {c === "all" ? "Todas" : categoryConfig[c].label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortBy(s => s === "severity" ? "serial" : s === "serial" ? "category" : "severity")}
              className="text-xs gap-1.5"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Ordenar: {sortBy === "severity" ? "Severidade" : sortBy === "serial" ? "Serial" : "Categoria"}
            </Button>
            {visibleAlerts.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDismissAll} className="text-xs">
                Dispensar todos
              </Button>
            )}
          </div>
        </div>

        {/* Última atualização */}
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Última atualização: {lastUpdated.toLocaleTimeString("pt-BR")} · {devices.length} dispositivos monitorados
          </p>
        )}

        {/* Lista de Alertas */}
        {loading && devices.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : visibleAlerts.length === 0 ? (
          <div className="rounded-xl border bg-card p-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div>
              <p className="text-lg font-semibold">Nenhum alerta ativo</p>
              <p className="text-sm text-muted-foreground mt-1">
                {devices.length > 0
                  ? "Todos os dispositivos monitorados estão operando normalmente."
                  : "Aguardando dados dos dispositivos..."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onDismiss={() => handleDismiss(alert.id)}
                onViewDevice={() => navigate("/")}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, colorClass, bgClass,
}: { label: string; value: number; icon: any; colorClass: string; bgClass: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
      <div className={cn("p-2.5 rounded-lg", bgClass)}>
        <Icon className={cn("h-5 w-5", colorClass)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold", colorClass)}>{value}</p>
      </div>
    </div>
  );
}

function AlertRow({
  alert, onDismiss, onViewDevice,
}: { alert: Alert; onDismiss: () => void; onViewDevice: () => void }) {
  const sev = severityConfig[alert.severity];
  const cat = categoryConfig[alert.category];
  const SevIcon = sev.icon;
  const CatIcon = cat.icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3.5 flex items-start gap-4 transition-all hover:shadow-md",
        sev.row
      )}
    >
      {/* Ícone de severidade */}
      <div className={cn("mt-0.5 p-1.5 rounded-lg", alert.severity === "critical" ? "bg-destructive/10" : alert.severity === "warning" ? "bg-yellow-500/10" : "bg-blue-500/10")}>
        <SevIcon className={cn("h-4 w-4", alert.severity === "critical" ? "text-destructive" : alert.severity === "warning" ? "text-yellow-500" : "text-blue-500")} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-semibold text-sm">{alert.title}</span>
          <Badge variant="outline" className={cn("text-[10px] px-2 py-0 h-5", sev.badge)}>
            {sev.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 gap-1">
            <CatIcon className="h-2.5 w-2.5" />
            {cat.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{alert.description}</p>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-xs font-mono text-foreground flex items-center gap-1">
            <Router className="h-3 w-3 text-muted-foreground" />
            {alert.serial}
          </span>
          <span className="text-xs text-muted-foreground">{alert.manufacturer}</span>
          {alert.value && (
            <span className="text-xs font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded">
              {alert.value}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{timeSince(alert.timestamp)}</span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewDevice}
          className="h-7 text-xs gap-1 text-primary hover:text-primary"
        >
          Ver
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </Button>
      </div>
    </div>
  );
}
