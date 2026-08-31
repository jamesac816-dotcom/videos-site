// ContaFácil MZ — Integração e-Mola (Movitel)
//
// AVISO IMPORTANTE: ao contrário da M-Pesa, a Movitel não publica
// documentação técnica pública da API do e-Mola. Para integrar a sério,
// tem de contactar a Movitel directamente (normalmente através do
// departamento comercial/empresarial) para obter: o endpoint oficial, o
// formato exacto do pedido/resposta, e as credenciais de acesso.
//
// Este ficheiro está pronto para ligar assim que tiver essas informações:
// basta preencher EMOLA_API_URL, EMOLA_API_KEY e EMOLA_MERCHANT_ID no .env,
// e ajustar os nomes dos campos no corpo do pedido abaixo (marcados com
// "AJUSTAR") para corresponderem exactamente ao que a Movitel indicar.
//
// Modo de simulação: sem EMOLA_API_URL configurado, este serviço nunca faz
// nenhum pedido de rede — devolve sempre uma resposta simulada de sucesso,
// para o sistema continuar 100% utilizável em desenvolvimento/demo.

const API_URL = process.env.EMOLA_API_URL || null;
const API_KEY = process.env.EMOLA_API_KEY || null;
const MERCHANT_ID = process.env.EMOLA_MERCHANT_ID || null;

function estaConfigurado() {
  return !!(API_URL && API_KEY && MERCHANT_ID);
}

async function iniciarPagamentoC2B({ telefone, valor, referenciaTransacao }) {
  if (!estaConfigurado()) {
    return {
      simulado: true,
      sucesso: true,
      mensagem: 'Pedido processado com sucesso (SIMULAÇÃO — configure EMOLA_API_URL, EMOLA_API_KEY e EMOLA_MERCHANT_ID no .env depois de obter as credenciais junto da Movitel).',
      referencia: 'SIM-' + Date.now(),
    };
  }

  // AJUSTAR: nomes dos campos e cabeçalhos conforme a documentação que a
  // Movitel fornecer para a sua conta comercial.
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchantId: MERCHANT_ID,        // AJUSTAR
      customerMsisdn: telefone,       // AJUSTAR
      amount: valor,                  // AJUSTAR
      reference: referenciaTransacao, // AJUSTAR
    }),
  });
  const data = await res.json();
  return {
    simulado: false,
    sucesso: res.ok,
    ...data,
  };
}

module.exports = { estaConfigurado, iniciarPagamentoC2B };
