# Minhas Finanças — versão Vercel (Next.js + Postgres)

Esta é a versão da plataforma de finanças pessoais pensada para rodar **na
nuvem, 24/7, mesmo com o seu PC desligado**. É a mesma interface e as mesmas
funcionalidades da [versão local](../financas-local), só que:

- o backend agora são **funções serverless do Next.js** (em vez de um
  servidor Python contínuo);
- os dados ficam num **banco Postgres na nuvem** (em vez de um arquivo JSON
  no seu disco);
- existe uma **tela de login por senha** (obrigatória, já que o app fica
  numa URL pública na internet).

## Passo a passo para publicar

### 1. Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou mais recente instalado no seu PC
  (para testar localmente e rodar `npm install`).
- Uma conta no [GitHub](https://github.com) (gratuita).
- Uma conta no [Vercel](https://vercel.com) (gratuita — pode entrar com sua
  conta do GitHub, sem precisar cartão de crédito).

### 2. Subir o código para o GitHub

```bash
cd "C:\Users\marco\OneDrive\financas-vercel"
git init
git add .
git commit -m "Plataforma de financas - versao Vercel"
```

Crie um repositório novo (privado) no GitHub e siga as instruções que ele
mostra para "push an existing repository":

```bash
git remote add origin https://github.com/SEU-USUARIO/financas-vercel.git
git branch -M main
git push -u origin main
```

### 3. Importar o projeto no Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e faça login com o
   GitHub.
2. Clique em **"Import"** no repositório `financas-vercel` que você acabou
   de criar.
3. Nas configurações de build, o Vercel já detecta que é um projeto
   Next.js — não precisa mudar nada. **Ainda não clique em Deploy** — antes
   crie o banco de dados (próximo passo), senão o primeiro deploy vai falhar
   por falta da variável `POSTGRES_URL`.

### 4. Criar o banco de dados (Postgres/Neon)

Dentro do projeto recém-importado no painel do Vercel:

1. Vá na aba **"Storage"**.
2. Clique em **"Create Database"** → escolha **"Neon" (Postgres)** (ou
   "Vercel Postgres", que também é Neon por baixo).
3. Confirme a criação e **conecte o banco a este projeto** quando
   perguntado. Isso adiciona automaticamente a variável de ambiente
   `POSTGRES_URL` (e outras relacionadas) ao projeto — você não precisa
   copiar nenhuma connection string manualmente.

### 5. Rodar o schema do banco (uma vez só)

O banco começa vazio — precisa criar as tabelas. Duas formas, escolha uma:

**Opção A — pelo painel do Vercel/Neon (mais simples):**
Na aba "Storage" → seu banco → aba **"Query"** (ou abra o painel do Neon
direto), cole todo o conteúdo de [`scripts/schema.sql`](scripts/schema.sql)
e execute.

**Opção B — pelo terminal**, depois de copiar a connection string da aba
"Storage" → ".env.local" (Vercel tem um botão "Show secret" / "Copy
snippet" para isso — evite colar a string em qualquer outro lugar):
```bash
psql "SUA_CONNECTION_STRING_AQUI" -f scripts/schema.sql
```

### 6. Definir a senha de acesso

Ainda no painel do Vercel: **Project Settings → Environment Variables** →
adicione:

| Nome | Valor |
|---|---|
| `APP_PASSWORD` | a senha que você quer usar para entrar no app |

### 7. Deploy

Volte na aba principal do projeto e clique em **"Deploy"** (ou, se já tinha
feito o primeiro deploy antes de configurar o banco, vá em **Deployments**
→ ⋯ → **Redeploy** para ele pegar as variáveis de ambiente novas).

Pronto — o Vercel te dá uma URL tipo `https://financas-vercel.vercel.app`.
Acesse, digite a senha que você definiu, e o app está no ar.

## Rodando localmente (opcional, para testar antes de publicar)

```bash
cd "C:\Users\marco\OneDrive\financas-vercel"
npm install
cp .env.example .env.local
# edite .env.local com a connection string do banco (aba Storage no Vercel,
# botão de copiar o .env.local pronto) e a senha que você quiser
npm run dev
```

Acesse `http://localhost:3000`.

## Estrutura do projeto

```
financas-vercel/
  app/api/**/route.ts   endpoints da API (equivalente ao server.py + db.py da versao local)
  lib/db.ts              regras de negocio + consultas Postgres (equivalente ao db.py)
  lib/auth.ts             login por senha unica + cookie assinado
  middleware.ts            trava o acesso a quem nao fez login
  public/                 frontend (HTML/CSS/JS puro — o MESMO da versao local, sem mudancas)
  scripts/schema.sql      schema do banco (rodar uma vez)
```

## Diferenças em relação à versão local

- **Login obrigatório** — uma senha única (variável `APP_PASSWORD`), sem
  cadastro de usuário nem recuperação de senha.
- **Dados no Postgres**, não num arquivo local. Backup agora é feito pelo
  botão *Exportar dados* (Configurações) ou pelas ferramentas de backup do
  Neon/Vercel (o Neon guarda histórico de pontos de restauração
  automaticamente, veja no painel dele).
- **Perfis/categorias padrão são criados pelo `schema.sql`**, não na
  primeira execução do servidor.
- Fora isso, a interface e as regras de negócio (parcelamento, recorrência,
  DRE, aging de contatos, relatórios) são **idênticas** à versão local —
  o mesmo `app.js`/`style.css`/`charts.js`, sem alterações.

## Não consegui testar isso localmente

Este projeto foi escrito sem um ambiente Node.js disponível para rodar
`npm install` / `npm run build` — não pude compilar ou testar antes de
entregar. Recomendo fortemente rodar `npm install && npm run build`
localmente (ou simplesmente deixar o Vercel buildar no primeiro deploy) e
me avisar se aparecer qualquer erro de compilação ou de runtime — corrijo
na hora.
