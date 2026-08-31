const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/irps/escaloes — lista os escalões configurados pelo contabilista
router.get('/escaloes', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM irps_escaloes WHERE empresa_id=$1 ORDER BY ordem ASC`,
      [req.user.empresaId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// PUT /api/irps/escaloes — substitui a tabela completa de escalões (o contabilista
// edita tudo de uma vez: limite inferior, limite superior, taxa e parcela a abater)
router.put('/escaloes', async (req, res, next) => {
  const { escaloes } = req.body;
  if (!Array.isArray(escaloes)) return res.status(400).json({ erro: 'Lista de escalões inválida.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM irps_escaloes WHERE empresa_id=$1`, [req.user.empresaId]);
    for (let i = 0; i < escaloes.length; i++) {
      const e = escaloes[i];
      await client.query(
        `INSERT INTO irps_escaloes (empresa_id, ordem, limite_inferior, limite_superior, taxa, parcela_abater)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.user.empresaId, i + 1, e.limiteInferior || 0, e.limiteSuperior || null, e.taxa || 0, e.parcelaAbater || 0]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query(`SELECT * FROM irps_escaloes WHERE empresa_id=$1 ORDER BY ordem ASC`, [req.user.empresaId]);
    res.json(result.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/irps/calcular — calcula o IRPS mensal de uma base tributável, usando
// os escalões configurados (fórmula: base × taxa do escalão − parcela a abater)
router.post('/calcular', async (req, res, next) => {
  const { baseIrps } = req.body;
  const base = Number(baseIrps) || 0;
  try {
    const result = await pool.query(
      `SELECT * FROM irps_escaloes WHERE empresa_id=$1 ORDER BY ordem ASC`,
      [req.user.empresaId]
    );
    if (result.rows.length === 0) {
      return res.json({ irps: 0, aviso: 'Nenhum escalão de IRPS configurado. Configure em Módulo Empresarial > Folha de Salários.' });
    }
    const escalao = result.rows.find(e =>
      base >= Number(e.limite_inferior) && (e.limite_superior === null || base <= Number(e.limite_superior))
    );
    if (!escalao) return res.json({ irps: 0, aviso: 'Base tributável fora de todos os escalões configurados.' });

    const irps = Math.max(0, base * Number(escalao.taxa) - Number(escalao.parcela_abater));
    res.json({ irps: Math.round(irps * 100) / 100, escalaoAplicado: escalao });
  } catch (err) { next(err); }
});

module.exports = router;
