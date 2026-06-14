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
/* Leesbare teamcode op basis van de teamnaam, bijv. "JO11-1" → "ASVJO11-1".
   - clubAfkorting wordt vooraan geplakt (bijv. ASV) zodat codes clubbreed uniek zijn.
   - alles naar hoofdletters; alleen letters, cijfers en streepjes blijven over.
   - bestaandeCodes (array) voorkomt dubbele codes: bij botsing komt er -2, -3, ... achter. */
export function teamCode(teamnaam, clubAfkorting = '', bestaandeCodes = []){
  const opschonen = s => String(s||'')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '')      // spaties en rare tekens eruit
    .replace(/-+/g, '-')               // dubbele streepjes samenvoegen
    .replace(/^-|-$/g, '');            // streepje aan begin/eind weg
  const pre = opschonen(clubAfkorting);
  let basis = (pre ? pre : '') + opschonen(teamnaam);
  if (!basis) basis = nieuweCode();
  const bestaand = new Set(bestaandeCodes.map(c => String(c).toUpperCase()));
  if (!bestaand.has(basis)) return basis;
  for (let i = 2; i < 100; i++){
    const kandidaat = basis + '-' + i;
    if (!bestaand.has(kandidaat)) return kandidaat;
  }
  return basis + '-' + nieuweCode();
}
export function speler(pid){ return S.spelers.find(p => p.id === pid); }
export function spelerNaam(pid){ const p = speler(pid); return p ? p.naam : '—'; }
export function spelerNr(pid){ const p = speler(pid); return p && p.nummer != null && p.nummer !== '' ? p.nummer : '·'; }
export function initialen(naam){ return String(naam||'?').trim().slice(0,1).toUpperCase() || '?'; }
/* korte afkorting uit een clubnaam.
   "ASV'33" → "ASV", "RKVV Mifano" → "RKVV", "SV Brandevoort" → "SV".
   Aanpak: pak het eerste woord; bestaat dat (vooral) uit hoofdletters, dan is
   dat al de clubafkorting. Anders initialen van de woorden. */
export function clubAfkorting(clubnaam){
  const ruw = String(clubnaam||'').trim();
  if (!ruw) return '';
  const woorden = ruw.split(/[\s'’.\-]+/).filter(Boolean);
  const eerste = (woorden[0]||'').replace(/[^A-Za-zÀ-ÿ0-9]/g,'');
  // eerste woord is een afkorting als het ≥2 letters heeft en grotendeels hoofdletters is
  const letters = eerste.replace(/[^A-Za-z]/g,'');
  const hoofdletters = eerste.replace(/[^A-Z]/g,'');
  if (letters.length >= 2 && hoofdletters.length >= letters.length - 1){
    return eerste.toUpperCase().slice(0,6);
  }
  // anders: initialen van alle woorden
  const af = woorden.map(w => {
    const h = w.replace(/[^A-Za-zÀ-ÿ0-9]/g,'');
    return h ? h[0].toUpperCase() : '';
  }).join('');
  return af.slice(0,6);
}

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
