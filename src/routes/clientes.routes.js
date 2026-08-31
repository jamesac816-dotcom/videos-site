const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .order('nome', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { nome, telefone, email, endereco, nif, saldoDevedor } = req.body;
  if (!nome) return res.status(400).json({ erro: 'O nome do cliente é obrigatório.' });
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .insert({
        empresa_id: req.user.empresaId,
        nome,
        telefone: telefone || null,
        email: email || null,
        endereco: endereco || null,
        nif: nif || null,
        saldo_devedor: Number(saldoDevedor || 0),
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  const { nome, telefone, email, endereco, nif } = req.body;
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .update({ nome, telefone: telefone ?? null, email: email ?? null, endereco: endereco ?? null, nif: nif ?? null })
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

router.delete('/:id', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { error } = await supabaseAdmin
      .from('clientes')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pagamentos', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('pagamentos_clientes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('cliente_id', req.params.id)
      .order('data', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pagamentos', async (req, res, next) => {
  const { valor, data } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor do pagamento inválido.' });

  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .maybeSingle();

    if (clienteError) throw clienteError;
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    // Regra do cliente: saldo_devedor < 0 = crédito disponível do cliente na loja.
    // saldo_devedor > 0 = cliente tem dívida em aberto.
    // Depósito: reduz o valor em dívida ou aumenta o crédito disponível.
    const novoSaldo = Number(cliente.saldo_devedor || 0) - Number(valor);

    const { data: pagamento, error: pagamentoError } = await supabaseAdmin
      .from('pagamentos_clientes')
      .insert({
        empresa_id: req.user.empresaId,
        cliente_id: cliente.id,
        valor: Number(valor),
        data: data || new Date().toISOString().slice(0, 10),
      })
      .select('*')
      .single();

    if (pagamentoError) throw pagamentoError;

    const { error: updateError } = await supabaseAdmin
      .from('clientes')
      .update({ saldo_devedor: novoSaldo })
      .eq('id', cliente.id)
      .eq('empresa_id', req.user.empresaId);

    if (updateError) throw updateError;

    await supabaseAdmin.from('transacoes').insert({
      empresa_id: req.user.empresaId,
      tipo: 'receita',
      valor: Number(valor),
      categoria: 'Recebimento de Cliente',
      descricao: `Pagamento de ${cliente.nome}`,
      cliente_id: cliente.id,
      data: data || new Date().toISOString().slice(0, 10),
    });

    res.status(201).json({ pagamento, saldoDevedorAtual: novoSaldo });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
