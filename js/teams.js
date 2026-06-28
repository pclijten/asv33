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
  BLESSURE_ZONES, blessureZone, BLESSURE_TYPE, BLESSURE_ONTSTAAN, BLESSURE_ERNST, ernstInfo,
  BLESSURE_HERSTEL, BLESSURE_ACTIE, actieInfo, RTP_FASEN, rtpInfo, BLESSURE_STATUS,
  isRodeVlagZone, RECIDIEF_WEKEN, BLESSURE_BEWAARMAANDEN } from './config.js';
import { analyseWedstrijd } from './analyse.js';
import { doSignOut, joinMetCode } from './auth.js';
import { openClub, modalNieuwClub, modalUitnodig } from './club.js';
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
  const q1 = query(collection(db,'teams'), where('leden.'+S.user.uid, '==', true));
  S.unsub.teams = onSnapshot(q1, snap => {
    S.teams = snap.docs.map(d => ({id:d.id, ...d.data()}))
                       .sort((a,b) => (a.naam||'').localeCompare(b.naam||''));
    if (!S.teamId && !S.clubId) renderTeams();
    laadTrainingenVoorTeams();
    laadVideosVoorTeams();
  });
  const q2 = query(collection(db,'clubs'), where('admins.'+S.user.uid, '==', true));
  S.unsub.clubs = onSnapshot(q2, snap => {
    S.clubs = snap.docs.map(d => ({id:d.id, ...d.data()}))
                       .sort((a,b) => (a.naam||'').localeCompare(b.naam||''));
    if (!S.teamId && !S.clubId) renderTeams();
  });
  const q3 = query(collection(db,'gebruikers',S.user.uid,'gelezen'));
  S.unsub.gelezen = onSnapshot(q3, snap => {
    S.trainingenGelezen = {};
    snap.docs.forEach(d => S.trainingenGelezen[d.id] = true);
    if (S.team) renderTeam();
  });
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
      </div>
      <button class="uitlog-knop" id="uitloggen" title="Uitloggen"><span>⏻</span></button>
    </div>

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
  stopUnsubs('team','spelers','wedstrijden','presentie','planning','beoordelingen','blessures');
  S.unsub.team = onSnapshot(doc(db,'teams',teamId), snap => {
    if (!snap.exists()){ verlaatTeamView(); return; }
    S.team = {id:snap.id, ...snap.data()};
    if (S.team.club && !S.unsub.uitleningen) startUitleningenListener(teamId);
    if (!S.wedstrijdId) renderTeam();
  });
  S.unsub.spelers = onSnapshot(collection(db,'teams',teamId,'spelers'), snap => {
    S.spelers = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (a.nummer ?? 999) - (b.nummer ?? 999) || a.naam.localeCompare(b.naam));
    if (!S.wedstrijdId) renderTeam(); else renderWedstrijd();
  });
  S.unsub.wedstrijden = onSnapshot(collection(db,'teams',teamId,'wedstrijden'), snap => {
    S.wedstrijden = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
    if (!S.wedstrijdId) renderTeam();
    // gevraagd om meteen een nieuwe wedstrijd te starten? Doe dat zodra alles geladen is.
    if (S._pendingNieuweWedstrijd){
      S._pendingNieuweWedstrijd = false;
      modalNieuweWedstrijd();
    }
  });
  S.unsub.presentie = onSnapshot(collection(db,'teams',teamId,'presentie'), snap => {
    S.presentie = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
    if (!S.wedstrijdId && S.teamTab === 'trainingen') renderTeam();
  });
  S.unsub.planning = onSnapshot(collection(db,'teams',teamId,'planning'), snap => {
    S.planning = snap.docs.map(d => ({id:d.id, ...d.data()}));
    if (!S.wedstrijdId && S.teamTab === 'planning') renderTeam();
  });
  // Eigen listener voor beoordelingen — los van de wedstrijd-listener, zodat
  // updates van een andere coach niet wegvallen (zie listener-architectuur).
  S.unsub.beoordelingen = onSnapshot(collection(db,'teams',teamId,'beoordelingen'), snap => {
    S.beoordelingen = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||'') || (b.gemaaktMs||0) - (a.gemaaktMs||0));
    if (!S.wedstrijdId && (S.teamTab === 'spelers' || S._beoordeelProfiel)) renderTeam();
  });
  // Eigen listener voor blessures (gezondheidsgegevens, AVG art. 9) — los van
  // de overige listeners, zodat updates van een andere coach niet wegvallen.
  S.unsub.blessures = onSnapshot(collection(db,'teams',teamId,'blessures'), snap => {
    S.blessures = snap.docs.map(d => ({id:d.id, ...d.data()}))
      .sort((a,b) => (b.datum||'').localeCompare(a.datum||'') || (b.gemaaktMs||0) - (a.gemaaktMs||0));
    if (!S.wedstrijdId && (S.teamTab === 'spelers' || S._beoordeelProfiel || S._fitDash)) renderTeam();
  });
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
  });
}
export function verlaatTeamView(){
  stopUnsubs('team','spelers','wedstrijden','presentie','planning','beoordelingen','uitleningen','blessures');
  S.teamId = null; S.team = null; S.spelers = []; S.wedstrijden = []; S.planning = [];
  S.uitleningenUit = []; S.uitleningenIn = [];
  renderTeams(); toon('teams');
}

export function renderTeam(){
  if (!S.team) return;
  const v = $('#view-team');
  const tab = S.teamTab;
  let inhoud = '';
  if (tab === 'wedstrijden') inhoud = htmlWedstrijden();
  if (tab === 'spelers')     inhoud = S._fitDash ? htmlFitDashboard() : (S._leenProfiel ? htmlLeenProfiel() : (S._beoordeelProfiel ? htmlProfiel() : htmlSpelers()));
  if (tab === 'planning')    inhoud = htmlPlanning();
  if (tab === 'stats')       inhoud = htmlStats();
  if (tab === 'trainingen')  inhoud = htmlTeamTrainingen();
  if (tab === 'videos')      inhoud = htmlTeamVideos();
  if (tab === 'instellingen')inhoud = htmlInstellingen();
  if (tab === 'help')        inhoud = htmlHandleiding();

  const teamTrainingen = S.trainingen.filter(t => (t.teams||[]).includes(S.teamId));
  const ongelezen = teamTrainingen.filter(t => !S.trainingenGelezen[t.id]).length;

  const profielOpen = (tab === 'spelers' && (S._beoordeelProfiel || S._leenProfiel || S._fitDash));
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
    S._beoordeelProfiel = null; S._leenProfiel = null; S._fitDash = false;
    // presentie altijd ingeklapt tonen zodra je (terug) op de Trainingen-tab klikt
    if (b.dataset.tab === 'trainingen'){ S._presentieOpen = new Set(); S._presentieToonAlles = new Set(); }
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
    <button class="knop vol licht" id="fitDashBtn" style="margin-bottom:14px">🩹 Fitheid & blessures (team)</button>
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
  let aanwezig = 0;
  for (const sessie of (S.presentie||[])) if (!(sessie.afwezig||[]).includes(pid)) aanwezig++;
  const opkomst = totTr ? Math.round((aanwezig/totTr)*100) : null;
  return {wedstrijden, tijd, keeper, goals, opkomst, totTr};
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
      <button data-ptab="fitheid" class="${tab==='fitheid'?'actief':''}">Fitheid${blessuresVanSpeler(p.id, 'actief').length ? ' <span class="fit-dot"></span>' : ''}</button>
      <button data-ptab="historie" class="${tab==='historie'?'actief':''}">Historie</button>
    </div>

    ${tab === 'overzicht' ? `
      <div class="stat-grid">
        <div class="stat-box"><div class="v">${st.wedstrijden}</div><div class="l">Wedstr.</div></div>
        <div class="stat-box"><div class="v">${st.tijd ? uurMin(st.tijd) : '—'}</div><div class="l">Speeltijd</div></div>
        <div class="stat-box"><div class="v">${st.goals}</div><div class="l">Goals</div></div>
        <div class="stat-box"><div class="v">${st.opkomst != null ? st.opkomst+'%' : '—'}</div><div class="l">Training</div></div>
      </div>

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

    ${tab === 'fitheid' ? htmlFitheid(p) : ''}

    ${tab === 'historie' ? `
      <div class="kaart">
        <div class="veldlabel" style="margin-top:0">Tijdlijn</div>
        ${eigen.length ? eigen.map(b => htmlTijdlijnItem(b)).join('')
          : `<p style="font-size:13px;color:var(--ink-2);padding:6px 0">Nog geen beoordelingen vastgelegd.</p>`}
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
    const dat = new Date(p.datum+'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
    const datMooi = dat.charAt(0).toUpperCase()+dat.slice(1);
    const afwNamen = afw.length
      ? afw.map(id => { const sp = S.spelers.find(s => s.id === id); return sp ? esc(sp.naam) : null; }).filter(Boolean).join(', ')
      : '';
    return `
      <div class="presentie-rij" data-presentie="${p.id}" style="cursor:pointer">
        <div class="pr-datum"><span class="pr-dag">${datMooi}</span></div>
        <div class="pr-info">
          ${afw.length
            ? `<span class="pr-afw">${afw.length} afwezig</span><span class="pr-namen">${afwNamen}</span>`
            : `<span class="pr-allen">✓ Iedereen aanwezig</span>`}
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

  const presentieSectie = `
    <div class="sectie-kop" style="margin-top:0">📋 Presentie training</div>
    ${alGeregistreerd
      ? `<div class="kaart" style="background:rgba(226,6,19,.07);border-left:3px solid var(--grass);font-size:13px;margin-bottom:10px">Vandaag al geregistreerd. Tik de regel hieronder aan om aan te passen.</div>`
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

  return afgelastSectie + presentieSectie + pdfSectie;
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
    <h3>👋 Welkom bij Cluppie</h3>
    <p>Een app om voor je voetbalteam de opstelling te maken, wissels te beheren, speeltijd eerlijk te verdelen en de wedstrijd te loggen. Alles werkt realtime, dus collega-coaches zien direct dezelfde informatie.</p>

    <h3>🔑 De eerste keer inloggen</h3>
    <p>Je hoeft niets te installeren. Je opent de app gewoon in je browser en logt in op de manier die jij prettig vindt:</p>
    <ul>
      <li><b>Met Google of Microsoft</b> — één tik en je bent binnen.</li>
      <li><b>Met e-mail en wachtwoord</b> — vul je e-mailadres en een zelfgekozen wachtwoord in. Bestaat je account nog niet? Dan wordt het automatisch aangemaakt. De volgende keer kom je met diezelfde gegevens direct terug als dezelfde coach.</li>
    </ul>
    <div class="tip"><b>Wachtwoord vergeten?</b> Tik op "Wachtwoord vergeten?" onder de inlogknop — je krijgt dan een mailtje om een nieuw wachtwoord in te stellen.</div>

    <h3>🔗 Aansluiten bij je team</h3>
    <p>Je coach of de clubbeheerder stuurt je een <b>persoonlijke uitnodigingslink</b> (vaak via WhatsApp). Zo werkt het:</p>
    <ul>
      <li>Tik op de link. Je ziet een welkomstscherm met de naam van je team.</li>
      <li>Log in (Google, Microsoft of e-mail) — en je zit meteen in het juiste team.</li>
      <li>Geen link gekregen? Vraag je coach om de <b>teamcode</b> (bijv. ASVJO11-1) en vul die in op het inlogscherm.</li>
    </ul>

    <h3>📱 Zet de app op je beginscherm</h3>
    <p>Voor een echt app-gevoel: open het menu van je browser en kies <b>"Toevoegen aan beginscherm"</b>. Dan staat Cluppie als icoontje tussen je apps en open je hem met één tik — geen browser meer nodig.</p>

    <h3>📄 Trainingen & 🎬 video's</h3>
    <p>Onder het tabblad <b>Training</b> vind je de oefenstof voor je team, gedeeld als PDF. Onder <b>Video</b> staan YouTube-links met oefeningen of beelden.</p>
    <div class="tip"><b>Elke zondag</b> worden hier de trainingen voor de komende week en eventuele video's klaargezet — kijk er dus aan het begin van de week even in. Een <b>🔴 rood stipje</b> op het tabblad laat zien dat er iets nieuws is.</div>

    <h3>✏️ Je eigen naam instellen</h3>
    <p>Onder ⚙️ <b>Team</b> kun je via <b>"Mijn weergavenaam wijzigen"</b> instellen hoe je in de coachlijst verschijnt. Handig zodat je teamgenoten zien wie wie is.</p>

    <h3>🚀 Snel beginnen</h3>
    <ul>
      <li>Voeg je <b>spelers</b> toe onder het tabblad 👕 — naam en rugnummer is genoeg.</li>
      <li>Maak een <b>nieuwe wedstrijd</b> aan onder 📋. Kies competitie of toernooi.</li>
      <li>Sleep spelers van de bank naar het veld of tik ze aan en tik daarna een positie.</li>
      <li>Start de klok ▶ zodra de wedstrijd begint. Wissels tijdens het spel worden automatisch gelogd met tijdstip.</li>
    </ul>

    <h3>⚽ Spelers slepen & wisselen</h3>
    <p>Op het veld werk je met spelersbolletjes (de <b>chips</b>):</p>
    <ul>
      <li><b>Slepen</b>: houd een speler vast en sleep hem naar een andere positie, een lege plek, of naar de bank.</li>
      <li><b>Tikken</b>: één tik selecteert (gele rand). Tik daarna een doel om de speler daar neer te zetten.</li>
      <li><b>Positie ruilen</b>: sleep een veldspeler naar een andere veldspeler — ze wisselen van positie.</li>
      <li><b>Loopt de klok?</b> Dan wordt elke bank→veld of veld→bank actie geregistreerd als wissel met tijdstip in het log.</li>
    </ul>
    <div class="tip"><b>Tip:</b> de bank is gesorteerd op minste speeltijd — wie aan de beurt is, staat vooraan.</div>

    <h3>🟢 Stippen onder spelers</h3>
    <p>Onder elke chip verschijnen vanaf het tweede kwart kleine stippen — één per eerder kwart:</p>
    <ul>
      <li><b>Groen</b> = die periode gespeeld.</li>
      <li><b>Rood</b> = die periode op de bank.</li>
    </ul>
    <p>Zo zie je in één oogopslag wie er nu echt aan de beurt is.</p>

    <h3>⏱ Kwarten, helften & klok</h3>
    <ul>
      <li>De app stelt het juiste aantal periodes en de speeltijd in op basis van de KNVB-categorie van je team.</li>
      <li>Tik op een periode-tab (<kbd>K1</kbd>, <kbd>K2</kbd> ... of <kbd>H1</kbd>, <kbd>H2</kbd>) om eraan te werken.</li>
      <li>De klok stopt <b>automatisch</b> op de maximale speeltijd — je kunt hem dus niet vergeten.</li>
      <li>Open je een leeg kwart, dan wordt de eindopstelling van het vorige kwart automatisch overgenomen.</li>
      <li>Met ↺ zet je de klok terug op nul; wissels blijven staan.</li>
    </ul>

    <h3>📋 Opstelling van vorige wedstrijd</h3>
    <p>Bij een nieuwe wedstrijd kun je de optie <b>"Begin met opstelling van vorige wedstrijd"</b> aanvinken. Het eerste kwart wordt dan gevuld met de startopstelling van je laatste wedstrijd in hetzelfde format — zo hoef je niet elke keer opnieuw te beginnen, en pas je alleen aan wie er deze keer ontbreekt.</p>

    <h3>📅 Wissels vooraf plannen</h3>
    <p>Onder het wisselvak staat <b>+ Wissel plannen</b>: kies wie erin, wie eruit en na hoeveel minuten. Zodra de klok dat moment passeert, knippert de geplande wissel en trilt je telefoon. Tik op <kbd>✓</kbd> om hem door te voeren.</p>

    <h3>⚽ Doelpunten registreren & corrigeren</h3>
    <ul>
      <li>Tik op de <b>⚽-knop</b> aan jouw kant van het scorebord en kies de speler die scoorde.</li>
      <li>Tegendoelpunt: één tik op de andere ⚽-knop.</li>
      <li><b>Verkeerd getikt?</b> Tik op het doelpunt in het gebeurtenissen-log. Je kunt dan de juiste scorer kiezen, de kant omdraaien (voor ↔ tegen) of het doelpunt verwijderen.</li>
      <li>Doelpunten verschijnen in het log en in de seizoenstatistieken (topscorer).</li>
    </ul>

    <h3>🟨 Kaarten & straffen</h3>
    <p>De gele knop naast het scorebord opent het kaartenmenu. Kies de speler en het type:</p>
    <ul>
      <li><b>🟨 Geel</b> — waarschuwing. Een tweede gele in dezelfde wedstrijd geeft <b>automatisch rood</b>.</li>
      <li><b>⏱ Tijdstraf</b> — 5 minuten voor pupillen (t/m JO/MO15), 10 minuten voor JO/MO16+ en senioren.</li>
      <li><b>🟥 Rood</b> — de speler wordt direct van het veld gehaald.</li>
      <li>Verkeerde kaart? Tik erop in het log om de speler te wijzigen of de kaart te verwijderen.</li>
    </ul>

    <h3>👑 Aanvoerder</h3>
    <p>Onder ⚙️ in de wedstrijd kies je per wedstrijd de aanvoerder. Hij krijgt een geel <b>C</b>-bandje op zijn shirt. In de statistieken zie je hoe vaak iemand aanvoerder is geweest — handig om te rouleren.</p>

    <h3>🏆 Toernooien</h3>
    <p>Bij een nieuwe wedstrijd kies je <b>Toernooi</b>. Geef het aantal wedstrijden op en het aantal helften per wedstrijd. De tabs worden dan <kbd>W1</kbd>, <kbd>W2</kbd> ... De tegenstander per wedstrijd vul je in door op de naam in het scorebord te tikken (gestippeld onderstreept).</p>
    <div class="tip"><b>Op één scherm:</b> alle wissels en speeltijden lopen over het hele toernooi door, zodat je in wedstrijd 4 ziet wie er bij wedstrijd 1, 2 en 3 al heeft gespeeld.</div>

    <h3>🏛 Clubs & trainingen delen</h3>
    <p>Werk je als hoofdtrainer voor meerdere teams? Maak op het startscherm een <b>club</b> aan. Daarmee kun je:</p>
    <ul>
      <li>Teams aanmaken die bij jouw club horen (de coaches ervan komen direct in het juiste team).</li>
      <li><b>📥 PDF importeren</b>: upload een PDF met de teamindeling en de app leest de teams en spelers automatisch uit. Controleer in de preview, klik "Aanmaken" en alle teams + spelers staan klaar.</li>
      <li>Coaches uitnodigen met een persoonlijke link (via WhatsApp), zodat ze niet eerst een teamcode hoeven te krijgen. Met <b>🔗 Alle uitnodigingen</b> krijg je in één overzicht alle links voor alle teams.</li>
      <li>PDF-trainingen uploaden en aangeven voor welke teams ze beschikbaar zijn. De trainers zien ze in het 📄 Training-tabblad van hun team. Met ✏️ pas je de titel, week of de gekoppelde teams later aan, zonder het bestand opnieuw te uploaden.</li>
      <li>Een 🔴 stip op het training-tabblad waarschuwt coaches voor nieuwe, ongelezen trainingen.</li>
    </ul>

    <h3>👥 Meerdere coaches & rommel opruimen</h3>
    <p>Onder ⚙️ <b>Team</b> vind je de <b>teamcode</b> (bijv. ASVJO11-1) en de lijst <b>coaches</b>. Deel de code of een uitnodigingslink met collega-coaches:</p>
    <ul>
      <li>Ze openen de link en loggen in met hun e-mailadres of Google. Daarna zitten ze direct in het team — en komen ze later met dezelfde login terug als dezelfde coach.</li>
      <li>Staat er iemand verkeerd of dubbel in de lijst? Tik op het 🗑 naast een coach om die te verwijderen uit het team.</li>
      <li>Wijzigingen lopen realtime door — handig als de assistent-coach langs de lijn de wissels bijhoudt en de hoofdcoach de score.</li>
    </ul>

    <h3>📐 Format en formatie wijzigen</h3>
    <p>Onder ⚙️ in een wedstrijd pas je het format (6×6, 8×8, 9×9, 11×11, 4×4) en de formatie aan. Spelers blijven zoveel mogelijk op hun plek staan; slots die wegvallen worden netjes opgeschoond.</p>

    <h3>📊 Statistieken</h3>
    <p>Onder ⏱ vind je het seizoensoverzicht: speeltijd, doelpunten, aanvoerdersbeurten, keeperbeurten en kaarten per speler. Sorteert vanzelf op meeste speeltijd.</p>

    <h3>💡 Praktische tips</h3>
    <ul>
      <li>Voeg de app als <b>snelkoppeling op je startscherm</b> toe (browsermenu → "Toevoegen aan beginscherm") voor app-gevoel.</li>
      <li>Werkt zonder problemen als de telefoon op slot gaat — de klok loopt door op de juiste tijd.</li>
      <li><b>Slecht bereik langs de lijn?</b> Geen probleem: de app werkt offline door en synchroniseert je wijzigingen automatisch zodra er weer verbinding is.</li>
      <li>Met een powerbank langs de lijn ben je verzekerd van een hele wedstrijd.</li>
    </ul>

    <h3>⇄ Spelers uitlenen</h3>
    <p>Speelt een speler een keer mee met een ander team binnen de club? Open zijn profiel (tab Spelers → tik op de speler) en kies <b>⇄ Uitlenen aan ander team</b>. Je kiest het ontvangende team en de wedstrijddag.</p>
    <ul>
      <li>De andere coach ziet de speler automatisch vanaf <b>3 dagen vóór</b> tot <b>3 dagen ná</b> die dag, onder het kopje "Geleend" — daarna verdwijnt hij vanzelf.</li>
      <li>De ontvangende coach ziet alleen <b>voornaam + voorletter</b> (bijv. "Tim B."), de voorkeurspositie, de statistieken en het ontwikkelprofiel. Alles read-only.</li>
      <li>Je kunt een uitlening op elk moment <b>intrekken</b> vanaf het spelerprofiel.</li>
    </ul>

    <h3>🔒 Privacy &amp; namen</h3>
    <p>Cluppie gaat zorgvuldig om met de gegevens van (vaak minderjarige) spelers:</p>
    <ul>
      <li>In de app zie je standaard alleen <b>voornamen</b>. De achternaam wordt wél opgeslagen, maar nergens in de app getoond.</li>
      <li>De achternaam blijft <b>binnen je eigen team</b> en is alleen zichtbaar voor de coaches van dat team. Leen je een speler uit, dan ziet de andere coach alleen de voorletter.</li>
      <li>Beoordelingen en leerpunten zijn <b>coach-only</b>: spelers en ouders zien deze niet.</li>
      <li>Verwijder je een speler, dan worden zijn gegevens (inclusief beoordelingen en leerpunten) verwijderd.</li>
    </ul>
    <div class="tip">Deel gegevens uit spelersprofielen niet buiten het technisch kader. Heb je vragen over privacy binnen de club? Stem af met je hoofdcoach of clubbeheerder.</div>

    <p style="font-size:12.5px;color:var(--ink-2);text-align:center;margin-top:20px;padding-top:14px;border-top:1px solid var(--hair)">
      Vragen of ideeën? Geef ze door aan je hoofdcoach.<br>Veel succes langs de lijn! ⚽
    </p>
  </div>`;
}

function koppelTeamTab(v, tab){
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
    // --- fitheid / blessures ---
    koppelFitheid(v);
  }
  else if (tab === 'spelers' && S._fitDash){
    // --- team fitheid-dashboard ---
    const ft = v.querySelector('#fitTerug');
    if (ft) ft.onclick = () => { S._fitDash = false; renderTeam(); };
    koppelFitheid(v);
  }
  else if (tab === 'spelers'){
    v.querySelector('#nieuweSpeler').onclick = () => modalSpeler();
    const fd = v.querySelector('#fitDashBtn');
    if (fd) fd.onclick = () => { S._fitDash = true; renderTeam(); };
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
}

/* --- Snelle ronde: hele selectie aflopen --- */
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
   We slaan alleen de lijst met afwezige speler-id's op (compact). */
function modalPresentie(bestaande = null){
  if (!S.spelers.length) return meld('Voeg eerst spelers toe onder het tabblad Spelers');
  const datum = bestaande ? bestaande.datum : new Date().toISOString().slice(0,10);
  const afwezig = new Set(bestaande ? (bestaande.afwezig || []) : []);
  const datLeesbaar = new Date(datum+'T12:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});

  const rijen = S.spelers.map(p => `
    <button class="pres-speler ${afwezig.has(p.id)?'afwezig':'aanwezig'}" data-pid="${p.id}">
      <span class="pres-shirt">${esc(p.nummer ?? '·')}</span>
      <span class="pres-naam">${esc(p.naam)}</span>
      <span class="pres-status">${afwezig.has(p.id)?'Afwezig':'Aanwezig'}</span>
    </button>`).join('');

  openModal(`
    <h2>Presentie training</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:4px;text-transform:capitalize">${esc(datLeesbaar)}</p>
    <p style="font-size:12.5px;color:var(--ink-2);margin-bottom:12px">Iedereen staat op <b>aanwezig</b>. Tik wie er <b>niet</b> is.</p>
    <div class="pres-lijst">${rijen}</div>
    <div class="rij" style="margin-top:14px">
      ${bestaande ? '<button class="knop licht vol" id="mPresWeg" style="color:var(--uit)">Verwijderen</button>' : ''}
      <button class="knop vol" id="mPresOk">Opslaan</button>
    </div>`);

  // aan/uit tikken
  $$('.pres-speler').forEach(b => b.onclick = () => {
    const id = b.dataset.pid;
    if (afwezig.has(id)){ afwezig.delete(id); b.classList.remove('afwezig'); b.classList.add('aanwezig'); b.querySelector('.pres-status').textContent = 'Aanwezig'; }
    else { afwezig.add(id); b.classList.remove('aanwezig'); b.classList.add('afwezig'); b.querySelector('.pres-status').textContent = 'Afwezig'; }
  });

  $('#mPresOk').onclick = async () => {
    const knop = $('#mPresOk'); knop.disabled = true; knop.textContent = 'Opslaan...';
    const data = {
      datum,
      afwezig: Array.from(afwezig),
      aantalAanwezig: S.spelers.length - afwezig.size,
      aantalSpelers: S.spelers.length,
      door: S.user.displayName || S.user.email || '',
      gewijzigd: serverTimestamp(),
    };
    try {
      if (bestaande) await updateDoc(doc(db,'teams',S.teamId,'presentie',bestaande.id), data);
      else {
        // bestaat er al een registratie voor deze datum? Dan die bijwerken i.p.v. dubbel.
        const zelfde = S.presentie.find(p => p.datum === datum);
        if (zelfde) await updateDoc(doc(db,'teams',S.teamId,'presentie',zelfde.id), data);
        else await addDoc(collection(db,'teams',S.teamId,'presentie'), {...data, gemaakt: serverTimestamp()});
      }
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

/* ====================================================================
   BLESSUREMODULE
   Gezondheidsgegevens (AVG art. 9). Coach-only, toestemming vereist,
   dataminimalisatie, bewaartermijn. Opslag onder teams/{teamId}/blessures,
   valt onder bestaande isTeamMember-rules + extra rule-checks (zie .rules).
==================================================================== */

/* ---- helpers ---- */
function blessuresVanSpeler(pid, status){
  let lijst = (S.blessures||[]).filter(b => b.spelerId === pid);
  if (status) lijst = lijst.filter(b => (b.status||'actief') === status);
  return lijst;
}
function actieveBlessures(){
  return (S.blessures||[]).filter(b => (b.status||'actief') !== 'hersteld');
}
function ernstKleur(id){ return ernstInfo(id)?.kleur || 'var(--ink-2)'; }
function statusInfo(id){ return BLESSURE_STATUS[id||'actief'] || BLESSURE_STATUS.actief; }

function dagenGeleden(iso){
  if (!iso) return 0;
  const d = Math.floor((Date.now() - new Date(iso+'T12:00').getTime()) / 86400000);
  return Math.max(0, d);
}
function zoneLabel(b){
  const z = blessureZone(b.zone);
  const naam = z ? z.naam : (b.zoneNaam || b.zone || 'Onbekend');
  return b.zij ? `${b.zij} · ${naam}` : naam;
}

/* Terugkerend? Zelfde speler + zone, eerdere blessure binnen RECIDIEF_WEKEN. */
function isTerugkerend(pid, zone, datum, negeerId){
  const grens = plusDagen(datum, -RECIDIEF_WEKEN*7);
  return (S.blessures||[]).some(b =>
    b.id !== negeerId && b.spelerId === pid && b.zone === zone &&
    (b.datum||'') >= grens && (b.datum||'') < datum);
}
/* Hoeveel klachten op dezelfde zone, ooit (voor 'hotspot'). */
function zoneTelling(pid){
  const tel = {};
  for (const b of blessuresVanSpeler(pid)) tel[b.zone] = (tel[b.zone]||0) + 1;
  return tel;
}

/* AVG: heeft dit team toestemming geregistreerd voor gezondheidsregistratie?
   Vastgelegd op het team-document (door coach, na akkoord van ouders/speler). */
function heeftBlessureToestemming(){
  return !!(S.team && S.team.blessureToestemming && S.team.blessureToestemming.akkoord);
}

/* ---- Profiel-tab: Fitheid ---- */
function htmlFitheid(p){
  if (!heeftBlessureToestemming()){
    return htmlBlessureConsentGate();
  }
  const actief = blessuresVanSpeler(p.id).filter(b => (b.status||'actief') !== 'hersteld');
  const afgesloten = blessuresVanSpeler(p.id).filter(b => (b.status||'actief') === 'hersteld');
  const tel = zoneTelling(p.id);
  const hotspots = Object.entries(tel).filter(([,n]) => n >= 2).sort((a,b)=>b[1]-a[1]);

  return `
    <div class="avg-balk gezond"><span class="slot">🔒</span>
      <span>Gezondheidsgegevens — extra vertrouwelijk. Alleen voor zorg rond training/wedstrijd, niet delen.</span></div>

    <button class="knop vol" style="margin-bottom:14px" data-blessure-nieuw="${p.id}">+ Blessure / klacht registreren</button>

    ${actief.length ? `
      <div class="veldlabel" style="margin-top:0">Actief & herstellend</div>
      ${actief.map(b => blessureKaart(b)).join('')}
    ` : `<div class="kaart leeg" style="margin-bottom:14px">Geen actieve klachten. 💪</div>`}

    ${hotspots.length ? `
      <div class="kaart hotspot-kaart">
        <div class="veldlabel" style="margin-top:0">⚠️ Terugkerende plekken</div>
        ${hotspots.map(([z,n]) => {
          const zi = blessureZone(z);
          return `<div class="hotspot-rij"><span class="hs-naam">${esc(zi?zi.naam:z)}</span><span class="hs-tel">${n}× geregistreerd</span></div>`;
        }).join('')}
        <p class="hint">Meerdere klachten op dezelfde plek kunnen wijzen op onderliggende overbelasting. Overweeg een fysiotherapeut.</p>
      </div>` : ''}

    ${afgesloten.length ? `
      <div class="veldlabel">Afgesloten (${afgesloten.length})</div>
      ${afgesloten.slice(0,8).map(b => blessureKaart(b, true)).join('')}
    ` : ''}`;
}

function htmlBlessureConsentGate(){
  return `
    <div class="kaart consent-kaart">
      <div class="veldlabel" style="margin-top:0">🔒 Toestemming vereist</div>
      <p style="font-size:13.5px;line-height:1.6;color:var(--ink)">
        Het bijhouden van blessures en klachten betekent het vastleggen van
        <b>gezondheidsgegevens</b>. Dat zijn bijzondere persoonsgegevens (AVG art. 9).
        Voor minderjarigen mag dat alleen met expliciete toestemming van speler en/of ouder(s).</p>
      <ul class="consent-lijst">
        <li>Gegevens zijn <b>alleen zichtbaar voor coaches</b> van dit team.</li>
        <li>Ze worden gebruikt voor <b>zorg en belasting rond training/wedstrijd</b> — niet medisch, geen diagnose.</li>
        <li>Een speler/ouder kan altijd <b>inzage of verwijdering</b> vragen; jij wist de gegevens dan hier.</li>
        <li>Afgesloten klachten worden na <b>${BLESSURE_BEWAARMAANDEN} maanden</b> automatisch als verwijderbaar gemarkeerd.</li>
      </ul>
      <label class="consent-check">
        <input type="checkbox" id="consentVink">
        <span>Ik heb toestemming van speler/ouder(s) en ga akkoord met bovenstaande.</span>
      </label>
      <button class="knop vol" id="consentOk" disabled style="margin-top:12px">Fitheidsregistratie inschakelen</button>
      <p class="hint" style="margin-top:10px">Bespreek dit vooraf met je club. Bij twijfel: niet vastleggen.</p>
    </div>`;
}

/* ---- blessurekaart (lijstitem) ---- */
function blessureKaart(b, dim=false){
  const ei = ernstInfo(b.ernst);
  const si = statusInfo(b.status);
  const dagen = b.status === 'hersteld'
    ? (b.afgesloten ? `afgesloten ${datumNL(b.afgesloten)}` : 'afgesloten')
    : `loopt ${dagenGeleden(b.datum)} ${dagenGeleden(b.datum)===1?'dag':'dagen'}`;
  const rtp = b.rtpFase ? rtpInfo(b.rtpFase) : null;
  return `
    <button class="blessure-kaart ${dim?'dim':''}" data-blessure-detail="${b.id}">
      <span class="bk-ernst" style="background:${ei?ei.kleur:'var(--ink-2)'}"></span>
      <div class="bk-mid">
        <div class="bk-loc">${esc(zoneLabel(b))}${b.terugkerend?' <span class="bk-recidief">↻</span>':''}</div>
        <div class="bk-meta">${esc(ei?ei.label:'—')} · ${esc(dagen)}${rtp?` · ${esc(rtp.label)}`:''}</div>
      </div>
      <span class="bk-status" style="color:${si.kleur}">${si.label}</span>
    </button>`;
}

/* ---- Registratie-modal met body-map ---- */
let _blReg = null;   // tijdelijke invoerstaat tijdens registratie
function modalBlessureNieuw(pid){
  const p = speler(pid); if (!p) return;
  _blReg = { spelerId:pid, datum:vandaagIso(), aanzicht:'voor', zone:null, zij:null,
             type:null, ontstaan:null, pijn:3, ernst:null,
             kanTrainen:true, kanSpelen:true, herstel:null, actie:null, opmerking:'' };
  openModal(blessureModalHtml(p));
  koppelBlessureModal(p);
}

function blessureModalHtml(p){
  const r = _blReg;
  const zones = BLESSURE_ZONES[r.aanzicht];
  return `
    <h2>🩹 Klacht registreren — ${esc(p.naam)}</h2>
    <div class="bl-view">
      <button data-blview="voor"   class="${r.aanzicht==='voor'?'actief':''}">Voorkant</button>
      <button data-blview="achter" class="${r.aanzicht==='achter'?'actief':''}">Achterkant</button>
    </div>
    <div class="bl-bodywrap">${bodyMapSvg(r.aanzicht, r.zone, r.ernst)}</div>
    <div class="bl-zonelijst">
      ${zones.map(z => `<button class="bl-zone-btn ${r.zone===z.id?'aan':''}" data-blzone="${z.id}">${esc(z.naam)}</button>`).join('')}
    </div>
    <div id="blFlow">${blessureFlowHtml(p)}</div>`;
}

/* compacte SVG body-map; gekozen zone licht op of toont ernst-kleur */
function bodyMapSvg(aanzicht, zoneSel, ernstSel){
  const fill = ernstSel ? ernstKleur(ernstSel) : 'var(--accent)';
  // map zone-id → svg snippet (vereenvoudigd silhouet met tikbare regio's)
  const Z = (id, el) => {
    const sel = zoneSel === id;
    return el.replace('§CLS§', `bm-zone${sel?' sel':''}`).replace('§FILL§', sel?`style="fill:${fill}"`:'');
  };
  if (aanzicht === 'voor'){
    return `<svg class="bm-svg" viewBox="0 0 200 380" xmlns="http://www.w3.org/2000/svg">
      <text class="bm-lr" x="16" y="13">RECHTS</text><text class="bm-lr" x="152" y="13">LINKS</text>
      ${Z('hoofd','<ellipse class="§CLS§" §FILL§ data-blzone="hoofd" cx="100" cy="32" rx="17" ry="20"/>')}
      ${Z('schouder','<ellipse class="§CLS§" §FILL§ data-blzone="schouder" cx="68" cy="72" rx="14" ry="11"/>')}
      ${Z('schouder','<ellipse class="§CLS§" §FILL§ data-blzone="schouder" cx="132" cy="72" rx="14" ry="11"/>')}
      ${Z('borst','<path class="§CLS§" §FILL§ data-blzone="borst" d="M78 64 H122 Q128 64 128 74 V120 Q128 128 118 128 H82 Q72 128 72 120 V74 Q72 64 78 64 Z"/>')}
      ${Z('arm','<rect class="§CLS§" §FILL§ data-blzone="arm" x="52" y="80" width="14" height="90" rx="7"/>')}
      ${Z('arm','<rect class="§CLS§" §FILL§ data-blzone="arm" x="134" y="80" width="14" height="90" rx="7"/>')}
      ${Z('lies','<path class="§CLS§" §FILL§ data-blzone="lies" d="M80 130 H99 V152 Q99 158 90 158 H82 Q76 158 76 150 V138 Q76 130 80 130 Z"/>')}
      ${Z('lies','<path class="§CLS§" §FILL§ data-blzone="lies" d="M101 130 H120 Q124 130 124 138 V150 Q124 158 118 158 H110 Q101 158 101 152 Z"/>')}
      ${Z('quad','<rect class="§CLS§" §FILL§ data-blzone="quad" x="78" y="160" width="18" height="64" rx="8"/>')}
      ${Z('quad','<rect class="§CLS§" §FILL§ data-blzone="quad" x="104" y="160" width="18" height="64" rx="8"/>')}
      ${Z('knie','<ellipse class="§CLS§" §FILL§ data-blzone="knie" cx="87" cy="234" rx="11" ry="12"/>')}
      ${Z('knie','<ellipse class="§CLS§" §FILL§ data-blzone="knie" cx="113" cy="234" rx="11" ry="12"/>')}
      ${Z('scheen','<rect class="§CLS§" §FILL§ data-blzone="scheen" x="79" y="248" width="16" height="62" rx="7"/>')}
      ${Z('scheen','<rect class="§CLS§" §FILL§ data-blzone="scheen" x="105" y="248" width="16" height="62" rx="7"/>')}
      ${Z('enkel','<ellipse class="§CLS§" §FILL§ data-blzone="enkel" cx="87" cy="320" rx="9" ry="9"/>')}
      ${Z('enkel','<ellipse class="§CLS§" §FILL§ data-blzone="enkel" cx="113" cy="320" rx="9" ry="9"/>')}
      ${Z('voet','<path class="§CLS§" §FILL§ data-blzone="voet" d="M80 330 H94 V346 Q94 352 86 352 H78 Q74 352 74 346 Z"/>')}
      ${Z('voet','<path class="§CLS§" §FILL§ data-blzone="voet" d="M106 330 H120 Q126 330 126 346 Q126 352 122 352 H106 Z"/>')}
    </svg>`;
  }
  return `<svg class="bm-svg" viewBox="0 0 200 380" xmlns="http://www.w3.org/2000/svg">
    <text class="bm-lr" x="16" y="13">LINKS</text><text class="bm-lr" x="152" y="13">RECHTS</text>
    ${Z('nek','<rect class="§CLS§" §FILL§ data-blzone="nek" x="92" y="50" width="16" height="12" rx="4"/>')}
    ${Z('schoudera','<ellipse class="§CLS§" §FILL§ data-blzone="schoudera" cx="68" cy="72" rx="14" ry="11"/>')}
    ${Z('schoudera','<ellipse class="§CLS§" §FILL§ data-blzone="schoudera" cx="132" cy="72" rx="14" ry="11"/>')}
    ${Z('nek','<ellipse class="§CLS§" §FILL§ data-blzone="nek" cx="100" cy="32" rx="17" ry="20"/>')}
    ${Z('bovenrug','<path class="§CLS§" §FILL§ data-blzone="bovenrug" d="M78 64 H122 Q128 64 128 74 V98 H72 V74 Q72 64 78 64 Z"/>')}
    ${Z('onderrug','<path class="§CLS§" §FILL§ data-blzone="onderrug" d="M72 100 H128 V120 Q128 128 118 128 H82 Q72 128 72 120 Z"/>')}
    ${Z('arm','<rect class="§CLS§" §FILL§ data-blzone="arm" x="52" y="80" width="14" height="90" rx="7"/>')}
    ${Z('arm','<rect class="§CLS§" §FILL§ data-blzone="arm" x="134" y="80" width="14" height="90" rx="7"/>')}
    ${Z('bil','<path class="§CLS§" §FILL§ data-blzone="bil" d="M78 130 H99 V156 Q99 162 88 162 H80 Q74 160 74 150 V138 Q74 130 78 130 Z"/>')}
    ${Z('bil','<path class="§CLS§" §FILL§ data-blzone="bil" d="M101 130 H122 Q126 130 126 138 V150 Q126 160 120 162 H112 Q101 162 101 156 Z"/>')}
    ${Z('hamstring','<rect class="§CLS§" §FILL§ data-blzone="hamstring" x="78" y="164" width="18" height="60" rx="8"/>')}
    ${Z('hamstring','<rect class="§CLS§" §FILL§ data-blzone="hamstring" x="104" y="164" width="18" height="60" rx="8"/>')}
    ${Z('knieachter','<ellipse class="§CLS§" §FILL§ data-blzone="knieachter" cx="87" cy="234" rx="11" ry="11"/>')}
    ${Z('knieachter','<ellipse class="§CLS§" §FILL§ data-blzone="knieachter" cx="113" cy="234" rx="11" ry="11"/>')}
    ${Z('kuit','<rect class="§CLS§" §FILL§ data-blzone="kuit" x="79" y="248" width="16" height="50" rx="7"/>')}
    ${Z('kuit','<rect class="§CLS§" §FILL§ data-blzone="kuit" x="105" y="248" width="16" height="50" rx="7"/>')}
    ${Z('achilles','<rect class="§CLS§" §FILL§ data-blzone="achilles" x="83" y="300" width="9" height="22" rx="4"/>')}
    ${Z('achilles','<rect class="§CLS§" §FILL§ data-blzone="achilles" x="108" y="300" width="9" height="22" rx="4"/>')}
    ${Z('hiel','<ellipse class="§CLS§" §FILL§ data-blzone="hiel" cx="87" cy="332" rx="9" ry="10"/>')}
    ${Z('hiel','<ellipse class="§CLS§" §FILL§ data-blzone="hiel" cx="113" cy="332" rx="9" ry="10"/>')}
  </svg>`;
}

function blessureFlowHtml(p){
  const r = _blReg;
  if (!r.zone){
    return `<p class="bl-prompt">👆 Tik hierboven op het lichaam of kies een plek uit de lijst.</p>`;
  }
  const z = blessureZone(r.zone);
  const rodeVlag = isRodeVlagZone(r.zone);
  const chips = (lbl, opts, key) => `
    <div class="bl-veld"><div class="bl-lbl">${lbl}</div><div class="bl-chips">${
      opts.map(o => `<button class="bl-chip ${r[key]===o.id?'aan':''}" data-blset="${key}" data-blval="${o.id}">${esc(o.label)}</button>`).join('')
    }</div></div>`;
  const pk = r.pijn>=7?'h':r.pijn>=4?'m':'l';
  return `
    <div class="bl-gekozen">
      <span class="blg-loc">${z && z.zij && r.zij ? `<b>${r.zij}</b> · ` : ''}${esc(z?z.naam:r.zone)}</span>
      ${z && z.zij ? `<div class="bl-zij">
        <button class="${r.zij==='Links'?'aan':''}" data-blzij="Links">Links</button>
        <button class="${r.zij==='Rechts'?'aan':''}" data-blzij="Rechts">Rechts</button>
      </div>` : ''}
    </div>
    ${rodeVlag ? `<div class="bl-rodevlag">⚠️ <b>Let op:</b> klachten aan hoofd/nek/rug zijn altijd reden voor voorzichtigheid. Bij duizeligheid, misselijkheid of uitstraling: niet door laten spelen en huisarts raadplegen.</div>` : ''}
    ${chips('Type klacht', BLESSURE_TYPE, 'type')}
    ${chips('Ontstaan', BLESSURE_ONTSTAAN, 'ontstaan')}
    <div class="bl-veld"><div class="bl-lbl">Pijnscore (0–10)</div>
      <div class="bl-pijn"><input type="range" min="0" max="10" value="${r.pijn}" id="blPijn">
        <span class="blp-waarde ${pk}" id="blPijnUit">${r.pijn}</span></div></div>
    ${chips('Ernst', BLESSURE_ERNST, 'ernst')}
    <div class="bl-veld"><div class="bl-lbl">Inzetbaarheid</div>
      <div class="bl-toggles">
        <button class="bl-toggle ${r.kanTrainen?'ja':'nee'}" data-bltoggle="kanTrainen">${r.kanTrainen?'✓ Kan trainen':'✕ Niet trainen'}</button>
        <button class="bl-toggle ${r.kanSpelen?'ja':'nee'}" data-bltoggle="kanSpelen">${r.kanSpelen?'✓ Kan spelen':'✕ Niet spelen'}</button>
      </div></div>
    ${chips('Verwachte hersteltijd', BLESSURE_HERSTEL, 'herstel')}
    ${chips('Actie', BLESSURE_ACTIE.map(a=>({id:a.id,label:`${a.emoji} ${a.label}`})), 'actie')}
    <div class="bl-veld"><div class="bl-lbl">Opmerking (optioneel)</div>
      <textarea class="invoer" id="blOpm" rows="2" placeholder="Bijv. tijdens sprint, zwikte om">${esc(r.opmerking)}</textarea></div>
    <button class="knop vol" id="blOpslaan" ${r.zone && r.ernst ? '' : 'disabled'} style="margin-top:6px">✓ Blessure opslaan</button>
    <p class="hint" style="text-align:center;margin-top:8px">Locatie + ernst is genoeg. De rest kun je later aanvullen.</p>`;
}

function hertekenFlow(p){ const f = $('#blFlow'); if (f){ f.innerHTML = blessureFlowHtml(p); koppelBlessureFlow(p); } }
function hertekenBody(){ const w = document.querySelector('.bl-bodywrap'); if (w){ w.innerHTML = bodyMapSvg(_blReg.aanzicht, _blReg.zone, _blReg.ernst); koppelBodyZones(); } }

function koppelBlessureModal(p){
  document.querySelectorAll('[data-blview]').forEach(b => b.onclick = () => {
    _blReg.aanzicht = b.dataset.blview;
    // hertekenen van modal-body (view-knoppen + zonelijst + map)
    $('#modalInhoud').innerHTML = blessureModalHtml(p);
    koppelBlessureModal(p);
  });
  koppelBodyZones();
  document.querySelectorAll('[data-blzone]').forEach(b => { if (b.tagName.toLowerCase()==='button') b.onclick = () => kiesZone(b.dataset.blzone, p); });
  koppelBlessureFlow(p);
}
function koppelBodyZones(){
  document.querySelectorAll('.bm-zone[data-blzone]').forEach(z => z.onclick = () => kiesZone(z.dataset.blzone, speler(_blReg.spelerId)));
}
function kiesZone(zoneId, p){
  const z = blessureZone(zoneId);
  _blReg.zone = zoneId;
  if (z && !z.zij) _blReg.zij = null;
  hertekenBody(); hertekenFlow(p);
}
function koppelBlessureFlow(p){
  document.querySelectorAll('[data-blset]').forEach(b => b.onclick = () => {
    const k = b.dataset.blset, val = b.dataset.blval;
    _blReg[k] = _blReg[k] === val ? null : val;
    if (k === 'ernst') hertekenBody();
    hertekenFlow(p);
  });
  document.querySelectorAll('[data-blzij]').forEach(b => b.onclick = () => { _blReg.zij = b.dataset.blzij; hertekenFlow(p); });
  document.querySelectorAll('[data-bltoggle]').forEach(b => b.onclick = () => { _blReg[b.dataset.bltoggle] = !_blReg[b.dataset.bltoggle]; hertekenFlow(p); });
  const pijn = $('#blPijn');
  if (pijn) pijn.oninput = e => {
    _blReg.pijn = +e.target.value;
    const u = $('#blPijnUit'); u.textContent = _blReg.pijn;
    u.className = 'blp-waarde ' + (_blReg.pijn>=7?'h':_blReg.pijn>=4?'m':'l');
  };
  const opm = $('#blOpm'); if (opm) opm.oninput = e => { _blReg.opmerking = e.target.value; };
  const ok = $('#blOpslaan'); if (ok) ok.onclick = () => {
    if (_blReg._bewerkId) updateBlessure(p, _blReg._bewerkId);
    else slaBlessureOp(p);
  };
}

async function slaBlessureOp(p){
  const r = _blReg;
  if (!r.zone || !r.ernst){ meld('Kies minimaal een plek en de ernst'); return; }
  const z = blessureZone(r.zone);
  const terugkerend = isTerugkerend(r.spelerId, r.zone, r.datum, null);
  // Dataminimalisatie: alleen relevante velden, geen vrije medische tekst verplicht.
  const data = {
    spelerId: r.spelerId,
    datum: r.datum,
    zone: r.zone, zoneNaam: z?z.naam:r.zone,
    zij: (z && z.zij) ? (r.zij || null) : null,
    aanzicht: r.aanzicht,
    type: r.type || null,
    ontstaan: r.ontstaan || null,
    pijn: r.pijn,
    ernst: r.ernst,
    kanTrainen: !!r.kanTrainen,
    kanSpelen: !!r.kanSpelen,
    herstel: r.herstel || null,
    actie: r.actie || null,
    opmerking: (r.opmerking||'').trim().slice(0, 500),
    status: 'actief',
    rtpFase: r.kanSpelen ? null : 'rust',
    terugkerend,
    door: S.user?.uid || null,
    gemaakt: serverTimestamp(),
    gemaaktMs: Date.now(),
  };
  try {
    await addDoc(collection(db,'teams',S.teamId,'blessures'), data);
    sluitModal();
    meld(terugkerend ? 'Opgeslagen — let op: terugkerende klacht' : 'Blessure opgeslagen');
  } catch(e){ meld('Opslaan mislukt: ' + (e.code||e.message)); }
}

/* ---- Detail / bewerken / herstel ---- */
function modalBlessureDetail(blessureId){
  const b = (S.blessures||[]).find(x => x.id === blessureId);
  if (!b) return;
  const p = speler(b.spelerId);
  const ei = ernstInfo(b.ernst);
  const huidigeFase = b.rtpFase || (b.status==='hersteld' ? 'wedstrijd-vol' : 'rust');
  openModal(`
    <h2>${esc(zoneLabel(b))}</h2>
    <div class="bd-top">
      <span class="bd-ernst" style="background:${ei?ei.kleur:'var(--ink-2)'}">${ei?esc(ei.label):'—'}</span>
      <span class="bd-status" style="color:${statusInfo(b.status).kleur}">${statusInfo(b.status).label}</span>
      ${b.terugkerend?'<span class="bd-recidief">↻ terugkerend</span>':''}
    </div>
    <div class="bd-grid">
      <div><span class="l">Speler</span><span class="v">${esc(p?p.naam:'—')}</span></div>
      <div><span class="l">Datum</span><span class="v">${datumNL(b.datum)}</span></div>
      <div><span class="l">Type</span><span class="v">${esc(BLESSURE_TYPE.find(t=>t.id===b.type)?.label||'—')}</span></div>
      <div><span class="l">Ontstaan</span><span class="v">${esc(BLESSURE_ONTSTAAN.find(o=>o.id===b.ontstaan)?.label||'—')}</span></div>
      <div><span class="l">Pijn</span><span class="v">${b.pijn ?? '—'}/10</span></div>
      <div><span class="l">Hersteltijd</span><span class="v">${esc(BLESSURE_HERSTEL.find(h=>h.id===b.herstel)?.label||'—')}</span></div>
      <div><span class="l">Trainen</span><span class="v">${b.kanTrainen?'Ja':'Nee'}</span></div>
      <div><span class="l">Spelen</span><span class="v">${b.kanSpelen?'Ja':'Nee'}</span></div>
      <div><span class="l">Actie</span><span class="v">${esc(actieInfo(b.actie) ? actieInfo(b.actie).emoji+' '+actieInfo(b.actie).label : '—')}</span></div>
    </div>
    ${b.opmerking ? `<div class="bd-opm"><span class="l">Opmerking</span><p>${esc(b.opmerking)}</p></div>` : ''}

    <div class="bd-rtp">
      <div class="bl-lbl">Terugkeer (return-to-play)</div>
      <div class="rtp-balk">
        ${RTP_FASEN.map(f => {
          const huidig = rtpInfo(huidigeFase);
          const actief = huidig && f.stap <= huidig.stap;
          return `<button class="rtp-stap ${actief?'aan':''} ${f.id===huidigeFase?'nu':''}" data-rtp="${f.id}" data-bl="${b.id}" title="${esc(f.label)}">
            <span class="rtp-dot"></span><span class="rtp-lbl">${esc(f.label)}</span></button>`;
        }).join('')}
      </div>
    </div>

    <div class="rij" style="margin-top:14px">
      ${b.status!=='hersteld'
        ? `<button class="knop fluo klein" style="flex:1" data-bl-herstel="${b.id}">✓ Markeer hersteld</button>`
        : `<button class="knop licht klein" style="flex:1" data-bl-heropen="${b.id}">↩ Heropenen</button>`}
      <button class="knop licht klein" style="flex:1" data-bl-bewerk="${b.id}">✏️ Bewerken</button>
    </div>
    <button class="knop gevaar klein" style="width:100%;margin-top:6px" data-bl-weg="${b.id}">🗑 Verwijderen (AVG)</button>
    <p class="hint" style="margin-top:8px">Verwijderen wist deze registratie definitief — gebruik dit bij een inzage-/verwijderverzoek.</p>
  `);
  koppelBlessureDetail(b);
}

function koppelBlessureDetail(b){
  document.querySelectorAll('[data-rtp]').forEach(btn => btn.onclick = async () => {
    const fase = btn.dataset.rtp;
    const nieuwStatus = fase === 'wedstrijd-vol' ? 'herstellend' : (b.status==='hersteld'?'herstellend':b.status||'actief');
    try {
      await updateDoc(doc(db,'teams',S.teamId,'blessures',b.id), { rtpFase: fase, status: nieuwStatus });
      modalBlessureDetail(b.id);
    } catch(e){ meld('Mislukt: '+(e.code||e.message)); }
  });
  const h = document.querySelector('[data-bl-herstel]');
  if (h) h.onclick = async () => {
    try {
      await updateDoc(doc(db,'teams',S.teamId,'blessures',b.id), {
        status:'hersteld', rtpFase:'wedstrijd-vol', afgesloten: vandaagIso(),
      });
      sluitModal(); meld('Gemarkeerd als hersteld 🎉');
    } catch(e){ meld('Mislukt: '+(e.code||e.message)); }
  };
  const ho = document.querySelector('[data-bl-heropen]');
  if (ho) ho.onclick = async () => {
    try { await updateDoc(doc(db,'teams',S.teamId,'blessures',b.id), { status:'actief', afgesloten:null }); modalBlessureDetail(b.id); }
    catch(e){ meld('Mislukt: '+(e.code||e.message)); }
  };
  const bw = document.querySelector('[data-bl-bewerk]');
  if (bw) bw.onclick = () => modalBlessureBewerk(b.id);
  const wg = document.querySelector('[data-bl-weg]');
  if (wg) wg.onclick = async () => {
    if (!confirm('Deze blessure definitief verwijderen? Dit kan niet ongedaan gemaakt worden.')) return;
    try { await deleteDoc(doc(db,'teams',S.teamId,'blessures',b.id)); sluitModal(); meld('Verwijderd'); }
    catch(e){ meld('Mislukt: '+(e.code||e.message)); }
  };
}

/* bewerken = registratiemodal voorgevuld, slaat met updateDoc op.
   _bewerkId in _blReg zorgt dat de opslaan-knop naar updateBlessure gaat. */
function modalBlessureBewerk(blessureId){
  const b = (S.blessures||[]).find(x => x.id === blessureId);
  if (!b) return;
  const p = speler(b.spelerId); if (!p) return;
  _blReg = { spelerId:b.spelerId, datum:b.datum, aanzicht:b.aanzicht||'voor',
    zone:b.zone, zij:b.zij, type:b.type, ontstaan:b.ontstaan, pijn:b.pijn??3, ernst:b.ernst,
    kanTrainen:b.kanTrainen!==false, kanSpelen:b.kanSpelen!==false, herstel:b.herstel, actie:b.actie,
    opmerking:b.opmerking||'', _bewerkId:b.id };
  openModal(blessureModalHtml(p));
  koppelBlessureModal(p);
}
async function updateBlessure(p, id){
  const r = _blReg;
  if (!r.zone || !r.ernst){ meld('Kies minimaal een plek en de ernst'); return; }
  const z = blessureZone(r.zone);
  try {
    await updateDoc(doc(db,'teams',S.teamId,'blessures',id), {
      datum:r.datum, zone:r.zone, zoneNaam:z?z.naam:r.zone,
      zij:(z&&z.zij)?(r.zij||null):null, aanzicht:r.aanzicht,
      type:r.type||null, ontstaan:r.ontstaan||null, pijn:r.pijn, ernst:r.ernst,
      kanTrainen:!!r.kanTrainen, kanSpelen:!!r.kanSpelen,
      herstel:r.herstel||null, actie:r.actie||null,
      opmerking:(r.opmerking||'').trim().slice(0,500),
      terugkerend: isTerugkerend(r.spelerId, r.zone, r.datum, id),
    });
    sluitModal(); meld('Bijgewerkt');
  } catch(e){ meld('Mislukt: '+(e.code||e.message)); }
}

/* ---- Team-dashboard Fitheid ---- */
function htmlFitDashboard(){
  if (!heeftBlessureToestemming()){
    return `<button class="profiel-terug" id="fitTerug">‹ Terug naar spelers</button>
      <div class="kop2">🩹 Fitheid — team</div>${htmlBlessureConsentGate()}`;
  }
  const actief = actieveBlessures();
  const perSpeler = {};
  for (const b of actief){ (perSpeler[b.spelerId] = perSpeler[b.spelerId]||[]).push(b); }
  const risico = [];
  for (const p of S.spelers){
    const recidief = blessuresVanSpeler(p.id).filter(b => b.terugkerend).length;
    const open = (perSpeler[p.id]||[]).length;
    if (recidief || open) risico.push({p, recidief, open});
  }
  risico.sort((a,b)=> (b.recidief-b.open*0) - (a.recidief) || b.open-a.open);

  // meest voorkomende zones (team)
  const zoneTel = {};
  for (const b of (S.blessures||[])) zoneTel[b.zone] = (zoneTel[b.zone]||0)+1;
  const topZones = Object.entries(zoneTel).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxZone = topZones.length ? topZones[0][1] : 1;

  const fitCount = S.spelers.length - Object.keys(perSpeler).length;

  return `
    <button class="profiel-terug" id="fitTerug">‹ Terug naar spelers</button>
    <div class="kop2">🩹 Fitheid — ${esc(S.team.naam)}</div>

    <div class="fit-tellers">
      <div class="ft-box rood"><div class="v">${Object.keys(perSpeler).length}</div><div class="l">Actief</div></div>
      <div class="ft-box geel"><div class="v">${risico.filter(r=>r.recidief).length}</div><div class="l">Aandacht</div></div>
      <div class="ft-box groen"><div class="v">${Math.max(0,fitCount)}</div><div class="l">Fit</div></div>
    </div>

    ${actief.length ? `
      <div class="veldlabel">Actieve klachten</div>
      ${actief.map(b => {
        const p = speler(b.spelerId);
        return `<button class="blessure-kaart" data-blessure-detail="${b.id}">
          <span class="bk-ernst" style="background:${ernstKleur(b.ernst)}"></span>
          <div class="bk-mid"><div class="bk-loc">${esc(p?p.naam:'—')} · ${esc(zoneLabel(b))}</div>
            <div class="bk-meta">${esc(ernstInfo(b.ernst)?.label||'—')} · loopt ${dagenGeleden(b.datum)} d${b.kanSpelen?'':' · niet inzetbaar'}</div></div>
          <span class="bk-status">›</span></button>`;
      }).join('')}` : `<div class="kaart leeg">Geen actieve klachten in het team. 💪</div>`}

    ${risico.filter(r=>r.recidief).length ? `
      <div class="kaart hotspot-kaart">
        <div class="veldlabel" style="margin-top:0">⚠️ Verhoogd risico</div>
        ${risico.filter(r=>r.recidief).map(r =>
          `<div class="hotspot-rij"><span class="hs-naam">${esc(r.p.naam)}</span><span class="hs-tel">${r.recidief}× terugkerend</span></div>`).join('')}
        <p class="hint">Terugkerende klachten kunnen wijzen op te snelle terugkeer of onderliggende overbelasting.</p>
      </div>` : ''}

    ${topZones.length ? `
      <div class="kaart">
        <div class="veldlabel" style="margin-top:0">Meest voorkomende klachten</div>
        ${topZones.map(([z,n]) => {
          const zi = blessureZone(z);
          return `<div class="zonebar-rij"><span class="zb-naam">${esc(zi?zi.naam:z)}</span>
            <span class="zb-balk"><span style="width:${Math.round(n/maxZone*100)}%"></span></span>
            <span class="zb-n">${n}</span></div>`;
        }).join('')}
        <p class="hint">Veel klachten op één plek? Overweeg gerichte preventie (bv. hamstrings → Nordic-oefeningen, enkels → balanstraining).</p>
      </div>` : ''}

    <div class="kaart preventie-kaart">
      <div class="veldlabel" style="margin-top:0">💡 Preventie-principes</div>
      <ul class="prev-lijst">
        <li><b>Belasting opbouwen, niet springen.</b> Na vakantie of een toernooi: rustig opbouwen.</li>
        <li><b>Vaste warming-up</b> met loop-, sprong- en balansoefeningen (FIFA 11+ Kids).</li>
        <li><b>Terugkeer in stappen:</b> rust → aangepast → volledig trainen → wedstrijd.</li>
        <li><b>Rode vlaggen</b> (hoofd, aanhoudende pijn, niet kunnen steunen) → huisarts/fysio.</li>
      </ul>
      <p class="hint">Deze module signaleert en registreert — ze vervangt geen medisch advies en stelt geen diagnose.</p>
    </div>`;
}

/* Event-handlers voor alle fitheid-onderdelen (profiel-tab én team-dashboard) */
function koppelFitheid(v){
  // consent gate
  const vink = v.querySelector('#consentVink');
  const cok = v.querySelector('#consentOk');
  if (vink && cok){
    vink.onchange = () => { cok.disabled = !vink.checked; };
    cok.onclick = async () => {
      cok.disabled = true; cok.textContent = 'Inschakelen…';
      try {
        await updateDoc(doc(db,'teams',S.teamId), {
          blessureToestemming: { akkoord:true, door:S.user?.uid||null, op:vandaagIso() },
        });
        meld('Fitheidsregistratie ingeschakeld');
        // team-listener werkt S.team bij → render volgt automatisch; forceer voor de zekerheid
        renderTeam();
      } catch(e){ cok.disabled=false; cok.textContent='Fitheidsregistratie inschakelen'; meld('Mislukt: '+(e.code||e.message)); }
    };
  }
  // nieuwe blessure
  v.querySelectorAll('[data-blessure-nieuw]').forEach(b => b.onclick = () => modalBlessureNieuw(b.dataset.blessureNieuw));
  // detail openen
  v.querySelectorAll('[data-blessure-detail]').forEach(b => b.onclick = () => modalBlessureDetail(b.dataset.blessureDetail));
}
