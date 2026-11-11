-- Migracao 001: esquema inicial. Dinheiro em INTEGER centavos; datas em TEXT ISO 8601.

CREATE TABLE cliente (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,            -- CPF/CNPJ, opcional
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE veiculo (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
  placa TEXT NOT NULL UNIQUE CHECK (placa = upper(placa)),  -- maiusculas, sem hifen
  marca TEXT,
  modelo TEXT,
  ano INTEGER,
  cor TEXT,
  chassi TEXT,
  km_atual INTEGER
);

CREATE TABLE usuario (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('dono','atendente','mecanico')),
  comissao_pct REAL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE item_catalogo (
  id INTEGER PRIMARY KEY,
  tipo TEXT CHECK (tipo IN ('peca','servico')),
  codigo TEXT,
  descricao TEXT NOT NULL,
  preco_custo INTEGER DEFAULT 0,   -- centavos
  preco_venda INTEGER NOT NULL,    -- centavos
  estoque_atual REAL DEFAULT 0,
  estoque_minimo REAL DEFAULT 0,
  local_estoque TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ordem_servico (
  id INTEGER PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  veiculo_id INTEGER NOT NULL REFERENCES veiculo(id) ON DELETE RESTRICT,
  mecanico_id INTEGER REFERENCES usuario(id) ON DELETE RESTRICT,
  status TEXT DEFAULT 'orcamento' CHECK (status IN ('orcamento','aprovado','em_execucao','concluido','entregue','cancelado')),
  entrada_em TEXT,
  km_entrada INTEGER,
  combustivel TEXT,
  relato_cliente TEXT,
  diagnostico TEXT,
  validade_orcamento TEXT,
  aprovado_em TEXT,
  previsao_entrega TEXT,
  entregue_em TEXT,
  garantia_dias INTEGER DEFAULT 90,
  desconto INTEGER DEFAULT 0,      -- centavos
  observacoes TEXT,
  nf_servico_numero TEXT,
  nf_peca_numero TEXT
);

CREATE TABLE item_os (
  id INTEGER PRIMARY KEY,
  os_id INTEGER NOT NULL REFERENCES ordem_servico(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES item_catalogo(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  quantidade REAL DEFAULT 1,
  valor_unitario INTEGER NOT NULL,  -- centavos
  condicao TEXT DEFAULT 'nova' CHECK (condicao IN ('nova','original','usada')),
  terceiro INTEGER DEFAULT 0
);

CREATE TABLE pagamento (
  id INTEGER PRIMARY KEY,
  os_id INTEGER REFERENCES ordem_servico(id) ON DELETE RESTRICT,
  valor INTEGER NOT NULL,          -- centavos
  forma TEXT,
  vencimento TEXT,
  pago_em TEXT
);

CREATE TABLE movimento_estoque (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES item_catalogo(id) ON DELETE RESTRICT,
  os_id INTEGER REFERENCES ordem_servico(id) ON DELETE RESTRICT,
  quantidade REAL NOT NULL,
  motivo TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE checklist_entrada (
  id INTEGER PRIMARY KEY,
  os_id INTEGER NOT NULL REFERENCES ordem_servico(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  estado TEXT,
  foto BLOB
);

CREATE INDEX idx_os_status ON ordem_servico(status);
CREATE INDEX idx_os_veiculo ON ordem_servico(veiculo_id);
CREATE INDEX idx_item_os_os ON item_os(os_id);
CREATE INDEX idx_pagamento_os ON pagamento(os_id);
CREATE INDEX idx_mov_estoque_item ON movimento_estoque(item_id);