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

// GET /api/iva?periodo=mes|ano  — livro de lançamentos + resumo (liquidado, dedutível, a pagar/recuperar)
router.get('/', async (req, res, next) => {
  const { periodo } = req.query;
  try {
    let query = supabaseAdmin.from('iva_lancamentos').select('*').eq('empresa_id', req.user.empresaId).order('data', { ascending: false });

    if (periodo === 'ano') {
      const ano = new Date().getFullYear();
      query = query.eq('data', undefined); // placeholder — we'll filter client-side
    }

    const { data: lancamentos = [], error } = await query;
    if (error) return next(error);

    // Filtrar por periodo no servidor JS (mais simples que construir SQL complexo via supabase-js)
    const hoje = new Date();
    const lancamentosFiltrados = lancamentos.filter(l => {
      const d = new Date(l.data);
      if (periodo === 'ano') return d.getFullYear() === hoje.getFullYear();
      return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
    });

    const totalLiquidado = lancamentosFiltrados.filter(r => r.tipo === 'liquidado').reduce((s, r) => s + Number(r.valor_iva || 0), 0);
    const totalDedutivel = lancamentosFiltrados.filter(r => r.tipo === 'dedutivel').reduce((s, r) => s + Number(r.valor_iva || 0), 0);

    res.json({
      lancamentos: lancamentosFiltrados,
      ivaLiquidado: Math.round(totalLiquidado * 100) / 100,
      ivaDedutivel: Math.round(totalDedutivel * 100) / 100,
      ivaAPagarOuRecuperar: Math.round((totalLiquidado - totalDedutivel) * 100) / 100
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { tipo, descricao, baseTributavel, taxaIva, numeroFatura, data } = req.body;
  if (!['liquidado', 'dedutivel'].includes(tipo) || baseTributavel == null) {
    return res.status(400).json({ erro: 'Tipo e base tributável são obrigatórios.' });
  }
  const taxa = taxaIva != null ? Number(taxaIva) : 0.16;
  const valorIva = Math.round(Number(baseTributavel) * taxa * 100) / 100;
  try {
    const payload = {
      empresa_id: req.user.empresaId,
      tipo,
      descricao: descricao || null,
      base_tributavel: Number(baseTributavel),
      taxa_iva: Number(taxa),
      valor_iva: Number(valorIva),
      numero_fatura: numeroFatura || null,
      data: data || new Date().toISOString().slice(0, 10),
    };

    const { data: [item] = [], error } = await supabaseAdmin
      .from('iva_lancamentos')
      .insert([payload])
      .select('*');

    if (error) return next(error);
    const finalItem = item || { ...payload, id: `iva-${Date.now()}` };
    res.status(201).json(finalItem);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('iva_lancamentos')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .select('id');

    if (error) return next(error);
    if (!Array.isArray(data) || data.length === 0) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
