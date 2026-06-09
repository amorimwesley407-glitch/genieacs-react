import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, LayoutDashboard, Monitor } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

type UserToken = {
  name?: string;
  user?: string;
  role?: string;
};

const UserMenu = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserToken | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser(payload);
    } catch {
      sessionStorage.removeItem("token");
    }
  }, []);

  const handleLogout = () => {
    // Notifica o backend do logout (audit log)
    const token = sessionStorage.getItem("token");
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    sessionStorage.removeItem("token");
    navigate("/login");
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <User className="w-4 h-4" />
          {user.name || user.user}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => navigate("/")}
          className="cursor-pointer flex items-center gap-2"
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/devices")}
          className="cursor-pointer flex items-center gap-2"
        >
          <Monitor className="w-4 h-4" />
          NOC Monitoring
        </DropdownMenuItem>
        {user.role === "admin" && (
          <DropdownMenuItem
            onClick={() => navigate("/admin/users")}
            className="cursor-pointer flex items-center gap-2"
          >
            <User className="w-4 h-4" />
            Gestão de Usuários
          </DropdownMenuItem>
        )}
        <div className="border-t border-border/50 my-1" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 cursor-pointer flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
