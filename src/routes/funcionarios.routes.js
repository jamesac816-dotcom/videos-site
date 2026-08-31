const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('funcionarios')
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
  const { nome, cargo, telefone, salario, status } = req.body;
  if (!nome) return res.status(400).json({ erro: 'O nome do funcionário é obrigatório.' });
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('funcionarios')
      .insert({
        empresa_id: req.user.empresaId,
        nome,
        cargo: cargo || null,
        telefone: telefone || null,
        salario: Number(salario || 0),
        status: status || 'Ativo',
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
  const { nome, cargo, telefone, salario, status } = req.body;
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('funcionarios')
      .update({
        nome,
        cargo: cargo ?? null,
        telefone: telefone ?? null,
        salario: Number(salario || 0),
        status: status ?? 'Ativo',
      })
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
      .from('funcionarios')
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
