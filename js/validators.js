// validators.js — Validações fortes para formulários.
// Regras brasileiras: CNPJ/CPF com DV, telefone E.164, e-mail RFC-simples, datas ISO.
// Retorno padrão: { ok: true, value: <normalizado> } ou { ok: false, erro: '...' }.
const Validators = (() => {

  // ---------- CPF ----------
  // Algoritmo oficial do DV (mod 11 com pesos 10..2 e 11..2).
  function cpf(raw) {
    if (!raw) return { ok: true, value: '' }; // opcional
    const s = String(raw).replace(/\D/g, '');
    if (s.length !== 11) return { ok: false, erro: 'CPF deve ter 11 dígitos.' };
    if (/^(\d)\1{10}$/.test(s)) return { ok: false, erro: 'CPF inválido (dígitos repetidos).' };
    const calc = (base, start) => {
      let soma = 0;
      for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (start - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    const d1 = calc(s.slice(0, 9), 10);
    const d2 = calc(s.slice(0, 10), 11);
    if (d1 !== parseInt(s[9], 10) || d2 !== parseInt(s[10], 10))
      return { ok: false, erro: 'CPF com dígito verificador inválido.' };
    // Formata como XXX.XXX.XXX-XX
    const f = s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return { ok: true, value: f };
  }

  // ---------- CNPJ ----------
  function cnpj(raw) {
    if (!raw) return { ok: true, value: '' }; // opcional
    const s = String(raw).replace(/\D/g, '');
    if (s.length !== 14) return { ok: false, erro: 'CNPJ deve ter 14 dígitos.' };
    if (/^(\d)\1{13}$/.test(s)) return { ok: false, erro: 'CNPJ inválido (dígitos repetidos).' };
    const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const calc = (base, pesos) => {
      let soma = 0;
      for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * pesos[i];
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = calc(s.slice(0, 12), pesos1);
    const d2 = calc(s.slice(0, 13), pesos2);
    if (d1 !== parseInt(s[12], 10) || d2 !== parseInt(s[13], 10))
      return { ok: false, erro: 'CNPJ com dígito verificador inválido.' };
    const f = s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return { ok: true, value: f };
  }

  // ---------- Documento (aceita CPF ou CNPJ) ----------
  function documento(raw) {
    if (!raw) return { ok: true, value: '' };
    const s = String(raw).replace(/\D/g, '');
    if (s.length === 11) return cpf(raw);
    if (s.length === 14) return cnpj(raw);
    return { ok: false, erro: 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos.' };
  }

  // ---------- E-mail ----------
  const RE_EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
  function email(raw) {
    if (!raw) return { ok: true, value: '' };
    const s = String(raw).trim();
    if (!RE_EMAIL.test(s)) return { ok: false, erro: 'E-mail em formato inválido.' };
    return { ok: true, value: s.toLowerCase() };
  }

  // ---------- Telefone (E.164 para BR; aceita 55DDDNNNNNNNN com 12 ou 13 dígitos) ----------
  function telefone(raw) {
    if (!raw) return { ok: true, value: '' };
    const s = String(raw).replace(/\D/g, '');
    if (s.length < 10) return { ok: false, erro: 'Telefone precisa ter DDD + número (mín. 10 dígitos).' };
    // Normaliza para E.164 BR: se veio sem DDI, prefixa 55
    let v = s;
    if (v.length === 10 || v.length === 11) v = '55' + v; // sem DDI
    if (v.length !== 12 && v.length !== 13) return { ok: false, erro: 'Telefone em formato inesperado (esperado 55DDDNNNNNNNN).' };
    return { ok: true, value: v };
  }

  // ---------- Data ISO (YYYY-MM-DD) ----------
  function dataISO(raw, { permitirVazio = false } = {}) {
    if (!raw) return permitirVazio ? { ok: true, value: '' } : { ok: false, erro: 'Data obrigatória.' };
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, erro: 'Data deve estar em YYYY-MM-DD.' };
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
      return { ok: false, erro: 'Data inexistente no calendário.' };
    if (y < 1900 || y > 2100) return { ok: false, erro: 'Ano fora de um intervalo razoável (1900-2100).' };
    return { ok: true, value: s };
  }

  // ---------- Valor monetário ----------
  // Aceita as formas habituais no Brasil e também a americana:
  //   6            -> 6
  //   6,50         -> 6.50      (BR: vírgula = decimal)
  //   6.50         -> 6.50      (US: ponto com 1-2 casas = decimal)
  //   6.000        -> 6000      (BR: ponto com 3 casas e sem vírgula = milhar)
  //   6.000,50     -> 6000.50   (BR completo)
  //   6,000.50     -> 6000.50   (US completo)
  //   1.234.567,89 -> 1234567.89
  //   R$ 6.000,00  -> 6000      (tolera prefixo e espaços)
  function valor(raw, { min = 0.01, max = 1e9, obrigatorio = true } = {}) {
    if (raw == null || raw === '') {
      return obrigatorio ? { ok: false, erro: 'Valor obrigatório.' } : { ok: true, value: 0 };
    }
    let s = typeof raw === 'number' ? String(raw) : String(raw);
    // Strip prefixo monetário e espaços; mantém dígitos, vírgula, ponto e menos
    s = s.replace(/R\$/gi, '').replace(/\s/g, '').replace(/[^\d,.\-]/g, '');
    if (!s || s === '-' || s === '.' || s === ',') return { ok: false, erro: 'Valor inválido.' };
    const temV = s.indexOf(',') >= 0;
    const temP = s.indexOf('.') >= 0;
    if (temV && temP) {
      // O ÚLTIMO separador é o decimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');      // BR: 1.234,56
      } else {
        s = s.replace(/,/g, '');                        // US: 1,234.56
      }
    } else if (temV) {
      s = s.replace(',', '.');                          // BR: 6,50
    } else if (temP) {
      const pontos = (s.match(/\./g) || []).length;
      if (pontos > 1) {
        s = s.replace(/\./g, '');                        // BR: 1.234.567
      } else {
        // Um único ponto: se o grupo após o ponto tem exatamente 3 dígitos,
        // assumimos milhar (BR); se 1 ou 2, decimal (US ou BR simplificado).
        const aposPonto = s.split('.')[1] || '';
        if (aposPonto.length === 3 && /^\d+$/.test(aposPonto)) {
          s = s.replace('.', '');                        // BR: 6.000
        }
        // senão mantém (ponto é decimal)
      }
    }
    const n = Number(s);
    if (!isFinite(n)) return { ok: false, erro: 'Valor inválido.' };
    if (n < min) return { ok: false, erro: 'Valor mínimo é ' + min.toFixed(2).replace('.', ',') + '.' };
    if (n > max) return { ok: false, erro: 'Valor máximo é ' + max.toLocaleString('pt-BR') + '.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  // ---------- Período (emissão <= vencimento) ----------
  function periodoCoerente(emissao, vencimento, { maxDias = 365 * 10 } = {}) {
    const a = dataISO(emissao, { permitirVazio: true });
    const b = dataISO(vencimento);
    if (!a.ok) return { ok: false, erro: 'Emissão: ' + a.erro };
    if (!b.ok) return { ok: false, erro: 'Vencimento: ' + b.erro };
    if (a.value) {
      if (a.value > b.value) return { ok: false, erro: 'Vencimento não pode ser anterior à emissão.' };
      const dias = (new Date(b.value) - new Date(a.value)) / 86400000;
      if (dias > maxDias) return { ok: false, erro: 'Período entre emissão e vencimento excede o máximo permitido.' };
    }
    return { ok: true, emissao: a.value, vencimento: b.value };
  }

  // ---------- Texto livre (com bound de tamanho e strip de controles) ----------
  function texto(raw, { obrigatorio = true, max = 500, nome = 'Campo' } = {}) {
    const s = String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (obrigatorio && !s) return { ok: false, erro: `${nome} é obrigatório.` };
    if (s.length > max) return { ok: false, erro: `${nome} excede ${max} caracteres.` };
    return { ok: true, value: s };
  }

  // ---------- Helper: valida múltiplos campos, retorna 1º erro ou objeto normalizado ----------
  function validarTudo(campos) {
    const out = {};
    for (const [nome, resultado] of Object.entries(campos)) {
      if (!resultado.ok) return { ok: false, campo: nome, erro: resultado.erro };
      out[nome] = resultado.value ?? resultado.vencimento ?? resultado.emissao;
    }
    return { ok: true, campos: out };
  }

  return { cpf, cnpj, documento, email, telefone, dataISO, valor, periodoCoerente, texto, validarTudo };
})();
