-- Migracao multiusuario do MyFinance (Postgres / Neon).
-- Aditiva e idempotente (seguro rodar mais de uma vez): cria a tabela
-- `users` e adiciona `user_id` (ainda sem NOT NULL) em toda tabela
-- existente. O backfill (associar as linhas de hoje a um usuario) e a
-- troca pra NOT NULL ficam no script scripts/migrate-first-user.mjs,
-- que roda DEPOIS deste arquivo.
--
-- Rode uma vez: psql "$POSTGRES_URL" -f scripts/schema-multiuser.sql
-- (ou pelo SQL editor do Neon/Vercel).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles      ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE accounts      ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE categories    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE contacts      ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE cost_centers  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tags          ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transfers     ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE activity_log  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- settings era uma linha unica (id=1) pro app inteiro; agora e uma linha
-- por usuario. Mantem a coluna "id" (sem uso a partir de agora) por
-- simplicidade, so adiciona user_id e prepara pra virar a nova chave.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log (user_id);
