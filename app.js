(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const fmtN = (v, d = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });

  // menu mobile
  const burger = $('.burger'), menu = $('#menu');
  burger.addEventListener('click', () => { const o = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });

  // distribuição mensal aproximada da chuva por região (frações do total anual)
  const PROFILE = {
    se: [.17,.14,.12,.06,.05,.03,.03,.02,.05,.08,.10,.15], co: [.16,.14,.14,.08,.03,.01,.01,.02,.04,.09,.13,.15],
    s:  [.11,.10,.09,.07,.07,.07,.07,.06,.08,.10,.08,.10], ne: [.05,.06,.10,.14,.15,.13,.11,.07,.04,.03,.04,.08],
    n:  [.13,.14,.15,.14,.10,.05,.03,.03,.04,.05,.06,.08],
  };
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const SIZES = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000];
  const NOMES = { casa: 'Residencial', condominio: 'Condomínio', empresa: 'Empresa', industria: 'Indústria' };
  const TARIFA_SUG = { casa: 10, condominio: 13, empresa: 15, industria: 15 };
  let last = null;

  const form = $('#simForm'), err = $('#simError');
  const num = (id) => parseFloat(String($('#' + id).value).replace(',', '.'));

  function read() {
    const opt = $('#cidade').selectedOptions[0];
    const usos = [...form.querySelectorAll('input[name=usos]:checked')].map(i => i.value);
    return { tipo: $('#tipo').value, cidade: +$('#cidade').value, cidadeNome: opt.textContent, mm: +opt.dataset.mm, reg: opt.dataset.r,
      area: num('area'), acs: num('acs') || 0, horas: num('horas') || 0, consumo: num('consumo'), tarifa: num('tarifa'), usos, premium: $('#premium').checked };
  }
  function validate(d) {
    const bad = [];
    [['area', d.area >= 10], ['consumo', d.consumo >= 1], ['tarifa', d.tarifa >= 1], ['acs', d.acs >= 0], ['horas', d.horas >= 0 && d.horas <= 24]].forEach(([id, ok]) => {
      $('#' + id).setAttribute('aria-invalid', ok ? 'false' : 'true'); if (!ok) bad.push(id);
    });
    if (!d.usos.length) bad.push('usos');
    if (bad.length) { err.textContent = bad.includes('usos') && bad.length === 1 ? 'Selecione pelo menos um uso desejado.' : 'Confira os campos destacados (valores devem ser positivos).'; err.hidden = false; return false; }
    err.hidden = true; return true;
  }

  function calc(d) {
    const prof = PROFILE[d.reg] || PROFILE.se;
    const chuva = prof.map(f => d.mm * f * d.area * 0.8 / 1000);                 // m³/mês
    const ar = MESES.map((_, i) => d.acs * 1.0 * d.horas * 22 / 1000 * (prof[i] > .07 ? 1 : .6)); // menos uso no inverno/seca
    const share = Math.min(.65, (d.usos.includes('descarga') ? .2 : 0) + (d.usos.includes('irrigacao') ? .05 : 0) + (d.usos.includes('limpeza') ? .05 : 0) + (d.usos.includes('lavagem') ? .15 : 0) + (d.premium ? .2 : 0)); // Premium: + pias/cozinha
    const demanda = d.consumo * share;                                             // m³/mês não potável
    const aproveit = chuva.map((c, i) => Math.min(c + ar[i], demanda));
    const mediaAprov = aproveit.reduce((a, b) => a + b, 0) / 12;
    const mediaCap = chuva.reduce((a, b) => a + b, 0) / 12 + ar.reduce((a, b) => a + b, 0) / 12;
    const eco = mediaAprov * d.tarifa;
    const alvo = Math.min(demanda, mediaCap) / 30 * 6 * 1000;                      // ≈6 dias de reserva (L)
    const res = SIZES.find(s => s >= alvo) || SIZES[SIZES.length - 1];
    const resid = d.tipo === 'casa';
    let preco = (resid ? 4700 : 13000) + 0.6 * res + (d.acs > 0 ? (resid ? 300 : 800) : 0);
    if (d.premium) preco += resid ? 9000 : 23000;
    preco = Math.ceil(preco / 500) * 500;
    return { chuva, ar, demanda, mediaAprov, mediaCap, eco, res, preco, payback: eco > 0 ? preco / eco : Infinity, cobre: demanda > 0 ? Math.min(1, mediaAprov / demanda) : 0 };
  }

  function chart(r) {
    const W = 720, H = 230, pad = 26, bw = (W - pad) / 12;
    const barMax = Math.max(...r.chuva.map((c, i) => c + r.ar[i]), 1);
    const showDem = r.demanda <= barMax * 1.4;
    const max = showDem ? Math.max(barMax, r.demanda) : barMax;
    const y = (v) => H - 28 - (v / max) * (H - 60);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">';
    r.chuva.forEach((c, i) => {
      const x = pad + i * bw + bw * .18, w = bw * .64, a = r.ar[i];
      s += '<rect x="' + x + '" y="' + y(c) + '" width="' + w + '" height="' + (H - 28 - y(c)) + '" rx="5" fill="#1677C9"><title>' + MESES[i] + ': chuva ' + fmtN(c, 1) + ' m³</title></rect>';
      if (a > 0) s += '<rect x="' + x + '" y="' + y(c + a) + '" width="' + w + '" height="' + (y(c) - y(c + a)) + '" rx="3" fill="#22B5D3"><title>' + MESES[i] + ': ar-condicionado ' + fmtN(a, 1) + ' m³</title></rect>';
      s += '<text x="' + (x + w / 2) + '" y="' + (y(c + a) - 6) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#0B3B5C">' + fmtN(c + a) + '</text>';
      s += '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="#4D6275">' + MESES[i] + '</text>';
    });
    const yd = showDem ? y(r.demanda) : 14;
    s += '<line x1="' + pad + '" x2="' + W + '" y1="' + yd + '" y2="' + yd + '" stroke="#12876F" stroke-width="2" stroke-dasharray="6 5"' + (showDem ? '' : ' opacity="0"') + '/>';
    s += '<text x="' + (W - 4) + '" y="' + (yd - 6) + '" text-anchor="end" font-size="12" font-weight="700" fill="#12876F">demanda não potável: ' + fmtN(r.demanda) + ' m³/mês' + (showDem ? '' : ' (acima da escala)') + '</text></svg>';
    $('#chart').innerHTML = s;
    $('#chart').setAttribute('aria-label', 'Captação mensal estimada: ' + MESES.map((m, i) => m + ' ' + fmtN(r.chuva[i] + r.ar[i]) + ' m³').join(', '));
  }

  function render(d, r) {
    $('#kCap').textContent = '≈ ' + fmtN(r.mediaAprov) + ' m³';
    $('#kEco').textContent = '≈ ' + fmtBRL(r.eco);
    $('#kPay').textContent = !isFinite(r.payback) ? '—' : r.payback > 120 ? '> 10 anos' : '≈ ' + fmtN(Math.ceil(r.payback)) + ' meses';
    $('#rKit').textContent = (d.premium ? 'Kit Premium ' : 'Kit Essencial ') + NOMES[d.tipo] + ' · ' + fmtN(r.res) + ' L';
    $('#rDesc').textContent = [d.area > 0 ? 'Captação de chuva' : '', d.acs > 0 ? 'condensado de ' + d.acs + ' aparelhos' : '', 'filtros', 'bomba pressurizadora', 'automação de nível', 'rede exclusiva de reúso', d.premium ? 'tratamento avançado + UV + monitoramento' : ''].filter(Boolean).join(' · ');
    $('#rPrice').textContent = fmtBRL(r.preco);
    $('#eAno').textContent = fmtN(r.mediaAprov * 12 * 1000);
    $('#eCaixas').textContent = fmtN(r.mediaAprov);
    $('#eCobre').textContent = fmtN(r.cobre * 100) + '%';
    chart(r);
    last = { d, r };
  }

  function run(e) {
    if (e) e.preventDefault();
    const d = read();
    if (!validate(d)) return;
    render(d, calc(d));
    const p = new URLSearchParams({ t: d.tipo, c: d.cidade, a: d.area, ac: d.acs, h: d.horas, co: d.consumo, ta: d.tarifa, u: d.usos.join('.'), p: d.premium ? 1 : 0 });
    history.replaceState(null, '', '?' + p.toString() + location.hash);
  }
  form.addEventListener('submit', run);
  form.addEventListener('input', () => { if (last) run(); });
  $('#tipo').addEventListener('change', (e) => { $('#tarifa').value = TARIFA_SUG[e.target.value]; if (e.target.value === 'casa') { if (+$('#area').value === 600) $('#area').value = 120; if (+$('#acs').value === 40) $('#acs').value = 3; if (+$('#consumo').value === 1200) $('#consumo').value = 20; } run(); });

  // estado a partir da URL (link compartilhável)
  const q = new URLSearchParams(location.search);
  if (q.has('t')) {
    $('#tipo').value = q.get('t'); $('#cidade').value = q.get('c') || 0; $('#area').value = q.get('a'); $('#acs').value = q.get('ac'); $('#horas').value = q.get('h');
    $('#consumo').value = q.get('co'); $('#tarifa').value = q.get('ta'); $('#premium').checked = q.get('p') === '1';
    const u = (q.get('u') || '').split('.'); form.querySelectorAll('input[name=usos]').forEach(i => i.checked = u.includes(i.value));
  }
  run();

  // compartilhar / imprimir
  $('#btnShare').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); $('#shareMsg').textContent = 'Link copiado!'; }
    catch { $('#shareMsg').textContent = location.href; }
    setTimeout(() => $('#shareMsg').textContent = '', 4000);
  });
  $('#btnPrint').addEventListener('click', () => {
    if (!last) return; const { d, r } = last;
    const rows = [['Tipo de imóvel', NOMES[d.tipo]], ['Cidade', d.cidadeNome], ['Área de telhado', fmtN(d.area) + ' m²'], ['Aparelhos de ar-condicionado', d.acs + ' (' + d.horas + ' h/dia)'], ['Consumo de água', fmtN(d.consumo) + ' m³/mês'], ['Tarifa considerada', fmtBRL(d.tarifa) + '/m³'],
      ['Água aproveitável', '≈ ' + fmtN(r.mediaAprov) + ' m³/mês'], ['Economia estimada', '≈ ' + fmtBRL(r.eco) + '/mês'], ['Kit recomendado', $('#rKit').textContent], ['Investimento estimado', fmtBRL(r.preco)], ['Retorno estimado', $('#kPay').textContent]];
    $('#printArea').innerHTML = '<img src="logo-horizontal.png" style="height:16mm"><h1>Resumo da simulação</h1><p>' + new Date().toLocaleDateString('pt-BR') + '</p><table>' + rows.map(([a, b]) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>').join('') + '</table><p style="font-size:9pt;color:#4D6275">Estimativa ilustrativa. Valores reais dependem da visita técnica. AquaLoop — projeto acadêmico.</p>';
    window.print();
  });

  // contato
  const cf = $('#contactForm'), cerr = $('#contactError'), modal = $('#modal');
  cf.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    cf.querySelectorAll('[required]').forEach(el => {
      const v = el.type === 'checkbox' ? el.checked : el.value.trim() && el.checkValidity() && (el.type !== 'tel' || el.value.replace(/\D/g, '').length >= 10);
      el.setAttribute('aria-invalid', v ? 'false' : 'true'); if (!v) ok = false;
    });
    if (!ok) { cerr.textContent = 'Preencha nome, telefone (com DDD), e-mail válido e aceite o uso dos dados.'; cerr.hidden = false; return; }
    cerr.hidden = true;
    const data = Object.fromEntries(new FormData(cf));
    if (data.anexar && last) data.simulacao = { kit: $('#rKit').textContent, economia: $('#kEco').textContent, investimento: $('#rPrice').textContent };
    const list = JSON.parse(localStorage.getItem('aqualoop_leads') || '[]'); list.push({ ...data, em: new Date().toISOString() });
    localStorage.setItem('aqualoop_leads', JSON.stringify(list));
    $('#mText').textContent = 'Obrigado, ' + data.nome.split(' ')[0] + '! Sua solicitação foi registrada' + (data.simulacao ? ' com o resultado da simulação (' + data.simulacao.kit + ')' : '') + '. Nossa equipe entrará em contato em até 1 dia útil.';
    modal.hidden = false; $('#mClose').focus(); cf.reset();
  });
  const close = () => { modal.hidden = true; };
  $('#mClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
})();
