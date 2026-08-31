const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function calcularTotaisSessao(empresaId, sessaoId) {
  if (!supabaseAdmin) return { entradas: 0, saidas: 0, sangrias: 0, reforcos: 0 };

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: transacoes = [] } = await supabaseAdmin
    .from('transacoes')
    .select('tipo, valor')
    .eq('empresa_id', empresaId)
    .eq('data', hoje);

  let entradas = 0;
  let saidas = 0;
  (transacoes || []).forEach((row) => {
    if (row.tipo === 'receita') entradas += Number(row.valor || 0);
    if (row.tipo === 'despesa') saidas += Number(row.valor || 0);
  });

  const { data: movimentos = [] } = await supabaseAdmin
    .from('caixa_movimentos')
    .select('tipo, valor')
    .eq('caixa_sessao_id', sessaoId);

  let sangrias = 0;
  let reforcos = 0;
  (movimentos || []).forEach((row) => {
    if (row.tipo === 'sangria') sangrias += Number(row.valor || 0);
    if (row.tipo === 'reforco') reforcos += Number(row.valor || 0);
  });

  return { entradas, saidas, sangrias, reforcos };
}

router.get('/atual', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json(null);

    const { data: sessao, error: sessaoError } = await supabaseAdmin
      .from('caixa_sessoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('status', 'aberto')
      .maybeSingle();

    if (sessaoError) throw sessaoError;
    if (!sessao) return res.json(null);

    const { entradas, saidas, sangrias, reforcos } = await calcularTotaisSessao(req.user.empresaId, sessao.id);
    const saldoEsperado = Number(sessao.saldo_inicial || 0) + entradas - saidas - sangrias + reforcos;

    const { data: movimentos = [], error: movimentosError } = await supabaseAdmin
      .from('caixa_movimentos')
      .select('*, usuarios(nome)')
      .eq('caixa_sessao_id', sessao.id)
      .order('criado_em', { ascending: false });

    if (movimentosError) throw movimentosError;

    res.json({ ...sessao, entradas, saidas, sangrias, reforcos, saldoEsperado, movimentosCaixa: movimentos || [] });
  } catch (err) {
    next(err);
  }
});

router.get('/historico', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('caixa_sessoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('status', 'fechado')
      .order('fechado_em', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.post('/abrir', async (req, res, next) => {
  const { saldoInicial } = req.body;
  if (saldoInicial == null || saldoInicial < 0) return res.status(400).json({ erro: 'Saldo inicial inválido.' });
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('caixa_sessoes')
      .insert({
        empresa_id: req.user.empresaId,
        usuario_abertura_id: req.user.id,
        saldo_inicial: Number(saldoInicial),
        status: 'aberto',
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/sangria', async (req, res, next) => {
  await registarMovimentoCaixa(req, res, next, 'sangria');
});

router.post('/reforco', async (req, res, next) => {
  await registarMovimentoCaixa(req, res, next, 'reforco');
});

async function registarMovimentoCaixa(req, res, next, tipo) {
  const { valor, motivo } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'O valor deve ser maior que zero.' });
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data: sessao, error: sessaoError } = await supabaseAdmin
      .from('caixa_sessoes')
      .select('id')
      .eq('empresa_id', req.user.empresaId)
      .eq('status', 'aberto')
      .maybeSingle();

    if (sessaoError) throw sessaoError;
    if (!sessao) return res.status(404).json({ erro: 'Não há nenhum caixa aberto neste momento.' });

    const { data, error } = await supabaseAdmin
      .from('caixa_movimentos')
      .insert({
        empresa_id: req.user.empresaId,
        caixa_sessao_id: sessao.id,
        usuario_id: req.user.id,
        tipo,
        valor: Number(valor),
        motivo: motivo || null,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

router.post('/fechar', async (req, res, next) => {
  const { saldoFinalContado } = req.body;
  if (saldoFinalContado == null || saldoFinalContado < 0) return res.status(400).json({ erro: 'Saldo final inválido.' });

  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data: sessao, error: sessaoError } = await supabaseAdmin
      .from('caixa_sessoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('status', 'aberto')
      .maybeSingle();

    if (sessaoError) throw sessaoError;
    if (!sessao) return res.status(404).json({ erro: 'Não há nenhum caixa aberto neste momento.' });

    const { entradas, saidas, sangrias, reforcos } = await calcularTotaisSessao(req.user.empresaId, sessao.id);
    const saldoEsperado = Number(sessao.saldo_inicial || 0) + entradas - saidas - sangrias + reforcos;
    const diferenca = Math.round((Number(saldoFinalContado) - saldoEsperado) * 100) / 100;

    const { data, error } = await supabaseAdmin
      .from('caixa_sessoes')
      .update({
        status: 'fechado',
        usuario_fecho_id: req.user.id,
        entradas,
        saidas,
        sangrias,
        reforcos,
        saldo_final_contado: Number(saldoFinalContado),
        diferenca,
        fechado_em: new Date().toISOString(),
      })
      .eq('id', sessao.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
