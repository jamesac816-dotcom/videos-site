-- ContaFácil MZ — Migração 007: Arquitectura Modular (ERP por módulos)
-- Cada empresa passa a ter uma lista de módulos activos. O onboarding define
-- um conjunto por omissão consoante o tipo de negócio escolhido, e o dono
-- pode depois activar/desactivar em Configurações > Módulos.
-- Execute com: npm run migrate

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modulos_ativos TEXT[]
  DEFAULT ARRAY['financeiro','caixa','estoque','vendas','clientes','fornecedores','funcionarios','relatorios','pagamentos_moveis']::TEXT[];

-- Empresas já existentes (criadas antes desta migração) ficam com todos os
-- módulos activos, para não perderem acesso a nada que já usavam.
UPDATE empresas SET modulos_ativos = ARRAY[
  'financeiro','caixa','estoque','vendas','clientes','fornecedores',
  'funcionarios','relatorios','pagamentos_moveis','contabilidade'
]::TEXT[] WHERE modulos_ativos IS NULL OR array_length(modulos_ativos,1) IS NULL;
