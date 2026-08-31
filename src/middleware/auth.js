const jwt = require('jsonwebtoken');

// Protege rotas: exige um token JWT válido no cabeçalho Authorization.
// O fluxo de autenticação passa a depender apenas do token assinado e do Supabase,
// sem verificar uma tabela local de sessões.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Sessão não iniciada. Faça login novamente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, empresaId: payload.empresaId, papel: payload.papel };
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sessão expirada ou inválida. Faça login novamente.' });
  }
}

module.exports = { requireAuth };

// Restringe uma rota a determinados papéis (ex: requireRole('super_admin')).
// Deve ser usado sempre DEPOIS de requireAuth, porque depende de req.user.papel.
function requireRole(...papeisPermitidos) {
  return (req, res, next) => {
    if (!req.user || !papeisPermitidos.includes(req.user.papel)) {
      return res.status(403).json({ erro: 'Não tem permissão para aceder a este recurso.' });
    }
    next();
  };
}

module.exports.requireRole = requireRole;
