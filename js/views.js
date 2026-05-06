const Views = (() => {
  // Helper local: pt-BR date format. Tem um espelho em UI.fmtDate (ui.js),
  // mas mantemos aqui para evitar crash se ui.js estiver em versao antiga (cache).
  function fmtDate(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    try {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
    } catch (e) {}
    return iso;
  }

  const { el, modal, confirmar, field, kpi, badge } = UI;
  const { BRL, PCT, today, daysBetween } = KPI;
  let chartRef = null;
  let cenarioSel = 'realista';
  // Formata número como texto brasileiro (vírgula decimal), sem prefixo. 6000 -> '6000,00'.
  // Aceita null/undefined como '' (não força 0,00). Usado ao popular inputs de edição.
  function fmtVal(n) {
    if (n == null || n === '') return '';
    const v = Number(n);
    if (!isFinite(v)) return '';
    return v.toFixed(2).replace('.', ',');
  }

  function clientesMap(st) { const m = {}; st.clientes.forEach(c => m[c.id] = c); return m; }
  function fornecedoresMap(st) { const m = {}; st.fornecedores.forEach(c => m[c.id] = c); return m; }

  // ================= DASHBOARD (Cockpit Executivo CFO) =================
  let dashWaterRef = null;
  function dashboard(st) {
    const v = document.getElementById('view'); v.innerHTML = '';

    // ---- Calculos ----
    const saldo = KPI.saldoRealizado(st);
    const proj7 = KPI.saldoProjetadoSemana(st);
    const cob = KPI.coberturaCaixaFixo(st);
    const inad = KPI.inadimplenciaPct(st);
    const { mcPct, receita, mc } = KPI.margemContribuicao(st);
    const pe = KPI.pontoEquilibrio(st);
    const ncgV = KPI.ncg(st);
    const ro = KPI.resultadoOperacional(st);
    const burn = KPI.burnRate(st);
    const rw = KPI.runwayMeses(st);
    const alerts = KPI.alertas(st);
    const series = KPI.seriesKpi(st, 6);

    // Waterfall do mes corrente
    const hoje = new Date();
    const anoM = hoje.getFullYear();
    const mesM = hoje.getMonth() + 1;
    const ini = `${anoM}-${String(mesM).padStart(2,'0')}-01`;
    const ult = new Date(anoM, mesM, 0).getDate();
    const fim = `${anoM}-${String(mesM).padStart(2,'0')}-${String(ult).padStart(2,'0')}`;
    const movsMes = (st.movimentos || []).filter(m => !m.cancelado && m.status === 'realizado' && m.data >= ini && m.data <= fim);
    const entradasMes = movsMes.filter(m => m.tipo === 'entrada').reduce((s,m) => s + (+m.valor || 0), 0);
    const saidasMes = movsMes.filter(m => m.tipo === 'saida').reduce((s,m) => s + (+m.valor || 0), 0);
    const resultadoMes = entradasMes - saidasMes;
    const saldoInicialMes = saldo - resultadoMes;
    const metaResultado = (st.metas && st.metas.resultadoMensal) || 0;

    // Trend do saldo (diff vs ha 7 dias) - usa series
    const saldoAtualSerie = (series.saldoFim && series.saldoFim.length) ? series.saldoFim[series.saldoFim.length - 1] : saldo;
    const saldoAnterior = (series.saldoFim && series.saldoFim.length > 1) ? series.saldoFim[series.saldoFim.length - 2] : saldo;
    const variacaoMes = saldoAnterior !== 0 ? ((saldoAtualSerie - saldoAnterior) / Math.abs(saldoAnterior) * 100) : 0;

    // ---- Hero KPIs (4 cards) ----
    function heroCard(label, valor, hint, sev, onClick) {
      const cor = sev === 'r' ? '#A32D2D' : sev === 'a' ? '#854F0B' : sev === 'v' ? '#0F6E56' : '#5F5E5A';
      return el('div', {
        class: 'card cursor-pointer hover:shadow-md',
        style: 'padding: 14px 18px;',
        onclick: onClick || (() => {})
      }, [
        el('div', { style: 'font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .04em; font-weight: 600;' }, label),
        el('div', { style: 'font-size: 24px; font-weight: 600; margin-top: 4px;' }, valor),
        el('div', { style: 'font-size: 12px; margin-top: 2px; color: ' + cor + ';' }, hint)
      ]);
    }
    const hero = el('div', {
      style: 'display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 1.25rem;'
    }, [
      heroCard('Saldo consolidado', BRL(saldo),
        variacaoMes >= 0 ? `+${variacaoMes.toFixed(1)}% vs. mes anterior` : `${variacaoMes.toFixed(1)}% vs. mes anterior`,
        KPI.semSaldo(saldo, st.parametros.caixaMinimo), () => window.Nav('caixa')),
      heroCard('Resultado do mes', BRL(resultadoMes),
        metaResultado > 0 ? `Meta ${BRL(metaResultado)} · ${(resultadoMes/metaResultado*100).toFixed(0)}%` : 'Sem meta cadastrada',
        resultadoMes < 0 ? 'r' : (metaResultado > 0 && resultadoMes < metaResultado * 0.7 ? 'a' : 'v'),
        () => window.Nav('dre')),
      heroCard('Runway', rw == null ? 'Ilimitado' : rw.toFixed(1) + ' meses',
        rw == null ? 'Caixa folgado' : (rw < 3 ? 'Critico' : rw < 6 ? 'Atencao' : 'Caixa folgado'),
        rw == null ? 'v' : rw < 3 ? 'r' : rw < 6 ? 'a' : 'v',
        () => window.Nav('metas')),
      heroCard('Inadimplencia', PCT(inad),
        inad <= st.parametros.limiteInadimplenciaPct ? `Abaixo do limite (${st.parametros.limiteInadimplenciaPct}%)` : `Acima do limite (${st.parametros.limiteInadimplenciaPct}%)`,
        KPI.semInad(inad, st.parametros.limiteInadimplenciaPct), () => window.Nav('regua'))
    ]);
    v.appendChild(hero);

    // ---- Projecao 60 dias ----
    const chartCard = el('div', { class: 'card mb-3' }, [
      el('div', { class: 'flex justify-between items-center mb-3' }, [
        el('h3', { class: 'font-semibold' }, 'Projecao de caixa - proximos 60 dias'),
        el('div', { class: 'flex gap-1' }, Object.keys(KPI.CENARIOS).map(k =>
          el('button', { class: 'btn ' + (k === cenarioSel ? 'btn-p' : 'btn-s'), onclick: () => { cenarioSel = k; dashboard(DB.get()); } }, k[0].toUpperCase() + k.slice(1))
        ))
      ]),
      el('canvas', { id: 'chart-fluxo', height: '90' })
    ]);
    v.appendChild(chartCard);

    // ---- Linha 2: Waterfall + Alertas (60/40) ----
    const linha2 = el('div', { style: 'display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 1rem;' }, [
      el('div', { class: 'card' }, [
        el('h3', { class: 'font-semibold mb-3' }, `Waterfall - ${hoje.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`),
        el('canvas', { id: 'chart-water', height: '95' })
      ]),
      el('div', { class: 'card' }, [
        el('h3', { class: 'font-semibold mb-3' }, `Alertas (${alerts.length})`),
        alerts.length === 0
          ? el('div', { class: 'text-sm text-slate-500' }, 'Nenhum alerta critico no momento.')
          : el('div', { class: 'space-y-2' }, alerts.slice(0, 5).map(a => {
              const cor = a.sev === 'r' ? '#E24B4A' : a.sev === 'a' ? '#BA7517' : '#1D9E75';
              return el('div', { style: 'display: flex; gap: 10px; align-items: flex-start;' }, [
                el('span', { style: `width: 4px; align-self: stretch; background: ${cor}; border-radius: 2px;` }),
                el('div', {}, [
                  el('div', { style: 'font-size: 13px; font-weight: 500;' }, a.msg),
                  el('div', { style: 'font-size: 12px; color: #666;' }, a.acao || '')
                ])
              ]);
            }))
      ])
    ]);
    v.appendChild(linha2);

    // ---- Secondary KPIs (linha de detalhes) ----
    const secCards = el('div', { style: 'display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 1rem;' }, [
      heroCard('Margem contribuicao', PCT(mcPct), `${BRL(mc)} sobre ${BRL(receita)}`, KPI.semMargem(mcPct, st.parametros.metaMargemPct), () => window.Nav('margem')),
      heroCard('Ponto de equilibrio', pe == null ? '-' : BRL(pe), 'Receita minima mensal', pe && receita ? (receita < pe ? 'r' : 'v') : 'g', () => window.Nav('margem')),
      heroCard('Burn rate', burn > 0 ? BRL(burn) + '/mes' : 'Sem queima', 'Saidas - entradas (3m)', burn > 0 ? (burn > saldo * 0.5 ? 'r' : 'a') : 'v'),
      heroCard('NCG', BRL(ncgV), 'Capital de giro necessario', ncgV > saldo ? 'a' : 'v', () => window.Nav('dre'))
    ]);
    v.appendChild(secCards);

    // ---- Renderiza graficos (Chart.js) ----
    const proj60 = KPI.projecaoDiaria(st, 60, cenarioSel);
    if (chartRef) chartRef.destroy();
    chartRef = new Chart(document.getElementById('chart-fluxo'), {
      type: 'line',
      data: {
        labels: proj60.map(p => fmtDate(p.data)),
        datasets: [{
          label: 'Saldo projetado',
          data: proj60.map(p => p.saldo),
          borderColor: '#185FA5',
          backgroundColor: 'rgba(24,95,165,.1)',
          tension: .25,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { ticks: { callback: v => BRL(v) } }
        }
      }
    });

    if (dashWaterRef) dashWaterRef.destroy();
    dashWaterRef = new Chart(document.getElementById('chart-water'), {
      type: 'bar',
      data: {
        labels: ['Saldo inicial', 'Entradas', 'Saidas', 'Saldo final'],
        datasets: [{
          data: [saldoInicialMes, entradasMes, -saidasMes, saldo],
          backgroundColor: ['#888780', '#1D9E75', '#E24B4A', '#185FA5'],
          borderWidth: 0
        }]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => BRL(Math.abs(ctx.raw)) } } },
        scales: {
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { callback: v => BRL(Math.abs(v)) } }
        }
      }
    });
  }

  function custoFixoSafe(st) { return Math.max(1, KPI.custoFixoMensal(st)); }

  // ================= FLUXO DE CAIXA =================
  let fxFiltro = { conta: '', tag: '', texto: '' };
  function fluxoCaixa(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const header = el('div', { class: 'flex justify-between items-center flex-wrap gap-2' }, [
      el('div', { class: 'text-sm text-slate-600' }, `Saldo realizado: ${BRL(KPI.saldoRealizado(st))} · Previsto 7d: ${BRL(KPI.saldoProjetadoSemana(st))}`),
      el('div', { class: 'flex gap-2 flex-wrap' }, [
        can('editar') ? el('button', { class: 'btn btn-s', onclick: () => openImportCSV(st) }, 'Importar CSV') : null,
        can('editar') ? el('button', { class: 'btn btn-p', onclick: () => openMovimento(st) }, '+ Novo lançamento') : null
      ].filter(Boolean))
    ]);
    v.appendChild(header);

    const todasTags = Array.from(new Set(st.movimentos.flatMap(m => m.tags || []))).sort();
    const selConta = el('select', { class: 'select' }, [el('option', { value: '' }, 'Todas as contas'), ...(st.contas || []).map(c => el('option', { value: c.id }, c.nome))]);
    selConta.value = fxFiltro.conta;
    const selTag = el('select', { class: 'select' }, [el('option', { value: '' }, 'Todas as tags'), ...todasTags.map(t => el('option', { value: t }, t))]);
    selTag.value = fxFiltro.tag;
    const inpTexto = el('input', { class: 'input', placeholder: 'Buscar na descrição...', value: fxFiltro.texto });
    const aplicar = () => { fxFiltro = { conta: selConta.value, tag: selTag.value, texto: inpTexto.value }; fluxoCaixa(DB.get()); };
    selConta.onchange = aplicar; selTag.onchange = aplicar; inpTexto.onchange = aplicar;
    v.appendChild(el('div', { class: 'card grid grid-cols-1 md:grid-cols-3 gap-3' }, [
      field('Conta', selConta), field('Tag', selTag), field('Busca', inpTexto)
    ]));

    let movs = [...st.movimentos];
    if (fxFiltro.conta) movs = movs.filter(m => (m.contaId || 'principal') === fxFiltro.conta);
    if (fxFiltro.tag) movs = movs.filter(m => (m.tags || []).includes(fxFiltro.tag));
    if (fxFiltro.texto) { const q = fxFiltro.texto.toLowerCase(); movs = movs.filter(m => (m.descricao || '').toLowerCase().includes(q)); }
    movs.sort((a, b) => b.data.localeCompare(a.data));
    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      'Data', 'Descrição', 'Categoria', 'Tipo', 'Natureza', 'Status', 'Valor', 'Ações'
    ].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!movs.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 8, class: 'text-center py-6 text-slate-500' }, 'Sem lançamentos.')));
    movs.forEach(m => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, fmtDate(m.data)),
        el('td', {}, el('div', {}, [
          el('span', {}, m.descricao),
          ...(m.tags || []).map(t => { const b = badge(t, 'g'); b.style.marginLeft = '.25rem'; return b; })
        ])),
        el('td', {}, m.categoria || '—'),
        el('td', {}, badge(m.tipo === 'entrada' ? 'Entrada' : 'Saída', m.tipo === 'entrada' ? 'v' : 'r')),
        el('td', {}, ({ op: 'Operacional', nop: 'Não operacional', ext: 'Extraordinário' })[m.natureza] || '—'),
        el('td', {}, m.cancelado ? badge('Cancelado', 'r') : badge(m.status === 'realizado' ? 'Realizado' : 'Previsto', m.status === 'realizado' ? 'v' : 'a')),
        el('td', { class: m.tipo === 'entrada' ? 'text-green-700 font-medium' : 'text-red-700 font-medium' }, (m.tipo === 'entrada' ? '+' : '−') + BRL(m.valor)),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          can('editar') && !m.cancelado ? el('button', { class: 'btn btn-s', onclick: () => openMovimento(st, m) }, 'Editar') : null,
          can('cancelar') && !m.cancelado ? el('button', { class: 'btn btn-d', onclick: () => UI.pedirMotivo({ titulo: 'Cancelar lançamento' }, (motivo) => {
            const r = DB.cancelarMovimento(m.id, motivo);
            if (!r.ok) UI.toast(r.erro, 'r'); else UI.toast('Lançamento cancelado.', 'v');
          }) }, 'Cancelar') : null
        ].filter(Boolean)))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  function openMovimento(st, m = null) {
    const isEdit = !!m;
    const data = m || { data: today(), tipo: 'entrada', natureza: 'op', status: 'realizado', valor: 0, descricao: '', categoria: '' };
    const body = el('div');
    const inputs = {};
    const refreshCat = () => {
      const opts = st.categorias[inputs.tipo.value] || [];
      inputs.categoria.innerHTML = '';
      opts.forEach(o => inputs.categoria.appendChild(el('option', { value: o }, o)));
      if (data.categoria) inputs.categoria.value = data.categoria;
    };
    inputs.data = el('input', { type: 'date', class: 'input', value: data.data });
    inputs.descricao = el('input', { type: 'text', class: 'input', value: data.descricao });
    inputs.tipo = el('select', { class: 'select', onchange: refreshCat }, [
      el('option', { value: 'entrada' }, 'Entrada'),
      el('option', { value: 'saida' }, 'Saída')
    ]);
    inputs.tipo.value = data.tipo;
    inputs.categoria = el('select', { class: 'select' });
    inputs.natureza = el('select', { class: 'select' }, [
      el('option', { value: 'op' }, 'Operacional'),
      el('option', { value: 'nop' }, 'Não operacional'),
      el('option', { value: 'ext' }, 'Extraordinário')
    ]);
    inputs.natureza.value = data.natureza;
    inputs.status = el('select', { class: 'select' }, [
      el('option', { value: 'realizado' }, 'Realizado'),
      el('option', { value: 'previsto' }, 'Previsto')
    ]);
    inputs.status.value = data.status;
    inputs.valor = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmtVal(data.valor) });
    inputs.contaId = el('select', { class: 'select' }, (st.contas || []).filter(c => c.ativa !== false).map(c => el('option', { value: c.id }, c.nome)));
    inputs.contaId.value = data.contaId || 'principal';
    inputs.tags = el('input', { class: 'input', value: (data.tags || []).join(', '), placeholder: 'ex.: projeto X, marketing' });
    refreshCat();

    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Data', inputs.data), field('Valor (R$)', inputs.valor),
      field('Descrição', inputs.descricao), field('Categoria', inputs.categoria),
      field('Tipo', inputs.tipo), field('Natureza', inputs.natureza),
      field('Status', inputs.status), field('Conta', inputs.contaId)
    ]));
    body.appendChild(field('Tags (separadas por vírgula)', inputs.tags));

    modal(isEdit ? 'Editar lançamento' : 'Novo lançamento', body, () => {
      const payload = {
        id: m?.id || DB.id(),
        data: inputs.data.value,
        descricao: inputs.descricao.value.trim(),
        categoria: inputs.categoria.value,
        tipo: inputs.tipo.value, natureza: inputs.natureza.value, status: inputs.status.value,
        valor: Number(inputs.valor.value) || 0,
        contaId: inputs.contaId.value,
        tags: inputs.tags.value.split(',').map(t => t.trim()).filter(Boolean),
        origem: 'manual'
      };
      if (!payload.descricao || !payload.valor) { alert('Preencha descrição e valor.'); return false; }
      DB.set(s => {
        if (isEdit) s.movimentos = s.movimentos.map(x => x.id === m.id ? payload : x);
        else s.movimentos.push(payload);
      });
    });
  }

  // ================= CONTAS A RECEBER =================
  function receber(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cm = clientesMap(st);
    const hoje = today();
    const abertos = st.titulosReceber.filter(t => t.status !== 'cancelado');
    const totalAberto = abertos.filter(t => t.status !== 'pago').reduce((s, t) => s + ((+t.valor) - (+t.valorRecebido || 0)), 0);
    const vencidos = abertos.filter(t => t.status !== 'pago' && t.vencimento < hoje).reduce((s, t) => s + ((+t.valor) - (+t.valorRecebido || 0)), 0);

    // Aging
    const faixas = { 'a vencer': 0, '1-15 dias': 0, '16-30 dias': 0, '31-60 dias': 0, '> 60 dias': 0 };
    abertos.filter(t => t.status !== 'pago').forEach(t => {
      const saldo = (+t.valor) - (+t.valorRecebido || 0);
      const d = daysBetween(t.vencimento, hoje);
      if (d <= 0) faixas['a vencer'] += saldo;
      else if (d <= 15) faixas['1-15 dias'] += saldo;
      else if (d <= 30) faixas['16-30 dias'] += saldo;
      else if (d <= 60) faixas['31-60 dias'] += saldo;
      else faixas['> 60 dias'] += saldo;
    });

    v.appendChild(el('div', { class: 'flex justify-between items-center' }, [
      el('div', { class: 'text-sm text-slate-600' }, `Total em aberto: ${BRL(totalAberto)} · Vencidos: ${BRL(vencidos)}`),
      el('div', { class: 'flex gap-2' }, [
        // "+ Cliente" e "Importar clientes" removidos: agora ficam em Menu > Clientes
        // (e o "+ Cadastrar novo" inline no autocomplete do "+ Título").
        can('editar') ? el('button', { class: 'btn btn-p', onclick: () => openTituloReceber(st) }, '+ Título') : null
      ].filter(Boolean))
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Aging de recebíveis'),
      el('div', { class: 'grid-kpi' }, Object.entries(faixas).map(([k, val]) => {
        const sev = k === 'a vencer' ? 'v' : k === '1-15 dias' ? 'a' : 'r';
        return kpi(k, BRL(val), sev);
      }))
    ]));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      'Cliente', 'Documento', 'Emissão', 'Vencimento', 'Valor', 'Recebido', 'Saldo', 'Status', 'Atraso', 'Ações'
    ].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!abertos.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 10, class: 'text-center py-6 text-slate-500' }, 'Sem títulos.')));
    abertos.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento)).forEach(t => {
      const saldo = (+t.valor) - (+t.valorRecebido || 0);
      const atraso = t.status !== 'pago' && t.vencimento < hoje ? daysBetween(t.vencimento, hoje) : 0;
      tbody.appendChild(el('tr', {}, [
        el('td', {}, cm[t.clienteId]?.nome || '—'),
        el('td', {}, t.documento || '—'),
        el('td', {}, t.emissao ? fmtDate(t.emissao) : '—'),
        el('td', {}, fmtDate(t.vencimento)),
        el('td', {}, BRL(t.valor)),
        el('td', {}, BRL(t.valorRecebido || 0)),
        el('td', { class: 'font-medium' }, BRL(saldo)),
        el('td', {}, badge(t.status, t.status === 'pago' ? 'v' : t.status === 'parcial' ? 'a' : atraso > 0 ? 'r' : 'g')),
        el('td', {}, atraso > 0 ? badge(atraso + 'd', 'r') : '—'),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          can('baixar') ? el('button', { class: 'btn btn-s', onclick: () => openBaixaReceber(st, t) }, 'Baixar') : null,
          el('button', { class: 'btn btn-s', onclick: () => openPixQR(st, saldo, t.documento, cm[t.clienteId]?.nome) }, 'PIX'),
          el('button', { class: 'btn btn-s', onclick: () => openAnexos(st, t.id, 'receber') }, '📎' + (((st.anexos || {})[t.id] || []).length || '')),
          can('editar') ? el('button', { class: 'btn btn-s', onclick: () => openTituloReceber(st, t) }, 'Editar') : null,
          can('cancelar') && t.status !== 'cancelado' && t.status !== 'pago' ? el('button', { class: 'btn btn-d', onclick: () => UI.pedirMotivo({ titulo: 'Cancelar título a receber' }, (motivo) => {
            const r = DB.cancelarTituloReceber(t.id, motivo);
            if (!r.ok) UI.toast(r.erro, 'r'); else UI.toast('Título cancelado.', 'v');
          }) }, 'Cancelar') : null
        ]))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  // Helper: titulo de secao dentro de um modal
  function secao(titulo) {
    return el('div', { class: 'mt-4 mb-2 pb-1 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wide text-slate-500' }, titulo);
  }

  function openCliente(st, c = null, opts = {}) {
    const data = c || {
      nome: opts.preNome || '', razaoSocial: '', documento: '', ie: '',
      telefone: '', email: '', contato: '',
      cidade: '', estado: '', endereco: '', bairro: '', cep: '',
      banco: '', agencia: '', conta: '',
      limite: 0, prazo: 30, rating: 'bom',
      tipoAtividade: '', tags: ''
    };
    const body = el('div');
    const inp = {
      nome: el('input', { class: 'input', value: data.nome, placeholder: 'Nome de exibição (fantasia ou nome)' }),
      razaoSocial: el('input', { class: 'input', value: data.razaoSocial || '' }),
      documento: el('input', { class: 'input', value: data.documento }),
      ie: el('input', { class: 'input', value: data.ie || '' }),
      telefone: el('input', { class: 'input', value: data.telefone || '', placeholder: 'Ex.: (21) 2451-2581 ou 55DDDNNNNNNNN' }),
      email: el('input', { type: 'email', class: 'input', value: data.email || '' }),
      contato: el('input', { class: 'input', value: data.contato || '', placeholder: 'Nome do responsável' }),
      cidade: el('input', { class: 'input', value: data.cidade || '' }),
      estado: el('input', { class: 'input', value: data.estado || '', placeholder: 'UF', maxlength: 2 }),
      endereco: el('input', { class: 'input', value: data.endereco || '' }),
      bairro: el('input', { class: 'input', value: data.bairro || '' }),
      cep: el('input', { class: 'input', value: data.cep || '' }),
      banco: el('input', { class: 'input', value: data.banco || '' }),
      agencia: el('input', { class: 'input', value: data.agencia || '' }),
      conta: el('input', { class: 'input', value: data.conta || '' }),
      limite: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.limite }),
      prazo: el('input', { type: 'number', class: 'input', value: data.prazo }),
      rating: el('select', { class: 'select' }, ['bom', 'atencao', 'risco', 'bloqueado'].map(r => el('option', { value: r }, r))),
      tipoAtividade: el('input', { class: 'input', value: data.tipoAtividade || '', placeholder: 'Ex.: Industrial, Prestação de Serviços' }),
      tags: el('input', { class: 'input', value: data.tags || '', placeholder: 'Ex.: Cliente Final, Revenda' })
    };
    inp.rating.value = data.rating;

    body.appendChild(secao('Identificação'));
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Nome', inp.nome), field('Razão social', inp.razaoSocial),
      field('CNPJ/CPF', inp.documento), field('Inscrição Estadual', inp.ie)
    ]));

    body.appendChild(secao('Contato'));
    body.appendChild(el('div', { class: 'grid grid-cols-3 gap-3' }, [
      field('Telefone', inp.telefone), field('E-mail', inp.email),
      field('Pessoa de contato', inp.contato)
    ]));

    body.appendChild(secao('Endereço'));
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Cidade', inp.cidade), field('Estado (UF)', inp.estado),
      field('Endereço', inp.endereco), field('Bairro', inp.bairro),
      field('CEP', inp.cep)
    ]));

    body.appendChild(secao('Dados bancários (para PIX/transferência)'));
    body.appendChild(el('div', { class: 'grid grid-cols-3 gap-3' }, [
      field('Banco', inp.banco), field('Agência', inp.agencia), field('Conta', inp.conta)
    ]));

    body.appendChild(secao('Comercial'));
    body.appendChild(el('div', { class: 'grid grid-cols-3 gap-3' }, [
      field('Limite de crédito (R$)', inp.limite),
      field('Prazo padrão (dias)', inp.prazo),
      field('Rating', inp.rating),
      field('Tipo de atividade', inp.tipoAtividade),
      field('Tags', inp.tags)
    ]));

    modal(c ? 'Editar cliente' : 'Novo cliente', body, () => {
      const vNome = Validators.texto(inp.nome.value, { nome: 'Nome', max: 200 });
      if (!vNome.ok) { UI.toast(vNome.erro, 'r'); inp.nome.classList.add('input-erro'); return false; }
      // Documento OBRIGATORIO e UNICO (regra acordada em 2026-05-05).
      // Cada cliente precisa ter CNPJ ou CPF; nao pode haver dois clientes
      // com o mesmo numero (comparacao por digitos puros, ignorando mascara).
      const docVal = String(inp.documento.value || '').trim();
      if (!docVal) {
        UI.toast('CNPJ/CPF é obrigatório.', 'r');
        inp.documento.classList.add('input-erro');
        return false;
      }
      const vDoc = Validators.documento(docVal);
      if (!vDoc.ok) { UI.toast('CNPJ/CPF: ' + vDoc.erro, 'r'); inp.documento.classList.add('input-erro'); return false; }
      const docFinal = vDoc.value;
      const docKey = String(docFinal).replace(/\D/g, '');
      const dup = (st.clientes || []).find(x => x.id !== (c?.id) && String(x.documento || '').replace(/\D/g, '') === docKey);
      if (dup) {
        UI.toast(`Já existe um cliente com este CNPJ/CPF: "${dup.nome}". Ajuste o cadastro existente em vez de criar duplicado.`, 'r');
        inp.documento.classList.add('input-erro');
        return false;
      }
      const emailVal = String(inp.email.value || '').trim();
      let emailFinal = '';
      if (emailVal) {
        const vEmail = Validators.email(emailVal);
        if (!vEmail.ok) { UI.toast('E-mail: ' + vEmail.erro, 'r'); inp.email.classList.add('input-erro'); return false; }
        emailFinal = vEmail.value;
      }
      const telVal = String(inp.telefone.value || '').trim();
      let telFinal = telVal;
      if (telVal) {
        const vTel = Validators.telefone(telVal);
        // Aceita telefone com formato livre (BR, "(21) 2451-2581") sem bloquear cadastro
        if (vTel.ok) telFinal = vTel.value;
      }
      const payload = {
        id: c?.id || DB.id(),
        nome: vNome.value,
        razaoSocial: String(inp.razaoSocial.value || '').trim(),
        documento: docFinal,
        ie: String(inp.ie.value || '').trim(),
        telefone: telFinal,
        email: emailFinal,
        contato: String(inp.contato.value || '').trim(),
        cidade: String(inp.cidade.value || '').trim(),
        estado: String(inp.estado.value || '').trim().toUpperCase(),
        endereco: String(inp.endereco.value || '').trim(),
        bairro: String(inp.bairro.value || '').trim(),
        cep: String(inp.cep.value || '').trim(),
        banco: String(inp.banco.value || '').trim(),
        agencia: String(inp.agencia.value || '').trim(),
        conta: String(inp.conta.value || '').trim(),
        limite: +inp.limite.value || 0,
        prazo: +inp.prazo.value || 0,
        rating: inp.rating.value,
        tipoAtividade: String(inp.tipoAtividade.value || '').trim(),
        tags: String(inp.tags.value || '').trim()
      };
      DB.set(s => { if (c) s.clientes = s.clientes.map(x => x.id === c.id ? payload : x); else s.clientes.push(payload); });
      UI.toast(c ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'v');
      if (typeof opts.onSaved === 'function') { try { opts.onSaved(payload); } catch (e) { console.error(e); } }
    });
  }

  function openTituloReceber(st, t = null) {
    if (!st.clientes.length) { alert('Cadastre um cliente primeiro.'); return; }
    // Schema novo (paridade com Contas a Pagar): documento = numero da NF;
    // numeroPedido, centroCusto, contaId, categoria, vendedor.
    const data = t || {
      clienteId: '', documento: '', numeroPedido: '', centroCusto: '',
      contaId: '', vendedor: '', emissao: today(), vencimento: today(),
      valor: 0, valorRecebido: 0,
      categoria: (st.categorias.entrada && st.categorias.entrada[0]) || 'Vendas',
      status: 'aberto', observacao: ''
    };
    const body = el('div');
    const acCliente = UI.autocomplete({
      items: st.clientes,
      getLabel: c => c.nome,
      getMeta: c => [c.documento, c.cidade].filter(Boolean).join(' · '),
      getSearch: c => `${c.nome} ${c.razaoSocial || ''} ${c.documento || ''} ${c.cidade || ''}`,
      placeholder: 'Buscar cliente por nome ou CNPJ...',
      initialId: data.clienteId,
      createLabel: 'Cadastrar novo cliente',
      onCreate: (q) => {
        openCliente(DB.get(), null, {
          preNome: q,
          onSaved: (novo) => { acCliente.setValue(novo.id); }
        });
      }
    });
    // Lista de contas ativas para o dropdown de Conta Corrente
    const contasAtivas = (st.contas || []).filter(c => c.ativa !== false);
    const categoriasEntrada = (st.categorias && Array.isArray(st.categorias.entrada) && st.categorias.entrada.length)
      ? st.categorias.entrada
      : ['Vendas', 'Serviços', 'Outros'];
    const inp = {
      documento: el('input', { class: 'input', value: data.documento || '', placeholder: 'Numero da NF' }),
      numeroPedido: el('input', { class: 'input', value: data.numeroPedido || '', placeholder: 'Numero do pedido' }),
      centroCusto: el('input', { class: 'input', value: data.centroCusto || '', placeholder: 'Ex.: Engenharia, Comercial, Adm.' }),
      contaId: el('select', { class: 'select' }, [
        el('option', { value: '' }, '— selecionar conta —'),
        ...contasAtivas.map(c => el('option', { value: c.id }, c.nome + (c.tipo ? ` (${c.tipo})` : '')))
      ]),
      vendedor: el('input', { class: 'input', value: data.vendedor || '', placeholder: 'Nome do vendedor' }),
      emissao: el('input', { type: 'date', class: 'input', value: data.emissao }),
      vencimento: el('input', { type: 'date', class: 'input', value: data.vencimento }),
      valor: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmtVal(data.valor) }),
      valorRecebido: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmtVal(data.valorRecebido) }),
      categoria: el('select', { class: 'select' }, categoriasEntrada.map(c => el('option', { value: c }, c)))
    };
    inp.categoria.value = data.categoria || categoriasEntrada[0];
    inp.contaId.value = data.contaId || '';
    inp.observacao = el('textarea', { class: 'input', rows: 2 }, data.observacao || '');
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Cliente', acCliente.element), field('Conta corrente', inp.contaId),
      field('Numero da NF', inp.documento), field('Numero do pedido', inp.numeroPedido),
      field('Centro de custo', inp.centroCusto), field('Categoria', inp.categoria),
      field('Emissão', inp.emissao), field('Vencimento', inp.vencimento),
      field('Valor (R$)', inp.valor), field('Vendedor', inp.vendedor),
      field('Valor recebido', inp.valorRecebido)
    ]));
    body.appendChild(field('Observação', inp.observacao));
    modal(t ? 'Editar título a receber' : 'Novo título a receber', body, () => {
      if (!acCliente.value) { UI.toast('Selecione um cliente da lista.', 'r'); acCliente.focus(); return false; }
      const vValor = Validators.valor(inp.valor.value);
      if (!vValor.ok) { UI.toast(vValor.erro, 'r'); inp.valor.classList.add('input-erro'); return false; }
      const vRec = Validators.valor(inp.valorRecebido.value, { obrigatorio: false, min: 0 });
      if (!vRec.ok) { UI.toast('Valor recebido: ' + vRec.erro, 'r'); inp.valorRecebido.classList.add('input-erro'); return false; }
      if (vRec.value > vValor.value) { UI.toast('Valor recebido não pode exceder o valor do título.', 'r'); return false; }
      const vPer = Validators.periodoCoerente(inp.emissao.value, inp.vencimento.value);
      if (!vPer.ok) { UI.toast(vPer.erro, 'r'); return false; }
      const status = vRec.value >= vValor.value ? 'pago' : vRec.value > 0 ? 'parcial' : 'aberto';
      const payload = {
        id: t?.id || DB.id(),
        clienteId: acCliente.value,
        documento: inp.documento.value,
        numeroPedido: inp.numeroPedido.value,
        centroCusto: inp.centroCusto.value,
        contaId: inp.contaId.value,
        vendedor: inp.vendedor.value,
        emissao: vPer.emissao,
        vencimento: vPer.vencimento,
        valor: vValor.value,
        valorRecebido: vRec.value,
        categoria: inp.categoria.value,
        status,
        observacao: inp.observacao.value
      };
      DB.set(s => { if (t) s.titulosReceber = s.titulosReceber.map(x => x.id === t.id ? payload : x); else s.titulosReceber.push(payload); });
      UI.toast(t ? 'Título atualizado.' : 'Título cadastrado.', 'v');
    });
  }

  function openBaixaReceber(st, t) {
    const saldo = (+t.valor) - (+t.valorRecebido || 0);
    const body = el('div');
    const inp = {
      valor: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: saldo }),
      data: el('input', { type: 'date', class: 'input', value: today() })
    };
    body.appendChild(el('div', {}, [field(`Saldo atual: ${BRL(saldo)}. Valor a baixar:`, inp.valor), field('Data do recebimento', inp.data)]));
    modal('Baixar recebimento', body, () => {
      const v = +inp.valor.value || 0;
      if (v <= 0 || v > saldo) { alert('Valor inválido.'); return false; }
      DB.set(s => {
        const tt = s.titulosReceber.find(x => x.id === t.id);
        tt.valorRecebido = (+tt.valorRecebido || 0) + v;
        tt.status = tt.valorRecebido >= tt.valor ? 'pago' : 'parcial';
        s.movimentos.push({ id: DB.id(), data: inp.data.value, descricao: `Recebimento ${tt.documento || ''}`.trim(), categoria: 'Vendas', tipo: 'entrada', natureza: 'op', status: 'realizado', valor: v, origem: 'baixa-receber' });
      });
      DB.log('baixa-receber', `${BRL(v)} do título ${t.documento || t.id}`);
      const c = clientesMap(DB.get())[t.clienteId];
      if (confirm('Emitir recibo imprimível?')) {
        abrirRecibo({
          numero: t.documento || t.id.slice(0, 8),
          data: inp.data.value,
          empresa: DB.get().empresa.nome,
          tipoContraparte: 'Cliente',
          contraparte: c?.nome || '—',
          referencia: 'Título ' + (t.documento || t.id),
          tipo: 'receber',
          valor: v,
          extenso: valorPorExtenso(v)
        });
      }
    });
  }

  // ================= CONTAS A PAGAR =================
  // Filtros persistentes da tela de Contas a pagar (sobrevivem ao re-render).
  let pagarFiltro = { centroCusto: '', contaId: '' };

  function pagar(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const fm = fornecedoresMap(st);
    const hoje = today();
    const pendentes = st.titulosPagar.filter(t => !t.pago);
    const total = pendentes.reduce((s, t) => s + (+t.valor), 0);
    const em7 = new Date(new Date(hoje).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const pressao = pendentes.filter(t => t.vencimento <= em7).reduce((s, t) => s + (+t.valor), 0);

    v.appendChild(el('div', { class: 'flex justify-between items-center' }, [
      el('div', { class: 'text-sm text-slate-600' }, `Total pendente: ${BRL(total)} · Próximos 7 dias: ${BRL(pressao)}`),
      el('div', { class: 'flex gap-2' }, [
        can('editar') ? el('button', { class: 'btn btn-p', onclick: () => openTituloPagar(st) }, '+ Título') : null
      ].filter(Boolean))
    ]));

    // ---- Filtros (Centro de custo e Conta corrente) ----
    const centrosCusto = [...new Set((st.titulosPagar || []).map(t => (t.centroCusto || '').trim()).filter(Boolean))].sort();
    const contasAtivas = (st.contas || []).filter(c => c.ativa !== false);
    const contasMap = Object.fromEntries(contasAtivas.map(c => [c.id, c.nome]));

    const selCC = el('select', { class: 'select' }, [
      el('option', { value: '' }, 'Todos os centros de custo'),
      ...centrosCusto.map(cc => el('option', { value: cc }, cc))
    ]);
    selCC.value = pagarFiltro.centroCusto;
    const selConta = el('select', { class: 'select' }, [
      el('option', { value: '' }, 'Todas as contas'),
      ...contasAtivas.map(c => el('option', { value: c.id }, c.nome + (c.tipo ? ` (${c.tipo})` : '')))
    ]);
    selConta.value = pagarFiltro.contaId;
    const btnLimpar = el('button', { class: 'btn btn-s', onclick: () => {
      pagarFiltro = { centroCusto: '', contaId: '' };
      pagar(DB.get());
    } }, 'Limpar filtros');
    selCC.onchange = () => { pagarFiltro.centroCusto = selCC.value; pagar(DB.get()); };
    selConta.onchange = () => { pagarFiltro.contaId = selConta.value; pagar(DB.get()); };

    v.appendChild(el('div', { class: 'card grid grid-cols-1 md:grid-cols-3 gap-3' }, [
      field('Centro de custo', selCC),
      field('Conta corrente', selConta),
      el('div', { class: 'flex items-end' }, btnLimpar)
    ]));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      'Fornecedor', 'Nº da NF', 'Categoria', 'Centro de custo', 'Conta corrente', 'Vencimento', 'Valor', 'Status', 'Ações'
    ].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    let rows = [...st.titulosPagar];
    // Aplica filtros
    if (pagarFiltro.centroCusto) rows = rows.filter(t => (t.centroCusto || '') === pagarFiltro.centroCusto);
    if (pagarFiltro.contaId) rows = rows.filter(t => (t.contaId || '') === pagarFiltro.contaId);
    rows.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    if (!rows.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 9, class: 'text-center py-6 text-slate-500' }, (pagarFiltro.centroCusto || pagarFiltro.contaId) ? 'Nenhum título encontrado para o filtro aplicado.' : 'Sem títulos.')));
    rows.forEach(t => {
      const atraso = !t.pago && t.vencimento < hoje;
      const recIcon = t.recorrenciaId ? ' 🔁' : '';
      tbody.appendChild(el('tr', {}, [
        el('td', {}, (fm[t.fornecedorId]?.nome || '—') + recIcon),
        el('td', {}, t.documento || '—'),
        el('td', {}, t.categoria || '—'),
        el('td', {}, t.centroCusto || '—'),
        el('td', {}, contasMap[t.contaId] || '—'),
        el('td', {}, fmtDate(t.vencimento) + (atraso ? ' ⚠' : '')),
        el('td', {}, BRL(t.valor)),
        el('td', {}, t.cancelado ? badge('cancelado', 'r') : t.pago ? badge('pago', 'v') : atraso ? badge('atrasado', 'r') : badge('pendente', 'a')),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          (t.pago || t.cancelado || !can('pagar')) ? null : el('button', { class: 'btn btn-p', onclick: () => openPagamento(st, t) }, 'Pagar'),
          el('button', { class: 'btn btn-s', onclick: () => openAnexos(st, t.id, 'pagar') }, '📎' + (((st.anexos || {})[t.id] || []).length || '')),
          t.cancelado ? null : el('button', { class: 'btn btn-s', onclick: () => openTituloPagar(st, t) }, 'Editar'),
          can('cancelar') && !t.pago && !t.cancelado ? el('button', { class: 'btn btn-d', onclick: () => UI.pedirMotivo({ titulo: 'Cancelar título a pagar' }, (motivo) => {
            const r = DB.cancelarTituloPagar(t.id, motivo);
            if (!r.ok) UI.toast(r.erro, 'r'); else UI.toast('Título cancelado.', 'v');
          }) }, 'Cancelar') : null
        ].filter(Boolean)))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  function openFornecedor(st, f = null, opts = {}) {
    const data = f || {
      nome: opts.preNome || '', razaoSocial: '', documento: '', ie: '',
      telefone: '', email: '', contato: '',
      cidade: '', estado: '', endereco: '', bairro: '', cep: '',
      banco: '', agencia: '', conta: '',
      categoria: '', condicao: '', criticidade: 'normal',
      tipoAtividade: '', tags: ''
    };
    const body = el('div');
    const inp = {
      nome: el('input', { class: 'input', value: data.nome }),
      razaoSocial: el('input', { class: 'input', value: data.razaoSocial || '' }),
      documento: el('input', { class: 'input', value: data.documento || '' }),
      ie: el('input', { class: 'input', value: data.ie || '' }),
      telefone: el('input', { class: 'input', value: data.telefone || '' }),
      email: el('input', { type: 'email', class: 'input', value: data.email || '' }),
      contato: el('input', { class: 'input', value: data.contato || '' }),
      cidade: el('input', { class: 'input', value: data.cidade || '' }),
      estado: el('input', { class: 'input', value: data.estado || '', placeholder: 'UF', maxlength: 2 }),
      endereco: el('input', { class: 'input', value: data.endereco || '' }),
      bairro: el('input', { class: 'input', value: data.bairro || '' }),
      cep: el('input', { class: 'input', value: data.cep || '' }),
      banco: el('input', { class: 'input', value: data.banco || '' }),
      agencia: el('input', { class: 'input', value: data.agencia || '' }),
      conta: el('input', { class: 'input', value: data.conta || '' }),
      categoria: el('input', { class: 'input', value: data.categoria || '', placeholder: 'Ex.: Insumos, Aluguel' }),
      condicao: el('input', { class: 'input', value: data.condicao || '', placeholder: 'Ex.: 30d, 30/60/90' }),
      criticidade: el('select', { class: 'select' }, ['critico', 'normal', 'opcional'].map(r => el('option', { value: r }, r))),
      tipoAtividade: el('input', { class: 'input', value: data.tipoAtividade || '' }),
      tags: el('input', { class: 'input', value: data.tags || '' })
    };
    inp.criticidade.value = data.criticidade;

    body.appendChild(secao('Identificação'));
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Nome', inp.nome), field('Razão social', inp.razaoSocial),
      field('CNPJ/CPF', inp.documento), field('Inscrição Estadual', inp.ie)
    ]));

    body.appendChild(secao('Contato'));
    body.appendChild(el('div', { class: 'grid grid-cols-3 gap-3' }, [
      field('Telefone', inp.telefone), field('E-mail', inp.email),
      field('Pessoa de contato', inp.contato)
    ]));

    body.appendChild(secao('Endereço'));
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Cidade', inp.cidade), field('Estado (UF)', inp.estado),
      field('Endereço', inp.endereco), field('Bairro', inp.bairro),
      field('CEP', inp.cep)
    ]));

    body.appendChild(secao('Dados bancários (para pagamento)'));
    body.appendChild(el('div', { class: 'grid grid-cols-3 gap-3' }, [
      field('Banco', inp.banco), field('Agência', inp.agencia), field('Conta', inp.conta)
    ]));

    body.appendChild(secao('Comercial'));
    body.appendChild(el('div', { class: 'grid grid-cols-3 gap-3' }, [
      field('Categoria', inp.categoria),
      field('Condição de pagamento', inp.condicao),
      field('Criticidade', inp.criticidade),
      field('Tipo de atividade', inp.tipoAtividade),
      field('Tags', inp.tags)
    ]));

    modal(f ? 'Editar fornecedor' : 'Novo fornecedor', body, () => {
      const nomeVal = String(inp.nome.value || '').trim();
      if (!nomeVal) { UI.toast('Nome é obrigatório.', 'r'); inp.nome.classList.add('input-erro'); return false; }
      // Validação suave para documento e email (aceita vazio)
      let docFinal = '';
      const docVal = String(inp.documento.value || '').trim();
      if (docVal) {
        const vDoc = Validators.documento(docVal);
        if (!vDoc.ok) { UI.toast('CNPJ/CPF: ' + vDoc.erro, 'r'); inp.documento.classList.add('input-erro'); return false; }
        docFinal = vDoc.value;
        // Bloqueia duplicidade pelo documento normalizado
        const docKey = String(docFinal).replace(/\D/g, '');
        if (docKey) {
          const dup = (st.fornecedores || []).find(x => x.id !== (f?.id) && String(x.documento || '').replace(/\D/g, '') === docKey);
          if (dup) {
            UI.toast(`Já existe um fornecedor com este CNPJ/CPF: "${dup.nome}". Ajuste o cadastro existente em vez de criar duplicado.`, 'r');
            inp.documento.classList.add('input-erro');
            return false;
          }
        }
      }
      let emailFinal = '';
      const emailVal = String(inp.email.value || '').trim();
      if (emailVal) {
        const vEmail = Validators.email(emailVal);
        if (!vEmail.ok) { UI.toast('E-mail: ' + vEmail.erro, 'r'); inp.email.classList.add('input-erro'); return false; }
        emailFinal = vEmail.value;
      }
      const payload = {
        id: f?.id || DB.id(),
        nome: nomeVal,
        razaoSocial: String(inp.razaoSocial.value || '').trim(),
        documento: docFinal,
        ie: String(inp.ie.value || '').trim(),
        telefone: String(inp.telefone.value || '').trim(),
        email: emailFinal,
        contato: String(inp.contato.value || '').trim(),
        cidade: String(inp.cidade.value || '').trim(),
        estado: String(inp.estado.value || '').trim().toUpperCase(),
        endereco: String(inp.endereco.value || '').trim(),
        bairro: String(inp.bairro.value || '').trim(),
        cep: String(inp.cep.value || '').trim(),
        banco: String(inp.banco.value || '').trim(),
        agencia: String(inp.agencia.value || '').trim(),
        conta: String(inp.conta.value || '').trim(),
        categoria: String(inp.categoria.value || '').trim(),
        condicao: String(inp.condicao.value || '').trim(),
        criticidade: inp.criticidade.value,
        tipoAtividade: String(inp.tipoAtividade.value || '').trim(),
        tags: String(inp.tags.value || '').trim()
      };
      DB.set(s => { if (f) s.fornecedores = s.fornecedores.map(x => x.id === f.id ? payload : x); else s.fornecedores.push(payload); });
      UI.toast(f ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.', 'v');
      if (typeof opts.onSaved === 'function') { try { opts.onSaved(payload); } catch (e) { console.error(e); } }
    });
  }

  function openTituloPagar(st, t = null) {
    if (!st.fornecedores.length) { alert('Cadastre um fornecedor primeiro.'); return; }
    // 'documento' no schema antigo = numero da NF agora. Mantemos compat com dados existentes.
    const data = t || { fornecedorId: '', documento: '', numeroPedido: '', centroCusto: '', contaId: '', competencia: today(), vencimento: today(), valor: 0, categoria: st.categorias.saida[0], prioridade: 'obrigatorio', pago: false, observacao: '' };
    const body = el('div');
    const acFornecedor = UI.autocomplete({
      items: st.fornecedores,
      getLabel: f => f.nome,
      getMeta: f => [f.documento, f.cidade, f.categoria].filter(Boolean).join(' · '),
      getSearch: f => `${f.nome} ${f.razaoSocial || ''} ${f.documento || ''} ${f.cidade || ''} ${f.categoria || ''}`,
      placeholder: 'Buscar fornecedor por nome ou CNPJ...',
      initialId: data.fornecedorId,
      createLabel: 'Cadastrar novo fornecedor',
      onCreate: (q) => {
        openFornecedor(DB.get(), null, {
          preNome: q,
          onSaved: (novo) => { acFornecedor.setValue(novo.id); }
        });
      }
    });
    // Lista de contas ativas (caixa, banco, conta corrente) para o dropdown de Conta Corrente
    const contasAtivas = (st.contas || []).filter(c => c.ativa !== false);
    const inp = {
      documento: el('input', { class: 'input', value: data.documento, placeholder: 'Numero da NF' }),
      numeroPedido: el('input', { class: 'input', value: data.numeroPedido || '', placeholder: 'Numero do pedido' }),
      centroCusto: el('input', { class: 'input', value: data.centroCusto || '', placeholder: 'Ex.: Engenharia, Comercial, Adm.' }),
      contaId: el('select', { class: 'select' }, [
        el('option', { value: '' }, '— selecionar conta —'),
        ...contasAtivas.map(c => el('option', { value: c.id }, c.nome + (c.tipo ? ` (${c.tipo})` : '')))
      ]),
      competencia: el('input', { type: 'date', class: 'input', value: data.competencia }),
      vencimento: el('input', { type: 'date', class: 'input', value: data.vencimento }),
      valor: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmtVal(data.valor) }),
      categoria: el('select', { class: 'select' }, st.categorias.saida.map(c => el('option', { value: c }, c))),
      prioridade: el('select', { class: 'select' }, [
        el('option', { value: 'obrigatorio' }, 'Obrigatório'),
        el('option', { value: 'negociavel' }, 'Negociável'),
        el('option', { value: 'discricionario' }, 'Discricionário')
      ]),
      // ----- Recorrência mensal -----
      recorrente: el('input', { type: 'checkbox', class: 'mr-2' }),
      recorrenciaFim: el('input', { type: 'date', class: 'input', value: '' })
    };
    inp.categoria.value = data.categoria;
    inp.prioridade.value = data.prioridade;
    inp.contaId.value = data.contaId || '';
    inp.observacao = el('textarea', { class: 'input', rows: 2 }, data.observacao || '');

    // Wrapper do bloco de fim de recorrência (escondido por padrão)
    const recorrenciaFimWrap = el('div', { class: 'hidden col-span-2' }, [
      el('label', { class: 'text-sm text-slate-700 block mb-1' }, 'Recorrência até (opcional — vazio = indefinido):'),
      inp.recorrenciaFim
    ]);
    inp.recorrente.addEventListener('change', () => {
      recorrenciaFimWrap.classList.toggle('hidden', !inp.recorrente.checked);
    });

    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Fornecedor', acFornecedor.element), field('Conta corrente', inp.contaId),
      field('Numero da NF', inp.documento), field('Numero do pedido', inp.numeroPedido),
      field('Centro de custo', inp.centroCusto), field('Categoria', inp.categoria),
      field('Competência', inp.competencia), field('Vencimento', inp.vencimento),
      field('Valor (R$)', inp.valor), field('Prioridade', inp.prioridade)
    ]));

    // Bloco da recorrência (só aparece para títulos NOVOS — editar título já existente não converte em regra)
    if (!t) {
      const recorrenciaBlock = el('div', { class: 'card p-3 mt-3 bg-slate-50 border border-slate-200' }, [
        el('label', { class: 'flex items-center text-sm font-medium text-slate-800 cursor-pointer' }, [
          inp.recorrente,
          el('span', {}, 'Conta recorrente (gera todo mês automaticamente)')
        ]),
        el('div', { class: 'text-xs text-slate-500 mt-1' }, 'Ex.: aluguel, Microsoft 365, pró-labore. O sistema usa o dia do "Vencimento" acima como dia de cobrança e gera os títulos mês a mês.'),
        el('div', { class: 'mt-2 grid grid-cols-2 gap-3' }, recorrenciaFimWrap)
      ]);
      body.appendChild(recorrenciaBlock);
    }

    body.appendChild(field('Observação', inp.observacao));
    modal(t ? 'Editar título a pagar' : 'Novo título a pagar', body, () => {
      if (!acFornecedor.value) { UI.toast('Selecione um fornecedor da lista.', 'r'); acFornecedor.focus(); return false; }
      const vValor = Validators.valor(inp.valor.value);
      if (!vValor.ok) { UI.toast(vValor.erro, 'r'); inp.valor.classList.add('input-erro'); return false; }
      const vPer = Validators.periodoCoerente(inp.competencia.value, inp.vencimento.value);
      if (!vPer.ok) { UI.toast(vPer.erro, 'r'); return false; }

      // Branch RECORRENTE: cria regra em st.recorrencias e nao cria titulo individual.
      if (!t && inp.recorrente.checked) {
        const dataFim = inp.recorrenciaFim.value || null;
        if (dataFim && dataFim < vPer.vencimento) { UI.toast('A data de fim da recorrência precisa ser maior que o primeiro vencimento.', 'r'); return false; }
        const fornecedorNome = (st.fornecedores.find(f => f.id === acFornecedor.value) || {}).nome || 'Fornecedor';
        const regra = {
          id: DB.id(),
          tipo: 'pagar',
          contraparteId: acFornecedor.value,
          descricao: 'Recorrência — ' + fornecedorNome + (inp.documento.value ? ' (' + inp.documento.value + ')' : ''),
          documento: inp.documento.value,
          numeroPedido: inp.numeroPedido.value,
          centroCusto: inp.centroCusto.value,
          contaId: inp.contaId.value,
          observacao: inp.observacao.value,
          valor: vValor.value,
          categoria: inp.categoria.value,
          prioridade: inp.prioridade.value,
          frequencia: 'mensal',
          proxima: vPer.vencimento,
          dataInicio: vPer.vencimento,
          dataFim: dataFim,
          ativa: true,
          criadoEm: new Date().toISOString()
        };
        DB.set(s => { s.recorrencias = s.recorrencias || []; s.recorrencias.push(regra); });
        // Materializa imediatamente: gera os titulos da nova regra ate hoje+60d
        if (window.App && window.App.materializarRecorrencias) { window.App.materializarRecorrencias(); }
        UI.toast('Recorrência criada e títulos gerados (próximos 60 dias).', 'v');
        return;
      }

      // Branch NORMAL: titulo unico (comportamento antigo)
      const payload = {
        id: t?.id || DB.id(),
        fornecedorId: acFornecedor.value,
        documento: inp.documento.value,
        numeroPedido: inp.numeroPedido.value,
        centroCusto: inp.centroCusto.value,
        contaId: inp.contaId.value,
        competencia: vPer.emissao || inp.competencia.value,
        vencimento: vPer.vencimento,
        valor: vValor.value,
        categoria: inp.categoria.value,
        prioridade: inp.prioridade.value,
        pago: t?.pago || false,
        dataPagamento: t?.dataPagamento,
        observacao: inp.observacao.value,
        recorrenciaId: t?.recorrenciaId || null
      };
      DB.set(s => { if (t) s.titulosPagar = s.titulosPagar.map(x => x.id === t.id ? payload : x); else s.titulosPagar.push(payload); });
      UI.toast(t ? 'Título atualizado.' : 'Título cadastrado.', 'v');
    });
  }

    function openPagamento(st, t) {
    const body = el('div');
    const inp = { data: el('input', { type: 'date', class: 'input', value: today() }) };
    body.appendChild(field(`Confirmar pagamento de ${BRL(t.valor)}. Data:`, inp.data));
    modal('Registrar pagamento', body, () => {
      DB.set(s => {
        const tt = s.titulosPagar.find(x => x.id === t.id);
        tt.pago = true; tt.dataPagamento = inp.data.value;
        s.movimentos.push({ id: DB.id(), data: inp.data.value, descricao: `Pagamento ${tt.documento || tt.categoria}`, categoria: tt.categoria, tipo: 'saida', natureza: 'op', status: 'realizado', valor: tt.valor, origem: 'baixa-pagar' });
      });
      DB.log('pagamento', `${BRL(t.valor)} para ${t.documento || t.categoria}`);
      const f = fornecedoresMap(DB.get())[t.fornecedorId];
      if (confirm('Emitir comprovante imprimível?')) {
        abrirRecibo({
          numero: t.documento || t.id.slice(0, 8),
          data: inp.data.value,
          empresa: DB.get().empresa.nome,
          tipoContraparte: 'Fornecedor',
          contraparte: f?.nome || '—',
          referencia: (t.categoria || 'Pagamento') + ' ' + (t.documento || t.id),
          tipo: 'pagar',
          valor: +t.valor,
          extenso: valorPorExtenso(+t.valor)
        });
      }
    });
  }

  // ================= MARGEM / PREÇO =================
  function margem(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const { receita, mc, mcPct, impostos, custos } = KPI.margemContribuicao(st);
    const pe = KPI.pontoEquilibrio(st);
    v.appendChild(el('div', { class: 'flex justify-between items-center' }, [
      el('div', { class: 'text-sm text-slate-600' }, `Receita: ${BRL(receita)} · MC: ${BRL(mc)} (${PCT(mcPct)}) · PE: ${pe ? BRL(pe) : '—'}`),
      el('div', { class: 'flex gap-2' }, [
        can('editar') ? el('button', { class: 'btn btn-s', onclick: () => openImportCadastros(st, 'produtos') }, 'Importar produtos') : null,
        can('editar') ? el('button', { class: 'btn btn-p', onclick: () => openProduto(st) }, '+ Produto / Serviço') : null
      ].filter(Boolean))
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Decomposição da receita'),
      el('div', { class: 'grid-kpi' }, [
        kpi('Receita total', BRL(receita), 'v'),
        kpi('Impostos', BRL(impostos), 'g'),
        kpi('Custos variáveis', BRL(custos), 'g'),
        kpi('Margem de contribuição', BRL(mc), KPI.semMargem(mcPct, st.parametros.metaMargemPct)),
        kpi('MC %', PCT(mcPct), KPI.semMargem(mcPct, st.parametros.metaMargemPct)),
        kpi('Ponto de equilíbrio', pe == null ? '—' : BRL(pe), receita && pe && receita < pe ? 'r' : 'v')
      ])
    ]));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      'Produto/Serviço', 'Preço', 'Imposto %', 'Custo var.', 'MC unit.', 'MC %', 'Volume/mês', 'Receita', 'Ações'
    ].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!st.produtos.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 9, class: 'text-center py-6 text-slate-500' }, 'Sem produtos.')));
    st.produtos.forEach(p => {
      const impUnit = (+p.preco) * (+p.imposto || 0) / 100;
      const mcU = (+p.preco) - impUnit - (+p.custoVariavel);
      const mcUPct = p.preco > 0 ? (mcU / +p.preco) * 100 : 0;
      const rec = (+p.preco) * (+p.volume || 0);
      tbody.appendChild(el('tr', {}, [
        el('td', {}, p.nome),
        el('td', {}, BRL(p.preco)),
        el('td', {}, (+p.imposto || 0).toFixed(1) + '%'),
        el('td', {}, BRL(p.custoVariavel)),
        el('td', {}, BRL(mcU)),
        el('td', {}, badge(PCT(mcUPct), KPI.semMargem(mcUPct, st.parametros.metaMargemPct))),
        el('td', {}, String(p.volume || 0)),
        el('td', {}, BRL(rec)),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          el('button', { class: 'btn btn-s', onclick: () => openProduto(st, p) }, 'Editar'),
          el('button', { class: 'btn btn-d', onclick: () => confirmar('Excluir?', () => DB.set(s => { s.produtos = s.produtos.filter(x => x.id !== p.id); })) }, '×')
        ]))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  function openProduto(st, p = null) {
    const data = p || { nome: '', preco: 0, imposto: 0, custoVariavel: 0, comissao: 0, volume: 0 };
    const body = el('div');
    const inp = {
      nome: el('input', { class: 'input', value: data.nome }),
      preco: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.preco }),
      imposto: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.imposto }),
      custoVariavel: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.custoVariavel }),
      comissao: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.comissao }),
      volume: el('input', { type: 'number', class: 'input', value: data.volume })
    };
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Nome', inp.nome), field('Preço de venda', inp.preco),
      field('Imposto (%)', inp.imposto), field('Custo variável unit.', inp.custoVariavel),
      field('Comissão (%)', inp.comissao), field('Volume mensal', inp.volume)
    ]));
    modal(p ? 'Editar produto' : 'Novo produto', body, () => {
      if (!inp.nome.value.trim()) { alert('Nome obrigatório.'); return false; }
      const payload = { id: p?.id || DB.id(), nome: inp.nome.value.trim(), preco: +inp.preco.value || 0, imposto: +inp.imposto.value || 0, custoVariavel: +inp.custoVariavel.value || 0, comissao: +inp.comissao.value || 0, volume: +inp.volume.value || 0 };
      DB.set(s => { if (p) s.produtos = s.produtos.map(x => x.id === p.id ? payload : x); else s.produtos.push(payload); });
    });
  }

  // ================= CONFIGURAÇÕES =================
  function config(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const inp = {
      nome: el('input', { class: 'input', value: st.empresa.nome }),
      caixaInicial: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.empresa.caixaInicial }),
      caixaMinimo: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.parametros.caixaMinimo }),
      metaMargemPct: el('input', { type: 'number', step: '0.1', class: 'input', value: st.parametros.metaMargemPct }),
      limiteInadimplenciaPct: el('input', { type: 'number', step: '0.1', class: 'input', value: st.parametros.limiteInadimplenciaPct }),
      custosFixosMensais: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.parametros.custosFixosMensais }),
      vendasMediaDiaria: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.parametros.vendasMediaDiaria }),
      estoqueAtual: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.parametros.estoqueAtual }),
      diasAtrasoRisco: el('input', { type: 'number', class: 'input', value: st.parametros.diasAtrasoRisco })
    };

    const saveBtn = el('button', { class: 'btn btn-p', onclick: () => {
      DB.set(s => {
        s.empresa.nome = inp.nome.value;
        s.empresa.caixaInicial = +inp.caixaInicial.value || 0;
        s.parametros.caixaMinimo = +inp.caixaMinimo.value || 0;
        s.parametros.metaMargemPct = +inp.metaMargemPct.value || 0;
        s.parametros.limiteInadimplenciaPct = +inp.limiteInadimplenciaPct.value || 0;
        s.parametros.custosFixosMensais = +inp.custosFixosMensais.value || 0;
        s.parametros.vendasMediaDiaria = +inp.vendasMediaDiaria.value || 0;
        s.parametros.estoqueAtual = +inp.estoqueAtual.value || 0;
        s.parametros.diasAtrasoRisco = +inp.diasAtrasoRisco.value || 15;
      });
      alert('Configurações salvas.');
    } }, 'Salvar');

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-2' }, 'Assistente de configuração'),
      el('div', { class: 'text-sm text-slate-600 mb-3' }, 'Refazer o onboarding guiado (6 passos) sem perder os dados já lançados.'),
      el('button', { class: 'btn btn-s', onclick: () => onboarding() }, 'Abrir assistente')
    ]));

    const inpPix = {
      pixChave: el('input', { class: 'input', value: st.empresa.pixChave || '', placeholder: 'CPF, CNPJ, e-mail, telefone +55... ou UUID' }),
      pixCidade: el('input', { class: 'input', value: st.empresa.pixCidade || 'SAO PAULO' }),
      cnpj: el('input', { class: 'input', value: st.empresa.cnpj || '' }),
      setor: el('input', { class: 'input', value: st.empresa.setor || '' })
    };

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Empresa'),
      el('div', { class: 'grid grid-cols-2 gap-3' }, [
        field('Nome da empresa', inp.nome),
        field('CNPJ', inpPix.cnpj),
        field('Setor / atividade', inpPix.setor),
        field('Saldo inicial de caixa (R$)', inp.caixaInicial)
      ])
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Chave PIX (para cobrança)'),
      el('div', { class: 'text-xs text-slate-500 mb-3' }, 'Usada ao gerar PIX copia-e-cola no envio de cobrança.'),
      el('div', { class: 'grid grid-cols-2 gap-3' }, [
        field('Chave PIX', inpPix.pixChave),
        field('Cidade (sem acentos)', inpPix.pixCidade)
      ]),
      el('button', { class: 'btn btn-p mt-3', onclick: () => {
        DB.set(s => { s.empresa.pixChave = inpPix.pixChave.value; s.empresa.pixCidade = inpPix.pixCidade.value.toUpperCase(); s.empresa.cnpj = inpPix.cnpj.value; s.empresa.setor = inpPix.setor.value; });
        alert('Dados da empresa salvos.');
      } }, 'Salvar dados da empresa')
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Parâmetros financeiros'),
      el('div', { class: 'grid grid-cols-2 gap-3' }, [
        field('Caixa mínimo (R$)', inp.caixaMinimo),
        field('Meta de margem (%)', inp.metaMargemPct),
        field('Limite inadimplência (%)', inp.limiteInadimplenciaPct),
        field('Custos fixos mensais (R$)', inp.custosFixosMensais),
        field('Vendas médias diárias (R$)', inp.vendasMediaDiaria),
        field('Estoque atual (R$)', inp.estoqueAtual),
        field('Dias atraso para risco', inp.diasAtrasoRisco)
      ]),
      el('div', { class: 'mt-4' }, saveBtn)
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Categorias'),
      el('div', { class: 'grid grid-cols-2 gap-4' }, [
        el('div', {}, [el('div', { class: 'text-xs text-slate-600 mb-1' }, 'Entradas'), el('div', {}, st.categorias.entrada.map(c => badge(c, 'v')).map(b => { b.style.marginRight = '.25rem'; return b; }))]),
        el('div', {}, [el('div', { class: 'text-xs text-slate-600 mb-1' }, 'Saídas'), el('div', {}, st.categorias.saida.map(c => badge(c, 'r')).map(b => { b.style.marginRight = '.25rem'; return b; }))])
      ])
    ]));
  }

  // ================= CENÁRIOS =================
  function cenarios(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const seletor = el('div', { class: 'flex gap-2 items-center' }, [
      el('span', { class: 'text-sm text-slate-600' }, 'Cenário:'),
      ...Object.keys(KPI.CENARIOS).map(k =>
        el('button', { class: 'btn ' + (k === cenarioSel ? 'btn-p' : 'btn-s'), onclick: () => { cenarioSel = k; cenarios(DB.get()); } }, k[0].toUpperCase() + k.slice(1))
      )
    ]);
    v.appendChild(seletor);

    const grid = el('div', { class: 'grid-kpi' });
    Object.keys(KPI.CENARIOS).forEach(k => {
      const proj = KPI.projecaoDiaria(st, 30, k);
      const saldoFim = proj.length ? proj[proj.length - 1].saldo : KPI.saldoRealizado(st);
      const minimo = proj.reduce((m, p) => Math.min(m, p.saldo), Infinity);
      const min = isFinite(minimo) ? minimo : KPI.saldoRealizado(st);
      const sev = min < 0 ? 'r' : min < st.parametros.caixaMinimo ? 'a' : 'v';
      grid.appendChild(el('div', { class: `card sem-${sev}` }, [
        el('div', { class: 'font-semibold text-slate-700 uppercase text-xs' }, k),
        el('div', { class: 'text-sm mt-2' }, 'Saldo 30d: ' + BRL(saldoFim)),
        el('div', { class: 'text-sm' }, 'Mínimo do período: ' + BRL(min)),
        el('div', { class: 'text-xs text-slate-500 mt-1' }, k === 'realista' ? '100% entradas / 100% saídas' : k === 'pessimista' ? '80% entradas / 110% saídas' : '120% entradas / 95% saídas')
      ]));
    });
    v.appendChild(grid);

    const chartCard = el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, `Projeção — cenário ${cenarioSel}`),
      el('canvas', { id: 'chart-cen', height: '80' })
    ]);
    v.appendChild(chartCard);
    const proj = KPI.projecaoDiaria(st, 60, cenarioSel);
    if (chartRef) chartRef.destroy();
    chartRef = new Chart(document.getElementById('chart-cen'), {
      type: 'line',
      data: {
        labels: proj.map(p => p.data),
        datasets: [{ label: 'Saldo', data: proj.map(p => p.saldo), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', tension: .2, fill: true }]
      },
      options: { scales: { y: { ticks: { callback: v => BRL(v) } } }, plugins: { legend: { display: false } } }
    });
  }

  // ================= RÉGUA DE COBRANÇA =================
  function regua(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cm = clientesMap(st);
    const hoje = today();

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Régua configurada'),
      el('table', {}, [
        el('thead', {}, el('tr', {}, ['Dias', 'Ação', 'Canal'].map(h => el('th', {}, h)))),
        el('tbody', {}, st.reguaCobranca.map(r => el('tr', {}, [
          el('td', {}, r.dias >= 0 ? `D+${r.dias}` : `D${r.dias}`),
          el('td', {}, r.acao),
          el('td', {}, r.canal)
        ])))
      ])
    ]));

    // sugestões do dia para cada título em aberto
    const sug = [];
    st.titulosReceber.filter(t => t.status !== 'pago' && t.status !== 'cancelado').forEach(t => {
      const d = daysBetween(t.vencimento, hoje);
      const regra = st.reguaCobranca.slice().reverse().find(r => d >= r.dias);
      if (!regra) return;
      const c = cm[t.clienteId] || {};
      sug.push({ cliente: c.nome || '—', documento: t.documento, venc: t.vencimento, dias: d, saldo: (+t.valor) - (+t.valorRecebido || 0), acao: regra.acao, canal: regra.canal, _telefone: c.telefone, _email: c.email });
    });

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Cliente', 'Doc', 'Vencimento', 'Situação', 'Saldo', 'Ação sugerida', 'Canal'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!sug.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 7, class: 'text-center py-6 text-slate-500' }, 'Nenhuma ação sugerida no momento.')));
    tbl.querySelector('thead tr').appendChild(el('th', {}, 'Contato'));
    sug.sort((a, b) => b.dias - a.dias).forEach(r => {
      const sev = r.dias > 15 ? 'r' : r.dias > 0 ? 'a' : 'g';
      const msg = encodeURIComponent(`Olá ${r.cliente}, referente ao título ${r.documento || ''} com vencimento em ${r.venc} (saldo ${BRL(r.saldo)}). ${r.acao}.`);
      const tel = (r._telefone || '').replace(/\D/g, '');
      const mail = r._email || '';
      tbody.appendChild(el('tr', {}, [
        el('td', {}, r.cliente), el('td', {}, r.documento || '—'),
        el('td', {}, r.venc),
        el('td', {}, badge(r.dias >= 0 ? `D+${r.dias}` : `D${r.dias}`, sev)),
        el('td', {}, BRL(r.saldo)), el('td', {}, r.acao), el('td', {}, r.canal),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          el('a', { class: 'btn btn-s', href: `https://wa.me/${tel}?text=${msg}`, target: '_blank' }, 'WhatsApp'),
          el('a', { class: 'btn btn-s', href: `mailto:${mail}?subject=Cobran%C3%A7a%20${encodeURIComponent(r.documento || '')}&body=${msg}` }, 'E-mail')
        ]))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, [
      el('div', { class: 'flex justify-between items-center p-3' }, [
        el('h3', { class: 'font-semibold' }, 'Ações sugeridas hoje'),
        el('button', { class: 'btn btn-s', onclick: () => exportarRegua(sug) }, 'Exportar CSV')
      ]),
      tbl
    ]));
  }
  function exportarRegua(rows) {
    const csv = Reports.toCSV(rows, [
      { label: 'Cliente', key: 'cliente' }, { label: 'Documento', key: 'documento' },
      { label: 'Vencimento', key: 'venc' }, { label: 'Dias', key: 'dias' },
      { label: 'Saldo', key: 'saldo' }, { label: 'Ação', key: 'acao' }, { label: 'Canal', key: 'canal' }
    ]);
    Reports.download(`regua-cobranca-${today()}.csv`, csv);
  }

  // ================= RELATÓRIOS =================
  function relatorios(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cm = clientesMap(st);
    const fm = fornecedoresMap(st);

    const rels = [
      { titulo: 'Fluxo de caixa (movimentos)', desc: 'Todos lançamentos.', fn: () => ({
        rows: [...st.movimentos].sort((a, b) => a.data.localeCompare(b.data)),
        headers: [
          { label: 'Data', key: 'data' }, { label: 'Descrição', key: 'descricao' }, { label: 'Categoria', key: 'categoria' },
          { label: 'Tipo', key: 'tipo' }, { label: 'Natureza', key: 'natureza' }, { label: 'Status', key: 'status' }, { label: 'Valor', key: 'valor' }
        ],
        file: `fluxo-caixa-${today()}.csv`
      }) },
      { titulo: 'Aging de recebíveis', desc: 'Títulos em aberto com atraso.', fn: () => ({
        rows: st.titulosReceber.filter(t => t.status !== 'pago' && t.status !== 'cancelado').map(t => ({
          cliente: cm[t.clienteId]?.nome || '—', documento: t.documento, emissao: t.emissao, vencimento: t.vencimento,
          valor: t.valor, recebido: t.valorRecebido || 0, saldo: (+t.valor) - (+t.valorRecebido || 0),
          atraso: Math.max(0, daysBetween(t.vencimento, today())), status: t.status
        })),
        headers: ['cliente', 'documento', 'emissao', 'vencimento', 'valor', 'recebido', 'saldo', 'atraso', 'status'].map(k => ({ label: k, key: k })),
        file: `aging-receber-${today()}.csv`
      }) },
      { titulo: 'Agenda de pagamentos', desc: 'Títulos a pagar pendentes.', fn: () => ({
        rows: st.titulosPagar.filter(t => !t.pago).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(t => ({
          fornecedor: fm[t.fornecedorId]?.nome || '—', documento: t.documento, categoria: t.categoria,
          vencimento: t.vencimento, valor: t.valor, prioridade: t.prioridade
        })),
        headers: ['fornecedor', 'documento', 'categoria', 'vencimento', 'valor', 'prioridade'].map(k => ({ label: k, key: k })),
        file: `agenda-pagar-${today()}.csv`
      }) },
      { titulo: 'Mapa de margem', desc: 'Margem por produto/serviço.', fn: () => ({
        rows: st.produtos.map(p => {
          const imp = (+p.preco) * (+p.imposto || 0) / 100;
          const mc = (+p.preco) - imp - (+p.custoVariavel);
          return { nome: p.nome, preco: p.preco, imposto_pct: p.imposto || 0, custo_var: p.custoVariavel, mc_unit: mc, mc_pct: p.preco > 0 ? (mc / p.preco * 100).toFixed(2) : 0, volume: p.volume || 0, receita: (+p.preco) * (+p.volume || 0) };
        }),
        headers: ['nome', 'preco', 'imposto_pct', 'custo_var', 'mc_unit', 'mc_pct', 'volume', 'receita'].map(k => ({ label: k, key: k })),
        file: `mapa-margem-${today()}.csv`
      }) }
    ];

    const grid = el('div', { class: 'grid-kpi' });
    rels.forEach(r => {
      grid.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'font-semibold' }, r.titulo),
        el('div', { class: 'text-xs text-slate-500 mb-3' }, r.desc),
        el('button', { class: 'btn btn-p', onclick: () => { const d = r.fn(); if (!d.rows.length) { alert('Sem dados para este relatório.'); return; } Reports.download(d.file, Reports.toCSV(d.rows, d.headers)); DB.log('export', r.titulo); } }, 'Exportar CSV')
      ]));
    });
    v.appendChild(grid);

    // Resumo mensal
    const resumo = resumoMensal(st);
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Resumo executivo mensal (últimos 6 meses)'),
      el('table', {}, [
        el('thead', {}, el('tr', {}, ['Mês', 'Entradas', 'Saídas', 'Resultado'].map(h => el('th', {}, h)))),
        el('tbody', {}, resumo.map(r => el('tr', {}, [
          el('td', {}, r.mes),
          el('td', { class: 'text-green-700' }, BRL(r.entradas)),
          el('td', { class: 'text-red-700' }, BRL(r.saidas)),
          el('td', { class: r.resultado >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium' }, BRL(r.resultado))
        ])))
      ])
    ]));
  }

  function resumoMensal(st) {
    const hoje = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(d.toISOString().slice(0, 7));
    }
    const agg = Object.fromEntries(meses.map(m => [m, { entradas: 0, saidas: 0 }]));
    st.movimentos.filter(m => m.status === 'realizado').forEach(m => {
      const k = m.data.slice(0, 7);
      if (agg[k]) { if (m.tipo === 'entrada') agg[k].entradas += +m.valor; else agg[k].saidas += +m.valor; }
    });
    return meses.map(m => ({ mes: m, entradas: agg[m].entradas, saidas: agg[m].saidas, resultado: agg[m].entradas - agg[m].saidas }));
  }

  // ================= AUDITORIA =================
  function auditoria(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const log = st.auditoria || [];
    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Data/Hora', 'Ação', 'Detalhe'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!log.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 3, class: 'text-center py-6 text-slate-500' }, 'Sem registros.')));
    log.forEach(l => tbody.appendChild(el('tr', {}, [
      el('td', {}, new Date(l.ts).toLocaleString('pt-BR')),
      el('td', {}, badge(l.acao, 'g')),
      el('td', {}, l.detalhe || '')
    ])));
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  // ================= IMPORTAÇÃO CSV de movimentos =================
  function openImportCSV(st) {
    const body = el('div');
    const fileIn = el('input', { type: 'file', accept: '.csv,text/csv', class: 'input' });
    const info = el('div', { class: 'text-xs text-slate-500 mt-2' },
      'Formato esperado: data;descricao;categoria;tipo;valor (tipo = entrada | saida). Datas em DD/MM/AAAA ou AAAA-MM-DD.');
    let rows = [];
    const preview = el('div', { class: 'text-xs mt-3' });
    fileIn.onchange = () => {
      const f = fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        rows = Reports.parseCSV(r.result);
        preview.textContent = `Linhas lidas: ${rows.length}. Ex.: ${JSON.stringify(rows[0] || {})}`;
      };
      r.readAsText(f, 'utf-8');
    };
    body.appendChild(field('Arquivo CSV', fileIn));
    body.appendChild(info);
    body.appendChild(preview);
    modal('Importar movimentos (CSV)', body, () => {
      if (!rows.length) { alert('Selecione um arquivo.'); return false; }
      let n = 0;
      DB.set(s => {
        rows.forEach(r => {
          const tipo = (r.tipo || '').toLowerCase().startsWith('e') ? 'entrada' : 'saida';
          const valor = Reports.parseNum(r.valor);
          if (!valor) return;
          s.movimentos.push({
            id: DB.id(), data: Reports.parseDate(r.data), descricao: r.descricao || 'Importado',
            categoria: r.categoria || 'Outros', tipo, natureza: 'op',
            status: 'realizado', valor, origem: 'csv'
          });
          n++;
        });
      });
      DB.log('import-csv', `${n} movimentos importados`);
      alert(`${n} movimentos importados.`);
    });
  }

  // ================= CONCILIAÇÃO BANCÁRIA =================
  let ofxTxs = [];

  // Persistencia do extrato OFX no estado compartilhado (Supabase) — todos os
  // usuarios da empresa veem o mesmo extrato importado e o progresso da conciliacao.
  function salvarOfxTxs() {
    try {
      DB.set(s => {
        s.ofxConciliacao = { conta: ofxConta, txs: ofxTxs, atualizadoEm: new Date().toISOString() };
      });
    } catch(e) { console.error('salvarOfxTxs:', e); }
  }
  function carregarOfxTxs() {
    try {
      const st = DB.get();
      const d = st && st.ofxConciliacao;
      if (d && Array.isArray(d.txs) && d.txs.length) {
        ofxTxs = d.txs;
        if (d.conta) ofxConta = d.conta;
      }
    } catch(e) {}
  }
  function limparOfxTxs() {
    ofxTxs = [];
    try {
      DB.set(s => { s.ofxConciliacao = null; });
    } catch(e) {}
  }

  let ofxConta = 'principal';
  function conciliacao(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    if (!ofxTxs.length) carregarOfxTxs();

    const ativas = (st.contas || []).filter(c => c.ativa !== false);
    if (!ativas.find(c => c.id === ofxConta)) ofxConta = ativas[0]?.id || 'principal';
    const selConta = el('select', { class: 'select', onchange: () => { ofxConta = selConta.value; } }, ativas.map(c => el('option', { value: c.id }, c.nome)));
    selConta.value = ofxConta;

    const fileIn = el('input', { type: 'file', accept: '.ofx,.qfx,.csv,text/xml', class: 'input' });
    fileIn.onchange = () => {
      const f = fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          ofxTxs = f.name.toLowerCase().endsWith('.csv') ? parseExtratoCSV(r.result) : OFX.parse(r.result);
          salvarOfxTxs();
        } catch { ofxTxs = []; alert('Falha ao ler extrato.'); }
        conciliacao(DB.get());
      };
      r.readAsText(f, 'utf-8');
    };

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-2' }, 'Importar extrato bancário (OFX/QFX ou CSV)'),
      el('div', { class: 'text-xs text-slate-500 mb-3' }, 'CSV formato: data;descricao;valor  (valor negativo = saída).'),
      el('div', { class: 'grid grid-cols-2 gap-3' }, [
        field('Conta destino', selConta),
        field('Arquivo', fileIn)
      ])
    ]));

    if (!ofxTxs.length) return;

    // Procura match em previstos E em realizados que ainda nao foram conciliados via OFX.
    // Isso evita duplicatas quando o usuario ja deu baixa manual antes do import do OFX.
    const candidatos = (st.movimentos || []).filter(m => !m.cancelado && m.origem !== 'ofx' && m.origem !== 'ofx-lote');
    const idsConciliados = new Set();
    const linhas = ofxTxs.map(tx => {
      const match = OFX.match(tx, candidatos.filter(p => !idsConciliados.has(p.id)));
      if (match) idsConciliados.add(match.id);
      return { tx, match };
    });

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Data', 'Descrição', 'Tipo', 'Valor', 'Match previsto?', 'Ação'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    linhas.forEach(l => {
      const ehLote = isLotePagamento(l.tx);
      const aplicado = !!(l._applied || (l.tx && l.tx._applied));
      const acoes = [];
      if (aplicado) {
        acoes.push(el('span', { class: 'text-green-700 font-bold text-sm' }, '✓ aplicado'));
      } else if (l.match) {
        acoes.push(el('button', { class: 'btn btn-p', onclick: () => aplicarConciliacao(l) }, 'Confirmar'));
      } else {
        if (l.tx.tipo === 'saida') {
          acoes.push(el('button', { class: 'btn ' + (ehLote ? 'btn-p' : 'btn-s'), onclick: () => openDecomporLote(l, ofxConta) }, ehLote ? 'Decompor lote' : 'Decompor em vários'));
          acoes.push(el('button', { class: 'btn ' + (ehLote ? 'btn-s' : 'btn-p'), onclick: () => aplicarConciliacao(l) }, 'Lançar como saída única'));
        } else {
          acoes.push(el('button', { class: 'btn btn-p', onclick: () => aplicarConciliacao(l) }, 'Lançar como realizado'));
        }
      }
      const tr = el('tr', {}, [
        el('td', {}, fmtDate(l.tx.data)),
        el('td', {}, [el('span', {}, l.tx.descricao || '—'), ehLote ? el('span', { class: 'ml-1 badge badge-a', title: 'Pagamento em lote detectado' }, 'lote') : null].filter(Boolean)),
        el('td', {}, badge(l.tx.tipo, l.tx.tipo === 'entrada' ? 'v' : 'r')),
        el('td', {}, BRL(l.tx.valor)),
        el('td', {}, l.match
          ? badge((l.match.status === 'realizado' ? 'já lançado: ' : 'previsto: ') + (l.match.descricao || ''), l.match.status === 'realizado' ? 'b' : 'v')
          : badge('novo', 'a')),
        el('td', {}, el('div', { class: 'flex gap-1 flex-wrap' }, acoes))
      ]);
      if (aplicado) tr.style.opacity = '0.5';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, [
      el('div', { class: 'flex justify-between items-center p-3' }, [
        el('h3', { class: 'font-semibold' }, `Transações do extrato (${linhas.length})`),
        el('div', { class: 'flex gap-2' }, [
        el('button', { class: 'btn btn-s', onclick: () => {
          if (!confirm('Limpar o extrato carregado? Lançamentos já aplicados ficam preservados no fluxo de caixa.')) return;
          limparOfxTxs(); conciliacao(DB.get());
        } }, 'Limpar extrato'),
        el('button', { class: 'btn btn-p', onclick: () => {
          let n = 0;
          linhas.forEach(l => { if (!l._applied && !l.tx._applied) { aplicarConciliacao(l, true); n++; } });
          if (window.UI && UI.toast) UI.toast(n + ' lançamento(s) conciliado(s).', 'v');
          conciliacao(DB.get());
        } }, 'Aplicar todas')
        ])
      ]),
      tbl
    ]));
  }

  function parseExtratoCSV(text) {
    return Reports.parseCSV(text).map(r => {
      const valor = Reports.parseNum(r.valor);
      return {
        fitid: r.fitid || '',
        data: Reports.parseDate(r.data),
        descricao: r.descricao || r.historico || '—',
        valor: Math.abs(valor),
        tipo: valor >= 0 ? 'entrada' : 'saida'
      };
    });
  }

  function aplicarConciliacao(l, bulk = false) {
    if (!can('baixar') && !can('editar')) { if (!bulk) alert('Perfil sem permissão.'); return; }
    if (l._applied) return;
    DB.set(s => {
      if (l.match) {
        const m = s.movimentos.find(x => x.id === l.match.id);
        if (m) {
          // Se ja era realizado (baixa manual previa), so marca como conciliado.
          // Se era previsto, vira realizado E conciliado.
          if (m.status === 'previsto') { m.status = 'realizado'; m.data = l.tx.data; }
          m.origem = 'ofx';
          m.contaId = ofxConta;
          m.conciliadoEm = new Date().toISOString();
        }
      } else {
        s.movimentos.push({
          id: DB.id(), data: l.tx.data, descricao: l.tx.descricao || 'Extrato',
          categoria: l.tx.tipo === 'entrada' ? 'Vendas' : 'Outros',
          tipo: l.tx.tipo, natureza: 'op', status: 'realizado', valor: l.tx.valor,
          contaId: ofxConta, origem: 'ofx',
          conciliadoEm: new Date().toISOString()
        });
      }
    });
    l._applied = true;
    // marca a transacao do extrato como aplicada para sobreviver a re-render
    if (l.tx) l.tx._applied = true;
    DB.log('conciliacao', `${l.tx.data} ${l.tx.descricao} ${BRL(l.tx.valor)}${l.match ? ' (match)' : ''}`);
    salvarOfxTxs();
    if (!bulk) {
      if (window.UI && UI.toast) UI.toast('Conciliado: ' + (l.tx.descricao || 'lançamento'), 'v');
      conciliacao(DB.get());
    }
  }

  // --- Pagamentos em lote (SISPAG, folha, etc.) ---
  function isLotePagamento(tx) {
    if (!tx || tx.tipo !== 'saida') return false;
    const d = String(tx.descricao || '').toUpperCase();
    return /SISPAG|PAGTO\s*LOTE|PAGAMENTO\s+EM\s+LOTE|PAG\s*ELETRONICO|TRANSF\s*MASSA|PAG\s*MASS|PAGTO\s*FORN|FOLHA\s*PAGTO|FOLHA\s+SAL|PAGTO\s+EM\s+MASSA|REM\s*PAGTO/.test(d);
  }

  function openDecomporLote(l, contaId) {
    const tx = l.tx;
    const totalLote = +tx.valor;
    const st = DB.get();
    // Lista os titulos a pagar em aberto, ordenados por vencimento mais proximo da data do extrato
    const dataLote = tx.data;
    const abertos = (st.titulosPagar || [])
      .filter(t => !t.pago && !t.cancelado)
      .map(t => ({ ...t, _dist: Math.abs(new Date(t.vencimento) - new Date(dataLote)) }))
      .sort((a, b) => a._dist - b._dist);
    if (!abertos.length) {
      alert('Nao ha titulos a pagar em aberto para decompor.');
      return;
    }
    const fornMap = {};
    (st.fornecedores || []).forEach(f => { fornMap[f.id] = f; });

    const body = el('div');
    body.appendChild(el('div', { class: 'mb-3 p-3 bg-slate-100 dark:bg-slate-800 rounded' }, [
      el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Lancamento do extrato'),
      el('div', { class: 'text-sm' }, [
        el('span', { class: 'font-semibold' }, fmtDate(tx.data)),
        el('span', {}, ' \u00b7 '),
        el('span', {}, tx.descricao || '\u2014'),
        el('span', {}, ' \u00b7 '),
        el('span', { class: 'font-bold text-red-600' }, '- ' + BRL(totalLote))
      ])
    ]));

    const inpBusca = el('input', { class: 'input mb-2', placeholder: 'Buscar por documento, fornecedor ou categoria...' });
    body.appendChild(inpBusca);

    const listaWrap = el('div', { class: 'border border-slate-200 dark:border-slate-700 rounded max-h-80 overflow-y-auto' });
    body.appendChild(listaWrap);

    const resumo = el('div', { class: 'mt-3 p-3 rounded text-sm' });
    body.appendChild(resumo);

    const selecionados = new Set();
    function somaSelecionados() {
      let s = 0;
      for (const id of selecionados) {
        const t = abertos.find(x => x.id === id);
        if (t) s += +t.valor;
      }
      return s;
    }
    function renderResumo() {
      const soma = somaSelecionados();
      const diff = totalLote - soma;
      const ok = Math.abs(diff) < 0.01;
      resumo.innerHTML = '';
      const cor = ok ? '#16a34a' : (diff > 0 ? '#d97706' : '#dc2626');
      resumo.style.background = ok ? '#f0fdf4' : (diff > 0 ? '#fffbeb' : '#fef2f2');
      resumo.style.border = '1px solid ' + cor;
      resumo.appendChild(el('div', {}, [
        el('span', { style: 'font-weight:600' }, selecionados.size + ' titulo(s) selecionado(s) - Soma: '),
        el('span', { style: 'font-weight:700;color:' + cor }, BRL(soma)),
        el('span', { style: 'margin-left:.75rem;color:' + cor }, ok ? '\u2713 Bate com o extrato' : ('Diferenca: ' + (diff > 0 ? 'faltam ' : 'sobram ') + BRL(Math.abs(diff))))
      ]));
    }
    function renderLista() {
      const q = inpBusca.value.toLowerCase().trim();
      const tokens = q.split(/\s+/).filter(Boolean);
      listaWrap.innerHTML = '';
      const filtrados = abertos.filter(t => {
        if (!tokens.length) return true;
        const f = fornMap[t.fornecedorId];
        const hay = ((t.documento || '') + ' ' + (t.categoria || '') + ' ' + ((f && f.nome) || '') + ' ' + ((f && f.documento) || '')).toLowerCase();
        return tokens.every(tk => hay.includes(tk));
      });
      if (!filtrados.length) {
        listaWrap.appendChild(el('div', { class: 'p-3 text-sm text-slate-500' }, 'Nenhum titulo corresponde a busca.'));
        return;
      }
      filtrados.slice(0, 200).forEach(t => {
        const f = fornMap[t.fornecedorId];
        const ckId = 'ck-' + t.id;
        const linha = el('label', { class: 'flex items-center gap-3 p-2 border-b border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' }, [
          el('input', { type: 'checkbox', id: ckId, onchange: (e) => { if (e.target.checked) selecionados.add(t.id); else selecionados.delete(t.id); renderResumo(); } }),
          el('div', { class: 'flex-1' }, [
            el('div', { class: 'text-sm font-medium' }, [
              el('span', {}, t.documento || ('Titulo ' + t.id.slice(0, 6))),
              el('span', { class: 'ml-2 text-slate-500 font-normal' }, (f && f.nome) ? '\u00b7 ' + f.nome : '')
            ]),
            el('div', { class: 'text-xs text-slate-500' }, [
              el('span', {}, 'Venc ' + fmtDate(t.vencimento)),
              t.categoria ? el('span', {}, ' \u00b7 ' + t.categoria) : null
            ].filter(Boolean))
          ]),
          el('div', { class: 'text-sm font-semibold text-red-700' }, BRL(t.valor))
        ]);
        listaWrap.appendChild(linha);
        if (selecionados.has(t.id)) linha.querySelector('input').checked = true;
      });
    }
    let timer = null;
    inpBusca.oninput = () => { clearTimeout(timer); timer = setTimeout(renderLista, 200); };

    renderLista();
    renderResumo();

    modal('Decompor lote em titulos a pagar', body, () => {
      if (!selecionados.size) { alert('Selecione ao menos um titulo.'); return false; }
      const soma = somaSelecionados();
      const diff = totalLote - soma;
      const ok = Math.abs(diff) < 0.01;
      if (!ok) {
        const msg = 'A soma dos selecionados (' + BRL(soma) + ') NAO bate com o extrato (' + BRL(totalLote) + '). Diferenca: ' + BRL(Math.abs(diff)) + '. Confirmar mesmo assim?';
        if (!confirm(msg)) return false;
      }
      const loteId = (tx.fitid || DB.id()) + '-lote';
      const ids = Array.from(selecionados);
      DB.set(s => {
        for (const id of ids) {
          const t = s.titulosPagar.find(x => x.id === id);
          if (!t || t.pago) continue;
          t.pago = true;
          t.dataPagamento = tx.data;
          t.loteFitid = tx.fitid || '';
          s.movimentos.push({
            id: DB.id(), data: tx.data,
            descricao: 'Pagto ' + (t.documento || 'titulo') + ' (lote ' + (tx.descricao || '').slice(0, 30) + ')',
            categoria: t.categoria || 'Outros',
            tipo: 'saida', natureza: 'op', status: 'realizado',
            valor: +t.valor,
            contaId: contaId,
            origem: 'ofx-lote',
            transferId: loteId
          });
        }
      });
      DB.log('conciliacao-lote', ids.length + ' titulos via lote ' + (tx.descricao || '') + ' = ' + BRL(soma));
      conciliacao(DB.get());
    });
  }

  // ================= EMPRESAS =================
  function empresas(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const list = DB.listEmpresas();
    const ativa = DB.empresaAtivaId();

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Empresas cadastradas'),
      el('table', {}, [
        el('thead', {}, el('tr', {}, ['Nome', 'Status', 'Ações'].map(h => el('th', {}, h)))),
        el('tbody', {}, list.map(e => el('tr', {}, [
          el('td', {}, e.nome),
          el('td', {}, e.id === ativa ? badge('ATIVA', 'v') : badge('—', 'g')),
          el('td', {}, el('div', { class: 'flex gap-1' }, [
            e.id === ativa ? null : el('button', { class: 'btn btn-s', onclick: () => { DB.switchEmpresa(e.id); alert(`Empresa ativa: ${e.nome}`); } }, 'Ativar'),
            el('button', { class: 'btn btn-s', onclick: () => { const n = prompt('Novo nome:', e.nome); if (n) DB.renameEmpresa(e.id, n); } }, 'Renomear'),
            el('button', { class: 'btn btn-d', onclick: () => { if (list.length <= 1) return alert('Não é possível excluir a última empresa.'); if (confirm(`Excluir "${e.nome}" e todos os seus dados?`)) { DB.removeEmpresa(e.id); DB.log('empresa-removida', e.nome); } } }, 'Excluir')
          ].filter(Boolean)))
        ])))
      ])
    ]));

    const inp = el('input', { class: 'input', placeholder: 'Nome da nova empresa' });
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Nova empresa'),
      el('div', { class: 'flex gap-2' }, [
        inp,
        el('button', { class: 'btn btn-p', onclick: () => {
          const n = inp.value.trim(); if (!n) return;
          DB.createEmpresa(n); DB.log('empresa-criada', n); alert('Empresa criada e ativa.');
        } }, 'Criar')
      ])
    ]));
  }

  // ================= BENCHMARK MENSAL =================
  function benchmark(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const mesesAgg = {};
    st.movimentos.filter(m => m.status === 'realizado').forEach(m => {
      const k = m.data.slice(0, 7);
      mesesAgg[k] = mesesAgg[k] || { entradas: 0, saidas: 0, nLanc: 0 };
      if (m.tipo === 'entrada') mesesAgg[k].entradas += +m.valor;
      else mesesAgg[k].saidas += +m.valor;
      mesesAgg[k].nLanc++;
    });
    const keys = Object.keys(mesesAgg).sort();
    if (keys.length < 2) {
      v.appendChild(el('div', { class: 'card' }, 'Dados insuficientes para benchmark (precisa ≥ 2 meses com lançamentos).'));
      return;
    }
    const rows = keys.map((k, i) => {
      const cur = mesesAgg[k];
      const prev = i > 0 ? mesesAgg[keys[i - 1]] : null;
      const delta = (a, b) => (b == null || b === 0) ? null : ((a - b) / b * 100);
      return {
        mes: k,
        entradas: cur.entradas,
        saidas: cur.saidas,
        resultado: cur.entradas - cur.saidas,
        dE: prev ? delta(cur.entradas, prev.entradas) : null,
        dS: prev ? delta(cur.saidas, prev.saidas) : null,
        dR: prev ? delta(cur.entradas - cur.saidas, prev.entradas - prev.saidas) : null
      };
    });

    const arrow = (v, inv = false) => {
      if (v == null) return el('span', { class: 'text-slate-400' }, '—');
      const good = inv ? v < 0 : v > 0;
      return el('span', { class: good ? 'text-green-700' : 'text-red-700' }, (v >= 0 ? '▲ ' : '▼ ') + v.toFixed(1) + '%');
    };

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Mês', 'Entradas', 'Δ', 'Saídas', 'Δ', 'Resultado', 'Δ'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    rows.slice().reverse().forEach(r => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, r.mes),
        el('td', { class: 'text-green-700' }, BRL(r.entradas)),
        el('td', {}, arrow(r.dE)),
        el('td', { class: 'text-red-700' }, BRL(r.saidas)),
        el('td', {}, arrow(r.dS, true)),
        el('td', { class: r.resultado >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium' }, BRL(r.resultado)),
        el('td', {}, arrow(r.dR))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));

    // YoY do mês atual
    const hojeY = new Date();
    const yoy = KPI.yoy(st, hojeY.getFullYear(), hojeY.getMonth() + 1);
    const arrowYoY = (v, inv = false) => {
      if (v == null) return el('span', { class: 'text-slate-400' }, '—');
      const good = inv ? v < 0 : v > 0;
      return el('span', { class: good ? 'text-green-700 font-medium' : 'text-red-700 font-medium' }, (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
    };
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, `YoY — ${String(hojeY.getMonth() + 1).padStart(2,'0')}/${hojeY.getFullYear()} vs ${String(hojeY.getMonth() + 1).padStart(2,'0')}/${hojeY.getFullYear() - 1}`),
      el('div', { class: 'grid-kpi' }, [
        kpi('Entradas atual', BRL(yoy.cur.e), 'v', 'Mesmo mês do ano passado: ' + BRL(yoy.prev.e)),
        kpi('Δ Entradas YoY', arrowYoY(yoy.deltaE).textContent, yoy.deltaE == null ? 'g' : yoy.deltaE > 0 ? 'v' : 'r'),
        kpi('Saídas atual', BRL(yoy.cur.s), 'r', 'Ano passado: ' + BRL(yoy.prev.s)),
        kpi('Δ Saídas YoY', arrowYoY(yoy.deltaS, true).textContent, yoy.deltaS == null ? 'g' : yoy.deltaS < 0 ? 'v' : 'r'),
        kpi('Resultado atual', BRL(yoy.cur.e - yoy.cur.s), yoy.cur.e - yoy.cur.s < 0 ? 'r' : 'v'),
        kpi('Δ Resultado YoY', arrowYoY(yoy.deltaR).textContent, yoy.deltaR == null ? 'g' : yoy.deltaR > 0 ? 'v' : 'r')
      ])
    ]));

    const ult = rows[rows.length - 1], pen = rows[rows.length - 2];
    if (pen) {
      const insights = [];
      if (ult.dE != null && ult.dE > 10) insights.push({ sev: 'v', t: `Entradas cresceram ${ult.dE.toFixed(1)}% vs. mês anterior.` });
      if (ult.dS != null && ult.dS > 10) insights.push({ sev: 'a', t: `Saídas subiram ${ult.dS.toFixed(1)}% — revisar despesas.` });
      if (ult.resultado < 0 && pen.resultado >= 0) insights.push({ sev: 'r', t: 'Mês atual virou negativo após resultado positivo.' });
      if (ult.resultado > 0 && pen.resultado < 0) insights.push({ sev: 'v', t: 'Recuperação: resultado voltou a ser positivo.' });
      v.appendChild(el('div', { class: 'card' }, [
        el('h3', { class: 'font-semibold mb-3' }, 'Insights do período'),
        insights.length ? el('div', { class: 'space-y-2' }, insights.map(i => el('div', { class: `alert alert-${i.sev}` }, [el('span', {}, i.t)])))
                        : el('div', { class: 'text-slate-500 text-sm' }, 'Sem desvios relevantes entre os últimos dois meses.')
      ]));
    }
  }

  // ================= PERFIS / USUÁRIOS =================
  function usuarios(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const atual = DB.getPerfil();
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Perfil ativo (simulação de SSO local)'),
      el('div', { class: 'text-xs text-slate-600 mb-3' }, 'O perfil ativo restringe/libera ações na UI. Em produção, será substituído por autenticação real.'),
      el('div', { class: 'grid-kpi' }, DB.perfis.map(p => {
        const perms = PERMS[p];
        const card = el('div', { class: 'card sem-' + (p === atual ? 'v' : 'g') }, [
          el('div', { class: 'font-semibold uppercase text-xs tracking-wider' }, p),
          el('div', { class: 'text-xs mt-2' }, Object.entries(perms).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'somente leitura'),
          el('div', { class: 'mt-3' },
            p === atual
              ? badge('ATIVO', 'v')
              : el('button', { class: 'btn btn-p', onclick: () => { DB.setPerfil(p); DB.log('mudar-perfil', p); } }, 'Usar este perfil')
          )
        ]);
        return card;
      }))
    ]));
  }

  // ================= SNAPSHOTS =================
  function snapshots(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    v.appendChild(el('div', { class: 'card flex justify-between items-center' }, [
      el('div', {}, [
        el('h3', { class: 'font-semibold' }, 'Backups locais da empresa'),
        el('div', { class: 'text-xs text-slate-500' }, 'Até ' + 10 + ' snapshots por empresa. Um backup diário é criado automaticamente.')
      ]),
      el('button', { class: 'btn btn-p', onclick: () => { DB.snapshot('manual'); DB.log('snapshot-manual', 'criado'); alert('Snapshot criado.'); snapshots(DB.get()); } }, '+ Novo snapshot')
    ]));
    const list = DB.listSnapshots();
    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Data/Hora', 'Rótulo', 'Ações'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!list.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 3, class: 'text-center py-6 text-slate-500' }, 'Nenhum snapshot ainda.')));
    list.forEach(s => tbody.appendChild(el('tr', {}, [
      el('td', {}, new Date(s.ts).toLocaleString('pt-BR')),
      el('td', {}, badge(s.label, s.label === 'manual' ? 'v' : 'g')),
      el('td', {}, el('div', { class: 'flex gap-1' }, [
        el('button', { class: 'btn btn-s', onclick: () => { if (confirm('Restaurar este snapshot? Os dados atuais serão substituídos.')) { DB.restoreSnapshot(s.ts); DB.log('snapshot-restore', s.ts); } } }, 'Restaurar'),
        el('button', { class: 'btn btn-d', onclick: () => { if (confirm('Excluir snapshot?')) { DB.deleteSnapshot(s.ts); snapshots(DB.get()); } } }, '×')
      ]))
    ])));
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  // ================= DRE GERENCIAL =================
  let dreMes = null;
  function dre(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const hoje = new Date();
    const ano = dreMes ? dreMes.ano : hoje.getFullYear();
    const mes = dreMes ? dreMes.mes : (hoje.getMonth() + 1);
    dreMes = { ano, mes };

    // Seletor de mes/ano: navegacao por ano (◀ ▶) + grade de 12 meses + atalhos
    const NOMES_MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const navega = (deltaAno, mesAlvo) => {
      const novoAno = ano + deltaAno;
      const novoMes = mesAlvo != null ? mesAlvo : mes;
      dreMes = { ano: novoAno, mes: novoMes };
      dre(DB.get());
    };
    const seletor = el('div', { class: 'card mb-4' }, [
      el('div', { class: 'flex items-center justify-between mb-3' }, [
        el('div', { class: 'flex items-center gap-3' }, [
          el('button', { class: 'btn btn-s text-lg', onclick: () => navega(-1) }, '◀'),
          el('div', { class: 'text-xl font-bold text-slate-800 dark:text-slate-100 min-w-20 text-center' }, String(ano)),
          el('button', { class: 'btn btn-s text-lg', onclick: () => navega(1) }, '▶')
        ]),
        el('div', { class: 'flex gap-2' }, [
          el('button', { class: 'btn btn-s', onclick: () => {
            const h = new Date(); dreMes = { ano: h.getFullYear(), mes: h.getMonth() + 1 }; dre(DB.get());
          } }, 'Mês atual'),
          el('button', { class: 'btn btn-s', onclick: () => {
            const h = new Date();
            const ant = new Date(h.getFullYear(), h.getMonth() - 1, 1);
            dreMes = { ano: ant.getFullYear(), mes: ant.getMonth() + 1 }; dre(DB.get());
          } }, 'Mês anterior')
        ])
      ]),
      el('div', { class: 'grid grid-cols-6 gap-2' }, NOMES_MES.map((nm, i) => {
        const m = i + 1;
        const ativo = m === mes;
        return el('button', {
          class: 'btn ' + (ativo ? 'btn-p' : 'btn-s') + ' py-2 text-sm font-semibold',
          onclick: () => navega(0, m)
        }, nm);
      }))
    ]);
    v.appendChild(seletor);

    const d = KPI.dreGerencial(st, ano, mes);
    const linha = (label, valor, cls = '', indent = 0) =>
      el('tr', {}, [
        el('td', { style: `padding-left:${0.5 + indent * 1}rem`, class: cls }, label),
        el('td', { class: 'text-right ' + cls }, BRL(valor))
      ]);

    const tbl = el('table', {}, el('tbody', {}, [
      linha('(+) Receita operacional bruta', d.receitaBruta, 'font-semibold'),
      linha('(−) Custos variáveis (Fornecedores + Tributos)', -d.custosVar, '', 1),
      linha('(=) Margem de contribuição', d.mc, 'font-semibold text-blue-700'),
      linha('Margem de contribuição %', d.mcPct, 'text-xs text-slate-500', 1),
      linha('(−) Custos fixos (Aluguel + Folha + Sistemas + Pró-labore)', -d.custosFix, '', 1),
      linha('(−) Outras saídas operacionais', -d.outros, '', 1),
      linha('(=) Resultado operacional', d.resultadoOp, 'font-semibold ' + (d.resultadoOp >= 0 ? 'text-green-700' : 'text-red-700')),
      linha('(+) Entradas não operacionais', d.receitaNop, '', 1),
      linha('(=) Resultado final do mês', d.resultadoFinal, 'font-bold text-lg ' + (d.resultadoFinal >= 0 ? 'text-green-700' : 'text-red-700'))
    ]));
    v.appendChild(el('div', { class: 'card' }, [el('h3', { class: 'font-semibold mb-3' }, `DRE gerencial — ${String(mes).padStart(2,'0')}/${ano}`), tbl]));

    if (Object.keys(d.saidasCat).length) {
      const canvasId = 'dre-donut-' + Date.now();
      const decomp = el('table', {});
      decomp.appendChild(el('thead', {}, el('tr', {}, ['Categoria', 'Valor', '% sobre receita'].map(h => el('th', {}, h)))));
      const tbody = el('tbody');
      const entries = Object.entries(d.saidasCat).sort(([, a], [, b]) => b - a);
      entries.forEach(([k, val]) => {
        const pct = d.receitaBruta > 0 ? (val / d.receitaBruta * 100) : 0;
        tbody.appendChild(el('tr', {}, [el('td', {}, k), el('td', {}, BRL(val)), el('td', {}, pct.toFixed(1) + '%')]));
      });
      decomp.appendChild(tbody);
      v.appendChild(el('div', { class: 'card' }, [
        el('h3', { class: 'font-semibold mb-3' }, 'Distribuição das saídas por categoria'),
        el('div', { class: 'grid md:grid-cols-2 gap-4 items-center' }, [
          el('canvas', { id: canvasId, height: '200' }),
          decomp
        ])
      ]));
      setTimeout(() => {
        if (chartRef) chartRef.destroy();
        const cores = ['#2563eb', '#16a34a', '#dc2626', '#eab308', '#0891b2', '#9333ea', '#f97316', '#475569', '#be185d', '#65a30d'];
        chartRef = new Chart(document.getElementById(canvasId), {
          type: 'doughnut',
          data: {
            labels: entries.map(([k]) => k),
            datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map((_, i) => cores[i % cores.length]) }]
          },
          options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } } }
        });
      }, 0);
    }
  }

  // ================= METAS =================
  function metas(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const hoje = new Date();
    const pref = hoje.toISOString().slice(0, 7);
    const movMes = st.movimentos.filter(m => m.status === 'realizado' && m.data.startsWith(pref));
    const receitaMes = movMes.filter(m => m.tipo === 'entrada').reduce((s, m) => s + (+m.valor), 0);
    const resultadoMes = receitaMes - movMes.filter(m => m.tipo === 'saida').reduce((s, m) => s + (+m.valor), 0);
    const inadPct = KPI.inadimplenciaPct(st);
    const { mcPct } = KPI.margemContribuicao(st);

    const progresso = (real, meta) => {
      const pct = meta > 0 ? Math.min(200, (real / meta) * 100) : 0;
      return { pct, sev: pct >= 100 ? 'v' : pct >= 70 ? 'a' : 'r' };
    };
    const diaMes = hoje.getDate();
    const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const forecast = receitaMes / diaMes * diasMes;

    const card = (titulo, real, meta, fmt, inv = false) => {
      const p = progresso(inv ? -real : real, inv ? -meta : meta);
      if (inv) { // inverso: quanto menor melhor
        const pct = meta > 0 ? Math.min(200, Math.max(0, (meta - real) / meta * 100 + 100)) : 0;
        p.pct = Math.max(0, pct - 100) + 0;
        p.sev = real <= meta ? 'v' : real <= meta * 1.5 ? 'a' : 'r';
      }
      return el('div', { class: 'card sem-' + p.sev }, [
        el('div', { class: 'text-xs uppercase text-slate-500' }, titulo),
        el('div', { class: 'text-2xl font-bold mt-1' }, fmt(real)),
        el('div', { class: 'text-xs text-slate-600 mt-1' }, `Meta: ${fmt(meta)}`),
        el('div', { class: 'mt-2 bg-slate-200 h-2 rounded overflow-hidden' }, [
          el('div', { style: `width:${Math.min(100, Math.max(0, p.pct))}%;height:100%;background:${p.sev === 'v' ? '#16a34a' : p.sev === 'a' ? '#eab308' : '#dc2626'}` }, '')
        ]),
        el('div', { class: 'text-xs text-slate-500 mt-1' }, `${p.pct.toFixed(0)}% ${inv ? '(menor é melhor)' : ''}`)
      ]);
    };

    v.appendChild(el('div', { class: 'grid-kpi' }, [
      card('Receita do mês', receitaMes, st.metas.receitaMensal, BRL),
      card('Resultado do mês', resultadoMes, st.metas.resultadoMensal, BRL),
      card('Margem de contribuição %', mcPct, st.metas.margemMinPct, v => PCT(v)),
      card('Inadimplência %', inadPct, st.metas.inadimplenciaMaxPct, v => PCT(v), true)
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Forecast de receita do mês'),
      el('div', { class: 'text-sm' }, `Realizado até hoje (${diaMes}/${diasMes} dias): ${BRL(receitaMes)}`),
      el('div', { class: 'text-sm' }, `Projeção linear fim do mês: ${BRL(forecast)}`),
      el('div', { class: 'text-sm' }, st.metas.receitaMensal > 0
        ? `Meta: ${BRL(st.metas.receitaMensal)} — ${forecast >= st.metas.receitaMensal ? '✅ provável atingir' : `gap projetado: ${BRL(st.metas.receitaMensal - forecast)}`}`
        : 'Defina uma meta mensal para acompanhar projeção.')
    ]));

    if (can('configurar')) {
      const inp = {
        receitaMensal: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.metas.receitaMensal }),
        resultadoMensal: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: st.metas.resultadoMensal }),
        margemMinPct: el('input', { type: 'number', step: '0.1', class: 'input', value: st.metas.margemMinPct }),
        inadimplenciaMaxPct: el('input', { type: 'number', step: '0.1', class: 'input', value: st.metas.inadimplenciaMaxPct })
      };
      v.appendChild(el('div', { class: 'card' }, [
        el('h3', { class: 'font-semibold mb-3' }, 'Definir metas'),
        el('div', { class: 'grid grid-cols-2 gap-3' }, [
          field('Meta de receita mensal (R$)', inp.receitaMensal),
          field('Meta de resultado mensal (R$)', inp.resultadoMensal),
          field('Margem mínima (%)', inp.margemMinPct),
          field('Inadimplência máxima (%)', inp.inadimplenciaMaxPct)
        ]),
        el('div', { class: 'mt-3' }, el('button', { class: 'btn btn-p', onclick: () => {
          DB.set(s => {
            s.metas.receitaMensal = +inp.receitaMensal.value || 0;
            s.metas.resultadoMensal = +inp.resultadoMensal.value || 0;
            s.metas.margemMinPct = +inp.margemMinPct.value || 0;
            s.metas.inadimplenciaMaxPct = +inp.inadimplenciaMaxPct.value || 0;
          });
          DB.log('metas-atualizadas', 'novo conjunto de metas');
          alert('Metas atualizadas.');
        } }, 'Salvar metas'))
      ]));
    }
  }

  // ================= CALENDÁRIO =================
  let calMes = null;
  let calDiaSel = null; // ISO 'YYYY-MM-DD' quando o usuario clica num dia. null = calendario mensal.
  function calendario(st) {
    // Se o usuario clicou num dia, renderiza a tela de detalhe.
    if (calDiaSel) { return calendarioDia(st, calDiaSel); }

    const v = document.getElementById('view'); v.innerHTML = '';
    const hoje = new Date();
    const ano = calMes ? calMes.ano : hoje.getFullYear();
    const mes = calMes ? calMes.mes : (hoje.getMonth() + 1);
    calMes = { ano, mes };

    // ----- Selectors de ano/mes + navegacao + Hoje -----
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const anoAtual = hoje.getFullYear();
    const anosDisp = []; for (let y = anoAtual - 2; y <= anoAtual + 5; y++) anosDisp.push(y);
    const selMes = el('select', { class: 'select', onchange: (e) => { calMes = { ano, mes: +e.target.value }; calendario(DB.get()); } },
      meses.map((m, i) => el('option', { value: String(i + 1) }, m)));
    selMes.value = String(mes);
    const selAno = el('select', { class: 'select', onchange: (e) => { calMes = { ano: +e.target.value, mes }; calendario(DB.get()); } },
      anosDisp.map(y => el('option', { value: String(y) }, String(y))));
    selAno.value = String(ano);

    const nav = el('div', { class: 'flex gap-2 items-center flex-wrap' }, [
      el('button', { class: 'btn btn-s', title: 'Mes anterior', onclick: () => { const d = new Date(ano, mes - 2, 1); calMes = { ano: d.getFullYear(), mes: d.getMonth() + 1 }; calendario(DB.get()); } }, '◀'),
      el('div', { class: 'flex gap-2 items-center' }, [
        el('label', { class: 'text-sm text-slate-600' }, 'Mês'), selMes,
        el('label', { class: 'text-sm text-slate-600 ml-2' }, 'Ano'), selAno
      ]),
      el('button', { class: 'btn btn-s', title: 'Proximo mes', onclick: () => { const d = new Date(ano, mes, 1); calMes = { ano: d.getFullYear(), mes: d.getMonth() + 1 }; calendario(DB.get()); } }, '▶'),
      el('button', { class: 'btn btn-s ml-auto', onclick: () => { calMes = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }; calendario(DB.get()); } }, 'Hoje')
    ]);
    v.appendChild(nav);

    // ----- Coleta totais por dia (sem listar itens individuais) -----
    const pref = `${ano}-${String(mes).padStart(2, '0')}`;
    const totaisPorDia = {}; // iso -> { receber, pagar, qtdR, qtdP }
    let totalR = 0, totalP = 0;
    (st.titulosReceber || [])
      .filter(t => t.status !== 'pago' && t.status !== 'cancelado' && t.vencimento && t.vencimento.startsWith(pref))
      .forEach(t => {
        const valor = (+t.valor) - (+t.valorRecebido || 0);
        if (valor <= 0) return;
        const k = t.vencimento;
        totaisPorDia[k] = totaisPorDia[k] || { receber: 0, pagar: 0, qtdR: 0, qtdP: 0 };
        totaisPorDia[k].receber += valor;
        totaisPorDia[k].qtdR += 1;
        totalR += valor;
      });
    (st.titulosPagar || [])
      .filter(t => !t.pago && !t.cancelado && t.vencimento && t.vencimento.startsWith(pref))
      .forEach(t => {
        const valor = +t.valor;
        if (valor <= 0) return;
        const k = t.vencimento;
        totaisPorDia[k] = totaisPorDia[k] || { receber: 0, pagar: 0, qtdR: 0, qtdP: 0 };
        totaisPorDia[k].pagar += valor;
        totaisPorDia[k].qtdP += 1;
        totalP += valor;
      });

    v.appendChild(el('div', { class: 'text-sm text-slate-600 mt-2' },
      `A receber no mês: ${BRL(totalR)} · A pagar no mês: ${BRL(totalP)} · Líquido: ${BRL(totalR - totalP)} · Clique em um dia para ver os títulos.`));

    const primeiro = new Date(ano, mes - 1, 1);
    const diasMes = new Date(ano, mes, 0).getDate();
    const offset = primeiro.getDay(); // 0=dom
    const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const grid = el('div', { class: 'card p-3 mt-2' });
    const header = el('div', { class: 'grid grid-cols-7 gap-2 mb-2' },
      nomesDias.map(n => el('div', { class: 'text-base font-bold text-slate-700 text-center' }, n)));
    grid.appendChild(header);
    const cells = el('div', { class: 'grid grid-cols-7 gap-2' });
    for (let i = 0; i < offset; i++) cells.appendChild(el('div', { class: 'min-h-24' }, ''));
    for (let d = 1; d <= diasMes; d++) {
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const tot = totaisPorDia[iso];
      const isHoje = iso === KPI.today();
      const temItem = !!tot && (tot.receber > 0 || tot.pagar > 0);
      const borda = isHoje ? 'border-blue-500 border-2' : 'border-slate-200';
      const cursor = temItem ? 'cursor-pointer hover:bg-slate-50' : '';
      const cell = el('div', {
        class: `min-h-24 border ${borda} rounded p-2 text-sm flex flex-col ${cursor}`,
        title: temItem ? 'Clique para ver os títulos do dia' : '',
        onclick: temItem ? () => { calDiaSel = iso; calendario(DB.get()); } : null
      }, [
        el('div', { class: 'font-bold text-base mb-1 ' + (isHoje ? 'text-blue-600' : 'text-slate-800') }, String(d)),
        tot ? el('div', { class: 'space-y-0.5' }, [
          tot.receber > 0 ? el('div', { class: 'text-green-700 font-bold truncate', title: tot.qtdR + ' título(s) a receber' }, '+ ' + BRL(tot.receber)) : null,
          tot.pagar > 0 ? el('div', { class: 'text-red-700 font-bold truncate', title: tot.qtdP + ' título(s) a pagar' }, '− ' + BRL(tot.pagar)) : null
        ].filter(Boolean)) : null
      ]);
      cells.appendChild(cell);
    }
    grid.appendChild(cells);
    v.appendChild(grid);

    v.appendChild(el('div', { class: 'text-xs text-slate-500 mt-2 flex gap-4 flex-wrap' }, [
      el('span', {}, [el('span', { class: 'inline-block w-3 h-3 align-middle rounded-sm mr-1', style: 'background:#16a34a' }), ' Receber']),
      el('span', {}, [el('span', { class: 'inline-block w-3 h-3 align-middle rounded-sm mr-1', style: 'background:#dc2626' }), ' Pagar']),
      el('span', {}, 'Clique em um dia para abrir o detalhamento.')
    ]));
  }

  // ----- Tela de detalhe diario (planilha de titulos do dia) -----
  function calendarioDia(st, iso) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cm = clientesMap(st);
    const fm = fornecedoresMap(st);
    const contasMap = Object.fromEntries((st.contas || []).map(c => [c.id, c.nome]));

    const itensReceber = (st.titulosReceber || [])
      .filter(t => t.status !== 'pago' && t.status !== 'cancelado' && t.vencimento === iso)
      .map(t => ({
        tipo: 'r',
        contraparte: cm[t.clienteId]?.nome || '—',
        documento: t.documento || '—',
        categoria: t.categoria || '—',
        contaId: t.contaId,
        valor: (+t.valor) - (+t.valorRecebido || 0),
        raw: t
      }));
    const itensPagar = (st.titulosPagar || [])
      .filter(t => !t.pago && !t.cancelado && t.vencimento === iso)
      .map(t => ({
        tipo: 'p',
        contraparte: fm[t.fornecedorId]?.nome || '—',
        documento: t.documento || '—',
        categoria: t.categoria || '—',
        contaId: t.contaId,
        valor: +t.valor,
        raw: t
      }));

    const itens = [...itensReceber, ...itensPagar];
    const totalR = itensReceber.reduce((s, i) => s + i.valor, 0);
    const totalP = itensPagar.reduce((s, i) => s + i.valor, 0);
    const dataBR = (function() { try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); } catch { return iso; } })();

    // Cabecalho com botao Voltar
    v.appendChild(el('div', { class: 'flex justify-between items-center flex-wrap gap-2' }, [
      el('div', {}, [
        el('button', { class: 'btn btn-s', onclick: () => { calDiaSel = null; calendario(DB.get()); } }, '◀ Voltar ao calendário'),
        el('span', { class: 'ml-3 text-base font-semibold' }, 'Detalhamento de ' + dataBR)
      ]),
      el('div', { class: 'text-sm text-slate-600' }, `A receber: ${BRL(totalR)} · A pagar: ${BRL(totalP)} · Líquido: ${BRL(totalR - totalP)}`)
    ]));

    if (!itens.length) {
      v.appendChild(el('div', { class: 'card p-6 text-center text-slate-500 mt-2' }, 'Nenhum título com vencimento neste dia.'));
      return;
    }

    // Tabela tipo planilha
    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      'Tipo', 'Contraparte', 'Documento', 'Categoria', 'Conta corrente', 'Valor'
    ].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    // Receber primeiro (verde), depois pagar (vermelho)
    const ordenados = [...itensReceber.sort((a, b) => b.valor - a.valor), ...itensPagar.sort((a, b) => b.valor - a.valor)];
    ordenados.forEach(i => {
      const corLinha = i.tipo === 'r' ? 'text-green-700' : 'text-red-700';
      const sinal = i.tipo === 'r' ? '+ ' : '− ';
      tbody.appendChild(el('tr', {}, [
        el('td', { class: corLinha + ' font-semibold' }, i.tipo === 'r' ? 'A receber' : 'A pagar'),
        el('td', { class: corLinha }, sinal + i.contraparte),
        el('td', {}, i.documento),
        el('td', {}, i.categoria),
        el('td', {}, contasMap[i.contaId] || '—'),
        el('td', { class: corLinha + ' font-semibold text-right' }, BRL(i.valor))
      ]));
    });
    // Linha de totais
    tbody.appendChild(el('tr', { class: 'bg-slate-100 font-bold' }, [
      el('td', { colspan: 5, class: 'text-right' }, 'Líquido do dia'),
      el('td', { class: (totalR - totalP) >= 0 ? 'text-green-700 text-right' : 'text-red-700 text-right' }, BRL(totalR - totalP))
    ]));
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden mt-2' }, tbl));
  }

    // ================= RECORRÊNCIAS =================
  function recorrencias(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const fm = fornecedoresMap(st);
    const cm = clientesMap(st);
    const contasMap = Object.fromEntries((st.contas || []).map(c => [c.id, c.nome]));
    const ativas = (st.recorrencias || []).filter(r => r.ativa);
    v.appendChild(el('div', { class: 'flex justify-between items-center' }, [
      el('div', { class: 'text-sm text-slate-600' }, `${ativas.length} recorrência(s) ativa(s) · gerando títulos automaticamente nos próximos 60 dias`),
      can('editar') ? el('button', { class: 'btn btn-p', onclick: () => openRecorrencia(st) }, '+ Nova recorrência') : null
    ].filter(Boolean)));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      'Tipo', 'Contraparte', 'Categoria', 'Centro de custo', 'Conta corrente', 'Valor', 'Dia', 'Início', 'Fim', 'Próxima', 'Status', 'Ações'
    ].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    const list = st.recorrencias || [];
    if (!list.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 12, class: 'text-center py-6 text-slate-500' }, 'Nenhuma recorrência cadastrada. Marque a caixa "Conta recorrente" ao criar um título a pagar para gerar uma.')));
    list.forEach(r => {
      const contraparte = r.tipo === 'pagar' ? (fm[r.contraparteId]?.nome || '—')
                         : r.tipo === 'receber' ? (cm[r.contraparteId]?.nome || '—')
                         : (r.descricao || '—');
      const dia = r.proxima ? r.proxima.slice(8, 10) : (r.dataInicio ? r.dataInicio.slice(8, 10) : '—');
      tbody.appendChild(el('tr', {}, [
        el('td', {}, badge(r.tipo, r.tipo === 'receber' ? 'v' : r.tipo === 'pagar' ? 'r' : 'g')),
        el('td', {}, contraparte),
        el('td', {}, r.categoria || '—'),
        el('td', {}, r.centroCusto || '—'),
        el('td', {}, contasMap[r.contaId] || '—'),
        el('td', {}, BRL(r.valor)),
        el('td', {}, dia),
        el('td', {}, r.dataInicio ? fmtDate(r.dataInicio) : '—'),
        el('td', {}, r.dataFim ? fmtDate(r.dataFim) : 'indefinido'),
        el('td', {}, r.proxima ? fmtDate(r.proxima) : '—'),
        el('td', {}, r.ativa ? badge('ativa', 'v') : badge('encerrada', 'g')),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          can('editar') && r.ativa ? el('button', { class: 'btn btn-s', onclick: () => openRecorrencia(st, r) }, 'Editar') : null,
          can('editar') && r.ativa ? el('button', { class: 'btn btn-d', onclick: () => UI.pedirMotivo({ titulo: 'Encerrar recorrência' }, (motivo) => {
            DB.set(s => {
              const x = s.recorrencias.find(i => i.id === r.id);
              if (x) { x.ativa = false; x.encerradoEm = new Date().toISOString(); x.motivoEncerramento = motivo; }
            });
            UI.toast('Recorrência encerrada. Títulos já gerados foram preservados.', 'v');
          }) }, 'Encerrar') : null,
          // Exclusao fisica da regra. Titulos ja gerados em Contas a Pagar/Receber sao preservados.
          can('editar') ? el('button', {
            class: 'btn btn-d',
            title: 'Excluir recorrência',
            onclick: () => {
              const titulosVinculados = ((st.titulosPagar || []).concat(st.titulosReceber || [])).filter(t => t.recorrenciaId === r.id).length;
              const aviso = titulosVinculados > 0
                ? `Excluir esta recorrência?\n\n${titulosVinculados} título(s) já gerado(s) ficarão preservados em Contas a pagar/receber. Apenas a regra será removida — não geraremos mais títulos automaticamente.`
                : 'Excluir esta recorrência?\n\nNenhum título foi gerado ainda por esta regra. Esta ação remove a regra permanentemente.';
              UI.confirmar(aviso, () => {
                DB.set(s => { s.recorrencias = (s.recorrencias || []).filter(i => i.id !== r.id); });
                UI.toast('Recorrência excluída.', 'v');
              });
            }
          }, '×') : null
        ].filter(Boolean)))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  function openRecorrencia(st, r = null) {
    // Edicao de recorrencia (criada via checkbox em Contas a Pagar OU criada manualmente aqui).
    const data = r || {
      tipo: 'pagar', descricao: '', contraparteId: '',
      documento: '', numeroPedido: '', centroCusto: '', contaId: '',
      valor: 0, categoria: '', frequencia: 'mensal',
      proxima: today(), dataInicio: today(), dataFim: null,
      ativa: true, prioridade: 'obrigatorio', observacao: '', tipoMov: 'saida'
    };
    const body = el('div');
    const contasAtivas = (st.contas || []).filter(c => c.ativa !== false);
    const acFornecedor = UI.autocomplete({
      items: st.fornecedores || [],
      getLabel: f => f.nome,
      getMeta: f => [f.documento, f.cidade].filter(Boolean).join(' · '),
      getSearch: f => `${f.nome} ${f.razaoSocial || ''} ${f.documento || ''} ${f.cidade || ''}`,
      placeholder: 'Buscar fornecedor por nome ou CNPJ...',
      initialId: data.contraparteId
    });
    const inp = {
      documento: el('input', { class: 'input', value: data.documento || '', placeholder: 'Numero da NF' }),
      numeroPedido: el('input', { class: 'input', value: data.numeroPedido || '', placeholder: 'Numero do pedido' }),
      centroCusto: el('input', { class: 'input', value: data.centroCusto || '', placeholder: 'Ex.: Engenharia' }),
      contaId: el('select', { class: 'select' }, [
        el('option', { value: '' }, '— selecionar conta —'),
        ...contasAtivas.map(c => el('option', { value: c.id }, c.nome + (c.tipo ? ` (${c.tipo})` : '')))
      ]),
      valor: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: fmtVal(data.valor) }),
      categoria: el('select', { class: 'select' }, ((st.categorias && st.categorias.saida) || ['Outros']).map(c => el('option', { value: c }, c))),
      proxima: el('input', { type: 'date', class: 'input', value: data.proxima || today() }),
      dataFim: el('input', { type: 'date', class: 'input', value: data.dataFim || '' }),
      observacao: el('textarea', { class: 'input', rows: 2 }, data.observacao || '')
    };
    inp.contaId.value = data.contaId || '';
    inp.categoria.value = data.categoria || ((st.categorias && st.categorias.saida && st.categorias.saida[0]) || 'Outros');
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Fornecedor', acFornecedor.element), field('Conta corrente', inp.contaId),
      field('Numero da NF', inp.documento), field('Numero do pedido', inp.numeroPedido),
      field('Centro de custo', inp.centroCusto), field('Categoria', inp.categoria),
      field('Próxima ocorrência', inp.proxima), field('Recorrência até (vazio = indefinido)', inp.dataFim),
      field('Valor (R$)', inp.valor)
    ]));
    body.appendChild(field('Observação', inp.observacao));
    if (r) {
      body.appendChild(el('div', { class: 'mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900' },
        'Mudanças no valor afetam apenas títulos futuros. Títulos já gerados continuam com o valor antigo.'));
    }
    modal(r ? 'Editar recorrência' : 'Nova recorrência', body, () => {
      if (!acFornecedor.value) { UI.toast('Selecione um fornecedor.', 'r'); acFornecedor.focus(); return false; }
      const vValor = Validators.valor(inp.valor.value);
      if (!vValor.ok) { UI.toast(vValor.erro, 'r'); inp.valor.classList.add('input-erro'); return false; }
      const dataFim = inp.dataFim.value || null;
      if (dataFim && dataFim < inp.proxima.value) { UI.toast('Recorrência até precisa ser maior que a próxima ocorrência.', 'r'); return false; }
      const fornecedorNome = (st.fornecedores.find(f => f.id === acFornecedor.value) || {}).nome || 'Fornecedor';
      const payload = {
        id: r?.id || DB.id(),
        tipo: 'pagar',
        contraparteId: acFornecedor.value,
        descricao: 'Recorrência — ' + fornecedorNome + (inp.documento.value ? ' (' + inp.documento.value + ')' : ''),
        documento: inp.documento.value,
        numeroPedido: inp.numeroPedido.value,
        centroCusto: inp.centroCusto.value,
        contaId: inp.contaId.value,
        observacao: inp.observacao.value,
        valor: vValor.value,
        categoria: inp.categoria.value,
        prioridade: data.prioridade || 'obrigatorio',
        frequencia: 'mensal',
        proxima: inp.proxima.value,
        dataInicio: data.dataInicio || inp.proxima.value,
        dataFim: dataFim,
        ativa: r ? (data.ativa !== false) : true,
        criadoEm: data.criadoEm || new Date().toISOString()
      };
      DB.set(s => {
        s.recorrencias = s.recorrencias || [];
        if (r) s.recorrencias = s.recorrencias.map(x => x.id === r.id ? payload : x);
        else s.recorrencias.push(payload);
      });
      // Materializa imediatamente apos salvar (gera/atualiza titulos da regra)
      if (window.App && window.App.materializarRecorrencias) { window.App.materializarRecorrencias(); }
      UI.toast(r ? 'Recorrência atualizada.' : 'Recorrência criada.', 'v');
    });
  }

  // ================= CONTAS =================
  function contas(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const saldos = KPI.saldoPorConta(st);
    const total = saldos.reduce((s, c) => s + c.saldo, 0);

    v.appendChild(el('div', { class: 'flex justify-between items-center flex-wrap gap-2' }, [
      el('div', { class: 'text-sm text-slate-600' }, `Saldo total consolidado: ${BRL(total)}`),
      el('div', { class: 'flex gap-2' }, [
        can('baixar') ? el('button', { class: 'btn btn-s', onclick: () => openTransferencia(st) }, '⇄ Transferir') : null,
        can('editar') ? el('button', { class: 'btn btn-p', onclick: () => openConta(st) }, '+ Nova conta') : null
      ].filter(Boolean))
    ]));

    v.appendChild(el('div', { class: 'grid-kpi' }, saldos.map(c => kpi(c.nome, BRL(c.saldo), c.saldo < 0 ? 'r' : 'v', c.tipo))));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Nome', 'Tipo', 'Saldo inicial', 'Saldo atual', 'Status', 'Ações'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    const fmtBanco = (c) => {
      const partes = [];
      if (c.banco) partes.push(c.banco);
      if (c.agencia) partes.push('Ag ' + c.agencia);
      if (c.conta) partes.push('Cc ' + c.conta);
      return partes.join(' · ');
    };
    (st.contas || []).forEach(c => {
      const saldo = KPI.saldoRealizado(st, c.id);
      const linhaBanco = fmtBanco(c);
      tbody.appendChild(el('tr', {}, [
        el('td', {}, linhaBanco
          ? el('div', {}, [
              el('div', { class: 'font-medium' }, c.nome),
              el('div', { class: 'text-xs text-slate-500' }, linhaBanco)
            ])
          : c.nome),
        el('td', {}, c.tipo),
        el('td', {}, BRL(c.saldoInicial)),
        el('td', { class: 'font-medium' }, BRL(saldo)),
        el('td', {}, c.ativa !== false ? badge('ativa', 'v') : badge('inativa', 'g')),
        el('td', {}, el('div', { class: 'flex gap-1' }, [
          can('editar') ? el('button', { class: 'btn btn-s', onclick: () => openConta(st, c) }, 'Editar') : null,
          (can('editar') && c.id !== 'principal') ? el('button', { class: 'btn btn-d', onclick: () => confirmar('Excluir conta? Movimentos existentes mantêm o vínculo.', () => DB.set(s => { s.contas = s.contas.filter(x => x.id !== c.id); })) }, '×') : null
        ].filter(Boolean)))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  function openConta(st, c = null) {
    const data = c || { nome: '', tipo: 'banco', saldoInicial: 0, ativa: true, banco: '', agencia: '', conta: '' };
    const body = el('div');
    const inp = {
      nome: el('input', { class: 'input', value: data.nome }),
      tipo: el('select', { class: 'select' }, [el('option', { value: 'caixa' }, 'Caixa físico'), el('option', { value: 'banco' }, 'Conta bancária'), el('option', { value: 'poupanca' }, 'Poupança/Investimento'), el('option', { value: 'cartao' }, 'Cartão/Gateway')]),
      saldoInicial: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.saldoInicial }),
      ativa: el('select', { class: 'select' }, [el('option', { value: '1' }, 'Ativa'), el('option', { value: '0' }, 'Inativa')]),
      banco: el('input', { class: 'input', value: data.banco || '', placeholder: 'Ex.: Itaú, Bradesco, BB' }),
      agencia: el('input', { class: 'input', value: data.agencia || '', placeholder: 'Ex.: 0123' }),
      conta: el('input', { class: 'input', value: data.conta || '', placeholder: 'Ex.: 12345-6' })
    };
    inp.tipo.value = data.tipo;
    inp.ativa.value = data.ativa !== false ? '1' : '0';

    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Nome', inp.nome), field('Tipo', inp.tipo),
      field('Saldo inicial (R$)', inp.saldoInicial), field('Status', inp.ativa)
    ]));

    // Bloco bancário (some quando tipo = caixa físico)
    const bancarioWrap = el('div', { class: 'mt-4 pt-4 border-t border-slate-200 dark:border-slate-700' }, [
      el('div', { class: 'text-xs uppercase tracking-wide text-slate-500 mb-2 font-semibold' }, 'Dados bancários (opcional)'),
      el('div', { class: 'grid grid-cols-3 gap-3' }, [
        field('Banco', inp.banco),
        field('Agência', inp.agencia),
        field('Conta', inp.conta)
      ])
    ]);
    body.appendChild(bancarioWrap);

    const toggleBancario = () => { bancarioWrap.style.display = (inp.tipo.value === 'caixa') ? 'none' : ''; };
    inp.tipo.addEventListener('change', toggleBancario);
    toggleBancario();

    modal(c ? 'Editar conta' : 'Nova conta', body, () => {
      if (!inp.nome.value.trim()) { alert('Nome obrigatório.'); return false; }
      const isCaixa = inp.tipo.value === 'caixa';
      const payload = {
        id: c?.id || DB.id(),
        nome: inp.nome.value.trim(),
        tipo: inp.tipo.value,
        saldoInicial: +inp.saldoInicial.value || 0,
        ativa: inp.ativa.value === '1',
        banco: isCaixa ? '' : inp.banco.value.trim(),
        agencia: isCaixa ? '' : inp.agencia.value.trim(),
        conta: isCaixa ? '' : inp.conta.value.trim()
      };
      DB.set(s => { if (c) s.contas = s.contas.map(x => x.id === c.id ? payload : x); else s.contas.push(payload); });
    });
  }

  // ================= ANÁLISE ABC =================
  function abc(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cli = KPI.abcClientes(st);
    const prd = KPI.abcProdutos(st);
    const color = k => k === 'A' ? 'v' : k === 'B' ? 'a' : 'r';

    const contagem = list => ({
      A: list.filter(x => x.classe === 'A').length,
      B: list.filter(x => x.classe === 'B').length,
      C: list.filter(x => x.classe === 'C').length
    });

    const bloco = (titulo, list, col, nomeCol) => {
      const c = contagem(list);
      const wrap = el('div', { class: 'card' }, [
        el('h3', { class: 'font-semibold mb-3' }, titulo),
        list.length === 0 ? el('div', { class: 'text-slate-500' }, 'Sem dados.') :
          el('div', {}, [
            el('div', { class: 'flex gap-2 mb-3 text-xs' }, [
              badge(`A: ${c.A} (concentra 80%)`, 'v'),
              badge(`B: ${c.B}`, 'a'),
              badge(`C: ${c.C}`, 'r')
            ]),
            (() => {
              const tbl = el('table', {});
              tbl.appendChild(el('thead', {}, el('tr', {}, ['#', nomeCol, col, '%', '% acum.', 'Classe'].map(h => el('th', {}, h)))));
              const tbody = el('tbody');
              list.forEach((x, i) => tbody.appendChild(el('tr', {}, [
                el('td', {}, String(i + 1)),
                el('td', {}, x.nome),
                el('td', {}, BRL(x.total)),
                el('td', {}, x.pct.toFixed(1) + '%'),
                el('td', {}, x.acumPct.toFixed(1) + '%'),
                el('td', {}, badge(x.classe, color(x.classe)))
              ])));
              tbl.appendChild(tbody);
              return tbl;
            })()
          ])
      ]);
      return wrap;
    };

    v.appendChild(bloco('ABC de clientes (por recebíveis)', cli, 'Total em títulos', 'Cliente'));
    v.appendChild(bloco('ABC de produtos (por receita projetada)', prd, 'Receita estimada', 'Produto'));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-2' }, 'Como usar'),
      el('ul', { class: 'text-sm text-slate-600 list-disc pl-5 space-y-1' }, [
        el('li', {}, 'Classe A: poucos itens que concentram ~80% — priorize retenção e atendimento premium.'),
        el('li', {}, 'Classe B: faixa intermediária — potencial de crescimento.'),
        el('li', {}, 'Classe C: muitos itens com pouca representatividade — considere consolidar ou racionalizar.')
      ])
    ]));
  }

  // ================= SIMULADOR DE PONTO DE EQUILÍBRIO =================
  function simulador(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const base = KPI.margemContribuicao(st);
    const cf = KPI.custoFixoMensal(st);
    const state = { receita: base.receita || 50000, mcPct: base.mcPct || 35, cf: cf || 15000 };

    const recalc = () => {
      const mc = state.receita * state.mcPct / 100;
      const resultado = mc - state.cf;
      const pe = state.mcPct > 0 ? state.cf / (state.mcPct / 100) : null;
      const margSeg = pe ? (state.receita - pe) / state.receita * 100 : null;
      return { mc, resultado, pe, margSeg };
    };

    const inpR = el('input', { type: 'range', min: 0, max: 500000, step: 1000, value: state.receita, class: 'w-full' });
    const inpM = el('input', { type: 'range', min: 0, max: 80, step: 0.5, value: state.mcPct, class: 'w-full' });
    const inpC = el('input', { type: 'range', min: 0, max: 200000, step: 500, value: state.cf, class: 'w-full' });
    const out = el('div', { class: 'grid-kpi mt-4' });

    const render = () => {
      const r = recalc();
      out.innerHTML = '';
      [
        kpi('Margem de contribuição', BRL(r.mc), 'v', `${state.mcPct.toFixed(1)}% × ${BRL(state.receita)}`),
        kpi('Resultado operacional', BRL(r.resultado), r.resultado < 0 ? 'r' : 'v', 'MC − custos fixos'),
        kpi('Ponto de equilíbrio', r.pe ? BRL(r.pe) : '—', (r.pe && state.receita < r.pe) ? 'r' : 'v', 'Receita mínima'),
        kpi('Margem de segurança', r.margSeg != null ? r.margSeg.toFixed(1) + '%' : '—', r.margSeg == null ? 'g' : r.margSeg < 10 ? 'r' : r.margSeg < 25 ? 'a' : 'v', 'Quanto pode cair sem dar prejuízo')
      ].forEach(n => out.appendChild(n));
    };

    const wire = (input, key, fmt) => {
      const label = el('div', { class: 'flex justify-between text-sm mb-1' }, [
        el('span', {}, key === 'receita' ? 'Receita mensal' : key === 'mcPct' ? 'Margem de contribuição (%)' : 'Custos fixos mensais'),
        el('span', { class: 'font-semibold' }, fmt(state[key]))
      ]);
      input.oninput = () => { state[key] = +input.value; label.children[1].textContent = fmt(state[key]); render(); };
      return el('div', {}, [label, input]);
    };

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Simulador interativo — arraste para testar cenários'),
      el('div', { class: 'grid md:grid-cols-3 gap-4' }, [
        wire(inpR, 'receita', BRL),
        wire(inpM, 'mcPct', v => v.toFixed(1) + '%'),
        wire(inpC, 'cf', BRL)
      ]),
      out
    ]));
    render();
  }

  // ================= IMPORT CADASTROS =================
  // ==================================================================
  // Mapeamento de aliases de cabecalho para campos do schema.
  // Aceita variacoes comuns que pessoas usam em planilhas (com/sem
  // acento, com/sem espaco, em portugues/ingles).
  // ==================================================================
  const ALIAS_COLUNAS = {
    clientes: {
      nome:         ['nome','nomefantasia','fantasia','cliente','empresa','displayname','apelido'],
      razaoSocial:  ['razaosocial','razao','razaosocialcompleta','nomeoficial','nomesocial'],
      documento:    ['documento','cnpj','cpf','cnpjcpf','doc','documentofiscal','cnpjcliente'],
      ie:           ['ie','inscricaoestadual','inscestadual','inscricaoest','iest'],
      telefone:     ['telefone','tel','fone','celular','whatsapp','telefone1','telcomercial','telefonecomercial'],
      email:        ['email','mail','correio','emailprincipal','emailcomercial'],
      contato:      ['contato','pessoadecontato','responsavel','comprador','pessoacontato'],
      cidade:       ['cidade','municipio','localidade'],
      estado:       ['estado','uf','unidadefederativa'],
      endereco:     ['endereco','logradouro','rua','enderecocompleto','enderecologradouro'],
      bairro:       ['bairro'],
      cep:          ['cep','codigopostal'],
      banco:        ['banco'],
      agencia:      ['agencia','ag'],
      conta:        ['conta','contacorrente','cc'],
      limite:       ['limite','limitecredito','limitedecredito','credito'],
      prazo:        ['prazo','prazopadrao','dias','prazopagamento'],
      rating:       ['rating','classificacao','classificacaocredito','risco'],
      tipoAtividade:['tipoatividade','atividade','segmento','setor','ramo'],
      tags:         ['tags','tag','tipo','categoria','classificacaocomercial']
    },
    fornecedores: {
      nome:         ['nome','razaosocial','fantasia','fornecedor','empresa'],
      categoria:    ['categoria','tipo','segmento'],
      condicao:     ['condicao','condicaodepagamento','prazopagamento','prazo'],
      criticidade:  ['criticidade','classificacao','prioridade']
    },
    produtos: {
      nome:         ['nome','produto','descricao','servico','item'],
      preco:        ['preco','precovenda','valor','precounit','precounitario'],
      imposto:      ['imposto','impostos','aliquota','tributacao'],
      custoVariavel:['custovariavel','custo','custounit','custounitario'],
      comissao:     ['comissao','comissaopct','comissaopercentual'],
      volume:       ['volume','volumemensal','quantidademensal','qtd','quantidade']
    }
  };

  // Mapeia uma linha bruta {chaveCSV: valor} para um objeto com chaves do schema.
  function _mapearLinhaImport(rawRow, tipo) {
    const aliases = ALIAS_COLUNAS[tipo] || {};
    const out = {};
    Object.entries(rawRow).forEach(([chaveCSV, valor]) => {
      const norm = Reports.normHeader(chaveCSV);
      for (const [campoSchema, listaAliases] of Object.entries(aliases)) {
        if (listaAliases.includes(norm)) {
          out[campoSchema] = String(valor || '').trim();
          break;
        }
      }
    });
    return out;
  }

  function openImportCadastros(st, tipo) {
    const body = el('div');
    const fileIn = el('input', { type: 'file', accept: '.csv,.tsv,.txt', class: 'input' });
    const info = {
      clientes: 'Colunas aceitas: nome (obrig.), razao social, cnpj/cpf, ie, telefone, email, contato, cidade, uf, endereco, bairro, cep, banco, agencia, conta, limite, prazo, rating, segmento, tipo. Separador detectado automaticamente: ; , TAB.',
      fornecedores: 'Colunas aceitas: nome (obrig.), categoria, condicao, criticidade. Separador detectado automaticamente.',
      produtos: 'Colunas aceitas: nome (obrig.), preco, imposto, custo variavel, comissao, volume. Separador detectado automaticamente.'
    }[tipo];
    let rows = [];
    let mapeadas = [];
    const preview = el('div', { class: 'text-xs mt-3' });
    fileIn.onchange = () => {
      const f = fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        rows = Reports.parseCSV(r.result);
        mapeadas = rows.map(row => _mapearLinhaImport(row, tipo));
        const validas = mapeadas.filter(m => m.nome && m.nome.trim());
        const colunasDetectadas = rows.length ? Object.keys(rows[0]).join(', ') : '(nenhuma)';
        preview.innerHTML = '';
        preview.appendChild(UI.el('div', {}, `Linhas lidas: ${rows.length}. Linhas com 'nome' mapeado: ${validas.length}.`));
        preview.appendChild(UI.el('div', { class: 'mt-1 text-slate-500' }, `Colunas detectadas no arquivo: ${colunasDetectadas}`));
        if (validas.length === 0 && rows.length > 0) {
          preview.appendChild(UI.el('div', { class: 'mt-2 text-red-700 font-medium' },
            'AVISO: nenhuma linha com nome valido. Confira se o arquivo tem cabecalho com pelo menos a coluna "nome" (ou variacoes como "Razao Social", "Cliente", "Empresa").'
          ));
        }
      };
      r.readAsText(f, 'utf-8');
    };
    body.appendChild(field('Arquivo CSV/TSV', fileIn));
    body.appendChild(el('div', { class: 'text-xs text-slate-500' }, info));
    body.appendChild(preview);
    modal(`Importar ${tipo}`, body, () => {
      if (!rows.length) { alert('Selecione um arquivo.'); return false; }
      const validas = mapeadas.filter(m => m.nome && m.nome.trim());
      if (!validas.length) { alert('Nenhuma linha com nome valido. Adicione cabecalho com "nome" (ou alias) e tente novamente.'); return false; }
      // Helper: normaliza documento para comparacao (so digitos).
      const normDoc = (d) => String(d || '').replace(/\D/g, '');
      let n = 0;
      let puladosDup = 0;       // duplicidade detectada (CNPJ ja existe)
      let puladosSemDoc = 0;    // futuro uso - manter contador para mensagem
      const detalhesDup = [];   // lista dos nomes pulados, para o relatorio
      DB.set(s => {
        // Conjunto de documentos JA cadastrados (para barrar duplicata com banco).
        // Para clientes/fornecedores: comparacao por documento normalizado.
        const arrayAlvo = tipo === 'clientes' ? (s.clientes || []) : tipo === 'fornecedores' ? (s.fornecedores || []) : null;
        const docsExistentes = new Set();
        if (arrayAlvo) {
          arrayAlvo.forEach(x => { const d = normDoc(x.documento); if (d) docsExistentes.add(d); });
        }
        validas.forEach(r => {
          if (tipo === 'clientes') {
            const docNovo = normDoc(r.documento);
            if (docNovo && docsExistentes.has(docNovo)) {
              puladosDup++;
              detalhesDup.push(r.nome);
              return; // pula esta linha
            }
            s.clientes.push({
              id: DB.id(),
              nome: r.nome,
              razaoSocial: r.razaoSocial || '',
              documento: r.documento || '',
              ie: r.ie || '',
              telefone: r.telefone || '',
              email: r.email || '',
              contato: r.contato || '',
              cidade: r.cidade || '',
              estado: (r.estado || '').toUpperCase().slice(0, 2),
              endereco: r.endereco || '',
              bairro: r.bairro || '',
              cep: r.cep || '',
              banco: r.banco || '',
              agencia: r.agencia || '',
              conta: r.conta || '',
              limite: Reports.parseNum(r.limite),
              prazo: +(r.prazo || '').replace(/\D/g, '') || 30,
              rating: r.rating || 'bom',
              tipoAtividade: r.tipoAtividade || '',
              tags: r.tags || ''
            });
            // Adiciona ao set para barrar duplicatas DENTRO do proprio CSV
            if (docNovo) docsExistentes.add(docNovo);
            n++;
          } else if (tipo === 'fornecedores') {
            const docNovo = normDoc(r.documento);
            if (docNovo && docsExistentes.has(docNovo)) {
              puladosDup++;
              detalhesDup.push(r.nome);
              return;
            }
            s.fornecedores.push({
              id: DB.id(),
              nome: r.nome,
              documento: r.documento || '',
              categoria: r.categoria || '',
              condicao: r.condicao || '',
              criticidade: r.criticidade || 'normal'
            });
            if (docNovo) docsExistentes.add(docNovo);
            n++;
          } else if (tipo === 'produtos') {
            s.produtos.push({
              id: DB.id(),
              nome: r.nome,
              preco: Reports.parseNum(r.preco),
              imposto: Reports.parseNum(r.imposto),
              custoVariavel: Reports.parseNum(r.custoVariavel),
              comissao: Reports.parseNum(r.comissao),
              volume: +(r.volume || '').replace(/\D/g, '') || 0
            });
            n++;
          }
        });
      });
      DB.log('import-cadastro', `${n} ${tipo} importados, ${puladosDup} pulados por duplicidade`);
      let msg = `${n} registros importados.`;
      if (puladosDup > 0) {
        const exemplos = detalhesDup.slice(0, 5).join(', ') + (detalhesDup.length > 5 ? ', ...' : '');
        msg += `\n\n${puladosDup} linhas foram puladas por duplicidade de CNPJ/CPF (ja existe cliente com mesmo documento):\n${exemplos}`;
      }
      alert(msg);
    });
  }

  // ================= TRANSFERÊNCIA ENTRE CONTAS =================
  function openTransferencia(st) {
    const ativas = (st.contas || []).filter(c => c.ativa !== false);
    if (ativas.length < 2) { alert('Cadastre ao menos duas contas ativas.'); return; }
    const body = el('div');
    const inp = {
      origem: el('select', { class: 'select' }, ativas.map(c => el('option', { value: c.id }, c.nome))),
      destino: el('select', { class: 'select' }, ativas.map(c => el('option', { value: c.id }, c.nome))),
      valor: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: 0 }),
      data: el('input', { type: 'date', class: 'input', value: today() }),
      descricao: el('input', { class: 'input', value: 'Transferência entre contas' })
    };
    inp.destino.value = ativas[1].id;
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Conta origem', inp.origem), field('Conta destino', inp.destino),
      field('Valor (R$)', inp.valor), field('Data', inp.data),
      field('Descrição', inp.descricao)
    ]));
    modal('Transferência entre contas', body, () => {
      const v = +inp.valor.value || 0;
      if (!v) { alert('Valor obrigatório.'); return false; }
      if (inp.origem.value === inp.destino.value) { alert('Contas devem ser diferentes.'); return false; }
      const linkId = DB.id();
      const nomeO = ativas.find(c => c.id === inp.origem.value).nome;
      const nomeD = ativas.find(c => c.id === inp.destino.value).nome;
      DB.set(s => {
        s.movimentos.push({ id: DB.id(), data: inp.data.value, descricao: `${inp.descricao.value} → ${nomeD}`, categoria: 'Transferência', tipo: 'saida', natureza: 'nop', status: 'realizado', valor: v, contaId: inp.origem.value, transferId: linkId, origem: 'transferencia' });
        s.movimentos.push({ id: DB.id(), data: inp.data.value, descricao: `${inp.descricao.value} ← ${nomeO}`, categoria: 'Transferência', tipo: 'entrada', natureza: 'nop', status: 'realizado', valor: v, contaId: inp.destino.value, transferId: linkId, origem: 'transferencia' });
      });
      DB.log('transferencia', `${BRL(v)} de ${nomeO} para ${nomeD}`);
    });
  }

  // ================= ORÇAMENTO POR CATEGORIA =================
  let orcMes = null;
  function orcamento(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const hoje = new Date();
    const ano = orcMes ? orcMes.ano : hoje.getFullYear();
    const mes = orcMes ? orcMes.mes : (hoje.getMonth() + 1);
    orcMes = { ano, mes };

    const meses = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(ano, mes - 1 - i, 1); meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }) }); }

    v.appendChild(el('div', { class: 'flex gap-2 items-center flex-wrap justify-between' }, [
      el('div', { class: 'flex gap-2 items-center flex-wrap' }, [
        el('span', { class: 'text-sm text-slate-600' }, 'Mês:'),
        ...meses.map(m => el('button', { class: 'btn ' + (m.ano === ano && m.mes === mes ? 'btn-p' : 'btn-s'), onclick: () => { orcMes = { ano: m.ano, mes: m.mes }; orcamento(DB.get()); } }, m.label))
      ]),
      el('div', { class: 'flex gap-2' }, [
        can('configurar') ? el('button', { class: 'btn btn-s', onclick: () => {
          const anterior = KPI.realizadoPorCategoria(st, mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1);
          if (!Object.keys(anterior).length) return alert('Sem realizado no mês anterior.');
          if (!confirm('Copiar realizado do mês anterior como orçamento? Valores atuais serão substituídos.')) return;
          DB.set(s => { Object.entries(anterior).forEach(([k, v]) => s.orcamento[k] = v); });
          DB.log('orcamento', 'copiado do mês anterior (realizado)');
        } }, 'Copiar realizado anterior') : null,
        can('configurar') ? el('button', { class: 'btn btn-s', onclick: () => {
          if (!confirm('Zerar todo o orçamento?')) return;
          DB.set(s => { s.orcamento = {}; });
          DB.log('orcamento', 'zerado');
        } }, 'Zerar orçamento') : null
      ].filter(Boolean))
    ]));

    const realizado = KPI.realizadoPorCategoria(st, ano, mes);
    const cats = Array.from(new Set([...(st.categorias.saida || []), ...Object.keys(realizado), ...Object.keys(st.orcamento || {})]));
    const orc = st.orcamento || {};

    const totalOrc = cats.reduce((s, c) => s + (+orc[c] || 0), 0);
    const totalReal = cats.reduce((s, c) => s + (+realizado[c] || 0), 0);
    const sevTotal = totalOrc > 0 && totalReal > totalOrc ? 'r' : totalReal > totalOrc * 0.9 ? 'a' : 'v';

    v.appendChild(el('div', { class: 'grid-kpi' }, [
      kpi('Orçamento total', BRL(totalOrc), 'g'),
      kpi('Realizado', BRL(totalReal), sevTotal),
      kpi('Diferença', BRL(totalOrc - totalReal), totalOrc - totalReal < 0 ? 'r' : 'v', 'Positivo = sob orçamento')
    ]));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Categoria', 'Orçado', 'Realizado', 'Diferença', '% utilizado', ''].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    cats.forEach(cat => {
      const o = +orc[cat] || 0;
      const r = +realizado[cat] || 0;
      const diff = o - r;
      const pct = o > 0 ? (r / o * 100) : (r > 0 ? 999 : 0);
      const sev = o === 0 && r === 0 ? 'g' : pct > 100 ? 'r' : pct > 85 ? 'a' : 'v';
      const inp = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: o, style: 'width:120px' });
      inp.onblur = () => { if (!can('configurar')) return; DB.set(s => { s.orcamento[cat] = +inp.value || 0; }); DB.log('orcamento', `${cat}: ${BRL(+inp.value || 0)}`); };
      tbody.appendChild(el('tr', {}, [
        el('td', {}, cat),
        el('td', {}, can('configurar') ? inp : BRL(o)),
        el('td', {}, BRL(r)),
        el('td', { class: diff < 0 ? 'text-red-700 font-medium' : 'text-green-700' }, BRL(diff)),
        el('td', {}, badge(o > 0 ? pct.toFixed(0) + '%' : '—', sev)),
        el('td', {}, el('div', { class: 'bg-slate-200 h-2 rounded overflow-hidden', style: 'width:140px' }, el('div', { style: `width:${Math.min(100, pct)}%;height:100%;background:${sev === 'v' ? '#16a34a' : sev === 'a' ? '#eab308' : '#dc2626'}` })))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  // ================= DFC MÉTODO DIRETO =================
  let dfcMes = null;
  function dfc(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const hoje = new Date();
    const ano = dfcMes ? dfcMes.ano : hoje.getFullYear();
    const mes = dfcMes ? dfcMes.mes : (hoje.getMonth() + 1);
    dfcMes = { ano, mes };

    const meses = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(ano, mes - 1 - i, 1); meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }) }); }
    v.appendChild(el('div', { class: 'flex gap-2 items-center flex-wrap' }, [
      el('span', { class: 'text-sm text-slate-600' }, 'Mês:'),
      ...meses.map(m => el('button', { class: 'btn ' + (m.ano === ano && m.mes === mes ? 'btn-p' : 'btn-s'), onclick: () => { dfcMes = { ano: m.ano, mes: m.mes }; dfc(DB.get()); } }, m.label))
    ]));

    const d = KPI.dfcDireto(st, ano, mes);

    const linhasBloco = (titulo, bloco, total) => {
      const rows = [el('tr', {}, el('td', { colspan: 2, class: 'font-semibold bg-slate-50' }, titulo))];
      Object.entries(bloco.entradas).forEach(([k, v]) => rows.push(el('tr', {}, [el('td', { style: 'padding-left:1.5rem' }, '(+) ' + k), el('td', { class: 'text-right text-green-700' }, BRL(v))])));
      Object.entries(bloco.saidas).forEach(([k, v]) => rows.push(el('tr', {}, [el('td', { style: 'padding-left:1.5rem' }, '(−) ' + k), el('td', { class: 'text-right text-red-700' }, BRL(-v))])));
      rows.push(el('tr', {}, [el('td', { class: 'font-semibold', style: 'padding-left:.5rem' }, 'Líquido ' + titulo.toLowerCase()), el('td', { class: 'text-right font-semibold ' + (total.liquido >= 0 ? 'text-green-700' : 'text-red-700') }, BRL(total.liquido))]));
      return rows;
    };

    const tbody = el('tbody', {}, [
      ...linhasBloco('Atividades operacionais', d.blocos.operacional, d.op),
      ...linhasBloco('Atividades de investimento (extraordinário)', d.blocos.investimento, d.iv),
      ...linhasBloco('Atividades de financiamento (não operacional)', d.blocos.financiamento, d.fi),
      el('tr', {}, [el('td', { class: 'font-bold text-lg bg-slate-100' }, 'Variação líquida do caixa no mês'), el('td', { class: 'text-right font-bold text-lg bg-slate-100 ' + (d.variacao >= 0 ? 'text-green-700' : 'text-red-700') }, BRL(d.variacao))])
    ]);

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, `DFC — Demonstração de Fluxo de Caixa (direto) · ${String(mes).padStart(2,'0')}/${ano}`),
      el('table', {}, tbody),
      el('div', { class: 'text-xs text-slate-500 mt-3' }, 'Baseado na natureza de cada lançamento: operacional (op), extraordinário = investimento (ext), não operacional = financiamento (nop).')
    ]));
  }

  // ================= SIMULADOR DE EMPRÉSTIMO =================
  function emprestimo(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const state = { principal: 50000, taxa: 2.5, prazo: 24, sistema: 'price' };

    function calcPrice(pv, i, n) {
      const r = i / 100;
      const parcela = r === 0 ? pv / n : pv * r / (1 - Math.pow(1 + r, -n));
      const linhas = []; let saldo = pv;
      for (let k = 1; k <= n; k++) {
        const juros = saldo * r;
        const amort = parcela - juros;
        saldo -= amort;
        linhas.push({ k, parcela, juros, amort, saldo: Math.max(0, saldo) });
      }
      return { parcelaFixa: parcela, linhas };
    }
    function calcSAC(pv, i, n) {
      const r = i / 100;
      const amort = pv / n;
      const linhas = []; let saldo = pv;
      for (let k = 1; k <= n; k++) {
        const juros = saldo * r;
        const parcela = amort + juros;
        saldo -= amort;
        linhas.push({ k, parcela, juros, amort, saldo: Math.max(0, saldo) });
      }
      return { linhas };
    }

    const inp = {
      principal: el('input', { type: 'number', step: '100', class: 'input', value: state.principal }),
      taxa: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: state.taxa }),
      prazo: el('input', { type: 'number', step: '1', class: 'input', value: state.prazo }),
      sistema: el('select', { class: 'select' }, [el('option', { value: 'price' }, 'Price (parcela fixa)'), el('option', { value: 'sac' }, 'SAC (amortização fixa)')])
    };
    const out = el('div');

    const render = () => {
      state.principal = +inp.principal.value || 0;
      state.taxa = +inp.taxa.value || 0;
      state.prazo = +inp.prazo.value || 1;
      state.sistema = inp.sistema.value;
      const calc = state.sistema === 'price' ? calcPrice(state.principal, state.taxa, state.prazo) : calcSAC(state.principal, state.taxa, state.prazo);
      const totalJuros = calc.linhas.reduce((s, l) => s + l.juros, 0);
      const totalPago = calc.linhas.reduce((s, l) => s + l.parcela, 0);
      const cet = state.principal > 0 ? (totalJuros / state.principal * 100) : 0;
      const saldoAtual = KPI.saldoRealizado(st);
      const impacto = calc.linhas[0]?.parcela || 0;

      out.innerHTML = '';
      out.appendChild(el('div', { class: 'grid-kpi mb-4' }, [
        kpi(state.sistema === 'price' ? 'Parcela (fixa)' : 'Primeira parcela', BRL(calc.linhas[0]?.parcela || 0), 'v'),
        kpi('Última parcela', BRL(calc.linhas[calc.linhas.length - 1]?.parcela || 0), 'v'),
        kpi('Total pago', BRL(totalPago), 'g'),
        kpi('Juros totais', BRL(totalJuros), 'r', 'CET ' + cet.toFixed(1) + '%'),
        kpi('Impacto 1ª parcela no caixa', impacto > saldoAtual * 0.3 ? BRL(impacto) + ' ⚠' : BRL(impacto), impacto > saldoAtual * 0.3 ? 'r' : impacto > saldoAtual * 0.15 ? 'a' : 'v', 'Saldo atual: ' + BRL(saldoAtual))
      ]));

      const tbl = el('table', {});
      tbl.appendChild(el('thead', {}, el('tr', {}, ['#', 'Parcela', 'Juros', 'Amortização', 'Saldo devedor'].map(h => el('th', {}, h)))));
      const tb = el('tbody');
      calc.linhas.forEach(l => tb.appendChild(el('tr', {}, [
        el('td', {}, String(l.k)),
        el('td', {}, BRL(l.parcela)),
        el('td', { class: 'text-red-700' }, BRL(l.juros)),
        el('td', { class: 'text-green-700' }, BRL(l.amort)),
        el('td', {}, BRL(l.saldo))
      ])));
      tbl.appendChild(tb);
      out.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, [el('h3', { class: 'font-semibold p-3' }, 'Tabela de amortização'), tbl]));
    };

    Object.values(inp).forEach(i => i.oninput = render);
    inp.sistema.value = state.sistema;

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Parâmetros do empréstimo'),
      el('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-3' }, [
        field('Valor (R$)', inp.principal),
        field('Taxa ao mês (%)', inp.taxa),
        field('Prazo (meses)', inp.prazo),
        field('Sistema', inp.sistema)
      ])
    ]));
    v.appendChild(out);
    render();
  }

  // ================= CONTA CORRENTE DE SÓCIOS =================
  function socios(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const movs = KPI.movimentosSocios(st);
    const proLabore = movs.filter(m => /pr[óo][\s-]?labore/i.test((m.descricao || '') + ' ' + (m.categoria || ''))).reduce((s, m) => s + (m.tipo === 'saida' ? +m.valor : 0), 0);
    const retiradas = movs.filter(m => /retirada|distribui[çc][ãa]o|sócio|socio/i.test((m.descricao || '') + ' ' + (m.categoria || '')) && !/pr[óo][\s-]?labore/i.test((m.descricao || '') + ' ' + (m.categoria || ''))).reduce((s, m) => s + (m.tipo === 'saida' ? +m.valor : 0), 0);
    const aportes = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + (+m.valor), 0);

    v.appendChild(el('div', { class: 'grid-kpi' }, [
      kpi('Pró-labore (total)', BRL(proLabore), 'g', 'Lançamentos com "pró-labore"'),
      kpi('Retiradas / distribuições', BRL(retiradas), retiradas > proLabore * 2 ? 'r' : 'a', 'Fora do pró-labore'),
      kpi('Aportes de sócio', BRL(aportes), 'v', 'Entradas categorizadas'),
      kpi('Saldo líquido sócio', BRL(aportes - proLabore - retiradas), (aportes - proLabore - retiradas) < 0 ? 'r' : 'v', 'Aportes − (pró-labore + retiradas)')
    ]));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-2' }, 'Como é calculado'),
      el('div', { class: 'text-sm text-slate-600' }, 'Classifica automaticamente lançamentos cuja descrição/categoria contém "pró-labore", "retirada", "sócio" ou "distribuição". Use essas palavras-chave ao cadastrar para manter a conta corrente correta.')
    ]));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!movs.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 5, class: 'text-center py-6 text-slate-500' }, 'Nenhum movimento identificado como sócio.')));
    movs.sort((a, b) => b.data.localeCompare(a.data)).forEach(m => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, fmtDate(m.data)),
        el('td', {}, m.descricao),
        el('td', {}, m.categoria || '—'),
        el('td', {}, badge(m.tipo, m.tipo === 'entrada' ? 'v' : 'r')),
        el('td', { class: m.tipo === 'entrada' ? 'text-green-700' : 'text-red-700' }, (m.tipo === 'entrada' ? '+' : '−') + BRL(m.valor))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  // ================= CONSOLIDAÇÃO MULTI-EMPRESA =================
  function consolidado(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const empresas = DB.listEmpresas();
    if (empresas.length < 2) {
      v.appendChild(el('div', { class: 'card' }, 'Cadastre pelo menos duas empresas para consolidar.'));
      return;
    }
    const dados = empresas.map(e => {
      const s = DB.readEmpresa(e.id);
      const saldo = KPI.saldoRealizado(s);
      const { mcPct, receita, mc } = KPI.margemContribuicao(s);
      const inad = KPI.inadimplenciaPct(s);
      const pe = KPI.pontoEquilibrio(s);
      const resOp = KPI.resultadoOperacional(s);
      const ncg = KPI.ncg(s);
      const burn = KPI.burnRate(s);
      const tp = s.titulosPagar.filter(t => !t.pago).reduce((x, t) => x + (+t.valor), 0);
      const tr = s.titulosReceber.filter(t => t.status !== 'pago' && t.status !== 'cancelado').reduce((x, t) => x + ((+t.valor) - (+t.valorRecebido || 0)), 0);
      return { id: e.id, nome: e.nome, saldo, receita, mc, mcPct, inad, pe, resOp, ncg, burn, tp, tr };
    });

    const total = dados.reduce((acc, d) => ({ saldo: acc.saldo + d.saldo, receita: acc.receita + d.receita, mc: acc.mc + d.mc, resOp: acc.resOp + d.resOp, ncg: acc.ncg + d.ncg, tp: acc.tp + d.tp, tr: acc.tr + d.tr }), { saldo: 0, receita: 0, mc: 0, resOp: 0, ncg: 0, tp: 0, tr: 0 });
    const mcPctGlobal = total.receita > 0 ? (total.mc / total.receita * 100) : 0;

    v.appendChild(el('div', { class: 'grid-kpi' }, [
      kpi('Saldo consolidado', BRL(total.saldo), total.saldo < 0 ? 'r' : 'v'),
      kpi('Receita projetada', BRL(total.receita), 'v'),
      kpi('MC consolidada', BRL(total.mc), 'v', PCT(mcPctGlobal)),
      kpi('Resultado operacional', BRL(total.resOp), total.resOp < 0 ? 'r' : 'v'),
      kpi('A receber', BRL(total.tr), 'v'),
      kpi('A pagar', BRL(total.tp), 'r'),
      kpi('NCG somada', BRL(total.ncg), 'g')
    ]));

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Empresa', 'Saldo', 'Receita', 'MC %', 'Resultado', 'Inad %', 'A receber', 'A pagar', 'Burn rate', 'Ações'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    dados.forEach(d => tbody.appendChild(el('tr', {}, [
      el('td', { class: 'font-medium' }, d.nome),
      el('td', { class: d.saldo < 0 ? 'text-red-700 font-medium' : '' }, BRL(d.saldo)),
      el('td', {}, BRL(d.receita)),
      el('td', {}, PCT(d.mcPct)),
      el('td', { class: d.resOp < 0 ? 'text-red-700' : 'text-green-700' }, BRL(d.resOp)),
      el('td', {}, PCT(d.inad)),
      el('td', {}, BRL(d.tr)),
      el('td', {}, BRL(d.tp)),
      el('td', { class: d.burn > 0 ? 'text-red-700' : '' }, d.burn > 0 ? BRL(d.burn) : '—'),
      el('td', {}, el('button', { class: 'btn btn-s', onclick: () => { DB.switchEmpresa(d.id); } }, 'Ativar'))
    ])));
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, [
      el('h3', { class: 'font-semibold p-3' }, 'Comparativo por empresa'),
      tbl
    ]));

    // Gráfico comparativo receita x resultado
    const canvasId = 'cons-chart-' + Date.now();
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Receita × Resultado por empresa'),
      el('canvas', { id: canvasId, height: '80' })
    ]));
    setTimeout(() => {
      if (chartRef) chartRef.destroy();
      chartRef = new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: {
          labels: dados.map(d => d.nome),
          datasets: [
            { label: 'Receita', data: dados.map(d => d.receita), backgroundColor: '#2563eb' },
            { label: 'Resultado operacional', data: dados.map(d => d.resOp), backgroundColor: '#16a34a' }
          ]
        },
        options: { scales: { y: { ticks: { callback: v => BRL(v) } } } }
      });
    }, 0);
  }

  // ================= FORECAST DE RECEITA =================
  function forecast(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const f = KPI.forecastReceita(st, 6, 3);
    if (!f.historico.some(h => h.valor > 0)) {
      v.appendChild(el('div', { class: 'card' }, 'Sem receita realizada nos últimos 6 meses. Registre movimentos para gerar previsão.'));
      return;
    }
    const tendenciaSev = f.tendencia > 0 ? 'v' : f.tendencia < 0 ? 'r' : 'g';
    const tendLabel = f.tendencia > 0 ? `↗ ${BRL(f.tendencia)}/mês` : f.tendencia < 0 ? `↘ ${BRL(Math.abs(f.tendencia))}/mês` : '→ estável';

    v.appendChild(el('div', { class: 'grid-kpi' }, [
      kpi('Média mensal (6m)', BRL(f.media), 'v'),
      kpi('Tendência mensal', tendLabel, tendenciaSev, 'coeficiente da regressão linear'),
      kpi('Forecast próximo mês', BRL(f.forecast[0]?.linear || 0), f.forecast[0]?.linear > f.media ? 'v' : 'a'),
      kpi('Forecast em 3 meses', BRL(f.forecast[2]?.linear || 0), f.forecast[2]?.linear > f.media ? 'v' : 'a')
    ]));

    const canvasId = 'fcast-chart-' + Date.now();
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Série histórica e previsão'),
      el('canvas', { id: canvasId, height: '80' })
    ]));
    setTimeout(() => {
      if (chartRef) chartRef.destroy();
      const labels = [...f.historico.map(h => h.mes), ...f.forecast.map(h => h.mes)];
      const realData = [...f.historico.map(h => h.valor), ...f.forecast.map(() => null)];
      const fData = [...f.historico.map(() => null), f.historico[f.historico.length - 1]?.valor ?? null, ...f.forecast.map(h => h.linear).slice(1)];
      // montagem simples: conectar último realizado com forecast
      const hist = [...f.historico.map(h => h.valor), ...f.forecast.map(() => null)];
      const fc = Array(f.historico.length - 1).fill(null).concat([f.historico[f.historico.length - 1]?.valor || 0], f.forecast.map(h => h.linear));
      chartRef = new Chart(document.getElementById(canvasId), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Realizado', data: hist, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', tension: .2, fill: false },
            { label: 'Forecast linear', data: fc, borderColor: '#dc2626', borderDash: [6, 4], tension: .2, fill: false }
          ]
        },
        options: { scales: { y: { ticks: { callback: v => BRL(v) } } } }
      });
    }, 0);

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Mês', 'Realizado', 'Forecast (linear)', 'Forecast (média)'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    f.historico.forEach(h => tbody.appendChild(el('tr', {}, [el('td', {}, h.mes), el('td', {}, BRL(h.valor)), el('td', { class: 'text-slate-400' }, '—'), el('td', { class: 'text-slate-400' }, '—')])));
    f.forecast.forEach(h => tbody.appendChild(el('tr', {}, [el('td', {}, h.mes), el('td', { class: 'text-slate-400' }, '—'), el('td', { class: 'text-red-700' }, BRL(h.linear)), el('td', {}, BRL(h.media))])));
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  // ================= IMPOSTOS =================
  function impostos(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    v.appendChild(UI.el('div', { class: 'card' }, [
      UI.el('h3', { class: 'font-semibold text-red-700 mb-2' }, '⛔ Módulo desativado'),
      UI.el('p', { class: 'text-sm mb-3' }, 'O módulo de cálculo de impostos foi desativado nesta versão de uso interno da CETEM Tecnologia.'),
      UI.el('p', { class: 'text-sm mb-2' }, [
        UI.el('strong', {}, 'Motivo: '),
        document.createTextNode('as tabelas disponíveis no código (Simples Nacional e Lucro Presumido, referência 2024) não refletem a Reforma Tributária em curso, não consideram Fator R, ISS municipal específico ou ICMS por UF. Usar valores estimados aqui como referência de decisão carrega risco tributário real.')
      ]),
      UI.el('p', { class: 'text-sm mb-2' }, [
        UI.el('strong', {}, 'Onde obter valores oficiais: '),
        document.createTextNode('contador responsável (Gessica/Brasil Contabilidade) ou portal do Simples Nacional / e-CAC. Para decisão estratégica, peça simulação formal.')
      ]),
      UI.el('p', { class: 'text-xs text-slate-500 mt-4' }, 'Responsável pela decisão de desativação: time de engenharia CETEM · versão v0.5 · uso interno.')
    ]));
  }

  // ================= SAZONALIDADE =================
  function sazonalidade(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const s = KPI.sazonalidade(st, 24);
    const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    if (s.geral === 0) {
      v.appendChild(el('div', { class: 'card' }, 'Sem receita suficiente. Registre movimentos para detectar padrão sazonal.'));
      return;
    }

    const canvasId = 'saz-chart-' + Date.now();
    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-3' }, 'Índice sazonal (1,0 = média anual)'),
      el('canvas', { id: canvasId, height: '80' })
    ]));
    setTimeout(() => {
      if (chartRef) chartRef.destroy();
      chartRef = new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: {
          labels: nomesMes,
          datasets: [{
            label: 'Índice sazonal',
            data: nomesMes.map((_, i) => s.indice[i + 1]),
            backgroundColor: nomesMes.map((_, i) => s.indice[i + 1] >= 1 ? '#16a34a' : '#dc2626')
          }]
        },
        options: { scales: { y: { suggestedMin: 0, suggestedMax: 2 } }, plugins: { legend: { display: false } } }
      });
    }, 0);

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Mês', 'Receita média', 'Índice sazonal', 'Leitura'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    nomesMes.forEach((nome, i) => {
      const idx = s.indice[i + 1];
      const leitura = idx >= 1.2 ? 'Alta temporada' : idx >= 0.9 ? 'Regular' : idx >= 0.6 ? 'Baixa' : 'Muito baixa';
      const sev = idx >= 1.2 ? 'v' : idx >= 0.9 ? 'g' : idx >= 0.6 ? 'a' : 'r';
      tbody.appendChild(el('tr', {}, [
        el('td', {}, nome),
        el('td', {}, BRL(s.medias[i + 1])),
        el('td', { class: 'font-medium' }, idx.toFixed(2)),
        el('td', {}, badge(leitura, sev))
      ]));
    });
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-2' }, 'Como usar'),
      el('ul', { class: 'text-sm text-slate-600 list-disc pl-5 space-y-1' }, [
        el('li', {}, 'Multiplique o forecast médio pelo índice do mês-alvo para ajustar à sazonalidade.'),
        el('li', {}, 'Meses com índice > 1,2: programar estoque, equipe e capital de giro extras.'),
        el('li', {}, 'Meses com índice < 0,8: planejar férias, manutenções e campanhas de reaquecimento.')
      ])
    ]));
  }

  // ================= ONBOARDING =================
  function onboarding() {
    const st = DB.get();
    let step = 0;
    const data = {
      nome: st.empresa.nome || '',
      cnpj: st.empresa.cnpj || '',
      setor: st.empresa.setor || 'servico',
      caixaInicial: st.empresa.caixaInicial || 0,
      custosFixos: st.parametros.custosFixosMensais || 0,
      metaMargem: st.parametros.metaMargemPct || 35,
      caixaMinimo: st.parametros.caixaMinimo || 5000,
      metaReceita: st.metas.receitaMensal || 0,
      pixChave: st.empresa.pixChave || ''
    };

    const root = document.getElementById('modal-root');
    const close = () => root.innerHTML = '';
    const render = () => {
      root.innerHTML = '';
      const bg = el('div', { class: 'modal-bg' });
      const box = el('div', { class: 'modal', style: 'width:600px' });

      const passos = [
        { t: 'Bem-vindo!', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '👋 Bem-vindo ao Cockpit Financeiro'),
          el('p', { class: 'text-sm text-slate-600 mb-3' }, 'Vamos configurar sua empresa em 6 passos rápidos. Leva menos de 2 minutos.'),
          el('ul', { class: 'text-sm text-slate-600 space-y-1 list-disc pl-5' }, [
            el('li', {}, 'Dados da empresa'),
            el('li', {}, 'Saldo atual de caixa'),
            el('li', {}, 'Custos fixos e meta de margem'),
            el('li', {}, 'Caixa mínimo e meta de receita'),
            el('li', {}, 'Chave PIX (opcional)'),
            el('li', {}, 'Pronto para começar')
          ])
        ])},
        { t: 'Empresa', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '🏢 Dados da empresa'),
          field('Nome da empresa', (() => { const i = el('input', { class: 'input', value: data.nome }); i.oninput = () => data.nome = i.value; return i; })()),
          field('CNPJ (opcional)', (() => { const i = el('input', { class: 'input', value: data.cnpj }); i.oninput = () => data.cnpj = i.value; return i; })()),
          field('Setor', (() => { const i = el('select', { class: 'select' }, [
            el('option', { value: 'servico' }, 'Serviços'),
            el('option', { value: 'comercio' }, 'Comércio'),
            el('option', { value: 'industria' }, 'Indústria')
          ]); i.value = data.setor; i.onchange = () => data.setor = i.value; return i; })())
        ])},
        { t: 'Caixa', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '💵 Saldo atual de caixa'),
          el('p', { class: 'text-sm text-slate-600 mb-3' }, 'Informe o saldo total hoje somando todos os bancos e caixa físico. Esse será o ponto de partida.'),
          field('Saldo total atual (R$)', (() => { const i = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.caixaInicial }); i.oninput = () => data.caixaInicial = +i.value || 0; return i; })())
        ])},
        { t: 'Margem', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '📈 Custos fixos e margem'),
          el('p', { class: 'text-sm text-slate-600 mb-3' }, 'Custos fixos mensais: aluguel + folha + pró-labore + contador + sistemas + outras despesas que existem independente de venda.'),
          field('Custos fixos mensais (R$)', (() => { const i = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.custosFixos }); i.oninput = () => data.custosFixos = +i.value || 0; return i; })()),
          field('Meta de margem de contribuição (%)', (() => { const i = el('input', { type: 'number', step: '0.1', class: 'input', value: data.metaMargem }); i.oninput = () => data.metaMargem = +i.value || 0; return i; })())
        ])},
        { t: 'Metas', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '🎯 Metas'),
          field('Caixa mínimo a manter (R$)', (() => { const i = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.caixaMinimo }); i.oninput = () => data.caixaMinimo = +i.value || 0; return i; })()),
          field('Meta de receita mensal (R$)', (() => { const i = el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: data.metaReceita }); i.oninput = () => data.metaReceita = +i.value || 0; return i; })())
        ])},
        { t: 'PIX', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '🔑 Chave PIX (opcional)'),
          el('p', { class: 'text-sm text-slate-600 mb-3' }, 'Preencha para gerar PIX copia-e-cola automaticamente no envio de cobranças. Pode deixar em branco e configurar depois.'),
          field('Chave PIX', (() => { const i = el('input', { class: 'input', value: data.pixChave, placeholder: 'CPF, CNPJ, e-mail ou telefone' }); i.oninput = () => data.pixChave = i.value; return i; })())
        ])},
        { t: 'Pronto', render: () => el('div', {}, [
          el('h2', { class: 'text-xl font-semibold mb-3' }, '✅ Tudo configurado'),
          el('p', { class: 'text-sm text-slate-600 mb-3' }, 'Próximos passos sugeridos:'),
          el('ol', { class: 'text-sm text-slate-600 space-y-1 list-decimal pl-5' }, [
            el('li', {}, 'Cadastrar contas bancárias em Contas'),
            el('li', {}, 'Importar clientes e fornecedores via CSV'),
            el('li', {}, 'Lançar títulos a receber e a pagar em aberto'),
            el('li', {}, 'Cadastrar recorrências fixas (aluguel, folha)'),
            el('li', {}, 'Começar a rotina semanal: revisar saldo e agir no Dashboard')
          ])
        ])}
      ];

      const atual = passos[step];
      box.appendChild(el('div', { class: 'flex justify-between items-center mb-4' }, [
        el('div', { class: 'text-xs text-slate-500 uppercase' }, `Passo ${step + 1} de ${passos.length}`),
        el('button', { class: 'text-slate-500 text-xl', onclick: close }, '×')
      ]));
      box.appendChild(atual.render());
      box.appendChild(el('div', { class: 'flex justify-between mt-6' }, [
        step > 0 ? el('button', { class: 'btn btn-s', onclick: () => { step--; render(); } }, 'Voltar') : el('span'),
        step < passos.length - 1
          ? el('button', { class: 'btn btn-p', onclick: () => { step++; render(); } }, 'Próximo')
          : el('button', { class: 'btn btn-p', onclick: () => {
              DB.set(s => {
                s.empresa.nome = data.nome || 'CETEM Engenharia';
                s.empresa.cnpj = data.cnpj;
                s.empresa.setor = data.setor;
                s.empresa.caixaInicial = data.caixaInicial;
                s.empresa.pixChave = data.pixChave;
                s.parametros.custosFixosMensais = data.custosFixos;
                s.parametros.metaMargemPct = data.metaMargem;
                s.parametros.caixaMinimo = data.caixaMinimo;
                s.metas.receitaMensal = data.metaReceita;
                s.onboardingConcluido = true;
              });
              DB.log('onboarding', 'concluído');
              close();
            } }, 'Concluir')
      ]));
      bg.appendChild(box); root.appendChild(bg);
    };
    render();
  }

  // ================= COBRANÇA EM LOTE =================
  function cobrancaLote(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cm = clientesMap(st);
    const hoje = today();

    const vencidos = st.titulosReceber
      .filter(t => t.status !== 'pago' && t.status !== 'cancelado' && t.vencimento < hoje)
      .map(t => ({ ...t, cliente: cm[t.clienteId] || {}, dias: daysBetween(t.vencimento, hoje), saldo: (+t.valor) - (+t.valorRecebido || 0) }));

    if (!vencidos.length) {
      v.appendChild(el('div', { class: 'card' }, 'Nenhum título vencido no momento. 🎉'));
      return;
    }

    const totalVencido = vencidos.reduce((s, t) => s + t.saldo, 0);
    v.appendChild(el('div', { class: 'card flex justify-between items-center' }, [
      el('div', {}, [
        el('div', { class: 'text-sm text-slate-600' }, `${vencidos.length} títulos vencidos · Total: ${BRL(totalVencido)}`),
        el('div', { class: 'text-xs text-slate-500 mt-1' }, 'Selecione e dispare mensagens em lote via WhatsApp ou e-mail.')
      ])
    ]));

    const selecionados = new Set();

    const selAll = el('input', { type: 'checkbox' });
    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, selAll),
      ...['Cliente', 'Doc', 'Vencimento', 'Atraso', 'Saldo', 'Contato', 'Canal'].map(h => el('th', {}, h))
    ])));
    const tbody = el('tbody');

    vencidos.sort((a, b) => b.dias - a.dias).forEach(t => {
      const chk = el('input', { type: 'checkbox' });
      chk.onchange = () => { if (chk.checked) selecionados.add(t.id); else selecionados.delete(t.id); };
      const tel = (t.cliente.telefone || '').replace(/\D/g, '');
      const mail = t.cliente.email || '';
      const canal = tel ? 'WhatsApp' : mail ? 'E-mail' : '—';
      tbody.appendChild(el('tr', {}, [
        el('td', {}, chk),
        el('td', {}, t.cliente.nome || '—'),
        el('td', {}, t.documento || '—'),
        el('td', {}, fmtDate(t.vencimento)),
        el('td', {}, badge(t.dias + 'd', t.dias > 30 ? 'r' : t.dias > 15 ? 'a' : 'g')),
        el('td', {}, BRL(t.saldo)),
        el('td', { class: 'text-xs' }, tel || mail || '—'),
        el('td', {}, badge(canal, canal === '—' ? 'g' : 'v'))
      ]));
    });
    tbl.appendChild(tbody);

    selAll.onchange = () => {
      tbody.querySelectorAll('input[type=checkbox]').forEach((cb, i) => {
        cb.checked = selAll.checked;
        if (selAll.checked) selecionados.add(vencidos[i].id); else selecionados.delete(vencidos[i].id);
      });
    };

    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));

    const template = el('textarea', { class: 'input', rows: 4 }, 'Olá {cliente}, passando para lembrar do título {documento} vencido em {vencimento} (saldo {saldo}). Segue PIX para regularizar: {pix}. Qualquer dúvida, estou à disposição.');

    v.appendChild(el('div', { class: 'card' }, [
      el('h3', { class: 'font-semibold mb-2' }, 'Template da mensagem'),
      el('div', { class: 'text-xs text-slate-500 mb-2' }, 'Variáveis: {cliente} {documento} {vencimento} {saldo} {dias} {pix}'),
      template,
      el('div', { class: 'flex gap-2 mt-3' }, [
        el('button', { class: 'btn btn-p', onclick: () => disparar('whatsapp') }, '📱 Disparar WhatsApp'),
        el('button', { class: 'btn btn-p', onclick: () => disparar('email') }, '✉️ Disparar e-mails')
      ])
    ]));

    function disparar(canal) {
      const ids = Array.from(selecionados);
      if (!ids.length) { alert('Selecione ao menos um título.'); return; }
      const alvos = vencidos.filter(t => ids.includes(t.id));
      let n = 0;
      alvos.forEach((t, idx) => {
        const tel = (t.cliente.telefone || '').replace(/\D/g, '');
        const mail = t.cliente.email || '';
        const pix = st.empresa.pixChave ? PIX.gerar({ chave: st.empresa.pixChave, valor: t.saldo, beneficiario: st.empresa.nome, cidade: st.empresa.pixCidade || 'SAO PAULO', txid: (t.documento || t.id).replace(/\W/g, '').slice(0, 25) || '***' }) : '(configure chave PIX em Configurações)';
        const msg = template.value
          .replace(/\{cliente\}/g, t.cliente.nome || 'cliente')
          .replace(/\{documento\}/g, t.documento || '')
          .replace(/\{vencimento\}/g, t.vencimento)
          .replace(/\{saldo\}/g, BRL(t.saldo))
          .replace(/\{dias\}/g, String(t.dias))
          .replace(/\{pix\}/g, pix);
        const encoded = encodeURIComponent(msg);
        if (canal === 'whatsapp' && tel) { setTimeout(() => window.open(`https://wa.me/${tel}?text=${encoded}`, '_blank'), idx * 300); n++; }
        else if (canal === 'email' && mail) { setTimeout(() => window.open(`mailto:${mail}?subject=Cobran%C3%A7a%20${encodeURIComponent(t.documento || '')}&body=${encoded}`, '_blank'), idx * 300); n++; }
      });
      DB.log('cobranca-lote', `${n} ${canal} disparados`);
      alert(`${n} mensagens abertas em abas. Confirme o envio em cada uma.`);
    }
  }

  // ================= ANEXOS =================
  function openAnexos(st, tituloId, tipoTitulo) {
    const body = el('div');
    const fileIn = el('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg', class: 'input' });
    const list = el('div', { class: 'space-y-2 mt-3' });

    function render() {
      list.innerHTML = '';
      const curr = (DB.get().anexos && DB.get().anexos[tituloId]) || [];
      if (!curr.length) list.appendChild(el('div', { class: 'text-xs text-slate-500' }, 'Nenhum anexo.'));
      curr.forEach(a => {
        list.appendChild(el('div', { class: 'flex justify-between items-center text-sm border rounded p-2' }, [
          el('div', {}, [
            el('div', {}, a.nome),
            el('div', { class: 'text-xs text-slate-500' }, `${(a.tamanho / 1024).toFixed(0)} KB · ${a.data}`)
          ]),
          el('div', { class: 'flex gap-1' }, [
            el('a', { class: 'btn btn-s', href: a.conteudo, download: a.nome, target: '_blank' }, 'Abrir'),
            can('editar') ? el('button', { class: 'btn btn-d', onclick: () => {
              DB.set(s => { s.anexos[tituloId] = (s.anexos[tituloId] || []).filter(x => x.id !== a.id); });
              render();
            } }, '×') : null
          ].filter(Boolean))
        ]));
      });
    }

    fileIn.onchange = () => {
      const f = fileIn.files[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { alert('Arquivo acima de 2 MB. Use link externo para arquivos maiores.'); return; }
      const r = new FileReader();
      r.onload = () => {
        DB.set(s => {
          s.anexos = s.anexos || {};
          s.anexos[tituloId] = s.anexos[tituloId] || [];
          s.anexos[tituloId].push({ id: DB.id(), nome: f.name, tipo: f.type, tamanho: f.size, data: today(), conteudo: r.result });
        });
        DB.log('anexo', `${f.name} em título ${tituloId}`);
        fileIn.value = '';
        render();
      };
      r.readAsDataURL(f);
    };

    body.appendChild(el('div', { class: 'text-xs text-slate-500 mb-3' }, 'Tipos aceitos: PDF, PNG, JPG. Máximo 2 MB por arquivo.'));
    body.appendChild(field('Novo anexo', fileIn));
    body.appendChild(list);
    render();

    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) root.innerHTML = ''; } });
    const boxA = el('div', { class: 'modal' });
    boxA.appendChild(el('div', { class: 'flex justify-between items-center mb-4' }, [
      el('h2', { class: 'text-lg font-semibold' }, `Anexos (${tipoTitulo})`),
      el('button', { class: 'text-slate-500 text-xl', onclick: () => root.innerHTML = '' }, '×')
    ]));
    boxA.appendChild(body);
    bg.appendChild(boxA); root.appendChild(bg);
  }

  // ================= PIX / QR CODE =================
  function openPixQR(st, valor, doc, nomeCliente) {
    if (!st.empresa.pixChave) { alert('Configure a chave PIX em Configurações primeiro.'); return; }
    const copiaCola = PIX.gerar({ chave: st.empresa.pixChave, valor, beneficiario: st.empresa.nome, cidade: st.empresa.pixCidade || 'SAO PAULO', txid: (doc || '').replace(/\W/g, '').slice(0, 25) || '***' });
    const body = el('div', { class: 'text-center' });
    body.appendChild(el('div', { class: 'text-sm mb-2' }, `${nomeCliente || 'Cliente'} · ${BRL(valor)}`));
    body.appendChild(el('img', { src: PIX.qrUrl(copiaCola, 220), alt: 'QR PIX', class: 'mx-auto my-3' }));
    const ta = el('textarea', { class: 'input text-xs', rows: 3, readonly: true }, copiaCola);
    body.appendChild(ta);
    body.appendChild(el('button', { class: 'btn btn-p mt-3', onclick: () => { navigator.clipboard.writeText(copiaCola); alert('Copia-e-cola copiado!'); } }, '📋 Copiar copia-e-cola'));

    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) root.innerHTML = ''; } });
    const boxM = el('div', { class: 'modal' });
    boxM.appendChild(el('div', { class: 'flex justify-between items-center mb-2' }, [
      el('h2', { class: 'text-lg font-semibold' }, 'PIX para pagamento'),
      el('button', { class: 'text-slate-500 text-xl', onclick: () => root.innerHTML = '' }, '×')
    ]));
    boxM.appendChild(body);
    bg.appendChild(boxM); root.appendChild(bg);
  }

  // ================= TIMELINE DE INTERAÇÕES =================
  function interacoes(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    const cm = clientesMap(st);
    const list = (st.interacoes || []).slice().sort((a, b) => b.ts.localeCompare(a.ts));

    v.appendChild(el('div', { class: 'flex justify-between items-center' }, [
      el('div', { class: 'text-sm text-slate-600' }, `${list.length} interações registradas`),
      el('button', { class: 'btn btn-p', onclick: () => openInteracao(st) }, '+ Nova anotação')
    ]));

    if (!list.length) {
      v.appendChild(el('div', { class: 'card' }, 'Nenhuma interação registrada. Cobranças em lote ficam automaticamente aqui.'));
      return;
    }

    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Data/Hora', 'Cliente', 'Tipo', 'Canal', 'Mensagem'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    list.forEach(i => tbody.appendChild(el('tr', {}, [
      el('td', {}, new Date(i.ts).toLocaleString('pt-BR')),
      el('td', {}, cm[i.clienteId]?.nome || '—'),
      el('td', {}, badge(i.tipo, i.tipo === 'cobranca' ? 'a' : i.tipo === 'retorno' ? 'v' : 'g')),
      el('td', {}, i.canal || '—'),
      el('td', { class: 'max-w-md' }, i.mensagem || '')
    ])));
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));
  }

  function openInteracao(st) {
    if (!st.clientes.length) { alert('Cadastre um cliente primeiro.'); return; }
    const body = el('div');
    const inp = {
      clienteId: el('select', { class: 'select' }, st.clientes.map(c => el('option', { value: c.id }, c.nome))),
      tipo: el('select', { class: 'select' }, [el('option', { value: 'anotacao' }, 'Anotação'), el('option', { value: 'cobranca' }, 'Cobrança'), el('option', { value: 'retorno' }, 'Retorno do cliente')]),
      canal: el('select', { class: 'select' }, [el('option', { value: 'whatsapp' }, 'WhatsApp'), el('option', { value: 'email' }, 'E-mail'), el('option', { value: 'telefone' }, 'Telefone'), el('option', { value: 'presencial' }, 'Presencial')]),
      mensagem: el('textarea', { class: 'input', rows: 3 }, '')
    };
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Cliente', inp.clienteId), field('Tipo', inp.tipo), field('Canal', inp.canal)
    ]));
    body.appendChild(field('Mensagem / anotação', inp.mensagem));
    modal('Nova anotação', body, () => {
      if (!inp.mensagem.value.trim()) { alert('Preencha a mensagem.'); return false; }
      DB.set(s => {
        s.interacoes = s.interacoes || [];
        s.interacoes.unshift({ id: DB.id(), clienteId: inp.clienteId.value, ts: new Date().toISOString(), tipo: inp.tipo.value, canal: inp.canal.value, mensagem: inp.mensagem.value });
      });
      DB.log('interacao', inp.tipo.value + ' · ' + inp.canal.value);
    });
  }

  // ================= RENEGOCIAÇÃO DE TÍTULO =================
  function openRenegociar(st, t, tipo) {
    const valorRestante = tipo === 'receber' ? ((+t.valor) - (+t.valorRecebido || 0)) : (+t.valor);
    const body = el('div');
    const inp = {
      parcelas: el('input', { type: 'number', min: 2, max: 36, class: 'input', value: 3 }),
      primeiroVenc: el('input', { type: 'date', class: 'input', value: today() }),
      intervalo: el('select', { class: 'select' }, [el('option', { value: 'mensal' }, 'Mensal'), el('option', { value: 'quinzenal' }, 'Quinzenal'), el('option', { value: 'semanal' }, 'Semanal')]),
      acrescimo: el('input', { type: 'text', inputmode: 'decimal', class: 'input', value: 0, placeholder: 'Juros/multa (R$)' })
    };
    const preview = el('div', { class: 'card mt-3' });
    const render = () => {
      const n = Math.max(2, +inp.parcelas.value || 2);
      const total = valorRestante + (+inp.acrescimo.value || 0);
      const parcela = total / n;
      const intervalDias = inp.intervalo.value === 'semanal' ? 7 : inp.intervalo.value === 'quinzenal' ? 15 : 30;
      const rows = [];
      for (let i = 0; i < n; i++) {
        const d = new Date(inp.primeiroVenc.value);
        d.setDate(d.getDate() + i * intervalDias);
        rows.push({ n: i + 1, venc: d.toISOString().slice(0, 10), valor: parcela });
      }
      preview.innerHTML = '';
      preview.appendChild(el('div', { class: 'text-sm mb-2' }, `Total: ${BRL(total)} em ${n}x de ${BRL(parcela)}`));
      const tbl = el('table', {});
      tbl.appendChild(el('thead', {}, el('tr', {}, ['Parcela', 'Vencimento', 'Valor'].map(h => el('th', {}, h)))));
      const tb = el('tbody');
      rows.forEach(r => tb.appendChild(el('tr', {}, [el('td', {}, `${r.n}/${n}`), el('td', {}, r.venc), el('td', {}, BRL(r.valor))])));
      tbl.appendChild(tb);
      preview.appendChild(tbl);
      return rows;
    };
    Object.values(inp).forEach(i => i.oninput = render);
    inp.intervalo.onchange = render;

    body.appendChild(el('div', { class: 'text-sm mb-3' }, `Saldo atual: ${BRL(valorRestante)}`));
    body.appendChild(el('div', { class: 'grid grid-cols-2 gap-3' }, [
      field('Número de parcelas', inp.parcelas),
      field('Intervalo', inp.intervalo),
      field('Primeiro vencimento', inp.primeiroVenc),
      field('Acréscimo (juros/multa)', inp.acrescimo)
    ]));
    const rows = render();
    body.appendChild(preview);

    modal('Renegociar título', body, () => {
      const n = Math.max(2, +inp.parcelas.value || 2);
      const total = valorRestante + (+inp.acrescimo.value || 0);
      const parcela = total / n;
      const intervalDias = inp.intervalo.value === 'semanal' ? 7 : inp.intervalo.value === 'quinzenal' ? 15 : 30;
      DB.set(s => {
        const arr = tipo === 'receber' ? s.titulosReceber : s.titulosPagar;
        const idx = arr.findIndex(x => x.id === t.id);
        if (idx >= 0) {
          arr[idx].status = tipo === 'receber' ? 'cancelado' : arr[idx].status;
          if (tipo === 'pagar') arr[idx].pago = true;
          arr[idx].observacao = (arr[idx].observacao || '') + ` [Renegociado em ${today()}: ${n}x ${BRL(parcela)}]`;
        }
        for (let i = 0; i < n; i++) {
          const d = new Date(inp.primeiroVenc.value);
          d.setDate(d.getDate() + i * intervalDias);
          const iso = d.toISOString().slice(0, 10);
          const doc = (t.documento || 'REN') + `/${i + 1}`;
          if (tipo === 'receber') {
            s.titulosReceber.push({ id: DB.id(), clienteId: t.clienteId, documento: doc, emissao: today(), vencimento: iso, valor: parcela, valorRecebido: 0, status: 'aberto', observacao: `Renegociação do título ${t.documento || t.id}` });
          } else {
            s.titulosPagar.push({ id: DB.id(), fornecedorId: t.fornecedorId, documento: doc, competencia: today(), vencimento: iso, valor: parcela, categoria: t.categoria, prioridade: t.prioridade, pago: false, observacao: `Renegociação do título ${t.documento || t.id}` });
          }
        }
      });
      DB.log('renegociacao', `${tipo} ${t.documento || t.id} em ${n}x`);
    });
  }

  // ================= RECIBO IMPRIMÍVEL =================
  function abrirRecibo(info) {
    const w = window.open('', '_blank', 'width=600,height=700');
    if (!w) return alert('Bloqueador de pop-up impediu. Permita para esta página.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title><style>
      body{font-family:system-ui,Arial,sans-serif;padding:2rem;max-width:700px;margin:auto;color:#1e293b}
      h1{border-bottom:2px solid #1e293b;padding-bottom:.5rem;margin-top:0}
      .linha{display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px dotted #cbd5e1}
      .total{font-size:1.3rem;font-weight:bold;padding:1rem 0;border-top:2px solid #1e293b;margin-top:1rem}
      .extenso{font-style:italic;margin-top:.5rem}
      .assinatura{margin-top:3rem;text-align:center}
      .assinatura .linha-ass{border-top:1px solid #000;width:60%;margin:2rem auto .5rem}
      @media print{body{padding:1rem}button{display:none}}
    </style></head><body>
      <button onclick="window.print()" style="float:right;padding:.5rem 1rem">🖨 Imprimir</button>
      <h1>RECIBO</h1>
      <div class="linha"><span>Nº do recibo</span><span>${info.numero}</span></div>
      <div class="linha"><span>Data</span><span>${info.data}</span></div>
      <div class="linha"><span>Empresa</span><span>${info.empresa}</span></div>
      <div class="linha"><span>${info.tipoContraparte}</span><span>${info.contraparte}</span></div>
      <div class="linha"><span>Referente a</span><span>${info.referencia}</span></div>
      <div class="total">${info.tipo === 'receber' ? 'Recebido' : 'Pago'}: R$ ${info.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      <div class="extenso">${info.extenso}</div>
      <p style="margin-top:2rem">${info.tipo === 'receber'
        ? `Recebemos de <b>${info.contraparte}</b> a importância acima, referente a ${info.referencia}, dando plena quitação.`
        : `Pagamos a <b>${info.contraparte}</b> a importância acima, referente a ${info.referencia}.`}</p>
      <div class="assinatura">
        <div class="linha-ass"></div>
        <div>${info.empresa}</div>
      </div>
    </body></html>`);
    w.document.close();
  }

  function valorPorExtenso(n) {
    // Implementação simples até centenas de milhares.
    const unidades = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
    const dezenas2 = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
    const dezenas = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
    const centenas = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
    function ate999(v) {
      if (v === 0) return '';
      if (v === 100) return 'cem';
      const c = Math.floor(v / 100), d = Math.floor((v % 100) / 10), u = v % 10;
      let r = '';
      if (c) r += centenas[c];
      if (d || u) {
        if (r) r += ' e ';
        if (d === 1) r += dezenas2[u];
        else { if (d) r += dezenas[d]; if (u) r += (d ? ' e ' : '') + unidades[u]; }
      }
      return r;
    }
    const inteiro = Math.floor(n);
    const centavos = Math.round((n - inteiro) * 100);
    let r = '';
    const milhares = Math.floor(inteiro / 1000);
    const resto = inteiro % 1000;
    if (milhares) r += ate999(milhares) + ' mil';
    if (resto) r += (r ? ' e ' : '') + ate999(resto);
    if (!r) r = 'zero';
    r += inteiro === 1 ? ' real' : ' reais';
    if (centavos) r += ' e ' + ate999(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  // ================= BULK EDIT =================
  function openBulkEdit(st, ids, tipo) {
    if (!ids.length) return alert('Selecione ao menos 1 título.');
    const body = el('div');
    const inp = {
      vencimento: el('input', { type: 'date', class: 'input' }),
      categoria: tipo === 'pagar' ? el('select', { class: 'select' }, [el('option', { value: '' }, '— não alterar —'), ...st.categorias.saida.map(c => el('option', { value: c }, c))]) : null,
      prioridade: tipo === 'pagar' ? el('select', { class: 'select' }, [el('option', { value: '' }, '— não alterar —'), el('option', { value: 'obrigatorio' }, 'Obrigatório'), el('option', { value: 'negociavel' }, 'Negociável'), el('option', { value: 'discricionario' }, 'Discricionário')]) : null,
      rating: tipo === 'receber' ? el('select', { class: 'select' }, [el('option', { value: '' }, '— não alterar —'), el('option', { value: 'bom' }, 'bom'), el('option', { value: 'atencao' }, 'atenção'), el('option', { value: 'risco' }, 'risco')]) : null
    };
    body.appendChild(el('div', { class: 'text-sm mb-3' }, `${ids.length} títulos selecionados. Campos em branco não são alterados.`));
    body.appendChild(field('Novo vencimento (opcional)', inp.vencimento));
    if (inp.categoria) body.appendChild(field('Categoria', inp.categoria));
    if (inp.prioridade) body.appendChild(field('Prioridade', inp.prioridade));
    if (inp.rating) body.appendChild(field('Rating cliente (atualiza cadastro)', inp.rating));

    modal('Edição em lote', body, () => {
      DB.set(s => {
        const arr = tipo === 'receber' ? s.titulosReceber : s.titulosPagar;
        ids.forEach(id => {
          const t = arr.find(x => x.id === id); if (!t) return;
          if (inp.vencimento.value) t.vencimento = inp.vencimento.value;
          if (inp.categoria && inp.categoria.value) t.categoria = inp.categoria.value;
          if (inp.prioridade && inp.prioridade.value) t.prioridade = inp.prioridade.value;
          if (inp.rating && inp.rating.value) {
            const c = s.clientes.find(x => x.id === t.clienteId); if (c) c.rating = inp.rating.value;
          }
        });
      });
      DB.log('bulk-edit', `${ids.length} títulos ${tipo}`);
    });
  }

  // ================= IMPORTAR BASE (JSON) =================
  function importBase(st) {
    const v = document.getElementById('view'); v.innerHTML = '';
    let parsed = null;
    let analise = null;
    function chave(item) { return ((item.documento || '') + '|' + (item.nome || '')).trim().toLowerCase(); }
    function analisar(data) {
      const cliExist = new Set((st.clientes || []).map(chave));
      const forExist = new Set((st.fornecedores || []).map(chave));
      const cliNovos = (data.clientes || []).filter(x => x && x.nome && !cliExist.has(chave(x)));
      const forNovos = (data.fornecedores || []).filter(x => x && x.nome && !forExist.has(chave(x)));
      return {
        cliNovos: cliNovos.length, cliExist: (data.clientes || []).length - cliNovos.length,
        forNovos: forNovos.length, forExist: (data.fornecedores || []).length - forNovos.length,
        cliNovosArr: cliNovos, forNovosArr: forNovos
      };
    }
    function refresh() {
      previewBox.innerHTML = '';
      if (!parsed) {
        previewBox.appendChild(el('div', { class: 'text-slate-500 text-sm' }, 'Selecione um arquivo JSON acima.'));
        btnImportar.disabled = true;
        btnImportar.classList.add('opacity-50', 'cursor-not-allowed');
        btnImportar.textContent = 'Selecione um arquivo';
        return;
      }
      analise = analisar(parsed);
      previewBox.appendChild(el('div', { class: 'space-y-2' }, [
        el('div', { class: 'text-sm font-bold' }, 'Pré-visualização'),
        el('div', { class: 'grid grid-cols-2 gap-3' }, [
          el('div', { class: 'card p-3' }, [
            el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Clientes'),
            el('div', { class: 'text-2xl font-bold text-green-700 mt-1' }, '+' + analise.cliNovos),
            el('div', { class: 'text-xs text-slate-500 mt-1' }, analise.cliExist + ' já existem (serão ignorados)')
          ]),
          el('div', { class: 'card p-3' }, [
            el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Fornecedores'),
            el('div', { class: 'text-2xl font-bold text-green-700 mt-1' }, '+' + analise.forNovos),
            el('div', { class: 'text-xs text-slate-500 mt-1' }, analise.forExist + ' já existem (serão ignorados)')
          ])
        ]),
        el('div', { class: 'text-xs text-slate-500' }, 'A importação MESCLA com a base atual (não substitui). Duplicatas detectadas por CNPJ/CPF + nome.')
      ]));
      const total = analise.cliNovos + analise.forNovos;
      btnImportar.disabled = total === 0;
      btnImportar.classList.toggle('opacity-50', total === 0);
      btnImportar.classList.toggle('cursor-not-allowed', total === 0);
      btnImportar.textContent = total > 0 ? `Importar ${total} registro(s) novo(s)` : 'Nada para importar';
    }
    const fileIn = el('input', { type: 'file', accept: '.json,application/json', class: 'input' });
    fileIn.onchange = () => {
      const f = fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (typeof data !== 'object' || data === null) throw new Error('Formato inválido');
          if (!Array.isArray(data.clientes) && !Array.isArray(data.fornecedores)) throw new Error('JSON precisa ter "clientes" e/ou "fornecedores" como array.');
          parsed = { clientes: Array.isArray(data.clientes) ? data.clientes : [], fornecedores: Array.isArray(data.fornecedores) ? data.fornecedores : [] };
          refresh();
        } catch (e) {
          if (window.UI && UI.toast) UI.toast('Erro lendo arquivo: ' + e.message, 'r'); else alert('Erro: ' + e.message);
          parsed = null; refresh();
        }
      };
      r.readAsText(f, 'utf-8');
    };
    const btnImportar = el('button', { class: 'btn btn-p opacity-50 cursor-not-allowed', disabled: true }, 'Selecione um arquivo');
    btnImportar.onclick = () => {
      if (!analise || (analise.cliNovos + analise.forNovos === 0)) return;
      const msg = `Confirma a importação de ${analise.cliNovos} cliente(s) e ${analise.forNovos} fornecedor(es)?\n\nOs dados serão MESCLADOS com a base atual. Um snapshot automático será criado antes.`;
      if (!confirm(msg)) return;
      DB.snapshot('pre-import-base');
      DB.set(s => {
        s.clientes = (s.clientes || []).concat(analise.cliNovosArr.map(c => ({
          id: c.id || DB.id(), nome: c.nome, razaoSocial: c.razaoSocial || '', documento: c.documento || '',
          telefone: c.telefone || '', email: c.email || '', contato: c.contato || '',
          cidade: c.cidade || '', estado: c.estado || '', endereco: c.endereco || '', bairro: c.bairro || '', cep: c.cep || '',
          banco: c.banco || '', agencia: c.agencia || '', conta: c.conta || '',
          ie: c.ie || '', tipoAtividade: c.tipoAtividade || '', tags: c.tags || '',
          limite: +c.limite || 0, prazo: +c.prazo || 30, rating: c.rating || 'bom'
        })));
        s.fornecedores = (s.fornecedores || []).concat(analise.forNovosArr.map(f => ({
          id: f.id || DB.id(), nome: f.nome, razaoSocial: f.razaoSocial || '', documento: f.documento || '',
          telefone: f.telefone || '', email: f.email || '', contato: f.contato || '',
          cidade: f.cidade || '', estado: f.estado || '', endereco: f.endereco || '', bairro: f.bairro || '', cep: f.cep || '',
          banco: f.banco || '', agencia: f.agencia || '', conta: f.conta || '',
          ie: f.ie || '', tipoAtividade: f.tipoAtividade || '', tags: f.tags || '',
          categoria: f.categoria || f.tipoAtividade || 'Outros', condicao: f.condicao || '', criticidade: f.criticidade || 'normal'
        })));
      });
      DB.log('import-base', `Mesclado: ${analise.cliNovos} clientes, ${analise.forNovos} fornecedores`);
      if (window.UI && UI.toast) UI.toast('Importação concluída.', 'v');
      importBase(DB.get());
    };
    const previewBox = el('div', { class: 'mt-4' });
    v.appendChild(el('div', { class: 'card space-y-3' }, [
      el('div', { class: 'text-sm text-slate-600' }, 'Carregue um arquivo JSON com a estrutura { clientes: [...], fornecedores: [...] }. Cada item deve ter ao menos "nome". Documentos (CNPJ/CPF) idênticos aos já cadastrados são ignorados.'),
      el('div', { class: 'grid grid-cols-2 gap-3 mt-2' }, [
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Cadastrados hoje'),
          el('div', { class: 'flex gap-4 mt-2' }, [
            el('div', {}, [
              el('div', { class: 'text-xs text-slate-500' }, 'Clientes'),
              el('div', { class: 'text-2xl font-bold' }, String((st.clientes || []).length))
            ]),
            el('div', {}, [
              el('div', { class: 'text-xs text-slate-500' }, 'Fornecedores'),
              el('div', { class: 'text-2xl font-bold' }, String((st.fornecedores || []).length))
            ])
          ])
        ]),
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold mb-2' }, 'Arquivo'),
          field('JSON de cadastros', fileIn)
        ])
      ]),
      previewBox,
      el('div', { class: 'flex justify-end' }, btnImportar)
    ]));
    refresh();
  }

  // ================= CADASTROS: CLIENTES e FORNECEDORES =================
  // Estado de filtro/paginacao por tela (vive enquanto a aba esta aberta).
  let _cadFiltro = { clientes: { busca: '', uf: '', limite: 50 }, fornecedores: { busca: '', uf: '', limite: 50 } };

  function _normCad(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function _renderCad(tipo, st) {
    const isCli = tipo === 'clientes';
    const lista = (isCli ? st.clientes : st.fornecedores) || [];
    const filtro = _cadFiltro[tipo];
    const v = document.getElementById('view'); v.innerHTML = '';

    // Estados disponiveis
    const ufs = Array.from(new Set(lista.map(x => (x.estado || '').trim().toUpperCase()).filter(Boolean))).sort();

    // Filtragem
    const tokens = _normCad(filtro.busca).split(/\s+/).filter(Boolean);
    const filtrados = lista.filter(x => {
      if (filtro.uf && (x.estado || '').toUpperCase() !== filtro.uf) return false;
      if (!tokens.length) return true;
      const hay = _normCad(`${x.nome || ''} ${x.razaoSocial || ''} ${x.documento || ''} ${x.cidade || ''} ${x.email || ''} ${x.telefone || ''} ${x.tags || ''}`);
      return tokens.every(t => hay.includes(t));
    });

    // Header com contadores e acoes
    const header = el('div', { class: 'flex justify-between items-center flex-wrap gap-2 mb-4' }, [
      el('div', { class: 'text-sm text-slate-600' }, [
        el('span', { class: 'font-bold text-base text-slate-900 dark:text-slate-100' }, String(filtrados.length)),
        el('span', {}, ' de ' + lista.length + ' ' + (isCli ? 'cliente(s)' : 'fornecedor(es)'))
      ]),
      el('div', { class: 'flex gap-2 flex-wrap' }, [
        can('editar') ? el('button', { class: 'btn btn-p', onclick: () => {
          const onSaved = () => _renderCad(tipo, DB.get());
          if (isCli) openCliente(DB.get(), null, { onSaved }); else openFornecedor(DB.get(), null, { onSaved });
        } }, '+ Novo ' + (isCli ? 'cliente' : 'fornecedor')) : null,
        can('editar') ? el('button', { class: 'btn btn-s', onclick: () => openImportCadastros(DB.get(), tipo) }, 'Importar CSV') : null,
        el('button', { class: 'btn btn-s', onclick: () => _exportCad(tipo, filtrados) }, 'Exportar CSV')
      ].filter(Boolean))
    ]);
    v.appendChild(header);

    // Filtros
    const inpBusca = el('input', { class: 'input', placeholder: 'Buscar por nome, CNPJ, cidade, e-mail...', value: filtro.busca });
    const selUf = el('select', { class: 'select' }, [el('option', { value: '' }, 'Todos os estados'), ...ufs.map(u => el('option', { value: u }, u))]);
    selUf.value = filtro.uf;
    let timer = null;
    inpBusca.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        filtro.busca = inpBusca.value;
        filtro.limite = 50;
        _renderCad(tipo, st);
      }, 250);
    };
    selUf.onchange = () => { filtro.uf = selUf.value; filtro.limite = 50; _renderCad(tipo, st); };

    v.appendChild(el('div', { class: 'card mb-4' }, [
      el('div', { class: 'grid grid-cols-3 gap-3' }, [
        el('div', { class: 'col-span-2' }, [el('div', { class: 'text-xs font-medium text-slate-600 mb-1' }, 'Busca'), inpBusca]),
        el('div', {}, [el('div', { class: 'text-xs font-medium text-slate-600 mb-1' }, 'Estado (UF)'), selUf])
      ])
    ]));

    // Tabela
    const visiveis = filtrados.slice(0, filtro.limite);
    const tbl = el('table', {});
    tbl.appendChild(el('thead', {}, el('tr', {}, ['Nome', 'CNPJ/CPF', 'Cidade/UF', 'Telefone', 'E-mail', isCli ? 'Rating' : 'Categoria', 'Ações'].map(h => el('th', {}, h)))));
    const tbody = el('tbody');
    if (!visiveis.length) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: 7, class: 'text-center py-6 text-slate-500' }, lista.length ? 'Nenhum resultado para os filtros aplicados.' : 'Nenhum cadastro ainda.')));
    } else {
      visiveis.forEach(x => {
        const cidUf = [x.cidade, x.estado].filter(Boolean).join(' / ');
        tbody.appendChild(el('tr', {}, [
          el('td', {}, el('div', {}, [
            el('div', { class: 'font-medium' }, x.nome),
            x.razaoSocial && x.razaoSocial !== x.nome ? el('div', { class: 'text-xs text-slate-500' }, x.razaoSocial) : null
          ].filter(Boolean))),
          el('td', {}, x.documento || '—'),
          el('td', {}, cidUf || '—'),
          el('td', {}, x.telefone || '—'),
          el('td', {}, x.email || '—'),
          el('td', {}, isCli ? badge(x.rating || 'bom', x.rating === 'bom' ? 'v' : x.rating === 'atencao' ? 'a' : x.rating === 'risco' ? 'r' : 'g') : (x.categoria || '—')),
          el('td', {}, el('div', { class: 'flex gap-1' }, [
            can('editar') ? el('button', { class: 'btn btn-s', onclick: () => {
              const onSaved = () => _renderCad(tipo, DB.get());
              if (isCli) openCliente(DB.get(), x, { onSaved }); else openFornecedor(DB.get(), x, { onSaved });
            } }, 'Editar') : null,
            can('editar') ? el('button', { class: 'btn btn-d', title: 'Excluir', onclick: () => {
              if (!confirm(`Excluir "${x.nome}"? Movimentos e títulos vinculados mantêm o vínculo histórico mas perderão a referência.`)) return;
              DB.set(s => {
                if (isCli) s.clientes = s.clientes.filter(i => i.id !== x.id);
                else s.fornecedores = s.fornecedores.filter(i => i.id !== x.id);
              });
              UI.toast((isCli ? 'Cliente' : 'Fornecedor') + ' excluído.', 'v');
              _renderCad(tipo, DB.get());
            } }, '×') : null
          ].filter(Boolean)))
        ]));
      });
    }
    tbl.appendChild(tbody);
    v.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));

    // Paginacao "carregar mais"
    if (filtrados.length > filtro.limite) {
      const restantes = filtrados.length - filtro.limite;
      v.appendChild(el('div', { class: 'flex justify-center mt-4' }, [
        el('button', { class: 'btn btn-s', onclick: () => { filtro.limite += 50; _renderCad(tipo, st); } }, `Mostrar mais ${Math.min(50, restantes)} (de ${restantes} restantes)`)
      ]));
    }
  }

  function _exportCad(tipo, lista) {
    const cols = ['nome','razaoSocial','documento','ie','telefone','email','contato','cidade','estado','endereco','bairro','cep','banco','agencia','conta','tipoAtividade','tags'];
    const extras = tipo === 'clientes' ? ['limite','prazo','rating'] : ['categoria','condicao','criticidade'];
    const all = cols.concat(extras);
    const esc = (v) => {
      const s = String(v == null ? '' : v).replace(/"/g, '""');
      return /[;"\n]/.test(s) ? '"' + s + '"' : s;
    };
    const header = all.join(';');
    const rows = lista.map(x => all.map(k => esc(x[k])).join(';'));
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tipo + '-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    UI.toast('CSV exportado: ' + lista.length + ' registros.', 'v');
  }

  function clientes(st) { _renderCad('clientes', st); }
  function fornecedores(st) { _renderCad('fornecedores', st); }

  // ================= IMPORTAR NFS-e (Nota Carioca / ABRASF) =================
  // Aceita .xml individuais ou .zip com varios. Faz parse, dedupe pelo numero
  // da NF, cria titulos a receber, faz match de cliente pelo CNPJ do tomador.
  function importNFSe(st) {
    const v = document.getElementById('view'); v.innerHTML = '';

    let nfsParsed = [];      // NFs extraidas dos XMLs
    let preview = null;       // analise para exibir
    const arquivosLog = [];   // mensagens de processamento por arquivo

    function buildCliMap() {
      const map = {};
      (st.clientes || []).forEach(c => {
        const k = String(c.documento || '').replace(/\D/g, '');
        if (k) map[k] = c;
      });
      return map;
    }
    function buildTitMap() {
      // dedupe por numero da NF (campo "documento" no titulo)
      const map = {};
      (st.titulosReceber || []).forEach(t => {
        const k = String(t.documento || '').trim();
        if (k) map[k] = t;
      });
      return map;
    }

    // Helpers tolerantes a namespaces. tagAny('Numero', root) procura
    // qualquer tag com nome local "Numero", ignorando prefixo / xmlns.
    function tagAny(name, root) {
      const all = root.getElementsByTagNameNS('*', name);
      return all && all.length ? all : root.getElementsByTagName(name);
    }
    function textIn(root, ...names) {
      for (const n of names) {
        const els = tagAny(n, root);
        if (els && els.length && els[0].textContent && els[0].textContent.trim()) return els[0].textContent.trim();
      }
      return '';
    }
    // Acessa subno aninhado: textInPath(root, 'TomadorServico', 'CpfCnpj', 'Cnpj')
    function textInPath(root, ...path) {
      let cur = [root];
      for (const tag of path) {
        const next = [];
        for (const c of cur) {
          const els = tagAny(tag, c);
          for (let i = 0; i < els.length; i++) next.push(els[i]);
        }
        if (!next.length) return '';
        cur = next;
      }
      for (const c of cur) {
        if (c.textContent && c.textContent.trim()) return c.textContent.trim();
      }
      return '';
    }

    function parseXMLString(xmlText) {
      // Tira BOM e espaco branco inicial
      let txt = String(xmlText || '').replace(/^\uFEFF/, '').replace(/^[\s\r\n]+/, '');
      if (!txt.startsWith('<')) {
        throw new Error('Arquivo nao parece ser XML (nao comeca com <)');
      }
      const doc = new DOMParser().parseFromString(txt, 'application/xml');
      const perr = doc.querySelector('parsererror');
      if (perr) {
        const msg = perr.textContent.replace(/\s+/g, ' ').slice(0, 200);
        throw new Error('XML mal formado: ' + msg);
      }
      const rootName = doc.documentElement && doc.documentElement.tagName;

      // Eventos (cancelamento, CCE, etc.) — ignorados com mensagem clara
      if (/^pedRegEvento/i.test(rootName) || tagAny('pedRegEvento', doc).length) {
        const motivo = textIn(doc, 'xMotivo', 'xDesc') || 'evento';
        throw new Error('Arquivo de evento (' + motivo + ') — nao e a NFS-e em si, ignorado.');
      }

      const out = [];

      // ===== Padrao Nacional NFS-e (sped.fazenda.gov.br/nfse) =====
      // Root: <NFSe> com <infNFSe> aninhado
      const padNacNodes = Array.from(tagAny('infNFSe', doc));
      if (padNacNodes.length) {
        const seen = new Set();
        for (const inf of padNacNodes) {
          const numero = textIn(inf, 'nNFSe');
          if (!numero || seen.has(numero)) continue;
          seen.add(numero);

          // Chave (50 digitos) vem do atributo Id ou da tag chNFSe
          const idAttr = inf.getAttribute('Id') || '';
          const chave = idAttr.replace(/^NFS/i, '') || textIn(inf, 'chNFSe') || '';

          // Data emissao: dhEmi do DPS (mais correto) ou dhProc
          const dhEmi = textIn(inf, 'dhEmi');
          const dhProc = textIn(inf, 'dhProc');
          const dataEmissao = ((dhEmi || dhProc) || '').slice(0, 10);

          // Valores
          const valoresInf = tagAny('valores', inf);
          let vLiq = 0, vISSQN = 0, vServ = 0, vBC = 0;
          for (let k = 0; k < valoresInf.length; k++) {
            const v = valoresInf[k];
            const a = parseFloat((textIn(v, 'vLiq') || '0').replace(',', '.'));
            const b = parseFloat((textIn(v, 'vISSQN') || '0').replace(',', '.'));
            const cc = parseFloat((textIn(v, 'vServ') || '0').replace(',', '.'));
            const d = parseFloat((textIn(v, 'vBC') || '0').replace(',', '.'));
            if (a) vLiq = a;
            if (b) vISSQN = b;
            if (cc) vServ = cc;
            if (d) vBC = d;
          }
          const valorBruto = vServ || vBC || vLiq;
          const valorLiquido = vLiq || valorBruto;

          // Tomador
          const tomaNodes = tagAny('toma', inf);
          let cnpjTomador = '', razaoTomador = '';
          if (tomaNodes.length) {
            cnpjTomador = (textIn(tomaNodes[0], 'CNPJ', 'CPF') || '').replace(/\D/g, '');
            razaoTomador = textIn(tomaNodes[0], 'xNome');
          }

          // Discriminacao
          const discriminacao = textIn(inf, 'xDescServ', 'xTribNac', 'xTribMun');

          out.push({
            numero, dataEmissao,
            valorBruto: valorBruto || valorLiquido,
            valorLiquido,
            valorIss: vISSQN,
            cnpjTomador,
            razaoTomador,
            discriminacao: (discriminacao || '').slice(0, 500),
            codVerificacao: chave  // 50-digit chave para dedupe robusto
          });
        }
        return out;
      }

      // ===== ABRASF antigo (Nfse > InfNfse) — formato municipal =====
      let nodes = Array.from(tagAny('InfNfse', doc));
      if (!nodes.length) nodes = Array.from(tagAny('Nfse', doc));
      if (!nodes.length) {
        throw new Error('Nenhum InfNfse ou infNFSe encontrado (raiz: <' + (rootName || '?') + '>)');
      }
      const seen = new Set();
      for (const inf of nodes) {
        const numero = textIn(inf, 'Numero', 'NumeroNfse');
        if (!numero || seen.has(numero)) continue;
        seen.add(numero);
        const dataEmissao = (textIn(inf, 'DataEmissao', 'DataEmissaoRps') || '').slice(0, 10);
        const valorBruto = parseFloat((textIn(inf, 'ValorServicos') || '0').replace(',', '.'));
        const valorLiquido = parseFloat((textIn(inf, 'ValorLiquidoNfse') || '0').replace(',', '.')) || valorBruto;
        const valorIss = parseFloat((textIn(inf, 'ValorIss', 'IssRetido') || '0').replace(',', '.')) || 0;
        const cnpjTomador = (
          textInPath(inf, 'TomadorServico', 'CpfCnpj', 'Cnpj') ||
          textInPath(inf, 'CpfCnpj', 'Cnpj') ||
          textInPath(inf, 'TomadorServico', 'CpfCnpj', 'Cpf') ||
          textInPath(inf, 'CpfCnpj', 'Cpf') ||
          textIn(inf, 'CnpjTomador', 'CpfTomador')
        ).replace(/\D/g, '');
        const razaoTomador = textInPath(inf, 'TomadorServico', 'RazaoSocial') || textIn(inf, 'RazaoSocial', 'RazaoSocialTomador');
        const discriminacao = textInPath(inf, 'Servico', 'Discriminacao') || textIn(inf, 'Discriminacao');
        const codVerificacao = textIn(inf, 'CodigoVerificacao');
        out.push({
          numero, dataEmissao,
          valorBruto: valorBruto || valorLiquido,
          valorLiquido,
          valorIss,
          cnpjTomador,
          razaoTomador,
          discriminacao: (discriminacao || '').slice(0, 500),
          codVerificacao
        });
      }
      return out;
    }

    async function parseArquivo(file) {      return out;
    }

    async function parseArquivo(file) {
      const nome = file.name.toLowerCase();
      if (nome.endsWith('.zip')) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip nao carregou. Verifique sua conexao com internet.');
        const zip = await JSZip.loadAsync(file);
        const entries = [];
        zip.forEach((path, entry) => {
          if (!entry.dir && path.toLowerCase().endsWith('.xml')) entries.push({ path, entry });
        });
        if (!entries.length) { arquivosLog.push(`${file.name}: ZIP sem XML.`); return []; }
        const all = [];
        for (const { path, entry } of entries) {
          try {
            const text = await entry.async('text');
            const itens = parseXMLString(text);
            arquivosLog.push(`${file.name} > ${path}: ${itens.length} NF(s).`);
            all.push(...itens);
          } catch (e) {
            arquivosLog.push(`${file.name} > ${path}: ERRO ${e.message}`);
          }
        }
        return all;
      } else if (nome.endsWith('.xml')) {
        const text = await file.text();
        const itens = parseXMLString(text);
        arquivosLog.push(`${file.name}: ${itens.length} NF(s).`);
        return itens;
      } else {
        arquivosLog.push(`${file.name}: ignorado (nao e .xml nem .zip).`);
        return [];
      }
    }

    function analisar() {
      const cliMap = buildCliMap();
      const titMap = buildTitMap();
      const novos = [];     // nf nova, cliente cadastrado
      const novosSemCliente = []; // nf nova, cliente nao cadastrado
      const jaExistem = []; // nf ja na base

      // dedupe entre os parsed
      const seen = new Set();
      for (const nf of nfsParsed) {
        if (seen.has(nf.numero)) continue;
        seen.add(nf.numero);

        if (titMap[nf.numero]) { jaExistem.push(nf); continue; }
        const cli = nf.cnpjTomador ? cliMap[nf.cnpjTomador] : null;
        if (cli) novos.push({ ...nf, cliente: cli });
        else novosSemCliente.push(nf);
      }
      return { novos, novosSemCliente, jaExistem };
    }

    function refresh() {
      const ja = preview && preview.jaExistem.length;
      previewBox.innerHTML = '';

      if (!nfsParsed.length) {
        previewBox.appendChild(el('div', { class: 'text-slate-500 text-sm' }, 'Selecione XMLs ou um ZIP da Nota Carioca acima.'));
        btnImportar.disabled = true;
        btnImportar.classList.add('opacity-50', 'cursor-not-allowed');
        btnImportar.textContent = 'Selecione um arquivo';
        return;
      }

      preview = analisar();

      // Cards resumo
      previewBox.appendChild(el('div', { class: 'grid grid-cols-3 gap-3 mb-3' }, [
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Novas (cliente OK)'),
          el('div', { class: 'text-2xl font-bold text-green-700 mt-1' }, '+' + preview.novos.length),
          el('div', { class: 'text-xs text-slate-500 mt-1' }, 'Cliente cadastrado · vai importar')
        ]),
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Novas (sem cliente)'),
          el('div', { class: 'text-2xl font-bold text-yellow-600 mt-1' }, '+' + preview.novosSemCliente.length),
          el('div', { class: 'text-xs text-slate-500 mt-1' }, 'Tomador nao cadastrado · vai criar cliente')
        ]),
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Ja na base'),
          el('div', { class: 'text-2xl font-bold text-slate-500 mt-1' }, String(preview.jaExistem.length)),
          el('div', { class: 'text-xs text-slate-500 mt-1' }, 'Mesmo numero ja importado · ignora')
        ])
      ]));

      // Tabela com as NFs
      const tbl = el('table', {});
      tbl.appendChild(el('thead', {}, el('tr', {}, ['NF', 'Emissao', 'Valor', 'Tomador (CNPJ)', 'Status'].map(h => el('th', {}, h)))));
      const tbody = el('tbody');
      const todas = [
        ...preview.novos.map(x => ({ ...x, _tag: 'novo' })),
        ...preview.novosSemCliente.map(x => ({ ...x, _tag: 'sem_cliente' })),
        ...preview.jaExistem.map(x => ({ ...x, _tag: 'existe' }))
      ].slice(0, 100); // limita render
      for (const r of todas) {
        const status = r._tag === 'novo' ? badge('vai importar', 'v')
                     : r._tag === 'sem_cliente' ? badge('cria cliente + importa', 'a')
                     : badge('ja existe', 'g');
        tbody.appendChild(el('tr', {}, [
          el('td', {}, r.numero),
          el('td', {}, fmtDate(r.dataEmissao)),
          el('td', {}, BRL(r.valorLiquido || r.valorBruto)),
          el('td', {}, [
            el('div', {}, r.razaoTomador || '—'),
            el('div', { class: 'text-xs text-slate-500' }, r.cnpjTomador || '—')
          ]),
          el('td', {}, status)
        ]));
      }
      tbl.appendChild(tbody);
      if (todas.length === 100) tbody.appendChild(el('tr', {}, el('td', { colspan: 5, class: 'text-center text-xs text-slate-500 py-2' }, '... (mostrando primeiras 100; importacao processa todas)')));
      previewBox.appendChild(el('div', { class: 'card p-0 overflow-hidden' }, tbl));

      // Log de arquivos
      if (arquivosLog.length) {
        previewBox.appendChild(el('details', { class: 'mt-3 text-xs text-slate-500' }, [
          el('summary', { class: 'cursor-pointer font-bold' }, 'Log de processamento (' + arquivosLog.length + ')'),
          el('pre', { class: 'mt-2 bg-slate-100 dark:bg-slate-800 rounded p-2 max-h-48 overflow-auto' }, arquivosLog.join('\n'))
        ]));
      }

      const total = preview.novos.length + preview.novosSemCliente.length;
      btnImportar.disabled = total === 0;
      btnImportar.classList.toggle('opacity-50', total === 0);
      btnImportar.classList.toggle('cursor-not-allowed', total === 0);
      btnImportar.textContent = total > 0 ? `Importar ${total} NF(s)` : 'Nada para importar';
    }

    const fileIn = el('input', { type: 'file', accept: '.xml,.zip,application/xml,application/zip', multiple: 'true', class: 'input' });
    fileIn.onchange = async () => {
      const files = Array.from(fileIn.files || []);
      if (!files.length) return;
      arquivosLog.length = 0;
      nfsParsed = [];
      previewBox.innerHTML = '<div class="text-sm text-slate-500">Processando arquivos...</div>';
      try {
        for (const f of files) {
          const lista = await parseArquivo(f);
          nfsParsed.push(...lista);
        }
        refresh();
      } catch (e) {
        UI.toast('Erro: ' + e.message, 'r');
        nfsParsed = [];
        refresh();
      }
    };

    const btnImportar = el('button', { class: 'btn btn-p opacity-50 cursor-not-allowed', disabled: true }, 'Selecione um arquivo');
    btnImportar.onclick = () => {
      if (!preview) return;
      const total = preview.novos.length + preview.novosSemCliente.length;
      if (total === 0) return;
      const msg = `Confirma a importacao de ${total} NFS-e?\n\n`
        + `- ${preview.novos.length} novo(s) com cliente ja cadastrado\n`
        + `- ${preview.novosSemCliente.length} nova(s) que vao criar cliente automaticamente\n`
        + `- ${preview.jaExistem.length} ja existente(s) sera(o) ignorada(s)\n\n`
        + `Um snapshot automatico sera criado antes.`;
      if (!confirm(msg)) return;
      DB.snapshot('pre-import-nfse');
      DB.set(s => {
        const cliMap = {};
        (s.clientes || []).forEach(c => {
          const k = String(c.documento || '').replace(/\D/g, '');
          if (k) cliMap[k] = c;
        });
        // Cria clientes faltantes
        for (const nf of preview.novosSemCliente) {
          if (!nf.cnpjTomador) continue;
          if (cliMap[nf.cnpjTomador]) continue;
          const novoCli = {
            id: DB.id(),
            nome: nf.razaoTomador || ('Cliente ' + nf.cnpjTomador),
            razaoSocial: nf.razaoTomador || '',
            documento: nf.cnpjTomador,
            telefone: '', email: '', contato: '',
            cidade: '', estado: '', endereco: '', bairro: '', cep: '',
            banco: '', agencia: '', conta: '',
            ie: '', tipoAtividade: '', tags: 'criado-via-NFS-e',
            limite: 0, prazo: 30, rating: 'bom'
          };
          s.clientes.push(novoCli);
          cliMap[nf.cnpjTomador] = novoCli;
        }
        // Cria os titulos
        const todos = [...preview.novos, ...preview.novosSemCliente];
        for (const nf of todos) {
          const cli = nf.cnpjTomador ? cliMap[nf.cnpjTomador] : null;
          if (!cli) continue;
          s.titulosReceber.push({
            id: DB.id(),
            clienteId: cli.id,
            documento: nf.numero,
            emissao: nf.dataEmissao,
            vencimento: nf.dataEmissao, // padrao: vencimento = emissao; usuario ajusta depois
            valor: nf.valorLiquido || nf.valorBruto || 0,
            valorRecebido: 0,
            status: 'aberto',
            observacao: (nf.discriminacao || '').slice(0, 500),
            origem: 'nfs-e-import',
            codVerificacao: nf.codVerificacao || ''
          });
        }
      });
      DB.log('import-nfse', `${total} NFS-e importadas (${preview.novosSemCliente.length} clientes novos)`);
      UI.toast(`${total} NFS-e importadas.`, 'v');
      // re-renderiza com state atualizado
      importNFSe(DB.get());
    };

    const previewBox = el('div', { class: 'mt-4' });

    v.appendChild(el('div', { class: 'card space-y-3' }, [
      el('div', { class: 'text-sm text-slate-600' }, [
        el('strong', {}, 'Como obter os XMLs: '),
        'No painel ',
        el('a', { href: 'https://notacarioca.rio.gov.br', target: '_blank', class: 'text-blue-600 underline' }, 'Nota Carioca'),
        ' faca login com CNPJ + senha web. Va em "NFS-e Emitidas", filtre por periodo, e clique em "Exportar XML em lote". Salve o ZIP. Aqui voce arrasta esse ZIP (ou XMLs individuais).'
      ]),
      el('div', { class: 'grid grid-cols-2 gap-3' }, [
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold' }, 'Ja cadastrados'),
          el('div', { class: 'flex gap-4 mt-2' }, [
            el('div', {}, [
              el('div', { class: 'text-xs text-slate-500' }, 'Clientes'),
              el('div', { class: 'text-2xl font-bold' }, String((st.clientes || []).length))
            ]),
            el('div', {}, [
              el('div', { class: 'text-xs text-slate-500' }, 'Titulos a receber'),
              el('div', { class: 'text-2xl font-bold' }, String((st.titulosReceber || []).length))
            ])
          ])
        ]),
        el('div', { class: 'card p-3' }, [
          el('div', { class: 'text-xs text-slate-500 uppercase font-bold mb-2' }, 'XMLs / ZIP'),
          field('Arquivos NFS-e', fileIn)
        ])
      ]),
      previewBox,
      el('div', { class: 'flex justify-end' }, btnImportar)
    ]));

    refresh();
  }

  return { dashboard, fluxoCaixa, receber, pagar, margem, config, cenarios, regua, relatorios, auditoria, openImportCSV, conciliacao, empresas, benchmark, usuarios, snapshots, dre, metas, calendario, recorrencias, contas, abc, simulador, openImportCadastros, openTransferencia, orcamento, dfc, emprestimo, socios, consolidado, forecast, impostos, sazonalidade, onboarding, cobrancaLote, openAnexos, openPixQR, interacoes, openInteracao, openRenegociar, abrirRecibo, valorPorExtenso, openBulkEdit, importBase, clientes, fornecedores, importNFSe };
})();
