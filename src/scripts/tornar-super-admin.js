// Promove um utilizador já registado a "super_admin".
// Uso (a partir da pasta do backend, com o .env já configurado):
//   node src/scripts/tornar-super-admin.js email@doutilizador.com
//
// O utilizador tem de já existir (ou seja, tem de ter feito o registo/onboarding
// normal no sistema pelo menos uma vez) antes de correr este script.
require('dotenv').config();
const { pool } = require('../db');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Uso: node src/scripts/tornar-super-admin.js email@doutilizador.com');
    process.exit(1);
  }

  const result = await pool.query(
    `UPDATE usuarios SET papel = 'super_admin' WHERE email = $1 RETURNING id, nome, email, papel`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    console.error(`Nenhum utilizador encontrado com o e-mail "${email}". Registe-se primeiro no sistema normalmente, depois corra este script.`);
  } else {
    console.log('Utilizador promovido a super_admin com sucesso:', result.rows[0]);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Erro ao promover utilizador:', err);
  process.exit(1);
});
