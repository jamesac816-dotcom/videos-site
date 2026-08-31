require('dotenv').config();

const databaseUrl = (process.env.DATABASE_URL || '').trim();

if (!databaseUrl) {
  console.warn('AVISO: DATABASE_URL não configurada. O backend vai arrancar sem acesso direto ao Postgres; as migrações passam a ser manuais no Supabase.');
}

let pool = null;
let hasDb = false;

function emptyQueryResult() {
  return { rows: [], rowCount: 0, command: 'SELECT' };
}

function createNoDbClient() {
  return {
    async query(sql, params) {
      if (typeof sql === 'string' && sql.toUpperCase().includes('BEGIN')) return { rows: [], rowCount: 0 };
      if (typeof sql === 'string' && sql.toUpperCase().includes('COMMIT')) return { rows: [], rowCount: 0 };
      if (typeof sql === 'string' && sql.toUpperCase().includes('ROLLBACK')) return { rows: [], rowCount: 0 };
      return emptyQueryResult();
    },
    release() {},
    end() {},
  };
}

function createNoDbPool() {
  return {
    query: async () => emptyQueryResult(),
    connect: async () => createNoDbClient(),
    on() {},
    end() {},
  };
}

if (databaseUrl) {
  if (databaseUrl.includes('postgresql://postgres:postgresql://')) {
    console.warn('AVISO: DATABASE_URL duplicada/inválida. O sistema continua em modo de segurança sem acesso directo ao Postgres.');
    pool = createNoDbPool();
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (!parsed.hostname.includes('supabase.co') && !parsed.hostname.includes('localhost')) {
        console.warn('AVISO: DATABASE_URL aponta para um host fora do Supabase/local. Verifique se está correto.');
      }
    } catch (err) {
      console.warn('AVISO: DATABASE_URL inválida. O sistema continua em modo de segurança sem acesso directo ao Postgres.');
      pool = createNoDbPool();
    }

    try {
      const { Pool } = require('pg');
      const poolConfig = {
        connectionString: databaseUrl,
      };

      if (process.env.DB_SSL === 'true' || databaseUrl.includes('supabase.co')) {
        poolConfig.ssl = { rejectUnauthorized: false };
      }

      pool = new Pool(poolConfig);
      hasDb = true;
      pool.on('error', (err) => {
        console.error('Erro inesperado no pool de ligações do PostgreSQL:', err);
      });
    } catch (error) {
      console.warn('AVISO: Não foi possível carregar o driver PostgreSQL (pg). O sistema continua em modo de segurança sem acesso directo ao Postgres.');
      pool = createNoDbPool();
    }
  }
} else {
  console.warn('AVISO: DATABASE_URL não configurada. O backend vai arrancar sem acesso directo ao Postgres; as migrações passam a ser manuais no Supabase.');
  pool = createNoDbPool();
}

module.exports = {
  pool,
  hasDb,
  query: async (text, params) => {
    if (!pool || typeof pool.query !== 'function') return emptyQueryResult();
    return pool.query(text, params);
  },
  getClient: async () => {
    if (!pool || typeof pool.connect !== 'function') return createNoDbClient();
    return pool.connect();
  },
};
