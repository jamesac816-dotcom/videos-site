-- ContaFácil MZ — Migração 002: Vendas, Compras, Caixa, Funcionários
-- Execute com: npm run migrate  (aplica automaticamente todos os ficheiros novos em /migrations)

-- ========================= FUNCIONÁRIOS =========================
CREATE TABLE IF NOT EXISTS funcionarios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome             VARCHAR(150) NOT NULL,
  cargo            VARCHAR(100),
  telefone         VARCHAR(30),
  salario          NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           VARCHAR(10) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Inativo')),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id);

-- ========================= VENDAS (PDV) =========================
CREATE TABLE IF NOT EXISTS vendas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero           VARCHAR(30) NOT NULL,
  cliente_id       UUID REFERENCES clientes(id) ON DELETE SET NULL,
  usuario_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  forma_pagamento  VARCHAR(30) NOT NULL CHECK (forma_pagamento IN ('Dinheiro','M-Pesa','e-Mola','Transferência Bancária','Cartão')),
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  lucro            NUMERIC(12,2) NOT NULL DEFAULT 0,
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  hora             TIME NOT NULL DEFAULT CURRENT_TIME,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_data ON vendas(empresa_id, data);

CREATE TABLE IF NOT EXISTS itens_venda (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id         UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  produto_id       UUID NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade       INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario   NUMERIC(12,2) NOT NULL,
  custo_unitario   NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda ON itens_venda(venda_id);

-- ========================= COMPRAS =========================
CREATE TABLE IF NOT EXISTS compras (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fornecedor_id    UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  usuario_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compras_empresa_data ON compras(empresa_id, data);

CREATE TABLE IF NOT EXISTS itens_compra (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id        UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  produto_id       UUID NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  quantidade       INTEGER NOT NULL CHECK (quantidade > 0),
  custo_unitario   NUMERIC(12,2) NOT NULL,
  subtotal         NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_itens_compra_compra ON itens_compra(compra_id);

-- ========================= CAIXA =========================
CREATE TABLE IF NOT EXISTS caixa_sessoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_abertura_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_fecho_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  saldo_inicial         NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_final_contado   NUMERIC(12,2),
  entradas              NUMERIC(12,2) NOT NULL DEFAULT 0,
  saidas                NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferenca             NUMERIC(12,2),
  status                VARCHAR(10) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  aberto_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_em            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_caixa_empresa ON caixa_sessoes(empresa_id);
-- Garante que só existe uma sessão de caixa aberta de cada vez, por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixa_uma_sessao_aberta
  ON caixa_sessoes(empresa_id) WHERE status = 'aberto';

-- ========================= NOTIFICAÇÕES =========================
-- Registo persistente das notificações mais importantes (ex: para histórico/auditoria).
-- O frontend também calcula alertas em tempo real (estoque baixo, clientes devedores)
-- sem depender desta tabela — isto serve sobretudo para consulta posterior.
CREATE TABLE IF NOT EXISTS notificacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo             VARCHAR(30) NOT NULL CHECK (tipo IN ('estoque_baixo','cliente_devedor','pagamento_pendente','nova_venda','produto_vencendo')),
  titulo           VARCHAR(150) NOT NULL,
  mensagem         VARCHAR(255),
  lida             BOOLEAN NOT NULL DEFAULT false,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa ON notificacoes(empresa_id, lida);
