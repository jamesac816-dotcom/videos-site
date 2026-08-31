// ContaFácil MZ — Integração M-Pesa (Vodacom Moçambique)
//
// Implementa o fluxo oficial da "M-Pesa Open API" da Vodacom:
//   1. Cifrar a Application Key com a chave pública fornecida pela Vodacom (RSA)
//   2. Pedir uma Session Key usando essa chave cifrada
//   3. Usar a Session Key para fazer o pedido de pagamento C2B (Customer to Business)
//
// IMPORTANTE — antes de usar em produção:
// A Vodacom entrega, no portal de desenvolvedores M-Pesa, um PDF com a
// documentação completa e as credenciais (Application Key, Chave Pública,
// Service Provider Code / Agent ID). Os caminhos exactos dos endpoints têm
// variado entre versões (v1x/v2) ao longo dos anos — confirme-os nesse PDF e
// ajuste as variáveis MPESA_* no .env se forem diferentes das aqui usadas por
// omissão. Este ficheiro segue a estrutura documentada publicamente e usada
// por vários integradores em Moçambique, mas SÓ a Vodacom pode confirmar os
// valores exactos para a sua conta.
//
// Modo de simulação: se MPESA_API_KEY não estiver definida no .env, este
// serviço nunca contacta a Vodacom — devolve uma resposta simulada de
// sucesso, para o sistema continuar 100% utilizável em desenvolvimento/demo.

const crypto = require('crypto');

const API_HOST = process.env.MPESA_API_HOST || 'api.sandbox.vm.co.mz';
const API_KEY = process.env.MPESA_API_KEY || null;
const PUBLIC_KEY = process.env.MPESA_PUBLIC_KEY || null;
const SERVICE_PROVIDER_CODE = process.env.MPESA_SERVICE_PROVIDER_CODE || null;
const ORIGIN = process.env.MPESA_ORIGIN || '*';

// Caminhos documentados da M-Pesa Open API (ajustáveis via .env se a Vodacom
// indicar uma versão diferente para a sua conta)
const CAMINHO_SESSION = process.env.MPESA_PATH_SESSION || '/ipg/v1x/vodacomMZ/getSessionKey/';
const CAMINHO_C2B = process.env.MPESA_PATH_C2B || '/ipg/v1x/c2bPayment/singleStage/';

function estaConfigurado() {
  return !!(API_KEY && PUBLIC_KEY && SERVICE_PROVIDER_CODE);
}

// Cifra a Application Key com a chave pública RSA fornecida pela Vodacom.
// É este valor cifrado que serve de "Bearer token" no pedido da Session Key.
function cifrarApplicationKey() {
  const chavePem = `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY}\n-----END PUBLIC KEY-----`;
  const buffer = Buffer.from(API_KEY, 'utf8');
  const cifrado = crypto.publicEncrypt(
    { key: chavePem, padding: crypto.constants.RSA_PKCS1_PADDING },
    buffer
  );
  return cifrado.toString('base64');
}

async function obterSessionKey() {
  const applicationKeyCifrada = cifrarApplicationKey();
  const res = await fetch(`https://${API_HOST}${CAMINHO_SESSION}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${applicationKeyCifrada}`,
      Origin: ORIGIN,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.output_SessionID) {
    throw new Error('Não foi possível obter a Session Key da M-Pesa: ' + JSON.stringify(data));
  }
  return data.output_SessionID;
}

// Inicia um pedido de pagamento C2B — a Vodacom envia um pedido de
// confirmação (PIN) para o telemóvel do cliente.
// telefone: formato 258XXXXXXXXX (sem "+")
async function iniciarPagamentoC2B({ telefone, valor, referenciaTransacao, referenciaTerceiro }) {
  if (!estaConfigurado()) {
    // Modo de simulação — sem credenciais reais, devolve sucesso simulado
    return {
      simulado: true,
      sucesso: true,
      output_ResponseCode: 'INS-0',
      output_ResponseDesc: 'Pedido processado com sucesso (SIMULAÇÃO — configure MPESA_API_KEY, MPESA_PUBLIC_KEY e MPESA_SERVICE_PROVIDER_CODE no .env do backend para ligar à Vodacom real).',
      output_TransactionID: 'SIM-' + Date.now(),
      output_ConversationID: 'SIM-CONV-' + Date.now(),
      output_ThirdPartyReference: referenciaTerceiro,
    };
  }

  const sessionKey = await obterSessionKey();
  const res = await fetch(`https://${API_HOST}${CAMINHO_C2B}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionKey}`,
      Origin: ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_TransactionReference: referenciaTransacao,
      input_CustomerMSISDN: telefone,
      input_Amount: String(valor),
      input_ThirdPartyReference: referenciaTerceiro,
      input_ServiceProviderCode: SERVICE_PROVIDER_CODE,
    }),
  });
  const data = await res.json();
  return {
    simulado: false,
    sucesso: data.output_ResponseCode === 'INS-0',
    ...data,
  };
}

module.exports = { estaConfigurado, iniciarPagamentoC2B };
