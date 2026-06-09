const bcrypt = require('bcrypt');

async function verify() {
  const hash = '$2b$10$5bDMlVdUHXdtcy5PoEipI.WylVvhUPsAn5BFVu2OT/L4bgaxqem6e';
  const password = 'admin123';
  
  try {
    const match = await bcrypt.compare(password, hash);
    console.log(`Senha: "${password}"`);
    console.log(`Hash:  "${hash}"`);
    console.log(`Resultado: ${match ? '✅ CORRETO' : '❌ INCORRETO'}`);
  } catch (err) {
    console.error('Erro:', err.message);
  }
}

verify();