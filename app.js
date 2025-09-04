'use strict';

/* ===== Helpers ===== */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0,10);
const parseLines = t => (t||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
const clamp = (n,min,max) => Math.max(min, Math.min(max, isNaN(n)?min:n));
const escapeHTML = s => (s||'').replace(/[&<>\"']/g, m=>({"&":"&amp;","<":"&lt;","&gt;":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const logistic = z => 1/(1+Math.exp(-z));
const safeObj = o => (o && typeof o === 'object') ? o : {};

/* ===== Keys ===== */
const STATE_KEY   = 'decision_capsules_v3';
const PROFILE_KEY = 'decision_capsule_profile_v1';
const MODE_KEY    = 'decision_capsule_mode';
const VIEW_KEY    = 'decision_capsule_view';
const DRAFT_KEY   = 'dc_draft_v1';

/* ===== State ===== */
let STATE   = loadState();
let PROFILE = loadProfile();
let VIEW    = localStorage.getItem(VIEW_KEY) || 'wizard';
let STEP    = 1;

function loadState(){ try{ const r=localStorage.getItem(STATE_KEY); if(r) return JSON.parse(r);
  const old=localStorage.getItem('decision_capsules_v2')||localStorage.getItem('decision_capsules_v1'); return old?JSON.parse(old):{capsules:[]}; }catch{ return {capsules:[]}; } }
function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(STATE)); }
function loadProfile(){ try{ const r=localStorage.getItem(PROFILE_KEY); if(r) return JSON.parse(r); }catch{} return {categories:{},weights:null}; }
function saveProfile(){ localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); }
function ensureCat(cat){ if(!PROFILE.categories[cat]) PROFILE.categories[cat]={alpha:3,beta:3}; return PROFILE.categories[cat]; }

/* ===== Confidence Model ===== */
const W = {bias:-0.2, rc:0.8, ac:-0.6, ev:0.9, fam:0.5, rev:0.4, stake:0.6, tb:0.3};

function factorVal(sel, def){ const row=$(sel); const act=row&&row.querySelector('.chip.active'); return act?act.getAttribute('data-value'):def; }
function getFactors(){
  return {
    reversible: factorVal('.chip-row[data-factor="reversible"]','1')==='1',
    stake: factorVal('.chip-row[data-factor="stake"]','mid'),
    familiarity: Number(factorVal('.chip-row[data-factor="familiarity"]','1')),
    evidence: Number(factorVal('.chip-row[data-factor="evidence"]','1')),
    timeBuffer: Number(factorVal('.chip-row[data-factor="timeBuffer"]','1'))
  };
}
function extractFeaturesFromText(){
  const reasons=parseLines($('#reasons')?.value), assumptions=parseLines($('#assumptions')?.value), success=$('#success')?.value;
  const num=(success||"").match(/([€$]|%|\b\d+[\.,]?\d*\b)/g);
  const rc=Math.min((reasons||[]).length,5)/5, ac=Math.min((assumptions||[]).length,5)/5;
  const hasDate=/(20\d{2}|\b[0-3]?\d[./][0-1]?\d\b)/.test(success||"")?1:0;
  const evDetect=Math.min(num?num.length:0,5)/5 + hasDate*0.2;
  return { rc, ac, evDetect };
}
function p_feature(fx){
  const f=getFactors();
  const ev=Math.min(1, (f.evidence/2)*0.6 + Math.min(1, fx.evDetect)*0.6);
  const fam=f.familiarity/2, rev=f.reversible?1:0, stake={low:1,mid:0.5,high:0}[f.stake||'mid'], tb=f.timeBuffer/2;
  return logistic(W.bias + W.rc*fx.rc + W.ac*fx.ac + W.ev*ev + W.fam*fam + W.rev*rev + W.stake*stake + W.tb*tb);
}
function p_prior(cat){ const b=ensureCat(cat); return b.alpha/(b.alpha+b.beta); }
function combine(pf, pp, cat){ const b=ensureCat(cat); const n=b.alpha+b.beta, k=10; const λ=n/(n+k); return λ*pp + (1-λ)*pf; }
function categoryBias(cat){
  const rev=STATE.capsules.filter(c=>c.category===cat && c.status==='reviewed'); if(!rev.length) return null;
  let p=0,y=0; rev.forEach(c=>{ p+=(c.confidence||50)/100; y+=(c.outcome==='success'?1:(c.outcome==='partial'?0.5:0)); }); return (p/rev.length)-(y/rev.length);
}
function getCurrentCategory(){ return $('#catBadge')?.dataset.category || 'general'; }
function suggestConfidenceNow(){ const f=extractFeaturesFromText(), pf=p_feature(f), cat=getCurrentCategory(), pp=p_prior(cat); return Math.round(combine(pf,pp,cat)*100); }
function updateAutoUI(){
  const auto=suggestConfidenceNow(); const val=$('#autoVal'); if(val) val.textContent=auto+'%';
  const cat=getCurrentCategory(), bias=categoryBias(cat), f=getFactors();
  const bits=[ f.evidence>=2?'Belege stark':(f.evidence===1?'Belege mittel':'Belege gering'), f.reversible?'reversibel':'irreversibel', f.stake==='high'?'hoher Einsatz':(f.stake==='mid'?'mittlerer Einsatz':'niedriger Einsatz') ];
  if(bias!=null) bits.push((bias>0?'+':'−')+Math.round(Math.abs(bias)*100)+'% in '+cat);
  const ax=$('#autoExplain'); if(ax) ax.textContent='Auto-Vorschlag: '+auto+'% – '+bits.join(' · ');
}

/* ===== Draft ===== */
function readDraft(){ try{ const r=localStorage.getItem(DRAFT_KEY); return r?JSON.parse(r):null; }catch{ return null; } }
function writeDraft(){
  const d={ step:STEP, title:$('#title')?.value?.trim()||'', decision:$('#decision')?.value?.trim()||'',
    chosen:$('#chosen')?.value?.trim()||'', options:$('#options')?.value||'',
    reasons:$('#reasons')?.value||'', assumptions:$('#assumptions')?.value||'',
    success:$('#success')?.value?.trim()||'', reviewDate:$('#reviewDate')?.value||todayISO(),
    confidence:Number($('#confidenceRange')?.value||70), category:getCurrentCategory(), factors:getFactors() };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
}
function loadDraftIfAny(){
  const d=readDraft(); if(!d) return;
  $('#title').value=d.title; $('#decision').value=d.decision; $('#chosen').value=d.chosen;
  $('#options').value=d.options; $('#reasons').value=d.reasons; $('#assumptions').value=d.assumptions;
  $('#success').value=d.success; $('#reviewDate').value=d.reviewDate; $('#confidenceRange').value=d.confidence; $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#catBadge').textContent='Kategorie: '+(d.category||'general'); $('#catBadge').dataset.category=d.category||'general';
  setFactorChips(d.factors||{}); STEP=d.step||1;
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', init);

function init(){
  // Modus & Ansicht
  const m=localStorage.getItem(MODE_KEY)||'simple';
  document.body.classList.toggle('simple', m==='simple');
  $('#btn-mode').textContent='Modus: '+(m==='simple'?'Einfach':'Pro');
  $('#btn-mode').addEventListener('click', ()=>{ const s=!document.body.classList.contains('simple'); document.body.classList.toggle('simple', s); $('#btn-mode').textContent='Modus: '+(s?'Einfach':'Pro'); localStorage.setItem(MODE_KEY, s?'simple':'pro'); });

  setView(VIEW); gotoStep(1);

  // Buttons
  $('#btn-save').addEventListener('click', onSave);
  $('#btn-ics').addEventListener('click', onICS);
  $('#btn-clear').addEventListener('click', clearForm);
  $('#btn-save-wizard').addEventListener('click', onSave);
  $('#btn-ics-wizard').addEventListener('click', onICS);
  $('#btn-prev').addEventListener('click', ()=>gotoStep(STEP-1));
  $('#btn-next').addEventListener('click', ()=>gotoStep(STEP+1));
  $('#btn-view').addEventListener('click', ()=>setView(VIEW==='wizard'?'form':'wizard'));
  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#import-json').addEventListener('change', importJSON);
  $('#btn-save-review').addEventListener('click', saveReview);
  $('#btn-apply-auto').addEventListener('click', ()=>{ const v=suggestConfidenceNow(); $('#confidenceRange').value=v; $('#confidenceRange').dispatchEvent(new Event('input')); });

  // Slideranzeige + Inputs
  const rng=$('#confidenceRange'), out=$('#confidenceOut'); rng.addEventListener('input', ()=> out.textContent=`${rng.value}%`);
  ;['title','decision','options','chosen','reasons','assumptions','success','reviewDate'].forEach(id=>{
    const el=$('#'+id); el?.addEventListener('input', debounce(()=>{ writeDraft(); updateAutoUI(); updateSummary(); },200));
  });
  rng.addEventListener('input', ()=>{ writeDraft(); updateSummary(); });

  // Faktor-Chips
  $$('.chip-row[data-factor] .chip-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{ const row=btn.parentElement; row.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); btn.classList.add('active'); writeDraft(); updateAutoUI(); });
  });

  // Quick Dates
  $$('[data-quick-date]').forEach(b=> b.addEventListener('click', ()=> quickDate('#reviewDate', b.getAttribute('data-quick-date')) ));
  $$('[data-quick-date2]').forEach(b=> b.addEventListener('click', ()=> quickDate('#reviewDate2', b.getAttribute('data-quick-date2')) ));

  // Drawer
  $('#drawer-close').addEventListener('click', hideDrawer);
  $('#drawer').addEventListener('click', (e)=>{ if(e.target.id==='drawer') hideDrawer(); });

  // Templates/Chips/Icons
  try{ renderTopicGrid(); renderSuccessChips(); }catch(e){ console.warn('templates.js fehlt/fehlerhaft', e); }

  if(!$('#reviewDate').value) $('#reviewDate').value=todayISO();
  $('#reviewDate2').value=$('#reviewDate').value;

  loadDraftIfAny();
  refresh(); updateAutoUI(); updateSummary(); gotoStep(STEP);
}

/* ===== View / Wizard ===== */
function setView(v){
  VIEW=v; document.body.classList.toggle('view-wizard', v==='wizard'); document.body.classList.toggle('view-form', v==='form');
  $('#btn-view').textContent='Ansicht: '+(v==='wizard'?'Wizard':'Formular'); localStorage.setItem(VIEW_KEY, v);
  if(v==='form'){ $$('.wiz-step').forEach(s=>s.classList.add('active')); } else { $$('.wiz-step').forEach((s,i)=> s.classList.toggle('active', i===0)); }
}
function gotoStep(n){
  if(VIEW!=='wizard') return;
  STEP=Math.max(1,Math.min(4,n));
  $$('.wiz-step').forEach(s=> s.classList.toggle('active', Number(s.dataset.step)===STEP));
  $$('.stepper .step').forEach(s=> s.classList.toggle('current', Number(s.dataset.step)===STEP));
  $('#btn-prev').style.visibility=STEP>1?'visible':'hidden';
  $('#btn-next').style.display=STEP<4?'inline-flex':'none';
  $('#btn-save-wizard').style.display=STEP===4?'inline-flex':'none';
  $('#btn-ics-wizard').style.display=STEP===4?'inline-flex':'none';
  if(STEP===4){ $('#reviewDate2').value=$('#reviewDate').value; updateSummary(); }
  writeDraft();
}

/* ===== Topic Grid mit Bild-Kacheln + „Mehr…“ ===== */
function tplSrc(){ return safeObj(window.TEMPLATES_BY_TOPIC); }
function metaSrc(){ return safeObj(window.TOPIC_META); }
function chipSrc(){ return safeObj(window.SUCCESS_CHIPS); }

function renderTopicGrid(){
  const grid=$('#topicGrid'); if(!grid) return; grid.innerHTML='';
  const topics=tplSrc(), meta=metaSrc();
  Object.entries(topics).forEach(([topic, arr])=>{
    const card=document.createElement('div'); const metaInfo=meta[topic]||{slug:'general'};
    card.className='topic-card topic-card--'+metaInfo.slug;
    card.setAttribute('data-topic', topic);

    const title=document.createElement('div'); title.className='topic-title'; title.textContent=topic;
    const row=document.createElement('div'); row.className='topic-templates';

    (arr||[]).slice(0,3).forEach(t=>{
      const chip=document.createElement('button'); chip.className='topic-chip'; chip.textContent=t.name;
      chip.addEventListener('click', (ev)=>{ ev.stopPropagation(); applyTemplate(t.id); });
      row.appendChild(chip);
    });

    // Mehr… Chip
    const more=document.createElement('button'); more.className='topic-chip more'; more.textContent='Mehr…';
    more.addEventListener('click', (ev)=>{ ev.stopPropagation(); openDrawer(topic, arr||[]); });
    row.appendChild(more);

    card.appendChild(title); card.appendChild(row); grid.appendChild(card);
  });
}

function openDrawer(topic, list){
  const d=$('#drawer'); const c=$('#drawer-content'); const h=$('#drawer-title');
  h.textContent=topic; c.innerHTML='';
  list.forEach(t=>{
    const b=document.createElement('button'); b.className='tpl-btn'; b.textContent=t.name;
    b.addEventListener('click', ()=>{ applyTemplate(t.id); hideDrawer(); });
    c.appendChild(b);
  });
  d.classList.remove('hidden'); d.setAttribute('aria-hidden','false');
}
function hideDrawer(){ const d=$('#drawer'); d.classList.add('hidden'); d.setAttribute('aria-hidden','true'); }

function renderSuccessChips(){
  const box=$('#successChips'); if(!box) return; const src=chipSrc();
  const cat=getCurrentCategory()||'general'; const chips=src[cat]||src.general||[];
  box.innerHTML=''; chips.forEach(txt=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=txt;
    b.addEventListener('click', ()=>{ const cur=$('#success').value.trim(); $('#success').value = cur ? (cur.includes(txt)? cur : (cur + (cur.endsWith('.')?'':' · ') + txt)) : txt; writeDraft(); updateAutoUI(); updateSummary(); });
    box.appendChild(b);
  });
}
function findTemplate(id){
  const src=tplSrc(); let res=null;
  Object.values(src).some(arr=>{ const t=(arr||[]).find(x=>x.id===id); if(t){res=t; return true;} return false; });
  return res;
}
function applyTemplate(id){
  const tpl=findTemplate(id); if(!tpl) return; const d=tpl.data||{};
  $('#title').value=d.title||''; $('#decision').value=d.decision||''; $('#options').value=d.options||''; $('#chosen').value=d.chosen||'';
  $('#reasons').value=d.reasons||''; $('#assumptions').value=d.assumptions||''; $('#success').value=d.success||'';
  $('#confidenceRange').value=d.confidence||60; $('#confidenceRange').dispatchEvent(new Event('input'));
  $('#catBadge').textContent='Kategorie: '+(tpl.category||'general'); $('#catBadge').dataset.category=tpl.category||'general';
  if(!$('#reviewDate').value) $('#reviewDate').value=todayISO();
  renderSuccessChips(); writeDraft(); updateAutoUI(); updateSummary();
}

/* ===== Summary / Dates ===== */
function updateSummary(){
  const s=$('#summaryCard'); if(!s) return;
  const title=$('#title').value.trim()||'—', decision=$('#decision').value.trim()||'—', success=$('#success').value.trim()||'—', conf=$('#confidenceRange').value||'—';
  s.innerHTML=`<div class="line"><span class="k">Titel:</span> ${escapeHTML(title)}</div>
               <div class="line"><span class="k">Entscheidung:</span> ${escapeHTML(decision)}</div>
               <div class="line"><span class="k">Erfolg:</span> ${escapeHTML(success)}</div>
               <div class="line"><span class="k">Wahrscheinlichkeit:</span> ${conf}%</div>`;
}
function quickDate(sel, add){
  const el=$(sel); const base=new Date(); base.setHours(0,0,0,0);
  const n=Number(add.replace('+','')); const d=new Date(base.getTime()+n*86400000);
  const iso=d.toISOString().slice(0,10); el.value=iso; if(sel==='#reviewDate') $('#reviewDate2').value=iso; writeDraft(); updateSummary();
}

/* ===== Save / ICS / Clear ===== */
function collectCapsule(){
  const category=getCurrentCategory(), factors=getFactors(), suggested=suggestConfidenceNow();
  return {
    id:uid(), dateCreated:new Date().toISOString(),
    title:$('#title').value.trim(), decision:$('#decision').value.trim(),
    options:parseLines($('#options').value), chosen:$('#chosen').value.trim(),
    reasons:parseLines($('#reasons').value), assumptions:parseLines($('#assumptions').value),
    success:$('#success').value.trim(),
    reviewDate:($('#reviewDate2').value || $('#reviewDate').value || todayISO()),
    confidence:clamp(parseInt($('#confidenceRange').value,10),1,99),
    confidenceSource:(Number($('#confidenceRange').value)===suggested?'auto':'manual'),
    suggestedConfidence:suggested, notes:'',
    status:'open', outcome:null, brier:null, category, factors
  };
}
function onSave(){
  const cap=collectCapsule();
  if(!cap.title){ alert('Bitte Titel eingeben.'); gotoStep(1); return; }
  if(!cap.decision){ alert('Bitte Entscheidung eingeben.'); gotoStep(2); return; }
  if(!cap.success){ alert('Bitte Erfolgskriterium eingeben.'); gotoStep(3); return; }
  STATE.capsules.push(cap); saveState(); localStorage.removeItem(DRAFT_KEY);
  refresh(); updateSummary(); alert('Gespeichert. Review am '+cap.reviewDate+'.');
  clearForm(); if(VIEW==='wizard') gotoStep(1);
}
function onICS(){
  const title=$('#title').value.trim()||'Decision Capsule Review';
  const dt=($('#reviewDate2').value || $('#reviewDate').value || todayISO());
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DecisionCapsule//DE','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    `UID:${uid()}@decisioncapsule.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'Z')}`,
    `DTSTART;VALUE=DATE:${dt.replace(/-/g,'')}`, `SUMMARY:Decision Capsule Review: ${title.replace(/,/g,'\\,').replace(/;/g,'\\;')}`,
    'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'})); a.download='decision-review.ics'; a.click(); URL.revokeObjectURL(a.href);
}
function clearForm(){
  ['title','decision','options','chosen','reasons','assumptions','success'].forEach(id=>{ const el=$("#"+id); if(el) el.value=''; });
  $('#confidenceRange').value=70; $('#confidenceRange').dispatchEvent(new Event('input'));
  const iso=todayISO(); $('#reviewDate').value=iso; $('#reviewDate2').value=iso;
  $('#catBadge').textContent='Kategorie: –'; delete $('#catBadge').dataset.category;
  setFactorChips({reversible:'1',stake:'mid',familiarity:1,evidence:1,timeBuffer:1});
  renderSuccessChips(); writeDraft(); updateAutoUI(); updateSummary();
}
function setFactorChips(f){
  const set=(n,v)=>{ const row=document.querySelector(`.chip-row[data-factor="${n}"]`); if(!row) return; row.querySelectorAll('.chip').forEach(c=> c.classList.toggle('active', c.getAttribute('data-value')==String(v))); };
  if(f.reversible!=null) set('reversible', f.reversible?'1':'0');
  if(f.stake) set('stake', f.stake);
  if(f.familiarity!=null) set('familiarity', f.familiarity);
  if(f.evidence!=null) set('evidence', f.evidence);
  if(f.timeBuffer!=null) set('timeBuffer', f.timeBuffer);
}

/* ===== Export/Import/Review/Dashboard ===== */
function exportJSON(){ const bundle={version:3,state:STATE,profile:PROFILE}; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})); a.download='decision-capsule-export.json'; a.click(); URL.revokeObjectURL(a.href); }
function exportCSV(){ const rows=[['id','title','dateCreated','reviewDate','decision','chosen','confidence','confSource','status','outcome','brier','category']]; STATE.capsules.forEach(c=>rows.push([c.id,c.title,c.dateCreated,c.reviewDate,c.decision,c.chosen,c.confidence,c.confidenceSource,c.status,c.outcome||'',c.brier||'',c.category||''])); const csv=rows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='decision-capsules.csv'; a.click(); URL.revokeObjectURL(a.href); }
function importJSON(ev){ const f=ev.target.files&&ev.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(d&&d.version>=2&&d.state&&d.profile){ STATE=d.state; PROFILE=d.profile; saveState(); saveProfile(); refresh(); return;} if(Array.isArray(d.capsules)){ STATE=d; saveState(); refresh(); return;} alert('Ungültiges Format.'); }catch(e){ alert('Import fehlgeschlagen: '+e.message);} }; r.readAsText(f); }

function saveReview(){
  const id=$('#rev-id').value; if(!id){ alert('Bitte Capsule wählen.'); return; }
  const res=$('#rev-result').value; if(!res){ alert('Bitte Ergebnis wählen.'); return; }
  const notes=$('#rev-notes').value.trim();
  const c=STATE.capsules.find(x=>x.id===id); if(!c) return;
  c.status='reviewed'; c.outcome=res; const y=res==='success'?1:(res==='partial'?0.5:0); const p=(c.confidence||50)/100;
  c.brier=((p-y)**2).toFixed(4); c.reviewNotes=notes;
  const b=ensureCat(c.category||'general'); const add=res==='success'?[1,0]:(res==='partial'?[0.5,0.5]:[0,1]); b.alpha+=add[0]; b.beta+=add[1]; saveProfile();
  saveState(); refresh(); $('#rev-notes').value=''; $('#rev-result').value=''; $('#rev-id').value='';
}

function refresh(){
  $('#stat-open').textContent=STATE.capsules.filter(c=>c.status==='open').length;
  $('#stat-soon').textContent=STATE.capsules.filter(c=>c.status==='open' && daysUntil(c.reviewDate)<=7).length;
  const br=STATE.capsules.map(c=>Number(c.brier)).filter(n=>!isNaN(n)); $('#stat-brier').textContent=br.length?avg(br).toFixed(3):'–';
  renderLists();
  $('#rev-id').innerHTML='<option value="">– wählen –</option>'+STATE.capsules.map(c=>`<option value="${c.id}">${escapeHTML(c.title)} (${c.reviewDate})</option>`).join('');
  $('#db-last-sync').textContent='Stand: '+new Date().toLocaleString();
}
function daysUntil(s){ const t=new Date(); t.setHours(0,0,0,0); const d=new Date(s+'T00:00:00'); d.setHours(0,0,0,0); return Math.floor((d-t)/86400000); }
function renderLists(){
  const due=$('#list-due'), all=$('#list-all'); due.innerHTML=''; all.innerHTML='';
  const sorted=STATE.capsules.slice().sort((a,b)=>(a.reviewDate||'').localeCompare(b.reviewDate||'')); const soon=sorted.filter(c=>daysUntil(c.reviewDate)<=7 && c.status==='open');
  soon.forEach(c=>due.appendChild(renderItem(c))); sorted.forEach(c=>all.appendChild(renderItem(c)));
}
function renderItem(c){
  const d=daysUntil(c.reviewDate), cls=d<0?'overdue':(d<=7?'due':'okc');
  const div=document.createElement('div'); div.className='item';
  div.innerHTML=`<h3>${escapeHTML(c.title)}</h3>
  <div class="meta"><span>Entschieden: ${new Date(c.dateCreated).toLocaleDateString()}</span>
  <span class="${cls}">Review: ${c.reviewDate} (${d<0?(Math.abs(d)+' Tage überfällig'):(d===0?'heute':'in '+d+' Tagen')})</span>
  <span>Confidence: ${c.confidence}%${c.confidenceSource==='auto'?' (auto)':''}</span>
  <span>Status: ${c.status}</span>
  ${c.outcome?`<span>Ergebnis: ${c.outcome}${c.brier?` · Brier ${c.brier}`:''}</span>`:''}
  ${c.category?`<span>Kategorie: ${c.category}</span>`:''}</div>
  <div class="hr"></div>
  <div class="muted">${escapeHTML(c.decision)}</div>
  <div class="flex" style="margin-top:8px">
    <button class="btn" data-act="load" data-id="${c.id}">In Formular laden</button>
    ${c.status==='open'?`<button class="btn" data-act="mark-reviewed" data-id="${c.id}">Als reviewed markieren</button>`:''}
    <button class="btn warn" data-act="del" data-id="${c.id}">Löschen</button>
  </div>`;
  div.addEventListener('click', e=>{
    const t=e.target.closest('button'); if(!t) return; const id=t.getAttribute('data-id'); const act=t.getAttribute('data-act');
    if(act==='del'){ if(confirm('Capsule wirklich löschen?')){ STATE.capsules=STATE.capsules.filter(x=>x.id!==id); saveState(); refresh(); } }
    if(act==='load'){ const it=STATE.capsules.find(x=>x.id===id); if(!it) return;
      $('#title').value=it.title; $('#decision').value=it.decision; $('#options').value=(it.options||[]).join('\n'); $('#chosen').value=it.chosen;
      $('#reasons').value=(it.reasons||[]).join('\n'); $('#assumptions').value=(it.assumptions||[]).join('\n');
      $('#success').value=it.success; $('#reviewDate').value=it.reviewDate; $('#reviewDate2').value=it.reviewDate;
      $('#confidenceRange').value=it.confidence; $('#confidenceRange').dispatchEvent(new Event('input'));
      $('#catBadge').textContent='Kategorie: '+(it.category||'general'); $('#catBadge').dataset.category=it.category||'general';
      setFactorChips(it.factors||{}); renderSuccessChips(); updateAutoUI(); updateSummary(); window.scrollTo({top:0,behavior:'smooth'}); }
    if(act==='mark-reviewed'){ $('#rev-id').value=id; document.querySelector('section[aria-label="Review"]').scrollIntoView({behavior:'smooth'}); }
  });
  return div;
}

/* ===== Utils ===== */
function debounce(fn,ms){ let t=null; return ()=>{ clearTimeout(t); t=setTimeout(fn,ms); }; }
