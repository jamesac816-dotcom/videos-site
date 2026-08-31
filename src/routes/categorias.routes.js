const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/categorias?tipo=receita|despesa — só as activas, a não ser que incluirInativas=1
router.get('/', async (req, res, next) => {
  const { tipo, incluirInativas } = req.query;
  try {
    const params = [req.user.empresaId];
    let sql = `SELECT * FROM categorias_financeiras WHERE empresa_id = $1`;
    if (tipo) { params.push(tipo); sql += ` AND tipo = $${params.length}`; }
    if (!incluirInativas) sql += ` AND ativo = true`;
    sql += ` ORDER BY tipo, nome ASC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { nome, tipo, cor } = req.body;
  if (!nome || !['receita', 'despesa'].includes(tipo)) {
    return res.status(400).json({ erro: 'Nome e tipo (receita/despesa) são obrigatórios.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO categorias_financeiras (empresa_id, nome, tipo, cor) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.empresaId, nome.trim(), tipo, cor || '#8598AB']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe uma categoria com esse nome para esse tipo.' });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  const { nome, cor, ativo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE categorias_financeiras SET nome=COALESCE($1,nome), cor=COALESCE($2,cor), ativo=COALESCE($3,ativo)
       WHERE id=$4 AND empresa_id=$5 RETURNING *`,
      [nome, cor, ativo, req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Categoria não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE só é permitido se a categoria nunca foi usada em nenhuma transação
// (senão, sugerimos desactivar em vez de apagar, para não perder o histórico)
router.delete('/:id', async (req, res, next) => {
  try {
    const usoResult = await pool.query(
      `SELECT COUNT(*) FROM transacoes t JOIN categorias_financeiras c ON c.nome = t.categoria AND c.tipo = t.tipo
       WHERE c.id = $1 AND t.empresa_id = $2`,
      [req.params.id, req.user.empresaId]
    );
    if (Number(usoResult.rows[0].count) > 0) {
      return res.status(409).json({ erro: 'Esta categoria já foi usada em lançamentos. Desactive-a em vez de a remover.' });
    }
    const result = await pool.query(
      `DELETE FROM categorias_financeiras WHERE id=$1 AND empresa_id=$2 RETURNING id`,
      [req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Categoria não encontrada.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
