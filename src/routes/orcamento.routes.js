const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/orcamento?ano=2026 — devolve cada rubrica orçada juntamente com o
// valor realmente movimentado nas Transações do mesmo ano, para calcular o desvio.
router.get('/', async (req, res, next) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  try {
    const orcamentoResult = await pool.query(
      `SELECT * FROM orcamento WHERE empresa_id=$1 AND ano=$2 ORDER BY tipo, rubrica`,
      [req.user.empresaId, ano]
    );

    const linhas = [];
    for (const linha of orcamentoResult.rows) {
      const categorias = (linha.categorias || '').split(',').map(c => c.trim()).filter(Boolean);
      let realizado = 0;
      if (categorias.length) {
        const realizadoResult = await pool.query(
          `SELECT COALESCE(SUM(valor),0) AS total FROM transacoes
           WHERE empresa_id=$1 AND tipo=$2 AND categoria = ANY($3) AND date_part('year', data)=$4`,
          [req.user.empresaId, linha.tipo, categorias, ano]
        );
        realizado = Number(realizadoResult.rows[0].total);
      }
      const orcado = Number(linha.valor_orcado);
      linhas.push({
        ...linha,
        realizado,
        desvioValor: Math.round((realizado - orcado) * 100) / 100,
        desvioPercentual: orcado !== 0 ? Math.round(((realizado - orcado) / orcado) * 10000) / 100 : null
      });
    }
    res.json(linhas);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { rubrica, tipo, categorias, valorOrcado, ano } = req.body;
  if (!rubrica || !['receita', 'despesa'].includes(tipo)) {
    return res.status(400).json({ erro: 'Rubrica e tipo (receita/despesa) são obrigatórios.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO orcamento (empresa_id, rubrica, tipo, categorias, valor_orcado, ano)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6, date_part('year', CURRENT_DATE)))
       ON CONFLICT (empresa_id, rubrica, ano) DO UPDATE SET
         tipo = EXCLUDED.tipo, categorias = EXCLUDED.categorias, valor_orcado = EXCLUDED.valor_orcado
       RETURNING *`,
      [req.user.empresaId, rubrica, tipo, categorias || null, valorOrcado || 0, ano || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM orcamento WHERE id=$1 AND empresa_id=$2 RETURNING id`,
      [req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Rubrica não encontrada.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
