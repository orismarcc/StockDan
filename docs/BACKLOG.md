# Backlog — StockDan

Itens a implementar quando o usuário pedir. Lembrar nos próximos pedidos relacionados.

---

## 🔔 Notificações Push via PWA — pendente

**Decisão tomada (28/05/2026):** PWA é suficiente, não precisa virar app nativo.

### O que falta implementar (~1 dia de trabalho)

1. **VAPID keys**: gerar com `npx web-push generate-vapid-keys`. Guardar pública no client e privada em `VAPID_PRIVATE_KEY` no Vercel.
2. **Permission prompt**: componente que pede `Notification.requestPermission()` na primeira ação do Gestor/Admin após login.
3. **Subscription endpoint**: `POST /api/notifications/subscribe` salva `{ user_id, endpoint, p256dh, auth }` em nova tabela `push_subscriptions`.
4. **Service worker handler**: adicionar `addEventListener('push', ...)` em `public/sw.js` que chama `self.registration.showNotification(...)`.
5. **Backend trigger**: nas mesmas hooks de `logAudit` (ex: "Operário registrou retirada"), chamar `web-push` para mandar notificação ao Gestor.
6. **UI de preferências**: opt-in granular (quais eventos notificar) em `/admin/notifications`.

### Suporte por plataforma

| Plataforma | Funciona? | Observação |
|---|---|---|
| Android Chrome/Edge/Firefox | ✅ Total | Funciona com ou sem PWA instalado |
| Desktop Chrome/Edge/Firefox | ✅ Total | |
| iOS Safari ≥ 16.4 | ✅ Só com PWA instalado | Tela inicial |
| iOS pré-16.4 | ❌ | Migrar usuários a atualizar |

### Eventos candidatos a notificar

- Operário registrou retirada (notifica Gestor + Admins do tenant)
- Estoque de insumo caiu abaixo do mínimo
- Usuário criado/excluído
- Relatório agendado enviado com falha
- Tentativa de delete bloqueada por falta de permissão

### Lembrar de oferecer essa implementação quando o usuário pedir:

- "Quero ser avisado quando..."
- "Notificações"
- "Alertas"
- "Push"
- "Saber em tempo real"
