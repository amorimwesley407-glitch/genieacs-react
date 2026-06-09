import { useState, useEffect, useCallback } from "react";
import { Clock, RefreshCw, AlertCircle, CheckCircle, Wifi, RotateCcw, Settings, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface HistoryEvent {
  id: number | string;
  actor_user?: string;
  action?: string;
  details?: string | null;
  created_at?: string;
  ip?: string;
  // GenieACS fields
  name?: string;
  status?: string;
  fault?: string | null;
  created?: string;
  completed?: string | null;
}

interface DeviceHistoryProps {
  deviceId: string;
  deviceSerial?: string;
}

const ACTION_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  DEVICE_REBOOT:       { label: "Reboot",          icon: <RotateCcw className="h-3.5 w-3.5" />, color: "text-amber-500" },
  DEVICE_WIFI_CHANGE:  { label: "Wi-Fi alterado",  icon: <Wifi className="h-3.5 w-3.5" />,     color: "text-sky-500" },
  DEVICE_PPPOE_CHANGE: { label: "PPPoE alterado",  icon: <Settings className="h-3.5 w-3.5" />, color: "text-indigo-500" },
};

const GENIEACS_EVENTS: Record<string, { label: string; color: string }> = {
  reboot:           { label: "Reboot",        color: "text-amber-500" },
  setParameterValues: { label: "Config alterada", color: "text-sky-500" },
  getParameterValues: { label: "Consulta",     color: "text-blue-500" },
  factoryReset:     { label: "Reset fábrica", color: "text-red-500" },
  download:         { label: "Download",      color: "text-purple-500" },
  upload:           { label: "Upload",        color: "text-purple-500" },
};

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return dateStr;
  }
}

function getEventIcon(event: HistoryEvent): React.ReactNode {
  const meta = ACTION_MAP[event.action || ""];
  if (meta) return meta.icon;
  const genie = GENIEACS_EVENTS[event.name || ""];
  if (genie) {
    if (event.name === "reboot") return <RotateCcw className="h-3.5 w-3.5" />;
    if (event.name === "setParameterValues") return <Settings className="h-3.5 w-3.5" />;
    return <Settings className="h-3.5 w-3.5" />;
  }
  return <Clock className="h-3.5 w-3.5" />;
}

function getEventColor(event: HistoryEvent): string {
  const meta = ACTION_MAP[event.action || ""];
  if (meta) return meta.color;
  const genie = GENIEACS_EVENTS[event.name || ""];
  if (genie) return genie.color;
  return "text-muted-foreground";
}

function getEventLabel(event: HistoryEvent): string {
  const meta = ACTION_MAP[event.action || ""];
  if (meta) return meta.label;
  const genie = GENIEACS_EVENTS[event.name || ""];
  if (genie) return genie.label;
  return event.action || event.name || "Evento";
}

async function readJsonOrThrow(res: Response, path: string) {
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as Error & { status?: number; path?: string }).status = res.status;
    (err as Error & { status?: number; path?: string }).path = path;
    throw err;
  }
  return res.json();
}

export function DeviceHistory({ deviceId, deviceSerial }: DeviceHistoryProps) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [genieEvents, setGenieEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"audit" | "genieacs">("audit");
  const [error, setError] = useState<string | null>(null);
  const token = sessionStorage.getItem("token");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      if (tab === "audit") {
        const path = `/api/devices/${encodeURIComponent(deviceId)}/history?limit=50`;
        const res = await fetch(`${API_BASE}${path}`, { headers });
        try {
          const data = await readJsonOrThrow(res, path);
          setEvents(data.events || []);
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (status !== 404) throw err;

          // Compatibilidade com backends antigos: usa o audit log admin filtrado por device.
          const fallbackPath = `/auth/admin/audit-log?limit=50&target_id=${encodeURIComponent(deviceId)}`;
          const fallback = await fetch(`${API_BASE}${fallbackPath}`, { headers });
          const fallbackData = await readJsonOrThrow(fallback, fallbackPath);
          setEvents(fallbackData.entries || []);
        }
      } else {
        const path = `/api/devices/${encodeURIComponent(deviceId)}/history/genieacs?limit=50`;
        const res = await fetch(`${API_BASE}${path}`, { headers });
        if (res.status === 404 || res.status >= 500) {
          setGenieEvents([]);
          return;
        }
        const data = await readJsonOrThrow(res, path);
        setGenieEvents(data.events || []);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, tab, token]);

  useEffect(() => {
    if (deviceId) fetchHistory();
  }, [deviceId, fetchHistory]);

  const currentEvents = tab === "audit" ? events : genieEvents;

  return (
    <div className="space-y-3">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Histórico de Eventos
            {deviceSerial && <span className="text-muted-foreground font-normal ml-1">({deviceSerial})</span>}
          </h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={fetchHistory} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* TABS */}
      <div className="flex border-b border-border">
        {(["audit", "genieacs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "audit" ? "Audit Log" : "GenieACS Tasks"}
          </button>
        ))}
      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          Erro ao carregar: {error}
        </div>
      )}

      {/* TIMELINE */}
      {loading && currentEvents.length === 0 ? (
        <div className="flex justify-center py-6">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : currentEvents.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Nenhum evento encontrado para este dispositivo.
        </p>
      ) : (
        <div className="space-y-0 max-h-[300px] overflow-y-auto pr-1">
          {currentEvents.map((event, idx) => {
            const date = formatDateTime(event.created_at || event.created);
            const eventColor = getEventColor(event);
            const eventLabel = getEventLabel(event);
            const isLast = idx === currentEvents.length - 1;

            return (
              <div key={event.id || idx} className="flex gap-3 relative">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center border-2 border-background bg-muted", eventColor)}>
                    {getEventIcon(event)}
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border/60 min-h-[24px]" />}
                </div>

                {/* Content */}
                <div className={cn("pb-4 flex-1 min-w-0", isLast && "pb-0")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("text-xs font-medium", eventColor)}>{eventLabel}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{date}</span>
                  </div>

                  {/* Details for audit events */}
                  {tab === "audit" && (event.actor_user || event.ip) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {event.actor_user && (
                        <span className="text-[10px] text-muted-foreground/70">por {event.actor_user}</span>
                      )}
                      {event.ip && event.ip !== "-" && (
                        <span className="text-[10px] text-muted-foreground/50">({event.ip})</span>
                      )}
                    </div>
                  )}

                  {/* Details for GenieACS events */}
                  {tab === "genieacs" && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {event.status && (
                        <span className={cn(
                          "text-[10px] font-medium",
                          event.status === "completed" ? "text-emerald-500" :
                          event.status === "failed" || event.fault ? "text-destructive" :
                          "text-amber-500"
                        )}>
                          {event.status === "completed" ? <CheckCircle className="h-3 w-3 inline mr-0.5" /> :
                           event.status === "failed" || event.fault ? <AlertCircle className="h-3 w-3 inline mr-0.5" /> :
                           <Clock className="h-3 w-3 inline mr-0.5" />}
                          {event.status}
                        </span>
                      )}
                      {event.fault && (
                        <span className="text-[10px] text-destructive/70">{event.fault}</span>
                      )}
                      {event.completed && (
                        <span className="text-[10px] text-muted-foreground/50">concluído: {formatDateTime(event.completed)}</span>
                      )}
                    </div>
                  )}

                  {/* JSON details */}
                  {event.details && (
                    <details className="mt-0.5">
                      <summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-foreground">Detalhes</summary>
                      <pre className="text-[10px] bg-muted/50 border border-border rounded p-1.5 mt-0.5 overflow-x-auto text-muted-foreground">
                        {(() => {
                          try { return JSON.stringify(JSON.parse(event.details), null, 2); }
                          catch { return event.details; }
                        })()}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
