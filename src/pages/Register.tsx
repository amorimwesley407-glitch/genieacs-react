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

const Register = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleRegister = async () => {
    if (!name || !username || !email || !password || !confirmPassword) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "As senhas digitadas são diferentes",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: username.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Erro no cadastro",
          description: data.error || "Erro ao cadastrar",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Cadastro realizado",
        description: "Usuário criado com sucesso",
      });

      // BUG CORRIGIDO: navigate("/Login") com L maiúsculo — rota não existia
      navigate("/login");
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
            <CardTitle className="text-xl font-bold">Criar Conta</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cadastro de novo usuário
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Nome completo</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>

            <div className="space-y-1">
              <Label>Usuário</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuário de acesso"
              />
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-1">
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite uma senha"
              />
            </div>

            <div className="space-y-1">
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
              />
            </div>

            <Button className="w-full" onClick={handleRegister}>
              Criar conta
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                Voltar para login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
