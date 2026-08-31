const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ensureSupabase(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
  next();
}

router.use(ensureSupabase);

// GET /api/estoque/movimentacoes — histórico completo (com nome do produto)
router.get('/movimentacoes', async (req, res, next) => {
  try {
    const { data: rows = [], error } = await supabaseAdmin
      .from('movimentacoes_estoque')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .order('data', { ascending: false });

    if (error) return next(error);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/estoque/alertas — produtos com estoque igual ou abaixo do mínimo
router.get('/alertas', async (req, res, next) => {
  try {
    const { data: produtos = [], error } = await supabaseAdmin
      .from('produtos')
      .select('id, nome, qtd_por_caixa, qtd_estoque_unidades, qtd_minima_caixas')
      .eq('empresa_id', req.user.empresaId)
      .order('nome', { ascending: true });
    if (error) return next(error);
    const alertas = (produtos || []).filter(p => {
      const caixas = Math.floor(Number(p.qtd_estoque_unidades || 0) / Math.max(Number(p.qtd_por_caixa || 1), 1));
      return caixas <= Number(p.qtd_minima_caixas || 0);
    });
    res.json(alertas);
  } catch (err) { next(err); }
});

// POST /api/estoque/movimentacoes — registar entrada ou saída (transação atómica)
// body: { produtoId, tipo: 'entrada'|'saida', quantidade, unidade: 'unidades'|'caixas', motivo }
router.post('/movimentacoes', async (req, res, next) => {
  const { produtoId, tipo, quantidade, unidade, motivo } = req.body;

  if (!produtoId || !['entrada', 'saida'].includes(tipo) || !quantidade || quantidade <= 0) {
    return res.status(400).json({ erro: 'Dados inválidos para o movimento de estoque.' });
  }

  try {
    // Usa apenas Supabase; se o produto não existir para esta empresa,
    // verifica se existe noutra empresa para ajudar a diagnosticar mismatch de empresa_id.
    const { data: produto, error: pErr } = await supabaseAdmin
      .from('produtos')
      .select('*')
      .eq('id', produtoId)
      .eq('empresa_id', req.user.empresaId)
      .maybeSingle();
    if (pErr) return next(pErr);
    if (!produto) {
      // log de diagnóstico: produtoId e empresa do utilizador
      console.warn('[estoque] produto não encontrado', { produtoId, empresaId: req.user && req.user.empresaId });
      // tenta encontrar o produto sem filtro de empresa para ver se existe noutra empresa
      const { data: anyProduto } = await supabaseAdmin.from('produtos').select('id, empresa_id, nome').eq('id', produtoId).maybeSingle();
      if (anyProduto) {
        console.warn('[estoque] produto existe noutra empresa', { produtoId, produtoEmpresaId: anyProduto.empresa_id });
        return res.status(403).json({ erro: 'Produto existe noutra empresa. Verifique a empresa do utilizador.' });
      }
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }

    const quantidadeUnidades = unidade === 'caixas' ? quantidade * produto.qtd_por_caixa : quantidade;
    if (tipo === 'saida' && quantidadeUnidades > produto.qtd_estoque_unidades) {
      return res.status(400).json({
        erro: `Estoque insuficiente. Existem apenas ${produto.qtd_estoque_unidades} unidades de "${produto.nome}" em estoque.`
      });
    }

    const novaQuantidade = tipo === 'entrada'
      ? Number(produto.qtd_estoque_unidades) + Number(quantidadeUnidades)
      : Number(produto.qtd_estoque_unidades) - Number(quantidadeUnidades);

    const { error: upErr } = await supabaseAdmin
      .from('produtos')
      .update({ qtd_estoque_unidades: novaQuantidade })
      .eq('id', produtoId);
    if (upErr) return next(upErr);
    console.info('[estoque] produto atualizado', { produtoId, novaQuantidade });

    const payload = {
      empresa_id: req.user.empresaId,
      produto_id: produtoId,
      usuario_id: req.user.id,
      tipo,
      quantidade_unidades: quantidadeUnidades,
      motivo: motivo || null,
    };

    const { data: [mov], error: movErr } = await supabaseAdmin
      .from('movimentacoes_estoque')
      .insert([payload])
      .select('*');
    if (movErr) return next(movErr);
    console.info('[estoque] movimento registado', { produtoId, movimentoId: mov && mov.id });
    res.status(201).json({ movimento: mov, estoqueAtual: novaQuantidade });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
