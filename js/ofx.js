// Parser OFX simples (SGML/XML). Retorna lista de transações.
const OFX = (() => {
  function normalize(raw) {
    // Cabeçalho SGML pode vir antes do XML. Remove.
    const idx = raw.indexOf('<OFX>');
    const body = idx >= 0 ? raw.slice(idx) : raw;
    // Fecha tags SGML não fechadas (OFX v1): <TAG>valor -> <TAG>valor</TAG>
    return body.replace(/<([A-Z0-9.]+)>\s*([^<\r\n]+?)\s*(?=<)/g, (m, tag, val) =>
      `<${tag}>${val}</${tag}>`
    );
  }

  function pick(xml, tag) {
    const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : '';
  }

  function parse(raw) {
    const xml = normalize(raw);
    const trnRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    const out = [];
    let m;
    while ((m = trnRe.exec(xml))) {
      const chunk = m[1];
      const dtposted = pick(chunk, 'DTPOSTED');
      const amount = pick(chunk, 'TRNAMT');
      const memo = pick(chunk, 'MEMO') || pick(chunk, 'NAME');
      const fitid = pick(chunk, 'FITID');
      const tipoRaw = pick(chunk, 'TRNTYPE');
      const data = dtposted ? `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}` : KPI.today();
      const valor = Math.abs(parseFloat(amount) || 0);
      const tipo = (parseFloat(amount) || 0) >= 0 ? 'entrada' : 'saida';
      out.push({ fitid, data, descricao: memo, tipo, tipoRaw, valor });
    }
    return out;
  }

  // Tenta casar uma transação OFX com movimento previsto (±3 dias, valor exato).
  function match(tx, previstos) {
    const d0 = new Date(tx.data);
    return previstos.find(m => {
      if (m.tipo !== tx.tipo) return false;
      if (Math.abs((+m.valor) - tx.valor) > 0.01) return false;
      const dm = new Date(m.data);
      const diff = Math.abs((dm - d0) / 86400000);
      return diff <= 3;
    });
  }

  return { parse, match };
})();
