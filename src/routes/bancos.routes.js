const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/bancos — lista as contas bancárias com saldo actual calculado
// (saldo inicial + receitas ligadas a esta conta - despesas ligadas a esta conta)
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT cb.*,
        cb.saldo_inicial +
        COALESCE((SELECT SUM(valor) FROM transacoes WHERE conta_bancaria_id = cb.id AND tipo='receita'), 0) -
        COALESCE((SELECT SUM(valor) FROM transacoes WHERE conta_bancaria_id = cb.id AND tipo='despesa'), 0)
        AS saldo_atual
      FROM contas_bancarias cb
      WHERE cb.empresa_id = $1
      ORDER BY cb.ativo DESC, cb.nome_banco ASC
    `, [req.user.empresaId]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { nomeBanco, numeroConta, titular, tipoConta, saldoInicial } = req.body;
  if (!nomeBanco) return res.status(400).json({ erro: 'O nome do banco é obrigatório.' });
  try {
    const result = await pool.query(
      `INSERT INTO contas_bancarias (empresa_id, nome_banco, numero_conta, titular, tipo_conta, saldo_inicial)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.empresaId, nomeBanco, numeroConta || null, titular || null, tipoConta || 'Conta à Ordem', saldoInicial || 0]
    );
    res.status(201).json({ ...result.rows[0], saldo_atual: result.rows[0].saldo_inicial });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  const { nomeBanco, numeroConta, titular, tipoConta, ativo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE contas_bancarias SET nome_banco=$1, numero_conta=$2, titular=$3, tipo_conta=$4, ativo=COALESCE($5,ativo)
       WHERE id=$6 AND empresa_id=$7 RETURNING *`,
      [nomeBanco, numeroConta, titular, tipoConta, ativo, req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Conta bancária não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM contas_bancarias WHERE id=$1 AND empresa_id=$2 RETURNING id`,
      [req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Conta bancária não encontrada.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
