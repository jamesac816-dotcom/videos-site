const express = require('express');
const bcrypt = require('bcryptjs');
const { execFile } = require('child_process');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');
const { modulosPorOmissao } = require('../config/modulos');

const router = express.Router();
router.use(requireAuth);

function ensureSupabase(req, res) {
  if (!supabaseAdmin) {
    res.status(503).json({ erro: 'Supabase não configurado. Verifique as chaves do ambiente.' });
    return false;
  }
  return true;
}

function getDatabaseBackupUrl() {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGDATABASE_URL || '').trim();
}

function asNumber(value, fallback = 0) {
  const num = Number(value ?? fallback);
  return Number.isFinite(num) ? num : fallback;
}

async function buscarResumoEmpresa(empresaId) {
  const [empresaRes, clientesRes, funcionariosRes, produtosRes, vendasRes, transacoesRes] = await Promise.all([
    supabaseAdmin.from('empresas').select('*').eq('id', empresaId).maybeSingle(),
    supabaseAdmin.from('clientes').select('id, nome, telefone, saldo_devedor').eq('empresa_id', empresaId).order('saldo_devedor', { ascending: false }).limit(50),
    supabaseAdmin.from('funcionarios').select('id, nome, cargo, salario, status').eq('empresa_id', empresaId).order('nome').limit(50),
    supabaseAdmin.from('produtos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabaseAdmin.from('vendas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabaseAdmin.from('transacoes').select('tipo, valor, data').eq('empresa_id', empresaId),
  ]);

  if (empresaRes.error) throw empresaRes.error;
  if (!empresaRes.data) return null;

  const empresa = empresaRes.data;
  const clientes = clientesRes.data || [];
  const funcionarios = funcionariosRes.data || [];
  const transacoes = transacoesRes.data || [];

  let receitasMes = 0;
  let despesasMes = 0;
  let saldoAtual = 0;

  transacoes.forEach((item) => {
    const valor = asNumber(item.valor, 0);
    if (item.tipo === 'receita') {
      saldoAtual += valor;
      receitasMes += valor;
    } else if (item.tipo === 'despesa') {
      saldoAtual -= valor;
      despesasMes += valor;
    }
  });

  return {
    empresa,
    saldoAtual,
    receitasMes,
    despesasMes,
    lucroMes: receitasMes - despesasMes,
    totalProdutos: asNumber(produtosRes.count, 0),
    totalVendas: asNumber(vendasRes.count, 0),
    clientes,
    funcionarios,
  };
}

/* =========================================================
   EMPRESAS — visível para super_admin E visualizador (só leitura)
========================================================= */

router.get('/empresas/:id/resumo', requireRole('super_admin', 'visualizador'), async (req, res, next) => {
  const empresaId = req.params.id;
  if (!ensureSupabase(req, res)) return;

  try {
    const resumo = await buscarResumoEmpresa(empresaId);
    if (!resumo) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    res.json(resumo);
  } catch (err) {
    next(err);
  }
});

router.get('/empresas', requireRole('super_admin', 'visualizador'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const { data: empresas, error } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .order('criado_em', { ascending: false });

    if (error) throw error;

    const rows = await Promise.all((empresas || []).map(async (empresa) => {
      const [donoRes, produtosRes, usuariosRes, receitasRes] = await Promise.all([
        supabaseAdmin.from('usuarios').select('nome, email').eq('empresa_id', empresa.id).eq('papel', 'dono').maybeSingle(),
        supabaseAdmin.from('produtos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id),
        supabaseAdmin.from('usuarios').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id),
        supabaseAdmin.from('transacoes').select('valor, tipo, data').eq('empresa_id', empresa.id),
      ]);

      const receitasMes = (receitasRes.data || [])
        .filter((t) => t.tipo === 'receita')
        .reduce((sum, t) => sum + asNumber(t.valor, 0), 0);

      return {
        id: empresa.id,
        nome_negocio: empresa.nome_negocio,
        tipo_negocio: empresa.tipo_negocio,
        cidade: empresa.cidade,
        telefone: empresa.telefone,
        criado_em: empresa.criado_em,
        dono_nome: donoRes.data?.nome || '—',
        dono_email: donoRes.data?.email || '',
        total_produtos: asNumber(produtosRes.count, 0),
        total_usuarios: asNumber(usuariosRes.count, 0),
        receitas_mes: receitasMes,
      };
    }));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/empresas/:id', requireRole('super_admin', 'visualizador'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const { data, error } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/empresas', requireRole('super_admin'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const nomeNegocio = String(req.body.nomeNegocio || req.body.nome_negocio || '').trim();
    const nomeResponsavel = String(req.body.nomeResponsavel || req.body.nome_responsavel || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const tipoNegocio = req.body.tipoNegocio || req.body.tipo_negocio || 'Outro';

    if (!nomeNegocio || !email || !senha) {
      return res.status(400).json({ erro: 'Nome da empresa, e-mail e senha são obrigatórios.' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const empresaInsert = {
      nome_negocio: nomeNegocio,
      tipo_negocio: tipoNegocio,
      cidade: req.body.cidade || null,
      endereco: req.body.endereco || null,
      telefone: req.body.telefone || null,
      email: req.body.empresaEmail || email,
      modulos_ativos: modulosPorOmissao(tipoNegocio),
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
        nome: nomeResponsavel || 'Responsável',
        email,
        telefone: req.body.telefone || null,
        senha_hash: senhaHash,
        papel: 'dono',
      })
      .select('id, nome, email, telefone, papel, empresa_id')
      .single();

    if (usuarioError) throw usuarioError;

    const planoInicialId = 'essencial';
    const { error: planoError } = await supabaseAdmin.from('user_plans').insert({
      empresa_id: empresa.id,
      usuario_id: usuario.id,
      plano_id: planoInicialId,
      start_date: new Date().toISOString().slice(0, 10),
      months_paid: 1,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (planoError) {
      console.warn('Aviso: plano inicial não atribuído na criação da empresa:', planoError);
    }

    res.status(201).json({ empresa, usuario, planoInicialId });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
    }
    next(err);
  }
});

router.patch('/empresas/:id', requireRole('super_admin'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const payload = {
      nome_negocio: req.body.nomeNegocio ?? req.body.nome_negocio ?? undefined,
      tipo_negocio: req.body.tipoNegocio ?? req.body.tipo_negocio ?? undefined,
      cidade: req.body.cidade ?? undefined,
      endereco: req.body.endereco ?? undefined,
      telefone: req.body.telefone ?? undefined,
      email: req.body.empresaEmail ?? req.body.email ?? undefined,
      nuit: req.body.nuit ?? undefined,
      forma_juridica: req.body.formaJuridica ?? req.body.forma_juridica ?? undefined,
      sector_actividade: req.body.sectorActividade ?? req.body.sector_actividade ?? undefined,
      cae: req.body.cae ?? undefined,
      capital_social: req.body.capitalSocial ?? req.body.capital_social ?? undefined,
      data_constituicao: req.body.dataConstituicao ?? req.body.data_constituicao ?? undefined,
      regime_iva: req.body.regimeIva ?? req.body.regime_iva ?? undefined,
      regime_irpc: req.body.regimeIrpc ?? req.body.regime_irpc ?? undefined,
      taxa_iva: req.body.taxaIva ?? req.body.taxa_iva ?? undefined,
      taxa_irpc: req.body.taxaIrpc ?? req.body.taxa_irpc ?? undefined,
      numero_funcionarios: req.body.numeroFuncionarios ?? req.body.numero_funcionarios ?? undefined,
      responsavel_financeiro: req.body.responsavelFinanceiro ?? req.body.responsavel_financeiro ?? undefined,
      contabilista_certificado: req.body.contabilistaCertificado ?? req.body.contabilista_certificado ?? undefined,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) delete payload[key];
    });

    if (req.body.modulosAtivos && Array.isArray(req.body.modulosAtivos)) {
      payload.modulos_ativos = req.body.modulosAtivos.filter((m) => typeof m === 'string' && m.trim());
    }

    const { data, error } = await supabaseAdmin
      .from('empresas')
      .update(payload)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/empresas/:id/produtos', requireRole('super_admin', 'visualizador'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const { data, error } = await supabaseAdmin
      .from('produtos')
      .select('*')
      .eq('empresa_id', req.params.id)
      .order('nome', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.get('/planos', requireRole('super_admin', 'visualizador'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const [{ data: empresas, error: empError }, { data: planos, error: planosError }, { data: userPlans, error: plansError }, { data: donos, error: donosError }] = await Promise.all([
      supabaseAdmin.from('empresas').select('id, nome_negocio').order('criado_em', { ascending: false }),
      supabaseAdmin.from('planos').select('*').order('criado_em', { ascending: true }),
      supabaseAdmin.from('user_plans').select('empresa_id, plano_id, created_at').order('created_at', { ascending: false }),
      supabaseAdmin.from('usuarios').select('empresa_id, nome, email').eq('papel', 'dono')
    ]);

    if (empError) throw empError;
    if (planosError) throw planosError;
    if (plansError) throw plansError;
    if (donosError) throw donosError;

    const ultimoPlanoPorEmpresa = new Map();
    (userPlans || []).forEach((item) => {
      if (!ultimoPlanoPorEmpresa.has(item.empresa_id)) {
        ultimoPlanoPorEmpresa.set(item.empresa_id, item);
      }
    });

    const donosPorEmpresa = new Map();
    (donos || []).forEach((item) => {
      if (!donosPorEmpresa.has(item.empresa_id)) {
        donosPorEmpresa.set(item.empresa_id, item);
      }
    });

    const rows = (empresas || []).map((empresa) => {
      const planoAtivo = ultimoPlanoPorEmpresa.get(empresa.id);
      const plano = (planos || []).find((item) => item.id === planoAtivo?.plano_id) || null;
      const dono = donosPorEmpresa.get(empresa.id);

      return {
        id: empresa.id,
        nome_negocio: empresa.nome_negocio,
        dono_nome: dono?.nome || '—',
        dono_email: dono?.email || '',
        plano_id: planoAtivo?.plano_id || 'essencial',
        plano_nome: plano?.nome || 'Essencial',
        plano_descricao: plano?.descricao || 'Plano associado à empresa',
        preco: Number(plano?.preco || 0),
      };
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/empresas/:id/plano', requireRole('super_admin'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const { plano_id } = req.body;
    if (!plano_id) return res.status(400).json({ erro: 'Selecione um plano.' });

    const { data: plano, error: planoError } = await supabaseAdmin
      .from('planos')
      .select('id, nome')
      .eq('id', String(plano_id))
      .maybeSingle();

    if (planoError) throw planoError;
    if (!plano) return res.status(404).json({ erro: 'Plano não encontrado.' });

    const { data: empresa, error: empError } = await supabaseAdmin
      .from('empresas')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (empError) throw empError;
    if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const { data: dono, error: donoError } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', req.params.id)
      .eq('papel', 'dono')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (donoError) throw donoError;

    const payload = {
      usuario_id: dono?.id || req.user.id,
      empresa_id: req.params.id,
      plano_id: plano.id,
      start_date: new Date().toISOString().slice(0, 10),
      months_paid: 1,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('user_plans')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return res.status(201).json({ ...payload, id: data.id });
  } catch (err) {
    next(err);
  }
});

// Rota de diagnóstico: compara produto no Supabase e no pool Postgres
router.get('/debug-produto/:id', requireRole('super_admin'), async (req, res, next) => {
  const prodId = req.params.id;
  try {
    const supRes = await supabaseAdmin.from('produtos').select('*').eq('id', prodId).maybeSingle();
    let poolRow = null;
    try {
      const { pool } = require('../db');
      const dbRes = await pool.query('SELECT * FROM produtos WHERE id=$1', [prodId]);
      poolRow = dbRes.rows[0] || null;
    } catch (dbErr) {
      poolRow = { error: String(dbErr) };
    }

    res.json({ supabase: supRes.data || null, supabaseError: supRes.error || null, postgres: poolRow });
  } catch (err) {
    next(err);
  }
});

router.delete('/empresas/:id', requireRole('super_admin'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const limparEmpresa = async () => {
      const tabelas = ['produtos', 'clientes', 'funcionarios', 'transacoes', 'vendas', 'compras', 'fornecedores', 'caixas', 'contas_bancarias', 'cartoes', 'categorias_financeiras', 'pagamentos_moveis', 'contas_pagar', 'contas_receber', 'irps_escaloes', 'iva_lancamentos', 'imobilizado', 'orcamento', 'user_plans', 'movimentacoes_estoque'];

      for (const tabela of tabelas) {
        const { error } = await supabaseAdmin
          .from(tabela)
          .delete()
          .eq('empresa_id', req.params.id);

        if (error) {
          console.warn(`Aviso ao limpar ${tabela}:`, error.message);
        }
      }

      const { error: usuariosError } = await supabaseAdmin
        .from('usuarios')
        .delete()
        .eq('empresa_id', req.params.id);

      if (usuariosError) throw usuariosError;

      const { data, error: empresaError } = await supabaseAdmin
        .from('empresas')
        .delete()
        .eq('id', req.params.id)
        .select('id')
        .maybeSingle();

      if (empresaError) throw empresaError;
      if (!data) return res.status(404).json({ erro: 'Empresa não encontrada.' });
      res.status(204).send();
    };

    await limparEmpresa();
  } catch (err) {
    next(err);
  }
});

router.get('/backup/sql', requireRole('super_admin'), async (req, res, next) => {
  const databaseUrl = getDatabaseBackupUrl();

  if (!databaseUrl) {
    return res.status(400).json({
      erro: 'Backup SQL indisponível porque DATABASE_URL não está configurada. O sistema usa Supabase e as migrações passam a ser manuais; defina DATABASE_URL apenas para exportação de backup.'
    });
  }

  const dataHora = new Date().toISOString().replace(/[:.]/g, '-');

  execFile('pg_dump', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--inserts',
    databaseUrl,
  ], { maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      const message = error.code === 'ENOENT'
        ? 'O comando pg_dump não está instalado ou não está disponível no servidor.'
        : (stderr || error.message || 'Não foi possível gerar o backup SQL.');
      return res.status(503).json({ erro: message });
    }

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contafacil-backup-${dataHora}.sql"`);
    return res.send(stdout || '-- Backup vazio --\n');
  });
});

/* =========================================================
   UTILIZADORES — apenas super_admin
========================================================= */

router.get('/usuarios', requireRole('super_admin'), async (req, res, next) => {
  if (!ensureSupabase(req, res)) return;

  try {
    const { data: usuarios, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, nome, email, telefone, papel, criado_em, empresa_id')
      .order('criado_em', { ascending: false });

    if (error) throw error;

    const rows = await Promise.all((usuarios || []).map(async (usuario) => {
      const { data: empresa } = await supabaseAdmin
        .from('empresas')
        .select('nome_negocio')
        .eq('id', usuario.empresa_id)
        .maybeSingle();

      return {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        papel: usuario.papel,
        criado_em: usuario.criado_em,
        empresa_id: usuario.empresa_id,
        nome_negocio: empresa?.nome_negocio || '—',
      };
    }));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/usuarios', requireRole('super_admin'), async (req, res, next) => {
  const { nome, email, senha, telefone, papel } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  if (!['super_admin', 'visualizador', 'dono'].includes(papel)) {
    return res.status(400).json({ erro: 'Papel inválido.' });
  }
  if (!ensureSupabase(req, res)) return;

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .insert({
        empresa_id: req.user.empresaId,
        nome,
        email: String(email).trim().toLowerCase(),
        telefone: telefone || null,
        senha_hash: senhaHash,
        papel,
      })
      .select('id, nome, email, telefone, papel, criado_em')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/usuarios/:id/papel', requireRole('super_admin'), async (req, res, next) => {
  const { papel } = req.body;
  if (!['super_admin', 'dono', 'visualizador'].includes(papel)) {
    return res.status(400).json({ erro: 'Papel inválido.' });
  }
  if (!ensureSupabase(req, res)) return;

  try {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .update({ papel })
      .eq('id', req.params.id)
      .select('id, nome, email, papel')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Utilizador não encontrado.' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/usuarios/:id', requireRole('super_admin'), async (req, res, next) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ erro: 'Não pode remover a sua própria conta por aqui.' });
  }
  if (!ensureSupabase(req, res)) return;

  try {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Utilizador não encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
