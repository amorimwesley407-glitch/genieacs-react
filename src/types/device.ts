// src/types/device.ts

/**
 * Host conectado na LAN do dispositivo.
 */
export interface ConnectedHost {
  index: number;
  hostname: string;
  ip: string;
  mac: string;
}

/**
 * Dispositivo CPE/ONU/roteador gerenciado pelo GenieACS.
 */
export interface Device {
  id: string;

  // Identificação
  serialNumber: string;
  serial?: string;
  manufacturer: string;
  model?: string;
  produtoclass: string;
  hardversion: string;

  // Status
  status: "online" | "offline" | "rebooting";
  online: boolean;
  events?: string;
  lastInformDate: string;
  uptime: string | number;

  // Rede WAN
  macAddress?: string;
  ip: string;
  ipv4?: string;
  ipv6: string;
  vlan: string;

  // PPPoE
  pppoe: {
    username: string;
    password: string;
  };

  // Wi-Fi
  wifi: {
    ssid?: string | string[];
    ssid2?: string;
    ssid5?: string;
    password: string;
    passwordwifi5g?: string;
  };

  // Hosts conectados na LAN (array normalizado)
  connectedHosts: ConnectedHost[];

  // GPON Optical Power
  gpon_rxpower?: number | null;
  gpon_txpower?: number | null;

  // Wi-Fi stats (sem bytes de tráfego)
  wifi24_channel?: string | number;
  wifi24_signal?: number | null;
  wifi24_clients?: number;
  wifi5_channel?: string | number;
  wifi5_signal?: number | null;
  wifi5_clients?: number;

  // Firmware
  softversion?: string;

  // Campos extras para compatibilidade
  [key: string]: unknown;
}
