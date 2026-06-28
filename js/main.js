import { auth, onAuthStateChanged } from './firebase.js';
import { S, $, initModalSluiten, meld, initTerugknop } from './state.js';
import {
  initAuthUI, checkUitnodiging, handelPendingJoin, verwerkDeeplink
} from './auth.js';
import { startTeams, openTeam, renderTeam, verlaatTeamView } from './teams.js';
import { openClub, verlaatClubView } from './club.js';
import { sluitWedstrijd } from './wedstrijd.js';

/* knoppen en modal-gedrag één keer registreren */
initModalSluiten();
initAuthUI();

/* Terugknop-afhandeling: koppel de abstracte hooks uit state.js aan de
   echte navigatiefuncties (voorkomt circulaire imports in state.js). */
S._navRerender       = renderTeam;
S._navVerlaatTeam    = verlaatTeamView;
S._navVerlaatClub    = verlaatClubView;
S._navTerugWedstrijd = sluitWedstrijd;
initTerugknop();

onAuthStateChanged(auth, async user => {
  S.user = user;
  if (user){
    $('#login').style.display = 'none';
    $('#uitnodiging').style.display = 'none';
    $('#app').style.display = '';
    startTeams();

    /* openstaande teamkoppeling (uit uitnodiging) afhandelen */
    const t = await handelPendingJoin();
    if (t){ meld('Welkom bij ' + t.data().naam); openTeam(t.id); }

    /* deep-link in de URL verwerken na inloggen */
    setTimeout(() => verwerkDeeplink(openTeam, openClub), 800);
  } else {
    $('#app').style.display = 'none';
    for (const k of Object.keys(S.unsub)){ try { S.unsub[k](); } catch(e){} delete S.unsub[k]; }

    const heeftUitnodiging = await checkUitnodiging();
    if (heeftUitnodiging){
      $('#login').style.display = 'none';
      $('#uitnodiging').style.display = '';
      setTimeout(() => $('#uitnodigEmail')?.focus(), 100);
    } else {
      $('#login').style.display = '';
      $('#uitnodiging').style.display = 'none';
    }
  }
});
