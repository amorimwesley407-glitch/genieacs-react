/**
 * Teste final: login + consulta ao histórico
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:5000');
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  console.log('1️⃣  Login...');
  const login = await req('POST', '/auth/login', JSON.stringify({ login: 'admin', password: 'admin123' }));
  console.log(`   Status: ${login.status}`);
  if (login.status !== 200) {
    console.log('   ❌ Login falhou. Use credenciais corretas.');
    console.log('   Resposta:', login.body);
    return;
  }
  const data = JSON.parse(login.body);
  const token = data.token;
  console.log(`   ✅ Token obtido: ${token.slice(0, 20)}...`);

  console.log('\n2️⃣  Testando GET /api/devices/test123/history...');
  const hist = await req('GET', '/api/devices/test123/history', null, token);
  console.log(`   Status: ${hist.status}`);
  console.log(`   Resposta: ${hist.body.slice(0, 200)}...`);

  console.log('\n3️⃣  Testando GET /api/devices/test123/history/genieacs...');
  const genie = await req('GET', '/api/devices/test123/history/genieacs', null, token);
  console.log(`   Status: ${genie.status}`);
  console.log(`   Resposta: ${genie.body.slice(0, 200)}...`);

  console.log('\n✅ Testes concluídos!');
}

main().catch(console.error);