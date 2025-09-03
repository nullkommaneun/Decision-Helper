// ===== Helpers =====
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0,10);
const parseLines = t => (t||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
const clamp = (n,min,max) => Math.max(min, Math.min(max, isNaN(n)?min:n));
const escapeHTML = s => (s||'').replace(/[&<>\"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const logistic = z => 1/(1+Math.exp(-z));

// ===== Keys =====
const STATE_KEY   = 'decision_capsules_v2';
const PROFILE_KEY = 'decision_capsule_profile_v1';
const MODE_KEY    = 'decision_capsule_mode';

// ===== State & Profile =====
let STATE   = loadState();
let PROFILE = loadProfile();

function loadState(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    if(raw) return JSON.parse(raw);
    const old = localStorage.getItem('decision_capsules_v1'); // backwards compat
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

function ensureCat(cat){
  if(!PROFILE.categories[cat]) PROFILE.categories[cat] = { alpha:3, beta:3 };
  return PROFILE.categories[cat];
}

// ===== Templates (grouped) =====
const TEMPLATES_BY_TOPIC = {
  "Kauf & Finanzen": [
    { id:"buy-phone", category:"buy", name:"Kaufentscheidung (Elektronik)",
      data:{ title:"Kaufentscheidung", decision:"Ich kaufe <Produkt>.", options:"Kaufen\nNicht kaufen\nAlternative", chosen:"Kaufen",
             reasons:"Preis/Leistung ok\nRückgaberecht vorhanden", assumptions:"Kein besseres Angebot kurzfristig",
             success:"Zufriedenheit ≥ 8/10 nach 30 Tagen; Budget eingehalten", confidence:70 } },
    { id:"switch-sub", category:"finance", name:"Abo wechseln/kündigen",
      data:{ title:"Abo-Entscheidung", decision:"Ich wechsle/kündige <Abo>.", options:"Wechseln\nKündigen\nBehalten", chosen:"Wechseln",
             reasons:"Funktionsbedarf gedeckt\nPreisvorteil ≥ 20%", assumptions:"Keine versteckten Gebühren",
             success:"Kosten ↓ ≥ 20% bei gleicher Leistung", confidence:65 } },
    { id:"accept-offer", category:"finance", name:"Angebot annehmen?",
      data:{ title:"Angebotsentscheidung", decision:"Ich nehme Angebot <X> an.", options:"Annehmen\nNachverhandeln\nAblehnen", chosen:"Annehmen",
             reasons:"Lieferzeit ok\nGesamtpreis im Rahmen", assumptions:"Kein Lieferengpass",
             success:"Gesamtpreis ≤ Ziel; Lieferung ≤ Termin", confidence:60 } },
  ],
  "Gesundheit & Fitness": [
    { id:"routine-test", category:"health", name:"Routine 14 Tage testen", data:{ title:"Neue Routine testen",
      decision:"Ich teste <Routine> 14 Tage.", options:"Starten\nSpäter prüfen\nNicht starten", chosen:"Starten",
      reasons:"Einstiegshürde gering\nMessbares Kriterium", assumptions:"Keine Nebenwirkungen",
      success:"Schlafqualität +2 Punkte oder Energie ≥ 7/10", confidence:65 } },
    { id:"sleep-adjust", category:"health", name:"Schlaf anpassen",
      data:{ title:"Schlafplan anpassen", decision:"Ich stelle Schlafenszeit auf <Uhrzeit>.",
             options:"Anpassen\nBeibehalten\nSchrittweise", chosen:"Schrittweise",
             reasons:"Konstanter Rhythmus", assumptions:"Arbeitszeiten kompatibel",
             success:"7/7 Tage im Zielkorridor ±15min", confidence:60 } },
    { id:"diet-experiment", category:"health", name:"Ernährungsexperiment 7 Tage",
      data:{ title:"Ernährungsexperiment", decision:"Ich teste <Änderung> 7 Tage.",
             options:"Testen\nNicht testen\nAlternative", chosen:"Testen",
             reasons:"Einfach umsetzbar", assumptions:"Keine Unverträglichkeit",
             success:"Beschwerden ↓; Energie ≥ 7/10", confidence:60 } },
  ],
  "Lernen & Projekte": [
    { id:"take-course", category:"learn", name:"Kurs belegen?",
      data:{ title:"Kursentscheidung", decision:"Ich belege <Kurs>.", options:"Belegen\nWarteliste\nAblehnen", chosen:"Belegen",
             reasons:"Klares Ziel\nZeitbudget vorhanden", assumptions:"Kosten/Nutzen stimmig",
             success:"Abschluss in ≤ 6 Wochen; 2 Anwendungen im Alltag", confidence:65 } },
    { id:"side-project", category:"project", name:"Side-Projekt starten",
      data:{ title:"Side-Projekt starten", decision:"Ich starte Projekt <X> (Scope klein).",
             options:"Starten\nSpäter\nVerwerfen", chosen:"Starten",
             reasons:"Machbar in 14 Tagen", assumptions:"3 Abende frei/Woche",
             success:"MVP live + 5 Nutzerfeedbacks", confidence:60 } },
    { id:"publish-post", category:"create", name:"Artikel/Video veröffentlichen",
      data:{ title:"Veröffentlichung", decision:"Ich veröffentliche <Beitrag>.", options:"Jetzt\nIterieren\nVerwerfen", chosen:"Jetzt",
             reasons:"Story steht\nAssets vorhanden", assumptions:"Kein Rechtsrisiko",
             success:"Veröffentlichung + 3 qual. Rückmeldungen", confidence:70 } },
  ],
  "Beziehungen & Alltag": [
    { id:"tough-talk", category:"personal", name:"Schwieriges Gespräch",
      data:{ title:"Gespräch führen", decision:"Ich führe Gespräch mit <Person>.", options:"Diese Woche\nNächste Woche\nSchriftlich", chosen:"Diese Woche",
             reasons:"Konkretes Ziel", assumptions:"Ruhiger Rahmen möglich",
             success:"Termin fixiert + Ergebnisprotokoll", confidence:60 } },
    { id:"gift", category:"personal", name:"Geschenkentscheidung",
      data:{ title:"Geschenk wählen", decision:"Ich wähle Geschenk <X>.", options:"X\nY\nErlebnis", chosen:"Erlebnis",
             reasons:"Persönlicher Bezug", assumptions:"Termin passt",
             success:"Reaktion positiv (≥8/10)", confidence:70 } },
    { id:"boundary", category:"personal", name:"Grenze setzen",
      data:{ title:"Grenze setzen", decision:"Ich ziehe Grenze bei <Thema>.", options:"Jetzt klar\nSchrittweise\nNicht jetzt", chosen:"Jetzt klar",
             reasons:"Wertschonend + konkret", assumptions:"Kein Eskalationsrisiko",
             success:"Regel kommuniziert + eingehalten 14 Tage", confidence:60 } },
  ],
  "Wohnen & Organisation": [
    { id:"rent-move", category:"home", name:"Wohnung nehmen?",
      data:{ title:"Wohnungsentscheidung", decision:"Ich nehme Wohnung <X>.", options:"Nehmen\nAblehnen\nNachverhandeln", chosen:"Nachverhandeln",
             reasons:"Lage + Kosten ok", assumptions:"Keine verdeckten Mängel",
             success:"Miete ≤ X €/m²; Übergabe mängelfrei", confidence:55 } },
    { id:"appliance-buy", category:"home", name:"Haushaltsgerät kaufen",
      data:{ title:"Gerätekauf", decision:"Ich kaufe <Gerät>.", options:"Kaufen\nWarten\nAlternative", chosen:"Kaufen",
             reasons:"Energieeffizienz gut\nGarantie ≥ 2 Jahre", assumptions:"Lieferzeit ≤ 7 Tage",
             success:"Preis ≤ Budget; Lautstärke im Ziel", confidence:65 } },
    { id:"declutter", category:"home", name:"Entrümpeln 7 Tage",
      data:{ title:"Entrümpeln", decision:"Ich entrümple <Bereich> 7 Tage.",
             options:"Starten\nWochenende\nNicht", chosen:"Starten",
             reasons:"Kleinschritte möglich", assumptions:"Täglich 20 Min",
             success:">5 Gegenstände/Tag; sichtbare Fläche frei", confidence:70 } },
  ],
  "Reisen & Freizeit": [
    { id:"book-trip", category:"travel", name:"Reise buchen?",
      data:{ title:"Reise buchen", decision:"Ich buche Reise <Ziel>.", options:"Buchen\nAbwarten\nAlternative", chosen:"Buchen",
             reasons:"Preis gut\nStorno möglich", assumptions:"Passende Termine",
             success:"Budget ≤ X; Stornofrist > 14 Tage", confidence:65 } },
    { id:"event-go", category:"travel", name:"Event besuchen?",
      data:{ title:"Event-Teilnahme", decision:"Ich gehe zu <Event>.", options:"Hingehen\nSpäter\nNicht", chosen:"Hingehen",
             reasons:"Begleitung vorhanden", assumptions:"Anreise ok",
             success:"Teilnahme + 2 Kontakte", confidence:70 } },
    { id:"weekend-plan", category:"travel", name:"Wochenendplan",
      data:{ title:"Wochenende planen", decision:"Ich plane <Aktivität>.", options:"Aktivität A\nB\nC", chosen:"A",
             reasons:"Wetter/Logistik passt", assumptions:"Kosten gering",
             success:"Durchführung + Zufriedenheit ≥ 8/10", confidence:70 } },
  ],
  "Digital & Daten": [
    { id:"tool-sub", category:"tools", name:"Software abonnieren?",
      data:{ title:"Tool wählen", decision:"Ich abonniere <Tool>.", options:"Abonnieren\nTesten\nNicht", chosen:"Testen",
             reasons:"Use-Case klar", assumptions:"Export/Lock-in geprüft",
             success:"Zeitersparnis ≥ 30 Min/Woche", confidence:60 } },
    { id:"os-update", category:"tools", name:"System-Update einspielen",
      data:{ title:"Update", decision:"Ich spiele Update <Version> ein.", options:"Jetzt\nSpäter\nAuslassen", chosen:"Später",
             reasons:"Backup vorhanden", assumptions:"Kompatibilität ok",
             success:"Stabilität unverändert; neue Funktion genutzt", confidence:75 } },
    { id:"backup-plan", category:"tools", name:"Backup-Strategie umstellen",
      data:{ title:"Backup ändern", decision:"Ich stelle auf <Strategie> um.", options:"Umstellen\nPilot 7 Tage\nNicht", chosen:"Pilot 7 Tage",
             reasons:"Wiederherstellung getestet", assumptions:"Kosten im Rahmen",
             success:"Test-Restore in <30 Min erfolgreich", confidence:65 } },
  ],
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', init);

function init(){
  // Mode
  const savedMode = localStorage.getItem(MODE_KEY) || 'simple';
  document.body.classList.toggle('simple', savedMode === 'simple');
  $('#btn-mode').textContent = 'Modus: ' + (savedMode === 'simple' ? 'Einfach' : 'Pro');
  $('#btn-mode').addEventListener('click', toggleMode);

  // Templates im Select (mit optgroup)
  const sel = $('#templateSel');
  sel.innerHTML = '<option value="">– Vorlage wählen –</option>' +
    Object.entries(TEMPLATES_BY_TOPIC).map(([topic, arr]) =>
      `<optgroup label="${topic}">` + arr.map(t=>`<option value="${t.id}">${t.name}</option>`).join('') + `</optgroup>`
    ).join('');
  sel.addEventListener('change', () => applyTemplate(sel.value));

  // Buttons & Inputs
  $('#btn-save').addEventListener('click', onSave);
  $('#btn-ics').addEventListener('click', onICS);
  $('#btn-clear').addEventListener('click', clearForm);
  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#import-json').addEventListener('change', importJSON);
  $('#btn-save-review').addEventListener('click', saveReview);
  $('#btn-apply-auto').addEventListener('click', applyAuto);

  // Confidence-Ausgabe
  const rng = $('#confidenceRange');
  const out = $('#confidenceOut');
  const syncRange = () => out.textContent = `${rng.value}%`;
  rng.addEventListener('input', syncRange);

  // Auto-Vorschlag triggern
  ['title','decision','options','chosen','reasons','assumptions','success'].forEach(id=>{
    const el = $('#'+id); if(el) el.addEventListener('input', scheduleSuggest);
  });
  ['fac-reversible','fac-stake','fac-fam','fac-evidence','fac-buffer'].forEach(id=>{
    $('#'+id).addEventListener('change', suggestConfidenceUI);
  });

  if(!$('#reviewDate').value) $('#reviewDate').value = todayISO();
  syncRange();
  refresh();
  suggestConfidenceUI();
}

function toggleMode(){
  const isSimple = !document.body.classList.contains('simple');
  document.body.classList.toggle('simple', isSimple);
  $('#btn-mode').textContent = 'Modus: ' + (isSimple ? 'Einfach' : 'Pro');
  localStorage.setItem(MODE_KEY, isSimple ? 'simple' : 'pro');
}

// ===== Templates =====
function findTemplate(id){
  for(const arr of Object.values(TEMPLATES_BY_TOPIC)){
    const t = arr.find(x=>x.id===id); if(t) return t;
  }
}
function applyTemplate(id){
  const t = findTemplate(id); if(!t) return;
  const d = t.data || {};
  $('#title').value = d.title || '';
  $('#decision').value = d.decision || '';
  $('#options').value = d.options || '';
  $('#chosen').value = d.chosen || '';
  $('#reasons').value = d.reasons || '';
  $('#assumptions').value = d.assumptions || '';
  $('#success').value = d.success || '';
  $('#confidenceRange').value = d.confidence || 60;
  $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#catBadge').textContent = 'Kategorie: ' + (t.category || 'general');
  $('#catBadge').dataset.category = t.category || 'general';
  suggestConfidenceUI();
}

// ===== CRUD =====
function onSave(){
  const category = $('#catBadge').dataset.category || 'general';
  const factors = getFactors();
  const suggested = suggestConfidenceNow();
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
    confidenceSource: (Number($('#confidenceRange').value)===suggested? 'auto':'manual'),
    suggestedConfidence: suggested,
    notes: $('#notes')?.value.trim() || '',
    status: 'open', outcome: null, brier: null,
    category, factors
  };

  if(!capsule.title){ alert('Titel fehlt.'); return; }
  if(!capsule.decision){ alert('Entscheidung fehlt.'); return; }

  STATE.capsules.push(capsule);
  saveState();
  refresh();
  clearForm();
}

function clearForm(){
  ['title','decision','options','chosen','reasons','assumptions','success','notes'].forEach(id=>{ const el=$("#"+id); if(el) el.value=''; });
  $('#confidenceRange').value = 70; $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#reviewDate').value = todayISO(); $('#templateSel').value='';
  $('#catBadge').textContent = 'Kategorie: –'; delete $('#catBadge').dataset.category;
  $('#fac-reversible').value='1'; $('#fac-stake').value='mid'; $('#fac-fam').value='1'; $('#fac-evidence').value='1'; $('#fac-buffer').value='1';
  suggestConfidenceUI();
}

// ===== ICS + Export/Import =====
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

function exportJSON(){
  const bundle = { version:2, state: STATE, profile: PROFILE };
  downloadFile('decision-capsule-export.json', JSON.stringify(bundle,null,2), 'application/json');
}
function exportCSV(){
  const rows = [ ['id','title','dateCreated','reviewDate','decision','chosen','confidence','confSource','status','outcome','brier','category'] ];
  STATE.capsules.forEach(c=>{
    rows.push([c.id,c.title,c.dateCreated,c.reviewDate,c.decision,c.chosen,c.confidence,c.confidenceSource,c.status,c.outcome??'', c.brier??'', c.category??'']);
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
      if(data && data.version>=2 && data.state && data.profile){
        STATE = data.state; PROFILE = data.profile;
        saveState(); saveProfile(); refresh(); suggestConfidenceUI(); return;
      }
      if(!data || !Array.isArray(data.capsules)) throw new Error('Ungültiges Format');
      STATE = data; saveState(); refresh();
    }catch(e){ alert('Import fehlgeschlagen: '+ e.message); }
  };
  reader.readAsText(file);
}
function downloadFile(name, content, type){
  const blob = new Blob([content], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

// ===== Review =====
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

  // Kalibrierung aktualisieren
  const cat = c.category || 'general';
  const bucket = ensureCat(cat);
  const add = {success:[1,0], partial:[0.5,0.5], fail:[0,1]}[res];
  bucket.alpha += add[0]; bucket.beta += add[1];
  saveProfile();

  saveState(); refresh();
  $('#rev-notes').value=''; $('#rev-result').value=''; $('#rev-id').value='';
}

// ===== UI Refresh =====
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
      <button class="btn err" data-act="del" data-id="${c.id}">Löschen</button>
    </div>
  `;
  div.addEventListener('click', e=>{
    const t = e.target.closest('button'); if(!t) return;
    const id = t.getAttribute('data-id');
    const act = t.getAttribute('data-act');
    if(act==='del') {
      if(confirm('Capsule wirklich löschen?')){
        STATE.capsules = STATE.capsules.filter(x=>x.id!==id); saveState(); refresh();
      }
    }
    if(act==='load'){
      const c = STATE.capsules.find(x=>x.id===id); if(!c) return;
      $('#title').value = c.title; $('#decision').value=c.decision; $('#options').value = (c.options||[]).join('\n');
      $('#chosen').value = c.chosen; $('#reasons').value=(c.reasons||[]).join('\n');
      $('#assumptions').value=(c.assumptions||[]).join('\n'); $('#success').value=c.success; $('#reviewDate').value=c.reviewDate;
      $('#confidenceRange').value=c.confidence; $('#confidenceRange').dispatchEvent(new Event('input'));
      $('#notes').value=c.notes||'';
      $('#catBadge').textContent = 'Kategorie: ' + (c.category||'general');
      $('#catBadge').dataset.category = c.category||'general';
      setFactors(c.factors);
      window.scrollTo({top:0,behavior:'smooth'}); suggestConfidenceUI();
    }
    if(act==='mark-reviewed'){
      $('#rev-id').value = id; document.querySelector('section[aria-label="Review"]').scrollIntoView({behavior:'smooth'});
    }
  });
  return div;
}

// ===== Confidence-Autopilot =====
const W = {bias:-0.2, rc:0.8, ac:-0.6, ev:0.9, fam:0.5, rev:0.4, stake:0.6, tb:0.3};

function getFactors(){
  return {
    reversible: $('#fac-reversible').value==='1',
    stake: $('#fac-stake').value,            // low|mid|high
    familiarity: Number($('#fac-fam').value),// 0..2
    evidence: Number($('#fac-evidence').value), // 0..2
    timeBuffer: Number($('#fac-buffer').value)  // 0..2
  };
}
function setFactors(f){
  if(!f){ $('#fac-reversible').value='1'; $('#fac-stake').value='mid'; $('#fac-fam').value='1'; $('#fac-evidence').value='1'; $('#fac-buffer').value='1'; return; }
  $('#fac-reversible').value = f.reversible? '1':'0';
  $('#fac-stake').value = f.stake||'mid';
  $('#fac-fam').value = String(f.familiarity ?? 1);
  $('#fac-evidence').value = String(f.evidence ?? 1);
  $('#fac-buffer').value = String(f.timeBuffer ?? 1);
}

function extractFeaturesFromText(){
  const reasons = parseLines($('#reasons').value);
  const assumptions = parseLines($('#assumptions').value);
  const success = $('#success').value;
  const numCount = (success||"").match(/([€$]|%|\b\d+[\.,]?\d*\b)/g)?.length || 0;
  const hasDate  = /(20\d{2}|\b[0-3]?\d[./][0-1]?\d\b)/.test(success||"") ? 1 : 0;
  const rc = Math.min(reasons.length,5) / 5;
  const ac = Math.min(assumptions.length,5) / 5;
  const evDetect = Math.min(numCount,5) / 5 + hasDate*0.2;
  return { rc, ac, evDetect };
}

function p_feature(feat){
  const f = getFactors();
  const ev = Math.min(1, (f.evidence/2)*0.6 + Math.min(1, feat.evDetect)*0.6);
  const fam = (f.familiarity)/2; // 0..1
  const rev = f.reversible ? 1 : 0;
  const stake = {low:1, mid:0.5, high:0}[f.stake||'mid'];
  const tb = (f.timeBuffer)/2; // 0..1
  const z = W.bias + W.rc*feat.rc + W.ac*feat.ac + W.ev*ev + W.fam*fam + W.rev*rev + W.stake*stake + W.tb*tb;
  return logistic(z);
}
function p_prior(category){
  const {alpha, beta} = ensureCat(category);
  return alpha/(alpha+beta);
}
function combine(pf, pp, category){
  const {alpha, beta} = ensureCat(category);
  const n = alpha+beta, k = 10; // Heuristik-Gewicht
  const lambda = n/(n+k);
  return lambda*pp + (1-lambda)*pf;
}

let suggestTimer=null;
function scheduleSuggest(){ clearTimeout(suggestTimer); suggestTimer = setTimeout(suggestConfidenceUI, 220); }

function getCurrentCategory(){ return $('#catBadge').dataset.category || 'general'; }

function suggestConfidenceNow(){
  const feat = extractFeaturesFromText();
  const pf = p_feature(feat);
  const cat = getCurrentCategory();
  const pp = p_prior(cat);
  const p = combine(pf, pp, cat);
  return Math.round(p*100);
}

function categoryBias(cat){
  const reviewed = STATE.capsules.filter(c=>c.category===cat && c.status==='reviewed');
  if(reviewed.length===0) return null;
  let sumP=0, sumY=0; reviewed.forEach(c=>{
    sumP += (c.confidence||50)/100;
    sumY += (c.outcome==='success'?1:(c.outcome==='partial'?0.5:0));
  });
  return (sumP/reviewed.length) - (sumY/reviewed.length); // >0 = Überkonfidenz
}

function suggestConfidenceUI(){
  const auto = suggestConfidenceNow();
  $('#autoVal').textContent = auto + '%';
  const cat = getCurrentCategory();
  const bias = categoryBias(cat);
  const f = getFactors();
  const pieces = [
    f.evidence>=2? 'Evidenz stark': (f.evidence===1? 'Evidenz mittel':'Evidenz gering'),
    f.reversible? 'reversibel':'irreversibel',
    f.stake==='high'? 'hoher Einsatz': (f.stake==='mid'?'mittlerer Einsatz':'niedriger Einsatz')
  ];
  if(bias!=null){
    const sign = bias>0? '+':'−';
    pieces.push(`Historie ${sign}${Math.round(Math.abs(bias)*100)}% in ${cat}`);
  }
  $('#autoExplain').textContent = 'Auto-Vorschlag: ' + auto + '% – ' + pieces.join(' · ');
}

function applyAuto(){
  const v = suggestConfidenceNow();
  $('#confidenceRange').value = v; $('#confidenceRange').dispatchEvent(new Event('input'));
}
