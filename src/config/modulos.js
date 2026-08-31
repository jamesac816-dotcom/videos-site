// Lista de módulos do ContaFácil MZ ERP e quais ficam activos por omissão,
// consoante o tipo de negócio escolhido no onboarding.
//
// Módulos "core" (dashboard, perfil, configuracoes, notificações) não estão
// nesta lista porque estão sempre activos e não podem ser desligados.

const TODOS_OS_MODULOS = [
  'financeiro',       // Receitas, Despesas, Contas a Pagar, Contas a Receber
  'caixa',             // Abertura/Fecho de caixa
  'estoque',           // Produtos + Estoque
  'vendas',            // PDV / Ponto de Venda
  'clientes',          // Clientes + Crédito/Dívidas
  'fornecedores',      // Fornecedores + Compras
  'funcionarios',      // Gestão de Funcionários
  'relatorios',        // Relatórios com exportação
  'pagamentos_moveis', // M-Pesa / e-Mola
  'contabilidade',     // Módulo Empresarial: DRE, IVA, Folha de Salários, Imobilizado, Orçamento
];

// Conjuntos por omissão por tipo de negócio. Tipos não listados aqui usam
// PADRAO_GERAL. Isto é só o ponto de partida — o dono pode sempre ajustar
// depois em Configurações > Módulos.
const PADRAO_GERAL = ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'];

const MODULOS_POR_TIPO_NEGOCIO = {
  // Pequeno comércio, normalmente sem funcionários nem contabilidade formal
  'Mercearia':        ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'pagamentos_moveis'],
  'Quiosque':         ['financeiro', 'caixa', 'estoque', 'vendas', 'pagamentos_moveis'],
  'Banca de mercado':  ['financeiro', 'caixa', 'estoque', 'vendas', 'pagamentos_moveis'],
  'Padaria':          ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],
  'Talho':            ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],
  'Cafetaria':        ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'funcionarios', 'pagamentos_moveis'],

  // Comércio maior, com equipa e fornecedores
  'Supermercado':     [...TODOS_OS_MODULOS],
  'Armazém':          [...TODOS_OS_MODULOS],
  'Distribuidora':    [...TODOS_OS_MODULOS],
  'Farmácia':         ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'funcionarios', 'relatorios', 'pagamentos_moveis'],
  'Loja':             PADRAO_GERAL,
  'Boutique':         ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],
  'Loja de roupa':    ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],
  'Papelaria':        ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],
  'Ferragem':         ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],
  'Loja de eletrónicos': ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],

  // Serviços — estoque conta menos, mas ainda é útil para peças/produtos
  'Oficina':          ['financeiro', 'caixa', 'vendas', 'estoque', 'clientes', 'funcionarios', 'pagamentos_moveis'],
  'Salão de Beleza':  ['financeiro', 'caixa', 'vendas', 'estoque', 'clientes', 'funcionarios', 'pagamentos_moveis'],

  // Restauração — usa por agora o conjunto geral de retalho/PDV; o módulo
  // dedicado de Restaurante/Take Away (mesas, cozinha, delivery) ainda não
  // está implementado nesta versão.
  'Restaurante':      ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'funcionarios', 'pagamentos_moveis'],
  'Take Away':        ['financeiro', 'caixa', 'estoque', 'vendas', 'clientes', 'fornecedores', 'pagamentos_moveis'],

  'Empresa':          [...TODOS_OS_MODULOS],
  'Outro':            PADRAO_GERAL,
};

function modulosPorOmissao(tipoNegocio) {
  return MODULOS_POR_TIPO_NEGOCIO[tipoNegocio] || PADRAO_GERAL;
}

module.exports = { TODOS_OS_MODULOS, MODULOS_POR_TIPO_NEGOCIO, modulosPorOmissao };
