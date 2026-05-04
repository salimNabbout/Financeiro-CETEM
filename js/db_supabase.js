// ============================================================
// db_supabase.js - drop-in replacement for db.js
// Backend: Supabase (state em JSONB) + localStorage (audit/snap/usage)
// ============================================================
// API publica IDENTICA a db.js, com adicao de DB.ready (Promise).
// Estrategia de leitura: cache em memoria, sincrono.
// Estrategia de escrita: debounced upsert em Supabase.
// ============================================================

const SNAP_PREFIX  = 'cockpit-fin-snap-v2:';
const AUDIT_PREFIX = 'cockpit-fin-audit-v1:';
const USAGE_PREFIX = 'cockpit-fin-usage-v1:';
const META_LOCAL_KEY = 'cetem-fin-meta-prefs';
const ACTIVE_EMPRESA_KEY = 'cetem-fin-active-empresa';
const AUDIT_MAX = 5000;
const SNAP_MAX = 10;
const SCHEMA_VERSION = 2;
const SAVE_DEBOUNCE_MS = 600;

const _BC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('cockpit-fin') : null;

const DB = (() => {
  // ----- Schema base do state (igual ao db.js) -----
  const empty = () => ({
    _schemaVersion: SCHEMA_VERSION,
    empresa: { nome: 'CETEM Engenharia', caixaInicial: 0, pixChave: '', pixCidade: 'SAO PAULO', cnpj: '', setor: '' },
    parametros: {
      caixaMinimo: 5000, metaMargemPct: 35, limiteInadimplenciaPct: 5,
      custosFixosMensais: 0, vendasMediaDiaria: 0, estoqueAtual: 0, diasAtrasoRisco: 15
    },
    clientes: [], fornecedores: [], produtos: [],
    contas: [{ id: 'principal', nome: 'Caixa principal', tipo: 'caixa', saldoInicial: 0, ativa: true }],
    movimentos: [], titulosReceber: [], titulosPagar: [],
    categorias: {
      entrada: ['Vendas', 'Servicos', 'Aporte', 'Outros'],
      saida: ['Fornecedores', 'Folha', 'Tributos', 'Aluguel', 'Sistemas', 'Pro-labore', 'Outros']
    },
    reguaCobranca: [
      { dias: -2, acao: 'Aviso previo de vencimento', canal: 'e-mail/whatsapp' },
      { dias: 1,  acao: 'Primeiro contato de cobranca', canal: 'telefone' },
      { dias: 5,  acao: 'Segundo contato + negociacao', canal: 'telefone/e-mail' },
      { dias: 15, acao: 'Renegociacao formal',          canal: 'reuniao' },
      { dias: 30, acao: 'Suspensao comercial',          canal: 'formal' }
    ],
    auditoria: [],
    metas: { receitaMensal: 0, resultadoMensal: 0, inadimplenciaMaxPct: 5, margemMinPct: 35 },
    onboardingConcluido: false,
    interacoes: [],
    anexos: {},
    orcamento: {},
    recorrencias: []
  });

  const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ----- Cliente Supabase (singleton compartilhado com auth.js) -----
  if (!window.SB) {
    console.error('[DB Supabase] window.SB nao existe. Carregue js/supabase_client.js antes deste arquivo.');
  }
  const sb = window.SB;

  // ----- Validacao de schema (mesmo do db.js) -----
  function validarSchema(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return { ok: false, erro: 'Raiz precisa ser um objeto JSON.' };
    if (data.empresa && typeof data.empresa !== 'object') return { ok: false, erro: '"empresa" precisa ser objeto.' };
    const listas = ['clientes','fornecedores','produtos','contas','movimentos','titulosReceber','titulosPagar','recorrencias','interacoes'];
    for (const k of listas) {
      if (data[k] !== undefined && !Array.isArray(data[k]))
        return { ok: false, erro: `"${k}" precisa ser array.` };
    }
    if (data.anexos && typeof data.anexos !== 'object') return { ok: false, erro: '"anexos" precisa ser objeto.' };
    if (data.orcamento && typeof data.orcamento !== 'object') return { ok: false, erro: '"orcamento" precisa ser objeto.' };
    if (data.categorias) {
      if (typeof data.categorias !== 'object') return { ok: false, erro: '"categorias" precisa ser objeto.' };
      if (data.categorias.entrada && !Array.isArray(data.categorias.entrada)) return { ok: false, erro: '"categorias.entrada" precisa ser array.' };
      if (data.categorias.saida && !Array.isArray(data.categorias.saida)) return { ok: false, erro: '"categorias.saida" precisa ser array.' };
    }
    const checkTitulo = (t, nome) => {
      if (!t || typeof t !== 'object') return `${nome}: item nao e objeto`;
      if (t.valor !== undefined && !isFinite(Number(t.valor))) return `${nome}: valor nao numerico`;
      return null;
    };
    for (const t of (data.movimentos || []).slice(0, 50)) { const e = checkTitulo(t, 'movimento'); if (e) return { ok: false, erro: e }; }
    for (const t of (data.titulosReceber || []).slice(0, 50)) { const e = checkTitulo(t, 'titulo a receber'); if (e) return { ok: false, erro: e }; }
    for (const t of (data.titulosPagar || []).slice(0, 50)) { const e = checkTitulo(t, 'titulo a pagar'); if (e) return { ok: false, erro: e }; }
    return { ok: true };
  }

  // ----- Estado em memoria -----
  let state = empty();
  let meta = {
    empresas: [],
    empresaAtivaId: null,
    perfilAtivo: 'socio',
    modoAvancado: false
  };
  const listeners = new Set();
  function emit() { listeners.forEach(fn => { try { fn(state); } catch(e) { console.error(e); } }); }

  // ----- Preferencias locais (perfil, modoAvancado, ultima empresa) -----
  function loadLocalPrefs() {
    try {
      const raw = localStorage.getItem(META_LOCAL_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.perfilAtivo) meta.perfilAtivo = p.perfilAtivo;
        if (typeof p.modoAvancado === 'boolean') meta.modoAvancado = p.modoAvancado;
      }
    } catch {}
  }
  function saveLocalPrefs() {
    try {
      localStorage.setItem(META_LOCAL_KEY, JSON.stringify({
        perfilAtivo: meta.perfilAtivo,
        modoAvancado: meta.modoAvancado
      }));
    } catch {}
  }

  // ----- Bootstrap async -----
  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

  async function bootstrap() {
    try {
      loadLocalPrefs();

      // Garante que ha uma sessao autenticada antes de tocar no banco
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const err = new Error('NAO_AUTENTICADO');
        err.code = 'NAO_AUTENTICADO';
        throw err;
      }

      // Carrega lista de empresas
      const { data: empresas, error: eEmp } = await sb
        .from('empresas')
        .select('id, nome')
        .order('nome', { ascending: true });
      if (eEmp) throw eEmp;

      if (!empresas || empresas.length === 0) {
        // Primeira execucao: cria empresa default
        const eid = id();
        const novoState = empty();
        novoState.empresa.nome = 'CETEM Engenharia';
        const { error: eIns } = await sb
          .from('empresas')
          .insert({ id: eid, nome: 'CETEM Engenharia', state: novoState });
        if (eIns) throw eIns;
        meta.empresas = [{ id: eid, nome: 'CETEM Engenharia' }];
        meta.empresaAtivaId = eid;
        state = novoState;
      } else {
        meta.empresas = empresas;
        const last = localStorage.getItem(ACTIVE_EMPRESA_KEY);
        meta.empresaAtivaId = (last && empresas.find(e => e.id === last))
          ? last
          : empresas[0].id;
        const { data: row, error: eSel } = await sb
          .from('empresas')
          .select('state')
          .eq('id', meta.empresaAtivaId)
          .single();
        if (eSel) throw eSel;
        state = mergeState(empty(), row.state || {});
      }

      console.log('[DB Supabase] Pronto. Empresa ativa:', meta.empresaAtivaId);
      resolveReady(state);
      emit();
    } catch (e) {
      console.error('[DB Supabase] Falha no bootstrap:', e);
      window.dispatchEvent(new CustomEvent('cockpit-fin-supabase-error', { detail: { fase: 'bootstrap', error: e } }));
      rejectReady(e);
    }
  }

  function mergeState(base, incoming) {
    return { ...base, ...incoming, _schemaVersion: SCHEMA_VERSION };
  }

  // ----- Save debounced -----
  let saveTimer = null;
  let savePending = false;
  let saveInflight = false;

  function scheduleSave() {
    savePending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  async function saveNow() {
    if (!savePending || saveInflight) return;
    if (!meta.empresaAtivaId) return;
    saveInflight = true;
    savePending = false;
    const snapshotState = JSON.parse(JSON.stringify(state));
    const nome = (snapshotState.empresa && snapshotState.empresa.nome) || 'Empresa';
    try {
      const { error } = await sb
        .from('empresas')
        .update({ state: snapshotState, nome })
        .eq('id', meta.empresaAtivaId);
      if (error) throw error;
      // Mantem o nome local na lista de empresas em sincronia
      const e = meta.empresas.find(x => x.id === meta.empresaAtivaId);
      if (e && e.nome !== nome) e.nome = nome;
    } catch (err) {
      console.error('[DB Supabase] Falha ao salvar:', err);
      // Re-marca pendente para tentar de novo
      savePending = true;
      window.dispatchEvent(new CustomEvent('cockpit-fin-supabase-error', { detail: { fase: 'save', error: err } }));
    } finally {
      saveInflight = false;
      // Se algo entrou na fila enquanto salvavamos, reagenda
      if (savePending) scheduleSave();
    }
  }

  function save() { scheduleSave(); emit(); broadcastChange(); }

  // Flush pendente ao fechar / esconder a aba
  window.addEventListener('beforeunload', () => { if (savePending) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && savePending) saveNow(); });

  // ----- BroadcastChannel multi-aba -----
  const _tabId = id();
  if (_BC) {
    _BC.onmessage = async (msg) => {
      if (!msg || !msg.data) return;
      if (msg.data.type === 'hello' && msg.data.empresaId === meta.empresaAtivaId && msg.data.tabId !== _tabId) {
        window.dispatchEvent(new CustomEvent('cockpit-fin-concurrent-tab', { detail: { tabId: msg.data.tabId } }));
      }
      if (msg.data.type === 'data-changed' && msg.data.empresaId === meta.empresaAtivaId && msg.data.tabId !== _tabId) {
        // Outra aba salvou — recarrega do Supabase
        try {
          const { data: row } = await sb.from('empresas').select('state').eq('id', meta.empresaAtivaId).single();
          if (row) { state = mergeState(empty(), row.state || {}); emit(); }
        } catch {}
      }
    };
    try { _BC.postMessage({ type: 'hello', empresaId: meta.empresaAtivaId, tabId: _tabId }); } catch {}
  }
  function broadcastChange() {
    if (!_BC) return;
    try { _BC.postMessage({ type: 'data-changed', empresaId: meta.empresaAtivaId, tabId: _tabId }); } catch {}
  }

  // ----- Auditoria (mantida em localStorage, espelho leve no state) -----
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        window.dispatchEvent(new CustomEvent('cockpit-fin-quota-exceeded', { detail: { key } }));
      }
      return false;
    }
  }
  function auditAppend(ev) {
    const key = AUDIT_PREFIX + (meta.empresaAtivaId || 'default');
    let lista = [];
    try { lista = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    lista.push(ev);
    if (lista.length > AUDIT_MAX) lista = lista.slice(-AUDIT_MAX);
    safeSet(key, JSON.stringify(lista));
    state.auditoria = (state.auditoria || []);
    state.auditoria.unshift(ev);
    state.auditoria = state.auditoria.slice(0, 500);
  }
  function auditLoad(empresaId) {
    const key = AUDIT_PREFIX + (empresaId || meta.empresaAtivaId || 'default');
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }

  // ----- Helper interno -----
  function DB_internalSet(updater) { updater(state); save(); }

  // Bootstrap ja!
  bootstrap();

  return {
    id,
    SCHEMA_VERSION,
    ready,
    backend: 'supabase',
    validarSchema,
    checarQuota: async () => null, // Nao se aplica em modo Supabase
    get: () => state,
    meta: () => meta,
    set: (updater) => { updater(state); save(); },
    reset: () => { state = empty(); save(); },
    replace: (data) => {
      const v = validarSchema(data);
      if (!v.ok) throw new Error('Import invalido: ' + v.erro);
      state = mergeState(empty(), data);
      save();
    },
    importar: (data, origem = 'arquivo') => {
      const v = validarSchema(data);
      if (!v.ok) return { ok: false, erro: v.erro };
      state = mergeState(empty(), data);
      save();
      auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'import', detalhe: `origem=${origem}; chaves=${Object.keys(data).join(',')}` });
      return { ok: true };
    },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    log: (acao, detalhe) => {
      const ev = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao, detalhe };
      auditAppend(ev);
      save();
    },
    auditList: (empresaId) => auditLoad(empresaId),
    auditExport: (empresaId) => {
      const lista = auditLoad(empresaId);
      return lista.map(e => JSON.stringify(e)).join('\n');
    },

    // ----- Cancelamento logico -----
    cancelarTituloReceber: (tituloId, motivo) => {
      const m = String(motivo || '').trim();
      if (!m) return { ok: false, erro: 'Motivo do cancelamento e obrigatorio.' };
      let achou = false;
      DB_internalSet(s => {
        const t = s.titulosReceber.find(x => x.id === tituloId);
        if (!t) return;
        t.status = 'cancelado';
        t.cancelamento = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, motivo: m };
        achou = true;
      });
      if (achou) auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'cancelar-receber', detalhe: `tituloId=${tituloId}; motivo=${m}` });
      return achou ? { ok: true } : { ok: false, erro: 'Titulo nao encontrado.' };
    },
    cancelarTituloPagar: (tituloId, motivo) => {
      const m = String(motivo || '').trim();
      if (!m) return { ok: false, erro: 'Motivo do cancelamento e obrigatorio.' };
      let achou = false;
      DB_internalSet(s => {
        const t = s.titulosPagar.find(x => x.id === tituloId);
        if (!t) return;
        if (t.pago) return;
        t.cancelado = true;
        t.cancelamento = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, motivo: m };
        achou = true;
      });
      if (achou) auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'cancelar-pagar', detalhe: `tituloId=${tituloId}; motivo=${m}` });
      return achou ? { ok: true } : { ok: false, erro: 'Titulo nao encontrado ou ja pago.' };
    },
    cancelarMovimento: (movId, motivo) => {
      const m = String(motivo || '').trim();
      if (!m) return { ok: false, erro: 'Motivo do cancelamento e obrigatorio.' };
      let achou = false;
      DB_internalSet(s => {
        const mv = s.movimentos.find(x => x.id === movId);
        if (!mv) return;
        if (mv.origem === 'baixa-receber' || mv.origem === 'baixa-pagar') return;
        mv.cancelado = true;
        mv.cancelamento = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, motivo: m };
        achou = true;
      });
      if (achou) auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'cancelar-movimento', detalhe: `movId=${movId}; motivo=${m}` });
      return achou ? { ok: true } : { ok: false, erro: 'Movimento nao encontrado ou e fruto de baixa (requer estorno).' };
    },

    // ----- Multi-empresa -----
    listEmpresas: () => meta.empresas.slice(),
    empresaAtivaId: () => meta.empresaAtivaId,
    createEmpresa: (nome) => {
      const eid = id();
      const novo = empty();
      novo.empresa.nome = nome;
      // Insercao otimista local + async no Supabase
      meta.empresas.push({ id: eid, nome });
      meta.empresaAtivaId = eid;
      localStorage.setItem(ACTIVE_EMPRESA_KEY, eid);
      state = novo;
      sb.from('empresas').insert({ id: eid, nome, state: novo }).then(({ error }) => {
        if (error) {
          console.error('[DB Supabase] Falha ao criar empresa:', error);
          window.dispatchEvent(new CustomEvent('cockpit-fin-supabase-error', { detail: { fase: 'createEmpresa', error } }));
        }
      });
      emit();
      return eid;
    },
    readEmpresa: (eid) => {
      // Sincrono (compat). Retorna empty() se nao for a ativa.
      // Para leitura real, usar getEmpresaAsync.
      if (eid === meta.empresaAtivaId) return state;
      return empty();
    },
    getEmpresaAsync: async (eid) => {
      const { data, error } = await sb.from('empresas').select('state').eq('id', eid).single();
      if (error) throw error;
      return mergeState(empty(), data.state || {});
    },
    switchEmpresa: (eid) => {
      if (!meta.empresas.find(e => e.id === eid)) return;
      // Flush pending antes de trocar
      const doSwitch = async () => {
        if (savePending) await saveNow();
        meta.empresaAtivaId = eid;
        localStorage.setItem(ACTIVE_EMPRESA_KEY, eid);
        try {
          const { data: row, error } = await sb.from('empresas').select('state').eq('id', eid).single();
          if (error) throw error;
          state = mergeState(empty(), row.state || {});
          emit();
        } catch (err) {
          console.error('[DB Supabase] Falha ao trocar empresa:', err);
          window.dispatchEvent(new CustomEvent('cockpit-fin-supabase-error', { detail: { fase: 'switchEmpresa', error: err } }));
        }
      };
      doSwitch();
    },
    renameEmpresa: (eid, nome) => {
      const e = meta.empresas.find(x => x.id === eid); if (!e) return;
      e.nome = nome;
      if (eid === meta.empresaAtivaId) { state.empresa.nome = nome; save(); }
      else {
        sb.from('empresas').update({ nome }).eq('id', eid).then(({ error }) => {
          if (error) console.error('[DB Supabase] Rename:', error);
        });
      }
    },
    removeEmpresa: (eid) => {
      if (meta.empresas.length <= 1) return false;
      meta.empresas = meta.empresas.filter(e => e.id !== eid);
      if (meta.empresaAtivaId === eid) {
        meta.empresaAtivaId = meta.empresas[0].id;
        localStorage.setItem(ACTIVE_EMPRESA_KEY, meta.empresaAtivaId);
      }
      sb.from('empresas').delete().eq('id', eid).then(async ({ error }) => {
        if (error) console.error('[DB Supabase] Remove:', error);
      });
      // Recarrega a empresa ativa
      sb.from('empresas').select('state').eq('id', meta.empresaAtivaId).single().then(({ data, error }) => {
        if (!error && data) { state = mergeState(empty(), data.state || {}); emit(); }
      });
      auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'remover-empresa', detalhe: `eid=${eid}` });
      return true;
    },

    // ----- Perfis -----
    perfis: ['socio', 'financeiro', 'comercial', 'contabilidade'],
    getPerfil: () => meta.perfilAtivo || 'socio',
    setPerfil: (p) => { meta.perfilAtivo = p; saveLocalPrefs(); emit(); },
    modoAvancado: () => !!meta.modoAvancado,
    setModoAvancado: (v) => { meta.modoAvancado = !!v; saveLocalPrefs(); emit(); },

    // ----- Snapshots (mantidos em localStorage por enquanto) -----
    snapshot: (label) => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      let list = [];
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
      list.unshift({ ts: new Date().toISOString(), label: label || 'manual', data: JSON.parse(JSON.stringify(state)) });
      list = list.slice(0, SNAP_MAX);
      safeSet(key, JSON.stringify(list));
    },
    listSnapshots: () => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    },
    restoreSnapshot: (ts) => {
      const list = (function () { try { return JSON.parse(localStorage.getItem(SNAP_PREFIX + meta.empresaAtivaId) || '[]'); } catch { return []; } })();
      const snap = list.find(s => s.ts === ts);
      if (!snap) return false;
      state = mergeState(empty(), snap.data);
      save();
      auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'restore-snapshot', detalhe: `ts=${ts}; label=${snap.label || ''}` });
      return true;
    },
    deleteSnapshot: (ts) => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      let list = []; try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
      list = list.filter(s => s.ts !== ts);
      safeSet(key, JSON.stringify(list));
    },

    // ----- Telemetria de uso (localStorage) -----
    registrarUso: (rotaId) => {
      if (!rotaId) return;
      const key = USAGE_PREFIX + meta.empresaAtivaId;
      let u = {};
      try { u = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
      const agora = new Date().toISOString();
      if (!u[rotaId]) u[rotaId] = { count: 0, firstSeen: agora, lastSeen: agora };
      u[rotaId].count += 1;
      u[rotaId].lastSeen = agora;
      safeSet(key, JSON.stringify(u));
    },
    listarUso: (empresaId) => {
      const key = USAGE_PREFIX + (empresaId || meta.empresaAtivaId);
      try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
    },
    exportarUso: (empresaId) => {
      const u = (function() {
        const key = USAGE_PREFIX + (empresaId || meta.empresaAtivaId);
        try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
      })();
      const rows = Object.entries(u).map(([r, v]) => `${r};${v.count};${v.firstSeen};${v.lastSeen}`);
      return '\uFEFFrota;visitas;primeira_visita;ultima_visita\n' + rows.join('\n');
    }
  };
})();

// Matriz de permissoes por perfil (mesmo do db.js)
const PERMS = {
  socio:         { verTudo: true, pagar: true, baixar: true, editar: true, configurar: true, relatorios: true, cancelar: true },
  financeiro:    { verTudo: true, pagar: true, baixar: true, editar: true, configurar: false, relatorios: true, cancelar: true },
  comercial:     { verTudo: false, pagar: false, baixar: false, editar: false, configurar: false, relatorios: false, verClientes: true, verReceber: true, cancelar: false },
  contabilidade: { verTudo: true, pagar: false, baixar: false, editar: false, configurar: false, relatorios: true, cancelar: false }
};
function can(acao) {
  const p = PERMS[DB.getPerfil()] || PERMS.socio;
  return !!p[acao] || (p.verTudo && ['ver', 'verRelatorios'].includes(acao));
}
