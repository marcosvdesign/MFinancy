-- Adiciona status (pago/pendente) as transferencias, pra elas poderem ser
-- marcadas como pendentes (nao contam pro saldo ainda) igual lancamentos.
-- Aditivo/idempotente -- seguro rodar contra o banco em producao mesmo com
-- o codigo antigo (que nao sabe desse campo) ainda no ar: o default 'pago'
-- preserva o comportamento atual (toda transferencia ja existente sempre
-- contava pro saldo).
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pago';
