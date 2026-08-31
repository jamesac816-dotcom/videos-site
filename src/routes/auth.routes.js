const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { modulosPorOmissao, TODOS_OS_MODULOS } = require('../config/modulos');

const router = express.Router();

function assinarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, empresaId: usuario.empresa_id, papel: usuario.papel },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function formatarUsuarioEmpresa(usuario, empresa, planoAtual = null) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    telefone: usuario.telefone,
    papel: usuario.papel,
    planoAtual: planoAtual || {
      id: 'essencial',
      nome: 'Essencial',
      descricao: 'Plano padrão do sistema',
      preco: 12900,
      recomendado: true,
      features: ['Dashboard', 'Gestão de clientes', 'Financeiro', 'Caixa'],
    },
    empresa: {
      id: empresa.id,
      nomeNegocio: empresa.nome_negocio,
      tipoNegocio: empresa.tipo_negocio,
      cidade: empresa.cidade,
      endereco: empresa.endereco,
      telefone: empresa.telefone,
      logoUrl: empresa.logo_url,
      nuit: empresa.nuit,
      formaJuridica: empresa.forma_juridica,
      sectorActividade: empresa.sector_actividade,
      cae: empresa.cae,
      email: empresa.email,
      capitalSocial: empresa.capital_social,
      dataConstituicao: empresa.data_constituicao,
      regimeIva: empresa.regime_iva,
      regimeIrpc: empresa.regime_irpc,
      taxaIva: empresa.taxa_iva,
      taxaIrpc: empresa.taxa_irpc,
      numeroFuncionarios: empresa.numero_funcionarios,
      responsavelFinanceiro: empresa.responsavel_financeiro,
      contabilistaCertificado: empresa.contabilista_certificado,
      modulosAtivos: empresa.modulos_ativos || [],
    },
  };
}

async function buscarPlanoAtual(empresaId) {
  if (!supabaseAdmin || !empresaId) {
    return {
      id: 'essencial',
      nome: 'Essencial',
      descricao: 'Plano padrão do sistema',
      preco: 12900,
      recomendado: true,
      features: ['Dashboard', 'Gestão de clientes', 'Financeiro', 'Caixa'],
    };
  }

  try {
    const { data: userPlan, error } = await supabaseAdmin
      .from('user_plans')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !userPlan || !userPlan.plano_id) {
      return {
        id: 'essencial',
        nome: 'Essencial',
        descricao: 'Plano padrão do sistema',
        preco: 12900,
        recomendado: true,
        features: ['Dashboard', 'Gestão de clientes', 'Financeiro', 'Caixa'],
      };
    }

    const { data: plano, error: planoError } = await supabaseAdmin
      .from('planos')
      .select('*')
      .eq('id', userPlan.plano_id)
      .maybeSingle();

    if (planoError || !plano) {
      return {
        id: userPlan.plano_id || 'essencial',
        nome: plano?.nome || userPlan.plano_id || 'Essencial',
        descricao: 'Plano associado à empresa',
        preco: 0,
        recomendado: false,
        features: [],
      };
    }

    return {
      id: plano.id,
      nome: plano.nome,
      descricao: plano.descricao,
      preco: Number(plano.preco || 0),
      recomendado: !!plano.recomendado,
      features: Array.isArray(plano.features) ? plano.features : [],
    };
  } catch (err) {
    console.warn('Falha ao carregar plano atual:', err);
    return {
      id: 'essencial',
      nome: 'Essencial',
      descricao: 'Plano padrão do sistema',
      preco: 12900,
      recomendado: true,
      features: ['Dashboard', 'Gestão de clientes', 'Financeiro', 'Caixa'],
    };
  }
}

// POST /api/auth/register
// Cria a empresa (negócio) e o utilizador administrador numa única transação.
router.post('/register', async (req, res, next) => {
  const { nome, email, telefone, senha, nomeNegocio, tipoNegocio, cidade, endereco } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ erro: 'Supabase não configurado. Verifique as chaves do ambiente.' });
  }

  try {
    const empresaInsert = {
      nome_negocio: nomeNegocio || 'Meu Negócio',
      tipo_negocio: tipoNegocio || null,
      cidade: cidade || null,
      endereco: endereco || null,
      telefone: telefone || null,
      modulos_ativos: modulosPorOmissao(tipoNegocio)
    };

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .insert(empresaInsert)
      .select('*')
      .single();

    if (empresaError) throw empresaError;

    const senhaHash = await bcrypt.hash(senha, 10);
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        empresa_id: empresa.id,
        nome,
        email: email.toLowerCase(),
        telefone: telefone || null,
        senha_hash: senhaHash,
        papel: 'dono'
      })
      .select('*')
      .single();

    if (usuarioError) throw usuarioError;

    const planoInicialId = 'essencial';
    const { error: planoError } = await supabaseAdmin
      .from('user_plans')
      .insert({
        empresa_id: empresa.id,
        usuario_id: usuario.id,
        plano_id: planoInicialId,
        start_date: new Date().toISOString().slice(0, 10),
        months_paid: 1,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    if (planoError) {
      console.warn('Aviso: não foi possível atribuir o plano inicial à nova empresa:', planoError);
    }

    const categoriasPadrao = [
      ['Vendas','receita','#10B981'], ['Serviços','receita','#34D399'],
      ['Recebimento de Cliente','receita','#3B82F6'], ['Outras Receitas','receita','#2563EB'],
      ['Fornecedores','despesa','#2563EB'], ['Renda/Aluguer','despesa','#3B82F6'],
      ['Salários','despesa','#10B981'], ['Transporte','despesa','#34D399'],
      ['Energia/Água','despesa','#C98A1A'], ['Outras Despesas','despesa','#8598AB'],
    ];

    for (const [cnome, ctipo, ccor] of categoriasPadrao) {
      const { error: categoriaError } = await supabaseAdmin.from('categorias_financeiras').insert({
        empresa_id: empresa.id,
        nome: cnome,
        tipo: ctipo,
        cor: ccor
      });
      if (categoriaError) throw categoriaError;
    }

    const planoAtual = await buscarPlanoAtual(empresa.id);
    const token = assinarToken(usuario);
    res.status(201).json({ token, usuario: formatarUsuarioEmpresa(usuario, empresa, planoAtual) });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma conta registada com este e-mail.' });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ erro: 'Supabase não configurado. Verifique as chaves do ambiente.' });
  }

  try {
    const emailLower = String(email).trim().toLowerCase();
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('email', emailLower)
      .maybeSingle();

    if (usuarioError) throw usuarioError;
    if (!usuario) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', usuario.empresa_id)
      .maybeSingle();

    if (empresaError) throw empresaError;
    if (!empresa) {
      return res.status(401).json({ erro: 'Empresa não encontrada para este utilizador.' });
    }

    const planoAtual = await buscarPlanoAtual(empresa.id);
    const token = assinarToken(usuario);

    try {
      const days = Number(process.env.SESSION_DAYS || 30);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const { error: sessionError } = await supabaseAdmin.from('sessions').upsert([
        { token, usuario_id: usuario.id, expires_at: expiresAt }
      ], { onConflict: 'token' });
      if (sessionError) console.error('Falha ao registar sessão:', sessionError);
    } catch (e) {
      console.error('Falha ao registar sessão:', e);
    }

    res.json({ token, usuario: formatarUsuarioEmpresa(usuario, empresa, planoAtual) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — dados do utilizador autenticado (útil para restaurar a sessão no frontend)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('id', req.user.id)
      .maybeSingle();

    if (usuarioError) throw usuarioError;
    if (!usuario) return res.status(404).json({ erro: 'Utilizador não encontrado.' });

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', usuario.empresa_id)
      .maybeSingle();

    if (empresaError) throw empresaError;
    if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada para este utilizador.' });

    const planoAtual = await buscarPlanoAtual(empresa.id);
    res.json(formatarUsuarioEmpresa(usuario, empresa, planoAtual));
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/empresa — atualizar dados do negócio (ecrã de Perfil / Dados Fiscais)
router.put('/empresa', requireAuth, async (req, res, next) => {
  const {
    nomeNegocio, tipoNegocio, cidade, endereco, telefone, logoUrl,
    nuit, formaJuridica, sectorActividade, cae, email, capitalSocial, dataConstituicao,
    regimeIva, regimeIrpc, taxaIva, taxaIrpc, numeroFuncionarios,
    responsavelFinanceiro, contabilistaCertificado
  } = req.body;
  try {
    const payload = {
      nome_negocio: nomeNegocio ?? undefined,
      tipo_negocio: tipoNegocio ?? undefined,
      cidade: cidade ?? undefined,
      endereco: endereco ?? undefined,
      telefone: telefone ?? undefined,
      logo_url: logoUrl ?? undefined,
      nuit: nuit ?? undefined,
      forma_juridica: formaJuridica ?? undefined,
      sector_actividade: sectorActividade ?? undefined,
      cae: cae ?? undefined,
      email: email ?? undefined,
      capital_social: capitalSocial ?? undefined,
      data_constituicao: dataConstituicao ?? undefined,
      regime_iva: regimeIva ?? undefined,
      regime_irpc: regimeIrpc ?? undefined,
      taxa_iva: taxaIva ?? undefined,
      taxa_irpc: taxaIrpc ?? undefined,
      numero_funcionarios: numeroFuncionarios ?? undefined,
      responsavel_financeiro: responsavelFinanceiro ?? undefined,
      contabilista_certificado: contabilistaCertificado ?? undefined,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) delete payload[key];
    });

    const { data: empresa, error } = await supabaseAdmin
      .from('empresas')
      .update(payload)
      .eq('id', req.user.empresaId)
      .select('*')
      .single();

    if (error) throw error;
    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/usuario — atualizar nome e telefone do próprio utilizador (ecrã de Perfil)
router.put('/usuario', requireAuth, async (req, res, next) => {
  const { nome, telefone } = req.body;
  try {
    const payload = {};
    if (nome !== undefined) payload.nome = nome;
    if (telefone !== undefined) payload.telefone = telefone;

    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .update(payload)
      .eq('id', req.user.id)
      .select('*')
      .single();

    if (usuarioError) throw usuarioError;

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', usuario.empresa_id)
      .maybeSingle();

    if (empresaError) throw empresaError;
    res.json(formatarUsuarioEmpresa(usuario, empresa));
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/senha — trocar a senha (exige a senha atual correta)
router.put('/senha', requireAuth, async (req, res, next) => {
  const { senhaAtual, senhaNova } = req.body;
  if (!senhaAtual || !senhaNova) return res.status(400).json({ erro: 'Preencha a senha atual e a nova senha.' });
  if (senhaNova.length < 6) return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
  try {
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('id', req.user.id)
      .maybeSingle();

    if (usuarioError) throw usuarioError;
    if (!usuario) return res.status(404).json({ erro: 'Utilizador não encontrado.' });

    const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);
    if (!senhaValida) return res.status(401).json({ erro: 'A senha atual está incorreta.' });

    const novaHash = await bcrypt.hash(senhaNova, 10);
    const { error: updateError } = await supabaseAdmin
      .from('usuarios')
      .update({ senha_hash: novaHash })
      .eq('id', req.user.id);

    if (updateError) throw updateError;
    res.json({ sucesso: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/modulos — activar/desactivar módulos do ERP (Configurações > Módulos)
router.put('/modulos', requireAuth, async (req, res, next) => {
  const { modulosAtivos } = req.body;
  if (!Array.isArray(modulosAtivos)) {
    return res.status(400).json({ erro: 'Lista de módulos inválida.' });
  }
  const validos = modulosAtivos.filter(m => TODOS_OS_MODULOS.includes(m));
  try {
    const { data: empresa, error } = await supabaseAdmin
      .from('empresas')
      .update({ modulos_ativos: validos })
      .eq('id', req.user.empresaId)
      .select('modulos_ativos')
      .single();

    if (error) throw error;
    res.json({ modulosAtivos: empresa.modulos_ativos || [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
