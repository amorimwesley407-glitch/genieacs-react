import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, Activity, Network, Layers, X } from "lucide-react";

interface DeviceSummary {
  manufacturer: string;
  hardversion?: string;
  online: boolean;
  uptime?: number | string | null;
  vlan?: string;
}

export type ChartFilter =
  | { type: "hardversion"; value: string }
  | { type: "uptime"; value: string }
  | { type: "vlan"; value: string }
  | null;

interface DashboardChartsProps {
  devices: DeviceSummary[];
  activeFilter?: ChartFilter;
  onFilter?: (filter: ChartFilter) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs space-y-1">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
      <p className="text-[10px] text-primary/70 mt-1">Clique para filtrar</p>
    </div>
  );
};

export function DashboardCharts({ devices, activeFilter, onFilter }: DashboardChartsProps) {

  // Gráfico 1 — Versão de Hardware
  const hardversionData = useMemo(() => {
    const map: Record<string, number> = {};
    devices.forEach((d) => {
      const hv = d.hardversion && d.hardversion !== "-" ? d.hardversion : "Desconhecida";
      map[hv] = (map[hv] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [devices]);

  // Gráfico 2 — Distribuição de Uptime
  const uptimeBuckets = useMemo(() => {
    const buckets: Record<string, number> = {
      "< 1h": 0, "1–24h": 0, "1–7d": 0, "7–30d": 0, "> 30d": 0, "Offline": 0,
    };
    devices.forEach((d) => {
      const isOnline = typeof d.online === "boolean" ? d.online : (d as any).status === "online";
      if (!isOnline) { buckets["Offline"]++; return; }
      const s = Number(d.uptime);
      if (!s || isNaN(s)) { buckets["Offline"]++; return; }
      if (s < 3600) buckets["< 1h"]++;
      else if (s < 86400) buckets["1–24h"]++;
      else if (s < 7 * 86400) buckets["1–7d"]++;
      else if (s < 30 * 86400) buckets["7–30d"]++;
      else buckets["> 30d"]++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [devices]);

  // Gráfico 3 — Dispositivos por VLAN
  const vlanData = useMemo(() => {
    const map: Record<string, number> = {};
    devices.forEach((d) => {
      const v = d.vlan && d.vlan !== "-" ? d.vlan : "N/A";
      map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [devices]);

  const BAR_COLORS = [
    "hsl(199,89%,48%)", "hsl(199,70%,58%)", "hsl(199,60%,65%)",
    "hsl(220,60%,55%)", "hsl(270,60%,60%)", "hsl(30,80%,55%)",
    "hsl(150,60%,45%)", "hsl(0,60%,55%)", "hsl(340,70%,55%)", "hsl(60,70%,45%)",
  ];
  const UPTIME_COLORS: Record<string, string> = {
    "< 1h": "hsl(38,92%,50%)", "1–24h": "hsl(199,89%,48%)",
    "1–7d": "hsl(142,60%,45%)", "7–30d": "hsl(142,71%,38%)",
    "> 30d": "hsl(142,71%,30%)", "Offline": "hsl(0,72%,51%)",
  };

  const handleFilter = (f: ChartFilter) => {
    if (!onFilter) return;
    if (
      activeFilter?.type === f?.type &&
      activeFilter?.value === f?.value
    ) {
      onFilter(null);
    } else {
      onFilter(f);
    }
  };

  const isActive = (f: ChartFilter) => {
    if (!activeFilter || !f) return false;
    return activeFilter.type === f.type && activeFilter.value === f.value;
  };

  if (devices.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Badge do filtro ativo */}
      {activeFilter && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">Filtrando por:</span>
          <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">
            {activeFilter.type === "hardversion" && `HW: ${activeFilter.value}`}
            {activeFilter.type === "uptime" && `Uptime: ${activeFilter.value}`}
            {activeFilter.type === "vlan" && `VLAN ${activeFilter.value}`}
            <button onClick={() => onFilter?.(null)} className="hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Gráfico 1 — Versão de Hardware */}
        <Card className="glass-card animate-fade-in">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-primary" />
              Versão de Hardware
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={hardversionData}
                margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
                style={{ cursor: "pointer" }}
                onClick={(data) => {
                  if (!data?.activeLabel) return;
                  handleFilter({ type: "hardversion", value: data.activeLabel as string });
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={44}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Dispositivos" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {hardversionData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={BAR_COLORS[i % BAR_COLORS.length]}
                      opacity={
                        isActive({ type: "hardversion", value: entry.name })
                          ? 1
                          : activeFilter?.type === "hardversion"
                          ? 0.35
                          : 1
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico 2 — Distribuição de Uptime */}
        <Card className="glass-card animate-fade-in">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Distribuição de Uptime
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={uptimeBuckets}
                margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
                style={{ cursor: "pointer" }}
                onClick={(data) => {
                  if (!data?.activeLabel) return;
                  handleFilter({ type: "uptime", value: data.activeLabel as string });
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Dispositivos" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {uptimeBuckets.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={UPTIME_COLORS[entry.name] || "hsl(199,89%,48%)"}
                      opacity={
                        isActive({ type: "uptime", value: entry.name })
                          ? 1
                          : activeFilter?.type === "uptime"
                          ? 0.35
                          : 1
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico 3 — Dispositivos por VLAN */}
        {vlanData.length > 1 && (
          <Card className="glass-card animate-fade-in lg:col-span-2">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Network className="h-4 w-4 text-primary" />
                Dispositivos por VLAN
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={vlanData}
                  layout="vertical"
                  margin={{ top: 4, right: 30, left: 20, bottom: 4 }}
                  style={{ cursor: "pointer" }}
                  onClick={(data) => {
                    if (!data?.activeLabel) return;
                    handleFilter({ type: "vlan", value: data.activeLabel as string });
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Dispositivos" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {vlanData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={BAR_COLORS[i % BAR_COLORS.length]}
                        opacity={
                          isActive({ type: "vlan", value: entry.name })
                            ? 1
                            : activeFilter?.type === "vlan"
                            ? 0.35
                            : 1
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
