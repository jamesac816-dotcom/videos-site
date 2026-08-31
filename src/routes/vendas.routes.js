const express = require('express');
const { pool } = require('../db');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Métodos de pagamento aceites no PDV
const METODOS_PAGAMENTO = ['Dinheiro', 'Pagamento Eletrônico', 'Saldo do Cliente', 'Saldo'];

const gerarNumeroVenda = async (empresaId, client) => {
  const { data, error } = await client
    .from('vendas')
    .select('numero')
    .eq('empresa_id', empresaId);

  if (error) throw error;

  let maiorNumero = 0;
  for (const row of data || []) {
    const match = /^REC-(\d+)$/.exec(row.numero || '');
    if (match) {
      const numeroAtual = Number(match[1]);
      if (numeroAtual > maiorNumero) maiorNumero = numeroAtual;
    }
  }

  return 'REC-' + String(maiorNumero + 1).padStart(5, '0');
};

const dataLocalISO = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
};

// GET /api/vendas
router.get('/', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);

    const { dataInicio, dataFim, limit } = req.query;
    let query = supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (dataInicio) query = query.gte('data', dataInicio);
    if (dataFim) query = query.lte('data', dataFim);

    const maxLimit = Number(limit || 50);
    const { data: vendasData, error: vendasError } = await query
      .order('data', { ascending: false })
      .order('hora', { ascending: false })
      .limit(Number.isFinite(maxLimit) && maxLimit > 0 ? Math.min(maxLimit, 200) : 50);

    if (vendasError) throw vendasError;

    const vendaIds = (vendasData || []).map(v => v.id);
    let itensPorVenda = new Map();

    if (vendaIds.length) {
      const { data: itensData, error: itensError } = await supabaseAdmin
        .from('itens_venda')
        .select('*')
        .in('venda_id', vendaIds);

      if (itensError) throw itensError;

      const produtoIds = [...new Set((itensData || []).map(i => i.produto_id).filter(Boolean))];
      let produtosMap = new Map();

      if (produtoIds.length) {
        const { data: produtosData, error: produtosError } = await supabaseAdmin
          .from('produtos')
          .select('id, nome')
          .in('id', produtoIds)
          .eq('empresa_id', req.user.empresaId);

        if (produtosError) throw produtosError;
        (produtosData || []).forEach(p => produtosMap.set(p.id, p.nome));
      }

      (itensData || []).forEach(item => {
        const vendaId = item.venda_id;
        const row = {
          produtoId: item.produto_id,
          produtoNome: produtosMap.get(item.produto_id) || 'Produto',
          quantidade: Number(item.quantidade || 0),
          precoUnitario: Number(item.preco_unitario || 0),
          subtotal: Number(item.subtotal || 0)
        };

        if (!itensPorVenda.has(vendaId)) itensPorVenda.set(vendaId, []);
        itensPorVenda.get(vendaId).push(row);
      });
    }

    const rows = (vendasData || []).map(venda => {
      const clienteNome = venda.cliente_id ? (venda.cliente_nome || 'Cliente') : 'Cliente não identificado';
      return {
        ...venda,
        cliente_nome: clienteNome,
        forma_pagamento: venda.forma_pagamento,
        total: Number(venda.total || 0),
        lucro: Number(venda.lucro || 0),
        itens: itensPorVenda.get(venda.id) || []
      };
    });

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/vendas
// body: { clienteId, formaPagamento, itens: [{ produtoId, quantidade }] }
// Verifica estoque, dá baixa automática, calcula o lucro (venda - custo) e
// lança a receita "Vendas" — tudo numa única transação atómica.
router.post('/', async (req, res, next) => {
  const { clienteId, formaPagamento, itens } = req.body;
  const appliedBalance = Number(req.body.appliedBalance || 0);

  console.log('[vendas] Recebido POST /vendas — empresa:', req.user.empresaId);
  console.log('[vendas] Payload:', JSON.stringify(req.body));

  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'A venda deve ter pelo menos um item.' });
  }
  if (!METODOS_PAGAMENTO.includes(formaPagamento)) {
    return res.status(400).json({ erro: 'Forma de pagamento inválida.' });
  }

  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    // Validação em lote: buscar produtos para a empresa
    const produtoIds = itens.map(i => i.produtoId);
    const { data: produtosData, error: produtosError } = await supabaseAdmin
      .from('produtos')
      .select('id, nome, qtd_estoque_unidades, preco_venda_unidade, preco_compra, empresa_id')
      .in('id', produtoIds)
      .eq('empresa_id', req.user.empresaId);

    if (produtosError) throw produtosError;

    const foundIds = new Set((produtosData || []).map(r => r.id));
    const missingIds = produtoIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      // tentar diagnosticar se existem noutra empresa
      const { data: otherRows } = await supabaseAdmin.from('produtos').select('id, empresa_id, nome').in('id', missingIds);
      return res.status(400).json({ erro: 'Alguns produtos não pertencem à empresa corrente ou não existem.', missingIds, details: otherRows || [] });
    }

    // Mapear produtos por id
    const produtosById = new Map((produtosData || []).map(r => [r.id, r]));

    let total = 0, custoTotal = 0;
    const itensProcessados = [];
    const updatedProducts = [];

    // Para cada item, tentar reduzir stock de forma condicional (otimista)
    for (const item of itens) {
      const produto = produtosById.get(item.produtoId);
      if (!produto) return res.status(404).json({ erro: `Produto não encontrado: ${item.produtoId}` });
      if (item.quantidade > produto.qtd_estoque_unidades) {
        return res.status(400).json({ erro: `Estoque insuficiente de "${produto.nome}". Existem apenas ${produto.qtd_estoque_unidades} unidades.` });
      }

      const novoStock = Number(produto.qtd_estoque_unidades) - Number(item.quantidade);

      // Atualizar condicionalmente usando valor anterior para evitar sobreposição
      const { data: upd, error: updErr } = await supabaseAdmin
        .from('produtos')
        .update({ qtd_estoque_unidades: novoStock })
        .eq('id', produto.id)
        .eq('empresa_id', req.user.empresaId)
        .eq('qtd_estoque_unidades', produto.qtd_estoque_unidades)
        .select()
        .single();

      if (updErr || !upd) {
        // Conflito concorrência: informar para tentar novamente
        // Fazer rollback parcial das actualizações já feitas
        for (const u of updatedProducts) {
          await supabaseAdmin.from('produtos').update({ qtd_estoque_unidades: Number(u.prev) + Number(u.amount) }).eq('id', u.id).eq('empresa_id', req.user.empresaId);
        }
        return res.status(409).json({ erro: 'Conflito ao actualizar stock. Por favor tente novamente.' });
      }

      updatedProducts.push({ id: produto.id, prev: produto.qtd_estoque_unidades, amount: item.quantidade });

      // registar movimentação de stock
      await supabaseAdmin.from('movimentacoes_estoque').insert({ empresa_id: req.user.empresaId, produto_id: produto.id, usuario_id: req.user.id, tipo: 'saida', quantidade_unidades: item.quantidade, motivo: 'Venda ao balcão (PDV)' });

      const subtotal = item.quantidade * Number(produto.preco_venda_unidade);
      total += subtotal;
      custoTotal += item.quantidade * Number(produto.preco_compra || 0);

      itensProcessados.push({ produtoId: produto.id, quantidade: item.quantidade, precoUnitario: produto.preco_venda_unidade, custoUnitario: produto.preco_compra, subtotal });
    }

    // Inserir venda
    const lucro = total - custoTotal;

    let vendaRow = null;
    let vendaErr = null;
    let numero = null;

    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      numero = await gerarNumeroVenda(req.user.empresaId, supabaseAdmin);
      const resultado = await supabaseAdmin.from('vendas').insert({
        empresa_id: req.user.empresaId,
        numero,
        cliente_id: clienteId || null,
        usuario_id: req.user.id,
        forma_pagamento: formaPagamento,
        total,
        custo_total: custoTotal,
        lucro
      }).select('*').single();

      if (resultado.error) {
        if (resultado.error?.code === '23505') {
          continue;
        }
        vendaErr = resultado.error;
        break;
      }

      vendaRow = resultado.data;
      break;
    }

    if (!vendaRow || vendaErr) {
      // rollback stock
      for (const u of updatedProducts) {
        await supabaseAdmin.from('produtos').update({ qtd_estoque_unidades: Number(u.prev) + Number(u.amount) }).eq('id', u.id).eq('empresa_id', req.user.empresaId);
      }
      throw vendaErr || new Error('Não foi possível guardar a venda.');
    }

    // Inserir itens_venda
    for (const item of itensProcessados) {
      await supabaseAdmin.from('itens_venda').insert({ venda_id: vendaRow.id, produto_id: item.produtoId, quantidade: item.quantidade, preco_unitario: item.precoUnitario, custo_unitario: item.custoUnitario, subtotal: item.subtotal });
    }

    // Inserir transação
    await supabaseAdmin.from('transacoes').insert({
      empresa_id: req.user.empresaId,
      tipo: 'receita',
      valor: total,
      categoria: 'Vendas',
      descricao: `Venda ${numero} (${formaPagamento})`,
      cliente_id: clienteId || null,
      data: dataLocalISO(),
    });

    // Regra de negócio da loja/mercearia:
    // - saldo_devedor < 0 = cliente tem crédito depositado na loja
    // - saldo_devedor > 0 = cliente tem dívida por compras em aberto
    // - cada venda consome esse crédito ou cria dívida: saldo = saldo + total - appliedBalance
    // - cada depósito do cliente aumenta o crédito / reduz a dívida: saldo = saldo - valor
    if (clienteId) {
      const { data: clienteData, error: clienteError } = await supabaseAdmin
        .from('clientes')
        .select('saldo_devedor')
        .eq('id', clienteId)
        .eq('empresa_id', req.user.empresaId)
        .maybeSingle();

      if (clienteError) throw clienteError;

      const saldoAtual = Number(clienteData?.saldo_devedor || 0);
      const saldoUsado = Math.min(Math.max(Number(appliedBalance || 0), 0), Number(total || 0));
      const novoSaldo = saldoAtual + Number(total) - saldoUsado;

      await supabaseAdmin
        .from('clientes')
        .update({ saldo_devedor: novoSaldo })
        .eq('id', clienteId)
        .eq('empresa_id', req.user.empresaId);
    }

    return res.status(201).json({ ...vendaRow, itens: itensProcessados });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
