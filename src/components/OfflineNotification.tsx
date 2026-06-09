import { useState, useEffect, useMemo, useRef } from "react";
import { Bell, BellRing, WifiOff, Clock, Sparkles } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";

const API_URL =
  (import.meta.env.VITE_API_URL || "http://localhost:5000") +
  "/api/devices/offline-24h";

interface OfflineRecord {
  id: string;
  serialNumber: string;
  lastInformDate: string;
  timestamp: number;
}

function getUserIdentifier(): string | null {
  const token = sessionStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.id?.toString() || payload.user || null;
  } catch {
    return null;
  }
}

export function OfflineNotification() {
  const [open, setOpen] = useState(false);
  const [offlineHistory, setOfflineHistory] = useState<OfflineRecord[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  // Guarda o timestamp salvo NO MOMENTO em que o painel foi aberto
  const [panelOpenedAt, setPanelOpenedAt] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const userId = useMemo(() => getUserIdentifier(), []);
  const storageKeyLastSeen = useMemo(
    () =>
      userId
        ? `offline-last-seen-timestamp-${userId}`
        : "offline-last-seen-timestamp-anon",
    [userId]
  );

  // Fecha o painel ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const saved = localStorage.getItem("offline-devices-24h-history");
    if (saved) {
      try {
        setOfflineHistory(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    const fetchOffline = async () => {
      try {
        const { data } = await axios.get<OfflineRecord[]>(API_URL);
        setOfflineHistory(data);
        localStorage.setItem(
          "offline-devices-24h-history",
          JSON.stringify(data)
        );
        const lastSeenTs = Number(
          localStorage.getItem(storageKeyLastSeen) ?? 0
        );
        const unseen = data.filter((d) => (d.timestamp ?? 0) > lastSeenTs);
        setUnseenCount(unseen.length);
      } catch (err) {
        console.error("Erro ao buscar offline 24h:", err);
      }
    };

    fetchOffline();
    const interval = setInterval(fetchOffline, 60_000);
    return () => clearInterval(interval);
  }, [storageKeyLastSeen]);

  const handleToggleOpen = () => {
    setOpen((prev) => {
      if (!prev) {
        // Captura o lastSeen ANTES de marcar como visto
        const ts = Number(localStorage.getItem(storageKeyLastSeen) ?? 0);
        setPanelOpenedAt(ts);
        // Agora marca tudo como visto
        const now = Date.now();
        localStorage.setItem(storageKeyLastSeen, now.toString());
        setUnseenCount(0);
      }
      return !prev;
    });
  };

  // Separa novos (destacados) dos antigos usando o ts capturado na abertura
  const { newDevices, oldDevices } = useMemo(() => {
    const sorted = [...offlineHistory].sort(
      (a, b) => b.timestamp - a.timestamp
    );
    if (!open) return { newDevices: [], oldDevices: sorted };
    const novo = sorted.filter((d) => (d.timestamp ?? 0) > panelOpenedAt);
    const velho = sorted.filter((d) => (d.timestamp ?? 0) <= panelOpenedAt);
    return { newDevices: novo, oldDevices: velho };
  }, [offlineHistory, open, panelOpenedAt]);

  const hasNew = open && newDevices.length > 0;

  return (
    <div className="relative" ref={panelRef}>
      {/* Botão sino */}
      <Button
        variant="outline"
        size="icon"
        onClick={handleToggleOpen}
        className={`relative transition-all duration-200 ${
          unseenCount > 0
            ? "border-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.4)]"
            : ""
        }`}
        aria-label={`Notificações — ${unseenCount} não vistas`}
      >
        {unseenCount > 0 ? (
          <BellRing className="h-5 w-5 text-orange-400 animate-[wiggle_0.8s_ease-in-out_infinite]" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unseenCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        )}
      </Button>

      {/* Painel de notificações */}
      {open && (
        <div className="absolute right-0 top-12 w-96 rounded-xl border bg-card shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-muted/30 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-destructive" />
              <span className="font-semibold text-sm">
                Offline nas últimas 24h
              </span>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {offlineHistory.length} total
            </span>
          </div>

          {offlineHistory.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-6 w-6 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Tudo online!
              </p>
              <p className="text-xs text-muted-foreground">
                Nenhum dispositivo offline nas últimas 24 horas
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              {/* Seção NOVAS notificações */}
              {hasNew && (
                <>
                  <div className="sticky top-0 z-10 px-4 py-1.5 bg-orange-500/10 border-b border-orange-400/30 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                      <Sparkles className="h-3 w-3" />
                      {newDevices.length} nova{newDevices.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {newDevices.map((device) => (
                    <NewNotificationItem key={device.id} device={device} />
                  ))}
                </>
              )}

              {/* Seção antigas */}
              {oldDevices.length > 0 && (
                <>
                  {hasNew && (
                    <div className="px-4 py-1.5 bg-muted/30 border-b border-border/60">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Anteriores
                      </span>
                    </div>
                  )}
                  {oldDevices.map((device) => (
                    <OldNotificationItem key={device.id} device={device} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewNotificationItem({ device }: { device: OfflineRecord }) {
  return (
    <div className="px-4 py-3 border-b border-orange-200/40 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100/70 dark:hover:bg-orange-950/60 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse mt-1" />
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-orange-700 dark:text-orange-300 truncate">
              {device.serialNumber}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3 text-orange-500/70 shrink-0" />
              <p className="text-[11px] text-orange-600/80 dark:text-orange-400/80 truncate">
                {device.lastInformDate}
              </p>
            </div>
          </div>
        </div>
        <span className="shrink-0 text-[9px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
          novo
        </span>
      </div>
    </div>
  );
}

function OldNotificationItem({ device }: { device: OfflineRecord }) {
  return (
    <div className="px-4 py-3 border-b border-border/40 hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-muted-foreground/30 mt-0.5" />
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium text-foreground truncate">
            {device.serialNumber}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <p className="text-[11px] text-muted-foreground truncate">
              {device.lastInformDate}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
