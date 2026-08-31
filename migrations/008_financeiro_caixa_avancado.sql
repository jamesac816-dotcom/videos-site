-- ContaFácil MZ — Migração 008: Financeiro avançado + Caixa avançado
-- Bancos, Cartões, Categorias geríveis, Conciliação bancária,
-- e Sangrias/Reforços como movimentos distintos de caixa.
-- Execute com: npm run migrate

-- ========================= BANCOS =========================
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome_banco       VARCHAR(100) NOT NULL,
  numero_conta     VARCHAR(50),
  titular          VARCHAR(150),
  tipo_conta       VARCHAR(30) NOT NULL DEFAULT 'Conta à Ordem',
  saldo_inicial    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_empresa ON contas_bancarias(empresa_id);

-- ========================= CARTÕES =========================
CREATE TABLE IF NOT EXISTS cartoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome               VARCHAR(100) NOT NULL,
  banco_emissor      VARCHAR(100),
  tipo               VARCHAR(10) NOT NULL DEFAULT 'Débito' CHECK (tipo IN ('Débito','Crédito')),
  ultimos_digitos    VARCHAR(4),
  limite             NUMERIC(14,2),
  conta_bancaria_id  UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  ativo              BOOLEAN NOT NULL DEFAULT true,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cartoes_empresa ON cartoes(empresa_id);

-- ========================= CATEGORIAS FINANCEIRAS GERÍVEIS =========================
CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('receita','despesa')),
  cor         VARCHAR(10) DEFAULT '#8598AB',
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, nome, tipo)
);
CREATE INDEX IF NOT EXISTS idx_categorias_financeiras_empresa ON categorias_financeiras(empresa_id, tipo);

-- Semeia as categorias que já existiam "fixas" no sistema, para as empresas
-- que já existem antes desta migração não perderem nada.
INSERT INTO categorias_financeiras (empresa_id, nome, tipo, cor)
SELECT e.id, cat.nome, cat.tipo, cat.cor
FROM empresas e
CROSS JOIN (VALUES
  ('Vendas','receita','#10B981'), ('Serviços','receita','#34D399'),
  ('Recebimento de Cliente','receita','#3B82F6'), ('Outras Receitas','receita','#2563EB'),
  ('Fornecedores','despesa','#2563EB'), ('Renda/Aluguer','despesa','#3B82F6'),
  ('Salários','despesa','#10B981'), ('Transporte','despesa','#34D399'),
  ('Energia/Água','despesa','#C98A1A'), ('Outras Despesas','despesa','#8598AB')
) AS cat(nome, tipo, cor)
ON CONFLICT (empresa_id, nome, tipo) DO NOTHING;

-- ========================= LIGAÇÕES EM TRANSAÇÕES (banco/cartão/conciliação) =========================
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES cartoes(id) ON DELETE SET NULL;
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS conciliado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMPTZ;

-- ========================= CAIXA — SANGRIAS E REFORÇOS =========================
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  caixa_sessao_id  UUID NOT NULL REFERENCES caixa_sessoes(id) ON DELETE CASCADE,
  usuario_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('sangria','reforco')),
  valor            NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  motivo           VARCHAR(255),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_sessao ON caixa_movimentos(caixa_sessao_id);

-- A sessão de caixa passa a guardar também os totais de sangrias/reforços no fecho
ALTER TABLE caixa_sessoes ADD COLUMN IF NOT EXISTS sangrias NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE caixa_sessoes ADD COLUMN IF NOT EXISTS reforcos NUMERIC(12,2) NOT NULL DEFAULT 0;
