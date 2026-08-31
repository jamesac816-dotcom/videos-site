-- Migration: 009_planos.sql
-- Tabela para guardar os planos de assinatura (global e por empresa)

CREATE TABLE IF NOT EXISTS planos (
  id TEXT PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  preco NUMERIC(12,2) NOT NULL DEFAULT 0,
  recomendado BOOLEAN NOT NULL DEFAULT false,
  features JSONB DEFAULT '[]'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planos_empresa ON planos(empresa_id);
