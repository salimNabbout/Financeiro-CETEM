// Persistência local multi-empresa (Fase 3). Escopo por chave de empresa.
const META_KEY = 'cockpit-fin-meta-v2';
const DATA_PREFIX = 'cockpit-fin-data-v2:';
const SNAP_PREFIX = 'cockpit-fin-snap-v2:';
const SNAP_MAX = 10;
const LEGACY_KEY = 'cockpit-fin-pp-v1';

const DB = (() => {
  const empty = () => ({
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
    auditoria: [],
    metas: { receitaMensal: 0, resultadoMensal: 0, inadimplenciaMaxPct: 5, margemMinPct: 35 },
    onboardingConcluido: false,
    interacoes: [], // { id, clienteId, tituloId?, ts, tipo:'cobranca'|'anotacao'|'retorno', canal, mensagem }
    anexos: {},     // { [tituloId]: [{ id, nome, tipo, tamanho, data, conteudo(base64) }] }
    orcamento: {}, // { "Aluguel": 5000, "Folha": 12000, ... } — mensal recorrente
    recorrencias: [] // { id, tipo:'pagar'|'receber'|'movimento', descricao, valor, categoria, frequencia:'mensal'|'semanal'|'anual', dia, proxima, ativa, contraparteId }
  });

  const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { empresas: [], empresaAtivaId: null, perfilAtivo: 'socio', modoAvancado: false };
  }

  function saveMeta() { localStorage.setItem(META_KEY, JSON.stringify(meta)); }

  function loadData(empresaId) {
    try {
      const raw = localStorage.getItem(DATA_PREFIX + empresaId);
      if (!raw) return empty();
      return { ...empty(), ...JSON.parse(raw) };
    } catch { return empty(); }
  }
  function saveData() { localStorage.setItem(DATA_PREFIX + meta.empresaAtivaId, JSON.stringify(state)); }

  // Migração de versão legada
  function migrateLegacy() {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    try {
      const legacy = JSON.parse(raw);
      const eid = id();
      meta.empresas.push({ id: eid, nome: legacy.empresa?.nome || 'Empresa migrada' });
      meta.empresaAtivaId = eid;
      localStorage.setItem(DATA_PREFIX + eid, JSON.stringify({ ...empty(), ...legacy }));
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

  return {
    id,
    get: () => state,
    meta: () => meta,
    set: (updater) => { updater(state); save(); },
    reset: () => { state = empty(); save(); },
    replace: (data) => { state = { ...empty(), ...data }; save(); },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    log: (acao, detalhe) => {
      state.auditoria = state.auditoria || [];
      state.auditoria.unshift({ ts: new Date().toISOString(), perfil: meta.perfilAtivo, acao, detalhe });
      state.auditoria = state.auditoria.slice(0, 500);
      save();
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
      save();
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
      if (meta.empresaAtivaId === eid) meta.empresaAtivaId = meta.empresas[0].id;
      saveMeta();
      state = loadData(meta.empresaAtivaId); emit();
      return true;
    },

    // Perfis
    perfis: ['socio', 'financeiro', 'comercial', 'contabilidade'],
    getPerfil: () => meta.perfilAtivo || 'socio',
    setPerfil: (p) => { meta.perfilAtivo = p; saveMeta(); emit(); },
    modoAvancado: () => !!meta.modoAvancado,
    setModoAvancado: (v) => { meta.modoAvancado = !!v; saveMeta(); emit(); },

    // Snapshots (backup/restore)
    snapshot: (label) => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      let list = [];
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
      list.unshift({ ts: new Date().toISOString(), label: label || 'manual', data: JSON.parse(JSON.stringify(state)) });
      list = list.slice(0, SNAP_MAX);
      localStorage.setItem(key, JSON.stringify(list));
    },
    listSnapshots: () => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    },
    restoreSnapshot: (ts) => {
      const list = (function () { try { return JSON.parse(localStorage.getItem(SNAP_PREFIX + meta.empresaAtivaId) || '[]'); } catch { return []; } })();
      const snap = list.find(s => s.ts === ts);
      if (!snap) return false;
      state = { ...empty(), ...snap.data }; save(); return true;
    },
    deleteSnapshot: (ts) => {
      const key = SNAP_PREFIX + meta.empresaAtivaId;
      let list = []; try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
      list = list.filter(s => s.ts !== ts);
      localStorage.setItem(key, JSON.stringify(list));
    }
  };
})();

// Matriz de permissões por perfil (controle de UI; não substitui backend).
const PERMS = {
  socio:         { verTudo: true, pagar: true, baixar: true, editar: true, configurar: true, relatorios: true },
  financeiro:    { verTudo: true, pagar: true, baixar: true, editar: true, configurar: false, relatorios: true },
  comercial:     { verTudo: false, pagar: false, baixar: false, editar: false, configurar: false, relatorios: false, verClientes: true, verReceber: true },
  contabilidade: { verTudo: true, pagar: false, baixar: false, editar: false, configurar: false, relatorios: true }
};
function can(acao) {
  const p = PERMS[DB.getPerfil()] || PERMS.socio;
  return !!p[acao] || (p.verTudo && ['ver', 'verRelatorios'].includes(acao));
}
