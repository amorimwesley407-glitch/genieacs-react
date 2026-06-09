/**
 * Teste para diagnóstico remoto (ping, traceroute, speedtest)
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
  if (login.status !== 200) {
    console.log('❌ Login falhou:', login.body);
    return;
  }
  const token = JSON.parse(login.body).token;
  console.log(`   ✅ Token: ${token.slice(0, 20)}...`);

  console.log('\n2️⃣  Ping 8.8.8.8...');
  const ping = await req('POST', '/api/devices/test123/diagnostics/ping', JSON.stringify({ target: '8.8.8.8' }), token);
  console.log(`   Status: ${ping.status}`);
  const pingData = JSON.parse(ping.body);
  console.log(`   Sucesso: ${pingData.success}`);
  console.log(`   Stats: ${JSON.stringify(pingData.stats)}`);

  console.log('\n3️⃣  Traceroute 8.8.8.8...');
  const trace = await req('POST', '/api/devices/test123/diagnostics/traceroute', JSON.stringify({ target: '8.8.8.8' }), token);
  console.log(`   Status: ${trace.status}`);
  const traceData = JSON.parse(trace.body);
  console.log(`   Sucesso: ${traceData.success}`);
  console.log(`   Stats: ${JSON.stringify(traceData.stats)}`);

  console.log('\n4️⃣  Speedtest 8.8.8.8...');
  const speed = await req('POST', '/api/devices/test123/diagnostics/speedtest', JSON.stringify({ target: '8.8.8.8' }), token);
  console.log(`   Status: ${speed.status}`);
  const speedData = JSON.parse(speed.body);
  console.log(`   Sucesso: ${speedData.success}`);
  console.log(`   Stats: ${JSON.stringify(speedData.stats)}`);

  console.log('\n✅ Testes concluídos!');
}

main().catch(console.error);