-- Schema da plataforma de financas pessoais (Postgres / Neon).
-- Rode este script UMA VEZ no seu banco (painel do Neon/Vercel -> aba "Query"
-- ou "SQL Editor", ou via `psql "$POSTGRES_URL" -f scripts/schema.sql`).
--
-- Datas (due_date, paid_date, date) sao guardadas como TEXT no formato
-- 'YYYY-MM-DD' de proposito: strings ISO comparam e ordenam corretamente
-- como se fossem datas, e isso evita de vez qualquer bug de fuso-horario
-- que o driver do Postgres poderia introduzir ao converter DATE <-> JS Date.

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2f6fed'
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'corrente',
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#1565c0',
  is_primary BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "group" TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#546e7a'
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cost_centers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#78909c'
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  "group" TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  cost_center_id TEXT REFERENCES cost_centers(id) ON DELETE SET NULL,
  tag_ids TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  due_date TEXT NOT NULL,
  paid_date TEXT,
  installment_group_id TEXT,
  installment_number INT,
  installment_total INT,
  recurrence_group_id TEXT,
  recurrence_frequency TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_due_date ON transactions (due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_paid_date ON transactions (paid_date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL,
  date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  display_name TEXT NOT NULL DEFAULT 'Você',
  prefs JSONB NOT NULL DEFAULT '{"default_profile_view":"all","confirm_paid_date":true}'
);

-- Dados iniciais (perfis, categorias padrao, preferencias). Seguro rodar
-- de novo: ON CONFLICT ignora o que ja existe.

INSERT INTO profiles (id, name, color) VALUES
  ('pessoal', 'Pessoal', '#2f6fed'),
  ('profissional', 'Profissional', '#1f9d55')
ON CONFLICT (id) DO NOTHING;

INSERT INTO settings (id, display_name, prefs) VALUES
  (1, 'Você', '{"default_profile_view":"all","confirm_paid_date":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, "group", color) VALUES
  ('cat-salario', 'Salário', 'recebimento', '#2e7d32'),
  ('cat-vendas', 'Vendas / Serviços', 'recebimento', '#388e3c'),
  ('cat-outros-receb', 'Outros recebimentos', 'recebimento', '#66bb6a'),
  ('cat-aluguel', 'Aluguel / Moradia', 'despesa_fixa', '#c62828'),
  ('cat-internet', 'Internet / Telefonia', 'despesa_fixa', '#8d6e63'),
  ('cat-assinaturas', 'Assinaturas', 'despesa_fixa', '#6d4c41'),
  ('cat-alimentacao', 'Alimentação', 'despesa_variavel', '#e64a19'),
  ('cat-transporte', 'Transporte', 'despesa_variavel', '#ef6c00'),
  ('cat-lazer', 'Lazer', 'despesa_variavel', '#8e24aa'),
  ('cat-outras-desp', 'Outras despesas', 'despesa_variavel', '#546e7a'),
  ('cat-funcionarios', 'Funcionários', 'pessoas', '#5c6bc0'),
  ('cat-prestadores', 'Prestadores de serviço', 'pessoas', '#7e57c2'),
  ('cat-impostos', 'Impostos e taxas', 'impostos', '#455a64')
ON CONFLICT (id) DO NOTHING;
