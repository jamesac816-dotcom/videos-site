const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const mpesaService = require('../services/mpesa.service');
const emolaService = require('../services/emola.service');

const router = express.Router();
router.use(requireAuth);

// GET /api/pagamentos/estado — diz ao frontend se cada provedor está ligado
// a credenciais reais ou a correr em modo de simulação (nunca expõe segredos)
router.get('/estado', (req, res) => {
  res.json({
    mpesa: { configurado: mpesaService.estaConfigurado() },
    emola: { configurado: emolaService.estaConfigurado() },
  });
});

// GET /api/pagamentos — histórico de pagamentos móveis da empresa
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM pagamentos_moveis WHERE empresa_id=$1 ORDER BY criado_em DESC LIMIT 200`,
      [req.user.empresaId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/pagamentos/mpesa/c2b — inicia um pedido de pagamento M-Pesa
// body: { telefone, valor, vendaId? }
router.post('/mpesa/c2b', async (req, res, next) => {
  const { telefone, valor, vendaId } = req.body;
  if (!telefone || !valor || valor <= 0) {
    return res.status(400).json({ erro: 'Telefone e valor são obrigatórios.' });
  }
  const referenciaTransacao = 'TXN' + Date.now();
  const referenciaTerceiro = 'REF' + Date.now();

  try {
    const resultado = await mpesaService.iniciarPagamentoC2B({
      telefone, valor, referenciaTransacao, referenciaTerceiro
    });

    const registoResult = await pool.query(
      `INSERT INTO pagamentos_moveis
        (empresa_id, venda_id, provedor, telefone_cliente, valor, referencia_transacao, id_conversa, estado, modo_simulacao, mensagem, resposta_bruta)
       VALUES ($1,$2,'mpesa',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.user.empresaId, vendaId || null, telefone, valor,
        resultado.output_TransactionID || null, resultado.output_ConversationID || null,
        resultado.sucesso ? 'concluido' : 'falhado', !!resultado.simulado,
        resultado.output_ResponseDesc || null, JSON.stringify(resultado)
      ]
    );

    res.status(resultado.sucesso ? 201 : 502).json({ sucesso: resultado.sucesso, simulado: !!resultado.simulado, registo: registoResult.rows[0] });
  } catch (err) {
    try {
      await pool.query(
        `INSERT INTO pagamentos_moveis (empresa_id, venda_id, provedor, telefone_cliente, valor, estado, modo_simulacao, mensagem)
         VALUES ($1,$2,'mpesa',$3,$4,'falhado',false,$5)`,
        [req.user.empresaId, vendaId || null, telefone, valor, err.message]
      );
    } catch (e) { /* não deixar um erro de log esconder o erro original */ }
    res.status(502).json({ erro: 'Falha ao contactar a M-Pesa: ' + err.message });
  }
});

// POST /api/pagamentos/emola/c2b — inicia um pedido de pagamento e-Mola
router.post('/emola/c2b', async (req, res, next) => {
  const { telefone, valor, vendaId } = req.body;
  if (!telefone || !valor || valor <= 0) {
    return res.status(400).json({ erro: 'Telefone e valor são obrigatórios.' });
  }
  const referenciaTransacao = 'TXN' + Date.now();

  try {
    const resultado = await emolaService.iniciarPagamentoC2B({ telefone, valor, referenciaTransacao });

    const registoResult = await pool.query(
      `INSERT INTO pagamentos_moveis
        (empresa_id, venda_id, provedor, telefone_cliente, valor, referencia_transacao, estado, modo_simulacao, mensagem, resposta_bruta)
       VALUES ($1,$2,'emola',$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.user.empresaId, vendaId || null, telefone, valor,
        resultado.referencia || referenciaTransacao,
        resultado.sucesso ? 'concluido' : 'falhado', !!resultado.simulado,
        resultado.mensagem || null, JSON.stringify(resultado)
      ]
    );

    res.status(resultado.sucesso ? 201 : 502).json({ sucesso: resultado.sucesso, simulado: !!resultado.simulado, registo: registoResult.rows[0] });
  } catch (err) {
    try {
      await pool.query(
        `INSERT INTO pagamentos_moveis (empresa_id, venda_id, provedor, telefone_cliente, valor, estado, modo_simulacao, mensagem)
         VALUES ($1,$2,'emola',$3,$4,'falhado',false,$5)`,
        [req.user.empresaId, vendaId || null, telefone, valor, err.message]
      );
    } catch (e) { /* idem */ }
    res.status(502).json({ erro: 'Falha ao contactar o e-Mola: ' + err.message });
  }
});

module.exports = router;
