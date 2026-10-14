/* MilkGuard AI · client app
 * Talks to the REST API described in the spec. If the backend is unreachable
 * (e.g. opening index.html straight from disk) a local rule-based engine backed
 * by localStorage answers the same routes, so the UI is fully usable offline.
 */
(() => {
'use strict';

/* ======================= helpers ======================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = (n, d = 1) => (Number.isFinite(+n) ? (+n).toFixed(d) : '–');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const API_BASE = '';
const PURE = { temperature: 36.5, ph: 6.70, color: 255, fat: 1, turbidity: 1 };

const SOURCE_LABEL = { lab: 'Interactive Lab Test', iot: 'ESP32 IoT Node', preset: 'Preset Scenario' };
const SOURCE_CLASS = { lab: 'lab', iot: 'iot', preset: 'preset' };
const normSource = (s) => {
  const t = String(s || '').toLowerCase();
  if (t.includes('esp') || t.includes('iot')) return 'iot';
  if (t.includes('preset')) return 'preset';
  return 'lab';
};

const PRESETS = [
  { id: 'standard', emoji: '🥛', cls: 'pure',   tag: 'Pure',
    name: 'Standard Whole Milk (Intact Solids)',
    desc: 'Fresh, chilled whole milk with intact fat globules and solids-not-fat. Reference baseline.',
    values: { temperature: 38.0, fat: 1, turbidity: 1, color: 255, ph: 6.80 } },
  { id: 'buffer', emoji: '⚗️', cls: 'mild',   tag: 'Mild Buffer',
    name: 'Mild Alkaline Buffer (Urea / Sodium Bicarbonate)',
    desc: 'Buffers added to mask souring and extend shelf life. Slightly elevated pH, otherwise looks normal.',
    values: { temperature: 40.0, fat: 1, turbidity: 1, color: 250, ph: 7.40 } },
  { id: 'detergent', emoji: '🧴', cls: 'severe', tag: 'Severe',
    name: 'Severe Detergent / Caustic Soda Adulteration',
    desc: 'Detergent emulsifier or caustic soda creating artificial foam and body. Strongly alkaline.',
    values: { temperature: 42.0, fat: 0, turbidity: 0, color: 246, ph: 8.60 } },
  { id: 'soured', emoji: '🦠', cls: 'severe', tag: 'Severe',
    name: 'Soured / Curdled Spoiled Milk',
    desc: 'Lactic acid fermentation from bacterial growth in warm storage. Strongly acidic.',
    values: { temperature: 48.0, fat: 1, turbidity: 0, color: 248, ph: 4.60 } },
  { id: 'water', emoji: '💧', cls: 'severe', tag: 'Severe',
    name: 'Heavy Water Dilution Adulteration',
    desc: 'Bulk dilution with water: fat and solids depleted, whiteness reduced, pH drifts low.',
    values: { temperature: 36.0, fat: 0, turbidity: 0, color: 240, ph: 6.20 } },
];

/* ======================= local engine (offline fallback) ======================= */
const LS_HISTORY = 'milkguard.history.v1';
const LS_STREAM  = 'milkguard.stream.v1';
const LS_SEQ     = 'milkguard.seq.v1';
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

function classifyLocal(v) {
  const t = +v.temperature, ph = +v.ph, c = +v.color, fat = +v.fat, turb = +v.turbidity;
  const warnings = [];
  let risk = 0;

  if (ph > 6.8) { risk += Math.min(60, (ph - 6.8) * 50); warnings.push(`pH ${fmt(ph,2)} is above the normal 6.50–6.80 range (alkaline).`); }
  else if (ph < 6.5) { risk += Math.min(60, (6.5 - ph) * 30); warnings.push(`pH ${fmt(ph,2)} is below the normal 6.50–6.80 range (acidic).`); }
  if (fat === 0)  { risk += 15; warnings.push('Fat globules depleted / absent.'); }
  if (turb === 0) { risk += 15; warnings.push('Low turbidity: solids-not-fat depleted.'); }
  if (t < 35 || t > 38) { risk += Math.min(15, (t > 38 ? t - 38 : 35 - t) * 3); warnings.push(`Temperature ${fmt(t)} °C is outside 35.0–38.0 °C.`); }
  if (c < 255) { risk += Math.min(18, (255 - c) * 1.2); if (c < 247) warnings.push(`Colour whiteness ${c} is below the normal band.`); }

  let adulterant = 'None - Pure Milk';
  if (ph >= 8.0) adulterant = 'Detergent / Soda Neutralizer';
  else if (ph <= 5.5 || (ph < 6.2 && turb === 0 && fat === 1)) adulterant = 'Bacterial Souring / Lactic Acid';
  else if (fat === 0 && turb === 0 && ph < 7.0) adulterant = 'Water Dilution';
  else if (ph >= 7.0) adulterant = 'Alkaline Buffer (Urea / Sodium Bicarbonate)';
  else if (risk >= 50) adulterant = 'Multiple Parameter Deviation';
  else if (risk >= 15) adulterant = 'Minor Deviation (Non-adulterant)';

  const severity = risk >= 50 ? 'severe' : risk >= 15 ? 'mild' : 'none';
  const lowP = 1 / (1 + Math.exp(-(risk - 50) / 10));
  const low = clamp(lowP * 100, 0.5, 99.5);
  return {
    grade: risk >= 50 ? 'LOW' : 'MEDIUM',
    confidence: { medium: +(100 - low).toFixed(2), low: +low.toFixed(2) },
    adulterant_type: adulterant, severity, warnings,
  };
}

function nextSeq() { const n = (lsGet(LS_SEQ, 0) | 0) + 1; lsSet(LS_SEQ, n); return n; }

function makeRecord(body, result) {
  const id = nextSeq();
  return {
    id,
    sample_name: (body.sample_name || '').trim() || `MLK-${String(id).padStart(4, '0')}`,
    notes: body.notes || '',
    timestamp: new Date().toISOString(),
    temperature: +body.temperature, ph: +body.ph, color: +body.color, fat: +body.fat, turbidity: +body.turbidity,
    grade: result.grade,
    confidence: Math.max(result.confidence.medium, result.confidence.low),
    confidence_detail: result.confidence,
    adulterant_type: result.adulterant_type,
    severity: result.severity,
    source: normSource(body.source),
  };
}

function statsLocal(list) {
  const total = list.length, low = list.filter(s => s.grade === 'LOW').length, med = total - low;
  const avg = (k) => total ? list.reduce((a, s) => a + (+s[k] || 0), 0) / total : 0;
  return {
    total_tested: total, medium_count: med, low_count: low,
    medium_pct: total ? +(med / total * 100).toFixed(1) : 0,
    low_pct: total ? +(low / total * 100).toFixed(1) : 0,
    adulteration_rate_pct: total ? +(low / total * 100).toFixed(1) : 0,
    avg_ph: +avg('ph').toFixed(2), avg_temp: +avg('temperature').toFixed(1),
  };
}

function csvLocal(list) {
  const cols = ['id','sample_name','notes','timestamp','temperature','ph','color','fat','turbidity','grade','confidence','adulterant_type','source'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...list.map(s => cols.map(c => q(s[c])).join(','))].join('\n');
}

function localRoute(method, path, body) {
  const url = new URL(path, 'http://local');
  const p = url.pathname;
  const hist = () => lsGet(LS_HISTORY, []);

  if (method === 'POST' && p === '/api/predict') {
    const r = classifyLocal(body);
    let saved = null;
    if (body.save_sample) { saved = makeRecord(body, r); lsSet(LS_HISTORY, [saved, ...hist()].slice(0, 1000)); }
    return { ...r, saved_sample: saved };
  }
  if (method === 'GET' && p === '/api/history') {
    let list = hist();
    const g = url.searchParams.get('grade'), s = (url.searchParams.get('search') || '').toLowerCase(), lim = +url.searchParams.get('limit');
    if (g && g !== 'all') list = list.filter(x => x.grade === g.toUpperCase());
    if (s) list = list.filter(x => [x.sample_name, x.notes, x.adulterant_type].join(' ').toLowerCase().includes(s));
    if (lim > 0) list = list.slice(0, lim);
    return { samples: list, count: list.length };
  }
  if (method === 'GET' && p === '/api/history/stats') return statsLocal(hist());
  if (method === 'POST' && p === '/api/history/clear') { lsSet(LS_HISTORY, []); return { ok: true }; }
  if (method === 'DELETE' && p.startsWith('/api/history/')) {
    const id = +p.split('/').pop(); lsSet(LS_HISTORY, hist().filter(x => x.id !== id)); return { ok: true };
  }
  if (method === 'GET' && p === '/api/history/export/csv') return { __csv: csvLocal(hist()) };
  if (method === 'GET' && p === '/api/presets') return { presets: PRESETS };
  if (method === 'GET' && p === '/api/esp32/live') {
    const stream = lsGet(LS_STREAM, []);
    const connected = stream.length > 0 && (Date.now() - new Date(stream[0].timestamp).getTime()) < 60000;
    return { stream, connected };
  }
  if (method === 'POST' && p === '/api/esp32/telemetry') {
    const r = classifyLocal(body);
    const packet = {
      timestamp: new Date().toISOString(), device_id: body.device_id || 'ESP32-NODE-01',
      temperature: +body.temperature, ph: +body.ph, fat: +body.fat, turbidity: +body.turbidity, color: +body.color,
      grade: r.grade, adulterant_type: r.adulterant_type, confidence: r.confidence,
    };
    lsSet(LS_STREAM, [packet, ...lsGet(LS_STREAM, [])].slice(0, 50));
    const rec = makeRecord({ ...body, sample_name: `${packet.device_id}-${String(Date.now()).slice(-5)}`, notes: 'Automatic IoT telemetry', source: 'iot' }, r);
    lsSet(LS_HISTORY, [rec, ...hist()].slice(0, 1000));
    return { ...r, packet, saved_sample: rec };
  }
  throw new Error('Unknown route ' + method + ' ' + p);
}

/* ======================= API client ======================= */
let backendLive = null;
function setConn(live) {
  if (backendLive === live) return;
  backendLive = live;
  const pill = $('#connPill');
  pill.classList.toggle('live', live); pill.classList.toggle('demo', !live);
  $('#connText').textContent = live ? 'Backend API connected' : 'Offline demo mode (local storage)';
}

async function api(method, path, body) {
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(API_BASE + path, {
      method, signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    clearTimeout(to);
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || (!ct.includes('json') && !ct.includes('csv'))) throw new Error('HTTP ' + res.status);
    setConn(true);
    return ct.includes('json') ? await res.json() : { __csv: await res.text() };
  } catch (err) {
    setConn(false);
    return localRoute(method, path, body);
  }
}

/* ======================= sensor logic (UI side) ======================= */
function sensorChecks(v) {
  const t = +v.temperature, ph = +v.ph, c = +v.color, fat = +v.fat, turb = +v.turbidity;
  const out = [];
  out.push(t >= 35 && t <= 38
    ? { k:'ok', name:'Temperature', val:`${fmt(t)} °C`, msg:'Within the 35.0–38.0 °C collection window.' }
    : { k: (t > 45 || t < 30) ? 'bad' : 'warn', name:'Temperature', val:`${fmt(t)} °C`, msg: t > 38 ? 'Elevated: accelerates bacterial growth and can mask spoilage.' : 'Below the expected collection range.' });
  out.push(ph >= 6.5 && ph <= 6.8
    ? { k:'ok', name:'pH Acidity', val:fmt(ph,2), msg:'Normal fresh-milk acidity (6.50–6.80).' }
    : ph > 6.8
      ? { k: ph >= 8 ? 'bad' : 'warn', name:'pH Acidity', val:fmt(ph,2), msg: ph >= 8 ? 'Strongly alkaline: indicates detergent or caustic soda neutralizer.' : 'Alkaline drift: possible urea or bicarbonate buffer.' }
      : { k: ph <= 5.5 ? 'bad' : 'warn', name:'pH Acidity', val:fmt(ph,2), msg: ph <= 5.5 ? 'Strongly acidic: lactic fermentation / souring.' : 'Slightly acidic: early souring or dilution.' });
  out.push(c >= 250
    ? { k:'ok', name:'Color Whiteness', val:`${c}`, msg:'Healthy white reading.' }
    : { k: c >= 244 ? 'warn' : 'bad', name:'Color Whiteness', val:`${c}`, msg: c >= 244 ? 'Slightly off-white: possible additives or dilution.' : 'Markedly reduced whiteness.' });
  out.push(fat === 1
    ? { k:'ok', name:'Fat Globules', val:'Present', msg:'Normal milkfat globules detected.' }
    : { k:'bad', name:'Fat Globules', val:'Depleted', msg:'Fat absent: skimmed, emulsified or heavily diluted.' });
  out.push(turb === 1
    ? { k:'ok', name:'Turbidity SNF', val:'High', msg:'Solids-not-fat intact.' }
    : { k:'bad', name:'Turbidity SNF', val:'Low', msg:'Watery opacity: SNF depleted (dilution or curdling).' });
  return out;
}

const milkRGB = (c) => {
  const d = 255 - clamp(+c || 0, 0, 255);
  return `rgb(255, ${clamp(255 - d * 2, 120, 255)}, ${clamp(255 - d * 6, 60, 255)})`;
};

function gradeBadge(g) {
  const gradeStr = String(g || '').toUpperCase();
  return gradeStr === 'LOW'
    ? '<span class="grade low">⚠ LOW</span>'
    : '<span class="grade medium">✔ MEDIUM</span>';
}
function sensorBadges(s) {
  const t = +s.temperature, ph = +s.ph, c = +s.color;
  const cls = (ok, warn) => ok ? 'ok' : warn ? 'warn' : 'bad';
  return `<div class="sensor-badges">
    <span class="sb ${cls(t>=35&&t<=38, t>=30&&t<=45)}">🌡 ${fmt(t)}°C</span>
    <span class="sb ${cls(ph>=6.5&&ph<=6.8, ph>=5.6&&ph<8)}">pH ${fmt(ph,2)}</span>
    <span class="sb ${+s.fat===1?'ok':'bad'}">Fat ${+s.fat}</span>
    <span class="sb ${+s.turbidity===1?'ok':'bad'}">Turb ${+s.turbidity}</span>
    <span class="sb ${cls(c>=250, c>=244)}">RGB ${c}</span>
  </div>`;
}
const when = (iso) => {
  const d = new Date(iso); if (isNaN(d)) return '–';
  return `${d.toLocaleDateString([], { day:'2-digit', month:'short', year:'numeric' })}<small>${d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</small>`;
};

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toastHost').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2800);
}

/* ======================= tabs ======================= */
let activeTab = 'bench';
function showTab(name) {
  activeTab = name;
  $$('.tab').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'tab-' + name));
  if (name === 'history') loadHistory();
  if (name === 'esp32') loadStream();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ======================= TAB 1: bench ======================= */
const f = {
  name: $('#sampleName'), notes: $('#sampleNotes'),
  temp: $('#inTemp'), ph: $('#inPh'), color: $('#inColor'), fat: $('#inFat'), turb: $('#inTurb'),
};
let lastBenchSample = null;

function updateDot() { $('#colorDot').style.background = milkRGB(f.color.value); }
f.color.addEventListener('input', updateDot);

function readForm() {
  return {
    temperature: parseFloat(f.temp.value), ph: parseFloat(f.ph.value), color: parseInt(f.color.value, 10),
    fat: parseInt(f.fat.value, 10), turbidity: parseInt(f.turb.value, 10),
  };
}
function validateForm() {
  const v = readForm(); let ok = true;
  const rules = [[f.temp, v.temperature, 0, 100], [f.ph, v.ph, 0, 14], [f.color, v.color, 0, 255]];
  rules.forEach(([el, val, lo, hi]) => {
    const bad = !Number.isFinite(val) || val < lo || val > hi;
    el.classList.toggle('invalid', bad); if (bad) ok = false;
  });
  return ok;
}
function setForm(v, meta) {
  f.temp.value = fmt(v.temperature, 1); f.ph.value = fmt(v.ph, 2); f.color.value = v.color;
  f.fat.value = String(v.fat); f.turb.value = String(v.turbidity);
  if (meta) { if (meta.name !== undefined) f.name.value = meta.name; if (meta.notes !== undefined) f.notes.value = meta.notes; }
  $$('.invalid').forEach(e => e.classList.remove('invalid'));
  updateDot();
}
function resetForm() { setForm(PURE); toast('Defaults restored: pure whole milk'); }

async function nextId() {
  let max = 0;
  try {
    const { samples } = await api('GET', '/api/history?limit=1000');
    samples.forEach(s => { const m = /(\d+)\s*$/.exec(s.sample_name || ''); if (m) max = Math.max(max, +m[1]); });
    max = Math.max(max, samples.length);
  } catch { /* ignore */ }
  return `MLK-${String(max + 1).padStart(4, '0')}`;
}
$('#genIdBtn').addEventListener('click', async () => { f.name.value = await nextId(); });

function renderResult(r, values) {
  $('#resultsEmpty').hidden = true; $('#resultsBody').hidden = false;
  const gradeStr = String(r.grade || '').toUpperCase();
  const low = gradeStr === 'LOW';
  const banner = $('#verdictBanner');
  banner.className = 'verdict ' + (low ? 'low' : 'medium');
  $('#verdictIcon').textContent = low ? '⚠' : '✔';
  $('#verdictLabel').textContent = low ? 'LOW QUALITY (Severe Adulteration / Spoilage)' : 'MEDIUM QUALITY (Mild / Standard)';
  $('#verdictSub').textContent = low ? 'Reject batch: do not use for consumption or processing.' : 'Batch is acceptable for standard handling.';
  const m = +r.confidence.medium, l = +r.confidence.low;
  $('#barMedium').style.width = '0%'; $('#barLow').style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => { $('#barMedium').style.width = m + '%'; $('#barLow').style.width = l + '%'; }));
  $('#pctMedium').textContent = fmt(m, 1) + '%'; $('#pctLow').textContent = fmt(l, 1) + '%';
  const sev = r.severity || (low ? 'severe' : 'none');
  const ad = $('#adulterantBadge');
  ad.className = 'adulterant-badge ' + sev;
  ad.textContent = (sev === 'none' ? '✅ ' : sev === 'mild' ? '⚠️ ' : '☣️ ') + (r.adulterant_type || 'None - Pure Milk');
  $('#checklist').innerHTML = sensorChecks(values).map(c => `
    <li class="check ${c.k}">
      <span class="check-ico">${c.k === 'ok' ? '✓' : c.k === 'warn' ? '!' : '✕'}</span>
      <div><div class="check-name">${esc(c.name)}</div><div class="check-msg">${esc(c.msg)}</div></div>
      <span class="check-val">${esc(c.val)}</span>
    </li>`).join('');
}

async function runTest({ source = 'lab', silent = false } = {}) {
  if (!validateForm()) { toast('Please enter valid sensor values.', 'err'); return null; }
  const v = readForm();
  const btn = $('#runBtn'); btn.disabled = true;
  try {
    const payload = {
      ...v, sample_name: f.name.value.trim(), notes: f.notes.value.trim(), source, save_sample: true,
    };
    if (!payload.sample_name) { payload.sample_name = await nextId(); f.name.value = payload.sample_name; }
    const r = await api('POST', '/api/predict', payload);
    lastBenchSample = r.saved_sample || null;
    renderResult(r, v);
    refreshNavCount();
    const gradeStr = String(r.grade || '').toUpperCase();
    if (!silent) toast(`Recorded ${payload.sample_name}: ${gradeStr}`, gradeStr === 'LOW' ? 'err' : 'ok');
    return r;
  } catch (e) {
    toast('Test failed: ' + e.message, 'err'); return null;
  } finally { btn.disabled = false; }
}

$('#benchForm').addEventListener('submit', (e) => { e.preventDefault(); runTest(); });
$('#resetBtn').addEventListener('click', resetForm);
$('#benchForm').addEventListener('input', (e) => { if (e.target.classList?.contains('invalid')) e.target.classList.remove('invalid'); });

async function refreshNavCount() {
  try { const s = await api('GET', '/api/history/stats'); $('#navCount').textContent = s.total_tested; } catch { /* ignore */ }
}

/* ======================= TAB 2: history ======================= */
let hFilter = 'all', hSearch = '', hCache = [];

async function loadStats() {
  const s = await api('GET', '/api/history/stats');
  $('#kpiTotal').textContent = s.total_tested;
  $('#kpiMedium').textContent = s.medium_count; $('#kpiMediumPct').textContent = fmt(s.medium_pct, 1) + '% of samples';
  $('#kpiLow').textContent = s.low_count;       $('#kpiLowPct').textContent = fmt(s.low_pct, 1) + '% of samples';
  $('#kpiRate').textContent = fmt(s.adulteration_rate_pct, 1) + '%';
  $('#kpiPh').textContent = s.total_tested ? fmt(s.avg_ph, 2) : '–';
  $('#kpiTemp').textContent = s.total_tested ? fmt(s.avg_temp, 1) : '–';
  $('#navCount').textContent = s.total_tested;
}

async function loadHistory() {
  const qs = new URLSearchParams({ limit: '500' });
  if (hFilter !== 'all') qs.set('grade', hFilter);
  if (hSearch) qs.set('search', hSearch);
  const [{ samples }] = await Promise.all([api('GET', '/api/history?' + qs), loadStats()]);
  hCache = samples;
  renderHistory();
}

function renderHistory() {
  const body = $('#historyBody');
  $('#historyEmpty').hidden = hCache.length > 0;
  $('#historyTable').style.display = hCache.length ? '' : 'none';
  body.innerHTML = hCache.map(s => {
    const src = normSource(s.source);
    const conf = s.confidence_detail ? Math.max(s.confidence_detail.medium, s.confidence_detail.low) : (typeof s.confidence === 'object' ? Math.max(s.confidence.medium, s.confidence.low) : s.confidence || (String(s.grade).toUpperCase() === 'MEDIUM' ? s.conf_medium : s.conf_low));
    return `<tr data-id="${esc(s.id)}">
      <td class="id-cell">#${esc(s.id)}</td>
      <td><div class="sample-name">${esc(s.sample_name)}</div><div class="sample-notes" title="${esc(s.notes)}">${esc(s.notes) || '<span style="color:#94a3b8">No notes</span>'}</div></td>
      <td class="when">${when(s.timestamp)}</td>
      <td>${sensorBadges(s)}</td>
      <td>${gradeBadge(s.grade)}</td>
      <td class="conf">${fmt(conf, 1)}%</td>
      <td>${esc(s.adulterant_type || '–')}</td>
      <td><span class="src ${SOURCE_CLASS[src]}">${SOURCE_LABEL[src]}</span></td>
      <td><div class="row-actions">
        <button class="ra" data-act="inspect" title="Inspect forensic breakdown">🔍 Inspect</button>
        <button class="ra" data-act="load" title="Load into testing form">🧪 Load</button>
        <button class="ra del" data-act="delete" title="Delete record">🗑️ Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

$('#historyBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const s = hCache.find(x => String(x.id) === String(id)); if (!s) return;
  if (btn.dataset.act === 'inspect') openModal(s);
  if (btn.dataset.act === 'load') loadIntoBench(s);
  if (btn.dataset.act === 'delete') {
    if (!confirm(`Delete sample "${s.sample_name}" (#${s.id})?`)) return;
    await api('DELETE', '/api/history/' + encodeURIComponent(s.id));
    toast('Sample deleted'); loadHistory();
  }
});

let searchTimer;
$('#searchBox').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { hSearch = e.target.value.trim(); loadHistory(); }, 200); });
$('#filterSeg').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn'); if (!b) return;
  $$('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
  hFilter = b.dataset.filter; loadHistory();
});
$('#refreshBtn').addEventListener('click', () => { loadHistory(); toast('History refreshed'); });
$('#clearBtn').addEventListener('click', async () => {
  const n = +$('#kpiTotal').textContent;
  if (!n) return toast('History is already empty');
  if (!confirm(`Permanently delete all ${n} tested sample records? This cannot be undone.`)) return;
  await api('POST', '/api/history/clear'); toast('History cleared'); loadHistory();
});
$('#exportBtn').addEventListener('click', async () => {
  const r = await api('GET', '/api/history/export/csv');
  const blob = new Blob([r.__csv ?? ''], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `milk_samples_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('CSV exported', 'ok');
});

function loadIntoBench(s, { silent = false } = {}) {
  setForm({ temperature: +s.temperature, ph: +s.ph, color: +s.color, fat: +s.fat, turbidity: +s.turbidity },
          { name: s.sample_name, notes: s.notes });
  showTab('bench');
  if (!silent) toast(`Loaded ${s.sample_name} into the testing form`);
}

/* ---- forensic modal ---- */
let modalSample = null;
function openModal(s) {
  modalSample = s;
  const src = normSource(s.source);
  const gradeStr = String(s.grade || '').toUpperCase();
  const sev = s.severity || (gradeStr === 'LOW' ? 'severe' : (s.adulterant_type && !/none/i.test(s.adulterant_type) ? 'mild' : 'none'));
  $('#modalTitle').textContent = `${s.sample_name}  ·  #${s.id}`;
  const rows = [
    ['Temperature', fmt(s.temperature, 1) + ' °C', PURE.temperature, +s.temperature, 1, ' °C'],
    ['pH Acidity', fmt(s.ph, 2), PURE.ph, +s.ph, 2, ''],
    ['Color Whiteness', s.color, PURE.color, +s.color, 0, ''],
    ['Fat Globules', +s.fat === 1 ? '1 · Present' : '0 · Depleted', PURE.fat, +s.fat, 0, ''],
    ['Turbidity SNF', +s.turbidity === 1 ? '1 · Intact' : '0 · Depleted', PURE.turbidity, +s.turbidity, 0, ''],
  ].map(([n, shown, ref, val, d, u]) => {
    const dev = val - ref;
    const cls = Math.abs(dev) < 1e-9 ? 'dev-zero' : dev > 0 ? 'dev-pos' : 'dev-neg';
    const txt = Math.abs(dev) < 1e-9 ? 'No deviation' : (dev > 0 ? '+' : '') + dev.toFixed(d) + u;
    return `<tr><td><strong>${n}</strong></td><td>${esc(shown)}</td><td>${ref.toFixed(d)}${u}</td><td class="${cls}">${txt}</td></tr>`;
  }).join('');
  const rec = {
    none:   ['✅ Safe: pure milk profile', ['Release batch for standard processing.', 'Maintain cold chain below 4 °C after collection.']],
    mild:   ['⚠️ Caution: mild deviation / buffer suspected', ['Hold batch for confirmatory lab assay (urea, bicarbonate).', 'Re-test after 30 min at a stable temperature.', 'Flag supplier for follow-up sampling.']],
    severe: ['☣️ Reject: severe adulteration or spoilage', ['Quarantine the batch immediately; do not blend with other lots.', 'Do not use for consumption or product manufacture.', 'Notify quality control and document the supplier source.', 'Send a retained sample for confirmatory chemical analysis.']],
  }[sev];
  const conf = s.confidence_detail ? s.confidence_detail : null;
  const confVal = conf ? Math.max(conf.medium, conf.low) : (s.confidence || (gradeStr === 'MEDIUM' ? s.conf_medium : s.conf_low));
  $('#modalBody').innerHTML = `
    <div class="modal-meta">${gradeBadge(s.grade)}
      <span class="src ${SOURCE_CLASS[src]}">${SOURCE_LABEL[src]}</span>
      <span style="color:var(--muted);font-size:12.5px">${new Date(s.timestamp).toLocaleString()}</span></div>
    <div><div class="mini-title" style="margin-top:0">Detected Adulterant</div>
      <div class="adulterant-badge ${sev}">${esc(s.adulterant_type || 'None - Pure Milk')}</div>
      ${conf ? `<div style="margin-top:8px;font-size:12.5px;color:var(--muted)">Confidence · Medium ${fmt(conf.medium,1)}% / Low ${fmt(conf.low,1)}%</div>` : `<div style="margin-top:8px;font-size:12.5px;color:var(--muted)">Model confidence · ${fmt(confVal,1)}%</div>`}
    </div>
    <div><div class="mini-title" style="margin-top:0">Deviation from Pure Whole Milk</div>
      <table class="dev-table"><thead><tr><th>Parameter</th><th>Measured</th><th>Pure Reference</th><th>Deviation</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${s.notes ? `<div><div class="mini-title" style="margin-top:0">Inspection Notes</div><div>${esc(s.notes)}</div></div>` : ''}
    <div class="rec ${sev}"><strong>${rec[0]}</strong><ul>${rec[1].map(x => `<li>${x}</li>`).join('')}</ul></div>`;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; modalSample = null; }
$('#modalClose').addEventListener('click', closeModal);
$('#modalCloseBtn').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
$('#modalRetest').addEventListener('click', async () => {
  const s = modalSample; if (!s) return;
  closeModal(); loadIntoBench(s, { silent: true });
  await runTest({ source: 'lab' });
});

/* ======================= TAB 3: presets ======================= */
async function loadPresets() {
  let list = PRESETS;
  try {
    const r = await api('GET', '/api/presets');
    const arr = r.presets || r;
    if (Array.isArray(arr) && arr.length) list = arr.map((p, i) => ({ ...(PRESETS[i] || {}), ...p, values: p.values || p.sensors || PRESETS[i]?.values }));
  } catch { /* use built-ins */ }
  $('#presetGrid').innerHTML = list.map((p, i) => {
    const v = p.values || {};
    return `<button type="button" class="preset ${esc(p.cls || 'pure')}" data-i="${i}">
      <div class="preset-top"><span class="preset-emoji">${p.emoji || '🧪'}</span><span class="preset-tag">${esc(p.tag || 'Preset')}</span></div>
      <h3>${esc(p.name)}</h3><p>${esc(p.desc || p.description || '')}</p>
      <div class="preset-vals">
        <span class="sb">🌡 ${fmt(v.temperature)}°C</span><span class="sb">pH ${fmt(v.ph, 2)}</span>
        <span class="sb">Fat ${v.fat}</span><span class="sb">Turb ${v.turbidity}</span><span class="sb">RGB ${v.color}</span>
      </div>
      <div class="preset-cta">Load &amp; test →</div></button>`;
  }).join('');
  $('#presetGrid').onclick = async (e) => {
    const card = e.target.closest('.preset'); if (!card) return;
    const p = list[+card.dataset.i];
    setForm(p.values, { name: '', notes: 'Preset: ' + p.name });
    f.name.value = await nextId();
    showTab('bench');
    await runTest({ source: 'preset' });
  };
}

/* ======================= TAB 4: ESP32 ======================= */
let lastStreamKey = '';
async function loadStream() {
  const { stream, connected } = await api('GET', '/api/esp32/live');
  $('#streamDot').classList.toggle('on', !!connected);
  $('#streamText').textContent = connected ? 'Live: node(s) transmitting' : (stream.length ? 'Idle: no packets in the last minute' : 'Waiting for nodes…');
  $('#streamEmpty').hidden = stream.length > 0;
  $('#streamTable').style.display = stream.length ? '' : 'none';
  const key = stream.length ? stream[0].timestamp + stream.length : '';
  const isNew = key !== lastStreamKey && lastStreamKey !== '';
  lastStreamKey = key;
  $('#streamBody').innerHTML = stream.map((p, i) => `
    <tr class="${isNew && i === 0 ? 'new-row' : ''}">
      <td class="mono">${new Date(p.timestamp).toLocaleTimeString()}</td>
      <td class="mono"><strong>${esc(p.device_id || p.mcu_id || 'ESP32')}</strong></td>
      <td>${fmt(p.temperature)}°C</td><td>${fmt(p.ph, 2)}</td><td>${+p.fat}</td><td>${+p.turbidity}</td><td>${p.color}</td>
      <td>${gradeBadge(p.grade)}</td><td>${esc(p.adulterant_type || '–')}</td>
    </tr>`).join('');
}

$('#simBtn').addEventListener('click', async () => {
  const base = PRESETS[Math.floor(Math.random() * PRESETS.length)].values;
  const jit = (x, a) => x + (Math.random() * 2 - 1) * a;
  const packet = {
    device_id: 'ESP32-NODE-0' + (1 + Math.floor(Math.random() * 3)),
    temperature: +jit(base.temperature, 0.6).toFixed(1),
    ph: +clamp(jit(base.ph, 0.08), 0, 14).toFixed(2),
    color: Math.round(clamp(jit(base.color, 1.2), 0, 255)),
    fat: base.fat, turbidity: base.turbidity,
  };
  const btn = $('#simBtn'); btn.disabled = true;
  try {
    await api('POST', '/api/esp32/telemetry', packet);
    await loadStream(); refreshNavCount();
    toast(`Packet received from ${packet.device_id}`, 'ok');
  } finally { btn.disabled = false; }
});
setInterval(() => { if (activeTab === 'esp32' && !document.hidden) loadStream(); }, 4000);

/* ======================= TAB 5: figures ======================= */
$$('.fig img').forEach(img => {
  img.addEventListener('error', () => {
    const ph = document.createElement('div');
    ph.className = 'img-missing';
    ph.innerHTML = `<div>Figure not found<br><code>${esc(new URL(img.src, location.href).pathname)}</code></div>`;
    img.replaceWith(ph);
  });
});

/* ======================= init ======================= */
(async function init() {
  setForm(PURE);
  f.name.value = await nextId();
  await Promise.all([loadPresets(), refreshNavCount()]);
})();

})();
