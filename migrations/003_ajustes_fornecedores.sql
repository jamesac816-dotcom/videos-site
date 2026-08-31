-- ContaFácil MZ — Migração 003: ajustes na tabela de fornecedores
-- O formulário do frontend também recolhe "Empresa" e "Produtos fornecidos",
-- que não existiam na tabela original. Esta migração acrescenta essas colunas
-- sem apagar nada do que já tem.
-- Execute com: npm run migrate

ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS empresa VARCHAR(150);
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS produtos_fornecidos VARCHAR(255);
