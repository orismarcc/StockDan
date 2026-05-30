# StockDan — Pendências e Sugestões

> Sempre que o usuário perguntar "o que tem para fazer", "quais são as pendências" ou "próximas features",
> leia este arquivo antes de responder.

---

## 🔴 Prioridade Alta

| ID | Tarefa | Status | Detalhes |
|---|---|---|---|
| P-01 | **Verificar domínio no Resend** | 🔄 Em andamento | Precisa de domínio próprio para enviar email para qualquer destinatário. Código já pronto — só falta DNS TXT no domínio. |
| P-02 | **M-4: complexidade de senha** | ⏳ Pendente | Mínimo 8 chars já implementado. Falta: 1 número obrigatório + 1 caractere especial. Routes: `/api/auth/change-password`, `/api/profile`. |

---

## 🟡 Prioridade Média

| ID | Tarefa | Status | Detalhes |
|---|---|---|---|
| P-03 | **Firebase App Distribution** | ⏳ Pendente | Upload automático do APK ao Firebase para notificar usuários de nova versão. |
| P-04 | **Talhão com mapa** | ⏳ Pendente | Integrar Google Maps ou Leaflet para desenhar geometria do talhão e calcular área real. |
| P-05 | **Histórico de preços de insumos** | ⏳ Pendente | Registrar custo por unidade a cada entrada → calcular custo total por aplicação. |
| P-06 | **Multi-safra** | ⏳ Pendente | Associar transações a uma safra (ex: soja 2025/26) para relatórios por ciclo agrícola. |

---

## 🟢 Prioridade Baixa

| ID | Tarefa | Status | Detalhes |
|---|---|---|---|
| P-07 | **Dashboard mini-gráfico** | 🔄 Em andamento | Sparkline de tendência de estoque nos últimos 7 dias nos cards de fazenda. |
| P-08 | **Notificações para Agrônomo** | ⏳ Pendente | Estender notificações de estoque crítico para Agrônomo das fazendas que gerencia. |
| P-09 | **Importação CSV** | ⏳ Pendente | Importar transações históricas via planilha para migrar de sistemas antigos. |
| P-10 | **iOS / App Store** | ⏳ Pendente | `npx cap add ios` — requer Mac + conta Apple Developer ($99/ano). |

---

## ✅ Concluídas Recentemente

- SEG-1: Rate limiter global via Upstash Redis
- A-2, A-3, C-3: Segurança de API routes
- RH-1 a RH-13: Hierarquia de cargos completa
- SUG-4: Audit log
- SUG-5: Relatórios agendados (Resend integrado)
- CAP-1 a CAP-15: APK Android com Firebase Push Notifications
- Configurações: pré-preenchimento nome/idade + skeleton
- Skeleton loading: dashboard, analise, settings
- RLS: Row Level Security em 9 tabelas
- any types: eliminados em 7 arquivos
- schema.sql: sincronizado com 28 migrations
- CRON_SECRET: configurado e funcional

---

_Última atualização: 2026-05-30_
