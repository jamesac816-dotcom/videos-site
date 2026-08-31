const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Actualiza automaticamente o estado para 'Vencido' quando a data de vencimento já passou
async function atualizarVencidos(empresaId) {
  await pool.query(
    `UPDATE contas_pagar SET estado='Vencido'
     WHERE empresa_id=$1 AND estado='Pendente' AND data_vencimento < CURRENT_DATE`,
    [empresaId]
  );
}

router.get('/', async (req, res, next) => {
  try {
    await atualizarVencidos(req.user.empresaId);
    const result = await pool.query(
      `SELECT cp.*, f.nome AS fornecedor_nome
       FROM contas_pagar cp
       LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
       WHERE cp.empresa_id = $1
       ORDER BY cp.data_vencimento ASC NULLS LAST`,
      [req.user.empresaId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { fornecedorId, descricao, valor, dataEmissao, dataVencimento } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'O valor deve ser maior que zero.' });
  try {
    const result = await pool.query(
      `INSERT INTO contas_pagar (empresa_id, fornecedor_id, descricao, valor, data_emissao, data_vencimento)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.empresaId, fornecedorId || null, descricao || null, valor, dataEmissao || null, dataVencimento || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/contas-pagar/:id/pagar — marcar como paga (e opcionalmente lançar a despesa correspondente)
router.patch('/:id/pagar', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const contaResult = await client.query(
      `UPDATE contas_pagar SET estado='Pago' WHERE id=$1 AND empresa_id=$2 RETURNING *`,
      [req.params.id, req.user.empresaId]
    );
    if (contaResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Conta não encontrada.' }); }
    const conta = contaResult.rows[0];

    await client.query(
      `INSERT INTO transacoes (empresa_id, tipo, valor, categoria, descricao, data)
       VALUES ($1, 'despesa', $2, 'Fornecedores', $3, CURRENT_DATE)`,
      [req.user.empresaId, conta.valor, conta.descricao || 'Pagamento a fornecedor']
    );

    await client.query('COMMIT');
    res.json(conta);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM contas_pagar WHERE id=$1 AND empresa_id=$2 RETURNING id`,
      [req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Conta não encontrada.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
