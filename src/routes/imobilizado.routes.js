const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Usa Supabase (supabaseAdmin). Devolve 503 se não configurado.
function ensureSupabase(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
  next();
}

router.use(ensureSupabase);

// Depreciação linear: depreciação anual = custo / vida útil.
// Valor líquido = custo - (depreciação anual × anos decorridos), nunca abaixo de 0.
function calcularDepreciacao(bem = {}) {
  const raw = bem || {};
  const custo = Number(raw.custo_aquisicao ?? raw.custoAquisicao ?? 0);
  const vidaUtil = Number(raw.vida_util_anos ?? raw.vidaUtilAnos ?? 0);

  if (!Number.isFinite(custo) || !Number.isFinite(vidaUtil) || vidaUtil <= 0) {
    return {
      depreciacaoAnual: 0,
      taxaDepreciacao: 0,
      valorLiquido: 0,
    };
  }

  const depreciacaoAnual = custo / vidaUtil;
  const taxaDepreciacao = 1 / vidaUtil;
  const hoje = new Date();
  const dataAquisicao = raw.data_aquisicao ?? raw.dataAquisicao;
  const aquisicao = dataAquisicao ? new Date(dataAquisicao) : new Date();
  const anosDecorridos = Number.isNaN(aquisicao.getTime())
    ? 0
    : Math.max(0, (hoje - aquisicao) / (365.25 * 24 * 3600 * 1000));
  const depreciacaoAcumulada = Math.min(custo, depreciacaoAnual * anosDecorridos);
  const valorLiquido = Math.max(0, custo - depreciacaoAcumulada);

  return {
    depreciacaoAnual: Math.round(depreciacaoAnual * 100) / 100,
    taxaDepreciacao: Math.round(taxaDepreciacao * 10000) / 10000,
    valorLiquido: Math.round(valorLiquido * 100) / 100,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { data: rows = [], error } = await supabaseAdmin
      .from('imobilizado')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .order('data_aquisicao', { ascending: false });

    if (error) return next(error);
    const comCalculo = rows.map(bem => ({ ...bem, ...calcularDepreciacao(bem) }));
    res.json(comCalculo);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { descricao, categoria, custoAquisicao, dataAquisicao, vidaUtilAnos } = req.body;
  if (!descricao || !custoAquisicao || !dataAquisicao) {
    return res.status(400).json({ erro: 'Descrição, custo de aquisição e data de aquisição são obrigatórios.' });
  }
  try {
    const payload = {
      empresa_id: req.user.empresaId,
      descricao,
      categoria: categoria || null,
      custo_aquisicao: Number(custoAquisicao),
      data_aquisicao: dataAquisicao,
      vida_util_anos: Number(vidaUtilAnos || 5),
    };

    const { data: [item] = [], error } = await supabaseAdmin
      .from('imobilizado')
      .insert([payload])
      .select('*');

    if (error) return next(error);
    const finalItem = item || { ...payload, id: `temp-${Date.now()}` };
    res.status(201).json({ ...finalItem, ...calcularDepreciacao(finalItem) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('imobilizado')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .select('id');

    if (error) return next(error);
    if (!Array.isArray(data) || data.length === 0) return res.status(404).json({ erro: 'Bem não encontrado.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
