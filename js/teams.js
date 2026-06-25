import {
  db, collection, doc, addDoc, deleteDoc, updateDoc, deleteField,
  setDoc, getDocs, query, where, onSnapshot, serverTimestamp
} from './firebase.js';
import {
  S, $, $$, esc, meld, datumNL, teamCode, clubAfkorting, speler, initialen, isBeheerder,
  openModal, sluitModal, toon, stopUnsubs
} from './state.js';
import { CATEGORIEEN, CATEGORIEEN_MEIDEN, catInfo, youtubeId, youtubeThumb, youtubeWatch } from './config.js';
import { analyseWedstrijd } from './analyse.js';
import { doSignOut, joinMetCode } from './auth.js';
import { openClub, modalNieuwClub, modalUitnodig } from './club.js';
import {
  openWedstrijd, modalNieuweWedstrijd, htmlStats, renderWedstrijd
} from './wedstrijd.js';

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
  stopUnsubs('team','spelers','wedstrijden','presentie');
  S.unsub.team = onSnapshot(doc(db,'teams',teamId), snap => {
    if (!snap.exists()){ verlaatTeamView(); return; }
    S.team = {id:snap.id, ...snap.data()};
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
  toon('team');
}
export function verlaatTeamView(){
  stopUnsubs('team','spelers','wedstrijden','presentie');
  S.teamId = null; S.team = null; S.spelers = []; S.wedstrijden = [];
  renderTeams(); toon('teams');
}

export function renderTeam(){
  if (!S.team) return;
  const v = $('#view-team');
  const tab = S.teamTab;
  let inhoud = '';
  if (tab === 'wedstrijden') inhoud = htmlWedstrijden();
  if (tab === 'spelers')     inhoud = htmlSpelers();
  if (tab === 'stats')       inhoud = htmlStats();
  if (tab === 'trainingen')  inhoud = htmlTeamTrainingen();
  if (tab === 'videos')      inhoud = htmlTeamVideos();
  if (tab === 'instellingen')inhoud = htmlInstellingen();
  if (tab === 'help')        inhoud = htmlHandleiding();

  const teamTrainingen = S.trainingen.filter(t => (t.teams||[]).includes(S.teamId));
  const ongelezen = teamTrainingen.filter(t => !S.trainingenGelezen[t.id]).length;

  v.innerHTML = `
    <div class="kop"><button class="terug" id="naarTeams">‹</button>
      <h1>${esc(S.team.naam)}<span class="sub">${S.team.categorie ? esc(S.team.categorie)+' · ' : ''}${esc(S.team.format)} tegen ${esc(S.team.format)}</span></h1>
      <button class="terug" id="teamInstel" title="Teaminstellingen">⚙️</button></div>
    ${inhoud}
    <nav class="onderbalk">
      ${[['wedstrijden','📋','Wedstr.'],['spelers','👕','Spelers'],['trainingen','📄','Training'],['videos','🎬','Video'],['stats','⏱','Stats'],['help','❓','Help']]
        .map(([id,ico,naam]) => `<button data-tab="${id}" class="${tab===id?'actief':''}"><span class="ico">${ico}</span><span class="tablabel">${naam}${id==='trainingen' && ongelezen ? '<span class="puntje"></span>' : ''}</span></button>`).join('')}
    </nav>`;

  v.querySelector('#naarTeams').onclick = verlaatTeamView;
  v.querySelector('#teamInstel').onclick = () => { S.teamTab = 'instellingen'; renderTeam(); };
  v.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.teamTab = b.dataset.tab; renderTeam(); });
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
  return `
    <button class="knop vol" id="nieuweSpeler" style="margin-bottom:14px">+ Speler toevoegen</button>
    ${S.spelers.length ? S.spelers.map(p => `
      <div class="speler-rij">
        <div class="mini-shirt">${esc(p.nummer ?? '·')}</div>
        <div class="n">${esc(p.naam)}</div>
        <button class="actie" data-bewerk-p="${p.id}">✏️</button>
        <button class="actie" data-weg-p="${p.id}">🗑</button>
      </div>`).join('')
    : `<div class="kaart leeg">Nog geen spelers.<br>Voeg je selectie toe — naam en rugnummer is genoeg.</div>`}`;
}

/* ---------- Afgelasting: geldt de afgelasting nog? ----------
   Een afgelasting hangt op het team-document (S.team.afgelast = {datum, reden, door, tijd}).
   Hij is geldig t/m de opgegeven datum; daarna 'verlopen' en tonen we hem niet meer. */
function afgelastGeldig(){
  const a = S.team && S.team.afgelast;
  if (!a || !a.datum) return null;
  const vandaag = new Date().toISOString().slice(0,10);
  return (a.datum >= vandaag) ? a : null;   // alleen vandaag of in de toekomst
}

/* datum 'YYYY-MM-DD' -> 'donderdag 25 juni' (met hoofdletter) */
function afgelastDatumTekst(datum){
  const d = new Date(datum+'T12:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  return d.charAt(0).toUpperCase()+d.slice(1);
}

/* de WhatsApp-tekst die wordt voorgevuld bij delen */
function afgelastWhatsappTekst(a){
  const dag = afgelastDatumTekst(a.datum);
  let t = `⛔ *${S.team.naam} — training afgelast*\n`;
  t += `De training van ${dag} gaat *niet* door.`;
  if (a.reden && a.reden.trim()) t += `\n\n${a.reden.trim()}`;
  return t;
}

/* de rode banner bovenaan de trainingen-tab */
function afgelastBannerHtml(a){
  const dag = afgelastDatumTekst(a.datum);
  return `
    <div class="afgelast-banner">
      <div class="ab-kop"><span class="ab-ico">⛔</span><h2>Training afgelast</h2></div>
      <div class="ab-tekst">De training van <b>${esc(dag)}</b> gaat <b>niet</b> door.
        ${a.reden && a.reden.trim() ? `<div class="ab-reden">${esc(a.reden.trim())}</div>` : ''}
        ${a.door ? `<div class="ab-door">Afgelast door ${esc(a.door)}</div>` : ''}</div>
      <div class="ab-knoppen">
        <button class="ab-wa" id="afgelastDeel">📲 Deel via WhatsApp</button>
        <button class="ab-op" id="afgelastOpheffen">Opheffen</button>
      </div>
    </div>`;
}

/* ---------- Tab: trainingen (presentie + gedeelde PDF's) ---------- */
function htmlTeamTrainingen(){
  const pdfs = S.trainingen.filter(t => (t.teams||[]).includes(S.teamId));
  const vandaag = new Date().toISOString().slice(0,10);
  const alGeregistreerd = S.presentie.find(p => p.datum === vandaag);

  // afgelasting: toon banner als die geldt, anders een knop om af te lasten
  const afg = afgelastGeldig();
  const afgelastSectie = afg
    ? afgelastBannerHtml(afg)
    : `<button class="aflas-knop" id="aflasStart">⛔ Training afgelasten</button>`;

  // welke maanden zijn opengeklapt? standaard alleen de huidige maand.
  if (!S._presentieOpen){
    S._presentieOpen = new Set([vandaag.slice(0,7)]);   // 'YYYY-MM'
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

    <p style="font-size:12.5px;color:var(--ink-2);text-align:center;margin-top:20px;padding-top:14px;border-top:1px solid var(--hair)">
      Vragen of ideeën? Geef ze door aan je hoofdcoach.<br>Veel succes langs de lijn! ⚽
    </p>
  </div>`;
}

function koppelTeamTab(v, tab){
  if (tab === 'trainingen'){
    // --- afgelasting ---
    const aflasStart = v.querySelector('#aflasStart');
    if (aflasStart) aflasStart.onclick = () => modalAflasten();
    const afgDeel = v.querySelector('#afgelastDeel');
    if (afgDeel) afgDeel.onclick = () => {
      const a = afgelastGeldig();
      if (!a) return;
      const tekst = encodeURIComponent(afgelastWhatsappTekst(a));
      window.open('https://wa.me/?text=' + tekst, '_blank');
    };
    const afgOp = v.querySelector('#afgelastOpheffen');
    if (afgOp) afgOp.onclick = async () => {
      if (!confirm('Afgelasting opheffen? De training gaat dan weer gewoon door.')) return;
      try {
        await updateDoc(doc(db,'teams',S.teamId), { afgelast: deleteField() });
        meld('Afgelasting opgeheven');
      } catch(e){ meld('Opheffen mislukt: ' + (e.code || e.message)); }
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
  if (tab === 'spelers'){
    v.querySelector('#nieuweSpeler').onclick = () => modalSpeler();
    v.querySelectorAll('[data-bewerk-p]').forEach(b => b.onclick = () => modalSpeler(speler(b.dataset.bewerkP)));
    v.querySelectorAll('[data-weg-p]').forEach(b => b.onclick = async () => {
      const p = speler(b.dataset.wegP);
      if (confirm(`${p.naam} verwijderen uit de selectie?`))
        await deleteDoc(doc(db,'teams',S.teamId,'spelers',p.id));
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
}

function modalSpeler(p){
  openModal(`
    <h2>${p ? 'Speler bewerken' : 'Speler toevoegen'}</h2>
    <div class="rij">
      <div class="veldgroep" style="flex:3"><label>Naam</label>
        <input class="invoer" id="mSpNaam" value="${esc(p?.naam||'')}" placeholder="Voornaam" autocomplete="off"></div>
      <div class="veldgroep" style="flex:1"><label>Nr.</label>
        <input class="invoer" id="mSpNr" value="${esc(p?.nummer ?? '')}" inputmode="numeric" placeholder="7"></div>
    </div>
    <button class="knop vol" id="mSpOk">${p ? 'Opslaan' : 'Toevoegen'}</button>`);
  const ok = async (sluiten) => {
    const naam = $('#mSpNaam').value.trim();
    if (!naam) return meld('Vul een naam in');
    const nr = $('#mSpNr').value.trim();
    const data = {naam, nummer: nr === '' ? null : Number(nr)};
    if (p) await updateDoc(doc(db,'teams',S.teamId,'spelers',p.id), data);
    else   await addDoc(collection(db,'teams',S.teamId,'spelers'), data);
    if (sluiten) sluitModal();
    else { $('#mSpNaam').value=''; $('#mSpNr').value=''; $('#mSpNaam').focus(); meld(naam+' toegevoegd'); }
  };
  $('#mSpOk').onclick = () => ok(!!p);
  $('#mSpNaam').addEventListener('keydown', e => { if (e.key === 'Enter') ok(false); });
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
/* ---------- Modal: training afgelasten ---------- */
function modalAflasten(){
  const vandaag = new Date().toISOString().slice(0,10);
  // standaard al ingevuld op vandaag; coach kan een andere dag kiezen
  openModal(`
    <h2>Training afgelasten</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:14px">Kies voor welke dag de training niet doorgaat. Daarna kun je het meteen delen via WhatsApp.</p>
    <div class="veldgroep"><label>Welke dag?</label>
      <input class="invoer" id="mAflasDatum" type="date" value="${vandaag}" min="${vandaag}"></div>
    <div class="veldgroep"><label>Reden (optioneel)</label>
      <input class="invoer" id="mAflasReden" placeholder="Bijv. slecht weer, veld onbespeelbaar" autocomplete="off" maxlength="140"></div>
    <div class="rij" style="margin-top:6px">
      <button class="knop licht vol" id="mAflasAnnuleer">Annuleren</button>
      <button class="knop vol" id="mAflasOk">Aflasten</button>
    </div>`);

  $('#mAflasAnnuleer').onclick = () => sluitModal();
  $('#mAflasOk').onclick = async () => {
    const datum = $('#mAflasDatum').value;
    if (!datum) return meld('Kies eerst een dag');
    const reden = $('#mAflasReden').value.trim();
    const knop = $('#mAflasOk'); knop.disabled = true; knop.textContent = 'Aflasten...';
    const data = {
      datum,
      reden: reden || '',
      door: S.team.ledenInfo?.[S.user.uid]?.naam || S.user.displayName || S.user.email || '',
      tijd: serverTimestamp(),
    };
    try {
      await updateDoc(doc(db,'teams',S.teamId), { afgelast: data });
      sluitModal();
      // direct delen aanbieden: open WhatsApp met de voorgevulde tekst
      const tekst = encodeURIComponent(afgelastWhatsappTekst({datum, reden}));
      window.open('https://wa.me/?text=' + tekst, '_blank');
      meld('Training afgelast — deel het bericht in je teamgroep');
    } catch(e){
      knop.disabled = false; knop.textContent = 'Aflasten';
      meld('Aflasten mislukt: ' + (e.code || e.message));
    }
  };
}

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
