-- Adiciona a coluna modulos_ativos à tabela empresas
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modulos_ativos JSONB DEFAULT '{}';

-- (Opcional) Adicione também outras colunas que possam estar em falta:
-- ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plano VARCHAR(30) DEFAULT 'gratuito';