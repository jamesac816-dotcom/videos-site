-- 1. Ver todas as tabelas existentes
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Ver quantas empresas existem
SELECT COUNT(*) AS total_empresas FROM empresas;

-- 3. Ver todas as empresas (com detalhes)
SELECT * FROM empresas;

-- 4. Ver quantos utilizadores existem
SELECT COUNT(*) AS total_utilizadores FROM usuarios;

-- 5. Ver todos os utilizadores (com papel/email)
SELECT id, nome, email, papel, empresa_id FROM usuarios;

-- 6. Ver quantas transações existem
SELECT COUNT(*) AS total_transacoes FROM transacoes;

-- 7. Ver se há alguma transação de exemplo
SELECT * FROM transacoes LIMIT 5;

-- 8. Ver a estrutura da tabela empresas (colunas)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'empresas' 
ORDER BY ordinal_position;

-- 9. Ver a estrutura da tabela usuarios
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'usuarios' 
ORDER BY ordinal_position;

-- 10. Verificar se a restrição de papel está correta (deve incluir 'super_admin', 'dono', 'visualizador')
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'usuarios'::regclass; 