-- ContaFácil MZ — Migração 004: Módulo Empresarial
-- (Dados fiscais da empresa, DRE por código PCAMC, IVA, Contas a Pagar,
--  Imobilizado, Orçamento vs Real, Folha de Salários com IRPS configurável)
-- Execute com: npm run migrate

-- ========================= DADOS FISCAIS DA EMPRESA =========================
-- Campos vistos na aba "Dados da Empresa" da planilha de referência.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nuit VARCHAR(20);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS forma_juridica VARCHAR(50);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS sector_actividade VARCHAR(150);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cae VARCHAR(20);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS capital_social NUMERIC(14,2) DEFAULT 0;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS data_constituicao DATE;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS regime_iva VARCHAR(20) DEFAULT 'Normal';
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS regime_irpc VARCHAR(20) DEFAULT 'Geral';
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS taxa_iva NUMERIC(6,4) DEFAULT 0.16;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS taxa_irpc NUMERIC(6,4) DEFAULT 0.32;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS numero_funcionarios INTEGER DEFAULT 0;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS responsavel_financeiro VARCHAR(150);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS contabilista_certificado VARCHAR(150);

-- ========================= DRE — código PCAMC por transação =========================
-- Permite mapear cada receita/despesa a uma rubrica oficial do Plano de Contas
-- (PCAMC), tal como na aba "DRE" da planilha. Fica opcional: se ficar vazio,
-- a rubrica é inferida a partir da categoria (ver mapeamento no frontend).
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS codigo_pcamc VARCHAR(10);

-- ========================= CONTAS A PAGAR (fornecedores) =========================
CREATE TABLE IF NOT EXISTS contas_pagar (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fornecedor_id    UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  descricao        VARCHAR(255),
  valor            NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_emissao     DATE,
  data_vencimento  DATE,
  estado           VARCHAR(20) NOT NULL DEFAULT 'Pendente' CHECK (estado IN ('Pendente','Pago','Vencido')),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_empresa ON contas_pagar(empresa_id);

-- ========================= IMOBILIZADO E DEPRECIAÇÕES =========================
CREATE TABLE IF NOT EXISTS imobilizado (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  descricao          VARCHAR(255) NOT NULL,
  categoria          VARCHAR(100),
  custo_aquisicao    NUMERIC(14,2) NOT NULL CHECK (custo_aquisicao >= 0),
  data_aquisicao     DATE NOT NULL,
  vida_util_anos     INTEGER NOT NULL DEFAULT 5 CHECK (vida_util_anos > 0),
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imobilizado_empresa ON imobilizado(empresa_id);

-- ========================= ORÇAMENTO VS REALIZADO =========================
CREATE TABLE IF NOT EXISTS orcamento (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  rubrica        VARCHAR(150) NOT NULL,
  tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('receita','despesa')),
  categorias     VARCHAR(255), -- lista de categorias de Transações incluídas nesta rubrica, separadas por vírgula
  valor_orcado   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ano            INTEGER NOT NULL DEFAULT extract(year from CURRENT_DATE),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, rubrica, ano)
);
CREATE INDEX IF NOT EXISTS idx_orcamento_empresa_ano ON orcamento(empresa_id, ano);

-- ========================= IRPS — ESCALÕES CONFIGURÁVEIS =========================
-- Os valores dos escalões e taxas NÃO vêm pré-preenchidos: a legislação está
-- em revisão (Lei n.º 11/2025, em vigor desde Jan/2026) e os valores exactos
-- devem ser confirmados junto do contabilista certificado / AT antes de usar
-- para folhas de salário reais.
CREATE TABLE IF NOT EXISTS irps_escaloes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ordem             INTEGER NOT NULL,
  limite_inferior   NUMERIC(12,2) NOT NULL DEFAULT 0,
  limite_superior   NUMERIC(12,2), -- NULL = escalão sem limite superior
  taxa              NUMERIC(6,4) NOT NULL DEFAULT 0,
  parcela_abater    NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE(empresa_id, ordem)
);
CREATE INDEX IF NOT EXISTS idx_irps_escaloes_empresa ON irps_escaloes(empresa_id);

-- ========================= IVA — LIVRO DE REGISTO =========================
CREATE TABLE IF NOT EXISTS iva_lancamentos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo               VARCHAR(12) NOT NULL CHECK (tipo IN ('liquidado','dedutivel')), -- liquidado = vendas, dedutivel = compras
  descricao          VARCHAR(255),
  base_tributavel    NUMERIC(14,2) NOT NULL CHECK (base_tributavel >= 0),
  taxa_iva           NUMERIC(6,4) NOT NULL DEFAULT 0.16,
  valor_iva          NUMERIC(14,2) NOT NULL,
  numero_fatura      VARCHAR(50),
  data               DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iva_empresa_data ON iva_lancamentos(empresa_id, data);
