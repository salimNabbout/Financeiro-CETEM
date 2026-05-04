const Reports = (() => {
  function toCSV(rows, headers) {
    const esc = v => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[";,\n]/.test(s) ? `"${s}"` : s;
    };
    const head = headers.map(h => esc(h.label)).join(';');
    const body = rows.map(r => headers.map(h => esc(typeof h.get === 'function' ? h.get(r) : r[h.key])).join(';'));
    return '\uFEFF' + [head, ...body].join('\n'); // BOM para Excel BR
  }

  function download(name, content, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  // Normaliza header: lowercase, sem acento, sem espaco/pontuacao -> 'razao social' vira 'razaosocial'
  function normHeader(h) {
    return String(h).trim().toLowerCase()
      .replace(/\uFEFF/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function parseCSV(text) {
    // Detecta separador: ';' ou ',' ou '\t' (tab) - o que tem mais ocorrencias na 1a linha
    const firstLine = text.split(/\r?\n/)[0];
    const counts = { ';': 0, ',': 0, '\t': 0 };
    for (const ch of firstLine) { if (ch in counts) counts[ch]++; }
    let sep = ';';
    if (counts['\t'] > counts[';'] && counts['\t'] > counts[',']) sep = '\t';
    else if (counts[','] > counts[';']) sep = ',';
    const rows = [];
    let cur = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else {
        if (c === '"') q = true;
        else if (c === sep) { cur.push(field); field = ''; }
        else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else field += c;
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    const header = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/\uFEFF/g, ''));
    return rows.filter(r => r.some(v => v && v.trim() !== '')).map(r => {
      const o = {}; header.forEach((h, i) => o[h] = (r[i] || '').trim()); return o;
    });
  }

  function parseNum(v) {
    if (!v) return 0;
    return Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
  }
  function parseDate(v) {
    if (!v) return KPI.today();
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return KPI.today();
  }

  return { toCSV, download, parseCSV, parseNum, parseDate, normHeader };
})();
