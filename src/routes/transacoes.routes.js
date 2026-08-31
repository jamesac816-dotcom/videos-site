const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function dataParaDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emPeriodo(dataValue, periodo = 'mes') {
  const data = dataParaDate(dataValue);
  if (!data) return false;
  const agora = new Date();

  switch (periodo) {
    case 'hoje':
      return data.toDateString() === agora.toDateString();
    case 'semana': {
      const inicioSemana = new Date(agora);
      inicioSemana.setDate(agora.getDate() - agora.getDay());
      inicioSemana.setHours(0, 0, 0, 0);
      return data >= inicioSemana;
    }
    case 'ano':
      return data.getFullYear() === agora.getFullYear();
    case 'mes':
    default:
      return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
  }
}

router.get('/', async (req, res, next) => {
  const { tipo, periodo, contaBancariaId, naoConciliadas } = req.query;
  try {
    if (!supabaseAdmin) return res.json([]);

    let query = supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (tipo) query = query.eq('tipo', tipo);
    if (contaBancariaId) query = query.eq('conta_bancaria_id', contaBancariaId);
    if (naoConciliadas) query = query.eq('conciliado', false);

    const { data, error } = await query.order('data', { ascending: false });
    if (error) throw error;

    const rows = (data || []).filter((row) => emPeriodo(row.data, periodo || 'mes'));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { tipo, valor, categoria, descricao, data, contaBancariaId, cartaoId } = req.body;
  if (!['receita', 'despesa'].includes(tipo) || !valor || valor <= 0 || !categoria) {
    return res.status(400).json({ erro: 'Tipo, valor e categoria são obrigatórios.' });
  }
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data: insert, error } = await supabaseAdmin
      .from('transacoes')
      .insert({
        empresa_id: req.user.empresaId,
        tipo,
        valor: Number(valor),
        categoria,
        descricao: descricao || null,
        data: data || new Date().toISOString().slice(0, 10),
        conta_bancaria_id: contaBancariaId || null,
        cartao_id: cartaoId || null,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(insert);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/conciliar', async (req, res, next) => {
  const { conciliado } = req.body;
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .update({ conciliado: !!conciliado, conciliado_em: !!conciliado ? new Date().toISOString() : null })
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
      .from('transacoes')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
