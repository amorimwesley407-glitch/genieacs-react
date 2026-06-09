import React from "react";
import { useState } from "react";
import {
  Wifi, RotateCcw, Edit2, Eye, EyeOff, Network, Globe, Clock,
  MonitorSmartphone, Router, EthernetPort, MemoryStick,
  Cpu, Shield, Server, Zap, History, Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "./StatusBadge";
import { DeviceHistory } from "./DeviceHistory";
import { DeviceDiagnostics } from "./DeviceDiagnostics";
import { Device } from "@/types/device";

interface DeviceCardProps {
  device: Device;
  onEdit: (device: Device, type: "pppoe" | "wifi") => void;
  onReboot: (device: Device) => void;
  isRebooting?: boolean;
}

function formatUptime(seconds?: number | string): string {
  const s = Number(seconds);
  if (!s || isNaN(s)) return "-";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {value != null && value !== "-" && value !== "" ? String(value) : <span className="text-muted-foreground/40">—</span>}
      </span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.FC<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function UptimeBar({ uptimeSeconds }: { uptimeSeconds: number }) {
  const max = 30 * 86400;
  const pct = Math.min(100, Math.round((uptimeSeconds / max) * 100));
  const color = pct > 70 ? "hsl(142,71%,45%)" : pct > 30 ? "hsl(38,92%,50%)" : "hsl(0,72%,51%)";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Estabilidade (30d)</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function PasswordField({ value, label }: { value?: string; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-foreground">
          {show ? (value || "—") : "••••••••"}
        </span>
        <button onClick={() => setShow(!show)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Esconder" : "Mostrar"}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function DeviceCard({ device, onEdit, onReboot, isRebooting = false }: DeviceCardProps) {
  const displayedStatus = isRebooting ? "rebooting" : device.status;
  const uptimeSec = Number(device.uptime);

  const activeHosts = Array.isArray(device.connectedHosts)
    ? device.connectedHosts.filter(h =>
        (h.hostname && h.hostname !== "-") || (h.ip && h.ip !== "-") || (h.mac && h.mac !== "-"))
    : [];

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative rounded-xl overflow-hidden border border-border/50 bg-gradient-to-br from-primary/5 via-card to-card p-5">
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="relative flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Router className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{device.manufacturer || "Desconhecido"}</h2>
              <p className="text-sm text-muted-foreground font-mono">{device.produtoclass || device.model || "-"}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">S/N: {device.serialNumber}</p>
            </div>
          </div>

          <div className="ml-auto flex flex-col items-end gap-2">
            <StatusBadge status={displayedStatus} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono font-medium">{formatUptime(uptimeSec)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Informado: {device.lastInformDate || "-"}
            </p>
          </div>
        </div>

        {!isNaN(uptimeSec) && uptimeSec > 0 && (
          <div className="relative mt-4"><UptimeBar uptimeSeconds={uptimeSec} /></div>
        )}

        <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: Globe, label: "IPv4", value: device.ipv4 ?? device.ip, mono: true },
            { icon: EthernetPort, label: "VLAN", value: device.vlan, mono: true },
            { icon: MemoryStick, label: "MAC WAN", value: device.macAddress, mono: true },
            { icon: Cpu, label: "HW Ver", value: device.hardversion },
          ].map(({ icon: Icon, label, value, mono }) => (
            <div key={label} className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
              <div className="flex items-center gap-1 mb-1">
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
              </div>
              <p className={`text-xs font-medium text-foreground truncate ${mono ? "font-mono" : ""}`}>
                {value && value !== "-" ? value : <span className="text-muted-foreground/40">—</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="network">
        <TabsList className="w-full grid grid-cols-5 h-9">
          <TabsTrigger value="network" className="text-xs gap-1.5">
            <Globe className="h-3.5 w-3.5" />Rede
          </TabsTrigger>
          <TabsTrigger value="wifi" className="text-xs gap-1.5">
            <Wifi className="h-3.5 w-3.5" />Wi-Fi
          </TabsTrigger>
          <TabsTrigger value="hosts" className="text-xs gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5" />
            Hosts{activeHosts.length > 0 && <span className="ml-0.5 font-bold text-primary">({activeHosts.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Diagnóstico
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <History className="h-3.5 w-3.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* REDE */}
        <TabsContent value="network" className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="border-border/50">
              <CardContent className="p-4">
                <SectionTitle icon={Globe} title="WAN / Internet" />
                <InfoRow label="IPv4" value={device.ipv4 ?? device.ip} mono />
                <InfoRow label="IPv6" value={device.ipv6 !== "-" ? device.ipv6 : null} mono />
                <InfoRow label="MAC WAN" value={device.macAddress} mono />
                <InfoRow label="VLAN" value={device.vlan} mono />
                {(device.gpon_rxpower != null || device.gpon_txpower != null) && (
                  <>
                    {device.gpon_rxpower != null && (
                      <InfoRow label="RX Power" value={`${device.gpon_rxpower} dBm`} mono />
                    )}
                    {device.gpon_txpower != null && (
                      <InfoRow label="TX Power" value={`${device.gpon_txpower} dBm`} mono />
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle icon={Network} title="PPPoE" />
                  <Button variant="ghost" size="sm" onClick={() => onEdit(device, "pppoe")} className="h-7 px-2 -mt-3">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <InfoRow label="Usuário" value={device.pppoe?.username} mono />
                <PasswordField value={device.pppoe?.password} label="Senha" />

                <div className="mt-4">
                  <SectionTitle icon={Server} title="Dispositivo" />
                  <InfoRow label="Fabricante" value={device.manufacturer} />
                  <InfoRow label="Modelo" value={device.produtoclass} />
                  <InfoRow label="Hardware" value={device.hardversion} mono />
                  <InfoRow label="Firmware" value={device.softversion} mono />
                  <InfoRow label="Serial" value={device.serialNumber} mono />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* WI-FI */}
        <TabsContent value="wifi" className="mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle icon={Wifi} title="Wi-Fi 2.4 GHz" />
                  <Button variant="ghost" size="sm" onClick={() => onEdit(device, "wifi")} className="h-7 px-2 -mt-3">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <InfoRow label="SSID" value={device.wifi?.ssid2} />
                <PasswordField value={device.wifi?.password} label="Senha" />
                <InfoRow label="Canal" value={device.wifi24_channel} mono />
                <InfoRow label="Clientes" value={device.wifi24_clients} />
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle icon={Zap} title="Wi-Fi 5 GHz" />
                  <Button variant="ghost" size="sm" onClick={() => onEdit(device, "wifi")} className="h-7 px-2 -mt-3">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <InfoRow label="SSID" value={device.wifi?.ssid5} />
                <PasswordField value={device.wifi?.passwordwifi5g} label="Senha" />
                <InfoRow label="Canal" value={device.wifi5_channel} mono />
                <InfoRow label="Clientes" value={device.wifi5_clients} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* HOSTS */}
        <TabsContent value="hosts" className="mt-3">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <SectionTitle icon={MonitorSmartphone} title={`Dispositivos Conectados (${activeHosts.length})`} />
              {activeHosts.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <MonitorSmartphone className="h-10 w-10 text-muted-foreground/25 mx-auto" />
                  <p className="text-sm text-muted-foreground">Nenhum host detectado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeHosts.map((host) => (
                    <div key={host.index}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors">
                      <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
                        <MonitorSmartphone className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1 grid grid-cols-3 gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">Hostname</p>
                          <p className="text-xs font-mono truncate">{host.hostname || "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">IP</p>
                          <p className="text-xs font-mono">{host.ip || "—"}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground">MAC</p>
                          <p className="text-xs font-mono truncate">{host.mac || "—"}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DIAGNÓSTICO */}
        <TabsContent value="diagnostics" className="mt-3">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <DeviceDiagnostics
                deviceId={device.id}
                deviceIp={device.ip || device.ipv4}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTÓRICO */}
        <TabsContent value="history" className="mt-3">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <DeviceHistory deviceId={device.id} deviceSerial={device.serialNumber} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>{device.softversion && device.softversion !== "-" ? `FW ${device.softversion}` : "Firmware desconhecido"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(device, "wifi")} className="h-8 gap-1.5 text-xs">
            <Edit2 className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button
            variant={isRebooting ? "outline" : "destructive"} size="sm"
            onClick={() => onReboot(device)} disabled={isRebooting}
            className="h-8 min-w-[110px] gap-1.5 text-xs">
            <RotateCcw className={`h-3.5 w-3.5 ${isRebooting ? "animate-spin" : ""}`} />
            {isRebooting ? "Reiniciando..." : "Reboot"}
          </Button>
        </div>
      </div>
    </div>
  );
}