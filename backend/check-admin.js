const db = require('./db');
db.get('SELECT user, password FROM users WHERE user = ?', ['admin'], (err, row) => {
  if (err) {
    console.error('Erro na consulta:', err.message);
  } else if (row) {
    console.log('Usuário encontrado:', row.user);
    console.log('Hash da senha:', row.password);
  } else {
    console.log('Usuário admin não encontrado no banco.');
  }
  db.close();
});