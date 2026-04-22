/**
 * app.js — Portal Comitê Banabuiú
 * SPA: routing, API fetch, Chart.js, tabelas, KPIs, filtros, export
 */

/* ═══════════════════════════════════════════════════════
   Globals & state
   ═══════════════════════════════════════════════════════ */
const _charts = {};
let _painelAllData = null;  // cache de todos os dados do painel (sem filtro de reservatório/operação)
let _acudesData = null;
let _diarioData = null;
let _docsData   = null;

/* ═══════════════════════════════════════════════════════
   Date header
   ═══════════════════════════════════════════════════════ */
(function setHeaderDate() {
  const dias  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const now   = new Date();
  document.getElementById('header-date').textContent =
    `📅 ${dias[now.getDay()]}, ${String(now.getDate()).padStart(2,'0')} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
})();

/* ═══════════════════════════════════════════════════════
   Navigation
   ═══════════════════════════════════════════════════════ */
function navigate(sectionId) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  const section = document.getElementById(sectionId);
  const btn     = document.querySelector(`.tab-btn[data-section="${sectionId}"]`);
  if (section) section.classList.add('active');
  if (btn)     btn.classList.add('active');

  window.location.hash = sectionId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof window.resizeAllMaps === 'function') {
    setTimeout(() => window.resizeAllMaps(), 60);
  }

  /* Lazy-load first visit */
  if (sectionId === 'painel'      && !_painelAllData) loadPainel();
  if (sectionId === 'acudes'      && !_acudesData)   loadAcudes();
  if (sectionId === 'sedes')                         loadSedes();
  if (sectionId === 'comite')                        loadComite();
  if (sectionId === 'publicacoes')                   loadPublicacoes();
  if (sectionId === 'diario'      && !_diarioData)   loadDiario();
  if (sectionId === 'docs'        && !_docsData)     loadDocs();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.section));
});

/* Hamburger mobile */
document.getElementById('hamburger').addEventListener('click', () => {
  document.querySelector('.header-nav').classList.toggle('open');
});

/* Restore hash on load */
window.addEventListener('DOMContentLoaded', () => {
  const hash = (window.location.hash || '#home').replace('#', '');
  navigate(hash || 'home');
});

/* ═══════════════════════════════════════════════════════
   Loading helpers
   ═══════════════════════════════════════════════════════ */
function showLoading()  { document.getElementById('loading-overlay').style.display = 'flex'; }
function hideLoading()  { document.getElementById('loading-overlay').style.display = 'none'; }

async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════ */
function fmt(v, decimals = 2) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(d) {
  if (!d) return '—';
  const [y,m,dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function populateSelect(id, options, multi = false) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const prev = multi
    ? [...sel.selectedOptions].map(o => o.value)
    : [sel.value];
  sel.innerHTML = options.map(o => `<option value="${escHtml(o)}"${prev.includes(String(o)) ? ' selected' : ''}>${escHtml(o)}</option>`).join('');
}

function getMultiSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return [];
  return [...sel.selectedOptions].map(o => o.value);
}

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function renderKPIs(containerId, kpis) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = kpis.map(k =>
    `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>`
  ).join('');
}

function buildTable(headers, rows, colorFn) {
  const head = `<thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>`;
  const body = rows.map(row => {
    const color = colorFn ? colorFn(row) : null;
    const style = color ? ` style="background:${color.bg};color:${color.text}"` : '';
    return `<tr${style}>${row.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`;
  }).join('');
  return `<table class="data-table">${head}<tbody>${body}</tbody></table>`;
}

/* CSV export */
function arrayToCSV(headers, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  return [headers.map(escape).join(';'), ...rows.map(r => r.map(escape).join(';'))].join('\n');
}

function downloadFile(content, filename, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
}

/* Build query string */
function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(val => p.append(k, val));
    else if (v != null && v !== '') p.set(k, v);
  });
  return p.toString() ? '?' + p.toString() : '';
}

/* ═══════════════════════════════════════════════════════
   PAINEL DE VAZÕES
   ═══════════════════════════════════════════════════════ */
async function loadPainel() {
  showLoading();
  try {
    /* ── 1. Busca todos os dados uma única vez (sem filtro de reservatório/operação)
          Força re-fetch apenas se a unidade mudar ── */
    const curUnit = document.getElementById('painel-sel-unidade').value;
    if (!_painelAllData) {
      const result = await apiFetch('/api/dados/vazoes');
      _painelAllData = result;
      _painelAllData._cachedUnit = 'Ls';
    }

    /* ── 2. Popula os selects na primeira visita ── */
    if (!document.getElementById('painel-sel-res').options.length) {
      const resOpt = ['__all__', ...(_painelAllData.meta.reservatorios || [])];
      const opOpt  = ['__all__', ...(_painelAllData.meta.operacoes || [])];
      populateSelect('painel-sel-res', resOpt, false);
      populateSelect('painel-sel-op',  opOpt,  false);
      document.querySelector('#painel-sel-res option[value="__all__"]').textContent = 'Todos';
      document.querySelector('#painel-sel-op option[value="__all__"]').textContent  = 'Todas';
      document.getElementById('painel-sel-res').value = '__all__';
      document.getElementById('painel-sel-op').value  = '__all__';
    }

    /* ── 3. Filtragem 100% client-side ── */
    const resSel  = document.getElementById('painel-sel-res').value;
    const opSel   = document.getElementById('painel-sel-op').value;
    const dateIni = document.getElementById('painel-data-ini').value;
    const dateFim = document.getElementById('painel-data-fim').value;

    let df = _painelAllData.data.slice();
    if (resSel && resSel !== '__all__') df = df.filter(r => r['Reservatório Monitorado'] === resSel);
    if (opSel  && opSel  !== '__all__') df = df.filter(r => r['Operação'] === opSel);
    if (dateIni) df = df.filter(r => r.Data && r.Data >= dateIni);
    if (dateFim) df = df.filter(r => r.Data && r.Data <= dateFim);

    /* ── 4. Conversão de unidade client-side ── */
    const unidade = curUnit === 'm3s' ? 'm³/s' : 'L/s';
    if (curUnit === 'm3s') {
      df = df.map(r => ({
        ...r,
        'Vazão Operada': r['Vazão Operada'] != null ? r['Vazão Operada'] / 1000 : null,
      }));
    }

    /* ── 5. KPIs ── */
    const reservCount = new Set(df.map(r => r['Reservatório Monitorado'])).size;
    const dates = df.map(r => r.Data).filter(Boolean).sort();
    const diasCount = dates.length >= 2
      ? Math.round((new Date(dates.at(-1)) - new Date(dates[0])) / 86400000) + 1
      : '—';
    renderKPIs('painel-kpis', [
      { label: 'Reservatórios', value: reservCount },
      { label: 'Dias',          value: diasCount },
      { label: 'Última Data',   value: dates.length ? fmtDate(dates.at(-1)) : '—' },
      { label: 'Unidade',       value: unidade },
    ]);

    /* ── 6. Gráfico: evolução da vazão ── */
    const reservs = [...new Set(df.map(r => r['Reservatório Monitorado']).filter(Boolean))];
    const COLORS = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#17becf','#e377c2'];
    const painelLabels = [...new Set(df.map(d => d.Data).filter(Boolean))].sort();
    destroyChart('chart-vazao-evolucao');
    const ctx1 = document.getElementById('chart-vazao-evolucao').getContext('2d');
    _charts['chart-vazao-evolucao'] = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: painelLabels.map(fmtDate),
        datasets: reservs.map((r, i) => {
          const byDate = {};
          df.filter(d => d['Reservatório Monitorado'] === r).forEach(d => { byDate[d.Data] = d['Vazão Operada']; });
          return {
            label: r,
            data: painelLabels.map(dt => byDate[dt] ?? null),
            borderColor: COLORS[i % COLORS.length],
            backgroundColor: 'transparent',
            pointRadius: 3,
            tension: .2,
            spanGaps: true,
          };
        }),
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, 3)} ${unidade}` } },
        },
        scales: {
          x: { title: { display: true, text: 'Data' } },
          y: { title: { display: true, text: `Vazão (${unidade})` } },
        },
      },
    });

    /* ── 7. Gráfico: volume por reservatório ── */
    const volumes = calcVolumes(df);
    destroyChart('chart-vazao-volume');
    const ctx2 = document.getElementById('chart-vazao-volume').getContext('2d');
    _charts['chart-vazao-volume'] = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: volumes.map(v => v.res),
        datasets: [{ label: 'Volume (milhões m³)', data: volumes.map(v => v.vol / 1e6), backgroundColor: '#42a5f5' }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: 'Milhões m³' } } },
      },
    });

    /* ── 8. Gráfico: média mensal ── */
    const mediaMensal = calcMediaMensal(df);
    destroyChart('chart-vazao-media');
    const ctx3 = document.getElementById('chart-vazao-media').getContext('2d');
    const mmLabels  = [...new Set(mediaMensal.map(m => m.mes))];
    const mmReservs = [...new Set(mediaMensal.map(m => m.res))];
    _charts['chart-vazao-media'] = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: mmReservs,
        datasets: mmLabels.map((mes, i) => ({
          label: mes,
          data: mmReservs.map(r => {
            const found = mediaMensal.find(m => m.res === r && m.mes === mes);
            return found ? found.media : 0;
          }),
          backgroundColor: COLORS[i % COLORS.length],
        })),
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true, title: { display: true, text: `Média (${unidade})` } }, y: { stacked: true } },
      },
    });

    /* ── 9. Tabela ── */
    const headers = ['Data', 'Reservatório', 'Operação', `Vazão (${unidade})`];
    const tableRows = df.slice().sort((a, b) => (b.Data || '').localeCompare(a.Data || '')).map(r => [
      fmtDate(r.Data),
      r['Reservatório Monitorado'] || '—',
      r.Operação || '—',
      fmt(r['Vazão Operada'], 3),
    ]);
    document.getElementById('painel-table').innerHTML = buildTable(headers, tableRows);

    /* ── 10. Mapa: última vazão por reservatório (usa dados brutos sem filtro de unidade) ── */
    const latestByRes = {};
    _painelAllData.data.forEach(r => {
      const res = r['Reservatório Monitorado'];
      if (!res) return;
      if (!latestByRes[res] || (r.Data || '') > (latestByRes[res].Data || '')) {
        latestByRes[res] = r;
      }
    });
    initMapPainel(latestByRes);

  } catch (e) {
    console.error('loadPainel:', e);
  } finally {
    hideLoading();
  }
}

function calcVolumes(df) {
  const byRes = {};
  df.forEach(r => {
    const res = r['Reservatório Monitorado'];
    if (!byRes[res]) byRes[res] = [];
    byRes[res].push(r);
  });
  return Object.entries(byRes).map(([res, rows]) => {
    rows = rows.filter(r => r.Data).sort((a,b) => a.Data.localeCompare(b.Data));
    let vol = 0;
    rows.forEach((r, i) => {
      const next = rows[i+1];
      const days = next ? (new Date(next.Data) - new Date(r.Data)) / 86400000 : 1;
      const vazao = parseFloat(r['Vazão Operada']) || 0;
      vol += (vazao / 1000) * 86400 * days;
    });
    return { res, vol };
  }).sort((a,b) => b.vol - a.vol);
}

function calcMediaMensal(df) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const byResMes = {};
  df.forEach(r => {
    if (!r.Data) return;
    const d = new Date(r.Data);
    const mes = `${meses[d.getMonth()]}/${d.getFullYear()}`;
    const key = `${r['Reservatório Monitorado']}||${mes}`;
    if (!byResMes[key]) byResMes[key] = { res: r['Reservatório Monitorado'], mes, vals: [] };
    byResMes[key].vals.push(parseFloat(r['Vazão Operada']) || 0);
  });
  return Object.values(byResMes).map(g => ({ ...g, media: g.vals.reduce((a,b)=>a+b,0)/g.vals.length }));
}

/* ═══════════════════════════════════════════════════════
   AÇUDES
   ═══════════════════════════════════════════════════════ */
const ACUDE_FAIXAS = [
  { min:0,    max:10,  color:'#808080', text:'#fff', status:'Muito Crítica' },
  { min:10.1, max:30,  color:'#ef5350', text:'#fff', status:'Crítica' },
  { min:30.1, max:50,  color:'#fdd835', text:'#000', status:'Alerta' },
  { min:50.1, max:70,  color:'#43a047', text:'#fff', status:'Confortável' },
  { min:70.1, max:100, color:'#1976d2', text:'#fff', status:'Muito Confortável' },
  { min:100.1,max:999, color:'#9c27b0', text:'#fff', status:'Vertendo' },
];

function getAcudeStatus(pct) {
  if (pct == null) return { color:'#fff', text:'#000', status:'N/A' };
  return ACUDE_FAIXAS.find(f => pct >= f.min && pct <= f.max) || { color:'#fff', text:'#000', status:'Não class.' };
}

async function loadAcudes() {
  showLoading();
  try {
    const params = {
      reservatorio: getMultiSelect('acudes-sel-res'),
      municipio:    document.getElementById('acudes-sel-mun').value,
      data_inicio:  document.getElementById('acudes-data-ini').value,
      data_fim:     document.getElementById('acudes-data-fim').value,
      perc_min:     document.getElementById('acudes-perc-min').value,
      perc_max:     document.getElementById('acudes-perc-max').value,
    };
    const result = await apiFetch('/api/dados/acudes' + qs(params));
    _acudesData = result;

    /* Populate selects on first load */
    if (!document.getElementById('acudes-sel-res').options.length) {
      populateSelect('acudes-sel-res', result.meta.reservatorios, true);
      [...document.getElementById('acudes-sel-res').options].forEach(o => o.selected = true);
      /* dates */
      if (result.meta.datas.length) {
        document.getElementById('acudes-data-ini').value = result.meta.datas[0];
        document.getElementById('acudes-data-fim').value = result.meta.datas.at(-1);
      }
    }
    if (!document.getElementById('acudes-sel-mun').options.length || document.getElementById('acudes-sel-mun').options.length === 1) {
      const optMun = document.getElementById('acudes-sel-mun');
      result.meta.municipios.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; optMun.appendChild(o); });
    }

    const df = result.data;

    /* Legend */
    document.getElementById('acudes-legend').innerHTML = ACUDE_FAIXAS.map(f =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${f.color}"></span>${f.status} (${f.min}–${f.max > 900 ? '>' : ''}${f.min > 99 ? '' : f.max}%)</span>`
    ).join('');

    /* Mapa */
    initMapAcudes(df);

    /* Tabela */
    const headers = ['Data', 'Reservatório', 'Município', 'Volume (hm³)', '%', 'Status', 'Cota Sangria', 'Nível', 'Margem'];
    const tableRows = df.sort((a,b) => (b['Data de Coleta'] || '').localeCompare(a['Data de Coleta'] || '')).map(r => {
      const st = getAcudeStatus(r.Percentual);
      return [
        fmtDate(r['Data de Coleta']),
        r.Reservatório || '—',
        r.Município || '—',
        fmt(r.Volume),
        r.Percentual != null ? `${fmt(r.Percentual,1)}%` : '—',
        `<span class="status-cell" style="background:${st.color};color:${st.text}">${st.status}</span>`,
        fmt(r['Cota Sangria']),
        fmt(r.Nivel),
        r['Cota Sangria'] != null && r.Nivel != null ? fmt(r['Cota Sangria'] - r.Nivel) : '—',
      ];
    });
    document.getElementById('acudes-table').innerHTML = buildTable(headers, tableRows);

    /* Legend status */
    document.getElementById('acudes-legend-status').innerHTML = ACUDE_FAIXAS.map(f =>
      `<div class="legend-status-item"><span class="legend-swatch-lg" style="background:${f.color}"></span>${f.status}</div>`
    ).join('');

    /* Chart: volume ao longo do tempo */
    const reservsPivot = [...new Set(df.map(r => r.Reservatório))];
    const datesPivot   = [...new Set(df.map(r => r['Data de Coleta']).filter(Boolean))].sort();
    const COLORS = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#17becf','#e377c2'];

    destroyChart('chart-acudes-volume');
    const ctx = document.getElementById('chart-acudes-volume').getContext('2d');
    _charts['chart-acudes-volume'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: datesPivot.map(fmtDate),
        datasets: reservsPivot.map((r, i) => ({
          label: r,
          data: datesPivot.map(d => {
            const row = df.find(x => x.Reservatório === r && x['Data de Coleta'] === d);
            return row?.Volume ?? null;
          }),
          borderColor: COLORS[i % COLORS.length],
          backgroundColor: 'transparent',
          tension: .2, pointRadius: 3, spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { title: { display: true, text: 'Data' } },
          y: { title: { display: true, text: 'Volume (hm³)' } },
        },
      },
    });

  } catch (e) { console.error('loadAcudes:', e); }
  finally { hideLoading(); }
}

function exportCSV(section) {
  if (section === 'acudes' && _acudesData) {
    const df = _acudesData.data;
    const headers = Object.keys(df[0] || {});
    downloadFile(arrayToCSV(headers, df.map(r => headers.map(h => r[h]))),
      `acudes_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8');
  }
}

/* ═══════════════════════════════════════════════════════
   SEDES / SIMULAÇÕES
   ═══════════════════════════════════════════════════════ */
async function loadSedes() {
  showLoading();
  try {
    const result = await apiFetch('/api/dados/municipios');
    const meta = result.meta || {};
    const data = Array.isArray(result.data) ? result.data : [];

    /* Populate selects */
    const selAcude  = document.getElementById('sedes-sel-acude');
    const selMun    = document.getElementById('sedes-sel-mun');
    const selRegiao = document.getElementById('sedes-sel-regiao');
    if (selAcude.options.length <= 1) {
      (meta.acudes || []).forEach(a => { const o = document.createElement('option'); o.value=a; o.textContent=a; selAcude.appendChild(o); });
      (meta.municipios || []).forEach(m => { const o = document.createElement('option'); o.value=m; o.textContent=m; selMun.appendChild(o); });
      (meta.regioes || []).forEach(r => { const o = document.createElement('option'); o.value=r; o.textContent=r; selRegiao.appendChild(o); });
    }

    const acudeF  = selAcude.value;
    const munF    = selMun.value;
    const regiaoF = selRegiao.value;

    let df = data;
    if (acudeF)  df = df.filter(r => r.Açude === acudeF);
    if (munF)    df = df.filter(r => r.Município === munF);
    if (regiaoF) df = df.filter(r => r['Região Hidrográfica'] === regiaoF);

    /* KPIs */
    const acudes = new Set(df.map(r => r.Açude)).size;
    const munic  = new Set(df.map(r => r.Município)).size;
    renderKPIs('sedes-kpis', [
      { label: 'Açudes', value: acudes },
      { label: 'Municípios', value: munic },
      { label: 'Registros', value: df.length },
    ]);

    /* Mapa */
    initMapSedes(df);

    /* Charts */
    const datapoints = df.filter(r => r.Data && r.Açude).sort((a,b) => a.Data.localeCompare(b.Data));
    const acudesU = [...new Set(datapoints.map(r => r.Açude))];
    const COLORS = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd'];

    const sedesLabels = [...new Set(datapoints.map(r => r.Data).filter(Boolean))].sort();
    destroyChart('chart-sedes-cota');
    const ctx1 = document.getElementById('chart-sedes-cota').getContext('2d');
    _charts['chart-sedes-cota'] = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: sedesLabels.map(fmtDate),
        datasets: acudesU.map((a, i) => {
          const byDate = {};
          datapoints.filter(r => r.Açude === a).forEach(r => { byDate[r.Data] = r['Cota Dia (m)']; });
          return {
            label: a,
            data: sedesLabels.map(dt => byDate[dt] ?? null),
            borderColor: COLORS[i % COLORS.length],
            backgroundColor: 'transparent',
            tension: .2,
            pointRadius: 2,
            spanGaps: true,
          };
        }),
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } },
        scales: { x: { title: { display: true, text: 'Data' } },
          y: { title: { display: true, text: 'Cota (m)' } } } },
    });

    destroyChart('chart-sedes-volume');
    const ctx2 = document.getElementById('chart-sedes-volume').getContext('2d');
    _charts['chart-sedes-volume'] = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: sedesLabels.map(fmtDate),
        datasets: acudesU.map((a, i) => {
          const byDate = {};
          datapoints.filter(r => r.Açude === a).forEach(r => { byDate[r.Data] = r['Volume (m³)']; });
          return {
            label: a,
            data: sedesLabels.map(dt => byDate[dt] ?? null),
            borderColor: COLORS[i % COLORS.length],
            backgroundColor: 'transparent',
            tension: .2,
            pointRadius: 2,
            spanGaps: true,
          };
        }),
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } },
        scales: { x: { title: { display: true, text: 'Data' } },
          y: { title: { display: true, text: 'Volume (m³)' } } } },
    });

    /* Tabela */
    const headers = ['Data', 'Açude', 'Município', 'Cota Dia (m)', 'Volume (m³)', 'Volume (%)', 'Liberação (m³/s)'];
    const rows = df.sort((a,b) => (b.Data||'').localeCompare(a.Data||'')).map(r => [
      fmtDate(r.Data), r.Açude||'—', r.Município||'—',
      fmt(r['Cota Dia (m)']), fmt(r['Volume (m³)']), r['Volume (%)'] != null ? `${fmt(r['Volume (%)'],1)}%` : '—',
      fmt(r['Liberação (m³/s)'], 3),
    ]);
    document.getElementById('sedes-table').innerHTML = buildTable(headers, rows);

  } catch (e) { console.error('loadSedes:', e); }
  finally { hideLoading(); }
}

/* ═══════════════════════════════════════════════════════
   COMITÊ
   ═══════════════════════════════════════════════════════ */
let _comiteAll = null;

async function loadComite() {
  showLoading();
  try {
    if (!_comiteAll) {
      const result = await apiFetch('/api/dados/comite');
      _comiteAll = result;
      populateSelect('comite-sel-seg', result.meta.segmentos, true);
      populateSelect('comite-sel-mun', result.meta.municipios, true);
      [...document.getElementById('comite-sel-seg').options].forEach(o => o.selected = true);
      [...document.getElementById('comite-sel-mun').options].forEach(o => o.selected = true);
    }

    const segSel = getMultiSelect('comite-sel-seg');
    const munSel = getMultiSelect('comite-sel-mun');
    const busca  = (document.getElementById('comite-busca').value || '').toLowerCase().trim();

    let df = _comiteAll.data;
    if (segSel.length) df = df.filter(r => segSel.includes(r.Segmento));
    if (munSel.length) df = df.filter(r => munSel.includes(r.Município));
    if (busca) df = df.filter(r => (r['Nome do(a) representante'] || '').toLowerCase().includes(busca));

    /* Tabela */
    const headers = ['Nome', 'Sigla', 'Função', 'Segmento', 'Diretoria'];
    const rows = df.map(r => [r['Nome (2)'] || r['Nome do(a) representante'], r.Sigla, r.Função, r.Segmento, r.Diretoria]);
    document.getElementById('comite-table').innerHTML = buildTable(headers, rows);

    /* Mapa */
    initMapComite(df);

    /* Charts */
    const segCounts = {};
    df.forEach(r => { const s = r.Segmento || '(vazio)'; segCounts[s] = (segCounts[s] || 0) + 1; });
    const munCounts = {};
    df.forEach(r => { const m = r.Município || '(vazio)'; munCounts[m] = (munCounts[m] || 0) + 1; });

    const COLORS = ['#e53935','#8e24aa','#1e88e5','#43a047','#fb8c00','#6d4c41','#00acc1','#e91e63','#3949ab','#00897b'];

    destroyChart('chart-comite-seg');
    const ctx1 = document.getElementById('chart-comite-seg').getContext('2d');
    _charts['chart-comite-seg'] = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: Object.keys(segCounts),
        datasets: [{ data: Object.values(segCounts), backgroundColor: COLORS }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });

    destroyChart('chart-comite-mun');
    const ctx2 = document.getElementById('chart-comite-mun').getContext('2d');
    const munEntries = Object.entries(munCounts).sort((a,b) => b[1]-a[1]);
    _charts['chart-comite-mun'] = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: munEntries.map(([m]) => m),
        datasets: [{ data: munEntries.map(([,c]) => c), backgroundColor: '#42a5f5', label: 'Contagem' }],
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
    });

  } catch (e) { console.error('loadComite:', e); }
  finally { hideLoading(); }
}

/* ═══════════════════════════════════════════════════════
   PUBLICAÇÕES
   ═══════════════════════════════════════════════════════ */
function extractGdriveThumb(url) {
  if (!url) return '';
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  return url;
}

async function loadPublicacoes() {
  showLoading();
  try {
    const cat   = document.getElementById('pub-sel-cat').value;
    const busca = document.getElementById('pub-busca').value;
    const result = await apiFetch('/api/dados/publicacoes' + qs({ categoria: cat, busca }));

    if (!document.getElementById('pub-sel-cat').options.length || document.getElementById('pub-sel-cat').options.length === 1) {
      result.meta.categorias.forEach(c => { const o = document.createElement('option'); o.value=c; o.textContent=c; document.getElementById('pub-sel-cat').appendChild(o); });
    }

    const df = result.data;
    document.getElementById('pub-count').textContent = `${df.length} publicação(ões) encontrada(s)`;

    document.getElementById('pub-grid').innerHTML = df.map(p => {
      const thumb = extractGdriveThumb(p['Capa_link']);
      const link  = p.Link ? `<a class="pub-card-btn" href="${escHtml(p.Link)}" target="_blank" rel="noopener">🔗 Visualizar</a>` : '<span class="pub-card-btn disabled">Indisponível</span>';
      return `<div class="pub-card">
        ${thumb ? `<img class="pub-card-img" src="${escHtml(thumb)}" alt="${escHtml(p.Título||'capa')}" loading="lazy" onerror="this.style.display='none'" />` : ''}
        <div class="pub-card-body">
          <div class="pub-card-title">${escHtml(p.Título||'Sem título')}</div>
          <div class="pub-card-meta">${escHtml([p['Ano da Publicação'], p.Categoria].filter(Boolean).join(' • '))}</div>
          <div class="pub-card-resumo">${escHtml((p.Resumo||'').slice(0,220))}${(p.Resumo||'').length > 220 ? '…' : ''}</div>
          ${link}
        </div>
      </div>`;
    }).join('');

  } catch (e) { console.error('loadPublicacoes:', e); }
  finally { hideLoading(); }
}

/* ═══════════════════════════════════════════════════════
   ACOMPANHAMENTO DIÁRIO
   ═══════════════════════════════════════════════════════ */
async function loadDiario() {
  showLoading();
  try {
    const res   = getMultiSelect('diario-sel-res');
    const prev  = document.getElementById('diario-prev-date').value;
    const result = await apiFetch('/api/dados/diario' + qs({ reservatorio: res, prev_date: prev }));
    _diarioData = result;

    /* Populate select on first load */
    if (!document.getElementById('diario-sel-res').options.length) {
      populateSelect('diario-sel-res', result.reservatorios, true);
      [...document.getElementById('diario-sel-res').options].forEach(o => o.selected = true);
    }
    if (!prev && result.prev_label) {
      const [dd, mm, yyyy] = result.prev_label.split('/');
      if (dd && mm && yyyy) {
        document.getElementById('diario-prev-date').value = `${yyyy}-${mm}-${dd}`;
      }
    }

    /* Labels */
    document.getElementById('diario-labels').innerHTML =
      result.rows.length
        ? `Data atual: <strong>${escHtml(result.curr_label)}</strong> &nbsp;|&nbsp; Data anterior: <strong>${escHtml(result.prev_label)}</strong>`
        : 'Sem dados.';

    /* Tabela HTML */
    if (result.rows.length) {
      const html = buildDiarioTable(result.rows, result.prev_label, result.curr_label);
      document.getElementById('diario-table').innerHTML = html;
    } else {
      document.getElementById('diario-table').innerHTML = '<p style="color:#888;padding:1rem">Nenhum dado encontrado.</p>';
    }

    /* Charts */
    renderDiarioCharts(result.rows);

  } catch (e) { console.error('loadDiario:', e); }
  finally { hideLoading(); }
}

function buildDiarioTable(rows, prevLabel, currLabel) {
  return `<table class="cota-table"><thead>
    <tr>
      <th rowspan="2">Reservatório</th>
      <th rowspan="2">Capacidade (hm³)</th>
      <th rowspan="2">Cota Sangria</th>
      <th class="group-head" colspan="2">Cota (m)</th>
      <th rowspan="2">Δ Nível</th>
      <th rowspan="2">Δ Volume</th>
      <th class="group-head" colspan="2">Volume (${currLabel})</th>
      <th rowspan="2">Verter (m)</th>
    </tr>
    <tr>
      <th>${escHtml(prevLabel)}</th><th>${escHtml(currLabel)}</th>
      <th>Volume</th><th>Percentual (%)</th>
    </tr>
  </thead><tbody>
  ${rows.map(r => `<tr>
    <td>${escHtml(r.reservatorio)}</td>
    <td>${r.capacidade != null ? fmt(r.capacidade) : '—'}</td>
    <td>${r.cota_sangria != null ? fmt(r.cota_sangria) : '—'}</td>
    <td>${r.nivel_anterior != null ? fmt(r.nivel_anterior) : '—'}</td>
    <td>${r.nivel_atual != null ? fmt(r.nivel_atual) : '—'}</td>
    <td>${fmtVarIcon(r.var_nivel)}</td>
    <td>${r.var_volume != null ? fmt(r.var_volume, 3) + ' m³' : '—'}</td>
    <td>${r.volume != null ? fmt(r.volume) : '—'}</td>
    <td>${r.percentual != null ? fmt(r.percentual) + '%' : '—'}</td>
    <td>${r.verter != null ? fmt(r.verter) : '—'}</td>
  </tr>`).join('')}
  </tbody></table>`;
}

function fmtVarIcon(v) {
  if (v == null) return '—';
  const s = fmt(v);
  if (v > 0) return `${s} <span style="color:#1565c0">▲</span>`;
  if (v < 0) return `${s} <span style="color:#c62828">▼</span>`;
  return s;
}

function renderDiarioCharts(rows) {
  const labels = rows.map(r => r.reservatorio);

  destroyChart('chart-diario-nivel');
  new Chart(document.getElementById('chart-diario-nivel').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Δ Nível (m)', data: rows.map(r => r.var_nivel),
        backgroundColor: rows.map(r => (r.var_nivel||0) >= 0 ? '#1976d2' : '#e53935') }],
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });
  _charts['chart-diario-nivel'] = true;

  destroyChart('chart-diario-vol');
  new Chart(document.getElementById('chart-diario-vol').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Capacidade (m³)', data: rows.map(r => r.capacidade), backgroundColor: 'rgba(148,163,184,.4)' },
        { label: 'Volume (m³)',     data: rows.map(r => r.volume),     backgroundColor: '#1976d2' },
      ],
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
  _charts['chart-diario-vol'] = true;

  destroyChart('chart-diario-delvol');
  new Chart(document.getElementById('chart-diario-delvol').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Δ Volume (m³)', data: rows.map(r => r.var_volume),
        backgroundColor: rows.map(r => (r.var_volume||0) >= 0 ? '#1976d2' : '#e53935') }],
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });
  _charts['chart-diario-delvol'] = true;

  destroyChart('chart-diario-verter');
  new Chart(document.getElementById('chart-diario-verter').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Verter (m)', data: rows.map(r => r.verter),
        backgroundColor: rows.map(r => (r.verter||999) <= 0 ? '#43a047' : '#fdd835') }],
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });
  _charts['chart-diario-verter'] = true;
}

function exportDiarioCSV() {
  if (!_diarioData?.rows?.length) return;
  const headers = ['Reservatório','Capacidade','Cota Sangria','Nível Anterior','Nível Atual','Δ Nível','Δ Volume','Volume','Percentual','Verter'];
  const rows = _diarioData.rows.map(r => [r.reservatorio, r.capacidade, r.cota_sangria, r.nivel_anterior, r.nivel_atual, r.var_nivel, r.var_volume, r.volume, r.percentual, r.verter]);
  downloadFile('\ufeff' + arrayToCSV(headers, rows), 'acompanhamento_diario.csv', 'text/csv;charset=utf-8');
}

function exportDiarioHTML() {
  if (!_diarioData?.rows?.length) return;
  const html = buildDiarioTable(_diarioData.rows, _diarioData.prev_label, _diarioData.curr_label);
  downloadFile(html, 'tabela_diaria.html', 'text/html;charset=utf-8');
}

/* ═══════════════════════════════════════════════════════
   DOCUMENTOS
   ═══════════════════════════════════════════════════════ */
async function loadDocs() {
  showLoading();
  try {
    const ops = getMultiSelect('docs-sel-op');
    const res = getMultiSelect('docs-sel-res');
    const busca = document.getElementById('docs-busca').value;
    const result = await apiFetch('/api/dados/docs' + qs({ operacao: ops, reservatorio: res, busca }));
    _docsData = result;

    if (!document.getElementById('docs-sel-op').options.length) {
      populateSelect('docs-sel-op', result.meta.operacoes, true);
      populateSelect('docs-sel-res', result.meta.reservatorios, true);
      [...document.getElementById('docs-sel-op').options].forEach(o => o.selected = true);
      [...document.getElementById('docs-sel-res').options].forEach(o => o.selected = true);
    }

    const df = result.data;
    document.getElementById('docs-count').textContent = `${df.length} registro(s) encontrado(s)`;

    /* Tabela */
    const head = `<thead><tr>
      <th>Operação</th><th>Reservatório</th><th>Data</th><th>Local</th>
      <th>Parâmetros</th><th>Vazão</th><th>Apresentação</th><th>Ata</th>
    </tr></thead>`;
    const body = df.map(r => {
      function linkify(u) {
        if (!u || ['nan','none','null','-',''].includes(String(u).toLowerCase())) return '—';
        return `<a class="docs-download-btn" href="${escHtml(u)}" target="_blank" rel="noopener">Baixar</a>`;
      }
      let vaz = '—';
      if (r['Vazão média'] && !['nan','none','null',''].includes(String(r['Vazão média']).toLowerCase())) {
        const n = parseFloat(String(r['Vazão média']).replace(',','.'));
        if (!isNaN(n)) vaz = `${Math.round(n).toLocaleString('pt-BR')} l/s`;
      }
      return `<tr>
        <td>${escHtml(r.Operação||'')}</td><td>${escHtml(r['Reservatório/Sistema']||'')}</td>
        <td>${escHtml(r['Data da Reunião']||'')}</td><td>${escHtml(r['Local da Reunião']||'')}</td>
        <td>${escHtml(r['Parâmetros aprovados']||'')}</td><td>${vaz}</td>
        <td>${linkify(r.Apresentação)}</td><td>${linkify(r['Ata da Reunião'])}</td>
      </tr>`;
    }).join('');
    document.getElementById('docs-table').innerHTML = `<table class="data-table">${head}<tbody>${body}</tbody></table>`;

    /* Chart */
    const grouped = {};
    df.forEach(r => {
      const op  = r.Operação;
      const res = r['Reservatório/Sistema'];
      const vaz = parseFloat(String(r['Vazão média']||'').replace(',','.'));
      if (!op || isNaN(vaz)) return;
      const key = `${op}||${res}`;
      if (!grouped[key]) grouped[key] = { op, res, vals: [] };
      grouped[key].vals.push(vaz);
    });
    const aggRows = Object.values(grouped).map(g => ({ op: g.op, res: g.res, media: g.vals.reduce((a,b)=>a+b,0)/g.vals.length }));
    const opsSorted = [...new Set(aggRows.map(r => r.op))].sort((a,b) => {
      const na = parseInt((a||'').match(/\d+/)?.[0]||'0');
      const nb = parseInt((b||'').match(/\d+/)?.[0]||'0');
      return na - nb;
    });
    const resU = [...new Set(aggRows.map(r => r.res))];
    const COLORS = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd'];

    destroyChart('chart-docs-vazao');
    const ctx = document.getElementById('chart-docs-vazao').getContext('2d');
    _charts['chart-docs-vazao'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: opsSorted,
        datasets: resU.map((res, i) => ({
          label: res,
          data: opsSorted.map(op => {
            const found = aggRows.find(r => r.op === op && r.res === res);
            return found ? found.media : 0;
          }),
          backgroundColor: COLORS[i % COLORS.length],
        })),
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 60 }, title: { display: true, text: 'Operação' } },
          y: { stacked: true, title: { display: true, text: 'Vazão Média (l/s)' } },
        },
      },
    });

  } catch (e) { console.error('loadDocs:', e); }
  finally { hideLoading(); }
}

