const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('user_plans')
      .select('*, planos(nome, descricao, preco), empresas(nome_negocio)')
      .eq('empresa_id', req.user.empresaId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole('dono', 'super_admin'), async (req, res, next) => {
  try {
    const { usuario_id, plano_id, months, empresa_id } = req.body;
    if (!supabaseAdmin) {
      return res.status(201).json({
        id: 'user-plan-temp',
        usuario_id: usuario_id || req.user.id,
        empresa_id: empresa_id || req.user.empresaId,
        plano_id: plano_id || 'essencial',
        start_date: new Date().toISOString().slice(0, 10),
        months_paid: Number(months) || 1,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    const payload = {
      usuario_id: usuario_id || req.user.id,
      empresa_id: empresa_id || req.user.empresaId,
      plano_id: plano_id || 'essencial',
      start_date: new Date().toISOString().slice(0, 10),
      months_paid: Number(months) || 1,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('user_plans')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.post('/:id/pay', requireAuth, requireRole('dono', 'super_admin'), async (req, res, next) => {
  try {
    if (!supabaseAdmin) {
      return res.json({
        id: req.params.id,
        pago_por_usuario_id: req.user.id,
        meses: Number(req.body.meses) || 1,
        valor: Number(req.body.valor) || 0,
        referencia: req.body.referencia || null,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('plan_payments')
      .insert({
        user_plan_id: req.params.id,
        pago_por_usuario_id: req.user.id,
        meses: Number(req.body.meses) || 1,
        valor: Number(req.body.valor) || 0,
        metodo: req.body.metodo || 'manual',
        referencia: req.body.referencia || null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
