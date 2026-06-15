import {
  auth, db, GoogleAuthProvider, signInWithPopup, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  collection, doc, getDocs, updateDoc, query, where
} from './firebase.js';
import { S, $, meld } from './state.js';

/* ====================================================================
   AANMELD-FLOW (e-maillink + Google, geen anonieme login meer)

   - Coaches loggen in met Google óf met een wachtwoordloze e-maillink.
     Beide geven een STABIELE identiteit (vaste uid), dus opnieuw inloggen
     maakt geen dubbele coach meer aan.
   - Een uitnodigingslink (?team=CODE) bepaalt bij welk team je komt. De
     teamcode bewaren we in localStorage zodat hij de mail-omweg overleeft:
     na het klikken op de inloglink opent de app op een verse pagina.
   - Alleen accounts in BEHEERDERS (state.js) mogen clubs/teams aanmaken;
     dat wordt in de UI verborgen én in de Firestore-regels afgedwongen.
==================================================================== */

const LS_EMAIL = 'opstelling_login_email';   // e-mailadres tijdens maillink-flow
const LS_CODE  = 'opstelling_join_code';     // teamcode die na login gekoppeld moet worden

let pendingJoinNaLogin = null;   // teamcode om te koppelen zodra we zijn ingelogd
let pendingTeamInfo = null;      // {code, teamNaam} uit de uitnodigingslink
let deeplinkVerwerkt = false;

export function getPendingTeamInfo(){ return pendingTeamInfo; }

/* instellingen voor de e-maillink: keer terug op deze pagina */
function actionCodeSettings(){
  return { url: location.origin + location.pathname, handleCodeInApp: true };
}

/* ---------- knoppen koppelen (één keer, bij opstart) ---------- */
export function initAuthUI(){
  // --- Inlogscherm: Google ---
  $('#googleLogin').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e){ meld('Inloggen mislukt: ' + (e.code||e.message)); }
  });

  // --- Inlogscherm: e-maillink aanvragen ---
  $('#mailLoginOk').addEventListener('click', () => stuurInloglink(
    $('#loginEmail').value, $('#mailLoginForm'), $('#mailVerstuurd'), $('#mailVerstuurdAdres')));

  // --- Inlogscherm: e-mail + wachtwoord ---
  $('#wwLoginOk').addEventListener('click', () =>
    wachtwoordLogin($('#loginEmail').value, $('#loginWachtwoord').value, $('#wwLoginOk')));
  $('#loginWachtwoord').addEventListener('keydown', e => {
    if (e.key === 'Enter') wachtwoordLogin($('#loginEmail').value, $('#loginWachtwoord').value, $('#wwLoginOk'));
  });
  $('#wwVergeten').addEventListener('click', () => wachtwoordVergeten($('#loginEmail').value));

  const opnieuw = $('#mailOpnieuw');
  if (opnieuw) opnieuw.addEventListener('click', () => {
    $('#mailVerstuurd').style.display = 'none';
    $('#mailLoginForm').style.display = '';
    $('#loginEmail').focus();
  });

  // --- Uitnodigingsscherm: Google ---
  $('#uitnodigGoogle').addEventListener('click', async () => {
    if (pendingTeamInfo) { try { localStorage.setItem(LS_CODE, pendingTeamInfo.code); } catch(e){} }
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e){ meld('Inloggen mislukt: ' + (e.code||e.message)); }
  });

  // --- Uitnodigingsscherm: e-maillink aanvragen ---
  $('#uitnodigOk').addEventListener('click', () => {
    if (pendingTeamInfo) { try { localStorage.setItem(LS_CODE, pendingTeamInfo.code); } catch(e){} }
    stuurInloglink($('#uitnodigEmail').value, null, $('#uitnodigVerstuurd'), $('#uitnodigVerstuurdAdres'));
  });

  // --- Uitnodigingsscherm: e-mail + wachtwoord ---
  $('#uitnodigWwOk').addEventListener('click', () => {
    if (pendingTeamInfo) { try { localStorage.setItem(LS_CODE, pendingTeamInfo.code); } catch(e){} }
    wachtwoordLogin($('#uitnodigEmail').value, $('#uitnodigWachtwoord').value, $('#uitnodigWwOk'));
  });
  $('#uitnodigWachtwoord').addEventListener('keydown', e => {
    if (e.key === 'Enter'){
      if (pendingTeamInfo) { try { localStorage.setItem(LS_CODE, pendingTeamInfo.code); } catch(ev){} }
      wachtwoordLogin($('#uitnodigEmail').value, $('#uitnodigWachtwoord').value, $('#uitnodigWwOk'));
    }
  });

  $('#uitnodigAnders').addEventListener('click', () => {
    $('#uitnodiging').style.display = 'none';
    $('#login').style.display = '';
    $('#loginEmail').focus();
  });
}

/* Log in met e-mail + wachtwoord. Bestaat het account nog niet, dan wordt het
   automatisch aangemaakt met dit wachtwoord (registreren = eerste keer inloggen). */
async function wachtwoordLogin(adresRuw, wachtwoord, knop){
  const adres = (adresRuw||'').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres)) return meld('Vul een geldig e-mailadres in');
  if ((wachtwoord||'').length < 6) return meld('Wachtwoord moet minstens 6 tekens zijn');
  const oudeTekst = knop ? knop.textContent : '';
  if (knop){ knop.disabled = true; knop.textContent = 'Bezig...'; }
  try {
    await signInWithEmailAndPassword(auth, adres, wachtwoord);
  } catch(e){
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential'){
      // account bestaat nog niet → aanmaken. Maar bij een fout wachtwoord op een
      // bestaand account geeft Firebase ook 'invalid-credential'; vang dat af.
      try {
        await createUserWithEmailAndPassword(auth, adres, wachtwoord);
      } catch(e2){
        if (e2.code === 'auth/email-already-in-use'){
          meld('Onjuist wachtwoord voor dit account. Probeer opnieuw of gebruik "wachtwoord vergeten".');
        } else {
          meld('Inloggen mislukt: ' + (e2.code||e2.message));
        }
      }
    } else if (e.code === 'auth/wrong-password'){
      meld('Onjuist wachtwoord. Probeer opnieuw of gebruik "wachtwoord vergeten".');
    } else {
      meld('Inloggen mislukt: ' + (e.code||e.message));
    }
  } finally {
    if (knop){ knop.disabled = false; knop.textContent = oudeTekst; }
  }
}

/* stuur een wachtwoord-reset-mail */
async function wachtwoordVergeten(adresRuw){
  const adres = (adresRuw||'').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres)) return meld('Vul eerst je e-mailadres in');
  try {
    await sendPasswordResetEmail(auth, adres);
    meld('Reset-link gestuurd naar ' + adres);
  } catch(e){
    meld('Kon geen reset-mail sturen: ' + (e.code||e.message));
  }
}

/* stuur een wachtwoordloze inloglink naar het opgegeven adres */
async function stuurInloglink(adresRuw, verbergEl, toonEl, adresEl){
  const adres = (adresRuw||'').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres)) return meld('Vul een geldig e-mailadres in');
  try {
    await sendSignInLinkToEmail(auth, adres, actionCodeSettings());
    try { localStorage.setItem(LS_EMAIL, adres); } catch(e){}
    if (verbergEl) verbergEl.style.display = 'none';
    if (adresEl) adresEl.textContent = adres;
    if (toonEl) toonEl.style.display = '';
  } catch(e){
    meld('Versturen mislukt: ' + (e.code||e.message));
  }
}

/* Als de huidige URL een inloglink is: rond het inloggen af.
   Retourneert true als er een loginpoging liep (de auth-listener pikt 'm op). */
export async function checkInlogLink(){
  if (!isSignInWithEmailLink(auth, location.href)) return false;
  let email = '';
  try { email = localStorage.getItem(LS_EMAIL) || ''; } catch(e){}
  if (!email){
    // mail op een ander apparaat geopend: vraag het adres opnieuw
    email = window.prompt('Bevestig je e-mailadres om het inloggen af te ronden:') || '';
  }
  if (!email){ meld('Inloggen afgebroken'); return false; }
  try {
    await signInWithEmailLink(auth, email, location.href);
    try { localStorage.removeItem(LS_EMAIL); } catch(e){}
    // URL opschonen zodat de link niet opnieuw verwerkt wordt
    history.replaceState(null, '', location.origin + location.pathname);
    return true;
  } catch(e){
    meld('Inloglink ongeldig of verlopen: ' + (e.code||e.message));
    return false;
  }
}

export function doSignOut(){ signOut(auth); }

/* koppel de ingelogde gebruiker aan een team op basis van de teamcode */
export async function joinMetCode(code, naam = null){
  const snap = await getDocs(query(collection(db,'teams'), where('code','==',code)));
  if (snap.empty){ meld('Geen team gevonden met code ' + code); return null; }
  const t = snap.docs[0];
  const ledNaam = (naam && naam.trim())
    || S.user.displayName
    || (S.user.email ? S.user.email.split('@')[0] : '')
    || 'Coach';
  await updateDoc(t.ref, {
    ['leden.'+S.user.uid]: true,
    ['ledenInfo.'+S.user.uid]: {naam: ledNaam, email: S.user.email || ''},
  });
  return t;
}

/* uitnodigingslink herkennen en het uitnodigingsscherm voorbereiden */
export async function checkUitnodiging(){
  const p = new URLSearchParams(location.search);
  const code = (p.get('team') || '').toUpperCase();
  if (!code) return false;
  pendingTeamInfo = {code, teamNaam: ''};
  try {
    const snap = await getDocs(query(collection(db,'teams'), where('code','==',code)));
    if (snap.empty){
      $('#uitnodigTitel').textContent = 'Uitnodiging ongeldig';
      $('#uitnodigSubtitel').textContent = 'Deze link werkt niet meer. Controleer of je de volledige link hebt, of vraag een nieuwe aan je coach.';
      $('#uitnodigGoogle').style.display = 'none';
      $('#uitnodigOk').style.display = 'none';
      $('#uitnodigEmail').style.display = 'none';
      pendingTeamInfo = null;
    } else {
      const team = snap.docs[0].data();
      $('#uitnodigTitel').textContent = '🏟 ' + team.naam;
      $('#uitnodigSubtitel').textContent = team.clubNaam
        ? 'Je bent uitgenodigd als coach bij ' + team.clubNaam + '. Log in om aan te sluiten.'
        : 'Je bent uitgenodigd als coach. Log in om aan te sluiten.';
      pendingTeamInfo = {code, teamNaam: team.naam};
    }
  } catch(e){
    $('#uitnodigTitel').textContent = 'Welkom!';
    $('#uitnodigSubtitel').textContent = 'Log in om als coach aan te sluiten bij het team.';
  }
  return true;
}

/* na inloggen: openstaande teamkoppeling afhandelen (uit localStorage).
   Geeft het team-document terug als er net is aangesloten, anders null. */
export async function handelPendingJoin(){
  let code = pendingJoinNaLogin;
  pendingJoinNaLogin = null;
  if (!code){ try { code = localStorage.getItem(LS_CODE) || ''; } catch(e){} }
  if (!code) return null;
  try { localStorage.removeItem(LS_CODE); } catch(e){}
  if (S.teams.find(t => (t.code||'').toUpperCase() === code.toUpperCase())) return null;
  return await joinMetCode(code);
}

/* deep-links (?team= of ?club=) na inloggen verwerken */
export async function verwerkDeeplink(openTeam, openClub){
  if (deeplinkVerwerkt) return;
  const p = new URLSearchParams(location.search);
  const teamParam = p.get('team');
  const clubCode = p.get('club');
  if (teamParam){
    deeplinkVerwerkt = true;
    history.replaceState(null,'',location.pathname);
    const code = teamParam.toUpperCase();
    if (!S.teams.find(t => (t.code||'').toUpperCase() === code)){
      const t = await joinMetCode(code);
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
