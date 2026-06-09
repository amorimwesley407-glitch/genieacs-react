import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  RefreshCw, Router, Activity, Wifi, ShieldCheck,
  HardDrive, Server, AlertTriangle, Cpu, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FilterBar } from "@/components/FilterBar";
import { EditDeviceModal } from "@/components/EditDeviceModal";
import { Device } from "@/types/device";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Treemap,
} from "recharts";

// ────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${API_BASE}/api/devices`;

const CHART_COLORS = {
  online: "hsl(var(--success))",
  offline: "hsl(var(--destructive))",
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  warning: "hsl(var(--warning))",
  models: [
    "hsl(243 89% 48%)", "hsl(271 89% 48%)", "hsl(285 89% 48%)",
    "hsl(300 89% 48%)", "hsl(315 89% 48%)", "hsl(330 89% 48%)",
    "hsl(345 89% 48%)", "hsl(0 89% 48%)", "hsl(15 89% 48%)", "hsl(30 89% 48%)"
  ],
};

const IP_COLORS = {
  ipv4Only: "#3b82f6",
  dual: "hsl(var(--success))",
  ipv6Only: "#8b5cf6",
  none: "hsl(var(--destructive))",
};

const RADIAN = Math.PI / 180;

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={14} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3 shadow-2xl text-sm text-foreground backdrop-blur-md border border-border/50">
        <p className="font-semibold text-foreground mb-1">{label || "Detalhes"}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
            {entry.name}: <span className="font-bold">{entry.value}</span>
            <span className="text-muted-foreground">({((entry.value / payload.reduce((a: any, b: any) => a + b.value, 0)) * 100).toFixed(1)}%)</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DeviceDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editType, setEditType] = useState<"pppoe" | "wifi" | null>(null);
  const [loading, setLoading] = useState(false);
  // BUG CORRIGIDO: adicionado refreshTick para permitir re-fetch manual sem reload
  const [refreshTick, setRefreshTick] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { toast } = useToast();

  // BUG CORRIGIDO: fetchDevices agora aceita parâmetros e passa filtros ao servidor
  const fetchDevices = useCallback(async (searchVal: string, statusVal: string, mfrVal: string) => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", "1");

      // Passa filtros para o servidor (server-side filtering)
      if (searchVal.trim()) params.set("search", searchVal.trim());
      if (statusVal !== "all") params.set("status", statusVal);
      if (mfrVal !== "all") params.set("manufacturer", mfrVal);

      // Se não tem filtros, carrega mais devices
      if (!searchVal.trim() && statusVal === "all" && mfrVal === "all") {
        params.set("limit", "5000");
      } else {
        params.set("limit", "2000");
      }

      const url = `${API_URL}?${params.toString()}`;
      const res = await axios.get(url, { timeout: 30000 });

      const responseData = res.data;
      const apiDevices = Array.isArray(responseData) ? responseData : responseData?.devices || [];

      const mapped: Device[] = apiDevices.map((d: any) => ({
        id: d.id || d.serial,
        serialNumber: d.serial || "—",
        manufacturer: d.manufacturer || "Desconhecido",
        produtoclass: d.produtoclass || d.model || "—",
        model: d.produtoclass || d.model || "—",
        macAddress: d.mac || "—",
        ip: d.ip || "—",
        ipv4: d.ip || "—",
        ipv6: d.ipv6 || "—",
        vlan: d.vlan || "—",
        status: (d.online ? "online" : "offline") as "online" | "offline",
        online: !!d.online,
        uptime: d.uptime || 0,
        lastInformDate: d.lastInformDate || "—",
        events: d.events || "—",
        hardversion: d.hardversion || "—",
        softversion: d.softversion || "—",
        connectedHosts: Array.isArray(d.connectedHosts) ? d.connectedHosts : [],
        pppoe: { username: d.pppoe || "—", password: d.passwordppoe || "" },
        wifi: {
          ssid: Array.isArray(d.ssid) ? d.ssid.join(", ") : d.ssid || "—",
          ssid2: d.ssid2 || "—",
          ssid5: d.ssid5 || "—",
          password: d.passwordwifi || "",
          passwordwifi5g: d.passwordwifi5g || "",
        },
        wan_txbytes: d.wan_txbytes != null ? Number(d.wan_txbytes) : null,
        wan_rxbytes: d.wan_rxbytes != null ? Number(d.wan_rxbytes) : null,
        wan_txrate:  d.wan_txrate  != null ? Number(d.wan_txrate)  : null,
        wan_rxrate:  d.wan_rxrate  != null ? Number(d.wan_rxrate)  : null,
      }));

      setDevices(mapped);
    } catch (err: any) {
      console.error("Erro ao carregar dispositivos:", err);
      toast({
        title: "Erro",
        description: err.message?.includes("timeout")
          ? "Tempo esgotado — frota grande ou servidor lento"
          : "Falha ao carregar dispositivos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Debounced search (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDevices(search, statusFilter, manufacturerFilter);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, statusFilter, manufacturerFilter, fetchDevices]);

  // Refresh manual (botão Refresh)
  useEffect(() => {
    if (refreshTick === 0) return;
    fetchDevices(search, statusFilter, manufacturerFilter);
  }, [refreshTick, search, statusFilter, manufacturerFilter, fetchDevices]);

  // Polling automático a cada 60s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDevices(search, statusFilter, manufacturerFilter);
    }, 60000);
    return () => clearInterval(interval);
  }, [search, statusFilter, manufacturerFilter, fetchDevices]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return devices.filter(d => {
      const matchSearch = !term ||
        d.serialNumber.toLowerCase().includes(term) ||
        d.ipv4.toLowerCase().includes(term) ||
        d.manufacturer.toLowerCase().includes(term) ||
        d.model.toLowerCase().includes(term);
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      const matchMan = manufacturerFilter === "all" || d.manufacturer === manufacturerFilter;
      return matchSearch && matchStatus && matchMan;
    });
  }, [devices, search, statusFilter, manufacturerFilter]);

  const total = filtered.length;
  const online = filtered.filter(d => d.status === "online").length;
  const offline = total - online;
  const availability = total ? ((online / total) * 100).toFixed(1) : "0.0";

  // Chart Data
  const statusData = [
    { name: "Online", value: online, fill: CHART_COLORS.online },
    { name: "Offline", value: offline, fill: CHART_COLORS.offline },
  ];

  const manufCount = filtered.reduce((acc: Record<string, number>, d) => {
    acc[d.manufacturer] = (acc[d.manufacturer] || 0) + 1;
    return acc;
  }, {});
  const manufacturerData = Object.entries(manufCount)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const topManufacturers = manufacturerData.slice(0, 8);
  const others = manufacturerData.slice(8).reduce((sum, item) => sum + item.total, 0);
  const finalManufData = others > 0 ? [...topManufacturers, { name: "Outros", total: others }] : topManufacturers;

  const ipStats = useMemo(() => {
    let ipv4Only = 0, ipv6Only = 0, dual = 0, none = 0;
    filtered.forEach(d => {
      const hasV4 = (d.ipv4 || d.ip) && (d.ipv4 || d.ip) !== "—" && (d.ipv4 || d.ip) !== "-";
      const hasV6 = d.ipv6 && d.ipv6 !== "—" && d.ipv6 !== "-";
      if (hasV4 && hasV6) dual++;
      else if (hasV4) ipv4Only++;
      else if (hasV6) ipv6Only++;
      else none++;
    });
    const totalWithIP = ipv4Only + ipv6Only + dual + none;
    const dualPercent = totalWithIP ? ((dual / totalWithIP) * 100).toFixed(1) : "0.0";

    return {
      ipv4Only, ipv6Only, dual, none, dualPercent,
      ipStackData: [
        { name: "Apenas IPv4", value: ipv4Only, fill: IP_COLORS.ipv4Only },
        { name: "Dual-Stack", value: dual, fill: IP_COLORS.dual },
        { name: "Apenas IPv6", value: ipv6Only, fill: IP_COLORS.ipv6Only },
        { name: "Sem IP WAN", value: none, fill: IP_COLORS.none },
      ]
    };
  }, [filtered]);

  const vlanStats = useMemo(() => {
    const count = filtered.reduce((acc: Record<string, number>, d) => {
      const v = d.vlan && d.vlan !== "—" && d.vlan !== "-" ? d.vlan : "Desconhecida/Nenhuma";
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
    const vlanData = Object.entries(count).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    const configured = filtered.filter(d => d.vlan && d.vlan !== "—" && d.vlan !== "-").length;
    const configPercent = total ? ((configured / total) * 100).toFixed(1) : "0.0";
    const topVlanData = vlanData.slice(0, 10);
    const othersVlan = vlanData.slice(10).reduce((sum, item) => sum + item.total, 0);
    const finalVlanPie = [
      ...topVlanData.map(v => ({ name: v.name, value: v.total })),
      ...(othersVlan > 0 ? [{ name: "Outras", value: othersVlan }] : [])
    ];

    return { configured, configPercent, vlanPieData: finalVlanPie };
  }, [filtered, total]);

  const modelCount = filtered.reduce((acc: Record<string, number>, d) => {
    const key = `${d.manufacturer} - ${d.model}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const modelData = Object.entries(modelCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const statusByManuf = finalManufData.map(m => {
    const manufDevices = filtered.filter(d => d.manufacturer === m.name || (m.name === "Outros" && !topManufacturers.some(t => t.name === d.manufacturer)));
    const on = manufDevices.filter(d => d.status === "online").length;
    const off = manufDevices.length - on;
    return { name: m.name, Online: on, Offline: off };
  });

  const manufacturers = useMemo(() => 
    [...new Set(devices.map(d => d.manufacturer))].sort(),
    [devices]
  );

  const handleRefresh = () => {
    setLoading(true);
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8 space-y-8 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-primary/10 p-3 shadow-lg glow-primary">
            <Router className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              NOC — CPE Monitoring
            </h1>
            <p className="text-muted-foreground mt-1">Monitoramento em tempo real da frota CPE</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            className="border-border hover:bg-muted disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <FilterBar
        search={search} onSearchChange={setSearch}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        manufacturerFilter={manufacturerFilter} onManufacturerFilterChange={setManufacturerFilter}
        manufacturers={manufacturers}
      />

      {loading ? (
        <div className="grid lg:grid-cols-3 gap-6 animate-pulse-slow">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-80 glass-card rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard title="Total CPEs" value={total} icon={HardDrive} color="primary" />
            <KpiCard title="Online" value={online} icon={ShieldCheck} color="success" trend="up" />
            <KpiCard title="Offline" value={offline} icon={AlertTriangle} color="destructive" trend="down" />
            <KpiCard title="Disponibilidade" value={`${availability}%`} icon={Activity} color="primary" />
            <KpiCard 
              title="Avg Uptime (dias)" 
              value={devices.length ? (devices.reduce((sum, d) => sum + (Number(d.uptime) || 0), 0) / devices.length / 86400).toFixed(1) : "—"} 
              icon={Clock} 
              color="accent" 
            />
            <KpiCard title="Dual-Stack %" value={`${ipStats.dualPercent}%`} icon={Cpu} color="success" />
          </div>

          {/* Alerta Offline */}
          {offline > 5 && (
            <div className="glass-card p-4 rounded-xl border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-3 shadow-lg glow-primary">
              <AlertTriangle className="h-6 w-6 flex-shrink-0" />
              <span className="font-medium">
                Atenção: {offline} CPEs offline ({((offline/total)*100).toFixed(1)}% da frota)
              </span>
            </div>
          )}

          {/* Gráficos Principais */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-3 text-foreground">
                <Wifi className="h-6 w-6 text-success" /> Status da Frota
              </h2>
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}
                    outerRadius={140}
                    label={renderCustomizedLabel}
                    labelLine={false}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ paddingTop: 16 }} />
                  <text x="50%" y="50%" dy={8} textAnchor="middle" fill="currentColor" fontSize={32} fontWeight={800}>
                    {availability}%
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 text-foreground">Status por Fabricante</h2>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={statusByManuf} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} fontSize={12} stroke="currentColor" />
                  <YAxis stroke="currentColor" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" wrapperStyle={{ color: 'currentColor' }} />
                  <Bar dataKey="Online" fill={CHART_COLORS.online} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Offline" fill={CHART_COLORS.offline} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição e Modelos */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 text-foreground">Distribuição por Fabricante</h2>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={finalManufData} layout="vertical" margin={{ top: 5, right: 40, left: 160, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.2} horizontal={false} />
                  <XAxis type="number" stroke="currentColor" />
                  <YAxis type="category" dataKey="name" fontSize={13} stroke="currentColor" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" fill={CHART_COLORS.primary} radius={[0, 6, 6, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 text-foreground">Modelos Mais Comuns</h2>
              <ResponsiveContainer width="100%" height={360}>
                <Treemap
                  data={modelData.map((d, i) => ({ ...d, fill: CHART_COLORS.models[i % CHART_COLORS.models.length] }))}
                  dataKey="value"
                  aspectRatio={4 / 3}
                >
                  <Tooltip content={<CustomTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>

          {/* IP Stack */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-3 text-foreground">
                <Wifi className="h-6 w-6 text-primary" /> Configuração IP WAN
              </h2>
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={ipStats.ipStackData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={130}
                    label={renderCustomizedLabel}
                    labelLine={false}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {ipStats.ipStackData.map((entry, index) => <Cell key={`cell-ip-${index}`} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ paddingTop: 16 }} />
                  <text x="50%" y="50%" dy={8} textAnchor="middle" fill="currentColor" fontSize={28} fontWeight={800}>
                    {ipStats.dualPercent}%
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 text-foreground">Quantidade por Tipo de Stack IP</h2>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={ipStats.ipStackData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} interval={0} fontSize={12} stroke="currentColor" />
                  <YAxis stroke="currentColor" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* VLANs */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-3 text-foreground">
                <Activity className="h-6 w-6 text-warning" /> VLAN Configurada
              </h2>
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Com VLAN", value: vlanStats.configured, fill: CHART_COLORS.warning },
                      { name: "Sem VLAN", value: total - vlanStats.configured, fill: "hsl(var(--muted))" },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}
                    outerRadius={140}
                    label={renderCustomizedLabel}
                    labelLine={false}
                    paddingAngle={4}
                    dataKey="value"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }} />
                  <text x="50%" y="50%" dy={8} textAnchor="middle" fill="currentColor" fontSize={32} fontWeight={800}>
                    {vlanStats.configPercent}%
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-xl p-6 shadow-xl">
              <h2 className="text-xl font-semibold mb-6 text-foreground">Distribuição por VLAN (Top + Outras)</h2>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={vlanStats.vlanPieData}
                  layout="vertical"
                  margin={{ top: 5, right: 40, left: 160, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.2} horizontal={false} />
                  <XAxis type="number" stroke="currentColor" />
                  <YAxis type="category" dataKey="name" fontSize={13} stroke="currentColor" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill={CHART_COLORS.warning} radius={[0, 6, 6, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lista Recente */}
          <div className="glass-card rounded-xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-6 text-foreground">
              Dispositivos Recentes (Top 15 de {filtered.length} carregados)
            </h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {filtered.slice(0, 15).map(d => (
                <div 
                  key={d.id} 
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer glow-primary"
                  onClick={() => {/* opcional: abrir detalhes */}}
                >
                  <div className="flex items-center gap-4">
                    <Server className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="font-semibold font-mono">{d.serialNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {d.manufacturer} • {d.model} • VLAN {d.vlan}
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-4 py-1 rounded-full text-xs font-bold font-mono",
                    d.status === "online" ? "status-online" : "status-offline"
                  )}>
                    {d.status.toUpperCase()}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center py-12 text-muted-foreground">Nenhum dispositivo encontrado</p>
              )}
            </div>
          </div>
        </>
      )}

      <EditDeviceModal
        device={editingDevice}
        type={editType}
        open={!!editingDevice && !!editType}
        onClose={() => { setEditingDevice(null); setEditType(null); }}
        onSave={() => { /* refetch aqui se quiser */ }}
      />
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color, trend }: { title: string; value: string | number; icon: any; color: string; trend?: "up" | "down" }) {
  const colorMap: Record<string, string> = {
    primary:     "text-primary",
    success:     "text-green-500",
    destructive: "text-red-500",
    accent:      "text-accent",
    warning:     "text-yellow-500",
  };
  const iconColorMap: Record<string, string> = {
    primary:     "text-primary/50",
    success:     "text-green-500/50",
    destructive: "text-red-500/50",
    accent:      "text-accent/50",
    warning:     "text-yellow-500/50",
  };
  return (
    <div className="glass-card rounded-xl p-5 shadow-md hover:shadow-lg transition-all glow-primary">
      <div className="flex justify-between items-start">
        <div>
          <p className="info-label">{title}</p>
          <p className={`text-2xl md:text-3xl font-bold mt-2 ${colorMap[color] || "text-foreground"}`}>
            {value}
          </p>
        </div>
        <Icon className={`h-9 w-9 ${iconColorMap[color] || "text-muted-foreground/50"}`} />
      </div>
      {trend && (
        <div className="mt-2 text-xs">
          {trend === "up" ? (
            <span className="text-green-500">↑ Estável</span>
          ) : (
            <span className="text-red-500">↓ Atenção</span>
          )}
        </div>
      )}
    </div>
  );
}