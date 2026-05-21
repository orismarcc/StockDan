# StockDan

Gestão de insumos agrícolas para múltiplas fazendas.

---

## Stack

- **Next.js 16** (App Router) · **Supabase** (PostgreSQL) · **Tailwind CSS v4**
- Auth própria via JWT em cookie HTTP-only (bcryptjs + jose)
- Deploy: Vercel

---

## Setup em 5 passos

### 1. Banco de dados — Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. **SQL Editor → New Query** → cole `supabase/schema.sql` → **Run**

### 2. Variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
JWT_SECRET=string_aleatoria_longa_e_segura
```

> Supabase → Project Settings → API → "Project URL" e "service_role"

### 3. Criar o primeiro administrador

```bash
npx tsx scripts/seed.ts
```

Cria: `admin@stockdan.com` / `StockDan@2026` *(troca de senha obrigatória no 1º acesso)*

### 4. Rodar localmente

```bash
npm install
npm run dev
# http://localhost:3000
```

### 5. Deploy (Vercel)

```bash
npx vercel --prod
```

Adicione as 3 variáveis de ambiente no painel da Vercel.

---

## Perfis

| Perfil    | Permissões                                         |
|-----------|----------------------------------------------------|
| Admin     | CRUD completo: fazendas, insumos, talhões, usuários |
| Operário  | Registrar retiradas (apenas fazendas vinculadas)    |

## Unidades

| Código | Significado                        |
|--------|------------------------------------|
| `kg`   | Quilogramas                        |
| `bag`  | Sacas — 1 bag = 1.000 kg (display) |
