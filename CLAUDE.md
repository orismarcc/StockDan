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

---

## Diretrizes de Comportamento (Karpathy Guidelines)

Behavioral guidelines to reduce common LLM coding mistakes. Derived from Andrej Karpathy's observations on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

> Source: [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
