// Middleware central de erros — mantém as respostas da API consistentes
// e evita expor detalhes internos (stack traces, SQL) ao cliente.
function errorHandler(err, req, res, next) {
  console.error(err);

  // Violação de restrição única do Postgres (ex: e-mail já registado)
  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Já existe um registo com esse valor único (ex: e-mail).' });
  }
  // Violação de chave estrangeira
  if (err.code === '23503') {
    return res.status(409).json({ erro: 'Operação inválida: existe um registo relacionado que impede esta ação.' });
  }
  // Violação de CHECK constraint
  if (err.code === '23514') {
    return res.status(400).json({ erro: 'Um dos valores enviados não é válido.' });
  }

  const status = err.status || 500;
  const mensagem = status === 500 ? 'Erro interno do servidor.' : err.message;
  res.status(status).json({ erro: mensagem });
}

function notFoundHandler(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.' });
}

module.exports = { errorHandler, notFoundHandler };
