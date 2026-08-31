-- ContaFácil MZ — Esquema inicial da base de dados (PostgreSQL)
-- Execute com: psql -U contafacil_user -d contafacil -f migrations/001_init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================= EMPRESAS =========================
CREATE TABLE IF NOT EXISTS empresas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_negocio     VARCHAR(150) NOT NULL,
  tipo_negocio     VARCHAR(60),
  cidade           VARCHAR(100),
  endereco         VARCHAR(255),
  telefone         VARCHAR(30),
  logo_url         TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================= UTILIZADORES =========================
CREATE TABLE IF NOT EXISTS usuarios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome             VARCHAR(150) NOT NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  telefone         VARCHAR(30),
  senha_hash       TEXT NOT NULL,
  papel            VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (papel IN ('admin','funcionario')),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================= FORNECEDORES =========================
CREATE TABLE IF NOT EXISTS fornecedores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome             VARCHAR(150) NOT NULL,
  telefone         VARCHAR(30),
  email            VARCHAR(150),
  cidade           VARCHAR(100),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================= PRODUTOS =========================
CREATE TABLE IF NOT EXISTS produtos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome                   VARCHAR(150) NOT NULL,
  categoria              VARCHAR(100),
  marca                  VARCHAR(100),
  codigo_interno         VARCHAR(50),
  codigo_barras          VARCHAR(50),
  fornecedor_id          UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  descricao              TEXT,
  preco_compra           NUMERIC(12,2) NOT NULL DEFAULT 0,
  preco_venda_unidade    NUMERIC(12,2) NOT NULL DEFAULT 0,
  preco_venda_caixa      NUMERIC(12,2) NOT NULL DEFAULT 0,
  qtd_por_caixa          INTEGER NOT NULL DEFAULT 1 CHECK (qtd_por_caixa > 0),
  qtd_estoque_unidades   INTEGER NOT NULL DEFAULT 0 CHECK (qtd_estoque_unidades >= 0),
  qtd_minima_caixas      INTEGER NOT NULL DEFAULT 0,
  imagem_url             TEXT,
  status                 VARCHAR(10) NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Inativo')),
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id);

-- ========================= MOVIMENTAÇÕES DE ESTOQUE =========================
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id           UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  usuario_id           UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo                 VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','saida')),
  quantidade_unidades  INTEGER NOT NULL CHECK (quantidade_unidades > 0),
  motivo               VARCHAR(255),
  data                 DATE NOT NULL DEFAULT CURRENT_DATE,
  hora                 TIME NOT NULL DEFAULT CURRENT_TIME,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mov_estoque_produto ON movimentacoes_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_mov_estoque_empresa ON movimentacoes_estoque(empresa_id);

-- ========================= CLIENTES =========================
CREATE TABLE IF NOT EXISTS clientes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome             VARCHAR(150) NOT NULL,
  telefone         VARCHAR(30),
  email            VARCHAR(150),
  endereco         VARCHAR(255),
  nif              VARCHAR(30),
  saldo_devedor    NUMERIC(12,2) NOT NULL DEFAULT 0,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);

-- ========================= PAGAMENTOS DE CLIENTES =========================
CREATE TABLE IF NOT EXISTS pagamentos_clientes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  valor            NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente ON pagamentos_clientes(cliente_id);

-- ========================= TRANSAÇÕES (RECEITAS / DESPESAS) =========================
CREATE TABLE IF NOT EXISTS transacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('receita','despesa')),
  valor            NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  categoria        VARCHAR(100) NOT NULL,
  descricao        VARCHAR(255),
  cliente_id       UUID REFERENCES clientes(id) ON DELETE SET NULL,
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transacoes_empresa_data ON transacoes(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo ON transacoes(tipo);

-- Nota: as tabelas de Vendas, Compras, Caixa e Funcionários serão adicionadas
-- numa próxima migração, quando esses módulos forem implementados no frontend.
