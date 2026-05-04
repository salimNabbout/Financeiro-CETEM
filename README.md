# Gerência Financeira — CETEM

Cockpit financeiro web (PWA) com backend Supabase.

## Hospedagem

Deploy automático via Netlify a partir do branch `main` deste repositório.

URL: https://cetem-financeiro.netlify.app/

## Versão atual

**v0.5 · Uso interno** — Backend Supabase, autenticação por e-mail, validações fortes, cancelamento lógico, trilha de auditoria append-only.

## Estrutura

```
app/
├── index.html               # shell único + bootstrap async
├── manifest.webmanifest     # PWA
├── sw.js                    # service worker (kill-switch em modo dev)
├── css/styles.css           # tema claro + escuro
├── netlify.toml             # config Netlify
└── js/
    ├── supabase_config.js   # URL e anon key (públicas, RLS no Supabase)
    ├── supabase_client.js   # cliente do SDK
    ├── auth.js              # tela de login + sessão
    ├── db_supabase.js       # persistência (substitui localStorage)
    ├── kpis.js              # cálculos financeiros
    ├── ui.js                # helpers de render (modal, toast, esc)
    ├── reports.js           # CSV in/out, BOM UTF-8
    ├── validators.js        # CPF/CNPJ DV, e-mail, telefone E.164, datas
    ├── ofx.js               # parser de extrato bancário
    ├── impostos.js          # (módulo desativado nesta versão)
    ├── pix.js               # gerador BR Code PIX
    ├── views.js             # telas
    └── app.js               # rotas e bootstrap
```

## Permissões

A lista de admins fica em `js/supabase_config.js → window.ADMIN_EMAILS`.
Apenas admins veem botões destrutivos (Zerar, Importar JSON full).

## Suporte

Engenharia CETEM.
