const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

const DEFAULT_PLANOS = [
  { id: 'iniciante', nome: 'Iniciante', descricao: 'Para pequenos negócios e vendas diárias', preco: 4900, recomendado: false, features: ['1 utilizador', 'Gestão de stock', 'Dashboard financeiro', 'Clientes e caixa'] },
  { id: 'essencial', nome: 'Essencial', descricao: 'Para lojas em crescimento com mais controlo', preco: 12900, recomendado: true, features: ['Tudo do Iniciante', 'Vendas PDV', 'Relatórios detalhados', 'Alertas de stock'] },
  { id: 'crescimento', nome: 'Crescimento', descricao: 'Para negócios com faturamento mais alto', preco: 24900, recomendado: false, features: ['Tudo do Essencial', 'Múltiplos utilizadores', 'Controle financeiro avançado', 'Pagamentos móveis'] },
  { id: 'pro', nome: 'Pro', descricao: 'Para marcas e operações mais completas', preco: 49900, recomendado: false, features: ['Tudo do Crescimento', 'Suporte prioritário', 'Relatórios e gestão multi-loja', 'Personalização de módulos'] },
];
const ORDEM_PLANOS = { iniciante: 1, essencial: 2, crescimento: 3, pro: 4 };

function ordenarPlanos(planos) {
  return [...(Array.isArray(planos) ? planos : [])].sort((a, b) => {
    const aid = String(a?.id || '').toLowerCase();
    const bid = String(b?.id || '').toLowerCase();
    return (ORDEM_PLANOS[aid] || 99) - (ORDEM_PLANOS[bid] || 99);
  });
}

function mapPlano(plano) {
  return {
    id: plano.id,
    nome: plano.nome,
    descricao: plano.descricao || '',
    preco: Number(plano.preco || 0),
    recomendado: !!plano.recomendado,
    features: Array.isArray(plano.features) ? plano.features : [],
  };
}

function getPlanosFallback() {
  return DEFAULT_PLANOS.map(mapPlano);
}

async function carregarPlanos() {
  if (!supabaseAdmin) return getPlanosFallback();

  const { data, error } = await supabaseAdmin
    .from('planos')
    .select('*')
    .order('criado_em', { ascending: true });

  if (error) throw error;

  if (!Array.isArray(data) || data.length === 0) {
    const seed = DEFAULT_PLANOS.map((plano) => ({
      id: plano.id,
      nome: plano.nome,
      descricao: plano.descricao,
      preco: plano.preco,
      recomendado: plano.recomendado,
      features: plano.features,
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('planos')
      .upsert(seed, { onConflict: 'id' })
      .select();

    if (insertError) throw insertError;
    return ordenarPlanos((inserted || []).map(mapPlano));
  }

  return ordenarPlanos(data.map(mapPlano));
}

router.get('/public', async (req, res, next) => {
  try {
    const planos = await carregarPlanos();
    return res.json(planos);
  } catch (err) { next(err); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const planos = await carregarPlanos();
    return res.json(planos);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('super_admin', 'dono'), async (req, res, next) => {
  try {
    const id = String(req.body.id || req.body.nome || 'plano').toLowerCase().replace(/\s+/g, '-');
    const payload = {
      id,
      nome: req.body.nome || 'Plano',
      descricao: req.body.descricao || '',
      preco: Number(req.body.preco || 0),
      recomendado: !!req.body.recomendado,
      features: Array.isArray(req.body.features) ? req.body.features : [],
    };

    if (!supabaseAdmin) {
      return res.status(201).json(mapPlano(payload));
    }

    const { data, error } = await supabaseAdmin
      .from('planos')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(mapPlano(data));
  } catch (err) { next(err); }
});

router.patch('/:id', requireAuth, requireRole('super_admin', 'dono'), async (req, res, next) => {
  try {
    const payload = {
      id: req.params.id,
      nome: req.body.nome || req.params.id,
      descricao: req.body.descricao || '',
      preco: Number(req.body.preco || 0),
      recomendado: !!req.body.recomendado,
      features: Array.isArray(req.body.features) ? req.body.features : [],
    };

    if (!supabaseAdmin) {
      return res.json(mapPlano(payload));
    }

    const { data, error } = await supabaseAdmin
      .from('planos')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return res.json(mapPlano(data));
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireRole('super_admin', 'dono'), async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.status(204).send();

    const { error } = await supabaseAdmin
      .from('planos')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    return res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;