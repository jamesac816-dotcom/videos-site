-- ContaFácil MZ — Migração 005: Hierarquias de utilizadores
-- Três papéis:
--   super_admin   -> dono do SaaS. Vê e gere TODAS as empresas, sem restrição.
--   dono          -> dono de um negócio. Continua a ver SÓ a sua própria empresa
--                    (é o comportamento que já existia, só mudou o nome do papel).
--   visualizador  -> acesso só de leitura. Vê a lista de TODAS as empresas e os
--                    respectivos produtos, mas não pode criar/editar/apagar nada.
-- Execute com: npm run migrate

-- Migrar os valores antigos para os novos nomes de papel
UPDATE usuarios SET papel = 'dono' WHERE papel = 'admin';
UPDATE usuarios SET papel = 'dono' WHERE papel = 'funcionario';

-- Substituir a restrição antiga pela nova lista de papéis válidos
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('super_admin','dono','visualizador'));

ALTER TABLE usuarios ALTER COLUMN papel SET DEFAULT 'dono';
