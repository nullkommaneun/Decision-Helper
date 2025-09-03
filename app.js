// ------- Helpers -------
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0,10);
const parseLines = t => (t||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
const clamp = (n,min,max) => Math.max(min, Math.min(max, isNaN(n)?min:n));
const escapeHTML = s => (s||'').replace(/[&<>\"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;

// ------- Storage (localStorage) -------
const KEY = 'decision_capsules_v1';
const MODE_KEY = 'decision_capsule_mode';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {capsules: []}; } catch { return {capsules: []}; } };
const save = (state) => { localStorage.setItem(KEY, JSON.stringify(state)); refresh(); };

// ------- Templates -------
const TEMPLATES = [
  { id:'buy', name:'Kaufentscheidung', data:{ title:'Kaufentscheidung', decision:'Ich kaufe <Produkt> / Alternative verworfen.', options:'Kaufen\nNicht kaufen\nAlternative X', chosen:'Kaufen', reasons:'Nutzen/Preis ok\nWartung/Support geklärt', assumptions:'Preis bleibt stabil\nKein besseres Angebot kurzfristig', success:'Zufriedenheit ≥ 8/10 nach 30 Tagen; Budget eingehalten', confidence:70 }},
  { id:'health', name:'Gesundheitsroutine', data:{ title:'Neue Routine testen', decision:'Ich teste <Routine> für 14 Tage.', options:'Routine A\nRoutine B\nNicht ändern', chosen:'Routine A', reasons:'Geringe Einstiegshürde\nMessbarer Effekt', assumptions:'Keine Nebenwirkungen', success:'Schlafqualität +2 Punkte; Energie 7/10', confidence:65 }},
  { id:'project', name:'Projekt starten', data:{ title:'Kleines Projekt starten', decision:'Ich starte Projekt <X> (Scope klein).', options:'Starten\nSpäter prüfen\nVerwerfen', chosen:'Starten', reasons:'Machbarkeit hoch\nLernwert', assumptions:'Freie Abende vorhanden', success:'MVP in 2 Wochen; 5 Testnutzer', confidence:60 }}
];

// ------- State -------
let STATE = load();

// ------- Init -------
document.addEventListener('DOMContentLoaded', init);

function init(){
  // Mode
  const savedMode = localStorage.getItem(MODE_KEY) || 'simple';
  document.body.classList.toggle('simple', savedMode === 'simple');
  $('#btn-mode').textContent = 'Modus: ' + (savedMode === 'simple' ? 'Einfach' : 'Pro');
  $('#btn-mode').addEventListener('click', toggleMode);

  // Template select
  const sel = $('#templateSel');
  sel.innerHTML = '<option value="">– Vorlage wählen –</option>' + TEMPLATES.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  sel.addEventListener('change', () => applyTemplate(sel.value));

  // Buttons
  $('#btn-save').addEventListener('click', onSave);
  $('#btn-ics').addEventListener('click', onICS);
  $('#btn-clear').addEventListener('click', clearForm);
  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#import-json').addEventListener('change', importJSON);
  $('#btn-save-review').addEventListener('click', saveReview);

  // Confidence range output
  const rng = $('#confidenceRange');
  const out = $('#confidenceOut');
  const syncRange = () => out.textContent = `${rng.value}%`;
  rng.addEventListener('input', syncRange);
  syncRange();

  // Defaults
  if(!$('#reviewDate').value) $('#reviewDate').value = todayISO();

  refresh();
}

function toggleMode(){
  const isSimple = !document.body.classList.contains('simple');
  document.body.classList.toggle('simple', isSimple);
  $('#btn-mode').textContent = 'Modus: ' + (isSimple ? 'Einfach' : 'Pro');
  localStorage.setItem(MODE_KEY, isSimple ? 'simple' : 'pro');
}

function applyTemplate(id){
  const t = TEMPLATES.find(x=>x.id===id);
  if(!t) return;
  $('#title').value = t.data.title || '';
  $('#decision').value = t.data.decision || '';
  $('#options').value = t.data.options || '';
  $('#chosen').value = t.data.chosen || '';
  $('#reasons').value = t.data.reasons || '';
  $('#assumptions').value = t.data.assumptions || '';
  $('#success').value = t.data.success || '';
  $('#confidenceRange').value = t.data.confidence || 60;
  $('#confidenceRange').dispatchEvent(new Event('input'));
}

// ------- Create Capsule -------
function onSave(){
  const capsule = {
    id: uid(),
    dateCreated: new Date().toISOString(),
    title: $('#title').value.trim(),
    decision: $('#decision').value.trim(),
    options: parseLines($('#options').value),
    chosen: $('#chosen').value.trim(),
    reasons: parseLines($('#reasons').value),
    assumptions: parseLines($('#assumptions').value),
    success: $('#success').value.trim(),
    reviewDate: $('#reviewDate').value || todayISO(),
    confidence: clamp(parseInt($('#confidenceRange').value,10), 1, 99),
    notes: $('#notes')?.value.trim() || '',
    status: 'open',
    outcome: null, // success | partial | fail
    brier: null
  };

  if(!capsule.title){ alert('Titel fehlt.'); return; }
  if(!capsule.decision){ alert('Entscheidung fehlt.'); return; }

  STATE.capsules.push(capsule);
  save(STATE);
  clearForm();
}

function clearForm(){
  ['title','decision','options','chosen','reasons','assumptions','success','notes'].forEach(id=>{ const el=$("#"+id); if(el) el.value=''; });
  $('#confidenceRange').value = 70; $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#reviewDate').value = todayISO(); $('#templateSel').value='';
}

// ------- ICS Export -------
function onICS(){
  const title = $('#title').value.trim() || 'Decision Capsule Review';
  const dt = $('#reviewDate').value || todayISO();
  const uidv = uid();
  const dtstamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'Z');
  const dtstart = dt.replace(/-/g,'');
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DecisionCapsule//DE','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uidv}@decisioncapsule.local`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `SUMMARY:Decision Capsule Review: ${escapeICS(title)}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  downloadFile('decision-review.ics', ics, 'text/calendar');
}
function escapeICS(s){ return s.replace(/,/g,'\\,').replace(/;/g,'\\;'); }

// ------- Export / Import -------
function exportJSON(){ downloadFile('decision-capsules.json', JSON.stringify(STATE,null,2), 'application/json'); }
function exportCSV(){
  const rows = [ ['id','title','dateCreated','reviewDate','decision','chosen','confidence','status','outcome','brier'] ];
  STATE.capsules.forEach(c=>{
    rows.push([c.id,c.title,c.dateCreated,c.reviewDate,c.decision,c.chosen,c.confidence,c.status,c.outcome??'', c.brier??'']);
  });
  const csv = rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('decision-capsules.csv', csv, 'text/csv');
}
function importJSON(ev){
  const file = ev.target.files?.[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data || !Array.isArray(data.capsules)) throw new Error('Ungültiges Format');
      STATE = data; save(STATE);
    }catch(e){ alert('Import fehlgeschlagen: '+ e.message); }
  };
  reader.readAsText(file);
}
function downloadFile(name, content, type){
  const blob = new Blob([content], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

// ------- Review -------
function saveReview(){
  const id = $('#rev-id').value; if(!id){ alert('Bitte Capsule wählen.'); return; }
  const res = $('#rev-result').value; if(!res){ alert('Bitte Ergebnis wählen.'); return; }
  const notes = $('#rev-notes').value.trim();
  const c = STATE.capsules.find(x=>x.id===id); if(!c) return;
  c.status = 'reviewed';
  c.outcome = res;
  const y = res==='success'?1: res==='partial'?0.5:0;
  const p = (c.confidence??50)/100;
  c.brier = ((p - y)**2).toFixed(4);
  c.reviewNotes = notes;
  save(STATE);
  $('#rev-notes').value=''; $('#rev-result').value=''; $('#rev-id').value='';
}

// ------- UI Refresh / Lists -------
function refresh(){
  const open = STATE.capsules.filter(c=>c.status==='open').length;
  $('#stat-open').textContent = open;
  const soon = STATE.capsules.filter(c=>c.status==='open' && daysUntil(c.reviewDate) <= 7).length;
  $('#stat-soon').textContent = soon;
  const briers = STATE.capsules.map(c=>Number(c.brier)).filter(n=>!isNaN(n));
  $('#stat-brier').textContent = briers.length? avg(briers).toFixed(3) : '–';

  renderLists();

  const rev = $('#rev-id');
  rev.innerHTML = '<option value="">– wählen –</option>' + STATE.capsules.map(c=>`<option value="${c.id}">${escapeHTML(c.title)} (${c.reviewDate})</option>`).join('');

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
  const sorted = [...STATE.capsules].sort((a,b)=> (a.reviewDate||'').localeCompare(b.reviewDate||''));
  const dueNow = sorted.filter(c=> daysUntil(c.reviewDate) <= 7 && c.status==='open');
  dueNow.forEach(c=> dueList.appendChild(renderItem(c)) );
  sorted.forEach(c=> allList.appendChild(renderItem(c)) );
}
function renderItem(c){
  const div = document.createElement('div');
  div.className = 'item';
  const d = daysUntil(c.reviewDate);
  const dueCls = d<0? 'overdue' : (d<=7? 'due' : 'okc');
  div.innerHTML = `
    <h3>${escapeHTML(c.title)}</h3>
    <div class="meta">
      <span>Entschieden: ${new Date(c.dateCreated).toLocaleDateString()}</span>
      <span class="${dueCls}">Review: ${c.reviewDate} (${d<0? (Math.abs(d)+' Tage überfällig'): (d===0?'heute': 'in '+d+' Tagen')})</span>
      <span>Confidence: ${c.confidence}%</span>
      <span>Status: ${c.status}</span>
      ${c.outcome? `<span>Ergebnis: ${c.outcome}${c.brier? ` · Brier ${c.brier}`:''}</span>`: ''}
    </div>
    <div class="hr"></div>
    <div class="muted">${escapeHTML(c.decision)}</div>
    <div class="flex" style="margin-top:8px">
      <button class="btn" data-act="load" data-id="${c.id}">In Formular laden</button>
      ${c.status==='open'? `<button class="btn" data-act="mark-reviewed" data-id="${c.id}">Als reviewed markieren</button>`:''}
      <button class="btn err" data-act="del" data-id="${c.id}">Löschen</button>
    </div>
  `;
  div.addEventListener('click', e=>{
    const t = e.target.closest('button'); if(!t) return;
    const id = t.getAttribute('data-id');
    const act = t.getAttribute('data-act');
    if(act==='del') {
      if(confirm('Capsule wirklich löschen?')){
        STATE.capsules = STATE.capsules.filter(x=>x.id!==id); save(STATE);
      }
    }
    if(act==='load'){
      const c = STATE.capsules.find(x=>x.id===id); if(!c) return;
      $('#title').value = c.title; $('#decision').value=c.decision; $('#options').value = (c.options||[]).join('\n');
      $('#chosen').value = c.chosen; $('#reasons').value=(c.reasons||[]).join('\n');
      $('#assumptions').value=(c.assumptions||[]).join('\n'); $('#success').value=c.success; $('#reviewDate').value=c.reviewDate;
      $('#confidenceRange').value=c.confidence; $('#confidenceRange').dispatchEvent(new Event('input'));
      $('#notes').value=c.notes||'';
      window.scrollTo({top:0,behavior:'smooth'});
    }
    if(act==='mark-reviewed'){
      $('#rev-id').value = id; document.querySelector('section[aria-label="Review"]').scrollIntoView({behavior:'smooth'});
    }
  });
  return div;
}
