@AGENTS.md

# StockDan — Instruções para Claude

## Regra de Deploy Automático

**OBRIGATÓRIO após qualquer task de desenvolvimento concluída:**

```powershell
# Na pasta stockdan-app:
git add -A
git commit -m "feat/fix/chore: descrição concisa"
git push origin master
vercel --prod --yes
```

Ou usar o script: `pwsh scripts/deploy.ps1 "mensagem"`

## Stack e Configuração

- **Framework:** Next.js 16 App Router
- **Banco:** Supabase — projeto `omvsgnywqxviedksgpcr`
- **Auth:** JWT HTTP-only cookie (jose + bcryptjs), sem Supabase Auth
- **Proxy (middleware):** `proxy.ts` na raiz (Next.js 16 renomeou de middleware)
- **URL produção:** https://stockdan.vercel.app
- **GitHub:** https://github.com/orismarcc/StockDan

## Migrações de Banco

Qualquer ALTER TABLE ou nova tabela deve ser:
1. Adicionada em `supabase/schema.sql`
2. Executada via Supabase Management API ou painel SQL Editor
3. Comitada junto com o código que a usa

## Ambiente Local

```bash
cp .env.local.example .env.local  # preencher com credenciais
npm run dev
```

## Usuário Admin Inicial

- Email: `admin@stockdan.com`  
- Senha temporária: `StockDan@2026` (troca obrigatória no 1º acesso)
