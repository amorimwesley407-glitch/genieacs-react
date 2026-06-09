# Network Companion V4

Painel web para atendimento e gerenciamento remoto de CPEs/ONUs integradas ao GenieACS via TR-069.

O projeto combina um frontend React/Vite com um backend Express. O backend consulta o GenieACS, executa tarefas TR-069, registra auditoria em SQLite e integra com a API do IXC para ajudar na recuperacao de dados PPPoE durante instalacoes e suporte.

## Recursos principais

- Listagem de dispositivos do GenieACS com paginacao, busca e filtros.
- Indicadores de status online/offline, fabricante, modelo, uptime, VLAN, IP e MAC WAN.
- Edicao remota de PPPoE via GenieACS.
- Edicao remota de Wi-Fi 2.4 GHz e 5 GHz.
- Diagnosticos remotos de ping, traceroute e teste de qualidade.
- Historico/auditoria de acoes por dispositivo.
- Exportacao CSV.
- Integracao IXC para localizar PPPoE por MAC/IP do dispositivo.
- Protecao por login JWT e perfis de usuario.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- Backend: Node.js, Express, Axios.
- Banco local: SQLite.
- Integracoes: GenieACS API e IXC Soft API.

## Estrutura

```txt
backend/
  server.js          API principal
  ixcClient.js       Cliente da API IXC
  db.js              Conexao SQLite e tabelas locais
  cadastrousers.js   Rotas de login/cadastro
  admin-users.js     Rotas administrativas

src/
  components/        Componentes de UI e modais
  pages/             Telas principais
  services/          Clientes HTTP do frontend
  types/             Tipos TypeScript
```

## Variaveis de ambiente

Crie um arquivo `.env` na raiz do projeto. Use `.env.example` como base.

```env
GENIEACS_URL=http://SEU_GENIEACS:7557
GENIEACS_USER=usuario
GENIEACS_PASS=senha
PORT=5000

JWT_SECRET=uma_string_longa_e_segura

IXC_BASE_URL=https://seu-ixc.com.br/webservice/v1
IXC_TOKEN=usuario:token

VITE_API_URL=http://localhost:5000
```

Observacoes:

- Nunca versione `.env`.
- `IXC_TOKEN` usa Basic Auth. O backend converte automaticamente `usuario:token` para o header `Authorization: Basic ...`.
- A API IXC tambem envia o header `ixcsoft: listar` para consultas.

## Instalar dependencias

Na raiz do projeto:

```powershell
npm install
```

No backend:

```powershell
cd backend
npm install
```

## Rodar em desenvolvimento

Terminal 1, backend:

```powershell
cd backend
npm run dev
```

Terminal 2, frontend:

```powershell
npm run dev
```

Por padrao:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## Build

```powershell
npm run build
```

## Integracao IXC para PPPoE

No modal de edicao PPPoE, o botao `Buscar IXC` consulta automaticamente usando os dados ja conhecidos do dispositivo:

- MAC WAN
- IP/IPv4

O backend tenta localizar o login Radius/PPPoE no IXC pelos campos:

- `radusuarios.mac`
- `radusuarios.onu_mac`
- `radusuarios.ip`
- `radusuarios.ip_aviso`

Quando encontra um resultado, o tecnico pode clicar nele para preencher usuario e senha PPPoE no formulario. A aplicacao na CPE continua exigindo o clique em `Salvar Alteracoes` e a confirmacao do modal.

O backend ignora resultados genericos `preset@preset`, pois eles nao identificam o cliente real.

## Busca por preset no GenieACS

A busca principal da lista consulta os dados do GenieACS. Para PPPoE, ela cobre caminhos comuns de `WANPPPConnection.Username`, incluindo casos em que o usuario esta em indices como:

```txt
InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.3.Username
```

Isso ajuda a encontrar CPEs que ainda estao com `preset@preset`, mesmo quando o firmware grava o PPPoE fora do indice padrao `WANPPPConnection.1`.

## Seguranca operacional

- Senhas e tokens devem ficar apenas no `.env`.
- Rotas que alteram CPE exigem usuario autenticado e perfil `admin` ou `operator`.
- Acoes sensiveis sao registradas em auditoria local.
- A consulta IXC nao aplica alteracoes automaticamente; ela apenas preenche os campos para confirmacao.

## Comandos uteis

```powershell
npm run build
npm run lint
npm run test
```

```powershell
cd backend
npm start
```
