import {
  db, storage, collection, doc, addDoc, deleteDoc, updateDoc, deleteField, getDoc, setDoc, getDocs,
  query, where, onSnapshot, serverTimestamp, documentId,
  sRef, uploadBytes, getDownloadURL, deleteObject,
  functions, httpsCallable
} from './firebase.js';
import {
  S, $, $$, esc, meld, nieuweCode, teamCode, clubAfkorting, openModal, sluitModal, toon, stopUnsubs
} from './state.js';
import { CATEGORIEEN, CATEGORIEEN_MEIDEN, catInfo, BOUWEN, bouwVanCategorie, bouwNaam, youtubeId, youtubeThumb, youtubeWatch } from './config.js';

/* openTeam en modalNieuwTeam komen uit teams.js; om kringverwijzing te
   vermijden importeren we ze lui binnen de functies die ze nodig hebben. */
async function teamsModule(){ return await import('./teams.js'); }

/* ==================== CLUB AANMAKEN ==================== */
export function modalNieuwClub(){
  openModal(`
    <h2>🏛 Nieuwe club</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">Als club-admin maak jij teams aan en deel je trainingen voor alle teams. Coaches nodig je uit met een persoonlijke teamlink.</p>
    <div class="veldgroep"><label>Clubnaam</label>
      <input class="invoer" id="mClubNaam" placeholder="Bijv. RKVV Mifano" autocomplete="off"></div>
    <button class="knop vol" id="mClubOk">Club aanmaken</button>`);
  $('#mClubOk').onclick = async () => {
    const naam = $('#mClubNaam').value.trim();
    if (!naam) return meld('Vul een clubnaam in');
    const ref = await addDoc(collection(db,'clubs'), {
      naam, code: nieuweCode(),
      admins: {[S.user.uid]: true},
      adminsInfo: {[S.user.uid]: {naam: S.user.displayName || S.user.email}},
      leden: {[S.user.uid]: true},
      teams: {},
      gemaakt: serverTimestamp(),
    });
    sluitModal(); openClub(ref.id);
  };
}

export function openClub(clubId){
  S.clubId = clubId; S.clubTab = 'teams'; S.teamId = null;
  S.clubTrainBouw = S.clubTrainBouw || 'onder';
  stopUnsubs('club');
  S.unsub.club = onSnapshot(doc(db,'clubs',clubId), snap => {
    if (!snap.exists()){ verlaatClubView(); return; }
    S.club = {id:snap.id, ...snap.data()};
    renderClub();
  });
  toon('club');
}

export function verlaatClubView(){
  stopUnsubs('club');
  S.clubId = null; S.club = null;
  import('./teams.js').then(m => { m.renderTeams(); toon('teams'); });
}

async function clubTeamsOphalen(){
  const ids = Object.keys(S.club.teams || {});
  if (!ids.length) return [];
  const result = [];
  for (let i = 0; i < ids.length; i += 30){
    const chunk = ids.slice(i, i+30);
    const snap = await getDocs(query(collection(db,'teams'), where(documentId(), 'in', chunk)));
    snap.docs.forEach(d => result.push({id:d.id, ...d.data()}));
  }
  return result.sort((a,b) => (a.naam||'').localeCompare(b.naam||''));
}

async function clubTrainingenOphalen(){
  const snap = await getDocs(query(collection(db,'trainingen'), where('club','==',S.clubId)));
  return snap.docs.map(d => ({id:d.id, ...d.data()}))
    .sort((a,b) => (b.week||'').localeCompare(a.week||'') || (b.gemaakt?.seconds||0) - (a.gemaakt?.seconds||0));
}

async function clubVideosOphalen(){
  const snap = await getDocs(query(collection(db,'videos'), where('club','==',S.clubId)));
  return snap.docs.map(d => ({id:d.id, ...d.data()}))
    .sort((a,b) => (b.gemaakt?.seconds||0) - (a.gemaakt?.seconds||0));
}

/* haalt de token uit een geplakte voetbal.nl-link.
   Accepteert de hele URL (…ical-team?token=XXXX) of een kale token. */
function extraheerToken(ruw){
  const s = ruw.trim();
  const m = s.match(/[?&]token=([A-Za-z0-9]+)/);
  if (m) return m[1];
  // geen URL? accepteer een kale token (alleen letters/cijfers, redelijke lengte)
  if (/^[A-Za-z0-9]{15,}$/.test(s)) return s;
  return null;
}

/* afgelast-historie: centrale lijst onder clubs/{clubId}/afgelastingen (nieuw → oud) */
async function clubAfgelastingenOphalen(){
  const snap = await getDocs(collection(db,'clubs',S.clubId,'afgelastingen'));
  return snap.docs.map(d => ({id:d.id, ...d.data()}))
    .sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
}

/* voetbal.nl-syncstatus per team uit clubs/{clubId}/geheim/{teamId}.
   We lezen alleen de statusvelden (laatsteSync, laatsteAantal, laatsteFout) en
   of er een token staat — de token-waarde zelf tonen we nooit. */
async function clubSyncStatusOphalen(teams){
  const status = {};
  await Promise.all(teams.map(async t => {
    try {
      const snap = await getDoc(doc(db,'clubs',S.clubId,'geheim',t.id));
      if (snap.exists()){
        const d = snap.data();
        status[t.id] = {
          gekoppeld: !!d.icalToken,
          laatsteSync: d.laatsteSync || null,
          laatsteAantal: d.laatsteAantal ?? null,
          laatsteFout: d.laatsteFout || null,
        };
      } else {
        status[t.id] = { gekoppeld: false };
      }
    } catch(e){
      status[t.id] = { gekoppeld: false };
    }
  }));
  return status;
}

/* 'YYYY-MM-DD' -> 'do 25 jun' (kort, voor de statslijst) */
function afgKort(datum){
  try { return new Date(datum+'T12:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'}); }
  catch { return datum; }
}

async function renderClub(){
  if (!S.club) return;
  const v = $('#view-club');
  const teams = await clubTeamsOphalen();
  S.clubTeams = teams;
  const trainingen = await clubTrainingenOphalen();
  S.clubTrainingen = trainingen;
  const videos = await clubVideosOphalen();
  S.clubVideos = videos;
  const afgelastingen = await clubAfgelastingenOphalen();
  S.clubAfgelastingen = afgelastingen;
  const tab = S.clubTab;
  // syncstatus per team ophalen (alleen nodig op de instel-tab, om reads te sparen)
  let syncStatus = {};
  if (tab === 'instel'){
    syncStatus = await clubSyncStatusOphalen(teams);
  }
  let inhoud = '';
  if (tab === 'teams')      inhoud = htmlClubTeams(teams, afgelastingen);
  if (tab === 'trainingen') inhoud = htmlClubTrainingen(teams, trainingen);
  if (tab === 'videos')     inhoud = htmlClubVideos(teams, videos);
  if (tab === 'instel')     inhoud = htmlClubInstel(teams, syncStatus);
  v.innerHTML = `
    <div class="kop"><button class="terug" id="naarTeams">‹</button>
      <h1>🏛 ${esc(S.club.naam)}<span class="sub">${Object.keys(S.club.teams||{}).length} teams · clubcode ${esc(S.club.code)}</span></h1></div>
    ${inhoud}
    <nav class="onderbalk">
      ${[['teams','👥','Teams'],['trainingen','📄','Training'],['videos','🎬','Videos'],['instel','⚙️','Club']]
        .map(([id,ico,naam]) => `<button data-ctab="${id}" class="${tab===id?'actief':''}"><span class="ico">${ico}</span>${naam}</button>`).join('')}
    </nav>`;
  v.querySelector('#naarTeams').onclick = verlaatClubView;
  v.querySelectorAll('[data-ctab]').forEach(b => b.onclick = () => { S.clubTab = b.dataset.ctab; renderClub(); });
  koppelClubTab(v, tab, teams, trainingen, videos);
}

function htmlClubTeams(teams, afgelastingen = []){
  // is er nu een geldige (vandaag of toekomstige) afgelasting actief?
  const vandaag = new Date().toISOString().slice(0,10);
  const actief = afgelastingen.find(a => a.datum >= vandaag);

  // stats: tel afgelastingen in het lopende seizoen-jaar (laatste 12 mnd is simpel en duidelijk)
  const grens = new Date(Date.now() - 365*24*3600*1000).toISOString().slice(0,10);
  const recent = afgelastingen.filter(a => a.datum >= grens);
  const laatste5 = afgelastingen.slice(0, 5);

  const afgelastBlok = `
    <div class="club-afgelast-blok">
      ${actief
        ? `<div class="caf-actief">
             <div class="caf-actief-kop"><span>⛔</span><b>Training afgelast — ${esc(afgKort(actief.datum))}</b></div>
             ${actief.reden ? `<div class="caf-actief-reden">${esc(actief.reden)}</div>` : ''}
             <button class="knop licht vol caf-op" id="clubAfgelastOpheffen">Afgelasting opheffen</button>
           </div>`
        : `<button class="knop vol caf-aflast" id="clubAflast">⛔ Training afgelasten (clubbreed)</button>`}
      <div class="caf-stats">
        <div class="caf-stat"><span class="caf-getal">${recent.length}</span><span class="caf-label">laatste 12 mnd</span></div>
        <div class="caf-stat"><span class="caf-getal">${afgelastingen.length}</span><span class="caf-label">totaal</span></div>
      </div>
      ${laatste5.length ? `
        <div class="caf-historie">
          <div class="caf-historie-kop">Recente afgelastingen</div>
          ${laatste5.map(a => `
            <div class="caf-rij">
              <span class="caf-rij-datum">${esc(afgKort(a.datum))}</span>
              <span class="caf-rij-reden">${a.reden ? esc(a.reden) : '—'}</span>
            </div>`).join('')}
        </div>` : ''}
    </div>`;

  return `
    ${afgelastBlok}
    <button class="knop vol" id="clubNieuwTeam" style="margin-bottom:8px">+ Team aanmaken voor deze club</button>
    <div class="rij" style="margin-bottom:14px">
      <button class="knop licht vol" id="clubImporteerPDF">📥 Importeren uit PDF</button>
      ${teams.length ? `<button class="knop licht vol" id="clubAlleLinks">🔗 Alle uitnodigingen</button>` : ''}
    </div>
    ${teams.length ? teams.map(t => `
      <button class="lijst-item" data-open-team="${t.id}">
        <div class="mini-shirt" style="width:40px;height:40px;border-radius:50%;background:var(--grass);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed';font-weight:700;font-size:16px">${esc(t.format)}v${esc(t.format)}</div>
        <div><div class="titel">${esc(t.naam)}</div>
        <div class="meta">${esc(t.categorie || '—')} · ${Object.keys(t.leden||{}).length} coach(es)</div></div>
        <button class="actie" data-uitnodig-team="${t.id}" title="Coach uitnodigen">📨</button>
        <span class="pijl">›</span>
      </button>`).join('')
    : `<div class="kaart leeg">Nog geen teams in deze club.<br>Maak een eerste team aan, of importeer een PDF met de teamindeling.</div>`}`;
}

/* in welke bouwen valt een training? (op basis van de gekoppelde teams) */
function bouwenVanTraining(t, teams){
  const set = new Set();
  for (const tid of (t.teams||[])){
    const team = teams.find(x => x.id === tid);
    set.add(bouwVanCategorie(team?.categorie));
  }
  return set;
}

function htmlClubTrainingen(teams, trainingen){
  const actief = S.clubTrainBouw || 'onder';
  // tellingen per bouw voor de badges
  const telPerBouw = {onder:0, midden:0, boven:0};
  for (const t of trainingen)
    for (const b of bouwenVanTraining(t, teams)) telPerBouw[b]++;

  const zichtbaar = trainingen.filter(t => bouwenVanTraining(t, teams).has(actief));

  const segment = `
    <div class="segment" id="bouwTabs" style="margin-bottom:14px">
      ${BOUWEN.map(b => `<button data-bouw="${b.id}" class="${actief===b.id?'actief':''}">${b.kort}${telPerBouw[b.id]?` <span style="opacity:.6">(${telPerBouw[b.id]})</span>`:''}</button>`).join('')}
    </div>`;

  const lijst = zichtbaar.length ? zichtbaar.map(t => {
    const teamNamen = (t.teams||[]).map(tid => (teams.find(x => x.id === tid)?.naam) || '?').join(', ');
    return `
      <div class="training-rij">
        <div class="ico">PDF</div>
        <div class="t"><div class="t-titel">${esc(t.titel || t.bestandsnaam)}</div>
          <div class="t-meta">${esc(t.week || '')}${t.week?' · ':''}${esc(teamNamen)}</div></div>
        <div class="acties">
          <button data-tdownload="${esc(t.url)}" title="Openen">↗</button>
          <button data-tbewerk="${t.id}" title="Teams en titel wijzigen">✏️</button>
          <button data-tshare="${t.id}" title="Delen naar WhatsApp">📤</button>
          <button data-tweg="${t.id}" title="Verwijderen" style="color:var(--uit)">🗑</button>
        </div>
      </div>`;
  }).join('')
  : `<div class="kaart leeg">Nog geen trainingen voor de ${esc(bouwNaam(actief).toLowerCase())}.<br>Upload een PDF en koppel hem aan een team uit deze bouw.</div>`;

  return `
    <button class="upload-knop" id="trainingUpload">📄 PDF-training toevoegen voor één of meer teams
      <input type="file" id="trainingFile" accept="application/pdf" style="display:none"></button>
    ${segment}
    ${lijst}`;
}

function htmlClubVideos(teams, videos){
  const actief = S.clubVideoBouw || 'onder';
  const telPerBouw = {onder:0, midden:0, boven:0};
  for (const vid of videos)
    for (const b of bouwenVanTraining(vid, teams)) telPerBouw[b]++;
  const zichtbaar = videos.filter(vid => bouwenVanTraining(vid, teams).has(actief));

  const segment = `
    <div class="segment" id="videoBouwTabs" style="margin-bottom:14px">
      ${BOUWEN.map(b => `<button data-vbouw="${b.id}" class="${actief===b.id?'actief':''}">${b.kort}${telPerBouw[b.id]?` <span style="opacity:.6">(${telPerBouw[b.id]})</span>`:''}</button>`).join('')}
    </div>`;

  const lijst = zichtbaar.length ? zichtbaar.map(vid => {
    const teamNamen = (vid.teams||[]).map(tid => (teams.find(x => x.id === tid)?.naam) || '?').join(', ');
    const id = youtubeId(vid.url);
    return `
      <div class="video-rij">
        <a class="thumb" href="${esc(youtubeWatch(id) || vid.url)}" target="_blank" rel="noopener">
          ${id ? `<img src="${esc(youtubeThumb(id))}" alt="" loading="lazy"><span class="play">▶</span>` : '<span class="play">▶</span>'}
        </a>
        <div class="v"><div class="v-titel">${esc(vid.titel || 'Video')}</div>
          <div class="v-meta">${esc(teamNamen || '—')}</div></div>
        <div class="acties">
          <button data-vbewerk="${vid.id}" title="Teams en titel wijzigen">✏️</button>
          <button data-vshare="${vid.id}" title="Delen naar WhatsApp">📤</button>
          <button data-vweg="${vid.id}" title="Verwijderen" style="color:var(--uit)">🗑</button>
        </div>
      </div>`;
  }).join('')
  : `<div class="kaart leeg">Nog geen video's voor de ${esc(bouwNaam(actief).toLowerCase())}.<br>Plak een YouTube-link en koppel hem aan een team uit deze bouw.</div>`;

  return `
    <button class="upload-knop" id="videoToevoegen">🎬 YouTube-video toevoegen voor één of meer teams</button>
    ${segment}
    ${lijst}`;
}

function htmlClubInstel(teams = [], syncStatus = {}){
  const admins = Object.values(S.club.adminsInfo || {}).map(a => esc(a.naam)).join(', ');

  // --- voetbal.nl-koppeling: token per team ---
  const syncTijd = (ts) => {
    if (!ts) return '';
    try {
      const d = ts.seconds ? new Date(ts.seconds*1000) : new Date(ts);
      return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) + ' ' +
             d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
    } catch { return ''; }
  };
  const tokenRijen = teams.length ? teams.map(t => {
    const st = syncStatus[t.id] || {};
    const badge = st.gekoppeld
      ? `<span class="tok-status gekoppeld">Gekoppeld</span>`
      : `<span class="tok-status leeg">Geen link</span>`;
    let onderregel = '';
    if (st.laatsteFout){
      onderregel = `<div class="tok-laatste" style="color:var(--uit)">Laatste sync mislukt: ${esc(st.laatsteFout)}</div>`;
    } else if (st.laatsteSync){
      const aantal = st.laatsteAantal != null ? `${st.laatsteAantal} wedstrijd${st.laatsteAantal===1?'':'en'}` : '';
      onderregel = `<div class="tok-laatste">Laatste sync: <b>${esc(syncTijd(st.laatsteSync))}</b>${aantal?' · '+aantal:''}</div>`;
    }
    return `
      <div class="tok-rij">
        <div class="tok-kop"><span class="tok-team">${esc(t.naam)}</span>${badge}</div>
        <div class="tok-invoer">
          <input type="${st.gekoppeld?'password':'text'}" data-token-team="${t.id}"
                 placeholder="Plak hier de voetbal.nl-link"
                 value="${st.gekoppeld?'••••••••••••••••':''}" autocomplete="off">
          <button data-token-opslaan="${t.id}">Opslaan</button>
        </div>
        ${onderregel}
      </div>`;
  }).join('') : `<p style="font-size:13px;color:var(--ink-2)">Maak eerst teams aan om ze te koppelen.</p>`;

  const voetbalBlok = `
    <div class="sectie-kop">⚽ voetbal.nl-koppeling</div>
    <div class="kaart">
      <p class="uitleg" style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-bottom:6px">Plak per team de kalenderlink uit voetbal.nl. De wedstrijden worden dan automatisch in de app gezet, klaar om opstellingen te maken. De link koop je in de voetbal.nl-app (teamkalender) en ziet eruit als <code style="font-size:11px">data.sportlink.com/ical-team?token=…</code></p>
    </div>
    <div class="waarschuwing" style="background:#fff8e6;border:1px solid #f0d894;border-radius:11px;padding:11px 12px;font-size:12.5px;color:#7a5d00;line-height:1.5;margin-bottom:12px">
      <b>Let op:</b> de kalenderlink is per team persoonlijk en verloopt elk halfseizoen. Vernieuw de link wanneer de sync stopt met werken.
    </div>
    <div class="kaart">${tokenRijen}</div>
    <button class="knop vol" id="syncNu" style="margin-bottom:4px">🔄 Sync nu alle teams</button>
    <p style="font-size:11.5px;color:var(--ink-2);text-align:center;margin:8px 0 4px">De sync draait sowieso elke nacht automatisch.</p>`;

  return `
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Club-uitnodiging</div>
      <p style="font-size:13.5px;color:var(--ink-2)">Stuur deze link naar mede-admins. Zij worden dan ook beheerder van de club.</p>
      <div class="uitnodig-link" id="clubLink">${esc(location.origin + location.pathname + '?club=' + S.club.code)}</div>
      <button class="knop licht vol" id="kopieerClubLink" style="margin-top:8px">Link kopiëren</button>
    </div>
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Club-admins</div>
      <p style="font-size:14px">${admins || '—'}</p>
    </div>
    ${voetbalBlok}
    <button class="knop gevaar vol" id="verwijderClub">Club opheffen</button>`;
}

/* ---------- Clubbrede afgelasting ---------- */
/* Schrijft het afgelast-veld naar ALLE team-documenten van de club tegelijk (Optie B),
   plus één centraal historie-record onder clubs/{clubId}/afgelastingen voor de stats.
   Geen naam in de afgelasting. Alleen de beheerder ziet/gebruikt deze knop. */
function modalClubAflasten(teams){
  const vandaag = new Date().toISOString().slice(0,10);
  openModal(`
    <h2>Training afgelasten</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:14px">Dit last de training af voor <b>alle ${teams.length} teams</b> van de club. Elke trainer kan het bericht daarna doorsturen in zijn eigen WhatsApp-groep.</p>
    <div class="veldgroep"><label>Welke dag?</label>
      <input class="invoer" id="mAflasDatum" type="date" value="${vandaag}" min="${vandaag}"></div>
    <div class="veldgroep"><label>Reden (optioneel)</label>
      <input class="invoer" id="mAflasReden" placeholder="Bijv. slecht weer, velden onbespeelbaar" autocomplete="off" maxlength="140"></div>
    <div class="rij" style="margin-top:6px">
      <button class="knop licht vol" id="mAflasAnnuleer">Annuleren</button>
      <button class="knop vol" id="mAflasOk">Aflasten voor hele club</button>
    </div>`);

  $('#mAflasAnnuleer').onclick = () => sluitModal();
  $('#mAflasOk').onclick = async () => {
    const datum = $('#mAflasDatum').value;
    if (!datum) return meld('Kies eerst een dag');
    const reden = ($('#mAflasReden').value || '').trim();
    const knop = $('#mAflasOk'); knop.disabled = true; knop.textContent = 'Aflasten...';
    const data = { datum, reden, tijd: serverTimestamp() };
    try {
      // 1) naar alle team-documenten van de club (Optie B)
      await Promise.all(teams.map(t =>
        updateDoc(doc(db,'teams',t.id), { afgelast: data })
      ));
      // 2) één centraal historie-record voor de stats
      await addDoc(collection(db,'clubs',S.clubId,'afgelastingen'), data);
      sluitModal();
      meld(`Training afgelast voor ${teams.length} teams`);
      renderClub();
    } catch(e){
      knop.disabled = false; knop.textContent = 'Aflasten voor hele club';
      meld('Aflasten mislukt: ' + (e.code || e.message));
    }
  };
}

async function clubAfgelastOpheffen(teams){
  if (!confirm('Afgelasting opheffen? De trainingen gaan dan weer gewoon door.')) return;
  try {
    // 1) wis het afgelast-veld op alle team-documenten (verbergt de banner)
    await Promise.all(teams.map(t =>
      updateDoc(doc(db,'teams',t.id), { afgelast: deleteField() })
    ));
    // 2) verwijder de actieve (vandaag/toekomstige) historie-records, zodat een
    //    per ongeluk ingestelde afgelasting de stats niet vervuilt en het clubscherm
    //    niet langer 'actief' toont. Opheffen = correctie van een vergissing.
    const vandaag = new Date().toISOString().slice(0,10);
    const actieve = (S.clubAfgelastingen || []).filter(a => a.datum >= vandaag);
    await Promise.all(actieve.map(a =>
      deleteDoc(doc(db,'clubs',S.clubId,'afgelastingen',a.id))
    ));
    meld('Afgelasting opgeheven');
    renderClub();
  } catch(e){
    meld('Opheffen mislukt: ' + (e.code || e.message));
  }
}

function koppelClubTab(v, tab, teams, trainingen, videos){
  if (tab === 'teams'){
    const aflastBtn = v.querySelector('#clubAflast');
    if (aflastBtn) aflastBtn.onclick = () => modalClubAflasten(teams);
    const opheffenBtn = v.querySelector('#clubAfgelastOpheffen');
    if (opheffenBtn) opheffenBtn.onclick = () => clubAfgelastOpheffen(teams);
    v.querySelector('#clubNieuwTeam').onclick = async () => (await teamsModule()).modalNieuwTeam(S.clubId);
    const impBtn = v.querySelector('#clubImporteerPDF');
    if (impBtn) impBtn.onclick = modalImporteerPDF;
    const linkBtn = v.querySelector('#clubAlleLinks');
    if (linkBtn) linkBtn.onclick = () => modalAlleLinks(teams);
    v.querySelectorAll('[data-open-team]').forEach(b => b.onclick = async e => {
      if (e.target.closest('[data-uitnodig-team]')) return;
      (await teamsModule()).openTeam(b.dataset.openTeam);
    });
    v.querySelectorAll('[data-uitnodig-team]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const team = teams.find(t => t.id === b.dataset.uitnodigTeam);
      modalUitnodig(team);
    });
  }
  if (tab === 'trainingen'){
    v.querySelectorAll('[data-bouw]').forEach(b => b.onclick = () => {
      S.clubTrainBouw = b.dataset.bouw; renderClub();
    });
    const knop = v.querySelector('#trainingUpload');
    const input = v.querySelector('#trainingFile');
    knop.onclick = () => input.click();
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      modalNieuweTraining(file, teams, S.clubTrainBouw);
    };
    v.querySelectorAll('[data-tdownload]').forEach(b => b.onclick = () => window.open(b.dataset.tdownload, '_blank'));
    v.querySelectorAll('[data-tbewerk]').forEach(b => b.onclick = () => {
      const t = trainingen.find(x => x.id === b.dataset.tbewerk);
      modalBewerkTraining(t, teams);
    });
    v.querySelectorAll('[data-tshare]').forEach(b => b.onclick = () => {
      const t = trainingen.find(x => x.id === b.dataset.tshare);
      const tekst = `📄 Training ${t.titel || ''}\n${t.week || ''}\n${t.url}`;
      window.open('https://wa.me/?text=' + encodeURIComponent(tekst), '_blank');
    });
    v.querySelectorAll('[data-tweg]').forEach(b => b.onclick = async () => {
      const t = trainingen.find(x => x.id === b.dataset.tweg);
      if (!confirm(`Training "${t.titel || t.bestandsnaam}" verwijderen?`)) return;
      try { if (t.path) await deleteObject(sRef(storage, t.path)); } catch(e){}
      await deleteDoc(doc(db,'trainingen',t.id));
      meld('Training verwijderd'); renderClub();
    });
  }
  if (tab === 'videos'){
    v.querySelectorAll('[data-vbouw]').forEach(b => b.onclick = () => {
      S.clubVideoBouw = b.dataset.vbouw; renderClub();
    });
    v.querySelector('#videoToevoegen').onclick = () => modalNieuweVideo(teams, S.clubVideoBouw);
    v.querySelectorAll('[data-vbewerk]').forEach(b => b.onclick = () => {
      const vid = videos.find(x => x.id === b.dataset.vbewerk);
      modalBewerkVideo(vid, teams);
    });
    v.querySelectorAll('[data-vshare]').forEach(b => b.onclick = () => {
      const vid = videos.find(x => x.id === b.dataset.vshare);
      const tekst = `🎬 ${vid.titel || 'Video'}\n${vid.url}`;
      window.open('https://wa.me/?text=' + encodeURIComponent(tekst), '_blank');
    });
    v.querySelectorAll('[data-vweg]').forEach(b => b.onclick = async () => {
      const vid = videos.find(x => x.id === b.dataset.vweg);
      if (!confirm(`Video "${vid.titel || ''}" verwijderen?`)) return;
      await deleteDoc(doc(db,'videos',vid.id));
      meld('Video verwijderd'); renderClub();
    });
  }
  if (tab === 'instel'){
    v.querySelector('#kopieerClubLink').onclick = async () => {
      try { await navigator.clipboard.writeText($('#clubLink').textContent); meld('Link gekopieerd'); }
      catch { meld('Link: ' + $('#clubLink').textContent); }
    };
    // voetbal.nl-token per team opslaan
    v.querySelectorAll('[data-token-opslaan]').forEach(b => b.onclick = async () => {
      const teamId = b.dataset.tokenOpslaan;
      const input = v.querySelector(`[data-token-team="${teamId}"]`);
      const ruw = (input.value || '').trim();
      if (!ruw || ruw.startsWith('••••')) return meld('Plak eerst een nieuwe link');
      // token uit de link halen (accepteer hele URL of kale token)
      const token = extraheerToken(ruw);
      if (!token) return meld('Geen geldige voetbal.nl-link herkend');
      b.disabled = true; b.textContent = '...';
      try {
        await setDoc(doc(db,'clubs',S.clubId,'geheim',teamId), { icalToken: token }, { merge: true });
        meld('Koppeling opgeslagen');
        renderClub();
      } catch(e){
        b.disabled = false; b.textContent = 'Opslaan';
        meld('Opslaan mislukt: ' + (e.code || e.message));
      }
    });
    // handmatige sync nu
    const syncBtn = v.querySelector('#syncNu');
    if (syncBtn) syncBtn.onclick = async () => {
      syncBtn.disabled = true; const orig = syncBtn.textContent; syncBtn.textContent = '🔄 Bezig met synchroniseren...';
      try {
        const fn = httpsCallable(functions, 'syncNu');
        const res = await fn({ clubId: S.clubId });
        const n = res.data?.totaalWedstrijden ?? 0;
        meld(`Sync klaar — ${n} wedstrijd${n===1?'':'en'} verwerkt`);
        renderClub();
      } catch(e){
        syncBtn.disabled = false; syncBtn.textContent = orig;
        meld('Sync mislukt: ' + (e.message || e.code || 'onbekende fout'));
      }
    };
    v.querySelector('#verwijderClub').onclick = async () => {
      if (!confirm('Club opheffen? Teams en trainingen blijven bestaan, maar zijn niet meer aan deze club gekoppeld.')) return;
      await deleteDoc(doc(db,'clubs',S.clubId));
      verlaatClubView();
    };
  }
}

/* ==================== UITNODIGEN ==================== */
export function modalUitnodig(team){
  const link = location.origin + location.pathname + '?team=' + team.code;
  openModal(`
    <h2>Coach uitnodigen voor ${esc(team.naam)}</h2>
    <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:12px">Stuur deze persoonlijke link naar de coach. Hij of zij klikt erop, logt in met e-mail of Google en zit direct in dit team.</p>
    <div class="uitnodig-link" id="uitnodigLink">${esc(link)}</div>
    <div class="rij" style="margin-top:12px">
      <button class="knop vol" id="mUitnodigKopieer">Link kopiëren</button>
      <button class="knop fluo vol" id="mUitnodigWa">📲 WhatsApp</button>
    </div>
    <p style="font-size:12px;color:var(--ink-2);margin-top:12px">Of geef de teamcode mondeling door: <b>${esc(team.code)}</b></p>`);
  $('#mUitnodigKopieer').onclick = async () => {
    try { await navigator.clipboard.writeText(link); meld('Link gekopieerd'); }
    catch { meld('Link: ' + link); }
  };
  $('#mUitnodigWa').onclick = () => {
    const tekst = `Je bent uitgenodigd als coach voor ${team.naam}. Open deze link en log in met e-mail of Google:\n${link}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(tekst), '_blank');
  };
}

function modalAlleLinks(teams){
  const link = t => location.origin + location.pathname + '?team=' + t.code;
  openModal(`
    <h2>🔗 Alle uitnodigingslinks</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:14px">Per team kun je hier snel de uitnodiging delen. Aantal gekoppelde coaches staat erbij.</p>
    <div style="max-height:60vh;overflow-y:auto;margin-bottom:14px">
      ${teams.map(t => `
        <div class="link-rij">
          <div class="link-rij-kop">
            <div><div class="titel">${esc(t.naam)}</div>
              <div class="meta">${Object.keys(t.leden||{}).length} coach(es) · code ${esc(t.code)}</div></div>
          </div>
          <div class="uitnodig-link">${esc(link(t))}</div>
          <div class="link-actie" style="margin-top:8px">
            <button data-kopieer="${esc(link(t))}">Kopieer</button>
            <button class="wa" data-wa="${t.id}">📲 WhatsApp</button>
          </div>
        </div>`).join('')}
    </div>
    <button class="knop vol" id="mLinksKopieerAlle">📋 Kopieer alles als lijst</button>`);
  $$('#modalInhoud [data-kopieer]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.kopieer); meld('Link gekopieerd'); }
    catch { meld('Kon niet kopiëren'); }
  });
  $$('#modalInhoud [data-wa]').forEach(b => b.onclick = () => {
    const t = teams.find(x => x.id === b.dataset.wa);
    const tekst = `Je bent uitgenodigd als coach voor ${t.naam}. Open deze link en log in met e-mail of Google:\n${link(t)}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(tekst), '_blank');
  });
  $('#mLinksKopieerAlle').onclick = async () => {
    const tekst = teams.map(t => `${t.naam}: ${link(t)}`).join('\n');
    try { await navigator.clipboard.writeText(tekst); meld('Alle links gekopieerd'); }
    catch { meld('Kon niet kopiëren'); }
  };
}

/* ==================== PDF-IMPORT TEAMS ==================== */
function detecteerCategorie(teamnaam){
  const m = teamnaam.toUpperCase().match(/^(JO|MO)(\d+)/);
  if (!m) return null;
  const cat = m[1] + m[2];
  return catInfo(cat) ? cat : null;
}
function voornaam(volledig){ return volledig.trim().split(/\s+/)[0]; }

async function parseTeamsUitPDF(file){
  const url = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const workerUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const pdfjs = await import(url);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({data: buf}).promise;

  const teams = [];
  const teamRegex = /^(JO|MO)\d+(-\d+)?(JM)?$/i;
  const skipRegex = /^(UITLEG|COÖRDINATOREN|MINI'S|JEUGD|2025|2026)$/i;

  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str.trim()).map(it => ({
      str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0,
    }));
    const headers = items.filter(it => teamRegex.test(it.str.trim()));

    for (const h of headers){
      const kolom = items.filter(it => Math.abs(it.x - h.x) < 60 && it.y < h.y && it.y > 30);
      const perRegel = {};
      for (const it of kolom){
        const k = Math.round(it.y);
        (perRegel[k] ||= []).push(it);
      }
      const regels = Object.keys(perRegel).map(Number).sort((a,b) => b - a);
      const spelers = [];
      for (const y of regels){
        const stk = perRegel[y].sort((a,b) => a.x - b.x);
        let s = '';
        for (let i = 0; i < stk.length; i++){
          if (i > 0){
            const vorigEnd = stk[i-1].x + stk[i-1].w;
            const gap = stk[i].x - vorigEnd;
            s += gap > 1.5 ? ' ' : '';
          }
          s += stk[i].str;
        }
        s = s.trim();
        if (/BEGELEIDING|VACATURE/i.test(s)) break;
        if (teamRegex.test(s)) break;
        if (s.length < 2) continue;
        if (skipRegex.test(s)) continue;
        spelers.push(s);
      }
      if (spelers.length){
        teams.push({
          naam: h.str.trim().toUpperCase(),
          categorie: detecteerCategorie(h.str),
          spelers: spelers.map(voornaam),
        });
      }
    }
  }
  return teams;
}

function modalImporteerPDF(){
  openModal(`
    <h2>📥 Teams importeren uit PDF</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">Upload een PDF met de teamindeling. De app leest de teamnamen en spelersnamen uit, daarna kun je alles controleren voordat je de teams aanmaakt.</p>
    <label class="upload-knop" for="mPDFFile">📄 Kies PDF-bestand
      <input type="file" id="mPDFFile" accept="application/pdf" style="display:none"></label>
    <div id="mPDFStatus" style="font-size:13px;color:var(--ink-2);text-align:center"></div>`);
  $('#mPDFFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    $('#mPDFStatus').textContent = '⏳ PDF wordt gelezen, even geduld...';
    try {
      const teams = await parseTeamsUitPDF(file);
      if (!teams.length){
        $('#mPDFStatus').textContent = '❌ Geen teams gevonden in deze PDF. Controleer of de teamnamen in de vorm JO11-1, MO13-1 e.d. erin staan.';
        return;
      }
      sluitModal();
      modalImportPreview(teams);
    } catch (err) {
      console.error(err);
      $('#mPDFStatus').textContent = '❌ Kon de PDF niet lezen: ' + err.message;
    }
  };
}

function modalImportPreview(geparseerd){
  const teams = geparseerd.map(t => ({...t, aan: true, spelers: [...t.spelers]}));
  const render = () => {
    const blokjes = teams.map((t, ti) => {
      const tellingen = {};
      t.spelers.forEach(s => tellingen[s.toLowerCase()] = (tellingen[s.toLowerCase()]||0) + 1);
      return `
        <div class="preview-team ${t.aan?'':'uit'}" data-ti="${ti}">
          <div class="preview-team-kop">
            <input type="checkbox" data-aan="${ti}" ${t.aan?'checked':''}>
            <span class="naam">${esc(t.naam)}</span>
            <span class="meta">${t.categorie ? esc(t.categorie) : 'GEEN CAT.'}</span>
            <span class="meta">${t.spelers.length}</span>
          </div>
          <div class="preview-spelers">
            ${t.spelers.map((s,si) => `
              <span class="speler ${tellingen[s.toLowerCase()]>1?'dubbel':''}" title="${tellingen[s.toLowerCase()]>1?'Dubbele voornaam — pas aan om uniek te maken':''}">
                <input data-ti="${ti}" data-si="${si}" value="${esc(s)}" size="${Math.max(s.length, 5)}">
                <button data-weg="${ti}-${si}" title="Verwijderen">✕</button>
              </span>`).join('')}
            <span class="speler toevoeg" data-toevoeg="${ti}">+ Speler</span>
          </div>
        </div>`;
    }).join('');
    $('#mPrevInhoud').innerHTML = blokjes;
    const aantalAan = teams.filter(t => t.aan).length;
    const aantalSp  = teams.filter(t => t.aan).reduce((a,t) => a + t.spelers.length, 0);
    $('#mPrevSamenvat').textContent = `${aantalAan} team${aantalAan===1?'':'s'} · ${aantalSp} speler${aantalSp===1?'':'s'} worden aangemaakt`;
    koppelPreview();
  };
  const koppelPreview = () => {
    $$('[data-aan]').forEach(c => c.onchange = () => { teams[Number(c.dataset.aan)].aan = c.checked; render(); });
    $$('.preview-spelers input').forEach(i => i.oninput = () => {
      teams[Number(i.dataset.ti)].spelers[Number(i.dataset.si)] = i.value;
    });
    $$('.preview-spelers input').forEach(i => i.onblur = () => { i.size = Math.max(i.value.length, 5); });
    $$('[data-weg]').forEach(b => b.onclick = () => {
      const [ti, si] = b.dataset.weg.split('-').map(Number);
      teams[ti].spelers.splice(si,1); render();
    });
    $$('[data-toevoeg]').forEach(b => b.onclick = () => {
      const ti = Number(b.dataset.toevoeg);
      const naam = prompt('Voornaam:');
      if (naam && naam.trim()){ teams[ti].spelers.push(naam.trim()); render(); }
    });
  };
  openModal(`
    <h2>Controleren & aanpassen</h2>
    <p style="font-size:13px;color:var(--ink-2)">Vink teams uit die je niet wilt aanmaken, klik op een naam om aan te passen, en let op de <span style="color:var(--uit);font-weight:600">rood gekleurde</span> dubbele voornamen.</p>
    <div id="mPrevSamenvat" style="font-size:12.5px;font-weight:600;color:var(--grass);text-align:center;margin:10px 0"></div>
    <div id="mPrevInhoud" style="max-height:50vh;overflow-y:auto;margin-bottom:14px"></div>
    <button class="knop vol" id="mPrevOk">✓ Teams aanmaken</button>
    <button class="knop licht vol" id="mPrevAnnuleer" style="margin-top:8px">Annuleren</button>`);
  render();
  $('#mPrevAnnuleer').onclick = sluitModal;
  $('#mPrevOk').onclick = async () => {
    const teLijken = teams.filter(t => t.aan && t.spelers.length);
    if (!teLijken.length) return meld('Geen teams om aan te maken');
    $('#mPrevOk').disabled = true;
    $('#mPrevOk').textContent = 'Bezig...';
    let aangemaakt = 0;
    const afk = clubAfkorting(S.club.naam);
    const gebruikt = [...(S.clubTeams||[]).map(t => t.code)].filter(Boolean);
    for (const t of teLijken){
      const cat = t.categorie || 'JO11';
      const format = catInfo(cat).format;
      const geslacht = cat.startsWith('M') ? 'm' : 'j';
      const code = teamCode(t.naam, afk, gebruikt);
      gebruikt.push(code);
      const teamRef = await addDoc(collection(db,'teams'), {
        naam: t.naam, categorie: cat, geslacht, format, code,
        club: S.clubId, clubNaam: S.club.naam,
        leden: {[S.user.uid]: true},
        ledenInfo: {[S.user.uid]: {naam: S.user.displayName || S.user.email}},
        gemaakt: serverTimestamp(),
      });
      await updateDoc(doc(db,'clubs',S.clubId), {['teams.'+teamRef.id]: true});
      for (let i = 0; i < t.spelers.length; i++){
        await addDoc(collection(db,'teams',teamRef.id,'spelers'), {naam: t.spelers[i], nummer: i+1});
      }
      aangemaakt++;
    }
    sluitModal();
    meld(`✓ ${aangemaakt} team${aangemaakt===1?'':'s'} aangemaakt`);
    renderClub();
  };
}

/* ==================== TRAININGEN ==================== */
function isoWeek(d){
  const date = new Date(d.getTime());
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function modalNieuweTraining(file, teams, voorBouw = null){
  const weekNr = isoWeek(new Date());
  // teams groeperen per bouw
  const perBouw = {onder:[], midden:[], boven:[]};
  for (const t of teams) perBouw[bouwVanCategorie(t.categorie)].push(t);
  const groepHtml = BOUWEN.map(b => {
    const lijst = perBouw[b.id];
    if (!lijst.length) return '';
    return `
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--ink-2);margin:10px 0 6px">${esc(b.naam)}</div>
      <div class="team-chip-kies">
        ${lijst.map(t => {
          const aan = voorBouw ? b.id === voorBouw : false;
          return `<label data-pid="${t.id}" class="${aan?'aan':''}"><input type="checkbox" data-tid="${t.id}" ${aan?'checked':''}><span>${esc(t.naam)}</span></label>`;
        }).join('')}
      </div>`;
  }).join('');
  openModal(`
    <h2>Training uploaden</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">Bestand: <b>${esc(file.name)}</b> (${(file.size/1024).toFixed(0)} KB)</p>
    <div class="veldgroep"><label>Titel</label>
      <input class="invoer" id="mTrTitel" value="Week ${weekNr} - training 1" autocomplete="off"></div>
    <div class="veldgroep"><label>Week / periode</label>
      <input class="invoer" id="mTrWeek" value="Week ${weekNr}" autocomplete="off"></div>
    <div class="veldgroep"><label>Voor welke teams?</label>
      <div id="mTrTeams">
        ${teams.length ? groepHtml : '<p style="font-size:13px;color:var(--ink-2)">Maak eerst teams aan in deze club.</p>'}
      </div>
      <div class="rij" style="margin-top:8px">
        <button class="knop licht klein" id="mTrAlle">Alle teams</button>
        <button class="knop licht klein" id="mTrGeen">Geen</button>
      </div>
    </div>
    <button class="knop vol" id="mTrOk">Uploaden en delen</button>`);
  const sync = () => $$('#mTrTeams label').forEach(l => l.classList.toggle('aan', l.querySelector('input').checked));
  $$('#mTrTeams input').forEach(c => c.onchange = sync);
  $('#mTrAlle').onclick = () => { $$('#mTrTeams input').forEach(c => c.checked = true); sync(); };
  $('#mTrGeen').onclick = () => { $$('#mTrTeams input').forEach(c => c.checked = false); sync(); };
  $('#mTrOk').onclick = async () => {
    const gekozen = $$('#mTrTeams input').filter(c => c.checked).map(c => c.dataset.tid);
    if (!gekozen.length) return meld('Kies minstens één team');
    const titel = $('#mTrTitel').value.trim() || file.name;
    const week  = $('#mTrWeek').value.trim();
    const knop = $('.upload-knop');
    if (knop){ knop.classList.add('bezig'); knop.textContent = 'Uploaden...'; }
    sluitModal();
    try {
      const ts = Date.now();
      const veiligeNaam = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path = `clubs/${S.clubId}/trainingen/${ts}_${veiligeNaam}`;
      const r = sRef(storage, path);
      await uploadBytes(r, file, {contentType:'application/pdf'});
      const url = await getDownloadURL(r);
      await addDoc(collection(db,'trainingen'), {
        club: S.clubId, clubNaam: S.club.naam,
        titel, week, bestandsnaam: file.name, path, url,
        teams: gekozen,
        gemaakt: serverTimestamp(),
        door: S.user.displayName || S.user.email || '',
      });
      meld('Training geüpload'); renderClub();
    } catch(e){
      console.error(e); meld('Upload mislukt — staat Firebase Storage aan?');
      if (knop){ knop.classList.remove('bezig'); knop.textContent = '📄 PDF-training toevoegen voor één of meer teams'; }
    }
  };
}

/* Toewijzing (titel, week, teams) van een bestaande training achteraf aanpassen
   — zonder het PDF-bestand opnieuw te uploaden. */
function modalBewerkTraining(t, teams){
  const huidig = new Set(t.teams || []);
  openModal(`
    <h2>Training aanpassen</h2>
    <p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">Bestand: <b>${esc(t.bestandsnaam || t.titel)}</b>${t.url ? ` · <a href="${esc(t.url)}" target="_blank" style="color:var(--grass);font-weight:600">openen ↗</a>` : ''}<br>Het PDF-bestand zelf blijft ongewijzigd.</p>
    <div class="veldgroep"><label>Titel</label>
      <input class="invoer" id="mTbTitel" value="${esc(t.titel || '')}" autocomplete="off"></div>
    <div class="veldgroep"><label>Week / periode</label>
      <input class="invoer" id="mTbWeek" value="${esc(t.week || '')}" autocomplete="off"></div>
    <div class="veldgroep"><label>Voor welke teams?</label>
      <div id="mTbTeams">
        ${teams.length ? BOUWEN.map(b => {
          const lijst = teams.filter(team => bouwVanCategorie(team.categorie) === b.id);
          if (!lijst.length) return '';
          return `
            <div style="font-size:11.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--ink-2);margin:10px 0 6px">${esc(b.naam)}</div>
            <div class="team-chip-kies">
              ${lijst.map(team => `<label data-pid="${team.id}" class="${huidig.has(team.id)?'aan':''}"><input type="checkbox" data-tid="${team.id}" ${huidig.has(team.id)?'checked':''}><span>${esc(team.naam)}</span></label>`).join('')}
            </div>`;
        }).join('')
        : '<p style="font-size:13px;color:var(--ink-2)">Geen teams in deze club.</p>'}
      </div>
      <div class="rij" style="margin-top:8px">
        <button class="knop licht klein" id="mTbAlle">Alle teams</button>
        <button class="knop licht klein" id="mTbGeen">Geen</button>
      </div>
    </div>
    <button class="knop vol" id="mTbOk">Wijzigingen opslaan</button>`);
  const sync = () => $$('#mTbTeams label').forEach(l => l.classList.toggle('aan', l.querySelector('input').checked));
  $$('#mTbTeams input').forEach(c => c.onchange = sync);
  $('#mTbAlle').onclick = () => { $$('#mTbTeams input').forEach(c => c.checked = true); sync(); };
  $('#mTbGeen').onclick = () => { $$('#mTbTeams input').forEach(c => c.checked = false); sync(); };
  $('#mTbOk').onclick = async () => {
    const gekozen = $$('#mTbTeams input').filter(c => c.checked).map(c => c.dataset.tid);
    if (!gekozen.length) return meld('Kies minstens één team');
    const titel = $('#mTbTitel').value.trim() || t.bestandsnaam || 'Training';
    const week  = $('#mTbWeek').value.trim();
    sluitModal();
    try {
      await updateDoc(doc(db,'trainingen',t.id), {teams: gekozen, titel, week});
      meld('Training bijgewerkt'); renderClub();
    } catch(e){
      console.error(e); meld('Opslaan mislukt: ' + (e.code || e.message));
    }
  };
}

/* ==================== VIDEO'S (YouTube-links) ==================== */
/* teams gegroepeerd per bouw als selecteerbare chips; voorvink = set met team-id's */
function teamKeuzePerBouw(teams, voorgevinkt){
  const vink = voorgevinkt instanceof Set ? voorgevinkt : new Set(voorgevinkt || []);
  return BOUWEN.map(b => {
    const lijst = teams.filter(t => bouwVanCategorie(t.categorie) === b.id);
    if (!lijst.length) return '';
    return `
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--ink-2);margin:10px 0 6px">${esc(b.naam)}</div>
      <div class="team-chip-kies">
        ${lijst.map(t => `<label data-pid="${t.id}" class="${vink.has(t.id)?'aan':''}"><input type="checkbox" data-tid="${t.id}" ${vink.has(t.id)?'checked':''}><span>${esc(t.naam)}</span></label>`).join('')}
      </div>`;
  }).join('');
}

function modalNieuweVideo(teams, voorBouw = null){
  const voor = voorBouw ? new Set(teams.filter(t => bouwVanCategorie(t.categorie) === voorBouw).map(t => t.id)) : new Set();
  openModal(`
    <h2>YouTube-video toevoegen</h2>
    <div class="veldgroep"><label>YouTube-link</label>
      <input class="invoer" id="mVdUrl" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></div>
    <div class="veldgroep"><label>Titel</label>
      <input class="invoer" id="mVdTitel" placeholder="Bijv. Passing-oefening 3-hoek" autocomplete="off"></div>
    <div class="veldgroep"><label>Voor welke teams?</label>
      <div id="mVdTeams">${teams.length ? teamKeuzePerBouw(teams, voor) : '<p style="font-size:13px;color:var(--ink-2)">Maak eerst teams aan in deze club.</p>'}</div>
      <div class="rij" style="margin-top:8px">
        <button class="knop licht klein" id="mVdAlle">Alle teams</button>
        <button class="knop licht klein" id="mVdGeen">Geen</button>
      </div>
    </div>
    <button class="knop vol" id="mVdOk">Toevoegen</button>`);
  const sync = () => $$('#mVdTeams label').forEach(l => l.classList.toggle('aan', l.querySelector('input').checked));
  $$('#mVdTeams input').forEach(c => c.onchange = sync);
  $('#mVdAlle').onclick = () => { $$('#mVdTeams input').forEach(c => c.checked = true); sync(); };
  $('#mVdGeen').onclick = () => { $$('#mVdTeams input').forEach(c => c.checked = false); sync(); };
  $('#mVdOk').onclick = async () => {
    const url = $('#mVdUrl').value.trim();
    if (!youtubeId(url)) return meld('Plak een geldige YouTube-link');
    const gekozen = $$('#mVdTeams input').filter(c => c.checked).map(c => c.dataset.tid);
    if (!gekozen.length) return meld('Kies minstens één team');
    const titel = $('#mVdTitel').value.trim() || 'Video';
    $('#mVdOk').disabled = true; $('#mVdOk').textContent = 'Bezig...';
    try {
      await addDoc(collection(db,'videos'), {
        club: S.clubId, clubNaam: S.club.naam,
        url, titel, teams: gekozen,
        gemaakt: serverTimestamp(),
        door: S.user.displayName || S.user.email || '',
      });
      sluitModal(); meld('Video toegevoegd'); renderClub();
    } catch(e){
      $('#mVdOk').disabled = false; $('#mVdOk').textContent = 'Toevoegen';
      meld('Opslaan mislukt: ' + (e.code || e.message));
    }
  };
}

function modalBewerkVideo(vid, teams){
  const huidig = new Set(vid.teams || []);
  openModal(`
    <h2>Video aanpassen</h2>
    <div class="veldgroep"><label>YouTube-link</label>
      <input class="invoer" id="mVbUrl" value="${esc(vid.url || '')}" autocomplete="off"></div>
    <div class="veldgroep"><label>Titel</label>
      <input class="invoer" id="mVbTitel" value="${esc(vid.titel || '')}" autocomplete="off"></div>
    <div class="veldgroep"><label>Voor welke teams?</label>
      <div id="mVbTeams">${teams.length ? teamKeuzePerBouw(teams, huidig) : '<p style="font-size:13px;color:var(--ink-2)">Geen teams in deze club.</p>'}</div>
      <div class="rij" style="margin-top:8px">
        <button class="knop licht klein" id="mVbAlle">Alle teams</button>
        <button class="knop licht klein" id="mVbGeen">Geen</button>
      </div>
    </div>
    <button class="knop vol" id="mVbOk">Wijzigingen opslaan</button>`);
  const sync = () => $$('#mVbTeams label').forEach(l => l.classList.toggle('aan', l.querySelector('input').checked));
  $$('#mVbTeams input').forEach(c => c.onchange = sync);
  $('#mVbAlle').onclick = () => { $$('#mVbTeams input').forEach(c => c.checked = true); sync(); };
  $('#mVbGeen').onclick = () => { $$('#mVbTeams input').forEach(c => c.checked = false); sync(); };
  $('#mVbOk').onclick = async () => {
    const url = $('#mVbUrl').value.trim();
    if (!youtubeId(url)) return meld('Plak een geldige YouTube-link');
    const gekozen = $$('#mVbTeams input').filter(c => c.checked).map(c => c.dataset.tid);
    if (!gekozen.length) return meld('Kies minstens één team');
    const titel = $('#mVbTitel').value.trim() || 'Video';
    sluitModal();
    try {
      await updateDoc(doc(db,'videos',vid.id), {url, titel, teams: gekozen});
      meld('Video bijgewerkt'); renderClub();
    } catch(e){
      meld('Opslaan mislukt: ' + (e.code || e.message));
    }
  };
}
