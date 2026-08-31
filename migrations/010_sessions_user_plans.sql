-- Migration: 010_sessions_user_plans.sql
-- Tabelas para sessões, planos atribuídos a utilizadores/empresas e registos de pagamento manuais

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_usuario ON sessions(usuario_id);

CREATE TABLE IF NOT EXISTS user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  months_paid INTEGER NOT NULL DEFAULT 1 CHECK (months_paid > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_plans_empresa ON user_plans(empresa_id);

CREATE TABLE IF NOT EXISTS plan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_plan_id UUID NOT NULL REFERENCES user_plans(id) ON DELETE CASCADE,
  pago_por_usuario_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  meses INTEGER NOT NULL CHECK (meses > 0),
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  metodo TEXT NOT NULL DEFAULT 'manual',
  referencia TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
