/* ==================== STATE & HELPERS ==================== */
export const S = {
  user:null, teams:[], team:null, teamId:null,
  spelers:[], wedstrijden:[],
  wedstrijd:null, wedstrijdId:null, kwart:'1',
  teamTab:'wedstrijden', geselecteerd:null,
  clubs:[], club:null, clubId:null, clubTab:'teams', clubTeams:[], clubTrainingen:[],
  trainingen:[], trainingenGelezen:{},
  unsub:{}, klokInterval:null, saveTimer:null, lokaalTot:0,
};

export const $  = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function meld(t){
  const m = $('#melding'); m.textContent = t; m.classList.add('zichtbaar');
  clearTimeout(meld._t); meld._t = setTimeout(()=>m.classList.remove('zichtbaar'), 2600);
}
export function mmss(sec){
  sec = Math.max(0, Math.round(sec));
  return String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
}
export function uurMin(sec){
  const m = Math.round(sec/60);
  return m >= 60 ? Math.floor(m/60)+'u'+String(m%60).padStart(2,'0') : m+' min';
}
export function datumNL(d){
  try { return new Date(d+'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'}); }
  catch { return d; }
}
export function nieuweCode(){
  const t = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => t[Math.floor(Math.random()*t.length)]).join('');
}
export function speler(pid){ return S.spelers.find(p => p.id === pid); }
export function spelerNaam(pid){ const p = speler(pid); return p ? p.naam : '—'; }
export function spelerNr(pid){ const p = speler(pid); return p && p.nummer != null && p.nummer !== '' ? p.nummer : '·'; }
export function initialen(naam){ return String(naam||'?').trim().slice(0,1).toUpperCase() || '?'; }

/* ---------- Modal ---------- */
export function openModal(html){
  $('#modalInhoud').innerHTML = '<div class="sluitbalk"></div>' + html;
  $('#modalAchter').classList.add('open');
}
export function sluitModal(){ $('#modalAchter').classList.remove('open'); }

/* ---------- Navigatie ---------- */
export function toon(viewId){
  $$('.view').forEach(v => v.classList.remove('actief'));
  $('#view-'+viewId).classList.add('actief');
  window.scrollTo(0,0);
}
export function stopUnsubs(...keys){
  for (const k of keys){ if (S.unsub[k]){ S.unsub[k](); delete S.unsub[k]; } }
}

/* modal sluiten bij klik op de achtergrond — één keer registreren */
export function initModalSluiten(){
  $('#modalAchter').addEventListener('click', e => { if (e.target.id === 'modalAchter') sluitModal(); });
}
