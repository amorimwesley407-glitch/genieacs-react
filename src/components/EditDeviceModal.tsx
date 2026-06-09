import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Device } from "@/types/device";
import { Network, Wifi, Eye, EyeOff, Search, Loader2, Check } from "lucide-react";

// BUG CORRIGIDO: API_BASE estava declarada dentro do handler (escopo errado);
// movida para o topo do módulo.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function isValidLookupMac(value?: string) {
  const clean = String(value || "").replace(/[^a-fA-F0-9]/g, "");
  return clean.length === 12 || clean.length === 16;
}

function isValidLookupIp(value?: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || "").trim());
}

interface IxcPppoeUser {
  id?: string;
  customerId?: string;
  username: string;
  password?: string;
  planId?: string;
  vlan?: string;
  mac?: string;
  onuMac?: string;
  status?: string;
}

interface EditDeviceModalProps {
  device: Device | null;
  type: "pppoe" | "wifi" | null;
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function EditDeviceModal({
  device,
  type,
  open,
  onClose,
  onSave,
}: EditDeviceModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordwifi5g, setPasswordwifi5g] = useState("");
  const [ssid2, setSsid2] = useState("");
  const [ssid5, setSsid5] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordwifi5g, setShowPasswordwifi5g] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ixcLoading, setIxcLoading] = useState(false);
  const [ixcUsers, setIxcUsers] = useState<IxcPppoeUser[]>([]);
  const [ixcMessage, setIxcMessage] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!device || !type) return;

    setErrorMessage(null);

    if (type === "pppoe") {
      const pppoe = device.pppoe;
      let userValue = "";
      let passValue = "";

      if (pppoe && typeof pppoe === "object" && !Array.isArray(pppoe)) {
        userValue =
          (pppoe as any).username ||
          (pppoe as any).user ||
          "";
        passValue =
          (pppoe as any).password ||
          (pppoe as any).senha ||
          "";
      } else if (typeof pppoe === "string") {
        userValue = pppoe;
      }

      setUsername(userValue);
      setPassword(passValue);
      setIxcUsers([]);
      setIxcMessage(null);
    } else {
      setSsid2(device.wifi?.ssid2 || "");
      setSsid5(device.wifi?.ssid5 || "");
      setPassword(device.wifi?.password || "");
      setPasswordwifi5g(device.wifi?.passwordwifi5g || "");
    }
  }, [device, type]);

  const handleAttemptSave = () => {
    setErrorMessage(null);
    setShowConfirmDialog(true);
  };

  const handleSearchIxc = async () => {
    const mac = device?.macAddress || "";
    const ip = device?.ipv4 || device?.ip || "";

    if (!isValidLookupMac(mac) && !isValidLookupIp(ip)) {
      setIxcMessage("Este dispositivo nao tem MAC ou IP valido para consultar no IXC.");
      return;
    }

    setIxcLoading(true);
    setIxcMessage(null);
    setIxcUsers([]);

    try {
      const params = new URLSearchParams({
        limit: "5",
      });
      if (isValidLookupMac(mac)) params.set("mac", mac);
      if (isValidLookupIp(ip)) params.set("ip", ip);

      const res = await fetch(
        `${API_BASE}/api/ixc/pppoe?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          },
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Falha ao consultar PPPoE no IXC");
      }

      const users = Array.isArray(data.users) ? data.users : [];
      setIxcUsers(users);
      if (users.length === 0) {
        setIxcMessage("Nenhum PPPoE encontrado para o MAC/IP deste dispositivo no IXC.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Nao foi possivel consultar o IXC.";
      setIxcMessage(message);
    } finally {
      setIxcLoading(false);
    }
  };

  const handleUseIxcUser = (user: IxcPppoeUser) => {
    setUsername(user.username || "");
    setPassword(user.password || "");
    setIxcMessage("Dados preenchidos a partir do IXC. Confirme antes de salvar.");
  };

  const handleConfirmedSave = async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    setErrorMessage(null);

    try {
      if (type === "pppoe") {
        if (!username.trim() || !password.trim()) {
          setErrorMessage("Usuário e senha PPPoE são obrigatórios.");
          return;
        }

        const res = await fetch(
          `${API_BASE}/api/devices/${encodeURIComponent(device!.id)}/pppoe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionStorage.getItem("token")}`,
            },
            body: JSON.stringify({ username, password }),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Falha ao atualizar PPPoE");
        }
      } else {
        const has24 = ssid2.trim() && password.trim();
        const has5 = ssid5.trim() && passwordwifi5g.trim();

        if (!has24 && !has5) {
          setErrorMessage("Preencha pelo menos uma banda com SSID e senha.");
          return;
        }

        const body: Record<string, string> = {};
        if (has24) {
          body.ssid2 = ssid2.trim();
          body.password = password.trim();
        }
        if (has5) {
          body.ssid5 = ssid5.trim();
          body.passwordwifi5g = passwordwifi5g.trim();
        }

        const res = await fetch(
          `${API_BASE}/api/devices/${encodeURIComponent(device!.id)}/wifi`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionStorage.getItem("token")}`,
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Falha ao atualizar Wi-Fi");
        }
      }

      onSave?.();
      setShowSuccessDialog(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Não foi possível salvar as alterações.";
      // BUG CORRIGIDO: usava alert() — substituído por mensagem de erro inline
      setErrorMessage(`Erro: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessDialog(false);
    onClose();
  };

  const isPppoe = type === "pppoe";
  const Icon = isPppoe ? Network : Wifi;
  const title = isPppoe ? "Editar PPPoE" : "Editar WiFi";
  const lookupMac = device?.macAddress || "";
  const lookupIp = device?.ipv4 || device?.ip || "";
  const canSearchIxc = isValidLookupMac(lookupMac) || isValidLookupIp(lookupIp);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-blue-500" />
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isPppoe ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário PPPoE</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="usuario@provedor.com"
                    className="font-mono"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  <Label>Consulta IXC</Label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {isValidLookupMac(lookupMac) && (
                      <span className="rounded border border-border bg-muted px-2 py-1 font-mono">
                        MAC {lookupMac}
                      </span>
                    )}
                    {isValidLookupIp(lookupIp) && (
                      <span className="rounded border border-border bg-muted px-2 py-1 font-mono">
                        IP {lookupIp}
                      </span>
                    )}
                    {!canSearchIxc && (
                      <span className="text-muted-foreground">
                        MAC/IP indisponivel para consulta.
                      </span>
                    )}
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSearchIxc}
                      disabled={loading || ixcLoading || !canSearchIxc}
                      className="w-full"
                    >
                      {ixcLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      <span className="ml-2">Buscar IXC</span>
                    </Button>
                  </div>

                  {ixcUsers.length > 0 && (
                    <div className="space-y-2">
                      {ixcUsers.map((user) => (
                        <button
                          key={`${user.id || user.username}-${user.customerId || ""}`}
                          type="button"
                          onClick={() => handleUseIxcUser(user)}
                          className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                          disabled={loading}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-mono">
                              {user.username || "-"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              Cliente {user.customerId || "-"}
                              {user.planId ? ` | Plano ${user.planId}` : ""}
                              {user.vlan && user.vlan !== "0" ? ` | VLAN ${user.vlan}` : ""}
                              {user.mac ? ` | MAC ${user.mac}` : ""}
                              {user.onuMac ? ` | ONU ${user.onuMac}` : ""}
                            </span>
                          </span>
                          <Check className="h-4 w-4 shrink-0 text-green-600" />
                        </button>
                      ))}
                    </div>
                  )}

                  {ixcMessage && (
                    <p className="text-xs text-muted-foreground">{ixcMessage}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password-pppoe">Senha PPPoE</Label>
                  <div className="relative">
                    <Input
                      id="password-pppoe"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 font-mono"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      aria-label="Mostrar/esconder senha"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      disabled={loading}
                    >
                      {showPassword ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ssid2">SSID 2.4 GHz</Label>
                  <Input
                    id="ssid2"
                    value={ssid2}
                    onChange={(e) => setSsid2(e.target.value)}
                    placeholder="MinhaRede"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password-24g">Senha 2.4 GHz</Label>
                  <div className="relative">
                    <Input
                      id="password-24g"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 font-mono"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      aria-label="Mostrar/esconder senha"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      disabled={loading}
                    >
                      {showPassword ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ssid5">SSID 5 GHz</Label>
                  <Input
                    id="ssid5"
                    value={ssid5}
                    onChange={(e) => setSsid5(e.target.value)}
                    placeholder="MinhaRede-5G"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password-5g">Senha 5 GHz</Label>
                  <div className="relative">
                    <Input
                      id="password-5g"
                      type={showPasswordwifi5g ? "text" : "password"}
                      value={passwordwifi5g}
                      onChange={(e) => setPasswordwifi5g(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 font-mono"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      aria-label="Mostrar/esconder senha 5 GHz"
                      onClick={() => setShowPasswordwifi5g(!showPasswordwifi5g)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      disabled={loading}
                    >
                      {showPasswordwifi5g ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Mensagem de erro inline (substituiu alert()) */}
            {errorMessage && (
              <p className="text-destructive text-sm border border-destructive/30 rounded p-2 bg-destructive/10">
                {errorMessage}
              </p>
            )}

            {device && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm mt-2 border border-border">
                <p>
                  Dispositivo:{" "}
                  <strong>
                    {device.manufacturer} {device.model || ""}
                  </strong>
                </p>
                <p className="font-mono text-xs mt-1 break-all">
                  Serial: {device.serialNumber || device.serial || device.id}
                </p>
                {device.macAddress && device.macAddress !== "—" && device.macAddress !== "-" && (
                  <p className="font-mono text-xs mt-1 break-all">
                    MAC WAN: {device.macAddress}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAttemptSave}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? "Processando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tem certeza que deseja salvar?</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-muted-foreground">
            Essa ação enviará a configuração para o dispositivo e poderá causar
            uma breve interrupção.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmedSave}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Sucesso */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-500">Sucesso!</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-muted-foreground">
            As alterações foram enviadas para o dispositivo. Pode levar alguns
            minutos para aplicar. A conexão pode ficar instável temporariamente.
          </DialogDescription>
          <DialogFooter>
            <Button
              onClick={handleSuccessClose}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
