// Gerador de BR Code PIX estático (copia-e-cola). Não cobra, apenas formata o payload.
// Spec: Manual BR Code / EMV Merchant Presented Mode.
const PIX = (() => {
  function tlv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return id + len + value;
  }

  function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function sanitize(s, max) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s\-.,]/g, '').slice(0, max).trim();
  }

  // chave: CPF, CNPJ, e-mail, telefone (+55...) ou UUID aleatório
  // valor: número (em reais) ou null para valor livre
  // beneficiario: nome (máx 25)
  // cidade: nome (máx 15)
  // txid: identificador (máx 25, default ***)
  function gerar({ chave, valor, beneficiario, cidade = 'SAO PAULO', txid = '***' }) {
    const gui = 'BR.GOV.BCB.PIX';
    const merchantAccount = tlv('00', gui) + tlv('01', chave);
    const payload = [
      tlv('00', '01'),
      tlv('26', merchantAccount),
      tlv('52', '0000'),
      tlv('53', '986'),
      valor ? tlv('54', Number(valor).toFixed(2)) : '',
      tlv('58', 'BR'),
      tlv('59', sanitize(beneficiario, 25) || 'RECEBEDOR'),
      tlv('60', sanitize(cidade, 15) || 'CIDADE'),
      tlv('62', tlv('05', sanitize(txid, 25) || '***'))
    ].join('');
    const toSign = payload + '6304';
    const crc = crc16(toSign);
    return toSign + crc;
  }

  // Renderiza QR Code via API Google Charts (fallback confiável sem dependência local).
  // Para offline total, usar provider local; QR ficará indisponível sem internet.
  function qrUrl(data, size = 220) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  }

  return { gerar, qrUrl };
})();
