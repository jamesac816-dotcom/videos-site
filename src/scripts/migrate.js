// Aplica todos os ficheiros .sql da pasta /migrations, em ordem alfabética.
// Uso: npm run migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  console.log(`A aplicar ${files.length} ficheiro(s) de migração...`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ ${file}`);
    await pool.query(sql);
  }
  console.log('Migração concluída com sucesso.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
