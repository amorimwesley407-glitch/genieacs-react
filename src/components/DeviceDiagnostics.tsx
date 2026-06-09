import { useState } from "react";
import {
  Activity, Network, Zap, Loader2, AlertCircle,
  Terminal, Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface DiagnosticsResult {
  success: boolean;
  tool: string;
  target: string;
  output?: string[];
  stats?: Record<string, number | string>;
}

interface DeviceDiagnosticsProps {
  deviceId: string;
  deviceIp?: string;
}

type ToolType = "ping" | "traceroute" | "speedtest";

const TOOL_CONFIG: Record<ToolType, {
  label: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: string;
  timeout: number;
}> = {
  ping: {
    label: "Ping",
    icon: Activity,
    description: "Testa conectividade (4 pacotes)",
    color: "text-sky-500",
    timeout: 30,
  },
  traceroute: {
    label: "Traceroute",
    icon: Network,
    description: "Rota até o dispositivo (até 15 saltos)",
    color: "text-violet-500",
    timeout: 60,
  },
  speedtest: {
    label: "Speedtest",
    icon: Zap,
    description: "Latência, jitter e perda (10 pacotes)",
    color: "text-emerald-500",
    timeout: 40,
  },
};

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${ms} ms`;
}

function RatingBadge({ rating }: { rating?: string }) {
  if (!rating) return null;
  const colors: Record<string, string> = {
    excelente: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    bom: "text-sky-600 bg-sky-500/10 border-sky-200",
    regular: "text-amber-600 bg-amber-500/10 border-amber-200",
    ruim: "text-destructive bg-destructive/10 border-destructive/20",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colors[rating] || colors.ruim}`}>
      {rating}
    </span>
  );
}

export function DeviceDiagnostics({ deviceId, deviceIp }: DeviceDiagnosticsProps) {
  const [loading, setLoading] = useState<ToolType | null>(null);
  const [results, setResults] = useState<Record<ToolType, DiagnosticsResult | null>>({
    ping: null,
    traceroute: null,
    speedtest: null,
  });
  const [errors, setErrors] = useState<Record<ToolType, string | null>>({
    ping: null,
    traceroute: null,
    speedtest: null,
  });
  const [expandedOutput, setExpandedOutput] = useState<ToolType | null>(null);

  const token = sessionStorage.getItem("token");

  const runDiagnostic = async (tool: ToolType) => {
    if (loading) return;
    setLoading(tool);
    setErrors((prev) => ({ ...prev, [tool]: null }));
    setResults((prev) => ({ ...prev, [tool]: null }));

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const body: Record<string, string> = {};
      if (deviceIp && deviceIp !== "-" && deviceIp !== "—") {
        body.target = deviceIp;
      }

      const res = await fetch(
        `${API_BASE}/api/devices/${encodeURIComponent(deviceId)}/diagnostics/${tool}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [tool]: data.error || `HTTP ${res.status}` }));
      } else {
        setResults((prev) => ({ ...prev, [tool]: data }));
      }
    } catch (e: unknown) {
      setErrors((prev) => ({ ...prev, [tool]: (e as Error).message }));
    } finally {
      setLoading(null);
    }
  };

  const getStat = (tool: ToolType, key: string): number | string | null => {
    const s = results[tool]?.stats;
    if (!s) return null;
    const v = s[key];
    return v !== undefined && v !== null ? v : null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Diagnóstico Remoto
        </h3>
        {deviceIp && deviceIp !== "-" && deviceIp !== "—" && (
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">
            IP: {deviceIp}
          </span>
        )}
      </div>

      {/* Grid de botões */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(Object.entries(TOOL_CONFIG) as [ToolType, typeof TOOL_CONFIG[ToolType]][]).map(([tool, config]) => {
          const Icon = config.icon;
          const isRunning = loading === tool;
          const result = results[tool];
          const error = errors[tool];

          return (
            <button
              key={tool}
              onClick={() => runDiagnostic(tool)}
              disabled={!!loading}
              className={cn(
                "relative p-3 rounded-lg border text-left transition-all",
                "hover:bg-muted/50 active:scale-[0.98]",
                isRunning && "pointer-events-none opacity-70",
                result?.success
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : error
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border/50 bg-card"
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Icon className={`h-4 w-4 ${config.color}`} />
                )}
                <span className="text-xs font-semibold text-foreground">{config.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{config.timeout}s</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{config.description}</p>

              {/* Result summary */}
              {result?.success && (
                <div className="mt-2 pt-2 border-t border-border/40 space-y-0.5">
                  {tool === "ping" && (
                    <>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Latência</span>
                        <span className="font-mono font-medium">{formatMs(getStat(tool, "avg_ms") as number)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Perda</span>
                        <span className={`font-mono font-medium ${(getStat(tool, "loss") as number) > 0 ? "text-destructive" : "text-emerald-500"}`}>
                          {getStat(tool, "loss") as number}%
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Pacotes</span>
                        <span className="font-mono text-muted-foreground">
                          {getStat(tool, "received")}/{getStat(tool, "sent")}
                        </span>
                      </div>
                    </>
                  )}
                  {tool === "traceroute" && (
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">Saltos detectados</span>
                      <span className="font-mono font-medium">{getStat(tool, "hops") as number}</span>
                    </div>
                  )}
                  {tool === "speedtest" && (
                    <>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Latência</span>
                        <span className="font-mono font-medium">{formatMs(getStat(tool, "latency_ms") as number)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Jitter</span>
                        <span className="font-mono font-medium">{formatMs(getStat(tool, "jitter_ms") as number)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] items-center">
                        <span className="text-muted-foreground">Qualidade</span>
                        <RatingBadge rating={getStat(tool, "rating") as string} />
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-[10px] pt-0.5">
                    <span className="text-muted-foreground">Tempo</span>
                    <span className="font-mono text-muted-foreground">
                      {(((getStat(tool, "time_ms") as number) || 0) / 1000).toFixed(1)}s
                    </span>
                  </div>

                  {/* Expand output */}
                  {result.output && result.output.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedOutput(expandedOutput === tool ? null : tool);
                      }}
                      className="w-full mt-1.5 text-[10px] text-primary hover:text-primary/80 flex items-center justify-center gap-1"
                    >
                      <Terminal className="h-3 w-3" />
                      {expandedOutput === tool ? "Ocultar saída" : "Ver saída completa"}
                    </button>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-2 pt-2 border-t border-destructive/40 flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                  <span className="text-[10px] text-destructive">{error}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded output */}
      {expandedOutput && results[expandedOutput]?.output && (
        <Card className="border-border/40">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Saída bruta — {TOOL_CONFIG[expandedOutput].label}
              </span>
            </div>
            <pre className="text-[10px] font-mono leading-relaxed text-muted-foreground bg-muted/40 p-2 rounded max-h-[200px] overflow-y-auto">
              {results[expandedOutput]?.output?.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Hint */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/60">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <p>
          Os diagnósticos são executados diretamente do servidor (backend). 
          O IP de destino é resolvido automaticamente do GenieACS ou você pode configurá-lo nos detalhes do dispositivo.
        </p>
      </div>
    </div>
  );
}