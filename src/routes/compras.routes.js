const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/compras
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, f.nome AS fornecedor_nome,
              json_agg(json_build_object(
                'produtoId', i.produto_id, 'produtoNome', p.nome,
                'quantidade', i.quantidade, 'custoUnitario', i.custo_unitario, 'subtotal', i.subtotal
              )) AS itens
       FROM compras c
       LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
       JOIN itens_compra i ON i.compra_id = c.id
       JOIN produtos p ON p.id = i.produto_id
       WHERE c.empresa_id = $1
       GROUP BY c.id, f.nome
       ORDER BY c.data DESC`,
      [req.user.empresaId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/compras
// body: { fornecedorId, data, itens: [{ produtoId, quantidade, custoUnitario }] }
// Atualiza o estoque e recalcula o custo médio ponderado de cada produto, numa
// única transação, e lança automaticamente uma despesa "Fornecedores".
router.post('/', async (req, res, next) => {
  const { fornecedorId, data, itens } = req.body;
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'A compra deve ter pelo menos um item.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let totalCompra = 0;
    const compraResult = await client.query(
      `INSERT INTO compras (empresa_id, fornecedor_id, usuario_id, total, data)
       VALUES ($1,$2,$3,0, COALESCE($4, CURRENT_DATE)) RETURNING *`,
      [req.user.empresaId, fornecedorId || null, req.user.id, data || null]
    );
    const compra = compraResult.rows[0];

    for (const item of itens) {
      const produtoResult = await client.query(
        `SELECT * FROM produtos WHERE id=$1 AND empresa_id=$2 FOR UPDATE`,
        [item.produtoId, req.user.empresaId]
      );
      if (produtoResult.rows.length === 0) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 });
      const produto = produtoResult.rows[0];

      const subtotal = item.quantidade * item.custoUnitario;
      totalCompra += subtotal;

      const custoMedioNovo = (
        (Number(produto.qtd_estoque_unidades) * Number(produto.preco_compra)) +
        (item.quantidade * item.custoUnitario)
      ) / ((Number(produto.qtd_estoque_unidades) + item.quantidade) || 1);

      await client.query(
        `UPDATE produtos SET qtd_estoque_unidades = qtd_estoque_unidades + $1, preco_compra = $2 WHERE id = $3`,
        [item.quantidade, Math.round(custoMedioNovo * 100) / 100, produto.id]
      );

      await client.query(
        `INSERT INTO itens_compra (compra_id, produto_id, quantidade, custo_unitario, subtotal)
         VALUES ($1,$2,$3,$4,$5)`,
        [compra.id, item.produtoId, item.quantidade, item.custoUnitario, subtotal]
      );

      await client.query(
        `INSERT INTO movimentacoes_estoque (empresa_id, produto_id, usuario_id, tipo, quantidade_unidades, motivo, data)
         VALUES ($1,$2,$3,'entrada',$4,'Compra a fornecedor', COALESCE($5, CURRENT_DATE))`,
        [req.user.empresaId, item.produtoId, req.user.id, item.quantidade, data || null]
      );
    }

    await client.query(`UPDATE compras SET total = $1 WHERE id = $2`, [totalCompra, compra.id]);

    await client.query(
      `INSERT INTO transacoes (empresa_id, tipo, valor, categoria, descricao, data)
       VALUES ($1, 'despesa', $2, 'Fornecedores', 'Compra de mercadoria', COALESCE($3, CURRENT_DATE))`,
      [req.user.empresaId, totalCompra, data || null]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...compra, total: totalCompra });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
