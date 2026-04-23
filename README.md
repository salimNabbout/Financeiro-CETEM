# Gerência Financeira — CETEM

Web app de gestão financeira para empresa de pequeno porte. PWA offline-first construído em HTML + JS + CSS puro, sem build step, com persistência em `localStorage`.

## Rodar localmente

Requer apenas um servidor HTTP estático (SW e algumas APIs não funcionam via `file://`).

```bash
python -m http.server 8080
```

Abra `http://localhost:8080` no Chrome/Edge.

## Estrutura

```
app/
├── index.html           # shell único
├── manifest.webmanifest # PWA
├── sw.js                # service worker (offline)
├── css/styles.css       # tema claro + escuro
├── js/
│   ├── db.js            # persistência multi-empresa (localStorage)
│   ├── kpis.js          # cálculos financeiros
│   ├── ui.js            # helpers de render
│   ├── reports.js       # import/export CSV
│   ├── ofx.js           # parser de extrato OFX
│   ├── impostos.js      # Simples Nacional / Lucro Presumido
│   ├── pix.js           # gerador BR Code PIX
│   ├── views.js         # telas
│   └── app.js           # rotas e bootstrap
└── icons/
```

## Funcionalidades (núcleo essencial)

- Dashboard com KPIs semafóricos, alertas e projeção de caixa 60 dias
- Fluxo de caixa (realizado + previsto) com filtros e tags
- Contas bancárias / caixas com saldos independentes
- Contas a receber com aging, PIX copia-e-cola + QR Code, anexos (boleto/NF)
- Contas a pagar com prioridade, anexos, recibo de pagamento
- Régua de cobrança configurável
- Cobrança em lote via WhatsApp / e-mail com PIX embutido
- Calendário mensal de vencimentos
- Margem de contribuição e ponto de equilíbrio
- DRE gerencial mensal
- Orçamento por categoria (budget vs. realizado)
- Metas & forecast mensal
- Recorrências (aluguel, folha, assinaturas)
- Conciliação bancária (OFX/CSV)
- Relatórios CSV
- Backups locais (snapshots) + export JSON
- Onboarding guiado, dark mode, busca Ctrl+K, PWA instalável

## Dados

Tudo local no navegador (`localStorage`). Cada empresa tem seus próprios dados isolados. Use **Exportar** para backup manual em JSON e **Snapshots** para backups automáticos diários.
