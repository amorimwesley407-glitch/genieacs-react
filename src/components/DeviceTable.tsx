import { useState } from "react";
import { Edit2, RotateCcw, Eye, EyeOff } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { Device } from "@/types/device";

interface DeviceTableProps {
  devices: Device[];
  onEdit: (device: Device, type: "pppoe" | "wifi") => void;
  onReboot: (device: Device) => void;
  onRowClick?: (device: Device) => void;
  rebootingIds?: Set<string>;
}

export function DeviceTable({
  devices,
  onEdit,
  onReboot,
  onRowClick,
  rebootingIds = new Set(),
}: DeviceTableProps) {
  const [visiblePasswords, setVisiblePasswords] = useState<
    Record<string, { pppoe: boolean; wifi: boolean }>
  >({});

  const togglePassword = (deviceId: string, type: "pppoe" | "wifi") => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [deviceId]: {
        pppoe:
          type === "pppoe"
            ? !prev[deviceId]?.pppoe
            : prev[deviceId]?.pppoe ?? false,
        wifi:
          type === "wifi"
            ? !prev[deviceId]?.wifi
            : prev[deviceId]?.wifi ?? false,
      },
    }));
  };

  // BUG CORRIGIDO: ipv6 pode ser "-" ou curto; .slice(0,16) em string curta
  // causava exibição de "..." desnecessário. Agora só trunca se precisar.
  const truncateIpv6 = (ipv6: string) => {
    if (!ipv6 || ipv6 === "-") return "-";
    return ipv6.length > 16 ? `${ipv6.slice(0, 16)}…` : ipv6;
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Serial</TableHead>
            <TableHead className="font-semibold">Hardversion</TableHead>
            <TableHead className="font-semibold">PPPoE</TableHead>
            <TableHead className="font-semibold">SSID(s)</TableHead>
            <TableHead className="font-semibold">MAC</TableHead>
            <TableHead className="font-semibold">IPv4</TableHead>
            <TableHead className="font-semibold">IPv6</TableHead>
            <TableHead className="font-semibold">VLAN</TableHead>
            <TableHead className="font-semibold">Último informe</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {devices.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={11}
                className="text-center text-muted-foreground py-10"
              >
                Nenhum dispositivo encontrado
              </TableCell>
            </TableRow>
          )}

          {devices.map((device) => (
            <TableRow
              key={device.id}
              className="hover:bg-muted/30 cursor-pointer"
              onClick={() => onRowClick?.(device)}
            >
              <TableCell className="font-mono text-xs">
                {device.serialNumber}
              </TableCell>

              <TableCell className="font-mono text-sm">
                {device.hardversion}
              </TableCell>

              {/* PPPoE */}
              <TableCell>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {device.pppoe.username}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono">
                      {visiblePasswords[device.id]?.pppoe
                        ? device.pppoe.password || "-"
                        : "••••••"}
                    </span>

                    <button
                      aria-label="Mostrar/esconder senha PPPoE"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePassword(device.id, "pppoe");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {visiblePasswords[device.id]?.pppoe ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      aria-label="Editar PPPoE"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(device, "pppoe");
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </TableCell>

              {/* Wi-Fi */}
              <TableCell>
                <div className="space-y-1">
                  <p className="text-xs font-medium">
                    {Array.isArray(device.wifi.ssid)
                      ? device.wifi.ssid.join(", ")
                      : device.wifi.ssid}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono">
                      {visiblePasswords[device.id]?.wifi
                        ? device.wifi.password || "-"
                        : "••••••"}
                    </span>

                    <button
                      aria-label="Mostrar/esconder senha Wi-Fi"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePassword(device.id, "wifi");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {visiblePasswords[device.id]?.wifi ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      aria-label="Editar Wi-Fi"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(device, "wifi");
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </TableCell>

              <TableCell className="font-mono text-xs">
                {device.macAddress}
              </TableCell>

              <TableCell className="font-mono text-xs">
                {device.ipv4 ?? device.ip}
              </TableCell>

              {/* BUG CORRIGIDO: crash se ipv6 for undefined — agora usa truncateIpv6 seguro */}
              <TableCell
                className="font-mono text-xs max-w-[120px] truncate"
                title={device.ipv6}
              >
                {truncateIpv6(device.ipv6)}
              </TableCell>

              <TableCell className="font-mono text-sm">{device.vlan}</TableCell>

              <TableCell className="font-mono text-sm">
                {device.lastInformDate}
              </TableCell>

              <TableCell>
                <StatusBadge status={device.status} />
              </TableCell>

              <TableCell className="text-right">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7"
                  disabled={rebootingIds.has(device.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReboot(device);
                  }}
                >
                  <RotateCcw className={"h-3 w-3 mr-1" + (rebootingIds.has(device.id) ? " animate-spin" : "")} />
                  {rebootingIds.has(device.id) ? "Reiniciando..." : "Reboot"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
