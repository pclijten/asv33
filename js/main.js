import { auth, onAuthStateChanged } from './firebase.js';
import { S, $, initModalSluiten } from './state.js';
import {
  initAuthUI, checkUitnodiging, handelPendingJoin, verwerkDeeplink
} from './auth.js';
import { startTeams, openTeam } from './teams.js';
import { openClub } from './club.js';
import { meld } from './state.js';

/* knoppen en modal-gedrag één keer registreren */
initModalSluiten();
initAuthUI();

onAuthStateChanged(auth, async user => {
  S.user = user;
  if (user){
    $('#login').style.display = 'none';
    $('#uitnodiging').style.display = 'none';
    $('#app').style.display = '';
    startTeams();

    /* openstaande koppeling (teamcode of Google-na-uitnodiging) afhandelen */
    const t = await handelPendingJoin();
    if (t){ meld('Welkom bij ' + t.data().naam); openTeam(t.id); }

    /* deep-link in de URL verwerken na inloggen */
    setTimeout(() => verwerkDeeplink(openTeam, openClub), 800);
  } else {
    $('#app').style.display = 'none';
    /* alle live-listeners stoppen */
    for (const k of Object.keys(S.unsub)){ try { S.unsub[k](); } catch(e){} delete S.unsub[k]; }

    const heeftUitnodiging = await checkUitnodiging();
    if (heeftUitnodiging){
      $('#login').style.display = 'none';
      $('#uitnodiging').style.display = '';
      setTimeout(() => $('#uitnodigNaam')?.focus(), 100);
    } else {
      $('#login').style.display = '';
      $('#uitnodiging').style.display = 'none';
    }
  }
});
