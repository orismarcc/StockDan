# Capacitor APK + Firebase Push Notifications — Design Spec

**Data:** 2026-05-29
**Status:** Aprovado

---

## Objetivo

Empacotar o StockDan como APK Android distribuível via link/WhatsApp/e-mail, usando Capacitor para envolver a aplicação Next.js existente em uma WebView nativa. Adicionar push notifications via Firebase Cloud Messaging (FCM) para dois eventos:

1. **Nova aplicação (saída):** notifica gestores e admins com nome do usuário, talhão e quantidade
2. **Estoque crítico:** notifica gestores e admins quando estoque cai abaixo do mínimo após uma saída

---

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│  Android APK (br.stockdan.app)                       │
│  └── Capacitor WebView                               │
│       └── carrega https://stockdan-app.vercel.app    │
│            (mesmo código, mesma UI, mesmo backend)   │
└───────────────────────┬──────────────────────────────┘
                        │ FCM token → POST /api/notifications/register
                        ▼
┌──────────────────────────────────────────────────────┐
│  Supabase — tabela push_tokens                       │
│  (user_id, gestor_id, fcm_token, platform)           │
└───────────────────────┬──────────────────────────────┘
                        │ tokens do tenant
                        ▼
┌──────────────────────────────────────────────────────┐
│  lib/notifications.ts → lib/fcm.ts                   │
│  Firebase Admin SDK (server-side no Vercel)          │
└───────────────────────┬──────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────┐
│  Firebase Cloud Messaging                            │
│  → push para dispositivos Android registrados        │
└──────────────────────────────────────────────────────┘
```

---

## Decisões de design

### Capacitor: server.url vs export estático
Next.js App Router usa Server Components e não suporta export estático completo. A abordagem escolhida é `server.url` apontando para o Vercel em produção. O app no celular sempre carrega a versão mais recente automaticamente — nenhum republish de APK para atualizar features. O APK só precisa ser redistribuído se mudar plugins nativos do Capacitor.

### Notificações: FCM nativo via Capacitor plugin
No APK, `@capacitor/push-notifications` registra o device com o FCM e retorna o token. Esse token é salvo no Supabase via `POST /api/notifications/register`. O servidor usa Firebase Admin SDK para enviar mensagens diretamente aos tokens do tenant.

O SW recebe um handler `push` para notificações quando o app está em background no Android WebView — camada de fallback além do plugin nativo.

### Tenant isolation (P8)
`push_tokens` armazena `gestor_id`. `notifyTenant(gestor_id, ...)` filtra apenas tokens do mesmo tenant. Nunca cruza notificações entre tenants.

### Quem recebe
Apenas cargos `gestor` e `admin`. Operário e agrônomo executam — supervisores são notificados.

### Fire-and-forget
Falha no envio de notificação NÃO falha a operação principal (mesma filosofia do `logAudit`). Erros FCM são logados no `console.error` server-side.

---

## Componentes

### 1. Migration — `push_tokens`

```sql
CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gestor_id  UUID NOT NULL,
  fcm_token  TEXT NOT NULL UNIQUE,
  platform   TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_gestor_id ON push_tokens(gestor_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
```

### 2. `lib/fcm.ts` — Firebase Admin SDK

- Inicializa `firebase-admin` com credenciais de service account (env vars)
- Expõe `sendPushNotification(tokens: string[], title: string, body: string): Promise<void>`
- Limpa tokens inválidos automaticamente (FCM retorna `registration-token-not-registered` para tokens expirados)
- Fire-and-forget — não lança exceção

### 3. `lib/notifications.ts` — helper de domínio

```ts
// Notifica todos os gestores e admins de um tenant
notifyTenant(gestorId: string, title: string, body: string): Promise<void>

// Helpers semânticos usados nos route handlers
notifyNovaAplicacao(params: {
  gestorId: string
  userName: string
  insumoTitle: string
  talhaoName: string
  quantity: number
  unit: string
}): Promise<void>

notifyEstoqueCritico(params: {
  gestorId: string
  farmName: string
  insumoTitle: string
  currentQty: number
  minQty: number
  unit: string
}): Promise<void>
```

### 4. `app/api/notifications/register/route.ts`

- `POST` autenticado (usa `withAuth` — P10)
- Body: `{ fcm_token: string, platform?: string }`
- Upsert por `fcm_token` (ON CONFLICT DO UPDATE) — evita duplicatas ao reinstalar
- Vincula `user_id` + `gestor_id` da sessão

### 5. Triggers nos routes existentes

**`POST /api/farms/[id]/transactions`** (após RPC `registrar_saida` bem-sucedida):

```
1. Busca nome do insumo + talhão + unidade da transação retornada
2. Fire-and-forget: notifyNovaAplicacao(...)
3. Se new_quantity < min_quantity AND min_quantity IS NOT NULL:
   Fire-and-forget: notifyEstoqueCritico(...)
```

Apenas saída (`registrar_saida`) gera notificações. Entrada não.

### 6. `hooks/useNotifications.ts` — client component hook

```ts
// Detecta se está rodando no Capacitor nativo
// Pede permissão de notificação
// Registra listener onPushNotificationReceived
// Obtém FCM token via PushNotifications.register()
// Chama POST /api/notifications/register com o token
// Salva flag em localStorage para não re-registrar a cada render
```

Chamado uma vez no layout do app (componente client). Silenciosamente ignorado no browser web.

### 7. `capacitor.config.ts`

```ts
import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.stockdan.app',
  appName: 'StockDan',
  webDir: 'out',           // não usado (server.url tem precedência)
  server: {
    url: 'https://stockdan-app.vercel.app',
    cleartext: false,      // HTTPS only
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#030712',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#030712',
    },
  },
}
export default config
```

### 8. `public/sw.js` — handler `push`

Adicionar ao SW existente (sem remover nada):

```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.notification?.title ?? 'StockDan'
  const body  = data.notification?.body  ?? ''
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192-maskable.png',
      data: data.data ?? {},
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/dashboard'))
})
```

### 9. `next.config.ts` — atualizar CSP

Adicionar ao `connect-src`:
```
https://fcm.googleapis.com
https://*.googleapis.com
https://firebaseinstallations.googleapis.com
```

---

## Variáveis de ambiente

| Variável | Origem | Onde configurar |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Firebase console → Project settings | Vercel + `.env.local` |
| `FIREBASE_CLIENT_EMAIL` | Service account key JSON | Vercel + `.env.local` |
| `FIREBASE_PRIVATE_KEY` | Service account key JSON | Vercel + `.env.local` |

O `google-services.json` vai em `android/app/` (não commitado — `.gitignore`).

---

## Packages a instalar

```bash
# Capacitor core + Android
npm install @capacitor/core @capacitor/cli @capacitor/android

# Plugins nativos
npm install @capacitor/push-notifications @capacitor/status-bar @capacitor/splash-screen @capacitor/app

# Firebase Admin (server-side)
npm install firebase-admin
```

---

## Fluxo de atualização do APK

```
git push → Vercel deploy (automático)
→ npx cap sync android
→ cd android && ./gradlew assembleRelease
→ APK gerado em android/app/build/outputs/apk/release/
→ Distribuir por link/WhatsApp/e-mail
```

Features do app atualizam automaticamente via Vercel — o APK só precisa ser redistribuído quando plugins nativos do Capacitor mudam.

---

## O que NÃO muda

- Toda a UI/UX atual — idêntica no APK
- Backend Supabase — apenas nova tabela `push_tokens`
- Auth JWT com cookies — funciona no WebView do Capacitor
- Service Worker de cache/offline — mantido, apenas adicionado handler `push`
- Padrões P1-P12 do DEVELOPMENT-STANDARDS — todos respeitados

---

## Fora de escopo

- iOS (requer conta Apple Developer $99/ano — decisão futura)
- Play Store (pode ser feito depois com o mesmo APK)
- Web Push para browsers desktop (diferente do FCM nativo — pode ser adicionado depois)
- Notificações para Agrônomo/Operário
