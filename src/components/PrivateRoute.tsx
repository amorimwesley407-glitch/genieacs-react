import { Navigate } from "react-router-dom";

interface PrivateRouteProps {
  children: JSX.Element;
}

// BUG CORRIGIDO: ler de sessionStorage (coerente com Login.tsx) e validar
// expiração do JWT para não deixar sessão ativa com token vencido.
function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // exp é em segundos; Date.now() em ms
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const token = sessionStorage.getItem("token");

  if (!isTokenValid(token)) {
    sessionStorage.removeItem("token"); // limpa token inválido/expirado
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;
