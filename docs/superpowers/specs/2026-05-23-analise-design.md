# Spec: Página de Análise — StockDan

**Data:** 2026-05-23  
**Status:** Aprovado  
**Rota:** `/analise`

---

## 1. Objetivo

Adicionar uma página de análise ao StockDan que ofereça:

- Dashboard com KPIs e 4 gráficos interativos (filtrados por período, fazenda, talhão e insumo)
- Seção de desempenho dos operadores com métricas individuais
- Geração de relatórios detalhados em PDF e Excel, com seleção de seções via modal

---

## 2. Acesso e Visibilidade

| Role | O que vê |
|------|----------|
| `admin` | Todas as fazendas que criou, todos os operadores vinculados a essas fazendas |
| `operario` | Apenas os próprios registros (filtragem automática por `user_id`) |

- Link "Análise" aparece no sidebar para **ambos** os roles
- Server Component redireciona para `/dashboard` se não autenticado
- Não há redirecionamento por role — a query simplesmente adapta os dados retornados

---

## 3. Layout — Painel com Filtros Laterais (opção B)

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar nav (existente)                                  │
├──────────────┬──────────────────────────────────────────┤
│ FILTROS      │  KPI cards (4)                           │
│              │                                          │
│ 📅 Período   │  Gráfico 1 │ Gráfico 2                  │
│ 🏡 Fazenda   │            │                             │
│ 🌾 Talhão(ões)│  Gráfico 3 │ Gráfico 4                  │
│ 🧪 Insumo   │                                          │
│              │  Seção: Desempenho dos Operadores        │
│ [Relatório ▼]│                                          │
└──────────────┴──────────────────────────────────────────┘
```

- Sidebar de filtros: fixa, largura ~280px, scroll independente no mobile
- Área principal: rola normalmente
- Mobile: filtros colapsam em drawer/accordion no topo

---

## 4. Filtros (Sidebar)

### Período
Presets rápidos em chips: **Hoje · 7 dias · 30 dias · Este mês · Personalizado**  
Ao selecionar "Personalizado" aparecem dois `<input type="date">` (de / até).  
Padrão ao carregar: **Este mês**.

### Fazenda
`<select>` simples. Admin vê todas as suas fazendas. Operário vê apenas as fazendas às quais está vinculado.

### Talhão(ões)
Multi-select com checkboxes, aparece ao selecionar uma fazenda. "Todos" selecionado por padrão.

### Insumo
Multi-select opcional. "Todos" por padrão. Afeta os gráficos de insumo mas não os de área por talhão.

### Botão Gerar Relatório
- Fica na base da sidebar
- Abre um modal (ver seção 7)

---

## 5. KPI Cards (topo da área principal)

Quatro cards em linha (grid 2×2 no mobile):

| Card | Valor | Descrição |
|------|-------|-----------|
| Aplicações | count de transações `type='saida'` no filtro | Total de registros no período |
| Total kg | sum de `quantity` | Volume total aplicado |
| Área trabalhada | sum de `area_ha` | Ha totais registrados nas aplicações |
| kg/ha médio | Total kg ÷ Área trabalhada | Taxa média de aplicação |

Todos responsivos ao filtro atual. Exibem `—` quando não há dados.

---

## 6. Gráficos (Recharts)

Todos os gráficos respondem aos filtros em tempo real (client-side, sem nova requisição ao servidor — os dados completos são carregados uma vez e filtrados no cliente).

### 6.1 — kg Aplicado por Insumo (BarChart vertical)
- Eixo X: nome do insumo
- Eixo Y: kg total
- Tooltip: "Ureia: 4.250 kg"
- Cor: verde (`#22c55e`) com gradiente de opacidade por ranking
- Clicável: clique na barra filtra o painel inteiro para aquele insumo

### 6.2 — Evolução de Aplicações no Tempo (AreaChart)
- Eixo X: datas (agrupadas por dia ou semana, dependendo do intervalo)
- Eixo Y: kg aplicado
- Linha com área preenchida com gradiente verde
- Tooltip com data e valor
- Se múltiplos insumos selecionados: múltiplas linhas com cores distintas, legenda clicável para mostrar/ocultar

### 6.3 — % Área Coberta por Talhão (PieChart / Donut)
- Cada fatia = um talhão
- Valor = `sum(area_ha) / talhao.area_ha * 100` (cap 100%)
- Tooltip: "Talhão Norte: 78% (15,6 de 20 ha)"
- Centro do donut: média geral de cobertura
- Legenda lateral com cores

### 6.4 — kg/ha por Talhão (BarChart horizontal)
- Eixo Y: nome do talhão
- Eixo X: kg/ha médio
- Tooltip: "Talhão Sul: 42,5 kg/ha"
- Cor: azul (`#3b82f6`)
- Ordenado do maior para o menor

---

## 7. Desempenho dos Operadores

### Query base
```sql
SELECT
  u.id, u.name,
  COUNT(t.id)        AS registro_count,
  SUM(t.area_ha)     AS area_total_ha,
  SUM(t.quantity)    AS quantity_total,
  AVG(t.area_ha)     AS area_media_ha
FROM transactions t
JOIN users u ON u.id = t.user_id
WHERE t.farm_id = ANY($farms)
  AND t.type = 'saida'
  AND t.date BETWEEN $from AND $to
  [AND t.talhao_id = ANY($talhoes)]
  [AND t.insumo_id = ANY($insumos)]
  [AND t.user_id = $current_user  -- apenas para operários]
GROUP BY u.id, u.name
ORDER BY area_total_ha DESC
```

### Layout da seção
- Título: "Desempenho dos Operadores" (admin) ou "Meu Desempenho" (operário)
- Cards horizontais por operador (ou linha de tabela), mostrando:
  - Nome + avatar com iniciais
  - Nº de registros
  - Área total (ha)
  - Média de área/registro
  - Total kg
- Cada card tem um **acordeão** que expande para mostrar breakdown por insumo (top insumos usados com barra de progresso relativa)
- Ranking visual: medalha 🥇🥈🥉 nos 3 primeiros (visível apenas ao admin)

---

## 8. Modal de Geração de Relatório

Abre ao clicar em "Gerar Relatório" na sidebar.

### Conteúdo do modal
1. **Preview dos filtros** aplicados (não editável, só leitura): período, fazenda, talhão(ões)
2. **Checkboxes de seções:**
   - ☑ Resumo geral (KPIs)
   - ☑ Listagem completa de aplicações (tabela)
   - ☑ Resumo por insumo
   - ☑ Resumo por talhão
   - ☑ Desempenho dos operadores
3. **Dois botões de ação:** `📄 Baixar PDF` · `📊 Baixar Excel`

### Comportamento
- Ao clicar em PDF ou Excel: fecha o modal e dispara download via `GET /api/analise/report?format=pdf|xlsx&...params`
- Estado de loading nos botões durante o download
- Sem nova seleção de filtros — usa os filtros já aplicados na sidebar

---

## 9. API de Relatório — `/api/analise/report`

### Query params
| Param | Tipo | Descrição |
|-------|------|-----------|
| `format` | `pdf` \| `xlsx` | Formato do arquivo |
| `farm_id` | UUID | Fazenda selecionada |
| `talhao_ids` | UUID[] (comma-sep) | Talhões (vazio = todos) |
| `insumo_ids` | UUID[] (comma-sep) | Insumos (vazio = todos) |
| `from` | ISO date | Início do período |
| `to` | ISO date | Fim do período |
| `sections` | string[] (comma-sep) | Seções a incluir: `summary,transactions,by_insumo,by_talhao,operators` |

### PDF — `jspdf` + `jspdf-autotable`
- Cabeçalho: logo StockDan (texto), nome da fazenda, período, talhões
- Seções conforme checkboxes selecionados
- Tabela de transações: Data · Insumo · Talhão · Operador · Quantidade · Área · kg/ha · Obs
- Linha de totais em negrito ao final de cada tabela
- Rodapé: data de geração + "StockDan"
- Content-Type: `application/pdf`

### Excel — `xlsx`
- Aba "Aplicações": dados brutos de todas as transações no filtro
- Aba "Por Insumo": total kg, área total, kg/ha médio por insumo
- Aba "Por Talhão": idem por talhão
- Aba "Operadores": métricas por operador (se seção selecionada)
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

### Segurança
- Valida sessão (redireciona se não autenticado)
- Valida que `farm_id` pertence ao `owner_id` do admin, ou que o operário tem acesso via `farm_users`
- Operário: força `user_id = session.id` na query de operadores

---

## 10. Novas Dependências

```bash
npm install recharts jspdf jspdf-autotable xlsx
npm install --save-dev @types/jspdf
```

Recharts é compatível com Next.js App Router via `'use client'` nos componentes de gráfico.

---

## 11. Arquivos a Criar / Modificar

### Novos
```
app/(app)/analise/page.tsx               # Server Component — carrega dados iniciais
app/(app)/analise/AnaliseClient.tsx      # Client Component — filtros + gráficos + operadores
app/(app)/analise/AnaliseFilters.tsx     # Sidebar de filtros
app/(app)/analise/charts/
  BarInsumo.tsx                          # Gráfico 1
  AreaTempo.tsx                          # Gráfico 2
  DonutTalhao.tsx                        # Gráfico 3
  BarKgHaTalhao.tsx                      # Gráfico 4
app/(app)/analise/OperadorCard.tsx       # Card de operador com acordeão
app/(app)/analise/ReportModal.tsx        # Modal de geração de relatório
app/api/analise/report/route.ts          # API de geração PDF/Excel
```

### Modificados
```
components/Sidebar.tsx (ou equivalente)  # Adicionar link "Análise" com ícone
```

---

## 12. Fora de Escopo (para não crescer além do necessário)

- Notificações automáticas por e-mail com relatório
- Comparação entre períodos (mês atual vs. anterior)
- Dashboard em tempo real com WebSocket
- Exportação de gráficos como imagem PNG
