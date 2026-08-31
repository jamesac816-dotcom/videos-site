const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT c.*, cb.nome_banco AS conta_bancaria_nome
      FROM cartoes c
      LEFT JOIN contas_bancarias cb ON cb.id = c.conta_bancaria_id
      WHERE c.empresa_id = $1
      ORDER BY c.ativo DESC, c.nome ASC
    `, [req.user.empresaId]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { nome, bancoEmissor, tipo, ultimosDigitos, limite, contaBancariaId } = req.body;
  if (!nome) return res.status(400).json({ erro: 'O nome do cartão é obrigatório.' });
  try {
    const result = await pool.query(
      `INSERT INTO cartoes (empresa_id, nome, banco_emissor, tipo, ultimos_digitos, limite, conta_bancaria_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.empresaId, nome, bancoEmissor || null, tipo || 'Débito', ultimosDigitos || null, limite || null, contaBancariaId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  const { nome, bancoEmissor, tipo, ultimosDigitos, limite, contaBancariaId, ativo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE cartoes SET nome=$1, banco_emissor=$2, tipo=$3, ultimos_digitos=$4, limite=$5,
         conta_bancaria_id=$6, ativo=COALESCE($7,ativo)
       WHERE id=$8 AND empresa_id=$9 RETURNING *`,
      [nome, bancoEmissor, tipo, ultimosDigitos, limite, contaBancariaId || null, ativo, req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Cartão não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM cartoes WHERE id=$1 AND empresa_id=$2 RETURNING id`,
      [req.params.id, req.user.empresaId]
    );
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Cartão não encontrado.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
