(function () {
  const routes = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', sub: 'Visão executiva do caixa, margem e alertas.', render: Views.dashboard },
    { id: 'caixa',     label: 'Fluxo de caixa', icon: '💵', sub: 'Entradas e saídas realizadas e previstas.', render: Views.fluxoCaixa },
    { id: 'contas',    label: 'Contas', icon: '🏧', sub: 'Bancos, caixas e saldos por conta.', render: Views.contas },
    { id: 'clientes',  label: 'Clientes', icon: '👥', sub: 'Cadastro de clientes — buscar, editar, exportar.', render: Views.clientes },
    { id: 'fornecedores', label: 'Fornecedores', icon: '🏭', sub: 'Cadastro de fornecedores — buscar, editar, exportar.', render: Views.fornecedores },
    { id: 'receber',   label: 'Contas a receber', icon: '📥', sub: 'Títulos, vencimentos, atrasos e aging.', render: Views.receber },
    { id: 'pagar',     label: 'Contas a pagar', icon: '📤', sub: 'Obrigações, prioridade e calendário.', render: Views.pagar },
    { id: 'regua',     label: 'Régua de cobrança', icon: '📣', sub: 'Ações sugeridas por faixa de atraso.', render: Views.regua },
    { id: 'cobrancaLote', label: 'Cobrança em lote', icon: '📢', sub: 'Selecionar vários e disparar WhatsApp/e-mail com PIX.', render: Views.cobrancaLote },
    { id: 'calendario', label: 'Calendário', icon: '📅', sub: 'Agenda mensal de vencimentos.', render: Views.calendario },
    { id: 'margem',    label: 'Margem e preço', icon: '📈', sub: 'MC, ponto de equilíbrio e mix.', render: Views.margem },
    { id: 'dre',       label: 'DRE gerencial', icon: '🧾', sub: 'Demonstrativo de resultado mensal.', render: Views.dre },
    { id: 'orcamento', label: 'Orçamento', icon: '💼', sub: 'Budget por categoria vs. realizado.', render: Views.orcamento },
    { id: 'metas',     label: 'Metas & forecast', icon: '🎯', sub: 'Meta mensal e projeção de fechamento.', render: Views.metas },
    { id: 'recorrencias', label: 'Recorrências', icon: '🔁', sub: 'Lançamentos fixos (aluguel, salários, assinaturas).', render: Views.recorrencias },
    { id: 'conciliacao', label: 'Conciliação bancária', icon: '🏦', sub: 'Importar extrato OFX/CSV e casar com previstos.', render: Views.conciliacao },
    { id: 'relatorios', label: 'Relatórios', icon: '📑', sub: 'Exportações CSV e resumo mensal.', render: Views.relatorios },
    { id: 'snapshots', label: 'Backups', icon: '💾', sub: 'Backups locais com restauração.', render: Views.snapshots },
    { id: 'importBase', label: 'Importar base', icon: '📥', sub: 'Mesclar arquivo JSON de clientes e fornecedores.', render: Views.importBase },
    { id: 'importNFSe', label: 'Importar NFS-e', icon: '🧾', sub: 'Importar XMLs de NFS-e da Nota Carioca (Prefeitura do Rio).', render: Views.importNFSe },
    { id: 'config',    label: 'Configurações', icon: '⚙️', sub: 'Parâmetros financeiros e empresa.', render: Views.config }
  ];

  function visibleRoutes() { return routes; }

  const nav = document.getElementById('nav');
  let current = 'dashboard';

  function renderNav() {
    nav.innerHTML = '';
    visibleRoutes().forEach(r => {
      const item = document.createElement('div');
      item.className = 'nav-item' + (current === r.id ? ' active' : '');
      item.innerHTML = `<span>${r.icon}</span><span>${r.label}</span>`;
      item.onclick = () => { current = r.id; go(); };
      nav.appendChild(item);
    });
  }

  const guard = { config: 'configurar', empresas: 'configurar', relatorios: 'relatorios' };

  window.Nav = (id) => { current = id; go(); };

  function go() {
    if (!visibleRoutes().find(x => x.id === current)) current = 'dashboard';
    const r = routes.find(x => x.id === current);
    document.getElementById('page-title').textContent = r.label;
    document.getElementById('page-sub').textContent = r.sub;
    document.getElementById('empresa-nome').textContent = DB.get().empresa.nome || '—';
    document.getElementById('print-empresa').textContent = DB.get().empresa.nome || '—';
    document.getElementById('print-data').textContent = 'Emitido em ' + new Date().toLocaleString('pt-BR');
    renderNav();
    const need = guard[r.id];
    if (need && !can(need)) {
      document.getElementById('view').innerHTML = `<div class="card"><strong>Acesso negado.</strong><div class="text-sm text-slate-500 mt-2">O perfil <b>${DB.getPerfil()}</b> não tem permissão para esta área.</div></div>`;
      return;
    }
    if (DB.registrarUso) DB.registrarUso(r.id);
    r.render(DB.get());
  }

  DB.subscribe(() => { renderSelectors(); go(); });

  function renderSelectors() {
    const selE = document.getElementById('sel-empresa');
    const selP = document.getElementById('sel-perfil');
    selE.innerHTML = '';
    DB.listEmpresas().forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.nome;
      if (e.id === DB.empresaAtivaId()) opt.selected = true;
      selE.appendChild(opt);
    });
    selE.onchange = () => DB.switchEmpresa(selE.value);

    selP.innerHTML = '';
    DB.perfis.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      if (p === DB.getPerfil()) opt.selected = true;
      selP.appendChild(opt);
    });
    selP.onchange = () => { DB.setPerfil(selP.value); };
  }
  renderSelectors();

  document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(DB.get(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cockpit-fin-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  document.getElementById('file-import').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let data;
      try { data = JSON.parse(r.result); }
      catch { UI.toast('Arquivo JSON malformado.', 'r'); return; }
      const nomeEmp = (DB.get().empresa && DB.get().empresa.nome) || 'esta empresa';
      UI.confirmarCritico({
        titulo: 'Substituir todos os dados?',
        mensagem: 'Isto vai substituir TODOS os dados atuais de "' + nomeEmp + '" pelos dados do arquivo. Um snapshot automático será criado antes como segurança.',
        confirmacao: 'SUBSTITUIR',
        labelBotao: 'Substituir'
      }, () => {
        DB.snapshot('pre-import');
        const r2 = DB.importar(data, f.name);
        if (!r2.ok) { UI.toast('Import rejeitado: ' + r2.erro, 'r'); return; }
        UI.toast('Dados importados com sucesso. Snapshot pré-import salvo.', 'v');
        go();
      });
    };
    r.readAsText(f);
  };

  document.getElementById('btn-reset').onclick = () => {
    // Guarda defensivo: apenas admin pode zerar (mesmo que esconda o botao,
    // alguem poderia clicar via DevTools).
    if (!window.IS_ADMIN) {
      UI.toast('Apenas administradores podem zerar a base.', 'r');
      return;
    }
    const nomeEmp = (DB.get().empresa && DB.get().empresa.nome) || 'Empresa';
    UI.confirmarCritico({
      titulo: 'Zerar todos os dados',
      mensagem: 'Esta ação apaga permanentemente todos os lançamentos, títulos, clientes e fornecedores da empresa "' + nomeEmp + '". Um snapshot automático será criado antes.',
      confirmacao: 'ZERAR ' + nomeEmp,
      labelBotao: 'Zerar tudo'
    }, () => {
      DB.snapshot('pre-reset');
      DB.reset();
      DB.log('reset', 'zerado via UI (pós confirmação em 2 etapas)');
      UI.toast('Dados zerados. Snapshot pré-reset salvo.', 'v');
      go();
    });
  };

  document.getElementById('btn-export').addEventListener('click', () => DB.log('export', 'backup completo JSON'));

  document.getElementById('btn-print').onclick = () => {
    if (current !== 'dashboard' && current !== 'relatorios' && current !== 'benchmark') { current = 'dashboard'; go(); }
    setTimeout(() => window.print(), 150);
  };

  document.getElementById('btn-snapshot').onclick = () => { DB.snapshot('manual'); DB.log('snapshot-manual', 'criado via botão'); UI.toast('Snapshot salvo.', 'v'); };

  // Eventos de hardening Fase A
  window.addEventListener('cockpit-fin-concurrent-tab', () => {
    UI.toast('⚠ App aberto em outra aba. Evite editar nas duas — pode causar perda de dados.', 'a');
  });
  window.addEventListener('cockpit-fin-quota-exceeded', () => {
    UI.toast('⚠ Espaço de armazenamento cheio. Remova anexos grandes ou exporte e zere dados antigos.', 'r');
  });
  // Aviso de quota próxima do limite (checagem na inicialização)
  if (DB.checarQuota) DB.checarQuota().then(q => {
    if (q && q.alerta) {
      UI.toast('⚠ Armazenamento local em ' + (q.pct*100).toFixed(0) + '% de uso. Exporte backup e considere limpar dados antigos.', 'a');
    }
  });

  // Notificacoes do navegador desativadas no boot.
  // Geravam o pop-up "Permitir notificacoes?" toda primeira abertura.
  // Se quisermos religar, deve ser apenas apos o usuario clicar em "Ativar alertas".

  // Dark mode persistente
  (function theme() {
    const k = 'cockpit-fin-theme';
    const label = document.getElementById('theme-label');
    const apply = t => {
      document.documentElement.classList.toggle('dark', t === 'dark');
      if (label) label.textContent = t === 'dark' ? '☀️ Claro' : '🌙 Escuro';
    };
    apply(localStorage.getItem(k) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    document.getElementById('btn-theme').onclick = () => {
      const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const nxt = cur === 'dark' ? 'light' : 'dark';
      localStorage.setItem(k, nxt); apply(nxt);
    };
  })();

  // Busca global (Ctrl+K / Cmd+K)
  function openPalette() {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div'); overlay.className = 'palette';
    const box = document.createElement('div'); box.className = 'palette-box';
    const inp = document.createElement('input'); inp.placeholder = 'Buscar telas, clientes, fornecedores, títulos, produtos...';
    const list = document.createElement('div'); list.className = 'palette-results';
    box.appendChild(inp); box.appendChild(list); overlay.appendChild(box); root.appendChild(overlay);
    const close = () => root.innerHTML = '';
    overlay.onclick = e => { if (e.target === overlay) close(); };
    let items = buildIndex(), idx = 0;
    function buildIndex() {
      const st = DB.get();
      const out = visibleRoutes().map(r => ({ label: r.label, meta: 'ir para ' + r.id, go: () => { current = r.id; go(); } }));
      st.clientes.forEach(c => out.push({ label: c.nome, meta: 'Cliente · ' + (c.documento || ''), go: () => { current = 'receber'; go(); } }));
      st.fornecedores.forEach(f => out.push({ label: f.nome, meta: 'Fornecedor · ' + (f.categoria || ''), go: () => { current = 'pagar'; go(); } }));
      st.produtos.forEach(p => out.push({ label: p.nome, meta: 'Produto · ' + KPI.BRL(p.preco), go: () => { current = 'margem'; go(); } }));
      st.titulosReceber.forEach(t => out.push({ label: (t.documento || '—') + ' · ' + KPI.BRL(t.valor), meta: 'Receber · venc ' + t.vencimento, go: () => { current = 'receber'; go(); } }));
      st.titulosPagar.forEach(t => out.push({ label: (t.documento || '—') + ' · ' + KPI.BRL(t.valor), meta: 'Pagar · venc ' + t.vencimento, go: () => { current = 'pagar'; go(); } }));
      return out;
    }
    function render() {
      const q = inp.value.trim().toLowerCase();
      const results = (q ? items.filter(i => (i.label + ' ' + i.meta).toLowerCase().includes(q)) : items).slice(0, 50);
      list.innerHTML = '';
      results.forEach((r, i) => {
        const d = document.createElement('div');
        d.className = 'palette-item' + (i === idx ? ' active' : '');
        d.innerHTML = `<span>${r.label}</span><span class="meta">${r.meta}</span>`;
        d.onclick = () => { r.go(); close(); };
        list.appendChild(d);
      });
    }
    inp.oninput = () => { idx = 0; render(); };
    inp.onkeydown = e => {
      const count = list.children.length;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { idx = Math.min(count - 1, idx + 1); render(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); render(); }
      else if (e.key === 'Enter') { list.children[idx]?.click(); }
    };
    render(); setTimeout(() => inp.focus(), 0);
  }
  document.getElementById('btn-search').onclick = openPalette;
  // Atalhos globais: Ctrl+K (busca), "g" + letra para navegar rapidamente
  let awaitingGo = false, goTimer = null;
  const goMap = { d: 'dashboard', f: 'caixa', r: 'receber', p: 'pagar', m: 'margem', c: 'calendario', o: 'orcamento', x: 'dre', t: 'metas', l: 'relatorios', n: 'conciliacao', b: 'cobrancaLote' };
  // Telemetria de uso (v0.5 uso interno): g u exporta CSV de visitas por rota.
  function exportarTelemetriaUso() {
    if (!DB.exportarUso) { UI.toast('Telemetria indisponível.', 'r'); return; }
    const csv = DB.exportarUso();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `telemetria-uso-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    UI.toast('Telemetria exportada.', 'v');
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      awaitingGo = true;
      clearTimeout(goTimer);
      goTimer = setTimeout(() => { awaitingGo = false; }, 1500);
      return;
    }
    if (awaitingGo && e.key.toLowerCase() === 'u') {
      awaitingGo = false; clearTimeout(goTimer);
      exportarTelemetriaUso();
      return;
    }
    if (awaitingGo && goMap[e.key.toLowerCase()]) {
      awaitingGo = false;
      clearTimeout(goTimer);
      current = goMap[e.key.toLowerCase()]; go();
    }
    if (e.key === '?' && !awaitingGo) {
      alert('Atalhos:\nCtrl+K  Busca global\ng d  Dashboard\ng f  Fluxo de caixa\ng r  Receber\ng p  Pagar\ng b  Cobrança em lote\ng m  Margem\ng c  Calendário\ng o  Orçamento\ng x  DRE\ng t  Metas\ng l  Relatórios\ng n  Conciliação\ng u  Exportar telemetria de uso (CSV)');
    }
  });

  // Motor de recorrências: ao abrir o app, materializa lançamentos cujo "proxima" <= hoje
  (function recor() {
    const st = DB.get();
    const hoje = KPI.today();
    let gerou = 0;
    DB.set(s => {
      (s.recorrencias || []).filter(r => r.ativa).forEach(r => {
        let prox = r.proxima;
        const next = d => {
          const dt = new Date(d);
          if (r.frequencia === 'semanal') dt.setDate(dt.getDate() + 7);
          else if (r.frequencia === 'anual') dt.setFullYear(dt.getFullYear() + 1);
          else dt.setMonth(dt.getMonth() + 1);
          return dt.toISOString().slice(0, 10);
        };
        while (prox && prox <= hoje) {
          if (r.tipo === 'pagar') {
            s.titulosPagar.push({ id: DB.id(), fornecedorId: r.contraparteId || (s.fornecedores[0]?.id), documento: r.descricao + ' (rec)', competencia: prox, vencimento: prox, valor: +r.valor, categoria: r.categoria || 'Outros', prioridade: 'obrigatorio', pago: false });
          } else if (r.tipo === 'receber') {
            s.titulosReceber.push({ id: DB.id(), clienteId: r.contraparteId || (s.clientes[0]?.id), documento: r.descricao + ' (rec)', emissao: prox, vencimento: prox, valor: +r.valor, valorRecebido: 0, status: 'aberto' });
          } else {
            s.movimentos.push({ id: DB.id(), data: prox, descricao: r.descricao + ' (rec)', categoria: r.categoria || 'Outros', tipo: r.tipoMov || 'saida', natureza: 'op', status: 'previsto', valor: +r.valor, origem: 'recorrencia' });
          }
          prox = next(prox); gerou++;
        }
        r.proxima = prox;
      });
    });
    if (gerou) DB.log('recorrencias', `${gerou} lançamentos gerados`);
  })();

  // Onboarding desativado: era um pop-up automatico no boot.
  // Usuario que precisar pode acessar manualmente via Configuracoes.

  // Backup diário automático (primeiro uso do dia cria snapshot 'auto-diario')
  (function autoSnapshot() {
    const k = 'cockpit-fin-last-auto:' + DB.empresaAtivaId();
    const hoje = KPI.today();
    if (localStorage.getItem(k) !== hoje) {
      DB.snapshot('auto-diario');
      localStorage.setItem(k, hoje);
    }
  })();

  // Seed demo data na primeira abertura vazia
  // Migracao: empresas com nome "Empresa Demo" ou "Minha Empresa" sao renomeadas
  // para "CETEM Engenharia" automaticamente (uma vez).
  (function migrarNomeDefault() {
    const st = DB.get();
    const nome = (st.empresa && st.empresa.nome) || '';
    if (nome === 'Empresa Demo' || nome === 'Minha Empresa') {
      DB.renameEmpresa(DB.empresaAtivaId(), 'CETEM Engenharia');
    }
  })();

  (function seed() {
    const st = DB.get();
    if (st.clientes.length || st.fornecedores.length || st.movimentos.length) return;
    DB.set(s => {
      s.empresa.nome = 'CETEM Engenharia';
      s.empresa.caixaInicial = 25000;
      s.parametros.custosFixosMensais = 18000;
      s.parametros.vendasMediaDiaria = 2500;
      s.parametros.estoqueAtual = 15000;
      const c1 = { id: DB.id(), nome: 'Cliente Alfa', documento: '11.111.111/0001-11', limite: 20000, prazo: 30, rating: 'bom' };
      const c2 = { id: DB.id(), nome: 'Cliente Beta',  documento: '22.222.222/0001-22', limite: 10000, prazo: 30, rating: 'atencao' };
      s.clientes.push(c1, c2);
      const f1 = { id: DB.id(), nome: 'Fornecedor Gama', categoria: 'Insumos', condicao: '30d', criticidade: 'critico' };
      const f2 = { id: DB.id(), nome: 'Locadora Delta',  categoria: 'Aluguel',  condicao: 'mensal', criticidade: 'critico' };
      s.fornecedores.push(f1, f2);
      const d = (off) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
      s.titulosReceber.push(
        { id: DB.id(), clienteId: c1.id, documento: 'NF-001', emissao: d(-20), vencimento: d(5),  valor: 8500, valorRecebido: 0, status: 'aberto' },
        { id: DB.id(), clienteId: c2.id, documento: 'NF-002', emissao: d(-40), vencimento: d(-10), valor: 4200, valorRecebido: 0, status: 'aberto' }
      );
      s.titulosPagar.push(
        { id: DB.id(), fornecedorId: f1.id, documento: 'FAT-100', competencia: d(-10), vencimento: d(3), valor: 6200, categoria: 'Fornecedores', prioridade: 'obrigatorio', pago: false },
        { id: DB.id(), fornecedorId: f2.id, documento: 'ALU-03',  competencia: d(-5),  vencimento: d(7), valor: 4500, categoria: 'Aluguel',      prioridade: 'obrigatorio', pago: false }
      );
      s.produtos.push(
        { id: DB.id(), nome: 'Produto A', preco: 150, imposto: 12, custoVariavel: 70, comissao: 5, volume: 200 },
        { id: DB.id(), nome: 'Serviço B', preco: 400, imposto: 8,  custoVariavel: 120, comissao: 0, volume: 40 }
      );
      s.movimentos.push(
        { id: DB.id(), data: d(-2), descricao: 'Venda balcão', categoria: 'Vendas',     tipo: 'entrada', natureza: 'op', status: 'realizado', valor: 3200, origem: 'manual' },
        { id: DB.id(), data: d(-1), descricao: 'Tarifas banco', categoria: 'Outros',     tipo: 'saida',   natureza: 'op', status: 'realizado', valor: 180,  origem: 'manual' }
      );
    });
  })();

  go();
})();
