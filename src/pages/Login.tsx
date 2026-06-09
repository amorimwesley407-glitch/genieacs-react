import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";

// BUG CORRIGIDO: URL hardcoded — agora usa variável de ambiente
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe usuário/email e senha",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Falha no login",
          description: data.error || "Credenciais inválidas",
          variant: "destructive",
        });
        return;
      }

      // BUG CORRIGIDO: localStorage persiste o token mesmo após fechar o navegador.
      // sessionStorage limpa automaticamente ao fechar a aba/janela.
      sessionStorage.setItem("token", data.token);

      toast({
        title: "Login realizado",
        description: "Autenticação efetuada com sucesso",
      });

      navigate("/");
    } catch {
      toast({
        title: "Erro de servidor",
        description: "Não foi possível conectar à API",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-sm glass-card glow-primary">
          <CardHeader className="space-y-2 text-center">
            <img src="/jms-logo.png" alt="JMS Telecom" className="h-12 mx-auto" />
            <CardTitle className="text-xl font-bold">JMS TELECOM</CardTitle>
            <p className="text-sm text-muted-foreground">Acesso ao sistema</p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="login">Email ou usuário</Label>
                <Input
                  id="login"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email ou usuário"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                />
              </div>

              <Button className="w-full" type="submit">
                Entrar
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="text-sm text-primary hover:underline"
                >
                  Criar conta
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
