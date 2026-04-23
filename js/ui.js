const UI = (() => {
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };

  function modal(title, bodyNode, onSave) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const close = () => root.innerHTML = '';
    const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } });
    const box = el('div', { class: 'modal' });
    box.appendChild(el('div', { class: 'flex justify-between items-center mb-4' }, [
      el('h2', { class: 'text-lg font-semibold' }, title),
      el('button', { class: 'text-slate-500 hover:text-slate-900 text-xl', onclick: close }, '×')
    ]));
    box.appendChild(bodyNode);
    const footer = el('div', { class: 'flex justify-end gap-2 mt-6' }, [
      el('button', { class: 'btn btn-s', onclick: close }, 'Cancelar'),
      el('button', { class: 'btn btn-p', onclick: () => { if (onSave() !== false) close(); } }, 'Salvar')
    ]);
    box.appendChild(footer);
    bg.appendChild(box);
    root.appendChild(bg);
  }

  function confirmar(msg, onOk) {
    if (window.confirm(msg)) onOk();
  }

  function field(label, input) {
    return el('label', { class: 'block mb-3' }, [
      el('span', { class: 'block text-xs font-medium text-slate-600 mb-1' }, label),
      input
    ]);
  }

  function sparkline(values, color = '#2563eb') {
    if (!values || values.length < 2) return null;
    const w = 120, h = 24, max = Math.max(...values), min = Math.min(...values);
    const rng = max - min || 1;
    const points = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h);
    const p = document.createElementNS(svgNS, 'polyline');
    p.setAttribute('points', points); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', '1.5');
    svg.appendChild(p);
    return svg;
  }

  function kpi(label, value, sem = 'g', hint = '', onClick = null, spark = null) {
    const n = el('div', { class: `card kpi sem-${sem}` + (onClick ? ' cursor-pointer hover:shadow-md' : '') }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value),
      hint ? el('div', { class: 'hint' }, hint) : null,
      spark ? (() => { const s = sparkline(spark.values, spark.color); return s ? el('div', { class: 'mt-1' }, s) : null; })() : null
    ]);
    if (onClick) n.onclick = onClick;
    return n;
  }

  function badge(text, sev) {
    return el('span', { class: `badge badge-${sev}` }, text);
  }

  return { el, modal, confirmar, field, kpi, badge };
})();
