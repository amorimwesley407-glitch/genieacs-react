import axios from "axios";

// BUG CORRIGIDO: URL hardcoded "http://localhost:5000" — agora usa variável de ambiente
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
});

export async function getDevices(
  page = 1,
  limit = 50,
  search = "",
  status = "all"
) {
  const response = await api.get("/api/devices", {
    params: { page, limit, search, status },
  });
  return response.data;
}
