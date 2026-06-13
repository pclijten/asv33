import {
  auth, db, GoogleAuthProvider, signInWithPopup, signInAnonymously, updateProfile, signOut,
  collection, doc, getDocs, updateDoc, query, where
} from './firebase.js';
import { S, $, meld } from './state.js';

/* ====================================================================
   AANMELD-FLOW
   - Normale login: Google of teamcode+naam (anoniem, aan apparaat gekoppeld).
   - Uitnodigingslink (?team=CODE): toont een apart scherm waar de teamcode
     al vaststaat; de coach hoeft alleen een naam in te vullen, of kan
     met Google koppelen (handig voor meerdere apparaten).
   Deze opzet houdt de drempel laag maar voorkomt "rommel": een coach die
   per ongeluk aansluit kan door een teamcoach uit de lijst worden verwijderd
   (zie teams.js, ledenbeheer).
==================================================================== */

let pendingJoin = null;                 // {code, naam} — anonieme login die nog moet koppelen
let pendingJoinNaNormaleLogin = null;   // teamcode om te koppelen na Google-login
let pendingTeamInfo = null;             // {code, teamNaam} — uit de uitnodigingslink
let deeplinkVerwerkt = false;

export function getPendingTeamInfo(){ return pendingTeamInfo; }

/* ---------- knoppen koppelen (één keer, bij opstart) ---------- */
export function initAuthUI(){
  $('#googleLogin').addEventListener('click', async () => {
    if (pendingTeamInfo) pendingJoinNaNormaleLogin = pendingTeamInfo.code;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e){ meld('Inloggen mislukt: ' + e.code); }
  });

  $('#codeLoginToon').addEventListener('click', () => {
    const f = $('#codeLoginForm');
    f.style.display = f.style.display === 'none' ? '' : 'none';
    if (f.style.display === '') $('#loginNaam').focus();
  });

  $('#codeLoginOk').addEventListener('click', async () => {
    const naam = $('#loginNaam').value.trim();
    const code = $('#loginCode').value.trim().toUpperCase();
    if (naam.length < 2) return meld('Vul je naam in');
    if (code.length !== 6) return meld('Een teamcode bestaat uit 6 tekens');
    try {
      pendingJoin = {code, naam};
      const cred = await signInAnonymously(auth);
      await updateProfile(cred.user, {displayName: naam});
    } catch(e){ pendingJoin = null; meld('Inloggen mislukt: ' + e.code); }
  });

  $('#uitnodigOk').addEventListener('click', async () => {
    const naam = $('#uitnodigNaam').value.trim();
    if (naam.length < 2) return meld('Vul je naam in');
    $('#uitnodigOk').disabled = true;
    $('#uitnodigOk').textContent = 'Bezig...';
    try {
      pendingJoin = {code: pendingTeamInfo.code, naam};
      const cred = await signInAnonymously(auth);
      await updateProfile(cred.user, {displayName: naam});
    } catch(e){
      pendingJoin = null;
      $('#uitnodigOk').disabled = false;
      $('#uitnodigOk').textContent = 'Aansluiten';
      meld('Aansluiten mislukt: ' + e.code);
    }
  });

  $('#uitnodigGoogle').addEventListener('click', async () => {
    if (pendingTeamInfo) pendingJoinNaNormaleLogin = pendingTeamInfo.code;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e){ meld('Inloggen mislukt: ' + e.code); }
  });

  $('#uitnodigAnders').addEventListener('click', () => {
    $('#uitnodiging').style.display = 'none';
    $('#login').style.display = '';
    $('#codeLoginForm').style.display = '';
    if (pendingTeamInfo) $('#loginCode').value = pendingTeamInfo.code;
    $('#loginNaam').focus();
  });
}

export function doSignOut(){ signOut(auth); }

/* koppel de ingelogde gebruiker aan een team op basis van de teamcode */
export async function joinMetCode(code){
  const snap = await getDocs(query(collection(db,'teams'), where('code','==',code)));
  if (snap.empty){ meld('Geen team gevonden met code ' + code); return null; }
  const t = snap.docs[0];
  await updateDoc(t.ref, {
    ['leden.'+S.user.uid]: true,
    ['ledenInfo.'+S.user.uid]: {naam: S.user.displayName || S.user.email || 'Coach'},
  });
  return t;
}

/* uitnodigingslink herkennen en het uitnodigingsscherm voorbereiden */
export async function checkUitnodiging(){
  const p = new URLSearchParams(location.search);
  const code = (p.get('team') || '').toUpperCase();
  if (!code) return false;
  try {
    const snap = await getDocs(query(collection(db,'teams'), where('code','==',code)));
    if (snap.empty){
      $('#uitnodigTitel').textContent = 'Uitnodiging ongeldig';
      $('#uitnodigSubtitel').textContent = 'Deze link werkt niet meer. Vraag een nieuwe link aan je coach.';
      $('#uitnodigOk').style.display = 'none';
      $('#uitnodigNaam').style.display = 'none';
      $('#uitnodigGoogle').style.display = 'none';
    } else {
      const team = snap.docs[0].data();
      $('#uitnodigTitel').textContent = '🏟 ' + team.naam;
      $('#uitnodigSubtitel').textContent = team.clubNaam
        ? 'Je bent uitgenodigd als coach bij ' + team.clubNaam + '. Vul je naam in om door te gaan.'
        : 'Je bent uitgenodigd als coach. Vul je naam in om door te gaan.';
      $('#uitnodigOk').style.display = '';
      $('#uitnodigNaam').style.display = '';
      $('#uitnodigGoogle').style.display = '';
      pendingTeamInfo = {code, teamNaam: team.naam};
    }
  } catch(e){
    $('#uitnodigSubtitel').textContent = 'Kon de uitnodiging niet ophalen: ' + e.code;
  }
  return true;
}

/* na inloggen: eventuele openstaande koppeling afhandelen.
   Geeft het team-document terug als er net is aangesloten, anders null. */
export async function handelPendingJoin(){
  if (pendingJoin){
    const {code} = pendingJoin; pendingJoin = null;
    return await joinMetCode(code);
  }
  if (pendingJoinNaNormaleLogin){
    const code = pendingJoinNaNormaleLogin; pendingJoinNaNormaleLogin = null;
    if (!S.teams.find(t => t.code === code)){
      return await joinMetCode(code);
    }
  }
  return null;
}

/* deep-links (?team= of ?club=) na inloggen verwerken */
export async function verwerkDeeplink(openTeam, openClub){
  if (deeplinkVerwerkt) return;
  const p = new URLSearchParams(location.search);
  const teamCode = p.get('team');
  const clubCode = p.get('club');
  if (teamCode){
    deeplinkVerwerkt = true;
    history.replaceState(null,'',location.pathname);
    if (!S.teams.find(t => t.code === teamCode.toUpperCase())){
      const t = await joinMetCode(teamCode.toUpperCase());
      if (t){ meld('Welkom bij ' + t.data().naam); openTeam(t.id); }
    }
  } else if (clubCode){
    deeplinkVerwerkt = true;
    history.replaceState(null,'',location.pathname);
    const snap = await getDocs(query(collection(db,'clubs'), where('code','==',clubCode.toUpperCase())));
    if (snap.empty) return meld('Clubcode niet gevonden');
    const c = snap.docs[0];
    await updateDoc(c.ref, {['leden.'+S.user.uid]: true,
      ['ledenInfo.'+S.user.uid]: {naam: S.user.displayName || S.user.email || 'Coach'}});
    meld('Gekoppeld aan ' + c.data().naam);
  }
}
