import {
  db, collection, doc, addDoc, deleteDoc, updateDoc, deleteField,
  setDoc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, documentId
} from './firebase.js';
import {
  S, $, $$, esc, meld, datumNL, teamCode, clubAfkorting, speler, initialen, isBeheerder,
  openModal, sluitModal, toon, stopUnsubs, uurMin, bewaakTerug
} from './state.js';
import { CATEGORIEEN, CATEGORIEEN_MEIDEN, catInfo, youtubeId, youtubeThumb, youtubeWatch,
  KNVB_SEIZOEN, knvbKalenderVoorTeam,
  NIVEAUS, niveau, niveauKleur, SKILLS, skillDomein,
  LEERCURVE, leercurveRelevant, SNEL_TAGS, snelTag,
  TEAM_CATEGORIEEN, TEAM_TAGS, teamCategorie,
  KOMPAS_TIPS, isoWeek, kompasIndexVoorWeek } from './config.js';
import { analyseWedstrijd } from './analyse.js';
import { doSignOut, joinMetCode } from './auth.js';
import { openClub, modalNieuwClub, modalUitnodig } from './club.js';
import { tekenPwaBanner } from './pwa.js';
import {
  openWedstrijd, modalNieuweWedstrijd, htmlStats, renderWedstrijd
} from './wedstrijd.js';

/* Strakke lijn-iconen voor de onderbalk (laatste layout) */
const NAV_ICON = {
  wedstrijden:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.2l4.2 3-1.6 4.9H9.4L7.8 10.2z"/><path d="M12 7.2 9.5 5M12 7.2 14.5 5M16.2 10.2l2.6-.6M14.6 15.1l1.7 2.1M9.4 15.1l-1.7 2.1M7.8 10.2l-2.6-.6"/></svg>',
  spelers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>',
  planning:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  trainingen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16" rx="2.2"/><path d="M9 3.2h6v3H9z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/></svg>',
  videos:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2.2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.5 2.2-2.5 4"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none"/></svg>',
};

/* ==================== TEAMS-OVERZICHT ==================== */
export function startTeams(){
  stopUnsubs('teams','clubs','gelezen');
  const meldFout = (naam) => (err) => {
    console.error(`[Cluppie] Listener "${naam}" kon niet lezen:`, err.code, err.message);
    if (err.code === 'permission-denied') meld(`Geen toegang tot "${naam}" — controleer de Firestore-rules`);
  };
  const q1 = query(collection(db,'teams'), where('leden.'+S.user.uid, '==', true));
  S.unsub.teams = onSnapshot(q1, snap => {
    S.teams = snap.docs.map(d => ({id:d.id, ...d.data()}))
                       .sort((a,b) => (a.naam||'').localeCompare(b.naam||''));
    if (!S.teamId && !S.clubId) renderTeams();
    laadTrainingenVoorTeams();
    laadVideosVoorTeams();
  }, meldFout('teams'));
  const q2 = query(collection(db,'clubs'), where('admins.'+S.user.uid, '==', true));
  S.unsub.clubs = onSnapshot(q2, snap => {
    S.clubs = snap.docs.map(d => ({id:d.id, ...d.data()}))
                       .sort((a,b) => (a.naam||'').localeCompare(b.naam||''));
    if (!S.teamId && !S.clubId) renderTeams();
  }, meldFout('clubs'));
  const q3 = query(collection(db,'gebruikers',S.user.uid,'gelezen'));
  S.unsub.gelezen = onSnapshot(q3, snap => {
    S.trainingenGelezen = {};
    snap.docs.forEach(d => S.trainingenGelezen[d.id] = true);
    if (S.team) renderTeam();
  }, meldFout('gelezen'));
  renderTeams(); toon('teams');
}

/* trainingen voor de teams waar de coach lid van is */
let trainingenUnsubs = [];
function laadTrainingenVoorTeams(){
  trainingenUnsubs.forEach(u => u());
  trainingenUnsubs = [];
  const teamIds = S.teams.map(t => t.id);
  if (!teamIds.length){ S.trainingen = []; return; }
  const chunks = [];
  for (let i = 0; i < teamIds.length; i += 30) chunks.push(teamIds.slice(i, i+30));
  S.trainingen = [];
  chunks.forEach(c => {
    const q = query(collection(db,'trainingen'), where('teams','array-contains-any', c));
    const u = onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));
      S.trainingen = S.trainingen.filter(t => !c.some(tid => (t.teams||[]).includes(tid)) || ids.has(t.id));
      snap.docs.forEach(d => {
        const i = S.trainingen.findIndex(t => t.id === d.id);
        const data = {id:d.id, ...d.data()};
        if (i >= 0) S.trainingen[i] = data; else S.trainingen.push(data);
      });
      S.trainingen.sort((a,b) => (b.week||'').localeCompare(a.week||'') || (b.gemaakt?.seconds||0) - (a.gemaakt?.seconds||0));
      if (S.team) renderTeam();
    });
    trainingenUnsubs.push(u);
  });
}

/* video's voor de teams waar de coach lid van is */
let videoUnsubs = [];
function laadVideosVoorTeams(){
  videoUnsubs.forEach(u => u());
  videoUnsubs = [];
  const teamIds = S.teams.map(t => t.id);
  if (!teamIds.length){ S.videos = []; return; }
  const chunks = [];
  for (let i = 0; i < teamIds.length; i += 30) chunks.push(teamIds.slice(i, i+30));
  S.videos = [];
  chunks.forEach(c => {
    const q = query(collection(db,'videos'), where('teams','array-contains-any', c));
    const u = onSnapshot(q, snap => {
      const ids = new Set(snap.docs.map(d => d.id));
      S.videos = S.videos.filter(t => !c.some(tid => (t.teams||[]).includes(tid)) || ids.has(t.id));
      snap.docs.forEach(d => {
        const i = S.videos.findIndex(t => t.id === d.id);
        const data = {id:d.id, ...d.data()};
        if (i >= 0) S.videos[i] = data; else S.videos.push(data);
      });
      S.videos.sort((a,b) => (b.gemaakt?.seconds||0) - (a.gemaakt?.seconds||0));
      if (S.team) renderTeam();
    });
    videoUnsubs.push(u);
  });
}

/* ==================== WELKOM-STRIP ====================
   Klein, dagelijks wisselend blokje in de rode kop van het startscherm:
   weer bij Aarle-Rixtel (Open-Meteo, geen API-key nodig), de eerstvolgende
   wedstrijd uit al je eigen teams, en een Cruijff-citaat van de dag.
   Weer + wedstrijd worden 30 minuten gecachet (S._welkomCache) zodat een
   her-render door een Firestore-listener niet steeds opnieuw gaat fetchen. */
const CRUIJFF_QUOTES = [
  'Voetbal is simpel, maar het moeilijkste wat er is, is simpel voetballen.',
  'Elk nadeel heb z\'n voordeel.',
  'Je gaat het pas zien als je het doorhebt.',
  'Als je niet wint, is het logisch dat je verliest.',
  'Voordat ik een fout maak, maak ik die fout niet.',
  'Kwaliteit zonder snelheid is geen kwaliteit. Snelheid zonder kwaliteit is ook geen kwaliteit.',
  'Een goede trainer wordt geacht een fout op tijd te zien aankomen, en die dus te voorkomen.',
  'Zonder bal kun je niet winnen.',
  'Elke tijd heeft zijn eigen wijsheid.',
  'Waarom moeilijk doen als het makkelijk kan?',
  'Je moet schieten, anders kun je niet scoren.',
  'Ieder team dat wint, is een goed team; discussies komen daarna wel.',
  'Als je zelf de bal hebt, kan de tegenstander niet scoren.',
  'Ik heb nog nooit een club gezien die met geld op de bank kampioen is geworden.',
  'Voetballen is heel simpel, maar het simpelste is het moeilijkste wat er is.',
];
function cruijffVanVandaag(){
  const nu = new Date();
  const start = new Date(nu.getFullYear(), 0, 0);
  const dagVanJaar = Math.floor((nu - start) / 86400000);
  return CRUIJFF_QUOTES[dagVanJaar % CRUIJFF_QUOTES.length];
}

/* WMO-weercode -> emoji + kort label (Open-Meteo) */
function weerIcoon(code){
  if (code === 0) return ['☀️','helder'];
  if ([1,2].includes(code)) return ['🌤️','licht bewolkt'];
  if (code === 3) return ['☁️','bewolkt'];
  if ([45,48].includes(code)) return ['🌫️','mist'];
  if ([51,53,55,56,57].includes(code)) return ['🌦️','motregen'];
  if ([61,63,65].includes(code)) return ['🌧️','regen'];
  if ([66,67].includes(code)) return ['🌧️','ijzel'];
  if ([71,73,75,77].includes(code)) return ['❄️','sneeuw'];
  if ([80,81,82].includes(code)) return ['🌦️','buien'];
  if ([85,86].includes(code)) return ['🌨️','sneeuwbuien'];
  if ([95,96,99].includes(code)) return ['⛈️','onweer'];
  return ['🌡️',''];
}

async function weerOphalen(){
  try {
    // Aarle-Rixtel
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.52&longitude=5.62&current=temperature_2m,weather_code&timezone=Europe%2FAmsterdam';
    const res = await fetch(url);
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const [ico] = weerIcoon(data.current.weather_code);
    return `${ico} ${temp}°`;
  } catch(e){ return null; }
}

async function eerstvolgendeWedstrijd(){
  const vandaag = new Date().toISOString().slice(0,10);
  let beste = null;
  for (const t of S.teams){
    try {
      const snap = await getDocs(query(collection(db,'teams',t.id,'wedstrijden'), where('datum','>=',vandaag)));
      snap.docs.forEach(d => {
        const w = d.data();
        if (!w.datum) return;
        if (!beste || w.datum < beste.datum) beste = { ...w, teamNaam: t.naam };
      });
    } catch(e){ /* geen toegang o.i.d., negeren */ }
  }
  if (!beste) return null;
  const thuisuit = beste.thuis ? 'thuis vs' : 'uit bij';
  return `⚽ ${datumNL(beste.datum)} · ${thuisuit} ${esc(beste.tegenstander || 'onbekend')}`;
}

function welkomStripInhoud(cache){
  const delen = [cache.weer, cache.wedstrijd].filter(Boolean);
  return `${delen.length ? `<div class="welkom-strip">${delen.map(d => `<span class="ws-item">${d}</span>`).join('')}</div>` : ''}
    <div class="welkom-cruijff">“${esc(cache.quote)}” <span>— Johan Cruijff</span></div>`;
}
function welkomStripHtml(){
  const vers = 30*60*1000;
  if (S._welkomCache && (Date.now() - S._welkomCache.tijd) < vers) return welkomStripInhoud(S._welkomCache);
  return `<div class="welkom-cruijff">“${esc(cruijffVanVandaag())}” <span>— Johan Cruijff</span></div>`;
}

async function welkomStripVullen(){
  const vers = 30*60*1000; // 30 minuten
  if (S._welkomCache && (Date.now() - S._welkomCache.tijd) < vers) return; // al vers genoeg, niets doen
  const [weer, wedstrijd] = await Promise.all([weerOphalen(), eerstvolgendeWedstrijd()]);
  S._welkomCache = { tijd: Date.now(), weer, wedstrijd, quote: S._welkomCache?.quote || cruijffVanVandaag() };
  const el = document.getElementById('welkomExtra');
  if (el) el.innerHTML = welkomStripInhoud(S._welkomCache);
}

/* ==================== NOG TE EVALUEREN ====================
   Tegel op het startscherm met gespeelde wedstrijden (over al je teams heen)
   die nog geen teamevaluatie hebben. Zelfde cache-aanpak als de welkom-strip:
   15 minuten geldig, plus meteen lokaal bijgewerkt na "negeren" zodat dat niet
   op een nieuwe fetch hoeft te wachten. */
async function nogTeEvaluerenOphalen(){
  const vandaag = new Date().toISOString().slice(0,10);
  const open = [];
  for (const t of S.teams){
    try {
      const [wSnap, eSnap] = await Promise.all([
        getDocs(query(collection(db,'teams',t.id,'wedstrijden'), where('datum','<=',vandaag))),
        getDocs(collection(db,'teams',t.id,'teamevaluaties')),
      ]);
      const geevalueerd = new Set(eSnap.docs.map(d => d.data().wedstrijdId));
      wSnap.docs.forEach(d => {
        const w = {id:d.id, ...d.data()};
        if (w.evaluatieGenegeerd || geevalueerd.has(w.id)) return;
        const gespeeld = (w.goals||[]).length || analyseWedstrijd(w).kwarten;
        if (!gespeeld) return;
        open.push({...w, teamId:t.id, teamNaam:t.naam});
      });
    } catch(e){ /* geen toegang o.i.d., dit team overslaan */ }
  }
  open.sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
  return open;
}

function nogTeEvaluerenHtml(){
  const items = S._evalCache?.items;
  if (!items || !items.length) return '';
  return `
    <div class="sectie-kop" style="margin-top:4px">📝 Nog te evalueren</div>
    ${items.map(w => `
      <div class="lijst-item" data-eval-open="${w.id}" data-eval-team="${w.teamId}" style="cursor:pointer">
        <div class="team-shirt">⚽</div>
        <div class="li-tekst"><div class="titel">${esc(w.teamNaam)} – ${esc(w.tegenstander)}</div>
        <div class="meta">${datumNL(w.datum)}</div></div>
        <button data-eval-negeer="${w.id}" data-eval-negeer-team="${w.teamId}" title="Negeren" style="background:none;color:var(--ink-2);font-size:18px;padding:6px;flex-shrink:0">✕</button>
      </div>`).join('')}`;
}

async function nogTeEvaluerenVullen(){
  const vers = 15*60*1000;
  if (S._evalCache && (Date.now() - S._evalCache.tijd) < vers) return;
  const items = await nogTeEvaluerenOphalen();
  S._evalCache = { tijd: Date.now(), items };
  const el = document.getElementById('nogTeEvalueren');
  if (el){ el.innerHTML = nogTeEvaluerenHtml(); koppelNogTeEvalueren(el); }
}
function koppelNogTeEvalueren(el){
  el.querySelectorAll('[data-eval-open]').forEach(r => r.onclick = () => {
    S._pendingOpenWedstrijd = r.dataset.evalOpen;
    openTeam(r.dataset.evalTeam, 'wedstrijden');
  });
  el.querySelectorAll('[data-eval-negeer]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    const wid = b.dataset.evalNegeer, tid = b.dataset.evalNegeerTeam;
    try { await updateDoc(doc(db,'teams',tid,'wedstrijden',wid), {evaluatieGenegeerd:true}); }
    catch(err){ meld('Negeren mislukt: '+(err.code||err.message)); return; }
    if (S._evalCache) S._evalCache.items = S._evalCache.items.filter(w => w.id !== wid);
    const wrap = document.getElementById('nogTeEvalueren');
    if (wrap){ wrap.innerHTML = nogTeEvaluerenHtml(); koppelNogTeEvalueren(wrap); }
  });
}

export function renderTeams(){
  const v = $('#view-teams');
  const aantalOngelezen = S.trainingen.filter(t =>
    (t.teams||[]).some(tid => S.teams.find(x => x.id === tid)) && !S.trainingenGelezen[t.id]).length;

  // Persoonlijke begroeting: voornaam + datum van vandaag, voluit in het Nederlands
  // De naam die de coach zelf instelde staat in ledenInfo van zijn teams/clubs;
  // die heeft voorrang op de Google-naam of het e-mailadres.
  let ingesteldeNaam = '';
  for (const t of S.teams){ const n = t.ledenInfo?.[S.user.uid]?.naam; if (n){ ingesteldeNaam = n; break; } }
  if (!ingesteldeNaam) for (const c of S.clubs){ const n = c.ledenInfo?.[S.user.uid]?.naam; if (n){ ingesteldeNaam = n; break; } }
  const naam = (ingesteldeNaam || S.user.displayName || S.user.email || '').trim();
  const voornaam = naam ? naam.split(/[ @.]/)[0] : '';
  const voornaamMooi = voornaam ? voornaam.charAt(0).toUpperCase() + voornaam.slice(1) : '';
  let vandaag = '';
  try { vandaag = new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'}); } catch(e){}
  vandaag = vandaag.charAt(0).toUpperCase() + vandaag.slice(1);

  // Overzichtsblokjes tonen we alleen aan gewone coaches met minstens één team
  const toonOverzicht = S.teams.length > 0;

  v.innerHTML = `
    <div class="welkom-kop">
      <div class="welkom-tekst">
        <div class="welkom-datum">${esc(vandaag)}</div>
        <h1 class="welkom-groet">Hoi ${esc(voornaamMooi || 'coach')} 👋</h1>
        <div id="welkomExtra">${welkomStripHtml()}</div>
      </div>
      <button class="uitlog-knop" id="uitloggen" title="Uitloggen"><span>⏻</span></button>
    </div>

    <div id="pwaBanner"></div>

    ${toonOverzicht ? `
    <div class="overzicht-blokjes">
      <button class="ov-blok ${aantalOngelezen ? 'ov-actief' : ''}" id="ovTrainingen">
        <div class="ov-getal">${aantalOngelezen || '📄'}</div>
        <div class="ov-label">${aantalOngelezen ? `nieuwe training${aantalOngelezen>1?'en':''}` : 'trainingen'}</div>
      </button>
      <button class="ov-blok ov-wedstrijden" id="ovWedstrijden">
        <div class="ov-getal">📋</div>
        <div class="ov-label">wedstrijden</div>
      </button>
    </div>` : ''}

    <div id="nogTeEvalueren">${nogTeEvaluerenHtml()}</div>

    ${S.clubs.length ? `<div class="sectie-kop" style="margin-top:4px">Clubs die je beheert</div>
      ${S.clubs.map(c => `
        <button class="lijst-item" data-open-club="${c.id}">
          <div class="club-shirt">🏛</div>
          <div class="li-tekst"><div class="titel">${esc(c.naam)} <span class="club-badge">admin</span></div>
          <div class="meta">${Object.keys(c.teams||{}).length} teams</div></div>
          <span class="pijl">›</span>
        </button>`).join('')}` : ''}

    ${S.teams.length ? `<div class="sectie-kop">Mijn teams</div>
      ${S.teams.map(t => `
        <button class="lijst-item" data-open-team="${t.id}">
          <div class="team-shirt">${esc(t.format)}<small>v${esc(t.format)}</small></div>
          <div class="li-tekst"><div class="titel">${esc(t.naam)}${t.club ? ' <span class="club-badge licht">'+esc(t.clubNaam||'club')+'</span>' : ''}</div>
          <div class="meta">${Object.keys(t.leden||{}).length} coach(es) · code ${esc(t.code)}</div></div>
          <span class="pijl">›</span>
        </button>`).join('')}`
      : !S.clubs.length ? `<div class="kaart leeg">Nog geen teams.<br>${isBeheerder()
          ? '<b>Maak een team aan</b>, sluit je aan met een teamcode, of <b>start een club</b> om meerdere teams te beheren.'
          : 'Vraag je hoofdtrainer om een uitnodigingslink, of sluit je aan met een teamcode die je hebt gekregen.'}</div>` : ''}

    ${isBeheerder() ? `
    <div class="rij" style="margin-top:14px">
      <button class="knop vol" id="nieuwTeam">+ Nieuw team</button>
      <button class="knop licht vol" id="joinTeam">Code invoeren</button>
    </div>
    <button class="knop club-knop vol" id="nieuwClub" style="margin-top:8px">🏛 Nieuwe club aanmaken</button>`
    : `
    <button class="knop licht vol" id="joinTeam" style="margin-top:14px">Aansluiten met teamcode</button>`}`;

  v.querySelector('#uitloggen').onclick = () => doSignOut();
  v.querySelectorAll('[data-open-team]').forEach(b => b.onclick = () => openTeam(b.dataset.openTeam));
  v.querySelectorAll('[data-open-club]').forEach(b => b.onclick = () => openClub(b.dataset.openClub));
  const nt = v.querySelector('#nieuwTeam'); if (nt) nt.onclick = () => modalNieuwTeam();
  v.querySelector('#joinTeam').onclick = modalJoinTeam;
  const nc = v.querySelector('#nieuwClub'); if (nc) nc.onclick = modalNieuwClub;

  // Overzichtsblokjes
  const ovT = v.querySelector('#ovTrainingen');
  if (ovT) ovT.onclick = () => {
    // open het eerste team met een ongelezen training; anders gewoon het eerste team op het training-tabblad
    let doel = S.teams[0];
    for (const t of S.teams){
      if (S.trainingen.some(tr => (tr.teams||[]).includes(t.id) && !S.trainingenGelezen[tr.id])){ doel = t; break; }
    }
    if (doel) openTeam(doel.id, 'trainingen');
  };
  const ovW = v.querySelector('#ovWedstrijden');
  if (ovW) ovW.onclick = () => {
    if (S.teams.length) openTeam(S.teams[0].id, 'wedstrijden');
  };

  const nogTeEvaluerenEl = v.querySelector('#nogTeEvalueren');
  if (nogTeEvaluerenEl) koppelNogTeEvalueren(nogTeEvaluerenEl);

  tekenPwaBanner();
  welkomStripVullen();
  nogTeEvaluerenVullen();
}

export function modalNieuwTeam(clubId = null){
  const clubT = clubId ? S.clubs.find(c => c.id === clubId) : null;
  const subOpties = Array.from({length:12}, (_,i) => `<option value="${i+1}">${i+1}</option>`).join('');
  openModal(`
    <h2>${clubT ? 'Nieuw team voor '+esc(clubT.naam) : 'Nieuw team'}</h2>
    <div class="veldgroep"><label>Jongens of meiden</label>
      <div class="segment" id="mTeamGeslacht">
        <button data-g="j" class="actief">Jongens (JO)</button>
        <button data-g="m">Meiden (MO)</button>
      </div></div>
    <div class="rij">
      <div class="veldgroep" style="flex:2"><label>Categorie</label>
        <select class="invoer" id="mTeamCat"></select></div>
      <div class="veldgroep" style="flex:1"><label>Team</label>
        <select class="invoer" id="mTeamSub">${subOpties}</select></div>
    </div>
    <div class="veldgroep"><label>Teamnaam</label>
      <input class="invoer" id="mTeamNaam" autocomplete="off"></div>
    <div class="kaart" style="margin-bottom:14px"><p style="font-size:13px;color:var(--ink-2)" id="mTeamKnvb"></p></div>
    <button class="knop vol" id="mTeamOk">Team aanmaken</button>`);
  let geslacht = 'j';
  const vulCategorieen = () => {
    const lijst = geslacht === 'j' ? CATEGORIEEN : CATEGORIEEN_MEIDEN;
    $('#mTeamCat').innerHTML = Object.keys(lijst).map(c => `<option value="${c}">${c}</option>`).join('');
  };
  const werkBij = () => {
    const cat = $('#mTeamCat').value;
    const c = catInfo(cat);
    const sub = $('#mTeamSub').value;
    $('#mTeamNaam').value =
      cat === 'Senioren' ? (sub === '1' ? 'Eerste elftal' : 'Senioren '+sub) :
      cat === 'Vrouwen'  ? (sub === '1' ? 'Vrouwen 1' : 'Vrouwen '+sub) :
      cat + '-' + sub;
    $('#mTeamKnvb').innerHTML = `<b>KNVB ${esc(cat)}:</b> ${esc(c.knvb)}<br>De app stelt automatisch ${c.periodes === 2 ? '2 helften' : '4 kwarten'} van ${String(c.duur).replace('.',',')} minuten in. Per wedstrijd aan te passen.`;
  };
  $$('#mTeamGeslacht button').forEach(b => b.onclick = () => {
    $$('#mTeamGeslacht button').forEach(x=>x.classList.remove('actief')); b.classList.add('actief');
    geslacht = b.dataset.g; vulCategorieen(); werkBij();
  });
  $('#mTeamCat').onchange = werkBij;
  $('#mTeamSub').onchange = werkBij;
  vulCategorieen(); werkBij();
  $('#mTeamOk').onclick = async () => {
    const naam = $('#mTeamNaam').value.trim();
    if (!naam) return meld('Geef het team een naam');
    const cat = $('#mTeamCat').value;
    const afk = clubT ? clubAfkorting(clubT.naam) : '';
    const bestaande = [...S.teams.map(t => t.code), ...(S.clubTeams||[]).map(t => t.code)].filter(Boolean);
    const data = {
      naam, categorie: cat, geslacht, format: catInfo(cat).format,
      code: teamCode(naam, afk, bestaande),
      leden: {[S.user.uid]: true},
      ledenInfo: {[S.user.uid]: {naam: S.user.displayName || S.user.email}},
      gemaakt: serverTimestamp(),
    };
    if (clubT){ data.club = clubT.id; data.clubNaam = clubT.naam; }
    const ref = await addDoc(collection(db,'teams'), data);
    if (clubT) await updateDoc(doc(db,'clubs',clubT.id), {['teams.'+ref.id]: true});
    sluitModal();
    if (clubT) openClub(clubT.id);
    else openTeam(ref.id);
  };
}

function modalJoinTeam(){
  openModal(`
    <h2>Aansluiten bij team</h2>
    <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px">Vraag de teamcode aan een coach van het team (te vinden onder het tabblad Team).</p>
    <div class="veldgroep"><input class="invoer" id="mCode" placeholder="ASVJO11-1" maxlength="20"
      style="text-transform:uppercase;text-align:center;font-family:'Barlow Condensed';font-size:22px;letter-spacing:2px"></div>
    <button class="knop vol" id="mCodeOk">Aansluiten</button>`);
  $('#mCodeOk').onclick = async () => {
    const code = $('#mCode').value.trim().toUpperCase();
    if (code.length < 4) return meld('Vul een geldige teamcode in');
    const t = await joinMetCode(code);
    if (t){ sluitModal(); meld('Aangesloten bij ' + t.data().naam); openTeam(t.id); }
  };
}

/* ==================== TEAM OPENEN ==================== */
export function openTeam(teamId, beginTab = 'trainingen', opties = {}){
  S.teamId = teamId; S.teamTab = beginTab;
  S._pendingNieuweWedstrijd = !!opties.nieuweWedstrijd;
  // presentie altijd ingeklapt openen bij elke teamopening (alle maanden dicht)
  S._presentieOpen = new Set();
  S._presentieToonAlles = new Set();
  stopUnsubs('team','spelers','wedstrijden','presentie','planning','beoordelingen','teamevaluaties');
  const luisterfout = (naam) => (err) => {
    console.error(`[Cluppie] Listener "${naam}" kon niet lezen (teamId=${teamId}):`, err.code, err.message);
    if (err.code === 'permission-denied') meld(`Geen toegang tot "${naam}" — controleer de Firestore-rules`);
  };
  S.unsub.team = onSnapshot(doc(db,'teams',teamId), snap => {
    if (!snap.exists()){ verlaatTeamView(); return; }
    S.team = {id:snap.id, ...snap.data()};
    if (S.team.club && !S.unsub.uitleningen) startUitleningenListener(teamId);
    if (!S.wedstrijdId) renderTeam();
  }, luisterfout('team'));
  S.unsub.spelers = onSnapshot(collection(db,'teams',teamId,'spelers'), snap => {
    S.spelers = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (a.nummer ?? 999) - (b.nummer ?? 999) || a.naam.localeCompare(b.naam));
    if (!S.wedstrijdId) renderTeam(); else renderWedstrijd();
  }, luisterfout('spelers'));
  S.unsub.wedstrijden = onSnapshot(collection(db,'teams',teamId,'wedstrijden'), snap => {
    S.wedstrijden = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
    if (!S.wedstrijdId) renderTeam();
    // gevraagd om meteen een nieuwe wedstrijd te starten? Doe dat zodra alles geladen is.
    if (S._pendingNieuweWedstrijd){
      S._pendingNieuweWedstrijd = false;
      modalNieuweWedstrijd();
    }
    // vanaf de "nog te evalueren"-tegel op het startscherm: direct naar de
    // juiste wedstrijd + evaluatiemodal zodra de wedstrijddata geladen is.
    if (S._pendingOpenWedstrijd){
      const wid = S._pendingOpenWedstrijd; S._pendingOpenWedstrijd = null;
      if (S.wedstrijden.some(w => w.id === wid)){
        openWedstrijd(wid);
        modalTeamEvaluatie(wid);
      }
    }
  }, luisterfout('wedstrijden'));
  S.unsub.presentie = onSnapshot(collection(db,'teams',teamId,'presentie'), snap => {
    S.presentie = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
    if (!S.wedstrijdId && S.teamTab === 'trainingen') renderTeam();
  }, luisterfout('presentie'));
  S.unsub.planning = onSnapshot(collection(db,'teams',teamId,'planning'), snap => {
    S.planning = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if (!S.wedstrijdId && S.teamTab === 'planning') renderTeam();
  }, luisterfout('planning'));
  // Eigen listener voor beoordelingen — los van de wedstrijd-listener, zodat
  // updates van een andere coach niet wegvallen (zie listener-architectuur).
  S.unsub.beoordelingen = onSnapshot(collection(db,'teams',teamId,'beoordelingen'), snap => {
    S.beoordelingen = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||'') || (b.gemaaktMs||0) - (a.gemaaktMs||0));
    if (!S.wedstrijdId && (S.teamTab === 'spelers' || S._beoordeelProfiel)) renderTeam();
  }, luisterfout('beoordelingen'));
  // Teamevaluaties (na de wedstrijd) — eigen listener, zodat het dashboard in
  // de Stats-tab en de "team evalueren"-knop op het wedstrijdscherm beide
  // realtime dezelfde data zien, ook als een collega-coach 'm net invulde.
  S.unsub.teamevaluaties = onSnapshot(collection(db,'teams',teamId,'teamevaluaties'), snap => {
    S.teamEvaluaties = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (a.datum||'').localeCompare(b.datum||''));
    if (!S.wedstrijdId && S.teamTab === 'stats') renderTeam();
  }, luisterfout('teamevaluaties'));
  toon('team');
}

function startUitleningenListener(teamId){
  const clubId = S.team?.club;
  if (!clubId){ return; }              // los team zonder club: geen uitleningen
  if (S.unsub.uitleningen){ S.unsub.uitleningen(); delete S.unsub.uitleningen; }
  S.unsub.uitleningen = onSnapshot(collection(db,'clubs',clubId,'uitleningen'), snap => {
    const alle = snap.docs.map(d => ({id:d.id, ...d.data()}));
    S.uitleningenUit = alle.filter(u => u.vanTeam === teamId);
    S.uitleningenIn  = alle.filter(u => u.naarTeam === teamId);
    if (!S.wedstrijdId && (S.teamTab === 'spelers' || S._beoordeelProfiel)) renderTeam();
  }, (err) => console.error(`[Cluppie] Listener "uitleningen" kon niet lezen (clubId=${clubId}):`, err.code, err.message));
}
export function verlaatTeamView(){
  stopUnsubs('team','spelers','wedstrijden','presentie','planning','beoordelingen','uitleningen','teamevaluaties');
  S.teamId = null; S.team = null; S.spelers = []; S.wedstrijden = []; S.planning = [];
  S.uitleningenUit = []; S.uitleningenIn = []; S.teamEvaluaties = [];
  renderTeams(); toon('teams');
}

export function renderTeam(){
  if (!S.team) return;
  const v = $('#view-team');
  const tab = S.teamTab;
  let inhoud = '';
  if (tab === 'wedstrijden') inhoud = htmlWedstrijden();
  if (tab === 'spelers')     inhoud = S._leenProfiel ? htmlLeenProfiel() : (S._beoordeelProfiel ? htmlProfiel() : htmlSpelers());
  if (tab === 'planning')    inhoud = htmlPlanning();
  if (tab === 'stats')       inhoud = htmlStatsTab();
  if (tab === 'trainingen')  inhoud = htmlTeamTrainingen();
  if (tab === 'videos')      inhoud = htmlTeamVideos();
  if (tab === 'instellingen')inhoud = htmlInstellingen();
  if (tab === 'help')        inhoud = htmlHandleiding();

  const teamTrainingen = S.trainingen.filter(t => (t.teams||[]).includes(S.teamId));
  const ongelezen = teamTrainingen.filter(t => !S.trainingenGelezen[t.id]).length;

  const profielOpen = (tab === 'spelers' && (S._beoordeelProfiel || S._leenProfiel));
  v.innerHTML = `
    ${profielOpen ? '' : `<div class="kop"><button class="terug" id="naarTeams">‹</button>
      <h1>${esc(S.team.naam)}<span class="sub">${S.team.categorie ? esc(S.team.categorie)+' · ' : ''}${esc(S.team.format)} tegen ${esc(S.team.format)}</span></h1>
      <button class="terug" id="teamInstel" title="Teaminstellingen">⚙️</button></div>`}
    ${inhoud}
    <nav class="onderbalk">
      ${[['wedstrijden','Wedstr.'],['spelers','Spelers'],['planning','Planning'],['trainingen','Training'],['videos','Video'],['stats','Stats'],['help','Help']]
        .map(([id,naam]) => `<button data-tab="${id}" class="${tab===id?'actief':''}"><span class="ico">${NAV_ICON[id]}</span><span class="tablabel">${naam}${id==='trainingen' && ongelezen ? '<span class="puntje"></span>' : ''}</span></button>`).join('')}
    </nav>`;

  const naarTeamsBtn = v.querySelector('#naarTeams');
  if (naarTeamsBtn) naarTeamsBtn.onclick = () => history.back();
  const teamInstelBtn = v.querySelector('#teamInstel');
  if (teamInstelBtn) teamInstelBtn.onclick = () => { S.teamTab = 'instellingen'; renderTeam(); };
  v.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    S._beoordeelProfiel = null; S._leenProfiel = null;
    // presentie altijd ingeklapt tonen zodra je (terug) op de Trainingen-tab klikt
    if (b.dataset.tab === 'trainingen'){ S._presentieOpen = new Set(); S._presentieToonAlles = new Set(); S._kompasIdx = null; }
    S.teamTab = b.dataset.tab; renderTeam();
  });
  koppelTeamTab(v, tab);
}

/* ---------- Tab: wedstrijden ---------- */
function htmlWedstrijden(){
  return `
    <button class="knop vol" id="nieuweWedstrijd" style="margin-bottom:14px">+ Nieuwe wedstrijd</button>
    ${S.wedstrijden.length ? S.wedstrijden.map(w => {
      const voor = (w.goals||[]).filter(g => g.type==='voor').length;
      const tegen = (w.goals||[]).filter(g => g.type==='tegen').length;
      const uitslag = (w.goals||[]).length || analyseWedstrijd(w).kwarten
        ? (w.thuis ? `${voor}–${tegen}` : `${tegen}–${voor}`) : '';
      const titel = w.type === 'toernooi'
        ? '🏆 ' + esc(w.tegenstander)
        : (w.thuis ? esc(S.team.naam)+' – '+esc(w.tegenstander) : esc(w.tegenstander)+' – '+esc(S.team.naam));
      const meta = w.type === 'toernooi'
        ? `${datumNL(w.datum)} · ${w.toernooi.wedstrijden} wedstrijden · ${esc(w.format)}v${esc(w.format)}`
        : `${datumNL(w.datum)} · ${esc(w.format)}v${esc(w.format)} · ${esc(w.formatie)}`;
      return `
      <button class="lijst-item" data-open-w="${w.id}">
        <div class="li-tekst"><div class="titel">${titel}</div>
        <div class="meta">${meta}</div></div>
        ${uitslag ? `<span class="badge" style="font-family:'Barlow Condensed';font-size:15px;font-weight:700">${uitslag}</span>` : ''}
        <span class="pijl">›</span></button>`;
    }).join('')
    : `<div class="kaart leeg">Nog geen wedstrijden.<br>Maak je eerste wedstrijd aan en zet de opstelling per kwart klaar.</div>`}`;
}

/* ---------- Tab: spelers ---------- */
function htmlSpelers(){
  // laatste snelle beoordeling per speler → kleurstip
  const laatsteSnel = {};
  for (const b of S.beoordelingen){
    if (b.soort !== 'snel') continue;
    if (!laatsteSnel[b.spelerId]) laatsteSnel[b.spelerId] = b;   // lijst is al op datum gesorteerd
  }
  const openLeerpunten = pid => ((speler(pid)?.leerpunten)||[]).filter(l => !l.klaar).length;

  return `
    <div class="segment" id="spelersModus" style="margin-bottom:14px">
      <button data-modus="selectie" class="actief">Selectie</button>
      <button data-modus="snel">⚡ Snel beoordelen</button>
    </div>

    <div class="avg-balk">
      <span class="slot">🔒</span>
      <span>Beoordelingen en leerpunten zijn alleen zichtbaar voor coaches van dit team. Spelers en ouders zien deze gegevens niet.</span>
    </div>

    <button class="knop vol licht" id="nieuweSpeler" style="margin-bottom:14px">+ Speler toevoegen</button>
    ${S.spelers.length ? S.spelers.map(p => {
      const b = laatsteSnel[p.id];
      const stip = b ? `<span class="beoordeel-stip" style="background:${niveauKleur(b.niveau)}" title="Laatste: ${esc(niveau(b.niveau)?.label||'')}"></span>`
                     : `<span class="beoordeel-stip leeg" title="Nog niet beoordeeld"></span>`;
      const lp = openLeerpunten(p.id);
      return `
      <button class="speler-rij" data-open-profiel="${p.id}">
        <div class="mini-shirt">${esc(p.nummer ?? '·')}</div>
        <div class="n">${esc(p.naam)}</div>
        ${lp ? `<span class="chip-info">${lp} leerpunt${lp===1?'':'en'}</span>` : ''}
        ${stip}
        <span class="pijl">›</span>
      </button>`;
    }).join('')
    : `<div class="kaart leeg">Nog geen spelers.<br>Voeg je selectie toe — naam en rugnummer is genoeg.</div>`}

    ${(() => {
      const nu = vandaagIso();
      const actief = (S.uitleningenIn||[]).filter(u => u.van <= nu && nu <= u.tot);
      if (!actief.length) return '';
      return `
        <div class="sectie-kop" style="margin:18px 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-2)">⇄ Geleend (tijdelijk)</div>
        ${actief.map(u => {
          const s = u.snapshot || {};
          const nm = s.voorletter ? `${s.naam} ${s.voorletter}.` : (s.naam||'Speler');
          return `
          <button class="speler-rij" data-open-leen="${u.id}">
            <div class="mini-shirt" style="background:var(--ink-2)">${esc(s.nummer ?? '·')}</div>
            <div class="n">${esc(nm)}<div style="font-size:11px;color:var(--ink-2);font-weight:400">van ${esc(u.vanTeamNaam||'ander team')} · t/m ${datumNL(u.tot)}</div></div>
            <span class="pijl">›</span>
          </button>`;
        }).join('')}`;
    })()}

    <p style="font-size:12px;color:var(--ink-2);margin-top:12px;line-height:1.5">
      Het gekleurde stipje toont de laatste snelle beoordeling. Tik op een speler voor het volledige profiel met statistieken, leerlijn en historie.</p>`;
}

/* ==================== BEOORDELINGEN ====================
   Datamodel (Firestore: teams/{teamId}/beoordelingen/{id}):
     soort:    'snel' | 'volledig'
     spelerId, datum:'YYYY-MM-DD'
     bron:     {type:'wedstrijd'|'training'|'los', id, label}
     niveau:   1..5            (soort 'snel')
     tags:     ['inzet',...]   (soort 'snel')
     scores:   {T,I,P,S}       (soort 'volledig')
     notities: {algemeen} of {T,I,P,S}
     door:     {uid, naam}, gemaaktMs
   Leerpunten leven als array op het spelerdoc (lopen dóór over beoordelingen):
     {id, domein, tekst, sinds, klaar, klaarOp} */

function spelerStats(pid){
  let wedstrijden = 0, tijd = 0, keeper = 0, goals = 0;
  for (const w of S.wedstrijden){
    for (const g of (w.goals||[])) if (g.type === 'voor' && g.pid === pid) goals++;
    const a = analyseWedstrijd(w);
    if (!a.kwarten) continue;
    if (a.tijd[pid]){ tijd += a.tijd[pid]; wedstrijden++; }
    if (a.keeper[pid]) keeper += a.keeper[pid];
  }
  const totTr = (S.presentie||[]).length;
  let aanwezig = 0, blessure = 0, metReden = 0, zonderReden = 0;
  for (const sessie of (S.presentie||[])){
    const afw = (sessie.afwezig||[]).includes(pid);
    if (!afw){ aanwezig++; continue; }
    const reden = (sessie.afwezigRedenen||{})[pid];
    if (reden?.type === 'blessure') blessure++;
    else if (reden?.type === 'reden') metReden++;
    else zonderReden++;
  }
  const opkomst = totTr ? Math.round((aanwezig/totTr)*100) : null;
  return {wedstrijden, tijd, keeper, goals, opkomst, totTr, blessure, metReden, zonderReden};
}

function laatsteVolledig(pid){
  return S.beoordelingen.find(b => b.spelerId === pid && b.soort === 'volledig') || null;
}

function tipsBalk(score){
  let segs = '';
  for (let i = 1; i <= 5; i++)
    segs += `<div class="tips-seg" style="background:${i <= score ? niveauKleur(score) : '#EFEFED'}"></div>`;
  return `<div class="tips-track">${segs}</div>`;
}

/* ---------- Spelerprofiel ---------- */
/* Read-only profiel van een geleende speler (snapshot uit clubs/{clubId}/uitleningen). */
function htmlLeenProfiel(){
  const u = (S.uitleningenIn||[]).find(x => x.id === S._leenProfiel);
  if (!u) { S._leenProfiel = null; return htmlSpelers(); }
  const s = u.snapshot || {};
  const nm = s.voorletter ? `${s.naam} ${s.voorletter}.` : (s.naam || 'Speler');
  const st = s.stats || {};
  const sc = s.profielScores || null;
  const lijn = s.nummer != null && s.nummer !== '' ? '#'+esc(s.nummer) : '';
  return `
    <button class="profiel-terug" id="leenTerug">‹ Terug naar spelers</button>
    <div class="profiel-top">
      <div class="pt-shirt" style="background:var(--ink-2)">${esc(s.nummer ?? '·')}</div>
      <div><h2>${esc(nm)}</h2><div class="meta">${lijn?lijn+' · ':''}geleend van ${esc(u.vanTeamNaam||'ander team')}</div></div>
    </div>

    <div class="avg-balk"><span class="slot">🔒</span>
      <span>Tijdelijk geleende speler · alleen-lezen. Zichtbaar t/m ${datumNL(u.tot)}, daarna verdwijnt hij automatisch.</span></div>

    <div class="kaart" style="margin-bottom:12px">
      <div class="veldlabel" style="margin-top:0">Profiel</div>
      <div class="kv-rij" style="display:flex;justify-content:space-between;padding:8px 0">
        <span style="color:var(--ink-2)">Voorkeurspositie</span>
        <span style="font-weight:600">${s.positie ? esc(s.positie) : '—'}</span></div>
    </div>

    <div class="stat-grid">
      <div class="stat-box"><div class="v">${st.wedstrijden ?? 0}</div><div class="l">Wedstr.</div></div>
      <div class="stat-box"><div class="v">${st.tijd ? uurMin(st.tijd) : '—'}</div><div class="l">Speeltijd</div></div>
      <div class="stat-box"><div class="v">${st.goals ?? 0}</div><div class="l">Goals</div></div>
      <div class="stat-box"><div class="v">${st.opkomst != null ? st.opkomst+'%' : '—'}</div><div class="l">Training</div></div>
    </div>

    <div class="kaart">
      <div class="veldlabel" style="margin-top:0">Ontwikkelprofiel${s.profielDatum ? ` · ${datumNL(s.profielDatum)}` : ''}</div>
      ${sc ? SKILLS.map(d => `
        <div class="tips-rij">
          <div class="tips-letter">${d.id}</div>
          <div class="tips-naam">${d.naam}</div>
          ${tipsBalk(sc[d.id] || 0)}
          <div class="tips-score">${sc[d.id] || '—'}</div>
        </div>`).join('')
      : `<p style="font-size:13px;color:var(--ink-2);padding:6px 0">De uitlenende coach heeft (nog) geen volledige beoordeling gedeeld.</p>`}
    </div>

    <p style="font-size:12px;color:var(--ink-2);margin-top:12px;line-height:1.5">
      Deze gegevens zijn een momentopname van het moment van uitlenen, gedeeld door ${esc(u.vanTeamNaam||'het andere team')}.</p>`;
}

function htmlProfiel(){
  const p = speler(S._beoordeelProfiel);
  if (!p) { S._beoordeelProfiel = null; return htmlSpelers(); }
  const tab = S._profielTab || 'overzicht';
  const st = spelerStats(p.id);
  const vol = laatsteVolledig(p.id);
  const eigen = S.beoordelingen.filter(b => b.spelerId === p.id);

  const lijn = p.nummer != null && p.nummer !== '' ? '#'+esc(p.nummer) : '';
  return `
    <button class="profiel-terug" id="profielTerug">‹ Terug naar spelers</button>
    <div class="profiel-top">
      <div class="pt-shirt">${esc(p.nummer ?? '·')}</div>
      <div><h2>${esc(p.naam)}</h2><div class="meta">${lijn?lijn+' · ':''}${esc(S.team.naam)}</div></div>
    </div>
    ${(() => {
      const u = actieveUitleningVoor(p.id);
      if (!u) return '';
      return `<div class="leen-strook">
        <span class="ic">⇄</span>
        <span class="tx">Uitgeleend aan <b>${esc(u.naarTeamNaam)}</b> · t/m ${datumNL(u.tot)}</span>
        <button data-uitleen-intrek="${u.id}">Intrekken</button>
      </div>`;
    })()}

    <div class="avg-balk"><span class="slot">🔒</span>
      <span>Coach-only. Deel niets uit dit profiel buiten het technisch kader.</span></div>

    <div class="segment" id="profielTabs" style="margin-bottom:14px">
      <button data-ptab="overzicht" class="${tab==='overzicht'?'actief':''}">Overzicht</button>
      <button data-ptab="leerlijn" class="${tab==='leerlijn'?'actief':''}">Leerlijn</button>
      <button data-ptab="historie" class="${tab==='historie'?'actief':''}">Historie</button>
    </div>

    ${tab === 'overzicht' ? `
      <div class="stat-grid">
        <div class="stat-box"><div class="v">${st.wedstrijden}</div><div class="l">Wedstr.</div></div>
        <div class="stat-box"><div class="v">${st.tijd ? uurMin(st.tijd) : '—'}</div><div class="l">Speeltijd</div></div>
        <div class="stat-box"><div class="v">${st.goals}</div><div class="l">Goals</div></div>
        <div class="stat-box"><div class="v">${st.opkomst != null ? st.opkomst+'%' : '—'}</div><div class="l">Training</div></div>
      </div>
      ${(st.blessure || st.metReden || st.zonderReden) ? `
      <div class="presentie-uitsplitsing" style="margin:-6px 0 14px">
        ${st.blessure ? `<span>🩹 ${st.blessure}× geblesseerd</span>` : ''}
        ${st.metReden ? `<span>📋 ${st.metReden}× met reden</span>` : ''}
        ${st.zonderReden ? `<span>❔ ${st.zonderReden}× zonder reden</span>` : ''}
      </div>` : ''}

      <div class="kaart">
        <div class="veldlabel" style="margin-top:0">Ontwikkelprofiel${vol ? ` · ${datumNL(vol.datum)}` : ''}</div>
        ${vol ? SKILLS.map(d => `
          <div class="tips-rij">
            <div class="tips-letter">${d.id}</div>
            <div class="tips-naam">${d.naam}</div>
            ${tipsBalk(vol.scores?.[d.id] || 0)}
            <div class="tips-score">${vol.scores?.[d.id] || '—'}</div>
          </div>`).join('')
        : `<p style="font-size:13px;color:var(--ink-2);padding:6px 0">Nog geen volledige beoordeling. Maak er één om het ontwikkelprofiel te zien.</p>`}
      </div>

      <div class="fab-rij">
        <button class="knop fluo klein" style="flex:1" data-snel-speler="${p.id}">⚡ Snel beoordelen</button>
        <button class="knop klein" style="flex:1" data-volledig-speler="${p.id}">📋 Volledige beoordeling</button>
      </div>

      <div class="rij" style="margin-top:4px">
        <button class="knop licht klein" data-bewerk-speler="${p.id}">✏️ Speler bewerken</button>
        <button class="knop gevaar klein" data-weg-speler="${p.id}">🗑 Verwijderen</button>
      </div>
      ${S.team?.club ? `<button class="knop klein" style="margin-top:4px;width:100%" data-uitleen-speler="${p.id}">⇄ Uitlenen aan ander team</button>` : ''}
    ` : ''}

    ${tab === 'leerlijn' ? htmlLeerlijn(p) : ''}

    ${tab === 'historie' ? `
      <div class="kaart">
        <div class="veldlabel" style="margin-top:0">Tijdlijn</div>
        ${eigen.length ? eigen.map(b => htmlTijdlijnItem(b)).join('')
          : `<p style="font-size:13px;color:var(--ink-2);padding:6px 0">Nog geen beoordelingen vastgelegd.</p>`}
      </div>
      <div class="kaart">
        <div class="veldlabel" style="margin-top:0">Presentie training</div>
        ${S.presentie.length ? S.presentie.map(ses => {
          const afw = (ses.afwezig||[]).includes(p.id);
          const reden = (ses.afwezigRedenen||{})[p.id];
          const statusTxt = !afw ? 'Aanwezig'
            : reden?.type === 'blessure' ? '🩹 Geblesseerd'
            : reden?.type === 'reden' ? `📋 Met reden${reden.notitie ? ' · '+esc(reden.notitie) : ''}`
            : '❔ Zonder reden';
          return `<div class="presentie-hist-rij"><span>${datumNL(ses.datum)}</span><span class="phr-status ${afw?'afw':'aanw'}">${statusTxt}</span></div>`;
        }).join('') : `<p style="font-size:13px;color:var(--ink-2);padding:6px 0">Nog geen presentie geregistreerd.</p>`}
      </div>` : ''}`;
}

function htmlLeerlijn(p){
  const lp = (p.leerpunten || []).slice().sort((a,b) => (a.klaar?1:0)-(b.klaar?1:0) || (b.sinds||'').localeCompare(a.sinds||''));
  return `
    <div class="kaart">
      <div class="veldlabel" style="margin-top:0">Leerpunten</div>
      ${lp.length ? lp.map(l => {
        const d = skillDomein(l.domein);
        return `
        <div class="leerpunt ${l.klaar?'klaar':''}">
          <button class="lp-check ${l.klaar?'klaar':''}" data-lp-toggle="${l.id}">${l.klaar?'✓':''}</button>
          <div class="lp-tekst">
            <div class="lp-domein">${d ? esc(d.naam) : 'Algemeen'}</div>
            <div class="t">${esc(l.tekst)}</div>
            <div class="d">${l.klaar ? 'Afgerond op '+datumNL(l.klaarOp||l.sinds)+' 🎉' : 'Sinds '+datumNL(l.sinds)}</div>
          </div>
          <button class="lp-weg" data-lp-weg="${l.id}" title="Verwijderen">🗑</button>
        </div>`;
      }).join('')
      : `<p style="font-size:13px;color:var(--ink-2);padding:6px 0 10px">Nog geen leerpunten. Voeg een concreet, observeerbaar ontwikkeldoel toe.</p>`}
      <button class="knop licht klein" style="width:100%;margin-top:6px" data-lp-nieuw="${p.id}">+ Leerpunt toevoegen</button>
    </div>
    <p style="font-size:12px;color:var(--ink-2);line-height:1.5">Leerpunten lopen door over meerdere wedstrijden en beoordelingen. Vink ze af zodra ze beheerst zijn.</p>`;
}

function htmlTijdlijnItem(b){
  if (b.soort === 'snel'){
    const nv = niveau(b.niveau);
    const tags = (b.tags||[]).map(t => { const s = snelTag(t); return s ? s.emoji+' '+s.label : ''; }).filter(Boolean).join(' · ');
    const not = b.notities?.algemeen ? ` — "${esc(b.notities.algemeen)}"` : '';
    return `
      <div class="tijdlijn-item" data-open-beoordeling="${b.id}">
        <div class="tl-stip" style="background:${niveauKleur(b.niveau)}"></div>
        <div class="tl-lijn">
          <div class="dat">${datumNL(b.datum)} · Snelle beoordeling</div>
          <div class="wat">${esc(b.bron?.label || 'Los')}${nv ? ' · '+nv.label : ''}</div>
          ${tags || not ? `<div class="det">${tags}${not}</div>` : ''}
        </div>
      </div>`;
  }
  const scores = SKILLS.map(d => d.id+(b.scores?.[d.id]||'–')).join(' · ');
  return `
    <div class="tijdlijn-item" data-open-beoordeling="${b.id}">
      <div class="tl-stip" style="background:var(--n5)"></div>
      <div class="tl-lijn">
        <div class="dat">${datumNL(b.datum)} · Volledige beoordeling</div>
        <div class="wat">${esc(b.bron?.label || 'Periodieke meting')}</div>
        <div class="det">${scores}</div>
      </div>
    </div>`;
}

/* ---------- Tab: seizoensplanning ---------- */
const PLAN_TYPE = {
  wedstrijd: {kort:'⚽', klas:'wedstrijd', naam:'Wedstrijd'},
  wd:     {kort:'WD',   klas:'wd',     naam:'Wedstrijddag'},
  beker:  {kort:'BEK',  klas:'beker',  naam:'Beker'},
  inhaal: {kort:'INH',  klas:'inhaal', naam:'Inhaal'},
  vrij:   {kort:'VRIJ', klas:'vrij',   naam:'Vrij'},
  eigen:  {kort:'',     klas:'eigen',  naam:'Eigen dag'},
};
const PLAN_FILTERS = [
  ['alles','Alles'], ['wedstrijd','Wedstrijden'], ['wd','Speeldagen'], ['beker','Beker'], ['vrij','Vrij'],
];
const PLAN_MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

/* combineer KNVB-kalender + Firestore-aanpassingen + eigen dagen tot één gesorteerde lijst.
   Override-docs hebben id 'knvb_<datum>' en kunnen {verborgen:true} of een nieuw label/type zetten.
   Eigen dagen zijn losse docs met bron:'eigen'. */
function planningItems(){
  const team = S.team;
  if (!team) return [];
  const knvb = knvbKalenderVoorTeam(team);
  const overrides = {};
  const eigen = [];
  for (const p of (S.planning||[])){
    if (p.bron === 'eigen') eigen.push(p);
    else if (p.id && p.id.startsWith('knvb_')) overrides[p.datum] = p;
  }
  // echte wedstrijden (geïmporteerd + zelf aangemaakt) — datums waarop er één staat
  const wedstrijdDatums = new Set((S.wedstrijden||[]).map(w => w.datum).filter(Boolean));

  const items = [];
  for (const k of knvb){
    const ov = overrides[k.d];
    if (ov && ov.verborgen) continue;
    // echte wedstrijd vervangt de generieke KNVB-wedstrijddag op dezelfde datum
    if (k.t === 'wd' && wedstrijdDatums.has(k.d) && !(ov && ov.aangepast)) continue;
    items.push({
      bron: 'knvb',
      docId: ov ? ov.id : null,
      datum: k.d,
      type: (ov && ov.type) || k.t,
      label: (ov && ov.label) || k.l,
      opmerking: ov && 'opmerking' in ov ? ov.opmerking : (k.n || ''),
      aangepast: !!ov,
    });
  }
  for (const e of eigen){
    items.push({
      bron: 'eigen', docId: e.id, datum: e.datum,
      type: e.type || 'eigen', label: e.label || 'Eigen dag',
      opmerking: e.opmerking || '', aangepast: false,
    });
  }
  for (const w of (S.wedstrijden||[])){
    if (!w.datum) continue;
    const voor = (w.goals||[]).filter(g => g.type==='voor').length;
    const tegen = (w.goals||[]).filter(g => g.type==='tegen').length;
    const heeftUitslag = (w.goals||[]).length > 0;
    const uitslag = heeftUitslag ? (w.thuis ? `${voor}–${tegen}` : `${tegen}–${voor}`) : '';
    const eigen = team.naam || 'ASV\'33';
    const tegenstander = w.tegenstander || '?';
    // thuis kan bij een nog niet geopende geïmporteerde wedstrijd ontbreken;
    // standaard tonen we eigen team links (thuis), zodat 'wie tegen wie' altijd in beeld is.
    const label = w.type === 'toernooi'
      ? '🏆 ' + (w.tegenstander || 'Toernooi')
      : (w.thuis === false ? `${tegenstander} – ${eigen}` : `${eigen} – ${tegenstander}`);
    const sub = [w.tijd || '', uitslag].filter(Boolean).join(' · ');
    items.push({
      bron: 'wedstrijd', docId: w.id, datum: w.datum,
      type: 'wedstrijd', label, opmerking: sub, aangepast: false,
      wedstrijdId: w.id,
    });
  }
  return items.sort((a,b) =>
    a.datum.localeCompare(b.datum) || (a.bron==='wedstrijd'?-1:1) - (b.bron==='wedstrijd'?-1:1));
}

function htmlPlanning(){
  const filter = S._planningFilter || 'alles';
  let items = planningItems();
  if (filter !== 'alles'){
    items = items.filter(it => it.type === filter);
  }
  // standaard: verleden maanden ingeklapt. _planningDichteMaanden = expliciet gesloten set;
  // bij eerste render vullen we 'm met alle maanden vóór de huidige.
  if (S._planningDichteMaanden === null){
    S._planningDichteMaanden = new Set();
    const nu = new Date().toISOString().slice(0,7);
    for (const it of items){
      const ym = it.datum.slice(0,7);
      if (ym < nu) S._planningDichteMaanden.add(ym);
    }
  }
  const dicht = S._planningDichteMaanden;

  const chips = PLAN_FILTERS.map(([id,lbl]) =>
    `<button class="plan-chip ${filter===id?'aan':''}" data-planfilter="${id}">${lbl}</button>`).join('');

  let body = '';
  if (!items.length){
    body = `<div class="kaart leeg">Geen speeldagen voor dit filter.</div>`;
  } else {
    // groepeer per maand (jaar-maand)
    const perMaand = {};
    for (const it of items){
      const ym = it.datum.slice(0,7);
      (perMaand[ym] ||= []).push(it);
    }
    const nu = new Date().toISOString().slice(0,10);
    body = Object.keys(perMaand).sort().map(ym => {
      const [jr,mn] = ym.split('-');
      const maandNaam = PLAN_MAANDEN[Number(mn)-1];
      const open = !dicht.has(ym);
      const rijen = perMaand[ym].map(it => {
        const ti = PLAN_TYPE[it.type] || PLAN_TYPE.eigen;
        const dt = new Date(it.datum+'T12:00');
        const dag = dt.getDate();
        const wdag = dt.toLocaleDateString('nl-NL',{weekday:'short'}).replace('.','');
        const isVerleden = it.datum < nu;
        const badge = ti.kort ? `<span class="plan-badge ${ti.klas}">${ti.kort}</span>` : `<span class="plan-bewerk">✎</span>`;
        const opm = it.opmerking ? `<div class="plan-sub">${esc(it.opmerking)}</div>`
          : (it.bron === 'eigen' ? `<div class="plan-sub eigen">Eigen dag</div>` : '');
        return `
          <button class="plan-rij ${ti.klas} ${isVerleden?'verleden':''}" data-plandag="${it.datum}" data-planbron="${it.bron}" data-plandoc="${it.docId||''}">
            <div class="plan-datum"><span class="d">${dag}</span><span class="w">${wdag}</span></div>
            <div class="plan-tekst"><div class="plan-titel">${esc(it.label)}${it.aangepast?' <span class="plan-mark">·aangepast</span>':''}</div>${opm}</div>
            ${badge}
          </button>`;
      }).join('');
      return `
        <div class="plan-maand">
          <button class="plan-maand-kop" data-planmaand="${ym}">
            <span>${maandNaam} ${jr}</span>
            <span class="plan-aantal">${perMaand[ym].length}</span>
            <span class="plan-pijl">${open?'▾':'▸'}</span>
          </button>
          ${open ? `<div class="plan-lijst">${rijen}</div>` : ''}
        </div>`;
    }).join('');
  }

  return `
    <div class="plan-kop">
      <div class="plan-seizoen">Seizoen ${esc(KNVB_SEIZOEN)}</div>
      <button class="knop vol klein" id="planEigenDag">+ Eigen dag</button>
    </div>
    <div class="plan-chips">${chips}</div>
    ${body}`;
}

/* ---------- Afgelasting (clubbreed) ----------
   De beheerder schrijft de afgelasting weg naar ALLE team-documenten van de club
   (zie modalClubAflasten in club.js). Elk team toont 'm hier zolang de datum geldig is.
   Geen naam in de banner of het WhatsApp-bericht. */
function afgelastGeldig(){
  const a = S.team && S.team.afgelast;
  if (!a || !a.datum) return null;
  const vandaag = new Date().toISOString().slice(0,10);
  return (a.datum >= vandaag) ? a : null;   // alleen vandaag of in de toekomst
}

/* 'YYYY-MM-DD' -> 'donderdag 25 juni' (met hoofdletter) */
export function afgelastDatumTekst(datum){
  const d = new Date(datum+'T12:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  return d.charAt(0).toUpperCase()+d.slice(1);
}

/* de WhatsApp-tekst die de trainer doorstuurt naar zijn eigen teamgroep — zonder naam */
function afgelastWhatsappTekst(a){
  const dag = afgelastDatumTekst(a.datum);
  let t = `⛔ *Training afgelast*\n`;
  t += `De training van ${dag} gaat *niet* door.`;
  if (a.reden && a.reden.trim()) t += `\n\n${a.reden.trim()}`;
  return t;
}

/* de rode banner bovenaan de trainingen-tab (zichtbaar voor alle teamleden) */
function afgelastBannerHtml(a){
  const dag = afgelastDatumTekst(a.datum);
  return `
    <div class="afgelast-banner">
      <div class="ab-kop"><span class="ab-ico">⛔</span><h2>Training afgelast</h2></div>
      <div class="ab-tekst">De training van <b>${esc(dag)}</b> gaat <b>niet</b> door.
        ${a.reden && a.reden.trim() ? `<div class="ab-reden">${esc(a.reden.trim())}</div>` : ''}</div>
      <button class="ab-wa-vol" id="afgelastDeel">📲 Stuur door in mijn teamgroep</button>
    </div>`;
}

/* ---------- ASV-kompas: rotende tip uit §3.1/§3.4 (zie config.js) ---------- */
function htmlKompas(){
  const idx = S._kompasIdx ?? kompasIndexVoorWeek();
  const t = KOMPAS_TIPS[idx];
  return `
    <div class="kompas">
      <div class="kompas-top">
        <span class="kompas-label">🧭 ASV-kompas · week ${isoWeek()}</span>
        <span class="kompas-bron">${esc(t.bron)}</span>
      </div>
      <div class="kompas-tekst">${esc(t.tekst)}</div>
      <div class="kompas-dots">${KOMPAS_TIPS.map((_,i) => `<span class="${i===idx?'actief':''}"></span>`).join('')}</div>
      <div class="kompas-nav">
        <button data-kompas="vorige" title="Vorige tip">‹</button>
        <button data-kompas="volgende" title="Volgende tip">›</button>
      </div>
    </div>`;
}

function htmlTeamTrainingen(){
  const pdfs = S.trainingen.filter(t => (t.teams||[]).includes(S.teamId));
  const vandaag = new Date().toISOString().slice(0,10);
  const alGeregistreerd = S.presentie.find(p => p.datum === vandaag);

  // afgelasting: toon banner als die geldt (geen aflast-knop hier; dat doet de beheerder op het clubscherm)
  const afg = afgelastGeldig();
  const afgelastSectie = afg ? afgelastBannerHtml(afg) : '';

  // welke maanden zijn opengeklapt? standaard alles dicht; openTeam reset dit
  // bij elke teamopening. Hier alleen een vangnet als de sets nog niet bestaan.
  if (!S._presentieOpen){
    S._presentieOpen = new Set();                       // 'YYYY-MM' van opengeklapte maanden
    S._presentieToonAlles = new Set();                  // maanden waar alle items getoond worden
  }
  const TOON_PER_MAAND = 4;   // standaard aantal per maand voordat "toon meer" verschijnt

  const maandNaam = (ym) => {
    const [j,m] = ym.split('-');
    const d = new Date(parseInt(j), parseInt(m)-1, 1);
    const s = d.toLocaleDateString('nl-NL', {month:'long', year:'numeric'});
    return s.charAt(0).toUpperCase()+s.slice(1);
  };
  const rijHtml = (p) => {
    const afw = (p.afwezig || []);
    const aanwezig = Math.max(0, S.spelers.length - afw.length);
    const dat = new Date(p.datum+'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
    const datMooi = dat.charAt(0).toUpperCase()+dat.slice(1);
    const afwNamen = afw.length
      ? afw.map(id => {
          const sp = S.spelers.find(s => s.id === id); if (!sp) return null;
          const reden = (p.afwezigRedenen||{})[id];
          const icoon = reden?.type === 'blessure' ? ' 🩹' : reden?.type === 'reden' ? ' 📋' : '';
          return esc(sp.naam) + icoon;
        }).filter(Boolean).join(', ')
      : '';
    return `
      <div class="presentie-rij" data-presentie="${p.id}" style="cursor:pointer">
        <div class="pr-datum"><span class="pr-dag">${datMooi}</span></div>
        <div class="pr-info">
          ${afw.length
            ? `<span class="pr-afw">${aanwezig} aanwezig · ${afw.length} afwezig</span><span class="pr-namen">${afwNamen}</span>`
            : `<span class="pr-allen">✓ Iedereen aanwezig (${aanwezig})</span>`}
        </div>
        <span class="acties"><button title="Aanpassen">✏️</button></span>
      </div>`;
  };

  // groepeer presentie per maand (S.presentie is al gesorteerd nieuw → oud)
  let presentieLijst;
  if (!S.presentie.length){
    presentieLijst = `<div class="kaart leeg" style="margin-bottom:14px">Nog geen presentie geregistreerd.</div>`;
  } else {
    const perMaand = new Map();
    for (const p of S.presentie){
      const ym = (p.datum||'').slice(0,7);
      if (!perMaand.has(ym)) perMaand.set(ym, []);
      perMaand.get(ym).push(p);
    }
    presentieLijst = [...perMaand.entries()].map(([ym, items]) => {
      const open = S._presentieOpen.has(ym);
      const toonAlles = S._presentieToonAlles.has(ym);
      const afwTotaal = items.reduce((n,p) => n + (p.afwezig||[]).length, 0);
      const zichtbaar = (open && !toonAlles) ? items.slice(0, TOON_PER_MAAND) : items;
      const meer = items.length - TOON_PER_MAAND;
      return `
        <div class="maand-groep">
          <button class="maand-kop" data-maand="${ym}">
            <span class="maand-naam">${maandNaam(ym)}</span>
            <span class="maand-tel">${items.length} training${items.length>1?'en':''}${afwTotaal?` · ${afwTotaal} afm.`:''}</span>
            <span class="maand-pijl ${open?'open':''}">▾</span>
          </button>
          ${open ? `
            <div class="maand-inhoud">
              ${zichtbaar.map(rijHtml).join('')}
              ${(!toonAlles && meer > 0) ? `<button class="toon-meer" data-toonmeer="${ym}">Toon ${meer} eerdere uit deze maand</button>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
  }

  const alGeregAanwezig = alGeregistreerd ? Math.max(0, S.spelers.length - (alGeregistreerd.afwezig||[]).length) : 0;
  const alGeregAfwezig = alGeregistreerd ? (alGeregistreerd.afwezig||[]).length : 0;

  const presentieSectie = `
    <div class="sectie-kop" style="margin-top:0">📋 Presentie training</div>
    ${alGeregistreerd
      ? `<div class="kaart" style="background:rgba(226,6,19,.07);border-left:3px solid var(--grass);font-size:13px;margin-bottom:10px">Vandaag al geregistreerd. ${alGeregAanwezig} aanwezig en ${alGeregAfwezig} afwezig.</div>`
      : `<button class="knop vol" id="presentieVandaag" style="margin-bottom:12px">✓ Wie is er vandaag?</button>`}
    ${presentieLijst}`;

  // --- PDF-sectie (ook per maand, zelfde gedrag als presentie) ---
  // huidige maand staat standaard open; gebruiker kan maanden dicht/open klappen.
  if (!S._pdfDicht){ S._pdfDicht = new Set(); S._pdfToonAlles = new Set(); }

  const pdfRijHtml = (t) => {
    const ongelezen = !S.trainingenGelezen[t.id];
    const datum = t.gemaakt?.seconds ? new Date(t.gemaakt.seconds*1000).toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) : '';
    return `
      <div class="training-rij ${ongelezen?'ongelezen':''}" data-open-training="${t.id}" data-url="${esc(t.url)}" style="cursor:pointer">
        <div class="ico">PDF</div>
        <div class="t"><div class="t-titel">${esc(t.titel || t.bestandsnaam)}</div>
          <div class="t-meta">${esc(t.week || '')}${t.week && datum?' · ':''}${esc(datum)}${t.clubNaam?' · '+esc(t.clubNaam):''}</div></div>
        <div class="acties"><button title="Openen">↗</button></div>
      </div>`;
  };

  let pdfLijst;
  if (!pdfs.length){
    pdfLijst = `<div class="kaart leeg">Nog geen trainingen gedeeld.<br>Elke zondag zet je clubadmin hier de oefenstof voor de komende week klaar.</div>`;
  } else {
    // nieuw → oud op uploaddatum; items zonder datum gaan naar 'Eerder'
    const gesorteerd = [...pdfs].sort((a,b) => (b.gemaakt?.seconds||0) - (a.gemaakt?.seconds||0));
    const perMaand = new Map();
    for (const t of gesorteerd){
      const ym = t.gemaakt?.seconds
        ? new Date(t.gemaakt.seconds*1000).toISOString().slice(0,7)
        : 'eerder';
      if (!perMaand.has(ym)) perMaand.set(ym, []);
      perMaand.get(ym).push(t);
    }
    const eersteYm = [...perMaand.keys()][0];   // nieuwste maand
    const TOON_PDF = 5;
    pdfLijst = [...perMaand.entries()].map(([ym, items]) => {
      // standaard open: de nieuwste maand. Tenzij de gebruiker hem dichtklapte.
      // overige maanden standaard dicht, tenzij de gebruiker ze openklapte (dan staan ze NIET in _pdfDicht maar markeren we expliciet).
      const standaardOpen = (ym === eersteYm);
      const open = standaardOpen ? !S._pdfDicht.has(ym) : S._pdfDicht.has('open:'+ym);
      const toonAlles = S._pdfToonAlles.has(ym);
      const titel = ym === 'eerder' ? 'Eerder' : maandNaam(ym);
      const ongelezenInMaand = items.filter(t => !S.trainingenGelezen[t.id]).length;
      const zichtbaar = (open && !toonAlles) ? items.slice(0, TOON_PDF) : items;
      const meer = items.length - TOON_PDF;
      return `
        <div class="maand-groep">
          <button class="maand-kop" data-pdfmaand="${ym}">
            <span class="maand-naam">${esc(titel)}</span>
            <span class="maand-tel">${items.length} training${items.length>1?'en':''}${ongelezenInMaand?` · <b style="color:var(--uit)">${ongelezenInMaand} nieuw</b>`:''}</span>
            <span class="maand-pijl ${open?'open':''}">▾</span>
          </button>
          ${open ? `
            <div class="maand-inhoud">
              ${zichtbaar.map(pdfRijHtml).join('')}
              ${(!toonAlles && meer > 0) ? `<button class="toon-meer" data-pdftoonmeer="${ym}">Toon ${meer} eerdere uit deze maand</button>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
  }

  const pdfSectie = `
    <div class="sectie-kop">📄 Gedeelde trainingen</div>
    ${pdfLijst}`;

  return htmlKompas() + afgelastSectie + presentieSectie + pdfSectie;
}

/* ---------- Tab: video's ---------- */
function htmlTeamVideos(){
  const lijst = S.videos.filter(t => (t.teams||[]).includes(S.teamId));
  if (!lijst.length) return `<div class="kaart leeg">Nog geen video's.<br>Vraag je clubadmin om YouTube-video's te delen met dit team.</div>`;
  return lijst.map(vid => {
    const id = youtubeId(vid.url);
    return `
    <div class="video-rij" data-open-video="${esc(youtubeWatch(id) || vid.url)}" style="cursor:pointer">
      <div class="thumb">${id ? `<img src="${esc(youtubeThumb(id))}" alt="" loading="lazy"><span class="play">▶</span>` : '<span class="play">▶</span>'}</div>
      <div class="v"><div class="v-titel">${esc(vid.titel || 'Video')}</div>
        <div class="v-meta">${vid.clubNaam ? esc(vid.clubNaam) : 'YouTube'}</div></div>
      <div class="acties"><button title="Afspelen">▶</button></div>
    </div>`;
  }).join('');
}

/* ---------- Tab: instellingen (incl. ledenbeheer) ---------- */
function htmlInstellingen(){
  const ledenInfo = S.team.ledenInfo || {};
  const ledenIds = Object.keys(S.team.leden || {});
  const ledenHtml = ledenIds.length ? ledenIds.map(uid => {
    const naam = (ledenInfo[uid]?.naam) || 'Coach';
    const jij = uid === S.user.uid;
    return `
      <div class="lid-rij">
        <div class="lid-avatar">${esc(initialen(naam))}</div>
        <div class="lid-naam">${esc(naam)}${jij?'<span class="jij">(jij)</span>':''}</div>
        ${jij ? '' : `<button class="lid-weg" data-lid-weg="${uid}" data-lid-naam="${esc(naam)}" title="Coach verwijderen">🗑</button>`}
      </div>`;
  }).join('') : '<p style="font-size:14px">—</p>';

  return `
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Teamnaam</div>
      <input class="invoer" id="iTeamNaam" value="${esc(S.team.naam)}" autocomplete="off" style="margin-bottom:10px">
      <label class="lid-rij" style="cursor:pointer;margin-bottom:10px">
        <input type="checkbox" id="iCodeVolgtNaam" checked style="width:19px;height:19px;accent-color:var(--grass)">
        <div class="lid-naam" style="font-weight:500">Code aanpassen aan de nieuwe naam
          <span style="display:block;font-size:11.5px;color:var(--ink-2);font-weight:400">Bijv. ASVJO10-2 — let op: oude uitnodigingslinks werken dan niet meer</span></div>
      </label>
      <button class="knop vol" id="iNaamOk">Naam opslaan</button>
    </div>
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Teamcode voor coaches</div>
      <p style="font-size:13.5px;color:var(--ink-2)">Deel deze code of een uitnodigingslink met collega-coaches. Zij loggen in met e-mail of Google en zitten direct in dit team.</p>
      <div class="teamcode">${esc(S.team.code)}</div>
      <div class="rij">
        <button class="knop licht vol" id="deelCode">Code kopiëren</button>
        <button class="knop fluo vol" id="deelLink">📲 Uitnodigen</button>
      </div>
      <button class="knop licht vol" id="wijzigCode" style="margin-top:8px">✏️ Code handmatig wijzigen</button>
    </div>
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Coaches (${ledenIds.length})</div>
      <p style="font-size:12.5px;color:var(--ink-2);margin-bottom:10px">Staat er iemand dubbel of verkeerd in de lijst? Verwijder die met 🗑.</p>
      ${ledenHtml}
      <button class="knop licht vol" id="wijzigMijnNaam" style="margin-top:10px">✏️ Mijn weergavenaam wijzigen</button>
    </div>
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Categorie & speelregels</div>
      <select class="invoer" id="iCategorie" style="margin-bottom:8px">
        <option value="">— geen categorie —</option>
        <optgroup label="Jongens">${Object.keys(CATEGORIEEN).map(c => `<option value="${c}" ${S.team.categorie===c?'selected':''}>${c}</option>`).join('')}</optgroup>
        <optgroup label="Meiden">${Object.keys(CATEGORIEEN_MEIDEN).map(c => `<option value="${c}" ${S.team.categorie===c?'selected':''}>${c}</option>`).join('')}</optgroup>
      </select>
      <p style="font-size:12.5px;color:var(--ink-2)" id="iCatInfo">${S.team.categorie && catInfo(S.team.categorie)
        ? 'KNVB: ' + esc(catInfo(S.team.categorie).knvb) + '. Nieuwe wedstrijden krijgen automatisch de juiste speeltijd en periodes.'
        : 'Kies de categorie zodat nieuwe wedstrijden automatisch de juiste KNVB-speeltijd en het juiste aantal helften/kwarten krijgen.'}</p>
    </div>
    <button class="knop gevaar vol" id="verlaatTeam">Team verlaten</button>`;
}

/* ---------- Tab: handleiding ---------- */
function htmlHandleiding(){
  return `<div class="hl">
    <div class="hl-zoekbalk">
      <span class="hl-zoek-ico">🔍</span>
      <input type="search" id="helpZoek" class="hl-zoek-input" placeholder="Zoek in de handleiding…" autocomplete="off" autocapitalize="none" spellcheck="false">
      <button class="hl-zoek-wis" id="helpZoekWis" title="Wissen" aria-label="Wissen">✕</button>
    </div>
    <div class="hl-geen" id="helpGeen" hidden>Geen onderdeel gevonden voor <b id="helpGeenTerm"></b>. Probeer een ander woord.</div>

    <div class="hl-hoofdstukken" id="helpHoofdstukken">
      ${[['starten','🚀 Starten'],['plannen','📅 Trainen & plannen'],['wedstrijddag','⚽ Op de wedstrijddag'],['club','🏛 Club & team beheren'],['beoordelen','📈 Beoordelen & evalueren'],['tips','💡 Tips & privacy']]
        .map(([id,naam]) => `<button data-hlh="${id}">${naam}</button>`).join('')}
    </div>

    <h4 class="hl-hoofdstuk" id="hlh-starten">🚀 Starten</h4>
    <section class="hl-sec" data-zoek="👋 welkom bij cluppie een app om voor je voetbalteam de opstelling te maken, wissels te beheren, speeltijd eerlijk te verdelen en de wedstrijd te loggen. alles werkt realtime, dus collega-coaches zien direct dezelfde informatie.">
    <h3>👋 Welkom bij Cluppie</h3>
    <p>Een app om voor je voetbalteam de opstelling te maken, wissels te beheren, speeltijd eerlijk te verdelen en de wedstrijd te loggen. Alles werkt realtime, dus collega-coaches zien direct dezelfde informatie.</p>
    </section>

    <section class="hl-sec" data-zoek="🔑 de eerste keer inloggen je hoeft niets te installeren. je opent de app gewoon in je browser en logt in op de manier die jij prettig vindt: met google — één tik en je bent binnen. met e-mail en wachtwoord — vul je e-mailadres en een zelfgekozen wachtwoord in. bestaat je account nog niet? dan wordt het automatisch aangemaakt. de volgende keer kom je met diezelfde gegevens direct terug als dezelfde coach. wachtwoord vergeten? tik op "wachtwoord vergeten?" onder de inlogknop — je krijgt dan een mailtje om een nieuw wachtwoord in te stellen.">
    <h3>🔑 De eerste keer inloggen</h3>
    <p>Je hoeft niets te installeren. Je opent de app gewoon in je browser en logt in op de manier die jij prettig vindt:</p>
    <ul>
      <li><b>Met Google</b> — één tik en je bent binnen.</li>
      <li><b>Met e-mail en wachtwoord</b> — vul je e-mailadres en een zelfgekozen wachtwoord in. Bestaat je account nog niet? Dan wordt het automatisch aangemaakt. De volgende keer kom je met diezelfde gegevens direct terug als dezelfde coach.</li>
    </ul>
    <div class="tip"><b>Wachtwoord vergeten?</b> Tik op "Wachtwoord vergeten?" onder de inlogknop — je krijgt dan een mailtje om een nieuw wachtwoord in te stellen.</div>
    </section>

    <section class="hl-sec" data-zoek="🔗 aansluiten bij je team je coach of de clubbeheerder stuurt je een persoonlijke uitnodigingslink (vaak via whatsapp). zo werkt het: tik op de link. je ziet een welkomstscherm met de naam van je team. log in (google of e-mail) — en je zit meteen in het juiste team. geen link gekregen? vraag je coach om de teamcode (bijv. asvjo11-1) en vul die in op het inlogscherm.">
    <h3>🔗 Aansluiten bij je team</h3>
    <p>Je coach of de clubbeheerder stuurt je een <b>persoonlijke uitnodigingslink</b> (vaak via WhatsApp). Zo werkt het:</p>
    <ul>
      <li>Tik op de link. Je ziet een welkomstscherm met de naam van je team.</li>
      <li>Log in (Google of e-mail) — en je zit meteen in het juiste team.</li>
      <li>Geen link gekregen? Vraag je coach om de <b>teamcode</b> (bijv. ASVJO11-1) en vul die in op het inlogscherm.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="📱 zet de app op je beginscherm voor een echt app-gevoel: open het menu van je browser en kies "toevoegen aan beginscherm" . dan staat cluppie als icoontje tussen je apps en open je hem met één tik — geen browser meer nodig.">
    <h3>📱 Zet de app op je beginscherm</h3>
    <p>Voor een echt app-gevoel: open het menu van je browser en kies <b>"Toevoegen aan beginscherm"</b>. Dan staat Cluppie als icoontje tussen je apps en open je hem met één tik — geen browser meer nodig.</p>
    </section>

    <h4 class="hl-hoofdstuk" id="hlh-plannen">📅 Trainen &amp; plannen</h4>
    <section class="hl-sec" data-zoek="📄 trainingen & 🎬 video's onder het tabblad training vind je de oefenstof voor je team, gedeeld als pdf. onder video staan youtube-links met oefeningen of beelden. elke zondag worden hier de trainingen voor de komende week en eventuele video's klaargezet — kijk er dus aan het begin van de week even in. een 🔴 rood stipje op het tabblad laat zien dat er iets nieuws is.">
    <h3>📄 Trainingen & 🎬 video's</h3>
    <p>Onder het tabblad <b>Training</b> vind je de oefenstof voor je team, gedeeld als PDF. Onder <b>Video</b> staan YouTube-links met oefeningen of beelden.</p>
    <div class="tip"><b>Elke zondag</b> worden hier de trainingen voor de komende week en eventuele video's klaargezet — kijk er dus aan het begin van de week even in. Een <b>🔴 rood stipje</b> op het tabblad laat zien dat er iets nieuws is.</div>
    </section>

    <section class="hl-sec" data-zoek="📅 seizoensplanning het tabblad planning toont de hele seizoenskalender van je team in één lijst, per maand gegroepeerd. verleden maanden staan ingeklapt; de huidige en komende maanden staan open. echte wedstrijden uit voetbal.nl verschijnen hier automatisch met een ⚽-stip. de app haalt ze 's nachts op uit de officiële knvb-kalender, dus zodra de competitie-indeling bekend is staat alles klaar — thuis/uit, datum en tegenstander. op een dag met een echte wedstrijd wordt de algemene wd (wedstrijddag) onderdrukt, zodat je geen dubbele regels ziet. tik op een wedstrijd-regel om die wedstrijd direct te openen en de opstelling klaar te zetten. met de filterknoppen bovenaan ( alles , wedstrijden , speeldagen , beker , vrij ) bekijk je gericht één soort dag. + eigen dag : voeg zelf een toernooi, vriendschappelijke wedstrijd of vrije dag toe. die staat dan met een eigen markering tussen de officiële dagen. tip: verschijnen er nog geen wedstrijden? dan is de knvb-kalender voor jouw team nog niet gepubliceerd. zodra dat gebeurt, vullen ze zichzelf aan — je hoeft niets te doen.">
    <h3>📅 Seizoensplanning</h3>
    <p>Het tabblad <b>Planning</b> toont de hele seizoenskalender van je team in één lijst, per maand gegroepeerd. Verleden maanden staan ingeklapt; de huidige en komende maanden staan open.</p>
    <ul>
      <li><b>Echte wedstrijden uit voetbal.nl</b> verschijnen hier automatisch met een ⚽-stip. De app haalt ze 's nachts op uit de officiële KNVB-kalender, dus zodra de competitie-indeling bekend is staat alles klaar — thuis/uit, datum en tegenstander.</li>
      <li>Op een dag met een echte wedstrijd wordt de algemene <kbd>WD</kbd> (wedstrijddag) onderdrukt, zodat je geen dubbele regels ziet.</li>
      <li>Tik op een wedstrijd-regel om die wedstrijd direct te openen en de opstelling klaar te zetten.</li>
      <li>Met de filterknoppen bovenaan (<kbd>Alles</kbd>, <kbd>Wedstrijden</kbd>, <kbd>Speeldagen</kbd>, <kbd>Beker</kbd>, <kbd>Vrij</kbd>) bekijk je gericht één soort dag.</li>
      <li><b>+ Eigen dag</b>: voeg zelf een toernooi, vriendschappelijke wedstrijd of vrije dag toe. Die staat dan met een eigen markering tussen de officiële dagen.</li>
    </ul>
    <div class="tip"><b>Tip:</b> verschijnen er nog geen wedstrijden? Dan is de KNVB-kalender voor jouw team nog niet gepubliceerd. Zodra dat gebeurt, vullen ze zichzelf aan — je hoeft niets te doen.</div>
    </section>

    <section class="hl-sec" data-zoek="✏️ je eigen naam instellen onder ⚙️ team kun je via "mijn weergavenaam wijzigen" instellen hoe je in de coachlijst verschijnt. handig zodat je teamgenoten zien wie wie is.">
    <h3>✏️ Je eigen naam instellen</h3>
    <p>Onder ⚙️ <b>Team</b> kun je via <b>"Mijn weergavenaam wijzigen"</b> instellen hoe je in de coachlijst verschijnt. Handig zodat je teamgenoten zien wie wie is.</p>
    </section>

    <h4 class="hl-hoofdstuk" id="hlh-wedstrijddag">⚽ Op de wedstrijddag</h4>
    <section class="hl-sec" data-zoek="🚀 snel beginnen voeg je spelers toe onder het tabblad 👕 — naam en rugnummer is genoeg. maak een nieuwe wedstrijd aan onder 📋. kies competitie of toernooi. sleep spelers van de bank naar het veld of tik ze aan en tik daarna een positie. start de klok ▶ zodra de wedstrijd begint. wissels tijdens het spel worden automatisch gelogd met tijdstip.">
    <h3>🚀 Snel beginnen</h3>
    <ul>
      <li>Voeg je <b>spelers</b> toe onder het tabblad 👕 — naam en rugnummer is genoeg.</li>
      <li>Maak een <b>nieuwe wedstrijd</b> aan onder 📋. Kies competitie of toernooi.</li>
      <li>Sleep spelers van de bank naar het veld of tik ze aan en tik daarna een positie.</li>
      <li>Start de klok ▶ zodra de wedstrijd begint. Wissels tijdens het spel worden automatisch gelogd met tijdstip.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="⚽ spelers slepen & wisselen op het veld werk je met spelersbolletjes (de chips ): slepen : houd een speler vast en sleep hem naar een andere positie, een lege plek, of naar de bank. tikken : één tik selecteert (gele rand). tik daarna een doel om de speler daar neer te zetten. positie ruilen : sleep een veldspeler naar een andere veldspeler — ze wisselen van positie. loopt de klok? dan wordt elke bank→veld of veld→bank actie geregistreerd als wissel met tijdstip in het log. tip: de bank is gesorteerd op minste speeltijd — wie aan de beurt is, staat vooraan.">
    <h3>⚽ Spelers slepen & wisselen</h3>
    <p>Op het veld werk je met spelersbolletjes (de <b>chips</b>):</p>
    <ul>
      <li><b>Slepen</b>: houd een speler vast en sleep hem naar een andere positie, een lege plek, of naar de bank.</li>
      <li><b>Tikken</b>: één tik selecteert (gele rand). Tik daarna een doel om de speler daar neer te zetten.</li>
      <li><b>Positie ruilen</b>: sleep een veldspeler naar een andere veldspeler — ze wisselen van positie.</li>
      <li><b>Loopt de klok?</b> Dan wordt elke bank→veld of veld→bank actie geregistreerd als wissel met tijdstip in het log.</li>
    </ul>
    <div class="tip"><b>Tip:</b> de bank is gesorteerd op minste speeltijd — wie aan de beurt is, staat vooraan.</div>
    </section>

    <section class="hl-sec" data-zoek="🟢 stippen onder spelers onder elke chip verschijnen vanaf het tweede kwart kleine stippen — één per eerder kwart: groen = die periode gespeeld. rood = die periode op de bank. zo zie je in één oogopslag wie er nu echt aan de beurt is.">
    <h3>🟢 Stippen onder spelers</h3>
    <p>Onder elke chip verschijnen vanaf het tweede kwart kleine stippen — één per eerder kwart:</p>
    <ul>
      <li><b>Groen</b> = die periode gespeeld.</li>
      <li><b>Rood</b> = die periode op de bank.</li>
    </ul>
    <p>Zo zie je in één oogopslag wie er nu echt aan de beurt is.</p>
    </section>

    <section class="hl-sec" data-zoek="⏱ kwarten, helften & klok de app stelt het juiste aantal periodes en de speeltijd in op basis van de knvb-categorie van je team. tik op een periode-tab ( k1 , k2 ... of h1 , h2 ) om eraan te werken. de klok stopt automatisch op de maximale speeltijd — je kunt hem dus niet vergeten. open je een leeg kwart, dan wordt de eindopstelling van het vorige kwart automatisch overgenomen. met ↺ zet je de klok terug op nul; wissels blijven staan.">
    <h3>⏱ Kwarten, helften & klok</h3>
    <ul>
      <li>De app stelt het juiste aantal periodes en de speeltijd in op basis van de KNVB-categorie van je team.</li>
      <li>Tik op een periode-tab (<kbd>K1</kbd>, <kbd>K2</kbd> ... of <kbd>H1</kbd>, <kbd>H2</kbd>) om eraan te werken.</li>
      <li>De klok stopt <b>automatisch</b> op de maximale speeltijd — je kunt hem dus niet vergeten.</li>
      <li>Open je een leeg kwart, dan wordt de eindopstelling van het vorige kwart automatisch overgenomen.</li>
      <li>Met ↺ zet je de klok terug op nul; wissels blijven staan.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="📋 opstelling van vorige wedstrijd bij een nieuwe wedstrijd kun je de optie "begin met opstelling van vorige wedstrijd" aanvinken. het eerste kwart wordt dan gevuld met de startopstelling van je laatste wedstrijd in hetzelfde format — zo hoef je niet elke keer opnieuw te beginnen, en pas je alleen aan wie er deze keer ontbreekt.">
    <h3>📋 Opstelling van vorige wedstrijd</h3>
    <p>Bij een nieuwe wedstrijd kun je de optie <b>"Begin met opstelling van vorige wedstrijd"</b> aanvinken. Het eerste kwart wordt dan gevuld met de startopstelling van je laatste wedstrijd in hetzelfde format — zo hoef je niet elke keer opnieuw te beginnen, en pas je alleen aan wie er deze keer ontbreekt.</p>
    </section>

    <section class="hl-sec" data-zoek="↩︎ vorige confrontatie open je een wedstrijd tegen een tegenstander waar je dit seizoen al eens tegen speelde, dan verschijnt bovenin een regeltje "vorige keer:" met datum, thuis/uit en de uitslag (groen = gewonnen, rood = verloren, grijs = gelijk). tik erop om het paneel uit te klappen: je ziet de volledige uitslag en — als je die had ingevuld — het wedstrijddoel en je notitie van toen. met → bekijk deze wedstrijd spring je direct naar de oude wedstrijd om de opstelling van destijds terug te zien. slim: de naamvergelijking negeert hoofdletters, spaties en het eigen clubvoorvoegsel, zodat dezelfde tegenstander altijd herkend wordt — ook als de schrijfwijze net iets verschilt.">
    <h3>↩︎ Vorige confrontatie</h3>
    <p>Open je een wedstrijd tegen een tegenstander waar je dit seizoen al eens tegen speelde, dan verschijnt bovenin een regeltje <b>"Vorige keer:"</b> met datum, thuis/uit en de uitslag (groen = gewonnen, rood = verloren, grijs = gelijk).</p>
    <ul>
      <li>Tik erop om het paneel uit te klappen: je ziet de volledige uitslag en — als je die had ingevuld — het wedstrijddoel en je notitie van toen.</li>
      <li>Met <b>→ Bekijk deze wedstrijd</b> spring je direct naar de oude wedstrijd om de opstelling van destijds terug te zien.</li>
    </ul>
    <div class="tip"><b>Slim:</b> de naamvergelijking negeert hoofdletters, spaties en het eigen clubvoorvoegsel, zodat dezelfde tegenstander altijd herkend wordt — ook als de schrijfwijze net iets verschilt.</div>
    </section>

    <section class="hl-sec" data-zoek="📅 wissels vooraf plannen onder het wisselvak staat + wissel plannen : kies wie erin, wie eruit en na hoeveel minuten. zodra de klok dat moment passeert, knippert de geplande wissel en trilt je telefoon. tik op ✓ om hem door te voeren.">
    <h3>📅 Wissels vooraf plannen</h3>
    <p>Onder het wisselvak staat <b>+ Wissel plannen</b>: kies wie erin, wie eruit en na hoeveel minuten. Zodra de klok dat moment passeert, knippert de geplande wissel en trilt je telefoon. Tik op <kbd>✓</kbd> om hem door te voeren.</p>
    </section>

    <section class="hl-sec" data-zoek="⚽ doelpunten registreren & corrigeren tik op de ⚽-knop aan jouw kant van het scorebord en kies de speler die scoorde. tegendoelpunt: één tik op de andere ⚽-knop. verkeerd getikt? tik op het doelpunt in het gebeurtenissen-log. je kunt dan de juiste scorer kiezen, de kant omdraaien (voor ↔ tegen) of het doelpunt verwijderen. doelpunten verschijnen in het log en in de seizoenstatistieken (topscorer).">
    <h3>⚽ Doelpunten registreren & corrigeren</h3>
    <ul>
      <li>Tik op de <b>⚽-knop</b> aan jouw kant van het scorebord en kies de speler die scoorde.</li>
      <li>Tegendoelpunt: één tik op de andere ⚽-knop.</li>
      <li><b>Verkeerd getikt?</b> Tik op het doelpunt in het gebeurtenissen-log. Je kunt dan de juiste scorer kiezen, de kant omdraaien (voor ↔ tegen) of het doelpunt verwijderen.</li>
      <li>Doelpunten verschijnen in het log en in de seizoenstatistieken (topscorer).</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="🟨 kaarten & straffen de gele knop naast het scorebord opent het kaartenmenu. kies de speler en het type: 🟨 geel — waarschuwing. een tweede gele in dezelfde wedstrijd geeft automatisch rood . ⏱ tijdstraf — 5 minuten voor pupillen (t/m jo/mo15), 10 minuten voor jo/mo16+ en senioren. 🟥 rood — de speler wordt direct van het veld gehaald. verkeerde kaart? tik erop in het log om de speler te wijzigen of de kaart te verwijderen.">
    <h3>🟨 Kaarten & straffen</h3>
    <p>De gele knop naast het scorebord opent het kaartenmenu. Kies de speler en het type:</p>
    <ul>
      <li><b>🟨 Geel</b> — waarschuwing. Een tweede gele in dezelfde wedstrijd geeft <b>automatisch rood</b>.</li>
      <li><b>⏱ Tijdstraf</b> — 5 minuten voor pupillen (t/m JO/MO15), 10 minuten voor JO/MO16+ en senioren.</li>
      <li><b>🟥 Rood</b> — de speler wordt direct van het veld gehaald.</li>
      <li>Verkeerde kaart? Tik erop in het log om de speler te wijzigen of de kaart te verwijderen.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="👑 aanvoerder onder ⚙️ in de wedstrijd kies je per wedstrijd de aanvoerder. hij krijgt een geel c -bandje op zijn shirt. in de statistieken zie je hoe vaak iemand aanvoerder is geweest — handig om te rouleren.">
    <h3>👑 Aanvoerder</h3>
    <p>Onder ⚙️ in de wedstrijd kies je per wedstrijd de aanvoerder. Hij krijgt een geel <b>C</b>-bandje op zijn shirt. In de statistieken zie je hoe vaak iemand aanvoerder is geweest — handig om te rouleren.</p>
    </section>

    <section class="hl-sec" data-zoek="🏆 toernooien bij een nieuwe wedstrijd kies je toernooi . geef het aantal wedstrijden op en het aantal helften per wedstrijd. de tabs worden dan w1 , w2 ... de tegenstander per wedstrijd vul je in door op de naam in het scorebord te tikken (gestippeld onderstreept). op één scherm: alle wissels en speeltijden lopen over het hele toernooi door, zodat je in wedstrijd 4 ziet wie er bij wedstrijd 1, 2 en 3 al heeft gespeeld.">
    <h3>🏆 Toernooien</h3>
    <p>Bij een nieuwe wedstrijd kies je <b>Toernooi</b>. Geef het aantal wedstrijden op en het aantal helften per wedstrijd. De tabs worden dan <kbd>W1</kbd>, <kbd>W2</kbd> ... De tegenstander per wedstrijd vul je in door op de naam in het scorebord te tikken (gestippeld onderstreept).</p>
    <div class="tip"><b>Op één scherm:</b> alle wissels en speeltijden lopen over het hele toernooi door, zodat je in wedstrijd 4 ziet wie er bij wedstrijd 1, 2 en 3 al heeft gespeeld.</div>
    </section>

    <h4 class="hl-hoofdstuk" id="hlh-club">🏛 Club &amp; team beheren</h4>
    <section class="hl-sec" data-zoek="🏛 clubs & trainingen delen werk je als hoofdtrainer voor meerdere teams? maak op het startscherm een club aan. daarmee kun je: teams aanmaken die bij jouw club horen (de coaches ervan komen direct in het juiste team). 📥 pdf importeren : upload een pdf met de teamindeling en de app leest de teams en spelers automatisch uit. controleer in de preview, klik "aanmaken" en alle teams + spelers staan klaar. coaches uitnodigen met een persoonlijke link (via whatsapp), zodat ze niet eerst een teamcode hoeven te krijgen. met 🔗 alle uitnodigingen krijg je in één overzicht alle links voor alle teams. pdf-trainingen uploaden en aangeven voor welke teams ze beschikbaar zijn. de trainers zien ze in het 📄 training-tabblad van hun team. met ✏️ pas je de titel, week of de gekoppelde teams later aan, zonder het bestand opnieuw te uploaden. een 🔴 stip op het training-tabblad waarschuwt coaches voor nieuwe, ongelezen trainingen.">
    <h3>🏛 Clubs & trainingen delen</h3>
    <p>Werk je als hoofdtrainer voor meerdere teams? Maak op het startscherm een <b>club</b> aan. Daarmee kun je:</p>
    <ul>
      <li>Teams aanmaken die bij jouw club horen (de coaches ervan komen direct in het juiste team).</li>
      <li><b>📥 PDF importeren</b>: upload een PDF met de teamindeling en de app leest de teams en spelers automatisch uit. Controleer in de preview, klik "Aanmaken" en alle teams + spelers staan klaar.</li>
      <li>Coaches uitnodigen met een persoonlijke link (via WhatsApp), zodat ze niet eerst een teamcode hoeven te krijgen. Met <b>🔗 Alle uitnodigingen</b> krijg je in één overzicht alle links voor alle teams.</li>
      <li>PDF-trainingen uploaden en aangeven voor welke teams ze beschikbaar zijn. De trainers zien ze in het 📄 Training-tabblad van hun team. Met ✏️ pas je de titel, week of de gekoppelde teams later aan, zonder het bestand opnieuw te uploaden.</li>
      <li>Een 🔴 stip op het training-tabblad waarschuwt coaches voor nieuwe, ongelezen trainingen.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="👥 meerdere coaches & rommel opruimen onder ⚙️ team vind je de teamcode (bijv. asvjo11-1) en de lijst coaches . deel de code of een uitnodigingslink met collega-coaches: ze openen de link en loggen in met hun e-mailadres of google. daarna zitten ze direct in het team — en komen ze later met dezelfde login terug als dezelfde coach. staat er iemand verkeerd of dubbel in de lijst? tik op het 🗑 naast een coach om die te verwijderen uit het team. wijzigingen lopen realtime door — handig als de assistent-coach langs de lijn de wissels bijhoudt en de hoofdcoach de score.">
    <h3>👥 Meerdere coaches & rommel opruimen</h3>
    <p>Onder ⚙️ <b>Team</b> vind je de <b>teamcode</b> (bijv. ASVJO11-1) en de lijst <b>coaches</b>. Deel de code of een uitnodigingslink met collega-coaches:</p>
    <ul>
      <li>Ze openen de link en loggen in met hun e-mailadres of Google. Daarna zitten ze direct in het team — en komen ze later met dezelfde login terug als dezelfde coach.</li>
      <li>Staat er iemand verkeerd of dubbel in de lijst? Tik op het 🗑 naast een coach om die te verwijderen uit het team.</li>
      <li>Wijzigingen lopen realtime door — handig als de assistent-coach langs de lijn de wissels bijhoudt en de hoofdcoach de score.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="📐 format en formatie wijzigen onder ⚙️ in een wedstrijd pas je het format (6×6, 8×8, 9×9, 11×11, 4×4) en de formatie aan. spelers blijven zoveel mogelijk op hun plek staan; slots die wegvallen worden netjes opgeschoond.">
    <h3>📐 Format en formatie wijzigen</h3>
    <p>Onder ⚙️ in een wedstrijd pas je het format (6×6, 8×8, 9×9, 11×11, 4×4) en de formatie aan. Spelers blijven zoveel mogelijk op hun plek staan; slots die wegvallen worden netjes opgeschoond.</p>
    </section>

    <section class="hl-sec" data-zoek="📊 statistieken onder ⏱ vind je het seizoensoverzicht: speeltijd, doelpunten, aanvoerdersbeurten, keeperbeurten en kaarten per speler. sorteert vanzelf op meeste speeltijd.">
    <h3>📊 Statistieken</h3>
    <p>Onder ⏱ vind je het seizoensoverzicht: speeltijd, doelpunten, aanvoerdersbeurten, keeperbeurten en kaarten per speler. Sorteert vanzelf op meeste speeltijd.</p>
    </section>

    <h4 class="hl-hoofdstuk" id="hlh-beoordelen">📈 Beoordelen &amp; evalueren</h4>
    <section class="hl-sec" data-zoek="📋 spelers beoordelen per speler leg je de ontwikkeling vast. open een speler (tab spelers → tik op de speler) en je vindt daar het ontwikkelprofiel met twee manieren om te beoordelen: ⚡ snel beoordelen — een paar tikken na een wedstrijd of training: een algemeen niveau plus optionele "opvallend"-tags. ideaal om er een gewoonte van te maken. 📋 volledige beoordeling — een periodieke, diepere meting op de vijf ontwikkeldomeinen. hieruit komt het ontwikkelprofiel met balkjes. de vijf domeinen (gebaseerd op het asv'33-jeugdbeleidsplan): te — technisch : balbeheersing, traptechniek, 1v1. ta — tactisch : inzicht, positiespel, keuzes maken. fy — fysiek : snelheid, actiesnelheid, duelkracht. me — mentaal : zelfvertrouwen, spelen onder weerstand. ge — gedrag & beleving : inzet, teamgevoel, plezier. een score loopt van 1 (aandacht) via 3 (prima) tot 5 (uitblinker) . leerpunten (tab leerlijn in het profiel): concrete, observeerbare ontwikkeldoelen die over meerdere wedstrijden doorlopen. vink ze af zodra ze beheerst zijn. de app stelt leerpunten voor die passen bij de leeftijd van het team. historie : een tijdlijn met al je eerdere beoordelingen. tik een item aan om het te bekijken of bij te werken. privacy: beoordelingen en leerpunten zijn coach-only . spelers en ouders zien deze nooit. verwijder je een speler, dan gaan zijn beoordelingen mee weg.">
    <h3>📋 Spelers beoordelen</h3>
    <p>Per speler leg je de ontwikkeling vast. Open een speler (tab <b>Spelers</b> → tik op de speler) en je vindt daar het ontwikkelprofiel met twee manieren om te beoordelen:</p>
    <ul>
      <li><b>⚡ Snel beoordelen</b> — een paar tikken na een wedstrijd of training: een algemeen niveau plus optionele "opvallend"-tags. Ideaal om er een gewoonte van te maken.</li>
      <li><b>📋 Volledige beoordeling</b> — een periodieke, diepere meting op de vijf ontwikkeldomeinen. Hieruit komt het ontwikkelprofiel met balkjes.</li>
    </ul>
    <p>De vijf domeinen (gebaseerd op het ASV'33-jeugdbeleidsplan):</p>
    <ul>
      <li><b>TE — Technisch</b>: balbeheersing, traptechniek, 1v1.</li>
      <li><b>TA — Tactisch</b>: inzicht, positiespel, keuzes maken.</li>
      <li><b>FY — Fysiek</b>: snelheid, actiesnelheid, duelkracht.</li>
      <li><b>ME — Mentaal</b>: zelfvertrouwen, spelen onder weerstand.</li>
      <li><b>GE — Gedrag &amp; beleving</b>: inzet, teamgevoel, plezier.</li>
    </ul>
    <p>Een score loopt van <b>1 (Aandacht)</b> via <b>3 (Prima)</b> tot <b>5 (Uitblinker)</b>.</p>
    <ul>
      <li><b>Leerpunten</b> (tab Leerlijn in het profiel): concrete, observeerbare ontwikkeldoelen die over meerdere wedstrijden doorlopen. Vink ze af zodra ze beheerst zijn. De app stelt leerpunten voor die passen bij de leeftijd van het team.</li>
      <li><b>Historie</b>: een tijdlijn met al je eerdere beoordelingen. Tik een item aan om het te bekijken of bij te werken.</li>
    </ul>
    <div class="tip"><b>Privacy:</b> beoordelingen en leerpunten zijn <b>coach-only</b>. Spelers en ouders zien deze nooit. Verwijder je een speler, dan gaan zijn beoordelingen mee weg.</div>
    </section>

    <section class="hl-sec" data-zoek="📈 team evalueren na de wedstrijd naast de beoordeling per speler kun je na elke wedstrijd ook het hele team evalueren. onderaan het wedstrijdscherm, onder het wedstrijdverslag, staat de knop 📈 team evalueren . al een keer ingevuld voor deze wedstrijd? dan heet de knop ✓ teamevaluatie bijwerken en pas je 'm gewoon aan. acht korte vragen, elk met dezelfde kleurbalk als bij spelers (1 aandacht t/m 5 uitblinker): inzet & concentratie, samenwerking & communicatie, taakuitvoering per linie, opbouw van achteruit, omschakeling bij balverlies/-winst, druk zetten & veroveren, spelplezier, coachbaarheid. daarna eventueel een paar tags aantikken (goede samenwerking, veel plezier, afspraken niet nagekomen, enzovoort) en twee optionele tekstvelden: wat ging het beste, en wat is het aandachtspunt voor de volgende training. drie tot vijf minuten werk, alles op één scherm, niets is verplicht behalve de acht kleurbalken.">
    <h3>📈 Team evalueren na de wedstrijd</h3>
    <p>Naast de beoordeling per speler kun je na elke wedstrijd ook het <b>hele team</b> evalueren. Onderaan het wedstrijdscherm, onder het wedstrijdverslag, staat de knop <b>📈 Team evalueren</b>.</p>
    <p>Al een keer ingevuld voor deze wedstrijd? Dan heet de knop <b>✓ Teamevaluatie bijwerken</b> en pas je 'm gewoon aan.</p>
    <p>Acht korte vragen, elk met dezelfde kleurbalk als bij spelers (1 Aandacht t/m 5 Uitblinker):</p>
    <ul>
      <li>Inzet &amp; concentratie</li>
      <li>Samenwerking &amp; communicatie</li>
      <li>Taakuitvoering per linie</li>
      <li>Opbouw van achteruit</li>
      <li>Omschakeling bij balverlies/-winst</li>
      <li>Druk zetten &amp; veroveren</li>
      <li>Spelplezier</li>
      <li>Coachbaarheid</li>
    </ul>
    <p>Daarna eventueel een paar <b>tags</b> aantikken (goede samenwerking, veel plezier, afspraken niet nagekomen, enzovoort) en twee optionele tekstvelden: <b>wat ging het beste</b>, en <b>wat is het aandachtspunt voor de volgende training</b>.</p>
    <div class="tip"><b>3–5 minuten werk:</b> alles staat op één scherm, tikken in plaats van typen. Niets is verplicht behalve de acht kleurbalken — de tags en tekstvelden mag je overslaan.</div>
    </section>

    <section class="hl-sec" data-zoek="📊 teamevaluatie-dashboard bekijk je onder het tabblad stats , via het segment 📈 teamevaluatie naast spelers . vier onderdelen: groeicurve — een lijn met de gemiddelde teamontwikkelscore per wedstrijd, zodat je in één oogopslag ziet of het team groeit. categorieën — de acht onderdelen met hun gemiddelde over de laatste vijf wedstrijden, inclusief een pijltje omhoog, gelijk of omlaag. terugkerende aandachtspunten — automatisch signalen zodra hetzelfde onderdeel meerdere wedstrijden op rij het laagst scoort. voorgesteld trainingsthema — een suggestie voor de volgende training, gebaseerd op het onderdeel dat de meeste aandacht vraagt; sluit waar mogelijk aan bij een leercurve-thema uit het jeugdbeleidsplan. tip: na 1 evaluatie zie je alleen een cijfer, vanaf 2 verschijnt de lijn, en de terugkerende aandachtspunten worden pas zichtbaar na een paar wedstrijden — zo voorkom je dat één mindere wedstrijd meteen als patroon wordt gezien.">
    <h3>📊 Teamevaluatie-dashboard lezen</h3>
    <p>Alle ingevulde teamevaluaties komen samen onder het tabblad <b>Stats</b>, via het segment <b>📈 Teamevaluatie</b> naast Spelers. Vier onderdelen:</p>
    <ul>
      <li><b>Groeicurve</b> — een lijn met de gemiddelde teamontwikkelscore per wedstrijd, zodat je in één oogopslag ziet of het team groeit.</li>
      <li><b>Categorieën</b> — de acht onderdelen met hun gemiddelde over de laatste vijf wedstrijden, inclusief een pijltje ↗ ↘ → voor de trend.</li>
      <li><b>Terugkerende aandachtspunten</b> — verschijnt automatisch zodra hetzelfde onderdeel meerdere wedstrijden op rij het laagst scoort.</li>
      <li><b>Voorgesteld trainingsthema</b> — een suggestie voor de volgende training, gebaseerd op het onderdeel dat nu de meeste aandacht vraagt. Sluit waar mogelijk aan bij een leercurve-thema uit het jeugdbeleidsplan.</li>
    </ul>
    <div class="tip"><b>Even geduld bij de start:</b> na 1 evaluatie zie je alleen een cijfer, vanaf 2 verschijnt de lijn. De terugkerende aandachtspunten worden pas zichtbaar na een paar wedstrijden — zo voorkom je dat één mindere wedstrijd meteen als patroon wordt gezien.</div>
    </section>

    <h4 class="hl-hoofdstuk" id="hlh-tips">💡 Tips &amp; privacy</h4>
    <section class="hl-sec" data-zoek="💡 praktische tips voeg de app als snelkoppeling op je startscherm toe (browsermenu → "toevoegen aan beginscherm") voor app-gevoel. werkt zonder problemen als de telefoon op slot gaat — de klok loopt door op de juiste tijd. slecht bereik langs de lijn? geen probleem: de app werkt offline door en synchroniseert je wijzigingen automatisch zodra er weer verbinding is. met een powerbank langs de lijn ben je verzekerd van een hele wedstrijd.">
    <h3>💡 Praktische tips</h3>
    <ul>
      <li>Voeg de app als <b>snelkoppeling op je startscherm</b> toe (browsermenu → "Toevoegen aan beginscherm") voor app-gevoel.</li>
      <li>Werkt zonder problemen als de telefoon op slot gaat — de klok loopt door op de juiste tijd.</li>
      <li><b>Slecht bereik langs de lijn?</b> Geen probleem: de app werkt offline door en synchroniseert je wijzigingen automatisch zodra er weer verbinding is.</li>
      <li>Met een powerbank langs de lijn ben je verzekerd van een hele wedstrijd.</li>
    </ul>
    </section>


    <section class="hl-sec" data-zoek="⇄ spelers uitlenen speelt een speler een keer mee met een ander team binnen de club? open zijn profiel (tab spelers → tik op de speler) en kies ⇄ uitlenen aan ander team . je kiest het ontvangende team en de wedstrijddag. de andere coach ziet de speler automatisch vanaf 3 dagen vóór tot 3 dagen ná die dag, onder het kopje "geleend" — daarna verdwijnt hij vanzelf. de ontvangende coach ziet alleen voornaam + voorletter (bijv. "tim b."), de voorkeurspositie, de statistieken en het ontwikkelprofiel. alles read-only. je kunt een uitlening op elk moment intrekken vanaf het spelerprofiel.">
    <h3>⇄ Spelers uitlenen</h3>
    <p>Speelt een speler een keer mee met een ander team binnen de club? Open zijn profiel (tab Spelers → tik op de speler) en kies <b>⇄ Uitlenen aan ander team</b>. Je kiest het ontvangende team en de wedstrijddag.</p>
    <ul>
      <li>De andere coach ziet de speler automatisch vanaf <b>3 dagen vóór</b> tot <b>3 dagen ná</b> die dag, onder het kopje "Geleend" — daarna verdwijnt hij vanzelf.</li>
      <li>De ontvangende coach ziet alleen <b>voornaam + voorletter</b> (bijv. "Tim B."), de voorkeurspositie, de statistieken en het ontwikkelprofiel. Alles read-only.</li>
      <li>Je kunt een uitlening op elk moment <b>intrekken</b> vanaf het spelerprofiel.</li>
    </ul>
    </section>

    <section class="hl-sec" data-zoek="🔒 privacy & namen cluppie gaat zorgvuldig om met de gegevens van (vaak minderjarige) spelers: in de app zie je standaard alleen voornamen . de achternaam wordt wél opgeslagen, maar nergens in de app getoond. de achternaam blijft binnen je eigen team en is alleen zichtbaar voor de coaches van dat team. leen je een speler uit, dan ziet de andere coach alleen de voorletter. beoordelingen en leerpunten zijn coach-only : spelers en ouders zien deze niet. verwijder je een speler, dan worden zijn gegevens (inclusief beoordelingen en leerpunten) verwijderd. deel gegevens uit spelersprofielen niet buiten het technisch kader. heb je vragen over privacy binnen de club? stem af met je hoofdcoach of clubbeheerder.">
    <h3>🔒 Privacy &amp; namen</h3>
    <p>Cluppie gaat zorgvuldig om met de gegevens van (vaak minderjarige) spelers:</p>
    <ul>
      <li>In de app zie je standaard alleen <b>voornamen</b>. De achternaam wordt wél opgeslagen, maar nergens in de app getoond.</li>
      <li>De achternaam blijft <b>binnen je eigen team</b> en is alleen zichtbaar voor de coaches van dat team. Leen je een speler uit, dan ziet de andere coach alleen de voorletter.</li>
      <li>Beoordelingen en leerpunten zijn <b>coach-only</b>: spelers en ouders zien deze niet.</li>
      <li>Verwijder je een speler, dan worden zijn gegevens (inclusief beoordelingen en leerpunten) verwijderd.</li>
    </ul>
    <div class="tip">Deel gegevens uit spelersprofielen niet buiten het technisch kader. Heb je vragen over privacy binnen de club? Stem af met je hoofdcoach of clubbeheerder.</div>

    
    </section>

    <p style="font-size:12.5px;color:var(--ink-2);text-align:center;margin-top:20px;padding-top:14px;border-top:1px solid var(--hair)">
      Vragen of ideeën? Geef ze door aan je hoofdcoach.<br>Veel succes langs de lijn! ⚽
    </p>
  </div>`;
}

function koppelTeamTab(v, tab){
  if (tab === 'stats'){
    v.querySelectorAll('[data-statsmodus]').forEach(b => b.onclick = () => {
      S.statsSubTab = b.dataset.statsmodus; renderTeam();
    });
  }
  if (tab === 'planning'){
    const eigenBtn = v.querySelector('#planEigenDag');
    if (eigenBtn) eigenBtn.onclick = () => modalEigenDag();
    v.querySelectorAll('[data-planfilter]').forEach(b => b.onclick = () => {
      S._planningFilter = b.dataset.planfilter; renderTeam();
    });
    v.querySelectorAll('[data-planmaand]').forEach(b => b.onclick = () => {
      const ym = b.dataset.planmaand;
      if (S._planningDichteMaanden.has(ym)) S._planningDichteMaanden.delete(ym);
      else S._planningDichteMaanden.add(ym);
      renderTeam();
    });
    v.querySelectorAll('[data-plandag]').forEach(b => b.onclick = () => {
      const datum = b.dataset.plandag;
      const bron = b.dataset.planbron;
      if (bron === 'wedstrijd'){
        const wid = b.dataset.plandoc;
        if (wid) openWedstrijd(wid);
        return;
      }
      const it = planningItems().find(x => x.datum === datum && x.bron === bron);
      if (it) modalPlanDag(it);
    });
  }
  if (tab === 'trainingen'){
    // ASV-kompas: handmatig bladeren door de tips (blijft lokaal, reset bij heropenen tab)
    v.querySelectorAll('[data-kompas]').forEach(b => b.onclick = () => {
      const huidig = S._kompasIdx ?? kompasIndexVoorWeek();
      const totaal = KOMPAS_TIPS.length;
      S._kompasIdx = b.dataset.kompas === 'volgende'
        ? (huidig + 1) % totaal
        : (huidig - 1 + totaal) % totaal;
      renderTeam();
    });
    // afgelasting doorsturen naar eigen teamgroep
    const afgDeel = v.querySelector('#afgelastDeel');
    if (afgDeel) afgDeel.onclick = () => {
      const a = afgelastGeldig();
      if (!a) return;
      const tekst = encodeURIComponent(afgelastWhatsappTekst(a));
      window.open('https://wa.me/?text=' + tekst, '_blank');
    };
    v.querySelectorAll('[data-open-training]').forEach(r => r.onclick = async () => {
      const id = r.dataset.openTraining;
      window.open(r.dataset.url, '_blank');
      if (!S.trainingenGelezen[id]){
        try { await setDoc(doc(db,'gebruikers',S.user.uid,'gelezen',id), {tijd: serverTimestamp()}); } catch(e){}
      }
    });
    const pv = v.querySelector('#presentieVandaag');
    if (pv) pv.onclick = () => modalPresentie();
    v.querySelectorAll('[data-presentie]').forEach(r => r.onclick = () => {
      const p = S.presentie.find(x => x.id === r.dataset.presentie);
      if (p) modalPresentie(p);
    });
    // maand in-/uitklappen (presentie)
    v.querySelectorAll('[data-maand]').forEach(b => b.onclick = () => {
      const ym = b.dataset.maand;
      if (S._presentieOpen.has(ym)){ S._presentieOpen.delete(ym); S._presentieToonAlles.delete(ym); }
      else S._presentieOpen.add(ym);
      renderTeam();
    });
    // alle trainingen van een maand tonen (presentie)
    v.querySelectorAll('[data-toonmeer]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      S._presentieToonAlles.add(b.dataset.toonmeer);
      renderTeam();
    });
    // maand in-/uitklappen (PDF-trainingen)
    v.querySelectorAll('[data-pdfmaand]').forEach(b => b.onclick = () => {
      const ym = b.dataset.pdfmaand;
      const pijlOpen = b.querySelector('.maand-pijl').classList.contains('open');
      // bepaal of dit de standaard-open (nieuwste) maand is aan de huidige pijlstand
      if (pijlOpen){
        // nu open → dichtklappen
        S._pdfDicht.add(ym);              // voor standaard-open maand
        S._pdfDicht.delete('open:'+ym);   // voor handmatig geopende maand
        S._pdfToonAlles.delete(ym);
      } else {
        // nu dicht → openklappen
        S._pdfDicht.delete(ym);           // standaard-open maand weer open
        S._pdfDicht.add('open:'+ym);      // andere maand expliciet open
      }
      renderTeam();
    });
    // alle PDF-trainingen van een maand tonen
    v.querySelectorAll('[data-pdftoonmeer]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      S._pdfToonAlles.add(b.dataset.pdftoonmeer);
      renderTeam();
    });
    return;
  }
  if (tab === 'videos'){
    v.querySelectorAll('[data-open-video]').forEach(r => r.onclick = () => {
      window.open(r.dataset.openVideo, '_blank');
    });
    return;
  }
  if (tab === 'wedstrijden'){
    v.querySelector('#nieuweWedstrijd').onclick = modalNieuweWedstrijd;
    v.querySelectorAll('[data-open-w]').forEach(b => b.onclick = () => openWedstrijd(b.dataset.openW));
  }
  if (tab === 'spelers' && S._leenProfiel){
    // --- read-only leen-profiel ---
    const t = v.querySelector('#leenTerug');
    if (t) t.onclick = () => history.back();
  }
  else if (tab === 'spelers' && S._beoordeelProfiel){
    // --- profielscherm ---
    v.querySelector('#profielTerug').onclick = () => history.back();
    v.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { S._profielTab = b.dataset.ptab; renderTeam(); });
    v.querySelectorAll('[data-snel-speler]').forEach(b => b.onclick = () => modalSnelBeoordeling(b.dataset.snelSpeler));
    v.querySelectorAll('[data-volledig-speler]').forEach(b => b.onclick = () => modalVolledigeBeoordeling(b.dataset.volledigSpeler));
    v.querySelectorAll('[data-bewerk-speler]').forEach(b => b.onclick = () => modalSpeler(speler(b.dataset.bewerkSpeler)));
    v.querySelectorAll('[data-uitleen-speler]').forEach(b => b.onclick = () => modalUitlenen(b.dataset.uitleenSpeler));
    v.querySelectorAll('[data-uitleen-intrek]').forEach(b => b.onclick = () => trekUitleningIn(b.dataset.uitleenIntrek));
    v.querySelectorAll('[data-weg-speler]').forEach(b => b.onclick = async () => {
      const p = speler(b.dataset.wegSpeler);
      if (p && confirm(`${p.naam} verwijderen uit de selectie? Beoordelingen en leerpunten gaan ook verloren.`)){
        await deleteDoc(doc(db,'teams',S.teamId,'spelers',p.id));
        S._beoordeelProfiel = null; renderTeam();
      }
    });
    v.querySelectorAll('[data-lp-nieuw]').forEach(b => b.onclick = () => modalLeerpunt(b.dataset.lpNieuw));
    v.querySelectorAll('[data-lp-toggle]').forEach(b => b.onclick = () => toggleLeerpunt(b.dataset.lpToggle));
    v.querySelectorAll('[data-lp-weg]').forEach(b => b.onclick = () => verwijderLeerpunt(b.dataset.lpWeg));
    v.querySelectorAll('[data-open-beoordeling]').forEach(b => b.onclick = () => {
      const bo = S.beoordelingen.find(x => x.id === b.dataset.openBeoordeling);
      if (bo?.soort === 'volledig') modalVolledigeBeoordeling(bo.spelerId, bo);
      else if (bo) modalSnelBeoordeling(bo.spelerId, bo);
    });
  }
  else if (tab === 'spelers'){
    v.querySelector('#nieuweSpeler').onclick = () => modalSpeler();
    v.querySelectorAll('[data-open-profiel]').forEach(b => b.onclick = () => {
      S._beoordeelProfiel = b.dataset.openProfiel; S._profielTab = 'overzicht'; renderTeam();
    });
    v.querySelectorAll('[data-open-leen]').forEach(b => b.onclick = () => {
      S._leenProfiel = b.dataset.openLeen; renderTeam();
    });
    v.querySelectorAll('#spelersModus [data-modus]').forEach(b => b.onclick = () => {
      if (b.dataset.modus === 'snel') startSnelRonde();
    });
  }
  if (tab === 'instellingen'){
    v.querySelector('#deelCode').onclick = async () => {
      try { await navigator.clipboard.writeText(S.team.code); meld('Code gekopieerd'); }
      catch { meld('Code: ' + S.team.code); }
    };
    v.querySelector('#deelLink').onclick = () => modalUitnodig(S.team);
    v.querySelector('#wijzigCode').onclick = () => modalWijzigCode();
    v.querySelector('#wijzigMijnNaam').onclick = () => modalMijnNaam();
    v.querySelector('#iNaamOk').onclick = async () => {
      const naam = $('#iTeamNaam').value.trim();
      if (!naam) return meld('Geef het team een naam');
      const codeMee = $('#iCodeVolgtNaam').checked;
      const knop = $('#iNaamOk');
      knop.disabled = true; knop.textContent = 'Opslaan...';
      const data = {naam};
      try {
        if (codeMee){
          const afk = S.team.clubNaam ? clubAfkorting(S.team.clubNaam) : '';
          // bestaande codes ophalen om botsing te vermijden (eigen code uitgezonderd)
          let bestaande = [];
          try {
            const snap = await getDocs(collection(db,'teams'));
            bestaande = snap.docs.map(d => d.data().code).filter(c => c && c !== S.team.code);
          } catch(e){ /* lukt het lezen niet, dan toch proberen met lokale kennis */
            bestaande = S.teams.map(t => t.code).filter(c => c && c !== S.team.code);
          }
          data.code = teamCode(naam, afk, bestaande);
        }
        await updateDoc(doc(db,'teams',S.teamId), data);
        meld(codeMee ? `Naam opgeslagen · code is nu ${data.code}` : 'Naam opgeslagen');
      } catch(e){
        meld('Opslaan mislukt: ' + (e.code || e.message));
      } finally {
        knop.disabled = false; knop.textContent = 'Naam opslaan';
      }
    };
    v.querySelectorAll('[data-lid-weg]').forEach(b => b.onclick = async () => {
      const uid = b.dataset.lidWeg;
      const naam = b.dataset.lidNaam;
      if (!confirm(`${naam} verwijderen als coach van dit team? Deze persoon heeft daarna geen toegang meer.`)) return;
      await updateDoc(doc(db,'teams',S.teamId), {
        ['leden.'+uid]: deleteField(),
        ['ledenInfo.'+uid]: deleteField(),
      });
      meld(naam + ' verwijderd');
    });
    v.querySelector('#iCategorie').onchange = async e => {
      const cat = e.target.value;
      const data = cat ? {categorie: cat, format: catInfo(cat).format} : {categorie: null};
      await updateDoc(doc(db,'teams',S.teamId), data);
      meld(cat ? cat + ' ingesteld' : 'Categorie verwijderd');
    };
    v.querySelector('#verlaatTeam').onclick = async () => {
      if (!confirm('Weet je zeker dat je dit team wilt verlaten?')) return;
      await updateDoc(doc(db,'teams',S.teamId), {
        ['leden.'+S.user.uid]: deleteField(),
        ['ledenInfo.'+S.user.uid]: deleteField(),
      });
      verlaatTeamView();
    };
  }
  if (tab === 'help'){
    const inp = v.querySelector('#helpZoek');
    const wis = v.querySelector('#helpZoekWis');
    const geen = v.querySelector('#helpGeen');
    const geenTerm = v.querySelector('#helpGeenTerm');
    const secties = [...v.querySelectorAll('.hl-sec')];
    const hoofdstukken = [...v.querySelectorAll('.hl-hoofdstuk')];
    const pasToe = () => {
      const term = (S._helpZoek || '').trim().toLowerCase();
      let raak = 0;
      for (const s of secties){
        const treffer = !term || (s.dataset.zoek || '').includes(term);
        s.hidden = !treffer;
        if (treffer) raak++;
      }
      // een hoofdstukkopje verbergen zodra geen van de secties erna (tot het
      // volgende kopje) nog zichtbaar is
      hoofdstukken.forEach(h => {
        let el = h.nextElementSibling, zichtbaar = false;
        while (el && !el.classList.contains('hl-hoofdstuk')){
          if (el.classList.contains('hl-sec') && !el.hidden){ zichtbaar = true; break; }
          el = el.nextElementSibling;
        }
        h.hidden = !zichtbaar;
      });
      if (wis) wis.hidden = !term;
      if (geen){
        geen.hidden = !(term && raak === 0);
        if (geenTerm) geenTerm.textContent = term;
      }
    };
    if (inp){
      inp.value = S._helpZoek || '';          // herstel na re-render
      inp.oninput = () => { S._helpZoek = inp.value; pasToe(); };
    }
    if (wis) wis.onclick = () => {
      S._helpZoek = '';
      if (inp){ inp.value = ''; inp.focus(); }
      pasToe();
    };
    pasToe();                                  // pas direct toe (ook bij herstelde term)
    v.querySelectorAll('[data-hlh]').forEach(b => b.onclick = () => {
      // eerst een eventuele zoekterm wissen, anders kan het hoofdstuk verborgen zijn
      if (S._helpZoek){ S._helpZoek = ''; if (inp) inp.value = ''; pasToe(); }
      v.querySelector('#hlh-'+b.dataset.hlh)?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }
  bewaakTerug();
}

/* ==================== BEOORDELING — ACTIES & MODALS ==================== */

/* gemeenschappelijke bron-opties: laatste wedstrijden + trainingen + los */
function bronOpties(){
  const opts = [];
  for (const w of S.wedstrijden.slice(0, 8)){
    const tit = w.type === 'toernooi' ? '🏆 '+(w.tegenstander||'Toernooi')
      : (w.thuis ? S.team.naam+' – '+w.tegenstander : w.tegenstander+' – '+S.team.naam);
    opts.push({type:'wedstrijd', id:w.id, datum:w.datum, label:tit});
  }
  for (const t of (S.presentie||[]).slice(0, 8)){
    opts.push({type:'training', id:t.id, datum:t.datum, label:'Training '+datumNL(t.datum)});
  }
  opts.sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
  return opts;
}

function vandaagISO(){ return new Date().toISOString().slice(0,10); }
function deelnemer(){ return {uid:S.user.uid, naam:(S.team.ledenInfo?.[S.user.uid]?.naam)||S.user.displayName||S.user.email||''}; }

/* --- Snelle beoordeling (één speler) --- */
function modalSnelBeoordeling(spelerId, bestaande = null){
  const p = speler(spelerId); if (!p) return;
  const opts = bronOpties();
  let gekozenNiveau = bestaande?.niveau || 0;
  let gekozenTags = new Set(bestaande?.tags || []);
  // standaard bron: bestaande bron, anders meest recente wedstrijd/training, anders los
  let bronType = bestaande?.bron?.type || (opts[0]?.type || 'los');
  let bronId   = bestaande?.bron?.id   || (opts[0]?.id || '');

  const bronSelect = () => {
    const lijst = opts.filter(o => o.type === bronType);
    return lijst.length
      ? `<select class="invoer" id="mSnBron">${lijst.map(o =>
          `<option value="${o.id}" ${o.id===bronId?'selected':''}>${esc(o.label)} · ${datumNL(o.datum)}</option>`).join('')}</select>`
      : `<p style="font-size:12.5px;color:var(--ink-2);padding:4px 0">Geen ${bronType==='wedstrijd'?'wedstrijden':'trainingen'} gevonden — kies "Los".</p>`;
  };

  const kleurbalk = () => `<div class="kleurbalk" id="mSnNiveau">${NIVEAUS.slice(1).map(n =>
    `<button data-niv="${n.n}" class="kn${n.n} ${gekozenNiveau===n.n?'gekozen':''}"><span class="lbl">${n.label.toUpperCase()}</span></button>`).join('')}</div>`;

  const tagRij = () => `<div class="tag-rij" id="mSnTags">${SNEL_TAGS.map(t =>
    `<button class="tag ${gekozenTags.has(t.id)?'aan':''}" data-tag="${t.id}">${t.emoji} ${t.label}</button>`).join('')}</div>`;

  openModal(`
    <h2>Snel beoordelen</h2>
    <div class="snel-kop">
      <div class="mini-shirt">${esc(p.nummer ?? '·')}</div>
      <div><div class="nm">${esc(p.naam)}</div><div class="pos" id="mSnPos"></div></div>
    </div>

    <div class="veldlabel">Koppelen aan</div>
    <div class="segment klein-seg" id="mSnBronType">
      <button data-bt="wedstrijd" class="${bronType==='wedstrijd'?'actief':''}">Wedstrijd</button>
      <button data-bt="training" class="${bronType==='training'?'actief':''}">Training</button>
      <button data-bt="los" class="${bronType==='los'?'actief':''}">Los</button>
    </div>
    <div id="mSnBronWrap" style="margin-bottom:4px">${bronType==='los'?'':bronSelect()}</div>

    <div class="veldlabel">Hoe ging het?</div>
    ${kleurbalk()}

    <div class="veldlabel">Opvallend (optioneel)</div>
    ${tagRij()}

    <div class="veldlabel">Korte notitie (optioneel)</div>
    <textarea class="invoer" id="mSnNotitie" rows="2" placeholder="Bijv. durfde aan de bal te komen...">${esc(bestaande?.notities?.algemeen||'')}</textarea>

    <button class="knop vol fluo" id="mSnOk" style="margin-top:12px">${bestaande?'Bijwerken':'Opslaan'}</button>
    ${S._snelRonde ? `<button class="knop licht vol" id="mSnSkip" style="margin-top:8px">Speler overslaan (niet aanwezig) →</button>` : ''}
    ${bestaande?`<button class="knop vol gevaar" id="mSnWeg" style="margin-top:8px">Verwijderen</button>`:''}`);

  const updatePos = () => {
    const o = opts.find(x => x.id === bronId && x.type === bronType);
    $('#mSnPos').textContent = bronType==='los' ? 'Losse beoordeling' : (o ? o.label : '');
  };
  const koppelBron = () => {
    $('#mSnBronWrap').innerHTML = bronType==='los' ? '' : bronSelect();
    const sel = $('#mSnBron');
    if (sel){ bronId = sel.value; sel.onchange = () => { bronId = sel.value; updatePos(); }; }
    else bronId = '';
    updatePos();
  };
  $$('#mSnBronType [data-bt]').forEach(b => b.onclick = () => {
    bronType = b.dataset.bt;
    $$('#mSnBronType [data-bt]').forEach(x => x.classList.toggle('actief', x===b));
    koppelBron();
  });
  $$('#mSnNiveau [data-niv]').forEach(b => b.onclick = () => {
    gekozenNiveau = Number(b.dataset.niv);
    $$('#mSnNiveau [data-niv]').forEach(x => x.classList.toggle('gekozen', x===b));
  });
  $$('#mSnTags [data-tag]').forEach(b => b.onclick = () => {
    const id = b.dataset.tag;
    if (gekozenTags.has(id)) gekozenTags.delete(id); else gekozenTags.add(id);
    b.classList.toggle('aan');
  });
  koppelBron();

  $('#mSnOk').onclick = async () => {
    if (!gekozenNiveau) return meld('Kies een niveau');
    const o = opts.find(x => x.id === bronId && x.type === bronType);
    const bron = bronType==='los' ? {type:'los'} : (o ? {type:bronType, id:o.id, label:o.label} : {type:'los'});
    const datum = o?.datum || vandaagISO();
    const data = {
      soort:'snel', spelerId, datum, bron, niveau:gekozenNiveau,
      tags:[...gekozenTags], notities:{algemeen:$('#mSnNotitie').value.trim()},
      door:deelnemer(), gemaaktMs:Date.now(),
    };
    try {
      if (bestaande) await updateDoc(doc(db,'teams',S.teamId,'beoordelingen',bestaande.id), data);
      else await addDoc(collection(db,'teams',S.teamId,'beoordelingen'), data);
      sluitModal();
      if (S._snelRonde) volgendeSnelRonde(); else { renderTeam(); meld(p.naam+' beoordeeld'); }
    } catch(e){ meld('Opslaan mislukt: '+(e.code||e.message)); }
  };
  const wegBtn = $('#mSnWeg');
  if (wegBtn) wegBtn.onclick = async () => {
    if (!confirm('Deze beoordeling verwijderen?')) return;
    await deleteDoc(doc(db,'teams',S.teamId,'beoordelingen',bestaande.id));
    sluitModal(); renderTeam();
  };
  const skipBtn = $('#mSnSkip');
  if (skipBtn) skipBtn.onclick = () => { sluitModal(); volgendeSnelRonde(); };
}

/* ==================== TEAMEVALUATIE (na de wedstrijd) ====================
   Team-niveau tegenhanger van de speler-beoordeling hierboven: één keer per
   wedstrijd, 8 categorieën op de vertrouwde kleurbalk-schaal, plus tags en
   twee optionele toelichtingen. Wordt geopend vanaf het wedstrijdscherm
   (wedstrijd.js, via een dynamische import om een circulaire import met
   teams.js te vermijden — zelfde patroon als elders in de app). */
export function modalTeamEvaluatie(wedstrijdId){
  const w = S.wedstrijden.find(x => x.id === wedstrijdId);
  if (!w) return meld('Kon de wedstrijd niet vinden — probeer de pagina te verversen');
  const bestaande = S.teamEvaluaties.find(e => e.wedstrijdId === wedstrijdId) || null;
  const scores = {...(bestaande?.scores || {})};
  let gekozenTags = new Set(bestaande?.tags || []);

  const kleurbalk = (catId) => `<div class="kleurbalk" data-cat="${catId}">${NIVEAUS.slice(1).map(n =>
    `<button data-niv="${n.n}" class="kn${n.n} ${scores[catId]===n.n?'gekozen':''}"><span class="lbl">${n.label.toUpperCase()}</span></button>`).join('')}</div>`;

  openModal(`
    <h2>${bestaande?'Team-evaluatie bijwerken':'Team evalueren'}</h2>
    <div class="snel-kop">
      <div class="mini-shirt">⚽</div>
      <div><div class="nm">${esc(S.team.naam)} – ${esc(w.tegenstander)}</div>
        <div class="pos">${datumNL(w.datum)}${w.thuis!=null?(w.thuis?' · Thuis':' · Uit'):''}</div></div>
    </div>
    ${TEAM_CATEGORIEEN.map(c => `<div class="veldlabel">${esc(c.naam)}</div>${kleurbalk(c.id)}`).join('')}

    <div class="veldlabel">Opvallend (optioneel)</div>
    <div class="tag-rij" id="mTeTags">${TEAM_TAGS.map(t =>
      `<button class="tag ${gekozenTags.has(t.id)?'aan':''}" data-tag="${t.id}">${t.emoji} ${t.label}</button>`).join('')}</div>

    <div class="veldlabel">Wat ging het beste? (optioneel)</div>
    <textarea class="invoer" id="mTeGoed" rows="2" placeholder="Bijv. de druk vooraan zorgde voor balwinst hoog op het veld">${esc(bestaande?.notitieGoed||'')}</textarea>

    <div class="veldlabel">Aandachtspunt voor volgende training? (optioneel)</div>
    <textarea class="invoer" id="mTeAandacht" rows="2" placeholder="Bijv. rustiger opbouwen vanuit de verdediging">${esc(bestaande?.notitieAandacht||'')}</textarea>

    <button class="knop vol fluo" id="mTeOk" style="margin-top:12px">${bestaande?'Bijwerken':'Opslaan'}</button>
    ${bestaande?`<button class="knop vol gevaar" id="mTeWeg" style="margin-top:8px">Verwijderen</button>`:''}`);

  $$('.kleurbalk[data-cat] [data-niv]').forEach(b => b.onclick = () => {
    const wrap = b.closest('.kleurbalk'); const catId = wrap.dataset.cat;
    scores[catId] = Number(b.dataset.niv);
    wrap.querySelectorAll('[data-niv]').forEach(x => x.classList.toggle('gekozen', x===b));
  });
  $$('#mTeTags [data-tag]').forEach(b => b.onclick = () => {
    const id = b.dataset.tag;
    if (gekozenTags.has(id)) gekozenTags.delete(id); else gekozenTags.add(id);
    b.classList.toggle('aan');
  });

  $('#mTeOk').onclick = async () => {
    if (Object.keys(scores).length < TEAM_CATEGORIEEN.length) return meld('Vul alle categorieën in');
    const data = {
      wedstrijdId, tegenstander:w.tegenstander, datum:w.datum, scores,
      tags:[...gekozenTags],
      notitieGoed:$('#mTeGoed').value.trim(), notitieAandacht:$('#mTeAandacht').value.trim(),
      door:deelnemer(), gemaaktMs:Date.now(),
    };
    try {
      if (bestaande) await updateDoc(doc(db,'teams',S.teamId,'teamevaluaties',bestaande.id), data);
      else await addDoc(collection(db,'teams',S.teamId,'teamevaluaties'), data);
      sluitModal(); meld('Teamevaluatie opgeslagen');
    } catch(e){ meld('Opslaan mislukt: '+(e.code||e.message)); }
  };
  const wegBtn = $('#mTeWeg');
  if (wegBtn) wegBtn.onclick = async () => {
    if (!confirm('Deze teamevaluatie verwijderen?')) return;
    await deleteDoc(doc(db,'teams',S.teamId,'teamevaluaties',bestaande.id));
    sluitModal();
  };
}

/* --- Dashboard-berekeningen --- */
function teamEvalGemiddelde(ev){
  const vals = TEAM_CATEGORIEEN.map(c => ev.scores?.[c.id]).filter(Boolean);
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
}
function teamEvalLaagsteCategorie(ev){
  let laagste = null;
  for (const c of TEAM_CATEGORIEEN){
    const s = ev.scores?.[c.id]; if (!s) continue;
    if (!laagste || s < laagste.score) laagste = {id:c.id, score:s};
  }
  return laagste;
}

function htmlTeamEvaluatieDashboard(){
  const evals = S.teamEvaluaties; // oud → nieuw
  if (!evals.length){
    return `<div class="kaart leeg">Nog geen teamevaluaties.<br>Vul na de eerstvolgende wedstrijd "Team evalueren" in op het wedstrijdscherm — daarna verschijnt hier de groeicurve.</div>`;
  }
  const laatste = evals[evals.length-1];
  const vorige = evals.length > 1 ? evals[evals.length-2] : null;
  const gemLaatste = teamEvalGemiddelde(laatste);
  const gemVorige = vorige ? teamEvalGemiddelde(vorige) : null;
  const verschil = gemVorige != null ? gemLaatste - gemVorige : null;

  // --- SVG-groeicurve: teamontwikkelscore per evaluatie ---
  const laatste8 = evals.slice(-8);
  const W = 300, H = 90, pad = 14;
  const punten = laatste8.map((ev,i) => {
    const x = laatste8.length > 1 ? pad + (i/(laatste8.length-1)) * (W-2*pad) : W/2;
    const g = teamEvalGemiddelde(ev);
    const y = H - pad - ((g-1)/4) * (H-2*pad); // schaal 1..5 -> boven/onder
    return {x, y};
  });
  const lijnPad = punten.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const laatstePunt = punten[punten.length-1];

  // --- categorieën: gemiddelde + trend over de laatste 5 evaluaties ---
  const laatste5 = evals.slice(-5);
  const vorige5  = evals.slice(-10,-5);
  const catGemiddelde = (lijst, catId) => {
    const vals = lijst.map(e => e.scores?.[catId]).filter(Boolean);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  };
  const catRijen = TEAM_CATEGORIEEN.map(c => {
    const nu = catGemiddelde(laatste5, c.id);
    const was = catGemiddelde(vorige5, c.id);
    const trend = (nu==null || was==null) ? '→' : (nu - was > 0.15 ? '↗' : nu - was < -0.15 ? '↘' : '→');
    const kleur = nu==null ? 'var(--surface-2)' : nu>=4.5?'var(--n5)':nu>=3.5?'var(--n4)':nu>=2.5?'var(--n3)':nu>=1.5?'var(--n2)':'var(--n1)';
    return {naam:c.naam, nu, trend, kleur};
  });

  // --- terugkerende aandachtspunten: welke categorie is het vaakst de laagste, laatste 4 evaluaties ---
  const laatste4 = evals.slice(-4);
  const laagsteTellingen = {};
  for (const ev of laatste4){
    const l = teamEvalLaagsteCategorie(ev); if (!l) continue;
    laagsteTellingen[l.id] = (laagsteTellingen[l.id]||0) + 1;
  }
  const signalen = Object.entries(laagsteTellingen)
    .filter(([,n]) => n >= 2)
    .sort((a,b) => b[1]-a[1])
    .map(([catId,n]) => ({cat:teamCategorie(catId), n}));
  // groeiers: categorie die het sterkst is gestegen (laatste 5 t.o.v. de 5 daarvoor)
  const groeiers = catRijen.filter(c => c.trend === '↗').sort((a,b) => (b.nu||0)-(a.nu||0)).slice(0,1);

  // --- advies: zwakste categorie van de laatste evaluatie(s), gekoppeld aan leercurve-thema indien aanwezig ---
  const adviesCat = signalen[0]?.cat || teamCategorie(teamEvalLaagsteCategorie(laatste)?.id);

  return `
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">📈 Groeicurve</div>
      <div style="margin:4px 0 2px">
        <span style="font-family:'Barlow Condensed';font-weight:700;font-size:30px">${gemLaatste.toFixed(1).replace('.',',')}</span><span style="font-size:13px;color:var(--ink-2)"> / 5</span>
        <div style="font-size:12px;color:var(--ink-2);margin-bottom:8px">Laatste wedstrijd (${esc(laatste.tegenstander)}, ${datumNL(laatste.datum)})${verschil!=null?` · <span style="color:${verschil>=0?'var(--ok)':'var(--warn)'};font-weight:700">${verschil>=0?'↑':'↓'} ${Math.abs(verschil).toFixed(1).replace('.',',')} t.o.v. vorige</span>`:''}</div>
      </div>
      ${punten.length > 1 ? `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:90px">
        <polyline points="${lijnPad}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${laatstePunt.x}" cy="${laatstePunt.y}" r="4.5" fill="var(--accent)"/>
        <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--line-d)" stroke-width="1"/>
      </svg>` : `<p style="font-size:12.5px;color:var(--ink-2)">Nog minstens 2 evaluaties nodig voor een lijn.</p>`}
    </div>

    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Categorieën · laatste ${Math.min(5,evals.length)} wedstrijden</div>
      ${catRijen.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--hair)">
          <span style="flex:1;font-size:13px;font-weight:600">${esc(c.naam)}</span>
          <span style="width:80px;height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden;flex-shrink:0">
            <span style="display:block;height:100%;border-radius:4px;width:${c.nu?Math.round((c.nu/5)*100):0}%;background:${c.kleur}"></span>
          </span>
          <span style="width:34px;text-align:right;font-family:'Barlow Condensed';font-weight:700;font-size:15px">${c.nu?c.nu.toFixed(1).replace('.',','):'—'}</span>
          <span style="width:16px;text-align:center;font-size:12px;color:${c.trend==='↘'?'var(--warn)':'var(--ink-2)'}">${c.trend}</span>
        </div>`).join('')}
    </div>

    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">⚠️ Terugkerende aandachtspunten</div>
      ${signalen.length ? signalen.map(s => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--hair)">
          <div style="width:9px;height:9px;border-radius:50%;background:var(--warn);flex-shrink:0;margin-top:5px"></div>
          <div><div style="font-weight:600;font-size:13.5px">${esc(s.cat.naam)}</div>
            <div style="font-size:12px;color:var(--ink-2);margin-top:1px">Laagst scorende onderdeel in ${s.n} van de laatste ${laatste4.length} wedstrijden.</div></div>
        </div>`).join('') : ''}
      ${groeiers.length && groeiers[0].nu ? `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;${signalen.length?'':''}">
          <div style="width:9px;height:9px;border-radius:50%;background:var(--ok);flex-shrink:0;margin-top:5px"></div>
          <div><div style="font-weight:600;font-size:13.5px">${esc(groeiers[0].naam)}</div>
            <div style="font-size:12px;color:var(--ink-2);margin-top:1px">Positieve trend de laatste wedstrijden.</div></div>
        </div>` : ''}
      ${(!signalen.length && !groeiers.length) ? `<p style="font-size:12.5px;color:var(--ink-2)">Nog geen duidelijk patroon — na een paar evaluaties verschijnen hier terugkerende punten.</p>` : ''}
    </div>

    ${adviesCat ? `
    <div class="kaart" style="background:linear-gradient(150deg,var(--accent),var(--grass-2));border:none">
      <div style="color:rgba(255,255,255,.85);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">💡 Voorgesteld trainingsthema</div>
      <div style="color:#fff;font-family:'Barlow Condensed';font-weight:700;font-size:19px;text-transform:uppercase;margin-bottom:4px">${esc(adviesCat.leercurve || adviesCat.naam)}</div>
      <div style="color:rgba(255,255,255,.9);font-size:12.5px;line-height:1.5">${adviesCat.leercurve
        ? `Leercurve-thema uit het jeugdbeleidsplan (§3.3) — sluit direct aan op "${esc(adviesCat.naam)}", het onderdeel dat nu aandacht vraagt.`
        : `"${esc(adviesCat.naam)}" vraagt nu de meeste aandacht — geen apart leercurve-thema, wel een mooi gespreksonderwerp voor de volgende training.`}</div>
    </div>` : ''}`;
}

function htmlStatsTab(){
  const modus = S.statsSubTab || 'spelers';
  return `
    <div class="segment" id="statsModus" style="margin-bottom:14px">
      <button data-statsmodus="spelers" class="${modus==='spelers'?'actief':''}">Spelers</button>
      <button data-statsmodus="evaluatie" class="${modus==='evaluatie'?'actief':''}">📈 Teamevaluatie</button>
    </div>
    ${modus==='spelers' ? htmlStats() : htmlTeamEvaluatieDashboard()}`;
}

function startSnelRonde(){
  if (!S.spelers.length) return meld('Voeg eerst spelers toe');
  S._snelRonde = {index:0, ids:S.spelers.map(p => p.id)};
  modalSnelBeoordeling(S._snelRonde.ids[0]);
}
function volgendeSnelRonde(){
  const r = S._snelRonde; if (!r) return;
  r.index++;
  if (r.index >= r.ids.length){ S._snelRonde = null; renderTeam(); meld('Ronde klaar ✓'); return; }
  modalSnelBeoordeling(r.ids[r.index]);
}

/* --- Volledige beoordeling (5 ontwikkeldomeinen) --- */
function modalVolledigeBeoordeling(spelerId, bestaande = null){
  const p = speler(spelerId); if (!p) return;
  const scores = {...(bestaande?.scores || {})};
  const notities = {...(bestaande?.notities || {})};
  const moment = bestaande?.bron?.label || '';

  const domeinKaart = (d) => `
    <div class="kaart">
      <div class="veldlabel" style="margin-top:0">${d.id} · ${d.naam}</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin:-2px 0 4px">${esc(d.omschrijving)}</p>
      <div class="kleurbalk dom" data-dom="${d.id}">${NIVEAUS.slice(1).map(n =>
        `<button data-niv="${n.n}" class="kn${n.n} ${scores[d.id]===n.n?'gekozen':''}"><span class="lbl">${n.kort}</span></button>`).join('')}</div>
      <textarea class="invoer" data-not="${d.id}" rows="2" placeholder="Toelichting ${d.naam.toLowerCase()}...">${esc(notities[d.id]||'')}</textarea>
    </div>`;

  openModal(`
    <h2>Volledige beoordeling</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:10px">${esc(p.naam)}${p.nummer!=null&&p.nummer!==''?' · #'+esc(p.nummer):''}</p>
    <div class="veldgroep"><label>Moment</label>
      <input class="invoer" id="mVbMoment" value="${esc(moment)}" placeholder="Bijv. Kwartaalmeting Q3"></div>
    ${SKILLS.map(domeinKaart).join('')}
    <button class="knop vol fluo" id="mVbOk" style="margin-top:6px">${bestaande?'Bijwerken':'Beoordeling opslaan'}</button>
    ${bestaande?`<button class="knop vol gevaar" id="mVbWeg" style="margin-top:8px">Verwijderen</button>`:''}
    <p style="font-size:11.5px;color:var(--ink-2);margin-top:10px;line-height:1.45">Tip: leerpunten beheer je in het tabblad <b>Leerlijn</b> van de speler — die lopen door over meerdere beoordelingen.</p>`);

  $$('.kleurbalk.dom').forEach(balk => {
    const dom = balk.dataset.dom;
    balk.querySelectorAll('[data-niv]').forEach(b => b.onclick = () => {
      scores[dom] = Number(b.dataset.niv);
      balk.querySelectorAll('[data-niv]').forEach(x => x.classList.toggle('gekozen', x===b));
    });
  });

  $('#mVbOk').onclick = async () => {
    if (!Object.keys(scores).length) return meld('Geef minstens één score');
    SKILLS.forEach(d => { const t = $(`[data-not="${d.id}"]`); if (t) notities[d.id] = t.value.trim(); });
    const data = {
      soort:'volledig', spelerId, datum:bestaande?.datum || vandaagISO(),
      bron:{type:'los', label:$('#mVbMoment').value.trim() || 'Periodieke meting'},
      scores, notities, door:deelnemer(), gemaaktMs:Date.now(),
    };
    try {
      if (bestaande) await updateDoc(doc(db,'teams',S.teamId,'beoordelingen',bestaande.id), data);
      else await addDoc(collection(db,'teams',S.teamId,'beoordelingen'), data);
      sluitModal(); renderTeam(); meld('Beoordeling opgeslagen');
    } catch(e){ meld('Opslaan mislukt: '+(e.code||e.message)); }
  };
  const wegBtn = $('#mVbWeg');
  if (wegBtn) wegBtn.onclick = async () => {
    if (!confirm('Deze beoordeling verwijderen?')) return;
    await deleteDoc(doc(db,'teams',S.teamId,'beoordelingen',bestaande.id));
    sluitModal(); renderTeam();
  };
}

/* --- Leerpunten (array op spelerdoc) --- */
function modalLeerpunt(spelerId){
  const p = speler(spelerId); if (!p) return;
  const cat = S.team.categorie || '';
  let domein = 'TA';
  // leercurve: relevante thema's eerst, daarna de overige (altijd zichtbaar)
  const themas = LEERCURVE
    .map(t => ({...t, rel: leercurveRelevant(t, cat)}))
    .sort((a,b) => (b.rel?1:0)-(a.rel?1:0));

  openModal(`
    <h2>Leerpunt toevoegen</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:10px">Formuleer een concreet, observeerbaar doel voor ${esc(p.naam)}. Kies een thema uit de leerlijn of schrijf je eigen leerpunt.</p>

    <div class="veldlabel">Uit de leerlijn${cat?` · ${esc(cat)}`:''}</div>
    <div class="leercurve-keuze" id="mLpCurve">
      ${themas.map(t => {
        const d = skillDomein(t.domein);
        return `<button class="lc-thema ${t.rel?'rel':''}" data-thema="${esc(t.thema)}" data-dom="${t.domein}" title="${esc(d?.naam||'')}${t.rel?'':' · vanaf O'+t.vanaf}">
          <span class="lc-dot" style="background:${t.rel?'var(--n5)':'var(--line-d)'}"></span>${esc(t.thema)}</button>`;
      }).join('')}
    </div>
    <p style="font-size:11px;color:var(--ink-2);margin:2px 0 12px">🟢 = hoort bij deze leeftijd volgens het jeugdbeleidsplan. Overige thema's blijven kiesbaar.</p>

    <div class="veldlabel">Domein</div>
    <div class="segment klein-seg" id="mLpDom">${SKILLS.map(d =>
      `<button data-d="${d.id}" class="${d.id==='TA'?'actief':''}" title="${esc(d.naam)}">${d.id}</button>`).join('')}</div>

    <div class="veldgroep"><label>Leerpunt</label>
      <textarea class="invoer" id="mLpTekst" rows="3" placeholder="Bijv. eerder het hoofd omhoog vóór de aanname"></textarea></div>
    <button class="knop vol fluo" id="mLpOk">Toevoegen</button>`);

  const zetDomein = (d) => { domein = d; $$('#mLpDom [data-d]').forEach(x => x.classList.toggle('actief', x.dataset.d===d)); };
  $$('#mLpDom [data-d]').forEach(b => b.onclick = () => zetDomein(b.dataset.d));
  $$('#mLpCurve [data-thema]').forEach(b => b.onclick = () => {
    $('#mLpTekst').value = b.dataset.thema;
    zetDomein(b.dataset.dom);
    $$('#mLpCurve .lc-thema').forEach(x => x.classList.toggle('gekozen', x===b));
  });
  $('#mLpTekst').focus();
  $('#mLpOk').onclick = async () => {
    const tekst = $('#mLpTekst').value.trim();
    if (tekst.length < 3) return meld('Vul een leerpunt in');
    const nieuw = {id:'lp_'+Date.now().toString(36), domein, tekst, sinds:vandaagISO(), klaar:false};
    const lp = [...(p.leerpunten||[]), nieuw];
    try {
      await updateDoc(doc(db,'teams',S.teamId,'spelers',spelerId), {leerpunten: lp});
      sluitModal(); renderTeam(); meld('Leerpunt toegevoegd');
    } catch(e){ meld('Opslaan mislukt: '+(e.code||e.message)); }
  };
}
async function toggleLeerpunt(lpId){
  const p = speler(S._beoordeelProfiel); if (!p) return;
  const lp = (p.leerpunten||[]).map(l => l.id === lpId
    ? {...l, klaar:!l.klaar, klaarOp: !l.klaar ? vandaagISO() : null} : l);
  await updateDoc(doc(db,'teams',S.teamId,'spelers',p.id), {leerpunten: lp});
}
async function verwijderLeerpunt(lpId){
  const p = speler(S._beoordeelProfiel); if (!p) return;
  if (!confirm('Dit leerpunt verwijderen?')) return;
  const lp = (p.leerpunten||[]).filter(l => l.id !== lpId);
  await updateDoc(doc(db,'teams',S.teamId,'spelers',p.id), {leerpunten: lp});
}

const SPELER_POSITIES = ['Keeper','Verdediger','Middenvelder','Aanvaller'];

function modalSpeler(p){
  const bewerken = !!p;
  let gekozenPositie = p?.positie || '';
  openModal(`
    <h2>${bewerken ? 'Speler bewerken' : 'Speler toevoegen'}</h2>
    <div class="rij">
      <div class="veldgroep" style="flex:3"><label>Voornaam</label>
        <input class="invoer" id="mSpNaam" value="${esc(p?.naam||'')}" placeholder="Voornaam" autocomplete="off"></div>
      <div class="veldgroep" style="flex:1"><label>Nr.</label>
        <input class="invoer" id="mSpNr" value="${esc(p?.nummer ?? '')}" inputmode="numeric" placeholder="7"></div>
    </div>
    <div class="veldgroep"><label>Achternaam</label>
      <input class="invoer" id="mSpAchter" value="${esc(p?.achternaam||'')}" placeholder="Achternaam" autocomplete="off"></div>
    <div class="avg-balk"><span class="slot">🔒</span>
      <span>De achternaam blijft binnen je eigen team en wordt nergens in de app getoond. Leen je deze speler uit, dan ziet de andere coach alleen de voorletter.</span></div>
    ${bewerken ? `
      <div class="veldgroep"><label>Voorkeurspositie</label>
        <div class="segment wrap" id="mSpPos">
          ${SPELER_POSITIES.map(pos => `<button type="button" data-pos="${pos}" class="${gekozenPositie===pos?'actief':''}">${pos}</button>`).join('')}
        </div>
      </div>` : ''}
    <button class="knop vol" id="mSpOk">${bewerken ? 'Opslaan' : 'Toevoegen'}</button>`);

  if (bewerken){
    $('#mSpPos').querySelectorAll('[data-pos]').forEach(b => b.onclick = () => {
      const pos = b.dataset.pos;
      gekozenPositie = (gekozenPositie === pos) ? '' : pos;   // nogmaals tikken = leegmaken (optioneel)
      $('#mSpPos').querySelectorAll('[data-pos]').forEach(x =>
        x.classList.toggle('actief', x.dataset.pos === gekozenPositie));
    });
  }

  const ok = async (sluiten) => {
    const naam = $('#mSpNaam').value.trim();
    if (!naam) return meld('Vul een naam in');
    const nr = $('#mSpNr').value.trim();
    const data = {
      naam,
      achternaam: $('#mSpAchter').value.trim() || null,
      nummer: nr === '' ? null : Number(nr),
    };
    if (bewerken) data.positie = gekozenPositie || null;
    if (p) await updateDoc(doc(db,'teams',S.teamId,'spelers',p.id), data);
    else   await addDoc(collection(db,'teams',S.teamId,'spelers'), data);
    if (sluiten) sluitModal();
    else { $('#mSpNaam').value=''; $('#mSpNr').value=''; $('#mSpAchter').value=''; $('#mSpNaam').focus(); meld(naam+' toegevoegd'); }
  };
  $('#mSpOk').onclick = () => ok(bewerken);
  const enterAdd = e => { if (e.key === 'Enter') ok(false); };
  $('#mSpNaam').addEventListener('keydown', enterAdd);
  $('#mSpAchter').addEventListener('keydown', enterAdd);
}

/* ===================== Uitlenen ===================== *
 * Leen-records leven centraal onder clubs/{clubId}/uitleningen.
 * Een record bevat een afgeschermde momentopname (snapshot) van de speler,
 * zodat de ontvangende coach hem read-only ziet zonder toegang tot het bronteam.
 * Venster: 3 dagen vóór t/m 3 dagen ná de wedstrijddag (vast).
 */
const LEEN_VENSTER_DAGEN = 3;

function isoDatum(d){ return d.toISOString().slice(0,10); }
function plusDagen(isoStr, n){
  const d = new Date(isoStr + 'T12:00'); d.setDate(d.getDate() + n); return isoDatum(d);
}
function vandaagIso(){ return isoDatum(new Date()); }

// Actieve uitlening (binnen venster) voor een speler van het EIGEN team.
function actieveUitleningVoor(spelerId){
  const nu = vandaagIso();
  return (S.uitleningenUit||[]).find(u =>
    u.spelerId === spelerId && u.van <= nu && nu <= u.tot) || null;
}

// Voornaam + voorletter achternaam, bv. "Tim B." — privacy-vriendelijke weergave.
function leenNaam(naam, achternaam){
  const vl = (achternaam||'').trim().charAt(0).toUpperCase();
  return vl ? `${naam} ${vl}.` : naam;
}

// Bouw de afgeschermde snapshot die de andere coach mag zien.
function bouwLeenSnapshot(p){
  const st = spelerStats(p.id);
  const vol = laatsteVolledig(p.id);   // laatste volledige beoordeling (ontwikkelprofiel) of null
  const scores = {};
  if (vol && vol.scores) for (const s of SKILLS) if (vol.scores[s.id] != null) scores[s.id] = vol.scores[s.id];
  return {
    naam: p.naam,
    voorletter: (p.achternaam||'').trim().charAt(0).toUpperCase() || null,
    nummer: p.nummer ?? null,
    positie: p.positie || null,
    stats: { wedstrijden: st.wedstrijden, tijd: st.tijd, goals: st.goals, keeper: st.keeper, opkomst: st.opkomst },
    profielScores: Object.keys(scores).length ? scores : null,
    profielDatum: vol?.datum || null,
  };
}

async function modalUitlenen(spelerId){
  const p = speler(spelerId);
  if (!p) return;
  const clubId = S.team?.club;
  if (!clubId) return meld('Dit team hoort niet bij een club');

  openModal(`
    <h2>${esc(p.naam)} uitlenen</h2>
    <div class="veldgroep"><label>Aan welk team?</label>
      <select class="invoer" id="mUlTeam"><option value="">Teams laden…</option></select></div>
    <div class="veldgroep"><label>Wedstrijddag</label>
      <input class="invoer" id="mUlDatum" type="date" value="${vandaagIso()}"></div>
    <div class="avg-balk"><span class="slot">🔒</span>
      <span>De ontvangende coach ziet <b>${esc(leenNaam(p.naam,p.achternaam))}</b> alleen van 3 dagen vóór t/m 3 dagen ná deze dag, en alleen positie, statistieken en ontwikkelprofiel — read-only.</span></div>
    <button class="knop vol" id="mUlOk" disabled>Uitlenen bevestigen</button>`);

  // Doelteams ophalen: alle teams van de club behalve het eigen team.
  let doelTeams = [];
  try {
    const csnap = await getDoc(doc(db,'clubs',clubId));
    const ids = csnap.exists() ? Object.keys(csnap.data().teams || {}) : [];
    const andere = ids.filter(id => id !== S.teamId);
    for (let i=0;i<andere.length;i+=30){
      const chunk = andere.slice(i,i+30);
      if (!chunk.length) break;
      const tsnap = await getDocs(query(collection(db,'teams'), where(documentId(),'in',chunk)));
      tsnap.docs.forEach(d => doelTeams.push({id:d.id, naam:d.data().naam || '?'}));
    }
    doelTeams.sort((a,b)=> a.naam.localeCompare(b.naam));
  } catch(e){
    meld('Teams ophalen mislukt: ' + (e.code||e.message));
  }

  const sel = $('#mUlTeam');
  if (!doelTeams.length){
    sel.innerHTML = '<option value="">Geen andere teams gevonden</option>';
  } else {
    sel.innerHTML = '<option value="">Kies een team…</option>' +
      doelTeams.map(t => `<option value="${t.id}|${esc(t.naam)}">${esc(t.naam)}</option>`).join('');
  }

  const okBtn = $('#mUlOk');
  const check = () => { okBtn.disabled = !(sel.value && $('#mUlDatum').value); };
  sel.onchange = check; $('#mUlDatum').oninput = check;

  okBtn.onclick = async () => {
    const [naarTeam, naarTeamNaam] = sel.value.split('|');
    const dag = $('#mUlDatum').value;
    if (!naarTeam || !dag) return;
    okBtn.disabled = true; okBtn.textContent = 'Bezig…';
    try {
      await addDoc(collection(db,'clubs',clubId,'uitleningen'), {
        spelerId: p.id,
        vanTeam: S.teamId,
        vanTeamNaam: S.team.naam,
        naarTeam,
        naarTeamNaam,
        dag,
        van: plusDagen(dag, -LEEN_VENSTER_DAGEN),
        tot: plusDagen(dag,  LEEN_VENSTER_DAGEN),
        snapshot: bouwLeenSnapshot(p),
        door: S.user?.uid || null,
        gemaakt: serverTimestamp(),
      });
      sluitModal();
      meld(`${p.naam} uitgeleend aan ${naarTeamNaam}`);
    } catch(e){
      okBtn.disabled = false; okBtn.textContent = 'Uitlenen bevestigen';
      meld('Uitlenen mislukt: ' + (e.code||e.message));
    }
  };
}

async function trekUitleningIn(uitleenId){
  const clubId = S.team?.club;
  if (!clubId) return;
  if (!confirm('Uitlening intrekken? De speler verdwijnt direct bij het andere team.')) return;
  try {
    await deleteDoc(doc(db,'clubs',clubId,'uitleningen',uitleenId));
    // Werk de lokale lijsten meteen bij en render, zodat de UI klopt ook als
    // de listener-snapshot voor deze eigen delete (tijdelijk) uitblijft.
    S.uitleningenUit = (S.uitleningenUit||[]).filter(u => u.id !== uitleenId);
    S.uitleningenIn  = (S.uitleningenIn ||[]).filter(u => u.id !== uitleenId);
    renderTeam();
    meld('Uitlening ingetrokken');
  } catch(e){
    meld('Intrekken mislukt: ' + (e.code||e.message));
  }
}

/* Teamcode handmatig wijzigen. Controleert eerst of de nieuwe code nog vrij is. */
function modalWijzigCode(){
  openModal(`
    <h2>Teamcode wijzigen</h2>
    <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:6px">De code is wat coaches invullen om aan te sluiten. Houd 'm herkenbaar (bijv. <b>ASVJO11-1</b>) of juist moeilijk te raden.</p>
    <p style="font-size:12px;color:var(--ink-2);margin-bottom:12px">Let op: bestaande uitnodigingslinks met de oude code werken daarna niet meer.</p>
    <div class="veldgroep"><label>Nieuwe code</label>
      <input class="invoer" id="mWcCode" value="${esc(S.team.code)}" maxlength="20"
        style="text-transform:uppercase;font-family:'Barlow Condensed';font-size:20px;letter-spacing:1px"></div>
    <button class="knop vol" id="mWcOk">Code opslaan</button>`);
  $('#mWcOk').onclick = async () => {
    const nieuw = $('#mWcCode').value.trim().toUpperCase().replace(/[^A-Z0-9-]+/g,'');
    if (nieuw.length < 4) return meld('Een code is minstens 4 tekens');
    if (nieuw === S.team.code){ sluitModal(); return; }
    $('#mWcOk').disabled = true; $('#mWcOk').textContent = 'Controleren...';
    try {
      const snap = await getDocs(query(collection(db,'teams'), where('code','==',nieuw)));
      if (!snap.empty){
        $('#mWcOk').disabled = false; $('#mWcOk').textContent = 'Code opslaan';
        return meld('Die code is al in gebruik bij een ander team');
      }
      await updateDoc(doc(db,'teams',S.teamId), {code: nieuw});
      sluitModal(); meld('Teamcode gewijzigd naar ' + nieuw);
    } catch(e){
      $('#mWcOk').disabled = false; $('#mWcOk').textContent = 'Code opslaan';
      meld('Wijzigen mislukt: ' + (e.code || e.message));
    }
  };
}

/* De ingelogde coach past zijn eigen weergavenaam aan. Dit werkt door in
   ALLE teams waar hij lid van is, zodat hij overal met dezelfde naam staat. */
function modalMijnNaam(){
  const huidige = (S.team.ledenInfo?.[S.user.uid]?.naam) || S.user.displayName || '';
  const aantalTeams = S.teams.length;
  openModal(`
    <h2>Mijn weergavenaam</h2>
    <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px">Zo verschijn je in de coachlijst. ${aantalTeams > 1 ? `De naam wordt aangepast in al je <b>${aantalTeams}</b> teams.` : ''}</p>
    <div class="veldgroep"><label>Je naam</label>
      <input class="invoer" id="mMnNaam" value="${esc(huidige)}" placeholder="Bijv. Paul Lijten" autocomplete="name"></div>
    <button class="knop vol" id="mMnOk">Opslaan</button>`);
  $('#mMnNaam').focus();
  $('#mMnOk').onclick = async () => {
    const naam = $('#mMnNaam').value.trim();
    if (naam.length < 2) return meld('Vul je naam in (minstens 2 tekens)');
    const knop = $('#mMnOk');
    knop.disabled = true; knop.textContent = 'Opslaan...';
    try {
      // bijwerken in elk team waar deze gebruiker lid van is
      const mijnTeams = S.teams.filter(t => (t.leden||{})[S.user.uid]);
      for (const t of mijnTeams){
        await updateDoc(doc(db,'teams',t.id), {
          ['ledenInfo.'+S.user.uid+'.naam']: naam,
        });
      }
      sluitModal();
      meld(mijnTeams.length > 1 ? `Naam aangepast in ${mijnTeams.length} teams` : 'Naam aangepast');
    } catch(e){
      knop.disabled = false; knop.textContent = 'Opslaan';
      meld('Opslaan mislukt: ' + (e.code || e.message));
    }
  };
}

/* ---------- Presentie registreren / aanpassen ----------
   Iedereen staat standaard op AANWEZIG. De coach tikt alleen de afwezigen aan.
   Bij een nieuwe registratie (bestaande=null) kan de datum gekozen worden
   (standaard vandaag). Voor afwezige spelers kan optioneel een reden
   aangevinkt worden: geblesseerd of "met reden" (+ vrije notitie). Geen van
   beide aangevinkt = "zonder reden". */
function modalPresentie(bestaande = null){
  if (!S.spelers.length) return meld('Voeg eerst spelers toe onder het tabblad Spelers');
  const vandaag = new Date().toISOString().slice(0,10);
  let datum = bestaande ? bestaande.datum : vandaag;
  let afwezig = new Set(bestaande ? (bestaande.afwezig || []) : []);
  let redenen = bestaande ? JSON.parse(JSON.stringify(bestaande.afwezigRedenen || {})) : {};
  const kanDatumWijzigen = !bestaande;

  const datLeesbaar = (d) => {
    const s = new Date(d+'T12:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
    return s.charAt(0).toUpperCase()+s.slice(1);
  };

  const rijenHtml = () => S.spelers.map(p => {
    const isAfw = afwezig.has(p.id);
    const reden = redenen[p.id];
    return `
    <div class="pres-speler ${isAfw?'afwezig':'aanwezig'}">
      <button type="button" class="pres-speler-kop" data-toggle="${p.id}">
        <span class="pres-shirt">${esc(p.nummer ?? '·')}</span>
        <span class="pres-naam">${esc(p.naam)}</span>
        <span class="pres-status">${isAfw?'Afwezig':'Aanwezig'}</span>
      </button>
      ${isAfw ? `
      <div class="pres-reden-rij">
        <button type="button" class="pres-reden-chip ${reden?.type==='blessure'?'actief':''}" data-reden="blessure" data-pid="${p.id}">🩹 Geblesseerd</button>
        <button type="button" class="pres-reden-chip ${reden?.type==='reden'?'actief':''}" data-reden="reden" data-pid="${p.id}">📋 Met reden</button>
      </div>
      ${reden?.type==='reden' ? `<input class="invoer pres-reden-notitie" data-pid="${p.id}" placeholder="Bijv. ziek, vakantie, school (optioneel)" value="${esc(reden.notitie||'')}">` : ''}
      ` : ''}
    </div>`;
  }).join('');

  openModal(`
    <h2>Presentie training</h2>
    ${kanDatumWijzigen ? `
    <div class="veldgroep" style="margin-bottom:10px">
      <label>Datum</label>
      <div class="segment" id="mPresDatumSeg">
        <button type="button" data-d="vandaag" class="actief">Vandaag</button>
        <button type="button" data-d="ander">Andere dag</button>
      </div>
      <input class="invoer" type="date" id="mPresDatumInput" value="${datum}" style="display:none;margin-top:8px">
    </div>` : ''}
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:4px;text-transform:capitalize" id="mPresDatumTekst">${esc(datLeesbaar(datum))}</p>
    <p style="font-size:12px;color:var(--warn);margin-bottom:4px;display:none" id="mPresBestaatMelding">Let op: voor deze dag is al presentie geregistreerd — je past de bestaande registratie aan.</p>
    <p style="font-size:12.5px;color:var(--ink-2);margin-bottom:12px">Iedereen staat op <b>aanwezig</b>. Tik wie er <b>niet</b> is.</p>
    <div class="pres-lijst" id="mPresLijst">${rijenHtml()}</div>
    <div class="rij" style="margin-top:14px">
      ${bestaande ? '<button class="knop licht vol" id="mPresWeg" style="color:var(--uit)">Verwijderen</button>' : ''}
      <button class="knop vol" id="mPresOk">Opslaan</button>
    </div>`);

  const koppelRijen = () => {
    $$('[data-toggle]').forEach(b => b.onclick = () => {
      const id = b.dataset.toggle;
      if (afwezig.has(id)){ afwezig.delete(id); delete redenen[id]; }
      else afwezig.add(id);
      $('#mPresLijst').innerHTML = rijenHtml();
      koppelRijen();
    });
    $$('.pres-reden-chip').forEach(b => b.onclick = () => {
      const id = b.dataset.pid, type = b.dataset.reden;
      const huidig = redenen[id];
      if (huidig && huidig.type === type) delete redenen[id];
      else redenen[id] = {type, notitie: huidig?.notitie || ''};
      $('#mPresLijst').innerHTML = rijenHtml();
      koppelRijen();
    });
    $$('.pres-reden-notitie').forEach(inp => inp.oninput = () => {
      const id = inp.dataset.pid;
      if (redenen[id]) redenen[id].notitie = inp.value;
    });
  };
  koppelRijen();

  const werkMeldingBij = () => {
    const bestaandRecord = S.presentie.find(p => p.datum === datum);
    $('#mPresBestaatMelding').style.display = (bestaandRecord && !bestaande) ? '' : 'none';
  };

  const zetDatum = (nieuweDatum) => {
    datum = nieuweDatum;
    $('#mPresDatumTekst').textContent = datLeesbaar(datum);
    const bestaandRecord = S.presentie.find(p => p.datum === datum);
    afwezig = new Set(bestaandRecord ? (bestaandRecord.afwezig || []) : []);
    redenen = bestaandRecord ? JSON.parse(JSON.stringify(bestaandRecord.afwezigRedenen || {})) : {};
    $('#mPresLijst').innerHTML = rijenHtml();
    koppelRijen();
    werkMeldingBij();
  };

  if (kanDatumWijzigen){
    werkMeldingBij();
    const seg = $('#mPresDatumSeg'), input = $('#mPresDatumInput');
    seg.querySelectorAll('button').forEach(b => b.onclick = () => {
      seg.querySelectorAll('button').forEach(x=>x.classList.remove('actief'));
      b.classList.add('actief');
      if (b.dataset.d === 'vandaag'){ input.style.display = 'none'; zetDatum(vandaag); }
      else {
        input.style.display = '';
        input.value = datum;
        input.focus();
        if (input.showPicker){ try { input.showPicker(); } catch(e){} }
      }
    });
    input.onchange = () => { if (input.value) zetDatum(input.value); };
  }

  $('#mPresOk').onclick = async () => {
    const knop = $('#mPresOk'); knop.disabled = true; knop.textContent = 'Opslaan...';
    const data = {
      datum,
      afwezig: Array.from(afwezig),
      afwezigRedenen: redenen,
      aantalAanwezig: S.spelers.length - afwezig.size,
      aantalSpelers: S.spelers.length,
      door: S.user.displayName || S.user.email || '',
      gewijzigd: serverTimestamp(),
    };
    try {
      const zelfde = S.presentie.find(p => p.datum === datum);
      if (bestaande) await updateDoc(doc(db,'teams',S.teamId,'presentie',bestaande.id), data);
      else if (zelfde) await updateDoc(doc(db,'teams',S.teamId,'presentie',zelfde.id), data);
      else await addDoc(collection(db,'teams',S.teamId,'presentie'), {...data, gemaakt: serverTimestamp()});
      sluitModal();
      meld(afwezig.size ? `${afwezig.size} afwezig genoteerd` : 'Iedereen aanwezig genoteerd');
    } catch(e){
      knop.disabled = false; knop.textContent = 'Opslaan';
      meld('Opslaan mislukt: ' + (e.code || e.message));
    }
  };

  const weg = $('#mPresWeg');
  if (weg) weg.onclick = async () => {
    if (!confirm('Deze presentieregistratie verwijderen?')) return;
    try {
      await deleteDoc(doc(db,'teams',S.teamId,'presentie',bestaande.id));
      sluitModal(); meld('Presentie verwijderd');
    } catch(e){ meld('Verwijderen mislukt: ' + (e.code || e.message)); }
  };
}

/* ---------- Planning: eigen dag toevoegen ---------- */
function modalEigenDag(){
  const vandaag = new Date().toISOString().slice(0,10);
  openModal(`
    <h2>Eigen dag toevoegen</h2>
    <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px">Voeg een eigen datum toe aan de planning — bijvoorbeeld een toernooi, teamuitje of trainingskamp.</p>
    <div class="veldgroep"><label>Datum</label>
      <input class="invoer" id="mEdDatum" type="date" value="${vandaag}"></div>
    <div class="veldgroep"><label>Omschrijving</label>
      <input class="invoer" id="mEdLabel" placeholder="Bijv. Teamfoto, toernooi, vrij" autocomplete="off"></div>
    <div class="veldgroep"><label>Notitie (optioneel)</label>
      <input class="invoer" id="mEdOpm" placeholder="Extra info" autocomplete="off"></div>
    <button class="knop vol" id="mEdOk">Toevoegen</button>`);
  $('#mEdOk').onclick = async () => {
    const datum = $('#mEdDatum').value;
    const label = $('#mEdLabel').value.trim();
    if (!datum) return meld('Kies een datum');
    if (!label) return meld('Geef een omschrijving');
    try {
      await addDoc(collection(db,'teams',S.teamId,'planning'), {
        bron: 'eigen', datum, type: 'eigen', label,
        opmerking: $('#mEdOpm').value.trim(),
        gemaakt: serverTimestamp(),
      });
      // zorg dat de maand zichtbaar is na toevoegen
      if (S._planningDichteMaanden) S._planningDichteMaanden.delete(datum.slice(0,7));
      sluitModal(); meld('Dag toegevoegd');
    } catch(e){ meld('Toevoegen mislukt: ' + (e.code || e.message)); }
  };
}

/* ---------- Planning: KNVB-dag aanpassen/verbergen of eigen dag bewerken ---------- */
function modalPlanDag(it){
  const isEigen = it.bron === 'eigen';
  const typeOpties = [['wd','Wedstrijddag'],['beker','Beker'],['inhaal','Inhaal'],['vrij','Vrij'],['eigen','Eigen dag']];
  openModal(`
    <h2>${datumNL(it.datum)}</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">${isEigen ? 'Eigen dag bewerken of verwijderen.' : 'KNVB-speeldag aanpassen of verbergen voor dit team. De originele kalender blijft bewaard.'}</p>
    <div class="veldgroep"><label>Type</label>
      <select class="invoer" id="mPdType">${typeOpties.map(([v,l]) => `<option value="${v}" ${it.type===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="veldgroep"><label>Omschrijving</label>
      <input class="invoer" id="mPdLabel" value="${esc(it.label||'')}" autocomplete="off"></div>
    <div class="veldgroep"><label>Notitie (optioneel)</label>
      <input class="invoer" id="mPdOpm" value="${esc(it.opmerking||'')}" autocomplete="off"></div>
    <button class="knop vol" id="mPdOk">Opslaan</button>
    <div class="rij" style="margin-top:8px">
      ${it.aangepast && !isEigen ? `<button class="knop licht" id="mPdReset" style="flex:1">Herstel KNVB</button>` : ''}
      <button class="knop gevaar" id="mPdWeg" style="flex:1">${isEigen ? 'Verwijderen' : 'Verbergen'}</button>
    </div>`);
  $('#mPdOk').onclick = async () => {
    const type = $('#mPdType').value;
    const label = $('#mPdLabel').value.trim() || (PLAN_TYPE[type]?.naam || 'Dag');
    const opmerking = $('#mPdOpm').value.trim();
    try {
      if (isEigen){
        await updateDoc(doc(db,'teams',S.teamId,'planning',it.docId), {type, label, opmerking});
      } else {
        await setDoc(doc(db,'teams',S.teamId,'planning','knvb_'+it.datum), {
          bron:'knvb', datum: it.datum, type, label, opmerking, verborgen:false,
        });
      }
      sluitModal(); meld('Opgeslagen');
    } catch(e){ meld('Opslaan mislukt: ' + (e.code || e.message)); }
  };
  const reset = $('#mPdReset');
  if (reset) reset.onclick = async () => {
    try {
      await deleteDoc(doc(db,'teams',S.teamId,'planning','knvb_'+it.datum));
      sluitModal(); meld('KNVB-dag hersteld');
    } catch(e){ meld('Mislukt: ' + (e.code || e.message)); }
  };
  $('#mPdWeg').onclick = async () => {
    if (isEigen){
      if (!confirm('Deze eigen dag verwijderen?')) return;
      try {
        await deleteDoc(doc(db,'teams',S.teamId,'planning',it.docId));
        sluitModal(); meld('Verwijderd');
      } catch(e){ meld('Mislukt: ' + (e.code || e.message)); }
    } else {
      if (!confirm('Deze KNVB-dag verbergen voor dit team?')) return;
      try {
        await setDoc(doc(db,'teams',S.teamId,'planning','knvb_'+it.datum), {
          bron:'knvb', datum: it.datum, verborgen:true,
        });
        sluitModal(); meld('Verborgen');
      } catch(e){ meld('Mislukt: ' + (e.code || e.message)); }
    }
  };
}
