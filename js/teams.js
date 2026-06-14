import {
  db, collection, doc, addDoc, deleteDoc, updateDoc, deleteField,
  setDoc, query, where, onSnapshot, serverTimestamp
} from './firebase.js';
import {
  S, $, $$, esc, meld, datumNL, teamCode, clubAfkorting, speler, initialen,
  openModal, sluitModal, toon, stopUnsubs
} from './state.js';
import { CATEGORIEEN, CATEGORIEEN_MEIDEN, catInfo } from './config.js';
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

export function renderTeams(){
  const v = $('#view-teams');
  const aantalOngelezen = S.trainingen.filter(t =>
    (t.teams||[]).some(tid => S.teams.find(x => x.id === tid)) && !S.trainingenGelezen[t.id]).length;
  v.innerHTML = `
    <div class="kop"><h1>Mijn teams<span class="sub">${esc(S.user.displayName || S.user.email || '')}</span></h1>
      <button class="terug" id="uitloggen" title="Uitloggen">⏻</button></div>

    ${S.clubs.length ? `<div class="sectie-kop" style="margin-top:0">Clubs die je beheert</div>
      ${S.clubs.map(c => `
        <button class="lijst-item" data-open-club="${c.id}">
          <div class="mini-shirt" style="width:40px;height:40px;border-radius:50%;background:var(--pitch-ink);color:var(--fluo);display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed';font-weight:700;font-size:14px">🏛</div>
          <div><div class="titel">${esc(c.naam)} <span class="club-badge">admin</span></div>
          <div class="meta">${Object.keys(c.teams||{}).length} teams</div></div>
          <span class="pijl">›</span>
        </button>`).join('')}` : ''}

    ${S.teams.length ? `<div class="sectie-kop">Mijn teams</div>
      ${S.teams.map(t => `
        <button class="lijst-item" data-open-team="${t.id}">
          <div class="mini-shirt" style="width:40px;height:40px;border-radius:50%;background:var(--grass);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed';font-weight:700;font-size:16px">${esc(t.format)}v${esc(t.format)}</div>
          <div><div class="titel">${esc(t.naam)}${t.club ? ' <span class="club-badge licht">'+esc(t.clubNaam||'club')+'</span>' : ''}</div>
          <div class="meta">${Object.keys(t.leden||{}).length} coach(es) · code ${esc(t.code)}</div></div>
          <span class="pijl">›</span>
        </button>`).join('')}`
      : !S.clubs.length ? `<div class="kaart leeg">Nog geen teams.<br><b>Maak een team aan</b>, sluit je aan met een teamcode, of <b>start een club</b> om meerdere teams te beheren.</div>` : ''}

    ${aantalOngelezen ? `<div class="kaart" style="background:rgba(229,72,77,.08);border-left:3px solid var(--uit);font-size:13.5px;color:var(--ink);margin-top:12px">📄 <b>${aantalOngelezen}</b> nieuwe training${aantalOngelezen>1?'en':''} — open je team om te bekijken.</div>` : ''}

    <div class="rij" style="margin-top:14px">
      <button class="knop vol" id="nieuwTeam">+ Nieuw team</button>
      <button class="knop licht vol" id="joinTeam">Code invoeren</button>
    </div>
    <button class="knop club-knop vol" id="nieuwClub" style="margin-top:8px">🏛 Nieuwe club aanmaken</button>`;

  v.querySelector('#uitloggen').onclick = () => {
    if (S.user.isAnonymous && !confirm('Je bent ingelogd zonder account. Na uitloggen kun je opnieuw inloggen met je teamcode. Doorgaan?')) return;
    doSignOut();
  };
  v.querySelectorAll('[data-open-team]').forEach(b => b.onclick = () => openTeam(b.dataset.openTeam));
  v.querySelectorAll('[data-open-club]').forEach(b => b.onclick = () => openClub(b.dataset.openClub));
  v.querySelector('#nieuwTeam').onclick = () => modalNieuwTeam();
  v.querySelector('#joinTeam').onclick = modalJoinTeam;
  v.querySelector('#nieuwClub').onclick = modalNieuwClub;
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
export function openTeam(teamId){
  S.teamId = teamId; S.teamTab = 'wedstrijden';
  stopUnsubs('team','spelers','wedstrijden');
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
  });
  toon('team');
}
export function verlaatTeamView(){
  stopUnsubs('team','spelers','wedstrijden');
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
      ${[['wedstrijden','📋','Wedstrijden'],['spelers','👕','Spelers'],['trainingen','📄','Training'],['stats','⏱','Stats'],['help','❓','Help']]
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
        <div><div class="titel">${titel}</div>
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

/* ---------- Tab: trainingen ---------- */
function htmlTeamTrainingen(){
  const lijst = S.trainingen.filter(t => (t.teams||[]).includes(S.teamId));
  if (!lijst.length) return `<div class="kaart leeg">Nog geen trainingen.<br>Vraag je clubadmin om trainingen te delen met dit team.</div>`;
  return lijst.map(t => {
    const ongelezen = !S.trainingenGelezen[t.id];
    const datum = t.gemaakt?.seconds ? new Date(t.gemaakt.seconds*1000).toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) : '';
    return `
    <div class="training-rij ${ongelezen?'ongelezen':''}" data-open-training="${t.id}" data-url="${esc(t.url)}" style="cursor:pointer">
      <div class="ico">PDF</div>
      <div class="t"><div class="t-titel">${esc(t.titel || t.bestandsnaam)}</div>
        <div class="t-meta">${esc(t.week || '')}${t.week && datum?' · ':''}${esc(datum)}${t.clubNaam?' · '+esc(t.clubNaam):''}</div></div>
      <div class="acties"><button title="Openen">↗</button></div>
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
      <div class="sectie-kop" style="margin-top:0">Teamcode voor coaches</div>
      <p style="font-size:13.5px;color:var(--ink-2)">Deel deze code of een uitnodigingslink met collega-coaches. Zij vullen alleen hun naam in en zitten direct in dit team.</p>
      <div class="teamcode">${esc(S.team.code)}</div>
      <div class="rij">
        <button class="knop licht vol" id="deelCode">Code kopiëren</button>
        <button class="knop fluo vol" id="deelLink">📲 Uitnodigen</button>
      </div>
      <button class="knop licht vol" id="wijzigCode" style="margin-top:8px">✏️ Code wijzigen</button>
    </div>
    <div class="kaart">
      <div class="sectie-kop" style="margin-top:0">Coaches (${ledenIds.length})</div>
      <p style="font-size:12.5px;color:var(--ink-2);margin-bottom:10px">Staat er iemand dubbel of verkeerd in de lijst? Verwijder die met 🗑.</p>
      ${ledenHtml}
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
    <h3>👋 Welkom bij Opstelling</h3>
    <p>Een app om voor je voetbalteam de opstelling te maken, wissels te beheren, speeltijd eerlijk te verdelen en de wedstrijd te loggen. Alles werkt realtime, dus collega-coaches zien direct dezelfde informatie.</p>

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
      <li>Ze openen de link, vullen hun naam in (de teamcode staat al klaar) en zitten direct in het team.</li>
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
    v.querySelectorAll('[data-open-training]').forEach(r => r.onclick = async () => {
      const id = r.dataset.openTraining;
      window.open(r.dataset.url, '_blank');
      if (!S.trainingenGelezen[id]){
        try { await setDoc(doc(db,'gebruikers',S.user.uid,'gelezen',id), {tijd: serverTimestamp()}); } catch(e){}
      }
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
