'use strict';

/* ===== Helpers ===== */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0,10);
const parseLines = t => (t||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
const clamp = (n,min,max) => Math.max(min, Math.min(max, isNaN(n)?min:n));
const escapeHTML = s => (s||'').replace(/[&<>\"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const logistic = z => 1/(1+Math.exp(-z));

/* ===== Keys ===== */
const STATE_KEY   = 'decision_capsules_v3';
const PROFILE_KEY = 'decision_capsule_profile_v1';
const MODE_KEY    = 'decision_capsule_mode';
const VIEW_KEY    = 'decision_capsule_view';
const DRAFT_KEY   = 'dc_draft_v1';

/* ===== State & Profile ===== */
let STATE   = loadState();
let PROFILE = loadProfile();
let VIEW    = localStorage.getItem(VIEW_KEY) || 'wizard';   // 'wizard' | 'form'
let STEP    = 1;                                            // 1..4

function loadState(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    if(raw) return JSON.parse(raw);
    const old = localStorage.getItem('decision_capsules_v2') || localStorage.getItem('decision_capsules_v1');
    return old ? JSON.parse(old) : { capsules: [] };
  }catch{ return { capsules: [] }; }
}
function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(STATE)); }

function loadProfile(){
  try{
    const raw = localStorage.getItem(PROFILE_KEY);
    if(raw) return JSON.parse(raw);
  }catch{}
  return { categories: {}, weights: null };
}
function saveProfile(){ localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); }
function ensureCat(cat){ if(!PROFILE.categories[cat]) PROFILE.categories[cat] = { alpha:3, beta:3 }; return PROFILE.categories[cat]; }

/* ===== Confidence Model ===== */
const W = {bias:-0.2, rc:0.8, ac:-0.6, ev:0.9, fam:0.5, rev:0.4, stake:0.6, tb:0.3};

function getFactors(){
  // aus Chips lesen (Fallback Defaults)
  const chipVal = (name, def) => {
    const row = document.querySelector(`.chip-row[data-factor="${name}"]`);
    if(!row) return def;
    const act = row.querySelector('.chip.active');
    return act ? act.getAttribute('data-value') : def;
  };
  return {
    reversible: chipVal('reversible','1')==='1',
    stake: chipVal('stake','mid'),
    familiarity: Number(chipVal('familiarity','1')),
    evidence: Number(chipVal('evidence','1')),
    timeBuffer: Number(chipVal('timeBuffer','1'))
  };
}

function extractFeaturesFromText(){
  const reasons = parseLines($('#reasons').value);
  const assumptions = parseLines($('#assumptions').value);
  const success = $('#success').value;
  const numCount = (success||"").match(/([€$]|%|\b\d+[\.,]?\d*\b)/g);
  const count = numCount ? numCount.length : 0;
  const hasDate  = /(20\d{2}|\b[0-3]?\d[./][0-1]?\d\b)/.test(success||"") ? 1 : 0;
  const rc = Math.min(reasons.length,5) / 5;
  const ac = Math.min(assumptions.length,5) / 5;
  const evDetect = Math.min(count,5) / 5 + hasDate*0.2; // 0..1+
  return { rc, ac, evDetect };
}

function p_feature(feat){
  const f = getFactors();
  const ev = Math.min(1, (f.evidence/2)*0.6 + Math.min(1, feat.evDetect)*0.6);
  const fam = (f.familiarity)/2; // 0..1
  const rev = f.reversible ? 1 : 0;
  const stake = {'low':1,'mid':0.5,'high':0}[f.stake||'mid'];
  const tb = (f.timeBuffer)/2;
  const z = W.bias + W.rc*feat.rc + W.ac*feat.ac + W.ev*ev + W.fam*fam + W.rev*rev + W.stake*stake + W.tb*tb;
  return logistic(z);
}
function p_prior(category){ const b = ensureCat(category); return b.alpha/(b.alpha+b.beta); }
function combine(pf, pp, category){
  const b = ensureCat(category); const n = b.alpha+b.beta, k = 10; const lambda = n/(n+k);
  return lambda*pp + (1-lambda)*pf;
}
function categoryBias(cat){
  const reviewed = STATE.capsules.filter(c=>c.category===cat && c.status==='reviewed');
  if(!reviewed.length) return null;
  let sumP=0, sumY=0;
  reviewed.forEach(c=>{ sumP += (c.confidence||50)/100; sumY += (c.outcome==='success'?1:(c.outcome==='partial'?0.5:0)); });
  return (sumP/reviewed.length) - (sumY/reviewed.length);
}
function getCurrentCategory(){ return $('#catBadge').dataset.category || 'general'; }
function suggestConfidenceNow(){
  const feat = extractFeaturesFromText();
  const pf = p_feature(feat);
  const cat = getCurrentCategory();
  const pp = p_prior(cat);
  const p = combine(pf, pp, cat);
  return Math.round(p*100);
}
function updateAutoUI(){
  const auto = suggestConfidenceNow();
  $('#autoVal').textContent = auto + '%';
  const cat = getCurrentCategory();
  const bias = categoryBias(cat);
  const f = getFactors();
  const pieces = [
    f.evidence>=2? 'Belege stark': (f.evidence===1? 'Belege mittel':'Belege gering'),
    f.reversible? 'reversibel':'irreversibel',
    f.stake==='high'? 'hoher Einsatz': (f.stake==='mid'?'mittlerer Einsatz':'niedriger Einsatz')
  ];
  if(bias!=null){
    const sign = bias>0? '+':'−';
    pieces.push(`Historie ${sign}${Math.round(Math.abs(bias)*100)}% in ${cat}`);
  }
  $('#autoExplain').textContent = 'Auto-Vorschlag: ' + auto + '% – ' + pieces.join(' · ');
}

/* ===== Draft ===== */
function readDraft(){
  try{ const raw = localStorage.getItem(DRAFT_KEY); return raw? JSON.parse(raw) : null; }catch{ return null; }
}
function writeDraft(){
  const draft = {
    step: STEP,
    title: $('#title').value.trim(),
    decision: $('#decision').value.trim(),
    chosen: $('#chosen').value.trim(),
    options: $('#options').value,
    reasons: $('#reasons').value,
    assumptions: $('#assumptions').value,
    success: $('#success').value.trim(),
    reviewDate: $('#reviewDate').value,
    confidence: Number($('#confidenceRange').value || 70),
    category: getCurrentCategory(),
    factors: getFactors()
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
function loadDraftIfAny(){
  const d = readDraft(); if(!d) return;
  $('#title').value = d.title || '';
  $('#decision').value = d.decision || '';
  $('#chosen').value = d.chosen || '';
  $('#options').value = d.options || '';
  $('#reasons').value = d.reasons || '';
  $('#assumptions').value = d.assumptions || '';
  $('#success').value = d.success || '';
  $('#reviewDate').value = d.reviewDate || todayISO();
  $('#confidenceRange').value = d.confidence || 70; $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#catBadge').textContent = 'Kategorie: ' + (d.category||'general'); $('#catBadge').dataset.category = d.category||'general';
  // factor chips
  setFactorChips(d.factors || {});
  STEP = d.step || 1;
}

/* ===== UI Init ===== */
document.addEventListener('DOMContentLoaded', init);

function init(){
  // Mode (Einfach/Pro)
  const savedMode = localStorage.getItem(MODE_KEY) || 'simple';
  document.body.classList.toggle('simple', savedMode === 'simple');
  $('#btn-mode').textContent = 'Modus: ' + (savedMode === 'simple' ? 'Einfach' : 'Pro');
  $('#btn-mode').addEventListener('click', () => {
    const isSimple = !document.body.classList.contains('simple');
    document.body.classList.toggle('simple', isSimple);
    $('#btn-mode').textContent = 'Modus: ' + (isSimple ? 'Einfach' : 'Pro');
    localStorage.setItem(MODE_KEY, isSimple ? 'simple' : 'pro');
  });

  // Ansicht (Wizard/Formular)
  setView(VIEW);
  $('#btn-view').addEventListener('click', () => setView(VIEW==='wizard'?'form':'wizard'));

  // Template-Select
  renderTemplateSelect();
  renderTopicGrid();

  // Buttons (Form & Wizard)
  $('#btn-save').addEventListener('click', onSave);
  $('#btn-ics').addEventListener('click', onICS);
  $('#btn-clear').addEventListener('click', clearForm);

  $('#btn-save-wizard').addEventListener('click', onSave);
  $('#btn-ics-wizard').addEventListener('click', onICS);
  $('#btn-prev').addEventListener('click', ()=> gotoStep(STEP-1));
  $('#btn-next').addEventListener('click', ()=> gotoStep(STEP+1));

  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#import-json').addEventListener('change', importJSON);

  $('#btn-save-review').addEventListener('click', saveReview);

  // Confidence UI
  $('#btn-apply-auto').addEventListener('click', () => {
    const v = suggestConfidenceNow(); $('#confidenceRange').value = v; $('#confidenceRange').dispatchEvent(new Event('input'));
  });
  const rng = $('#confidenceRange');
  const out = $('#confidenceOut');
  const syncRange = () => out.textContent = `${rng.value}%`;
  rng.addEventListener('input', syncRange);

  // Inputs trigger Draft + Auto
  ['title','decision','options','chosen','reasons','assumptions','success','reviewDate'].forEach(id=>{
    const el = $('#'+id); el.addEventListener('input', debounce(()=>{ writeDraft(); updateAutoUI(); updateSummary(); },200));
  });
  rng.addEventListener('input', ()=>{ writeDraft(); updateSummary(); });

  // Factor chips
  $$('.chip-row[data-factor] .chip-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.parentElement;
      row.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      writeDraft(); updateAutoUI();
    });
  });

  // Quick date chips
  $$('[data-quick-date]').forEach(b=> b.addEventListener('click', ()=> quickDate('#reviewDate', b.getAttribute('data-quick-date')) ));
  $$('[data-quick-date2]').forEach(b=> b.addEventListener('click', ()=> quickDate('#reviewDate2', b.getAttribute('data-quick-date2')) ));

  // Success chips (per Kategorie)
  renderSuccessChips();

  // Defaults
  if(!$('#reviewDate').value) $('#reviewDate').value = todayISO();
  $('#reviewDate2').value = $('#reviewDate').value;
  loadDraftIfAny();

  // Start
  refresh();
  updateAutoUI();
  updateSummary();
  gotoStep(STEP);
}

/* ===== View / Wizard ===== */
function setView(v){
  VIEW = v;
  document.body.classList.toggle('view-wizard', VIEW==='wizard');
  document.body.classList.toggle('view-form', VIEW==='form');
  $('#btn-view').textContent = 'Ansicht: ' + (VIEW==='wizard' ? 'Wizard' : 'Formular');
  localStorage.setItem(VIEW_KEY, VIEW);
  // in Formular alle Schritte sichtbar
  if(VIEW==='form'){ $$('.wiz-step').forEach(s=>s.classList.add('active')); }
  else { $$('.wiz-step').forEach(s=>s.classList.remove('active')); }
}

function gotoStep(n){
  if(VIEW!=='wizard') return;
  STEP = Math.max(1, Math.min(4, n));
  $$('.wiz-step').forEach(s=> s.classList.toggle('active', Number(s.dataset.step)===STEP));
  $$('.stepper .step').forEach(s=> s.classList.toggle('current', Number(s.dataset.step)===STEP));
  // Buttons in Bottom-Bar
  $('#btn-prev').style.visibility = STEP>1 ? 'visible' : 'hidden';
  $('#btn-next').style.display    = STEP<4 ? 'inline-flex' : 'none';
  $('#btn-save-wizard').style.display = STEP===4 ? 'inline-flex' : 'none';
  $('#btn-ics-wizard').style.display  = STEP===4 ? 'inline-flex' : 'none';
  // Sync zweites Datumfeld in Step 4
  if(STEP===4){ $('#reviewDate2').value = $('#reviewDate').value; updateSummary(); }
  writeDraft();
}

/* ===== Templates / Chips Rendering ===== */
function renderTemplateSelect(){
  const sel = $('#templateSel');
  let html = '<option value="">– Vorlage wählen –</option>';
  Object.entries(window.TEMPLATES_BY_TOPIC).forEach(([topic, arr])=>{
    html += `<optgroup label="${topic}">` + arr.map(t=>`<option value="${t.id}">${t.name}</option>`).join('') + `</optgroup>`;
  });
  sel.innerHTML = html;
  sel.addEventListener('change', ()=> applyTemplate(sel.value));
}
function renderTopicGrid(){
  const grid = $('#topicGrid'); grid.innerHTML = '';
  Object.entries(window.TEMPLATES_BY_TOPIC).forEach(([topic, arr])=>{
    const card = document.createElement('div'); card.className='topic-card';
    const title = document.createElement('div'); title.className='topic-title'; title.textContent=topic;
    const row = document.createElement('div'); row.className='topic-templates';
    arr.slice(0,3).forEach(t=>{
      const chip = document.createElement('button'); chip.className='topic-chip'; chip.textContent=t.name;
      chip.addEventListener('click', ()=> applyTemplate(t.id));
      row.appendChild(chip);
    });
    card.appendChild(title); card.appendChild(row);
    card.addEventListener('click', ()=> {/* Themakarte nur optisch */});
    grid.appendChild(card);
  });
}
function renderSuccessChips(){
  const box = $('#successChips');
  const cat = getCurrentCategory() || 'general';
  const chips = window.SUCCESS_CHIPS[cat] || window.SUCCESS_CHIPS.general;
  box.innerHTML = '';
  chips.forEach(txt=>{
    const b = document.createElement('button'); b.className='chip'; b.textContent=txt;
    b.addEventListener('click', ()=>{
      const cur = $('#success').value.trim();
      const add = txt;
      $('#success').value = cur ? (cur.includes(add)? cur : (cur + (cur.endsWith('.')?'':' · ') + add)) : add;
      writeDraft(); updateAutoUI(); updateSummary();
    });
    box.appendChild(b);
  });
}
function applyTemplate(id){
  const tpl = findTemplate(id); if(!tpl) return;
  const d = tpl.data || {};
  $('#title').value = d.title || '';
  $('#decision').value = d.decision || '';
  $('#options').value = d.options || '';
  $('#chosen').value = d.chosen || '';
  $('#reasons').value = d.reasons || '';
  $('#assumptions').value = d.assumptions || '';
  $('#success').value = d.success || '';
  $('#confidenceRange').value = d.confidence || 60; $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#catBadge').textContent = 'Kategorie: ' + (tpl.category || 'general');
  $('#catBadge').dataset.category = tpl.category || 'general';
  if(!$('#reviewDate').value) $('#reviewDate').value = todayISO();
  renderSuccessChips();
  writeDraft(); updateAutoUI(); updateSummary();
}
function findTemplate(id){
  let res=null;
  Object.values(window.TEMPLATES_BY_TOPIC).some(arr=>{
    const t = arr.find(x=>x.id===id); if(t){ res=t; return true; } return false;
  });
  return res;
}

/* ===== Summary ===== */
function updateSummary(){
  const s = $('#summaryCard');
  const title = $('#title').value.trim() || '—';
  const decision = $('#decision').value.trim() || '—';
  const success = $('#success').value.trim() || '—';
  const conf = $('#confidenceRange').value || '—';
  s.innerHTML = `
    <div class="line"><span class="k">Titel:</span> ${escapeHTML(title)}</div>
    <div class="line"><span class="k">Entscheidung:</span> ${escapeHTML(decision)}</div>
    <div class="line"><span class="k">Erfolg:</span> ${escapeHTML(success)}</div>
    <div class="line"><span class="k">Wahrscheinlichkeit:</span> ${conf}%</div>
  `;
}

/* ===== Quick Dates ===== */
function quickDate(sel, plusStr){
  const el = $(sel);
  const base = new Date(); base.setHours(0,0,0,0);
  const n = Number(plusStr.replace('+',''));
  const d = new Date(base.getTime()+n*24*60*60*1000);
  const iso = d.toISOString().slice(0,10);
  el.value = iso;
  if(sel==='#reviewDate'){ $('#reviewDate2').value = iso; }
  writeDraft(); updateSummary();
}

/* ===== CRUD / Save / ICS ===== */
function collectCapsule(){
  const category = getCurrentCategory();
  const factors = getFactors();
  const suggested = suggestConfidenceNow();
  return {
    id: uid(),
    dateCreated: new Date().toISOString(),
    title: $('#title').value.trim(),
    decision: $('#decision').value.trim(),
    options: parseLines($('#options').value),
    chosen: $('#chosen').value.trim(),
    reasons: parseLines($('#reasons').value),
    assumptions: parseLines($('#assumptions').value),
    success: $('#success').value.trim(),
    reviewDate: ($('#reviewDate2').value || $('#reviewDate').value || todayISO()),
    confidence: clamp(parseInt($('#confidenceRange').value,10), 1, 99),
    confidenceSource: (Number($('#confidenceRange').value)===suggested? 'auto':'manual'),
    suggestedConfidence: suggested,
    notes: '',
    status: 'open', outcome: null, brier: null,
    category, factors
  };
}

function onSave(){
  const cap = collectCapsule();
  if(!cap.title){ alert('Bitte Titel eingeben.'); gotoStep(1); return; }
  if(!cap.decision){ alert('Bitte Entscheidung eingeben.'); gotoStep(2); return; }
  if(!cap.success){ alert('Bitte Erfolgskriterium eingeben.'); gotoStep(3); return; }

  STATE.capsules.push(cap);
  saveState();
  localStorage.removeItem(DRAFT_KEY);
  refresh();
  updateSummary();
  alert('Gespeichert. Review am ' + cap.reviewDate + '.');
  // Reset Felder für nächste
  clearForm();
  if(VIEW==='wizard'){ gotoStep(1); }
}

function onICS(){
  const title = $('#title').value.trim() || 'Decision Capsule Review';
  const dt = ($('#reviewDate2').value || $('#reviewDate').value || todayISO());
  const uidv = uid();
  const dtstamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'Z');
  const dtstart = dt.replace(/-/g,'');
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DecisionCapsule//DE','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uidv}@decisioncapsule.local`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `SUMMARY:Decision Capsule Review: ${title.replace(/,/g,'\\,').replace(/;/g,'\\;')}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], {type:'text/calendar'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'decision-review.ics'; a.click(); URL.revokeObjectURL(a.href);
}

function clearForm(){
  ['title','decision','options','chosen','reasons','assumptions','success'].forEach(id=>{ const el=$("#"+id); if(el) el.value=''; });
  $('#confidenceRange').value = 70; $('#confidenceRange').dispatchEvent(new Event('input'));
  const iso = todayISO(); $('#reviewDate').value = iso; $('#reviewDate2').value = iso;
  $('#templateSel').value=''; $('#catBadge').textContent='Kategorie: –'; delete $('#catBadge').dataset.category;
  // reset chips
  setFactorChips({reversible:'1',stake:'mid',familiarity:1,evidence:1,timeBuffer:1});
  renderSuccessChips();
  writeDraft(); updateAutoUI(); updateSummary();
}

/* ===== Factor Chips helpers ===== */
function setFactorChips(f){
  const set = (name,val)=>{
    const row = document.querySelector(`.chip-row[data-factor="${name}"]`);
    if(!row) return;
    row.querySelectorAll('.chip').forEach(c=> c.classList.toggle('active', c.getAttribute('data-value')==String(val)));
  };
  if(f.reversible!=null) set('reversible', f.reversible?'1':'0');
  if(f.stake) set('stake', f.stake);
  if(f.familiarity!=null) set('familiarity', f.familiarity);
  if(f.evidence!=null) set('evidence', f.evidence);
  if(f.timeBuffer!=null) set('timeBuffer', f.timeBuffer);
}

/* ===== Export/Import/Review/Dashboard ===== */
function exportJSON(){
  const bundle = { version:3, state: STATE, profile: PROFILE };
  const blob = new Blob([JSON.stringify(bundle,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'decision-capsule-export.json'; a.click(); URL.revokeObjectURL(a.href);
}
function exportCSV(){
  const rows = [ ['id','title','dateCreated','reviewDate','decision','chosen','confidence','confSource','status','outcome','brier','category'] ];
  STATE.capsules.forEach(c=>{
    rows.push([c.id,c.title,c.dateCreated,c.reviewDate,c.decision,c.chosen,c.confidence,c.confidenceSource,c.status,c.outcome||'', c.brier||'', c.category||'']);
  });
  const csv = rows.map(r=> r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='decision-capsules.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function importJSON(ev){
  const file = ev.target.files && ev.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(data && data.version>=2 && data.state && data.profile){ STATE=data.state; PROFILE=data.profile; saveState(); saveProfile(); refresh(); return; }
      if(Array.isArray(data.capsules)){ STATE=data; saveState(); refresh(); return; }
      alert('Ungültiges Format.');
    }catch(e){ alert('Import fehlgeschlagen: '+e.message); }
  };
  reader.readAsText(file);
}

function saveReview(){
  const id = $('#rev-id').value; if(!id){ alert('Bitte Capsule wählen.'); return; }
  const res = $('#rev-result').value; if(!res){ alert('Bitte Ergebnis wählen.'); return; }
  const notes = $('#rev-notes').value.trim();
  const c = STATE.capsules.find(x=>x.id===id); if(!c) return;
  c.status='reviewed'; c.outcome=res;
  const y = res==='success'?1:(res==='partial'?0.5:0);
  const p = (c.confidence||50)/100;
  c.brier=((p-y)**2).toFixed(4); c.reviewNotes=notes;
  const bucket = ensureCat(c.category||'general'); const add = res==='success'?[1,0]: (res==='partial'?[0.5,0.5]:[0,1]);
  bucket.alpha+=add[0]; bucket.beta+=add[1]; saveProfile();
  saveState(); refresh();
  $('#rev-notes').value=''; $('#rev-result').value=''; $('#rev-id').value='';
}

function refresh(){
  $('#stat-open').textContent = STATE.capsules.filter(c=>c.status==='open').length;
  $('#stat-soon').textContent = STATE.capsules.filter(c=>c.status==='open' && daysUntil(c.reviewDate) <= 7).length;
  const briers = STATE.capsules.map(c=>Number(c.brier)).filter(n=>!isNaN(n));
  $('#stat-brier').textContent = briers.length? avg(briers).toFixed(3) : '–';
  renderLists();
  const rev = $('#rev-id'); rev.innerHTML = '<option value="">– wählen –</option>' + STATE.capsules.map(c=>`<option value="${c.id}">${escapeHTML(c.title)} (${c.reviewDate})</option>`).join('');
  $('#db-last-sync').textContent = 'Stand: ' + new Date().toLocaleString();
}
function daysUntil(dateStr){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr+'T00:00:00'); d.setHours(0,0,0,0);
  return Math.floor((d - today) / (1000*60*60*24));
}
function renderLists(){
  const dueList = $('#list-due'); const allList = $('#list-all');
  dueList.innerHTML = ''; allList.innerHTML = '';
  const sorted = STATE.capsules.slice().sort((a,b)=> (a.reviewDate||'').localeCompare(b.reviewDate||''));
  const dueNow = sorted.filter(c=> daysUntil(c.reviewDate) <= 7 && c.status==='open');
  dueNow.forEach(c=> dueList.appendChild(renderItem(c)));
  sorted.forEach(c=> allList.appendChild(renderItem(c)));
}
function renderItem(c){
  const div = document.createElement('div'); div.className='item';
  const d = daysUntil(c.reviewDate);
  const dueCls = d<0? 'overdue' : (d<=7? 'due' : 'okc');
  div.innerHTML = `
    <h3>${escapeHTML(c.title)}</h3>
    <div class="meta">
      <span>Entschieden: ${new Date(c.dateCreated).toLocaleDateString()}</span>
      <span class="${dueCls}">Review: ${c.reviewDate} (${d<0? (Math.abs(d)+' Tage überfällig'):(d===0?'heute':'in '+d+' Tagen')})</span>
      <span>Confidence: ${c.confidence}%${c.confidenceSource==='auto'?' (auto)':''}</span>
      <span>Status: ${c.status}</span>
      ${c.outcome? `<span>Ergebnis: ${c.outcome}${c.brier? ` · Brier ${c.brier}`:''}</span>`: ''}
      ${c.category? `<span>Kategorie: ${c.category}</span>`:''}
    </div>
    <div class="hr"></div>
    <div class="muted">${escapeHTML(c.decision)}</div>
    <div class="flex" style="margin-top:8px">
      <button class="btn" data-act="load" data-id="${c.id}">In Formular laden</button>
      ${c.status==='open'? `<button class="btn" data-act="mark-reviewed" data-id="${c.id}">Als reviewed markieren</button>`:''}
      <button class="btn warn" data-act="del" data-id="${c.id}">Löschen</button>
    </div>`;
  div.addEventListener('click', e=>{
    const t = e.target.closest('button'); if(!t) return;
    const id = t.getAttribute('data-id'); const act = t.getAttribute('data-act');
    if(act==='del'){ if(confirm('Capsule wirklich löschen?')){ STATE.capsules = STATE.capsules.filter(x=>x.id!==id); saveState(); refresh(); } }
    if(act==='load'){
      const it = STATE.capsules.find(x=>x.id===id); if(!it) return;
      $('#title').value=it.title; $('#decision').value=it.decision; $('#options').value=(it.options||[]).join('\n');
      $('#chosen').value=it.chosen; $('#reasons').value=(it.reasons||[]).join('\n'); $('#assumptions').value=(it.assumptions||[]).join('\n');
      $('#success').value=it.success; $('#reviewDate').value=it.reviewDate; $('#reviewDate2').value=it.reviewDate;
      $('#confidenceRange').value=it.confidence; $('#confidenceRange').dispatchEvent(new Event('input'));
      $('#catBadge').textContent='Kategorie: '+(it.category||'general'); $('#catBadge').dataset.category=it.category||'general';
      setFactorChips(it.factors||{});
      renderSuccessChips(); updateAutoUI(); updateSummary();
      window.scrollTo({top:0,behavior:'smooth'});
    }
    if(act==='mark-reviewed'){ $('#rev-id').value = id; document.querySelector('section[aria-label="Review"]').scrollIntoView({behavior:'smooth'}); }
  });
  return div;
}

/* ===== Utils ===== */
function debounce(fn, ms){ let t=null; return function(){ clearTimeout(t); t=setTimeout(fn,ms); }; }
