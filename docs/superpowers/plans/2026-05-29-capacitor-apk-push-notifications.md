# Capacitor APK + Firebase Push Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empacotar o StockDan como APK Android (`br.stockdan.app`) via Capacitor e adicionar push notifications Firebase para nova aplicação (saída) e estoque crítico.

**Architecture:** Capacitor WebView aponta para `https://stockdan-app.vercel.app` via `server.url` — nenhuma mudança no Next.js App Router. Firebase Admin SDK envia notificações server-side (Vercel) para tokens FCM armazenados no Supabase. Triggers são fire-and-forget após RPC `registrar_saida`.

**Tech Stack:** Capacitor 6, `@capacitor/push-notifications`, `firebase-admin`, Next.js 16 App Router, Supabase, Vercel, Android Studio

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260529000001_push_tokens.sql` | Criar | Tabela push_tokens com tenant isolation |
| `lib/fcm.ts` | Criar | Firebase Admin SDK singleton + sendPushNotification |
| `lib/notifications.ts` | Criar | Helpers de domínio: notifyTenant, notifyNovaAplicacao, notifyEstoqueCritico |
| `app/api/notifications/register/route.ts` | Criar | POST: salvar/atualizar FCM token do usuário autenticado |
| `hooks/useNotifications.ts` | Criar | Hook client: pedir permissão + registrar token + chamar API |
| `components/NotificationBootstrap.tsx` | Criar | Client component nulo que ativa o hook no layout |
| `capacitor.config.ts` | Criar | Config Capacitor: appId, server.url, plugins |
| `app/api/farms/[id]/transactions/route.ts` | Modificar | JOIN com min_quantity + farms(name) + triggers de notificação |
| `public/sw.js` | Modificar | Adicionar handlers push + notificationclick |
| `next.config.ts` | Modificar | CSP: adicionar FCM e googleapis ao connect-src |
| `app/(app)/layout.tsx` | Modificar | Incluir <NotificationBootstrap /> |
| `.gitignore` | Modificar | Ignorar google-services.json e android/ |
| `android/app/google-services.json` | Colocar | Credenciais Firebase Android (não commitado) |

---

## Task 1: Firebase — criar projeto e obter credenciais

**Files:**
- Cria: `android/app/google-services.json` (manual, não commitado)
- Cria: variáveis de env FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

- [ ] **Step 1: Criar projeto Firebase**

  Navegue até https://console.firebase.google.com
  → Clique em **"Adicionar projeto"** (ou "Create a project")
  → Nome do projeto: `StockDan`
  → Desative o Google Analytics (não precisamos)
  → Clique em **"Criar projeto"**

- [ ] **Step 2: Adicionar app Android**

  Na página do projeto → clique no ícone Android `</>` (ou "Adicionar app")
  → **Nome do pacote Android:** `br.stockdan.app`
  → **Apelido do app:** `StockDan`
  → Deixe o SHA-1 em branco por enquanto (não é obrigatório para FCM)
  → Clique em **"Registrar app"**

- [ ] **Step 3: Baixar google-services.json**

  Na tela seguinte, clique em **"Baixar google-services.json"**
  → Salve o arquivo. Ele vai para `android/app/google-services.json` depois (Task 15)
  → Clique em **"Próximo"** até o fim do wizard (pode pular as instruções do Android Studio)

- [ ] **Step 4: Criar Service Account para Admin SDK**

  No menu lateral Firebase → **Configurações do projeto** (ícone de engrenagem) → aba **"Contas de serviço"**
  → Clique em **"Gerar nova chave privada"**
  → Confirme → baixa um arquivo JSON com as credenciais

  Abra esse JSON e anote:
  - `"project_id"` → vai para `FIREBASE_PROJECT_ID`
  - `"client_email"` → vai para `FIREBASE_CLIENT_EMAIL`
  - `"private_key"` → vai para `FIREBASE_PRIVATE_KEY` (string longa com `\n`)

- [ ] **Step 5: Verificar**

  O projeto Firebase existe em https://console.firebase.google.com com o app Android `br.stockdan.app` registrado. Você tem o `google-services.json` salvo localmente e as 3 credenciais anotadas.

---

## Task 2: Supabase migration — tabela push_tokens

**Files:**
- Criar: `supabase/migrations/20260529000001_push_tokens.sql`

- [ ] **Step 1: Criar arquivo de migration**

  Crie o arquivo `supabase/migrations/20260529000001_push_tokens.sql` com o conteúdo exato:

  ```sql
  -- Migration: Push tokens para notificações Firebase (FCM)
  --
  -- PROBLEMA: sem persistência de tokens FCM, não é possível enviar push
  -- notifications para dispositivos Android do tenant.
  --
  -- SOLUÇÃO: tabela push_tokens com isolamento por gestor_id (P8).
  -- Upsert por fcm_token (UNIQUE) — token atualizado automaticamente se
  -- o usuário reinstalar o app. Cascade delete vinculado ao usuário.

  CREATE TABLE IF NOT EXISTS push_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gestor_id  UUID        NOT NULL,
    fcm_token  TEXT        NOT NULL UNIQUE,
    platform   TEXT        NOT NULL DEFAULT 'android',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  COMMENT ON TABLE push_tokens IS
    'FCM tokens para push notifications. Isolado por gestor_id (tenant). Upsert por fcm_token.';

  CREATE INDEX IF NOT EXISTS idx_push_tokens_gestor
    ON push_tokens(gestor_id);

  CREATE INDEX IF NOT EXISTS idx_push_tokens_user
    ON push_tokens(user_id);
  ```

- [ ] **Step 2: Verificar que a migration será aplicada no próximo build**

  A migration será aplicada automaticamente pelo `scripts/migrate.js` no próximo `npm run build` ou `vercel deploy`. Não precisa rodar manualmente agora — será aplicada na Task 16.

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/migrations/20260529000001_push_tokens.sql
  git commit -m "feat: migration push_tokens para FCM"
  ```

---

## Task 3: Instalar pacotes

**Files:**
- Modificar: `package.json`, `package-lock.json`

- [ ] **Step 1: Instalar Capacitor core + Android**

  ```bash
  cd C:\Users\Orismar\Documents\StockDan\stockdan-app
  npm install @capacitor/core @capacitor/cli @capacitor/android
  ```

  Expected output: `added N packages` sem erros fatais.

- [ ] **Step 2: Instalar plugins nativos Capacitor**

  ```bash
  npm install @capacitor/push-notifications @capacitor/status-bar @capacitor/splash-screen @capacitor/app
  ```

- [ ] **Step 3: Instalar Firebase Admin SDK (server-side)**

  ```bash
  npm install firebase-admin
  ```

- [ ] **Step 4: Verificar instalação**

  ```bash
  npx cap --version
  ```

  Expected: `Capacitor CLI version 6.x.x` (ou similar, >= 6)

- [ ] **Step 5: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "feat: instalar Capacitor + Firebase Admin SDK"
  ```

---

## Task 4: Variáveis de ambiente

**Files:**
- Modificar: `.env.local`
- Ação externa: adicionar no Vercel

- [ ] **Step 1: Adicionar ao `.env.local`**

  Abra `.env.local` e adicione ao final (use os valores do JSON do service account da Task 1):

  ```
  FIREBASE_PROJECT_ID=stockdan-XXXXX
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@stockdan-xxxxx.iam.gserviceaccount.com
  FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n"
  ```

  ⚠️ O `FIREBASE_PRIVATE_KEY` deve estar entre aspas duplas e ter os `\n` literais (não quebras de linha reais) — copie exatamente como está no JSON do service account.

- [ ] **Step 2: Adicionar FIREBASE_PROJECT_ID no Vercel**

  ```bash
  echo "SEU_PROJECT_ID" | npx vercel env add FIREBASE_PROJECT_ID production
  ```

- [ ] **Step 3: Adicionar FIREBASE_CLIENT_EMAIL no Vercel**

  ```bash
  echo "SEU_CLIENT_EMAIL" | npx vercel env add FIREBASE_CLIENT_EMAIL production
  ```

- [ ] **Step 4: Adicionar FIREBASE_PRIVATE_KEY no Vercel**

  ⚠️ A private key tem caracteres especiais — use um arquivo temporário:

  ```bash
  # Crie um arquivo temp com a chave (inclua as aspas e \n literais)
  # Depois:
  npx vercel env add FIREBASE_PRIVATE_KEY production
  # Cole a chave quando solicitado (Ctrl+C para encerrar input no Windows: Ctrl+Z Enter)
  ```

  Ou adicione manualmente no dashboard do Vercel: Settings → Environment Variables.

- [ ] **Step 5: Verificar vars no Vercel**

  ```bash
  npx vercel env ls production
  ```

  Expected: lista mostra `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

---

## Task 5: `lib/fcm.ts` — Firebase Admin SDK

**Files:**
- Criar: `lib/fcm.ts`

- [ ] **Step 1: Criar `lib/fcm.ts`**

  ```ts
  // lib/fcm.ts
  //
  // Firebase Admin SDK singleton para envio de push notifications via FCM.
  // Fire-and-forget: erros são logados mas nunca lançados — falha de push
  // não deve falhar a operação principal (mesma filosofia de logAudit).
  //
  // Limpeza automática: tokens inválidos (registration-token-not-registered)
  // são removidos do Supabase para evitar acumular tokens mortos.

  import admin from 'firebase-admin'
  import { createServerClient } from './supabase'

  function getFirebaseApp(): admin.app.App {
    if (admin.apps.length > 0) return admin.apps[0]!
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel armazena \n como literal — precisa converter de volta
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }

  /**
   * Envia push notification para uma lista de FCM tokens.
   * Fire-and-forget — nunca lança exceção.
   * Remove automaticamente tokens inválidos do banco.
   */
  export async function sendPushNotification(
    tokens: string[],
    title: string,
    body: string
  ): Promise<void> {
    if (!tokens.length) return

    try {
      const app       = getFirebaseApp()
      const messaging = admin.messaging(app)

      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        android: {
          notification: {
            color:       '#22c55e',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
          priority: 'high',
        },
      })

      // Remove tokens que o FCM reportou como inválidos
      const invalidTokens: string[] = []
      response.responses.forEach((r, i) => {
        if (
          !r.success &&
          r.error?.code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[i])
        }
      })

      if (invalidTokens.length > 0) {
        const supabase = createServerClient()
        await supabase
          .from('push_tokens')
          .delete()
          .in('fcm_token', invalidTokens)
        console.log(`[fcm] Removidos ${invalidTokens.length} token(s) inválido(s).`)
      }
    } catch (e) {
      console.error('[fcm] sendPushNotification error:', e)
    }
  }
  ```

- [ ] **Step 2: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/fcm.ts
  git commit -m "feat: lib/fcm.ts — Firebase Admin SDK para push notifications"
  ```

---

## Task 6: `lib/notifications.ts` — helpers de domínio

**Files:**
- Criar: `lib/notifications.ts`

- [ ] **Step 1: Criar `lib/notifications.ts`**

  ```ts
  // lib/notifications.ts
  //
  // Helpers de domínio para push notifications.
  // Busca tokens FCM de gestores e admins do tenant e envia via FCM.
  // Todos os exports são fire-and-forget (catch interno, nunca lança).

  import { createServerClient } from './supabase'
  import { sendPushNotification } from './fcm'

  /**
   * Busca todos os FCM tokens de usuários com cargo gestor ou admin
   * do tenant identificado por gestorId. (P8: isolamento de tenant)
   */
  async function getGestorAdminTokens(gestorId: string): Promise<string[]> {
    const supabase = createServerClient()

    // Busca IDs de gestor + admins no tenant
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('gestor_id', gestorId)
      .in('role', ['gestor', 'admin'])

    if (!users?.length) return []

    const userIds = users.map((u) => u.id)

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('fcm_token')
      .in('user_id', userIds)

    return (tokens ?? []).map((t) => t.fcm_token)
  }

  /**
   * Envia notificação para todos os gestores e admins de um tenant.
   * Fire-and-forget — nunca lança exceção.
   */
  export async function notifyTenant(
    gestorId: string,
    title: string,
    body: string
  ): Promise<void> {
    try {
      const tokens = await getGestorAdminTokens(gestorId)
      if (!tokens.length) return
      await sendPushNotification(tokens, title, body)
    } catch (e) {
      console.error('[notifications] notifyTenant error:', e)
    }
  }

  /**
   * Notificação de nova aplicação (saída de estoque).
   * Exemplo: "João Silva aplicou 50 kg de MAP no Talhão 01"
   */
  export async function notifyNovaAplicacao(params: {
    gestorId:    string
    userName:    string
    insumoTitle: string
    talhaoName:  string
    quantity:    number
    unit:        string
  }): Promise<void> {
    const qty  = params.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    const body = `${params.userName} aplicou ${qty} ${params.unit} de ${params.insumoTitle} no ${params.talhaoName}`
    await notifyTenant(params.gestorId, 'Nova Aplicação Registrada', body)
  }

  /**
   * Notificação de estoque abaixo do mínimo.
   * Exemplo: "MAP em Sítio Portuga: 3.000 kg (mín: 5.000 kg)"
   */
  export async function notifyEstoqueCritico(params: {
    gestorId:    string
    farmName:    string
    insumoTitle: string
    currentQty:  number
    minQty:      number
    unit:        string
  }): Promise<void> {
    const current = params.currentQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    const min     = params.minQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    const body    = `${params.insumoTitle} em ${params.farmName}: ${current} ${params.unit} (mín: ${min} ${params.unit})`
    await notifyTenant(params.gestorId, '⚠️ Estoque Crítico', body)
  }
  ```

- [ ] **Step 2: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/notifications.ts
  git commit -m "feat: lib/notifications.ts — helpers notifyNovaAplicacao + notifyEstoqueCritico"
  ```

---

## Task 7: Rota `/api/notifications/register`

**Files:**
- Criar: `app/api/notifications/register/route.ts`

- [ ] **Step 1: Criar diretório e arquivo**

  Crie `app/api/notifications/register/route.ts`:

  ```ts
  // app/api/notifications/register/route.ts
  //
  // Registra ou atualiza o FCM token do usuário autenticado.
  // Upsert por fcm_token (UNIQUE) — garante que reinstalar o app
  // não cria duplicatas, apenas atualiza o vínculo user_id.
  //
  // P10: usa withAuth — handler nunca roda sem sessão.
  // P8: gestor_id vem da sessão — nunca do body.

  import { NextRequest, NextResponse } from 'next/server'
  import { createServerClient } from '@/lib/supabase'
  import { parseBody } from '@/lib/utils'
  import { withAuth } from '@/lib/withAuth'

  export const POST = withAuth(async (req, session) => {
    const body = await parseBody<{ fcm_token?: string; platform?: string }>(req)
    if (!body?.fcm_token) {
      return NextResponse.json({ error: 'fcm_token é obrigatório.' }, { status: 400 })
    }

    const { fcm_token, platform = 'android' } = body

    if (typeof fcm_token !== 'string' || fcm_token.length < 10) {
      return NextResponse.json({ error: 'fcm_token inválido.' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id:   session.id,
          gestor_id: session.gestor_id,
          fcm_token,
          platform,
        },
        { onConflict: 'fcm_token' }
      )

    if (error) {
      return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  })
  ```

- [ ] **Step 2: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/notifications/register/route.ts
  git commit -m "feat: POST /api/notifications/register — registrar FCM token"
  ```

---

## Task 8: Triggers de notificação na rota de transações

**Files:**
- Modificar: `app/api/farms/[id]/transactions/route.ts`

- [ ] **Step 1: Adicionar import de notifications**

  No topo do arquivo `app/api/farms/[id]/transactions/route.ts`, adicione:

  ```ts
  import { notifyNovaAplicacao, notifyEstoqueCritico } from '@/lib/notifications'
  ```

  (Adicionar junto com os imports existentes.)

- [ ] **Step 2: Atualizar o SELECT final para incluir min_quantity e farms(name)**

  Localize a linha:
  ```ts
  const { data: tx } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .eq('id', transaction_id)
    .single()
  ```

  Substitua por:
  ```ts
  const { data: tx } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit, min_quantity), talhoes(id, name), users(name), farms(name)')
    .eq('id', transaction_id)
    .single()
  ```

- [ ] **Step 3: Adicionar triggers de notificação após o SELECT**

  Localize a linha de return final do POST:
  ```ts
  return NextResponse.json({ ok: true, transaction: tx, newQuantity: new_quantity }, { status: 201 })
  ```

  Substitua por:
  ```ts
  // Fire-and-forget: notificações não bloqueiam o response (P11)
  if (tx) {
    const insumo   = tx.insumos   as { title: string; unit: string; min_quantity: number | null } | null
    const talhao   = tx.talhoes   as { id: string; name: string } | null
    const user     = tx.users     as { name: string } | null
    const farm     = tx.farms     as { name: string } | null

    void notifyNovaAplicacao({
      gestorId:    session.gestor_id,
      userName:    user?.name    ?? 'Usuário',
      insumoTitle: insumo?.title ?? 'Insumo',
      talhaoName:  talhao?.name  ?? 'Talhão',
      quantity:    Number(quantity),
      unit:        insumo?.unit  ?? 'kg',
    })

    if (
      insumo?.min_quantity != null &&
      new_quantity < insumo.min_quantity
    ) {
      void notifyEstoqueCritico({
        gestorId:    session.gestor_id,
        farmName:    farm?.name    ?? 'Fazenda',
        insumoTitle: insumo.title,
        currentQty:  new_quantity,
        minQty:      insumo.min_quantity,
        unit:        insumo.unit,
      })
    }
  }

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: new_quantity }, { status: 201 })
  ```

- [ ] **Step 4: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/farms/[id]/transactions/route.ts
  git commit -m "feat: triggers notificação FCM em registrar_saida (nova aplicação + estoque crítico)"
  ```

---

## Task 9: `public/sw.js` — handlers push e notificationclick

**Files:**
- Modificar: `public/sw.js`

- [ ] **Step 1: Adicionar handlers ao final do `public/sw.js`**

  Abra `public/sw.js` e adicione ao final do arquivo (após a última linha existente):

  ```js
  // ── Push notifications (FCM via WebView fallback) ────────────────────────────
  // Exibe notificação quando o app está em background no Android WebView.
  // No Capacitor nativo, o @capacitor/push-notifications trata isso —
  // este handler é o fallback para garantia.
  self.addEventListener('push', (event) => {
    if (!event.data) return
    let payload = {}
    try { payload = event.data.json() } catch { payload = {} }

    const title   = payload?.notification?.title ?? 'StockDan'
    const body    = payload?.notification?.body  ?? ''
    const options = {
      body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-192-maskable.png',
      data:  payload?.data ?? {},
    }

    event.waitUntil(self.registration.showNotification(title, options))
  })

  // Abre o app no dashboard ao clicar na notificação
  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    event.waitUntil(
      clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          const existing = clientList.find((c) => c.url.includes(self.location.origin))
          if (existing) return existing.focus()
          return clients.openWindow('/dashboard')
        })
    )
  })
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add public/sw.js
  git commit -m "feat: sw.js — handlers push + notificationclick para FCM"
  ```

---

## Task 10: `next.config.ts` — atualizar CSP para Firebase

**Files:**
- Modificar: `next.config.ts`

- [ ] **Step 1: Atualizar a linha `connect-src` no CSP**

  Localize no `next.config.ts`:
  ```ts
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  ```

  Substitua por:
  ```ts
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://fcm.googleapis.com https://firebaseinstallations.googleapis.com https://*.googleapis.com`,
  ```

- [ ] **Step 2: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add next.config.ts
  git commit -m "fix: CSP — adicionar Firebase FCM e googleapis ao connect-src"
  ```

---

## Task 11: `capacitor.config.ts` + inicializar Capacitor + plataforma Android

**Files:**
- Criar: `capacitor.config.ts`
- Criar: `android/` (gerado por `npx cap add android`)

- [ ] **Step 1: Criar `capacitor.config.ts` na raiz do projeto**

  ```ts
  import type { CapacitorConfig } from '@capacitor/cli'

  const config: CapacitorConfig = {
    appId:   'br.stockdan.app',
    appName: 'StockDan',
    // webDir não é usado (server.url tem precedência),
    // mas o Capacitor exige o campo
    webDir:  'public',
    server: {
      // Carrega o app em produção diretamente do Vercel.
      // Atualizações de código não exigem re-publicação do APK.
      url:       'https://stockdan-app.vercel.app',
      cleartext: false,
    },
    plugins: {
      PushNotifications: {
        presentationOptions: ['badge', 'sound', 'alert'],
      },
      SplashScreen: {
        launchShowDuration:        1500,
        backgroundColor:           '#030712',
        androidSplashResourceName: 'splash',
        showSpinner:               false,
        androidScaleType:          'CENTER_CROP',
      },
      StatusBar: {
        style:           'Dark',
        backgroundColor: '#030712',
      },
    },
  }

  export default config
  ```

- [ ] **Step 2: Inicializar Capacitor**

  ```bash
  cd C:\Users\Orismar\Documents\StockDan\stockdan-app
  npx cap init "StockDan" "br.stockdan.app" --web-dir public
  ```

  Se perguntar se quer sobrescrever o capacitor.config.ts, responda **N** (já criamos o correto).

- [ ] **Step 3: Adicionar plataforma Android**

  ```bash
  npx cap add android
  ```

  Expected: cria pasta `android/` com projeto Android Studio.

- [ ] **Step 4: Atualizar `.gitignore`**

  Abra `.gitignore` e adicione ao final:

  ```
  # Android (gerado pelo Capacitor)
  android/
  # Firebase credentials — NUNCA commitir
  google-services.json
  **/google-services.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add capacitor.config.ts .gitignore
  git commit -m "feat: capacitor.config.ts — WebView br.stockdan.app aponta para Vercel"
  ```

---

## Task 12: `hooks/useNotifications.ts` + `components/NotificationBootstrap.tsx`

**Files:**
- Criar: `hooks/useNotifications.ts`
- Criar: `components/NotificationBootstrap.tsx`

- [ ] **Step 1: Criar `hooks/useNotifications.ts`**

  ```ts
  // hooks/useNotifications.ts
  //
  // Solicita permissão de push notification e registra o FCM token
  // no Supabase via /api/notifications/register.
  //
  // Só funciona no Capacitor nativo (Android). Em browsers web,
  // Capacitor.isNativePlatform() retorna false e o hook não faz nada.
  // Flag em localStorage evita re-registro a cada render.

  'use client'

  import { useEffect } from 'react'

  const REGISTERED_KEY = 'stockdan_push_registered'

  export function useNotifications() {
    useEffect(() => {
      async function registerPush() {
        // Importação dinâmica — evita erro no browser onde Capacitor não existe
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return

        // Evita re-registro desnecessário em cada mount
        if (localStorage.getItem(REGISTERED_KEY) === '1') return

        const { PushNotifications } = await import('@capacitor/push-notifications')

        // Verifica permissão atual
        let permStatus = await PushNotifications.checkPermissions()

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions()
        }

        if (permStatus.receive !== 'granted') {
          console.warn('[push] Permissão negada.')
          return
        }

        // Registra com FCM — resultado vem via listener 'registration'
        await PushNotifications.register()

        PushNotifications.addListener('registration', async (token) => {
          try {
            const res = await fetch('/api/notifications/register', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ fcm_token: token.value, platform: 'android' }),
            })
            if (res.ok) {
              localStorage.setItem(REGISTERED_KEY, '1')
              console.log('[push] Token FCM registrado com sucesso.')
            }
          } catch (e) {
            console.error('[push] Erro ao registrar token:', e)
          }
        })

        PushNotifications.addListener('registrationError', (err) => {
          console.error('[push] Erro de registro FCM:', err.error)
        })
      }

      registerPush()
    }, [])
  }
  ```

- [ ] **Step 2: Criar `components/NotificationBootstrap.tsx`**

  ```tsx
  // components/NotificationBootstrap.tsx
  //
  // Componente nulo (não renderiza nada) que ativa o hook de push
  // notifications. Inserido no layout para rodar uma vez por sessão.
  // Precisa ser 'use client' porque usa useEffect.

  'use client'

  import { useNotifications } from '@/hooks/useNotifications'

  export function NotificationBootstrap() {
    useNotifications()
    return null
  }
  ```

- [ ] **Step 3: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 4: Commit**

  ```bash
  git add hooks/useNotifications.ts components/NotificationBootstrap.tsx
  git commit -m "feat: useNotifications hook + NotificationBootstrap para registro FCM"
  ```

---

## Task 13: Integrar `NotificationBootstrap` no layout do app

**Files:**
- Modificar: `app/(app)/layout.tsx`

- [ ] **Step 1: Atualizar `app/(app)/layout.tsx`**

  O arquivo atual é:

  ```tsx
  import { redirect } from 'next/navigation'
  import { getSession } from '@/lib/auth'
  import { AppShell } from '@/components/AppShell'

  export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (session.mustChangePassword) redirect('/change-password')

    return (
      <AppShell role={session.role} userName={session.name}>
        {children}
      </AppShell>
    )
  }
  ```

  Substitua pelo conteúdo completo:

  ```tsx
  import { redirect } from 'next/navigation'
  import { getSession } from '@/lib/auth'
  import { AppShell } from '@/components/AppShell'
  import { NotificationBootstrap } from '@/components/NotificationBootstrap'

  export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (session.mustChangePassword) redirect('/change-password')

    return (
      <>
        {/* Registra FCM token silenciosamente — só ativo no APK Android */}
        <NotificationBootstrap />
        <AppShell role={session.role} userName={session.name}>
          {children}
        </AppShell>
      </>
    )
  }
  ```

- [ ] **Step 2: Verificar TypeScript**

  ```bash
  npx tsc --noEmit
  ```

  Expected: sem erros.

- [ ] **Step 3: Commit**

  ```bash
  git add app/(app)/layout.tsx
  git commit -m "feat: NotificationBootstrap no layout do app — ativa push notifications no APK"
  ```

---

## Task 14: Configurar Android — google-services.json + build.gradle

**Files:**
- Colocar: `android/app/google-services.json` (manual, não commitado)
- Verificar: `android/app/build.gradle`

- [ ] **Step 1: Copiar google-services.json para o projeto Android**

  Copie o arquivo `google-services.json` que você baixou da Task 1 para:
  ```
  C:\Users\Orismar\Documents\StockDan\stockdan-app\android\app\google-services.json
  ```

  ⚠️ Este arquivo **não é commitado** (já está no .gitignore). Guarde-o em local seguro.

- [ ] **Step 2: Verificar applicationId no build.gradle**

  Abra `android/app/build.gradle` e confirme que o `applicationId` está correto:

  ```groovy
  android {
      defaultConfig {
          applicationId "br.stockdan.app"
          // ...
      }
  }
  ```

  Se não estiver `br.stockdan.app`, altere manualmente.

- [ ] **Step 3: Verificar que google-services plugin está no build.gradle**

  No mesmo arquivo `android/app/build.gradle`, confirme no final:
  ```groovy
  apply plugin: 'com.google.gms.google-services'
  ```

  No arquivo `android/build.gradle` (raiz do Android), confirme em `dependencies`:
  ```groovy
  classpath 'com.google.gms:google-services:4.4.0'
  ```

  Se não estiver, adicione.

- [ ] **Step 4: Sync Capacitor**

  ```bash
  cd C:\Users\Orismar\Documents\StockDan\stockdan-app
  npx cap sync android
  ```

  Expected: `✔ Copying web assets` + `✔ Updating Android plugins` sem erros.

---

## Task 15: Deploy no Vercel + Build do APK

**Files:**
- Nenhum arquivo novo — deploy e build

- [ ] **Step 1: Push final para o GitHub**

  ```bash
  cd C:\Users\Orismar\Documents\StockDan\stockdan-app
  git push origin master
  ```

- [ ] **Step 2: Aguardar deploy Vercel e verificar migration**

  ```bash
  npx vercel ls
  ```

  Aguardar `● Ready`. A migration `20260529000001_push_tokens.sql` será aplicada automaticamente durante o build.

  Verificar nos logs do Vercel que aparece:
  ```
  [migrate] [run] 20260529000001_push_tokens.sql... ✓
  ```

- [ ] **Step 3: Verificar APIs em produção**

  ```bash
  # Teste básico — deve retornar 401 (não autenticado, correto)
  curl -X POST https://stockdan-app.vercel.app/api/notifications/register \
    -H "Content-Type: application/json" \
    -d '{"fcm_token":"test"}'
  ```

  Expected: `{"error":"Não autenticado."}` com status 401.

- [ ] **Step 4: Abrir o projeto Android no Android Studio**

  ```bash
  npx cap open android
  ```

  Isso abre o Android Studio com o projeto. Aguarde o Gradle sync terminar.

- [ ] **Step 5: Construir APK de debug para teste**

  No Android Studio:
  → Menu **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**

  Ou via linha de comando:
  ```bash
  cd android
  ./gradlew assembleDebug
  ```

  APK gerado em:
  ```
  android/app/build/outputs/apk/debug/app-debug.apk
  ```

- [ ] **Step 6: Instalar APK no dispositivo Android**

  Transfira o `app-debug.apk` para o celular Android (por cabo USB, WhatsApp, e-mail, Google Drive).

  No celular:
  → Configurações → Segurança → Instalar apps de fontes desconhecidas → Ativar
  → Abrir o arquivo APK → Instalar

- [ ] **Step 7: Testar push notification de ponta a ponta**

  No celular com o APK instalado:
  1. Abra o StockDan → faça login
  2. O app pedirá permissão de notificação → aceite
  3. Verifique no Supabase que o token foi salvo:
     ```sql
     SELECT * FROM push_tokens ORDER BY created_at DESC LIMIT 5;
     ```
  4. No web (outro dispositivo ou browser), registre uma nova aplicação (saída) em qualquer talhão
  5. O celular deve receber a push notification em ~2 segundos

- [ ] **Step 8: Commit final + fluxo de atualização documentado**

  ```bash
  cd C:\Users\Orismar\Documents\StockDan\stockdan-app
  git add .
  git commit -m "feat: APK Capacitor br.stockdan.app + push notifications FCM completo

  - push_tokens migration (tenant isolation)
  - lib/fcm.ts — Firebase Admin SDK singleton
  - lib/notifications.ts — notifyNovaAplicacao + notifyEstoqueCritico
  - POST /api/notifications/register — upsert FCM token
  - Triggers em registrar_saida (nova aplicação + estoque crítico)
  - sw.js — handlers push + notificationclick
  - CSP atualizado para Firebase
  - capacitor.config.ts — br.stockdan.app → Vercel
  - useNotifications hook + NotificationBootstrap
  - NotificationBootstrap no app layout

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  git push origin master
  ```

---

## Fluxo de atualização do APK (referência)

```
# Após qualquer mudança de código:
git push origin master
→ Vercel deploy automático
→ APK já carrega a nova versão (server.url aponta para Vercel)
→ Não precisa redistribuir o APK para atualizar features

# Só redistribuir o APK quando:
# - Mudar plugins nativos do Capacitor
# - Mudar appId ou configurações do capacitor.config.ts
npx cap sync android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release-unsigned.apk
```

---

## Self-review — Cobertura da spec

| Requisito da spec | Task que implementa |
|---|---|
| Tabela push_tokens com gestor_id | Task 2 |
| lib/fcm.ts com limpeza de tokens inválidos | Task 5 |
| notifyTenant + notifyNovaAplicacao + notifyEstoqueCritico | Task 6 |
| POST /api/notifications/register com withAuth + upsert | Task 7 |
| Trigger em registrar_saida (nova aplicação) | Task 8 |
| Trigger de estoque crítico se new_quantity < min_quantity | Task 8 |
| Handler push no sw.js | Task 9 |
| CSP atualizado para Firebase | Task 10 |
| capacitor.config.ts com server.url Vercel | Task 11 |
| useNotifications hook + NotificationBootstrap | Task 12 |
| Integração no layout (ativa silenciosamente) | Task 13 |
| android/app/google-services.json + build.gradle | Task 14 |
| Deploy Vercel + build APK + teste e2e | Task 15 |
| Somente gestor + admin recebem notificações | Task 6 (getGestorAdminTokens filtra roles) |
| Fire-and-forget — falha de push não falha operação | Tasks 5, 6, 8 (void + catch interno) |
