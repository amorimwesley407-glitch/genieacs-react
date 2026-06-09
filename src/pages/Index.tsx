import { useState, useMemo, useEffect, useCallback } from "react";
import { RefreshCw, ChevronLeft, ChevronRight, Download } from "lucide-react";
import axios from "axios";
import UserMenu from "@/components/UserMenu";
import { exportToCsv, prepareDeviceExportData } from "@/lib/exportCsv";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OfflineNotification } from "@/components/OfflineNotification";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { DeviceTable } from "@/components/DeviceTable";
import { EditDeviceModal } from "@/components/EditDeviceModal";
import { DeviceCard } from "@/components/DeviceCard";
import { Device } from "@/types/device";
import { useToast } from "@/hooks/use-toast";
import { DashboardCharts, type ChartFilter } from "@/components/DashboardCharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Index = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [summaryDevices, setSummaryDevices] = useState<{ manufacturer: string; hardversion: string; online: boolean; uptime: number | null; vlan: string }[]>([]);
  // Lista completa de fabricantes vinda do summary (todos os devices, não só a página atual)
  const [allManufacturers, setAllManufacturers] = useState<string[]>([]);

  const [chartFilter, setChartFilter] = useState<ChartFilter>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0 });
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editType, setEditType] = useState<"pppoe" | "wifi" | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebootingIds, setRebootingIds] = useState<Set<string>>(new Set());
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [rebootTarget, setRebootTarget] = useState<Device | null>(null);

  const { toast } = useToast();

  // Calcula o bucket de uptime efetivo a ser enviado ao servidor
  const effectiveUptime = useMemo(() => {
    if (chartFilter?.type === "uptime") return chartFilter.value;
    return "";
  }, [chartFilter]);

  // effectiveStatus: uptime "Offline" força status=offline, demais vêm da FilterBar
  const effectiveStatus = useMemo(() => {
    if (chartFilter?.type === "uptime" && chartFilter.value === "Offline") return "offline";
    return statusFilter;
  }, [chartFilter, statusFilter]);

  // effectiveManufacturer: vem sempre da FilterBar (filtro de fabricante removido dos gráficos)
  const effectiveManufacturer = useMemo(() => {
    return manufacturerFilter;
  }, [manufacturerFilter]);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);

      const params: Record<string, string | number> = {
        page,
        limit: 50,
        search,
        status: effectiveStatus,
      };

      if (effectiveManufacturer !== "all") {
        params.manufacturer = effectiveManufacturer;
      }

      if (effectiveUptime) {
        params.uptime = effectiveUptime;
      }

      if (chartFilter?.type === "hardversion") {
        params.hardversion = chartFilter.value;
      }

      if (chartFilter?.type === "vlan") {
        params.vlan = chartFilter.value;
      }

      const response = await axios.get(`${API_BASE}/api/devices`, { params });
      const apiDevices: any[] = response.data.devices;

      const mapped: Device[] = apiDevices.map((d) => ({
        id: d.id,
        serialNumber: d.serial || "-",
        manufacturer: d.manufacturer || "-",
        produtoclass: d.produtoclass || "-",
        hardversion: d.hardversion || "-",
        uptime: d.uptime || "-",
        lastInformDate: d.lastInformDate || "-",
        events: d.events || "-",
        model: "-",
        macAddress: d.mac || "-",
        ip: d.ip || "-",
        ipv4: d.ip || "-",
        ipv6: d.ipv6 || "-",
        vlan: d.vlan || "-",
        status: d.online ? "online" : "offline",
        online: !!d.online,
        connectedHosts: Array.isArray(d.connectedHosts) ? d.connectedHosts : [],
        softversion: d.softversion || "-",
        gpon_rxpower: d.gpon_rxpower != null ? Number(d.gpon_rxpower) : null,
        gpon_txpower: d.gpon_txpower != null ? Number(d.gpon_txpower) : null,
        wifi24_channel: d.wifi24_channel || "-",
        wifi24_signal: d.wifi24_signal != null ? Number(d.wifi24_signal) : null,
        wifi24_clients: Number(d.wifi24_clients) || 0,
        wifi5_channel: d.wifi5_channel || "-",
        wifi5_signal: d.wifi5_signal != null ? Number(d.wifi5_signal) : null,
        wifi5_clients: Number(d.wifi5_clients) || 0,
        pppoe: {
          username: d.pppoe || "-",
          password: d.passwordppoe || "",
        },
        wifi: {
          ssid: Array.isArray(d.ssid) ? d.ssid.join(", ") : d.ssid || "-",
          ssid2: d.ssid2 || "-",
          ssid5: d.ssid5 || "-",
          password: d.passwordwifi || "",
          passwordwifi5g: d.passwordwifi5g || "",
        },
      }));

      setDevices(mapped);
      setTotalPages(response.data.pagination.totalPages);
      setStats(response.data.stats);
    } catch {
      toast({
        title: "Erro",
        description: "Falha ao buscar dispositivos do servidor",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, effectiveStatus, effectiveManufacturer, effectiveUptime, chartFilter, toast]);

  // Busca summary de TODOS os devices (sem paginação) para os gráficos e lista de fabricantes
  const fetchSummary = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/devices/summary`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
      });
      const data = response.data.devices || [];
      setSummaryDevices(data);

      // Extrai lista completa de fabricantes para o select da FilterBar
      const mfrs = [
        ...new Set(
          data
            .map((d: any) => d.manufacturer)
            .filter((m: string) => m && m !== "-")
        ),
      ].sort() as string[];
      setAllManufacturers(mfrs);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60_000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  // Filtro server-side em todos os casos — filteredDevices = devices diretamente
  const filteredDevices = devices;

  const handleExport = async () => {
    toast({ title: "Exportando", description: "Buscando todos os dispositivos..." });
    try {
      const token = sessionStorage.getItem("token");
      const params: Record<string, string> = {};
      if (effectiveManufacturer !== "all") params.manufacturer = effectiveManufacturer;

      const response = await axios.get(
        `${API_BASE}/api/devices/export/all`,
        { params, headers: { Authorization: `Bearer ${token}` } }
      );

      const apiDevices: any[] = response.data.devices;

      const mapped = apiDevices.map((d: any) => ({
        serialNumber: d.serialNumber || "-",
        manufacturer: d.manufacturer || "-",
        produtoclass: d.produtoclass || "-",
        hardversion: d.hardversion || "-",
        softversion: d.softversion || "-",
        online: !!d.online,
        ipv4: d.ip || "-",
        ipv6: d.ipv6 || "-",
        macAddress: d.macAddress || "-",
        vlan: d.vlan || "-",
        uptime: d.uptime || "-",
        lastInformDate: d.lastInformDate || "-",
        pppoe: { username: d.pppoe_user || "-" },
        wifi: { ssid2: d.wifi24_ssid || "-", ssid5: d.wifi5_ssid || "-" },
        connectedHosts: [],
        gpon_rxpower: d.gpon_rxpower,
        gpon_txpower: d.gpon_txpower,
        wifi24_clients: d.wifi24_clients || 0,
        wifi5_clients: d.wifi5_clients || 0,
      }));

      const data = prepareDeviceExportData(mapped);
      exportToCsv(data, `dispositivos-${new Date().toISOString().slice(0, 10)}`, {
        serial: "Serial",
        fabricante: "Fabricante",
        modelo: "Modelo",
        hardversion: "Hardware",
        softversion: "Firmware",
        status: "Status",
        ipv4: "IPv4",
        ipv6: "IPv6",
        mac: "MAC",
        vlan: "VLAN",
        uptime: "Uptime",
        ultimo_informe: "Último Informe",
        pppoe_user: "PPPoE",
        wifi_24: "Wi-Fi 2.4GHz",
        wifi_5: "Wi-Fi 5GHz",
        hosts_lan: "Hosts LAN",
        potencia_rx: "RX Power",
        potencia_tx: "TX Power",
        clientes_24: "Cli 2.4G",
        clientes_5: "Cli 5G",
      });
      toast({ title: "Sucesso", description: `Exportados ${mapped.length} dispositivos.` });
    } catch {
      toast({
        title: "Erro",
        description: "Falha ao exportar dispositivos do servidor",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = () => {
    toast({ title: "Atualizando", description: "Buscando dados do servidor..." });
    fetchDevices();
    fetchSummary();
  };

  // Ao clicar no gráfico: aplica chartFilter e reseta página
  const handleChartFilter = (f: ChartFilter) => {
    setChartFilter(f);
    setPage(1);
  };

  // Ao mudar status na FilterBar: limpa chartFilter de uptime (que sobrescreveria o status)
  const handleStatusFilterChange = (v: string) => {
    setChartFilter((prev) => (prev?.type === "uptime" ? null : prev));
    setPage(1);
    setStatusFilter(v);
  };

  // Ao mudar fabricante na FilterBar: não interfere com chartFilter (gráficos não filtram por fabricante mais)
  const handleManufacturerFilterChange = (v: string) => {
    setPage(1);
    setManufacturerFilter(v);
  };

  const handleReboot = (device: Device) => {
    if (!device?.id) return;
    setRebootTarget(device);
    setShowRebootConfirm(true);
  };

  const executeReboot = async () => {
    if (!rebootTarget?.id) return;

    const targetId = rebootTarget.id;
    const targetSerial = rebootTarget.serialNumber;

    setShowRebootConfirm(false);
    setRebootTarget(null);

    setRebootingIds((prev) => new Set(prev).add(targetId));
    setDevices((prev) =>
      prev.map((d) =>
        d.id === targetId ? { ...d, status: "rebooting" as const } : d
      )
    );

    try {
      const response = await fetch(
        `${API_BASE}/api/devices/${encodeURIComponent(targetId)}/reboot`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
        }
      );

      if (response.ok) {
        toast({ title: "Reboot enviado", description: `Dispositivo ${targetSerial} será reiniciado.` });
        setTimeout(() => {
          fetchDevices();
          setRebootingIds((prev) => {
            const next = new Set(prev);
            next.delete(targetId);
            return next;
          });
        }, 90000);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch {
      toast({
        title: "Erro ao rebootar",
        description: "Não foi possível enviar o comando de reboot.",
        variant: "destructive",
      });
      setDevices((prev) =>
        prev.map((d) =>
          d.id === targetId ? { ...d, status: "offline" as const } : d
        )
      );
      setRebootingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const handleDeviceSaved = () => {
    fetchDevices();
    toast({
      title: "Sucesso",
      description: "Configuração enviada com sucesso para o dispositivo.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between">
          <div className="flex gap-3 items-center">
            <img src="/jms-logo.png" alt="JMS Telecom" className="h-10" />
            <div>
              <h1 className="text-xl font-bold">JMS TELECOM</h1>
              <p className="text-xs text-muted-foreground">
                Gerenciador de Dispositivos
              </p>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              title="Exportar todas as CPEs para CSV"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
            <ThemeToggle />
            <OfflineNotification />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <StatsCards
          totalCount={stats.total}
          onlineCount={stats.online}
          offlineCount={stats.offline}
        />

        <DashboardCharts
          devices={summaryDevices.length > 0 ? summaryDevices : devices}
          activeFilter={chartFilter}
          onFilter={handleChartFilter}
        />

        <FilterBar
          search={search}
          onSearchChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
          statusFilter={effectiveStatus}
          onStatusFilterChange={handleStatusFilterChange}
          manufacturerFilter={effectiveManufacturer}
          onManufacturerFilterChange={handleManufacturerFilterChange}
          manufacturers={allManufacturers}
          chartFilterActive={!!chartFilter}
          onClearChartFilter={() => {
            setChartFilter(null);
            setPage(1);
          }}
        />

        {loading ? (
          <p className="text-center text-muted-foreground py-8">
            Carregando dispositivos...
          </p>
        ) : (
          <DeviceTable
            devices={filteredDevices}
            onEdit={(d, t) => {
              setEditingDevice(d);
              setEditType(t);
            }}
            onReboot={handleReboot}
            onRowClick={setSelectedDevice}
            rebootingIds={rebootingIds}
          />
        )}

        <div className="flex justify-between items-center pt-4">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>

          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>

          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próximo <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </main>

      <EditDeviceModal
        device={editingDevice}
        type={editType}
        open={!!editingDevice && !!editType}
        onClose={() => {
          setEditingDevice(null);
          setEditType(null);
        }}
        onSave={handleDeviceSaved}
      />

      <Dialog
        open={!!selectedDevice}
        onOpenChange={(open) => !open && setSelectedDevice(null)}
      >
        <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-2xl font-semibold max-w-5xl mx-auto">
              Detalhes do Dispositivo
            </DialogTitle>
          </DialogHeader>

          <div className="h-[calc(100vh-90px)] overflow-y-auto">
            <div className="max-w-5xl mx-auto px-6 py-4">
              {selectedDevice && (
                <DeviceCard
                  device={selectedDevice}
                  onEdit={(d, t) => {
                    setEditingDevice(d);
                    setEditType(t);
                  }}
                  onReboot={() => handleReboot(selectedDevice)}
                  isRebooting={rebootingIds.has(selectedDevice.id)}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showRebootConfirm} onOpenChange={setShowRebootConfirm}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Tem certeza que deseja rebootar?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação reiniciará o dispositivo{" "}
              <strong>{rebootTarget?.serialNumber || rebootTarget?.id || "desconhecido"}</strong>{" "}
              e poderá causar uma breve interrupção na conexão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeReboot}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Rebootar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
