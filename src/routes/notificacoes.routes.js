const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json({ total: 0, alertasCriticos: 0, notificacoes: [] });

    const { data: produtos = [] } = await supabaseAdmin
      .from('produtos')
      .select('id, nome, qtd_por_caixa, qtd_estoque_unidades, qtd_minima_caixas')
      .eq('empresa_id', req.user.empresaId);

    const estoqueBaixo = (produtos || []).filter((p) => {
      const caixas = Number(p.qtd_estoque_unidades || 0) / Math.max(Number(p.qtd_por_caixa || 1), 1);
      return caixas <= Number(p.qtd_minima_caixas || 0);
    });

    const { data: clientes = [] } = await supabaseAdmin
      .from('clientes')
      .select('id, nome, saldo_devedor')
      .eq('empresa_id', req.user.empresaId)
      .gt('saldo_devedor', 0);

    const { data: recentes = [] } = await supabaseAdmin
      .from('notificacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .order('criado_em', { ascending: false })
      .limit(15);

    const notificacoes = [
      ...estoqueBaixo.map((p) => ({
        tipo: 'estoque_baixo',
        titulo: `Estoque baixo: ${p.nome}`,
        mensagem: `Restam ${Math.floor(Number(p.qtd_estoque_unidades || 0) / Math.max(Number(p.qtd_por_caixa || 1), 1))} caixa(s).`,
      })),
      ...clientes.map((c) => ({
        tipo: 'cliente_devedor',
        titulo: `${c.nome} tem dívida pendente`,
        mensagem: `Saldo devedor: ${Number(c.saldo_devedor || 0).toFixed(2)} MT`,
      })),
      ...(recentes || []).map((n) => ({ tipo: n.tipo, titulo: n.titulo, mensagem: n.mensagem, criadoEm: n.criado_em, lida: n.lida, id: n.id })),
    ];

    res.json({
      total: notificacoes.length,
      alertasCriticos: estoqueBaixo.length + clientes.length,
      notificacoes,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/lida', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
