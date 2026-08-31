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

function agruparPorCategoria(rows) {
  const mapa = new Map();
  rows.forEach((row) => {
    const key = row.categoria || 'Sem categoria';
    const total = Number(row.valor || 0);
    mapa.set(key, (mapa.get(key) || 0) + total);
  });
  return Array.from(mapa.entries()).map(([categoria, total]) => ({ categoria, total }));
}

router.get('/resumo', async (req, res, next) => {
  const { periodo } = req.query;
  try {
    if (!supabaseAdmin) return res.json({ saldoAtual: 0, receitasPeriodo: 0, despesasPeriodo: 0, lucroPeriodo: 0, quantidadeReceitas: 0, quantidadeDespesas: 0 });

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (error) throw error;

    const rows = data || [];
    const saldoAtual = rows.reduce((s, row) => s + (row.tipo === 'receita' ? Number(row.valor || 0) : -Number(row.valor || 0)), 0);
    const periodoRows = rows.filter((row) => emPeriodo(row.data, periodo || 'mes'));

    let totalReceitas = 0;
    let totalDespesas = 0;
    let qtdReceitas = 0;
    let qtdDespesas = 0;

    periodoRows.forEach((row) => {
      if (row.tipo === 'receita') {
        totalReceitas += Number(row.valor || 0);
        qtdReceitas += 1;
      }
      if (row.tipo === 'despesa') {
        totalDespesas += Number(row.valor || 0);
        qtdDespesas += 1;
      }
    });

    res.json({
      saldoAtual,
      receitasPeriodo: totalReceitas,
      despesasPeriodo: totalDespesas,
      lucroPeriodo: totalReceitas - totalDespesas,
      quantidadeReceitas: qtdReceitas,
      quantidadeDespesas: qtdDespesas,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/mensal', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .gte('data', inicio.toISOString().slice(0, 10));

    if (error) throw error;

    const agrupado = new Map();
    (data || []).forEach((row) => {
      const d = dataParaDate(row.data);
      if (!d) return;
      const chave = `${d.getFullYear()}-${d.getMonth()}`;
      const key = `${chave}:${row.tipo}`;
      agrupado.set(key, (agrupado.get(key) || 0) + Number(row.valor || 0));
    });

    const saida = Array.from(agrupado.entries()).map(([key, total]) => {
      const [mesKey, tipo] = key.split(':');
      const [ano, mes] = mesKey.split('-').map(Number);
      return { mes: new Date(ano, mes, 1).toISOString(), tipo, total };
    });

    res.json(saida);
  } catch (err) {
    next(err);
  }
});

router.get('/categorias', async (req, res, next) => {
  const { tipo, periodo } = req.query;
  if (!['receita', 'despesa'].includes(tipo)) return res.status(400).json({ erro: 'Parâmetro "tipo" inválido.' });
  try {
    if (!supabaseAdmin) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('tipo', tipo);

    if (error) throw error;

    const filtrado = (data || []).filter((row) => emPeriodo(row.data, periodo || 'mes'));
    res.json(agruparPorCategoria(filtrado).sort((a, b) => Number(b.total) - Number(a.total)));
  } catch (err) {
    next(err);
  }
});

router.get('/dre', async (req, res, next) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  try {
    if (!supabaseAdmin) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (error) throw error;

    const rows = (data || []).filter((row) => {
      const d = dataParaDate(row.data);
      return d && d.getFullYear() === ano;
    });

    const mapa = new Map();
    rows.forEach((row) => {
      const d = dataParaDate(row.data);
      if (!d) return;
      const chave = `${row.tipo}|${row.categoria || 'Sem categoria'}|${d.getMonth() + 1}`;
      const valor = Number(row.valor || 0);
      const atual = mapa.get(chave) || 0;
      mapa.set(chave, atual + valor);
    });

    const saida = Array.from(mapa.entries()).map(([key, total]) => {
      const [tipo, categoria, mes] = key.split('|');
      return { tipo, categoria, mes: Number(mes), total };
    });

    res.json(saida.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.mes - b.mes));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
