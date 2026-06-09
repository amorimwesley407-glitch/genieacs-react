const bcrypt = require('bcrypt');
const db = require('./db');

async function reset() {
  const password = 'admin123';
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('UPDATE users SET password = ? WHERE user = ?', [hash, 'admin'], (err) => {
      if (err) {
        console.error('❌ Erro ao atualizar senha:', err.message);
      } else {
        console.log('✅ Senha do admin resetada para: admin123');
      }
      db.close();
    });
  } catch (err) {
    console.error('❌ Erro no bcrypt:', err.message);
  }
}

reset();