const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcrypt');
const db = new sqlite3.Database('./database.db');

bcrypt.hash('SuaSenhaForte123', 10, (_, hash) => {
  db.run(
    `INSERT OR REPLACE INTO users (user,name,email,password,role,active)
     VALUES ('admin','Administrador','admin@empresa.com',?,?,1)`,
    [hash, 'admin'],
    () => { console.log('Admin criado!'); db.close(); }
  );
});