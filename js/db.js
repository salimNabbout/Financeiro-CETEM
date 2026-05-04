// Persistência local multi-empresa (Fase 3). Escopo por chave de empresa.
// Fase A (hardening): schema validation no import, trilha de auditoria append-only
// em chave própria, cancelamento lógico, BroadcastChannel multi-aba, check de quota.
const META_KEY = 'cockpit-fin-meta-v2';
const DATA_PREFIX = 'cockpit-fin-data-v2:';
const SNAP_PREFIX = 'cockpit-fin-snap-v2:';
const AUDIT_PREFIX = 'cockpit-fin-audit-v1:'; // append-only, separado do state
const USAGE_PREFIX = 'cockpit-fin-usage-v1:'; // contador leve de visitas por rota (telemetria interna)
const AUDIT_MAX = 5000;                        // por empresa
const SNAP_MAX = 10;
const LEGACY_KEY = 'cockpit-fin-pp-v1';
const SCHEMA_VERSION = 2;                       // incrementar em mudanças incompatíveis
const QUOTA_SAFE_MARGIN = 0.90;                 // alerta acima de 90% de uso

// Canal de broadcast para detecção de abas concorrentes (best effort)
const _BC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('cockpit-fin') : null;

const DB = (() => {
  const empty = () => ({
    _schemaVersion: SCHEMA_VERSION,
    empresa: { nome: 'Minha Empresa', caixaInicial: 0, pixChave: '', pixCidade: 'SAO PAULO', cnpj: '', setor: '' },
    parametros: {
      caixaMinimo: 5000, metaMargemPct: 35, limiteInadimplenciaPct: 5,
      custosFixosMensais: 0, vendasMediaDiaria: 0, estoqueAtual: 0, diasAtrasoRisco: 15
    },
    clientes: [], fornecedores: [], produtos: [],
    contas: [{ id: 'principal', nome: 'Caixa principal', tipo: 'caixa', saldoInicial: 0, ativa: true }],
    movimentos: [], titulosReceber: [], titulosPagar: [],
    categorias: {
      entrada: ['Vendas', 'Serviços', 'Aporte', 'Outros'],
      saida: ['Fornecedores', 'Folha', 'Tributos', 'Aluguel', 'Sistemas', 'Pró-labore', 'Outros']
    },
    reguaCobranca: [
      { dias: -2, acao: 'Aviso prévio de vencimento', canal: 'e-mail/whatsapp' },
      { dias: 1,  acao: 'Primeiro contato de cobrança', canal: 'telefone' },
      { dias: 5,  acao: 'Segundo contato + negociação', canal: 'telefone/e-mail' },
      { dias: 15, acao: 'Renegociação formal',          canal: 'reunião' },
      { dias: 30, acao: 'Suspensão comercial',          canal: 'formal' }
    ],
    auditoria: [], // mantido por compatibilidade de leitura; NÃO é fonte oficial (ver AUDIT_PREFIX)
    metas: { receitaMensal: 0, resultadoMensal: 0, inadimplenciaMaxPct: 5, margemMinPct: 35 },
    onboardingConcluido: false,
    interacoes: [],
    anexos: {},
    orcamento: {},
    recorrencias: []
  });

  const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- Schema validation ----------
  // Valida estrutura mínima do JSON importado. Retorna { ok, erro? }.
  function validarSchema(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return { ok: false, erro: 'Raiz precisa ser um objeto JSON.' };
    // Empresa pode vir como objeto ou ausente (merge com defaults)
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
    // Sanity em registros financeiros (amostra, para detectar JSON corrompido)
    const checkTitulo = (t, nome) => {
      if (!t || typeof t !== 'object') return `${nome}: item não é objeto`;
      if (t.valor !== undefined && !isFinite(Number(t.valor))) return `${nome}: valor não numérico`;
      return null;
    };
    for (const t of (data.movimentos || []).slice(0, 50)) {
      const e = checkTitulo(t, 'movimento'); if (e) return { ok: false, erro: e };
    }
    for (const t of (data.titulosReceber || []).slice(0, 50)) {
      const e = checkTitulo(t, 'título a receber'); if (e) return { ok: false, erro: e };
    }
    for (const t of (data.titulosPagar || []).slice(0, 50)) {
      const e = checkTitulo(t, 'título a pagar'); if (e) return { ok: false, erro: e };
    }
    return { ok: true };
  }

  // ---------- Meta e dados ----------
  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { empresas: [], empresaAtivaId: null, perfilAtivo: 'socio', modoAvancado: false };
  }
  function saveMeta() { safeSet(META_KEY, JSON.stringify(meta)); }

  function loadData(empresaId) {
    try {
      const raw = localStorage.getItem(DATA_PREFIX + empresaId);
      if (!raw) return empty();
      return { ...empty(), ...JSON.parse(raw) };
    } catch { return empty(); }
  }
  function saveData() { safeSet(DATA_PREFIX + meta.empresaAtivaId, JSON.stringify(state)); }

  // Encapsula setItem com tratamento de QuotaExceededError e alerta não-bloqueante
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.error('[DB] Quota do localStorage excedida ao gravar', key);
        // Notifica via window event — a UI decide como apresentar
        window.dispatchEvent(new CustomEvent('cockpit-fin-quota-exceeded', { detail: { key } }));
      } else {
        console.error('[DB] Falha ao gravar', key, e);
      }
      return false;
    }
  }

  // ---------- Auditoria append-only em chave própria ----------
  // Formato JSONL (uma linha por evento) comprimido em um único item JSON.
  function auditAppend(ev) {
    const key = AUDIT_PREFIX + (meta.empresaAtivaId || 'default');
    let lista = [];
    try { lista = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    lista.push(ev);
    if (lista.length > AUDIT_MAX) lista = lista.slice(-AUDIT_MAX);
    safeSet(key, JSON.stringify(lista));
    // Espelho legado dentro do state (últimos 500), para compatibilidade de UI
    state.auditoria = (state.auditoria || []);
    state.auditoria.unshift(ev);
    state.auditoria = state.auditoria.slice(0, 500);
  }

  function auditLoad(empresaId) {
    const key = AUDIT_PREFIX + (empresaId || meta.empresaAtivaId || 'default');
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }

  // ---------- Migração de versão legada ----------
  function migrateLegacy() {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    try {
      const legacy = JSON.parse(raw);
      const eid = id();
      meta.empresas.push({ id: eid, nome: legacy.empresa?.nome || 'Empresa migrada' });
      meta.empresaAtivaId = eid;
      safeSet(DATA_PREFIX + eid, JSON.stringify({ ...empty(), ...legacy }));
      localStorage.removeItem(LEGACY_KEY);
      saveMeta();
    } catch {}
  }

  let meta = loadMeta();
  if (!meta.empresas.length) migrateLegacy();
  if (!meta.empresas.length) {
    const eid = id();
    meta.empresas = [{ id: eid, nome: 'Minha Empresa' }];
    meta.empresaAtivaId = eid;
    saveMeta();
  }
  if (!meta.empresaAtivaId || !meta.empresas.find(e => e.id === meta.empresaAtivaId)) {
    meta.empresaAtivaId = meta.empresas[0].id;
    saveMeta();
  }

  let state = loadData(meta.empresaAtivaId);
  const listeners = new Set();

  function emit() { listeners.forEach(fn => fn(state)); }
  function save() { saveData(); emit(); }

  // ---------- BroadcastChannel: detectar segunda aba ----------
  const _tabId = id();
  if (_BC) {
    _BC.onmessage = (msg) => {
      if (!msg || !msg.data) return;
      if (msg.data.type === 'hello' && msg.data.empresaId === meta.empresaAtivaId && msg.data.tabId !== _tabId) {
        // Outra aba com a mesma empresa. Notifica a UI.
        window.dispatchEvent(new CustomEvent('cockpit-fin-concurrent-tab', { detail: { tabId: msg.data.tabId } }));
      }
      if (msg.data.type === 'data-changed' && msg.data.empresaId === meta.empresaAtivaId && msg.data.tabId !== _tabId) {
        // Outra aba gravou — recarrega state para minimizar divergência
        state = loadData(meta.empresaAtivaId);
        emit();
      }
    };
    // Anuncia presença
    try { _BC.postMessage({ type: 'hello', empresaId: meta.empresaAtivaId, tabId: _tabId }); } catch {}
  }

  function broadcastChange() {
    if (!_BC) return;
    try { _BC.postMessage({ type: 'data-changed', empresaId: meta.empresaAtivaId, tabId: _tabId }); } catch {}
  }

  // ---------- Quota ----------
  async function checarQuota() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const est = await navigator.storage.estimate();
      const uso = est.usage || 0, total = est.quota || 0;
      return { uso, total, pct: total > 0 ? uso / total : 0, alerta: total > 0 && (uso / total) > QUOTA_SAFE_MARGIN };
    } catch { return null; }
  }

  return {
    id,
    SCHEMA_VERSION,
    validarSchema,
    checarQuota,
    get: () => state,
    meta: () => meta,
    set: (updater) => { updater(state); save(); broadcastChange(); },
    reset: () => { state = empty(); save(); broadcastChange(); },
    replace: (data) => {
      const v = validarSchema(data);
      if (!v.ok) throw new Error('Import inválido: ' + v.erro);
      state = { ...empty(), ...data, _schemaVersion: SCHEMA_VERSION };
      save(); broadcastChange();
    },
    // Substituto oficial de .replace que já valida e logs auditoria
    importar: (data, origem = 'arquivo') => {
      const v = validarSchema(data);
      if (!v.ok) return { ok: false, erro: v.erro };
      state = { ...empty(), ...data, _schemaVersion: SCHEMA_VERSION };
      save(); broadcastChange();
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
      return lista.map(e => JSON.stringify(e)).join('\n'); // JSONL
    },

    // ---------- Cancelamento lógico ----------
    // Títulos (receber/pagar) e movimentos passam a status 'cancelado' com motivo e autor,
    // em vez de serem removidos fisicamente do array. Isso preserva rastreabilidade.
    cancelarTituloReceber: (tituloId, motivo) => {
      const m = String(motivo || '').trim();
      if (!m) return { ok: false, erro: 'Motivo do cancelamento é obrigatório.' };
      let achou = false;
      DB_internalSet(s => {
        const t = s.titulosReceber.find(x => x.id === tituloId);
        if (!t) return;
        t.status = 'cancelado';
        t.cancelamento = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, motivo: m };
        achou = true;
      });
      if (achou) auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'cancelar-receber', detalhe: `tituloId=${tituloId}; motivo=${m}` });
      return achou ? { ok: true } : { ok: false, erro: 'Título não encontrado.' };
    },
    cancelarTituloPagar: (tituloId, motivo) => {
      const m = String(motivo || '').trim();
      if (!m) return { ok: false, erro: 'Motivo do cancelamento é obrigatório.' };
      let achou = false;
      DB_internalSet(s => {
        const t = s.titulosPagar.find(x => x.id === tituloId);
        if (!t) return;
        if (t.pago) return; // pagos não podem ser cancelados — exige estorno
        t.cancelado = true;
        t.cancelamento = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, motivo: m };
        achou = true;
      });
      if (achou) auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'cancelar-pagar', detalhe: `tituloId=${tituloId}; motivo=${m}` });
      return achou ? { ok: true } : { ok: false, erro: 'Título não encontrado ou já pago.' };
    },
    cancelarMovimento: (movId, motivo) => {
      const m = String(motivo || '').trim();
      if (!m) return { ok: false, erro: 'Motivo do cancelamento é obrigatório.' };
      let achou = false;
      DB_internalSet(s => {
        const mv = s.movimentos.find(x => x.id === movId);
        if (!mv) return;
        if (mv.origem === 'baixa-receber' || mv.origem === 'baixa-pagar') return; // só por estorno do título
        mv.cancelado = true;
        mv.cancelamento = { ts: new Date().toISOString(), perfil: meta.perfilAtivo, motivo: m };
        achou = true;
      });
      if (achou) auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'cancelar-movimento', detalhe: `movId=${movId}; motivo=${m}` });
      return achou ? { ok: true } : { ok: false, erro: 'Movimento não encontrado ou é fruto de baixa (requer estorno).' };
    },

    // Multi-empresa
    listEmpresas: () => meta.empresas.slice(),
    empresaAtivaId: () => meta.empresaAtivaId,
    createEmpresa: (nome) => {
      const eid = id();
      meta.empresas.push({ id: eid, nome });
      meta.empresaAtivaId = eid;
      saveMeta();
      state = empty();
      state.empresa.nome = nome;
      save(); broadcastChange();
      return eid;
    },
    readEmpresa: (eid) => loadData(eid),
    switchEmpresa: (eid) => {
      if (!meta.empresas.find(e => e.id === eid)) return;
      meta.empresaAtivaId = eid; saveMeta();
      state = loadData(eid); emit();
    },
    renameEmpresa: (eid, nome) => {
      const e = meta.empresas.find(x => x.id === eid); if (!e) return;
      e.nome = nome; saveMeta();
      if (eid === meta.empresaAtivaId) { state.empresa.nome = nome; save(); }
    },
    removeEmpresa: (eid) => {
      if (meta.empresas.length <= 1) return false;
      meta.empresas = meta.empresas.filter(e => e.id !== eid);
      localStorage.removeItem(DATA_PREFIX + eid);
      localStorage.removeItem(AUDIT_PREFIX + eid);
      if (meta.empresaAtivaId === eid) meta.empresaAtivaId = meta.empresas[0].id;
      saveMeta();
      state = loadData(meta.empresaAtivaId); emit();
      auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'remover-empresa', detalhe: `eid=${eid}` });
      return true;
    },

    // Perfis
    perfis: ['socio', 'financeiro', 'comercial', 'contabilidade'],
    getPerfil: () => meta.perfilAtivo || 'socio',
    setPerfil: (p) => { meta.perfilAtivo = p; saveMeta(); emit(); },
    modoAvancado: () => !!meta.modoAvancado,
    setModoAvancado: (v) => { meta.modoAvancado = !!v; saveMeta(); emit(); },

    // Snapshots
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
      state = { ...empty(), ...snap.data }; save();
      auditAppend({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao: 'restore-snapshot', detalhe: `ts=${ts}; label=${snap.label || ''}` });
      return true;
    },
    deleteSnapshot: (ts) => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      let list = []; try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
      list = list.filter(s => s.ts !== ts);
      safeSet(key, JSON.stringify(list));
    },

    // ---------- Telemetria leve (interna, local) ----------
    // Contador de visitas por rota. Usado para decidir roadmap com dado, não com opinião.
    // Não coleta nada além de { rotaId -> { count, firstSeen, lastSeen } } por empresa.
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
      // CSV pronto para Excel pt-BR
      const rows = Object.entries(u).map(([r, v]) => `${r};${v.count};${v.firstSeen};${v.lastSeen}`);
      return '\uFEFFrota;visitas;primeira_visita;ultima_visita\n' + rows.join('\n');
    }
  };

  // Helper interno para mutações dentro deste closure
  function DB_internalSet(updater) {
    updater(state); save(); broadcastChange();
  }
})();

// Matriz de permissões por perfil (controle de UI; NÃO substitui backend).
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
