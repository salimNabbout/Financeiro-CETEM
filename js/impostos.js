// Calculadora simplificada de impostos para pequeno porte (apenas estimativa).
// Referências oficiais: LC 123/2006 (Simples Nacional) e RIR/2018 (Lucro Presumido).
const Impostos = (() => {

  // Tabela Simples Nacional Anexo I (Comércio) — 2024
  const ANEXO_I = [
    { ate: 180000,    aliq: 0.040,  deduc: 0       },
    { ate: 360000,    aliq: 0.073,  deduc: 5940    },
    { ate: 720000,    aliq: 0.095,  deduc: 13860   },
    { ate: 1800000,   aliq: 0.107,  deduc: 22500   },
    { ate: 3600000,   aliq: 0.143,  deduc: 87300   },
    { ate: 4800000,   aliq: 0.190,  deduc: 378000  }
  ];
  // Anexo III (Serviços em geral)
  const ANEXO_III = [
    { ate: 180000,    aliq: 0.060,  deduc: 0       },
    { ate: 360000,    aliq: 0.112,  deduc: 9360    },
    { ate: 720000,    aliq: 0.135,  deduc: 17640   },
    { ate: 1800000,   aliq: 0.160,  deduc: 35640   },
    { ate: 3600000,   aliq: 0.210,  deduc: 125640  },
    { ate: 4800000,   aliq: 0.330,  deduc: 648000  }
  ];

  function simplesNacional(rbt12, rpa, anexo = 'I') {
    const tabela = anexo === 'III' ? ANEXO_III : ANEXO_I;
    const faixa = tabela.find(f => rbt12 <= f.ate) || tabela[tabela.length - 1];
    const aliqEfetiva = rbt12 > 0 ? ((rbt12 * faixa.aliq) - faixa.deduc) / rbt12 : 0;
    const aliqNormalizada = Math.max(0, aliqEfetiva);
    const impostoMes = rpa * aliqNormalizada;
    return { regime: 'Simples Nacional', anexo, aliqEfetiva: aliqNormalizada, impostoMes, detalhe: `Faixa até ${faixa.ate.toLocaleString('pt-BR')}, alíq ${(faixa.aliq*100).toFixed(2)}%, deduz ${faixa.deduc}` };
  }

  // Lucro Presumido — estimativa: IRPJ 15% + adicional 10% sobre o que exceder 60k/trim; CSLL 9%; PIS 0,65%; COFINS 3% + ISS 5% (serviços) ou ICMS estadual (comércio). Aqui simplificamos para tributos federais + PIS/COFINS.
  function lucroPresumido(rpa, tipo = 'servico') {
    const percPresuncaoIR = tipo === 'comercio' ? 0.08 : 0.32;
    const percPresuncaoCS = tipo === 'comercio' ? 0.12 : 0.32;
    const baseIR = rpa * percPresuncaoIR;
    const baseCS = rpa * percPresuncaoCS;
    const ir = baseIR * 0.15;
    const adicionalIR = Math.max(0, baseIR - 20000) * 0.10; // 20k/mês = 60k/trim
    const csll = baseCS * 0.09;
    const pis = rpa * 0.0065;
    const cofins = rpa * 0.03;
    const iss = tipo === 'servico' ? rpa * 0.05 : 0;
    const icms = tipo === 'comercio' ? rpa * 0.18 : 0; // estimativa média
    const total = ir + adicionalIR + csll + pis + cofins + iss + icms;
    return {
      regime: 'Lucro Presumido', tipo, impostoMes: total,
      composicao: { IR: ir, 'IR adicional': adicionalIR, CSLL: csll, PIS: pis, COFINS: cofins, ISS: iss, ICMS: icms }
    };
  }

  // MEI — R$ 71,60 (serviços) / R$ 72,60 (comércio/indústria) em 2024, aproximado.
  function mei(tipo = 'servico') {
    const valor = tipo === 'comercio' ? 72.60 : 71.60;
    return { regime: 'MEI', impostoMes: valor, detalhe: 'DAS mensal fixo' };
  }

  return { simplesNacional, lucroPresumido, mei, ANEXO_I, ANEXO_III };
})();
