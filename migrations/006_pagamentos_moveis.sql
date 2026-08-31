-- ContaFácil MZ — Migração 006: Pagamentos Móveis (M-Pesa / e-Mola)
-- Execute com: npm run migrate

CREATE TABLE IF NOT EXISTS pagamentos_moveis (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  venda_id              UUID REFERENCES vendas(id) ON DELETE SET NULL,
  provedor              VARCHAR(10) NOT NULL CHECK (provedor IN ('mpesa','emola')),
  telefone_cliente      VARCHAR(20) NOT NULL,
  valor                 NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  referencia_transacao  VARCHAR(50),   -- output_TransactionID (M-Pesa) ou equivalente
  id_conversa           VARCHAR(50),   -- output_ConversationID (M-Pesa) ou equivalente
  estado                VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','concluido','falhado')),
  modo_simulacao        BOOLEAN NOT NULL DEFAULT false, -- true quando não há credenciais reais configuradas
  mensagem              VARCHAR(255),
  resposta_bruta        JSONB,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_moveis_empresa ON pagamentos_moveis(empresa_id, criado_em);
