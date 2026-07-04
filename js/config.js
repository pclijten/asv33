import { S } from './state.js';

/* ==================== KNVB-CATEGORIEËN ====================
   Bron: KNVB wedstrijdvormen & speeltijden (knvb.nl)
   Pupillen spelen officieel 2 helften met een time-out halverwege
   elke helft — in de praktijk dus 4 kwarten. Junioren/senioren: 2 helften. */
export const CATEGORIEEN = {
  'JO7':  {format:'4',  periodes:4, duur:10,   knvb:'4 tegen 4 · geen keeper · 2×20 min'},
  'JO8':  {format:'6',  periodes:4, duur:10,   knvb:'6 tegen 6 · 2×20 min, time-out per helft'},
  'JO9':  {format:'6',  periodes:4, duur:10,   knvb:'6 tegen 6 · 2×20 min, time-out per helft'},
  'JO10': {format:'6',  periodes:4, duur:12.5, knvb:'6 tegen 6 · 2×25 min, time-out per helft'},
  'JO11': {format:'8',  periodes:4, duur:15,   knvb:'8 tegen 8 · 2×30 min, time-out per helft'},
  'JO12': {format:'8',  periodes:4, duur:15,   knvb:'8 tegen 8 · 2×30 min, time-out per helft'},
  'JO13': {format:'11', periodes:2, duur:30,   knvb:'11 tegen 11 · 2×30 min'},
  'JO14': {format:'11', periodes:2, duur:35,   knvb:'11 tegen 11 · 2×35 min'},
  'JO15': {format:'11', periodes:2, duur:35,   knvb:'11 tegen 11 · 2×35 min'},
  'JO16': {format:'11', periodes:2, duur:40,   knvb:'11 tegen 11 · 2×40 min'},
  'JO17': {format:'11', periodes:2, duur:40,   knvb:'11 tegen 11 · 2×40 min'},
  'JO19': {format:'11', periodes:2, duur:45,   knvb:'11 tegen 11 · 2×45 min'},
  'Senioren': {format:'11', periodes:2, duur:45, knvb:'11 tegen 11 · 2×45 min'},
};
export const CATEGORIEEN_MEIDEN = {
  'MO7':  {format:'4',  periodes:4, duur:10,   knvb:'4 tegen 4 · geen keeper · 2×20 min'},
  'MO8':  {format:'6',  periodes:4, duur:10,   knvb:'6 tegen 6 · 2×20 min, time-out per helft'},
  'MO9':  {format:'6',  periodes:4, duur:10,   knvb:'6 tegen 6 · 2×20 min, time-out per helft'},
  'MO10': {format:'6',  periodes:4, duur:12.5, knvb:'6 tegen 6 · 2×25 min, time-out per helft'},
  'MO11': {format:'8',  periodes:4, duur:15,   knvb:'8 tegen 8 · 2×30 min, time-out per helft'},
  'MO12': {format:'8',  periodes:4, duur:15,   knvb:'8 tegen 8 · 2×30 min, time-out per helft'},
  'MO13': {format:'9',  periodes:2, duur:30,   knvb:'9 tegen 9 · 2×30 min'},
  'MO15': {format:'9',  periodes:2, duur:35,   knvb:'9 tegen 9 · 2×35 min'},
  'MO17': {format:'9',  periodes:2, duur:40,   knvb:'9 tegen 9 · 2×40 min'},
  'MO20': {format:'9',  periodes:2, duur:45,   knvb:'9 tegen 9 · 2×45 min'},
  'Vrouwen': {format:'11', periodes:2, duur:45, knvb:'11 tegen 11 · 2×45 min'},
};
export function catInfo(naam){ return CATEGORIEEN[naam] || CATEGORIEEN_MEIDEN[naam] || null; }

export function isToernooi(w){ return w.type === 'toernooi'; }

/* tijdstraf in seconden — KNVB: 5 min pupillen (t/m JO/MO15), 10 min junioren+/senioren */
export function tijdstrafSec(){
  const cat = S.team?.categorie || '';
  const m = cat.match(/^[JM]O(\d+)$/);
  if (m && Number(m[1]) >= 16) return 600;
  if (cat === 'Senioren' || cat === 'Vrouwen') return 600;
  return 300;
}
export const KAART_ICOON = {geel:'🟨', rood:'🟥', tijd:'⏱'};
export const KAART_NAAM  = {geel:'gele kaart', rood:'rode kaart', tijd:'tijdstraf'};

export function periodeNaam(w){
  if (isToernooi(w)) return w.toernooi.helften === 1 ? 'Wedstrijd' : 'Helft';
  return (w.periodes||4) === 2 ? 'Helft' : 'Kwart';
}
export function periodeNrs(w){ return Array.from({length: w.periodes||4}, (_,i) => String(i+1)); }
export function periodeLabel(w, nr){
  if (isToernooi(w)){
    const h = w.toernooi.helften;
    return h === 1 ? 'W'+nr : 'W'+Math.ceil(nr/h)+'.'+(((nr-1)%h)+1);
  }
  return ((w.periodes||4) === 2 ? 'H' : 'K') + nr;
}
export function toernooiWnr(w, nr = S.kwart){ return Math.ceil(Number(nr) / w.toernooi.helften); }
export function periodeOmschrijving(w, nr = S.kwart){
  if (isToernooi(w)){
    const wnr = toernooiWnr(w, nr);
    return w.toernooi.helften === 1 ? 'wedstrijd '+wnr : `wedstrijd ${wnr}, helft ${((Number(nr)-1)%w.toernooi.helften)+1}`;
  }
  return periodeNaam(w).toLowerCase()+' '+nr;
}

/* ==================== FORMATIES ==================== */
/* [x%, y%, lijn]  — keeper wordt automatisch toegevoegd op (50, 90),
   behalve bij 4 tegen 4 (JO7): daar speelt niemand op doel. */
export const FORMATIES = {
  '4': {
    '1-2-1': [[50,76,'V'],[24,50,'M'],[76,50,'M'],[50,24,'A']],
    '2-2':   [[30,68,'V'],[70,68,'V'],[30,32,'A'],[70,32,'A']],
    '1-1-2': [[50,76,'V'],[50,50,'M'],[30,26,'A'],[70,26,'A']],
  },
  '6': {
    '2-1-2': [[30,72,'V'],[70,72,'V'],[50,49,'M'],[30,26,'A'],[70,26,'A']],
    '1-2-2': [[50,73,'V'],[30,49,'M'],[70,49,'M'],[30,26,'A'],[70,26,'A']],
    '2-2-1': [[30,72,'V'],[70,72,'V'],[30,47,'M'],[70,47,'M'],[50,24,'A']],
    '1-3-1': [[50,73,'V'],[20,49,'M'],[50,46,'M'],[80,49,'M'],[50,24,'A']],
    '3-1-1': [[22,72,'V'],[50,75,'V'],[78,72,'V'],[50,48,'M'],[50,24,'A']],
  },
  '8': {
    '3-3-1': [[22,73,'V'],[50,76,'V'],[78,73,'V'],[22,48,'M'],[50,45,'M'],[78,48,'M'],[50,23,'A']],
    '2-3-2': [[32,74,'V'],[68,74,'V'],[20,48,'M'],[50,45,'M'],[80,48,'M'],[32,23,'A'],[68,23,'A']],
    '3-2-2': [[22,73,'V'],[50,76,'V'],[78,73,'V'],[32,47,'M'],[68,47,'M'],[32,23,'A'],[68,23,'A']],
    '2-4-1': [[32,74,'V'],[68,74,'V'],[14,48,'M'],[38,45,'M'],[62,45,'M'],[86,48,'M'],[50,23,'A']],
    '1-3-3': [[50,75,'V'],[22,49,'M'],[50,46,'M'],[78,49,'M'],[22,24,'A'],[50,21,'A'],[78,24,'A']],
    '1-4-2': [[50,75,'V'],[14,49,'M'],[38,46,'M'],[62,46,'M'],[86,49,'M'],[32,23,'A'],[68,23,'A']],
  },
  '9': {
    '3-3-2': [[22,74,'V'],[50,77,'V'],[78,74,'V'],[22,49,'M'],[50,46,'M'],[78,49,'M'],[32,23,'A'],[68,23,'A']],
    '3-2-3': [[22,74,'V'],[50,77,'V'],[78,74,'V'],[32,48,'M'],[68,48,'M'],[20,24,'A'],[50,21,'A'],[80,24,'A']],
    '2-4-2': [[32,75,'V'],[68,75,'V'],[14,49,'M'],[38,46,'M'],[62,46,'M'],[86,49,'M'],[32,23,'A'],[68,23,'A']],
    '4-3-1': [[14,73,'V'],[38,77,'V'],[62,77,'V'],[86,73,'V'],[25,47,'M'],[50,44,'M'],[75,47,'M'],[50,21,'A']],
  },
  '11': {
    '4-3-3': [[14,75,'V'],[38,78,'V'],[62,78,'V'],[86,75,'V'],[27,52,'M'],[50,48,'M'],[73,52,'M'],[19,25,'A'],[50,21,'A'],[81,25,'A']],
    '4-4-2': [[14,75,'V'],[38,78,'V'],[62,78,'V'],[86,75,'V'],[14,49,'M'],[38,46,'M'],[62,46,'M'],[86,49,'M'],[35,23,'A'],[65,23,'A']],
    '3-4-3': [[25,76,'V'],[50,78,'V'],[75,76,'V'],[14,49,'M'],[38,46,'M'],[62,46,'M'],[86,49,'M'],[19,25,'A'],[50,21,'A'],[81,25,'A']],
    '4-2-3-1': [[14,77,'V'],[38,80,'V'],[62,80,'V'],[86,77,'V'],[36,58,'M'],[64,58,'M'],[20,38,'M'],[50,35,'M'],[80,38,'M'],[50,17,'A']],
    '4-1-4-1': [[14,77,'V'],[38,80,'V'],[62,80,'V'],[86,77,'V'],[50,60,'M'],[14,40,'M'],[38,37,'M'],[62,37,'M'],[86,40,'M'],[50,17,'A']],
    '3-5-2': [[25,77,'V'],[50,79,'V'],[75,77,'V'],[10,46,'M'],[32,48,'M'],[50,52,'M'],[68,48,'M'],[90,46,'M'],[35,21,'A'],[65,21,'A']],
    '5-3-2': [[10,72,'V'],[30,78,'V'],[50,80,'V'],[70,78,'V'],[90,72,'V'],[27,48,'M'],[50,45,'M'],[73,48,'M'],[35,21,'A'],[65,21,'A']],
  },
};
export const LIJN_NAAM = {K:'Keeper', V:'Verdediging', M:'Middenveld', A:'Aanval'};

export function bouwSlots(format, formatie){
  const def = (FORMATIES[format] && FORMATIES[format][formatie])
           || Object.values(FORMATIES[format])[0];
  const slots = format === '4' ? [] : [{id:'K', x:50, y:90, lijn:'K'}];
  const tel = {V:0, M:0, A:0};
  for (const [x,y,l] of def){ tel[l]++; slots.push({id:l+tel[l], x, y, lijn:l}); }
  return slots;
}
export const slotLijn = id => id[0];

/* ==================== BOUW-INDELING (voor trainingen) ====================
   Onderbouw  : JO7–JO11  / MO7–MO11
   Middenbouw : JO12–JO15 / MO12–MO15
   Bovenbouw  : JO16–JO19 / MO17–MO20, plus Senioren/Vrouwen en onbekend. */
export const BOUWEN = [
  {id:'onder',  naam:'Onderbouw',  kort:'Onder'},
  {id:'midden', naam:'Middenbouw', kort:'Midden'},
  {id:'boven',  naam:'Bovenbouw',  kort:'Boven'},
];
export function bouwVanCategorie(categorie){
  const m = String(categorie||'').toUpperCase().match(/^[JM]O(\d+)/);
  if (m){
    const lft = Number(m[1]);
    if (lft <= 11) return 'onder';
    if (lft <= 15) return 'midden';
    return 'boven';
  }
  // Senioren, Vrouwen of niets ingesteld → bovenbouw
  return 'boven';
}
export function bouwNaam(id){ return (BOUWEN.find(b => b.id === id)?.naam) || 'Overig'; }

/* ==================== YOUTUBE-HELPERS ==================== */
/* haalt de video-id uit allerlei YouTube-URL-vormen; null als het geen YouTube is */
export function youtubeId(url){
  if (!url) return null;
  const s = String(url).trim();
  const patronen = [
    /(?:youtube\.com\/watch\?[^ ]*\bv=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patronen){ const m = s.match(p); if (m) return m[1]; }
  // kale 11-teken id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
}
export function youtubeThumb(id){ return `https://img.youtube.com/vi/${id}/mqdefault.jpg`; }
export function youtubeWatch(id){ return `https://www.youtube.com/watch?v=${id}`; }

/* ==================== KNVB SPEELDAGENKALENDER 2026/'27 ====================
   Districten Zuid I en II. Zaterdagdatum per speelweek (ISO).
   t: wd=wedstrijddag, beker, inhaal, vrij. l=label, n=opmerking (optioneel).
   pup=O7-O12, jun=O13-O19, sen=Senioren/Vrouwen, mei=Meiden MO13-MO20. */
export const KNVB_SEIZOEN = "2026/'27";

/* Standaardwaarde voor clubs/{clubId}.huidigSeizoen zolang de beheerder nog
   niet op "Nieuw seizoen starten" heeft gedrukt (zie club.js/teams.js). Dit is
   los van KNVB_SEIZOEN hierboven, dat alleen de KNVB-speeldagenkalender labelt. */
export const SEIZOEN_FALLBACK = "2025/'26";
export const KNVB_KALENDER = {
  pup: [
    {d:'2026-08-16',t:'vrij',l:'Vrij',n:'Schoolvakanties N t/m 16 aug'},
    {d:'2026-08-23',t:'vrij',l:'Vrij',n:'Schoolvakanties Z t/m 23 aug.'},
    {d:'2026-08-30',t:'wd',l:'Fase 1 · start',n:'Schoolvakanties M t/m 30 aug.'},
    {d:'2026-09-06',t:'wd',l:'Fase 1'},
    {d:'2026-09-13',t:'wd',l:'Fase 1'},
    {d:'2026-09-20',t:'wd',l:'Fase 1'},
    {d:'2026-09-27',t:'wd',l:'Fase 1'},
    {d:'2026-10-04',t:'wd',l:'Fase 1'},
    {d:'2026-10-11',t:'wd',l:'Fase 1',n:'Herfstvakantie N: 10-18 okt'},
    {d:'2026-10-18',t:'vrij',l:'Vrij',n:'Herfstvakantie alle regio\'s'},
    {d:'2026-10-25',t:'vrij',l:'Vrij',n:'Herfstvakantie M-Z: 17-25 okt'},
    {d:'2026-10-31',t:'wd',l:'Fase 2 · start'},
    {d:'2026-11-08',t:'wd',l:'Fase 2'},
    {d:'2026-11-15',t:'wd',l:'Fase 2'},
    {d:'2026-11-22',t:'wd',l:'Fase 2'},
    {d:'2026-11-29',t:'wd',l:'Fase 2'},
    {d:'2026-12-06',t:'wd',l:'Fase 2'},
    {d:'2026-12-13',t:'wd',l:'Fase 2'},
    {d:'2026-12-20',t:'vrij',l:'Vrij',n:'Kerstvakantie 19 dec.-3 jan.'},
    {d:'2027-01-10',t:'vrij',l:'Vrij'},
    {d:'2027-01-17',t:'vrij',l:'Vrij'},
    {d:'2027-01-24',t:'wd',l:'Fase 3 · start'},
    {d:'2027-01-31',t:'wd',l:'Fase 3'},
    {d:'2027-02-07',t:'vrij',l:'Vrij',n:'Carnavalsweekend'},
    {d:'2027-02-14',t:'vrij',l:'Vrij',n:'Vrj.vak. Z: 13-21 feb.'},
    {d:'2027-02-21',t:'wd',l:'Fase 3',n:'Vrj.vak. alle regio\'s'},
    {d:'2027-02-28',t:'wd',l:'Fase 3',n:'Vrj.vak. N-M: 20-28 feb'},
    {d:'2027-03-07',t:'wd',l:'Fase 3'},
    {d:'2027-03-14',t:'wd',l:'Fase 3'},
    {d:'2027-03-21',t:'wd',l:'Fase 3'},
    {d:'2027-03-27',t:'vrij',l:'Vrij',n:'Paaszaterdag'},
    {d:'2027-03-29',t:'vrij',l:'Vrij',n:'2e Paasdag'},
    {d:'2027-04-04',t:'wd',l:'Fase 4 · start'},
    {d:'2027-04-11',t:'wd',l:'Fase 4'},
    {d:'2027-04-18',t:'wd',l:'Fase 4'},
    {d:'2027-04-25',t:'vrij',l:'Vrij',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-02',t:'vrij',l:'Vrij',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-06',t:'vrij',l:'Vrij',n:'Hemelvaartsdag'},
    {d:'2027-05-09',t:'vrij',l:'Vrij'},
    {d:'2027-05-15',t:'vrij',l:'Vrij'},
    {d:'2027-05-23',t:'wd',l:'Fase 4'},
    {d:'2027-05-30',t:'wd',l:'Fase 4'},
    {d:'2027-06-06',t:'vrij',l:'Vrij',n:'Finales Districtsbeker'}
  ],
  jun: [
    {d:'2026-08-16',t:'vrij',l:'Vrij',n:'Schoolvakanties N t/m 16 aug'},
    {d:'2026-08-23',t:'vrij',l:'Vrij',n:'Schoolvakanties Z t/m 23 aug.'},
    {d:'2026-08-30',t:'beker',l:'Beker',n:'Schoolvakanties M t/m 30 aug.'},
    {d:'2026-09-06',t:'beker',l:'Beker'},
    {d:'2026-09-13',t:'beker',l:'Beker'},
    {d:'2026-09-20',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-09-27',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-10-04',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-10-11',t:'wd',l:'Wedstrijddag najaar',n:'Herfstvakantie N: 10-18 okt'},
    {d:'2026-10-18',t:'inhaal',l:'Inhaal / Beker',n:'Herfstvakantie alle regio\'s'},
    {d:'2026-10-25',t:'wd',l:'Wedstrijddag najaar',n:'Herfstvakantie M-Z: 17-25 okt'},
    {d:'2026-10-31',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-11-08',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-11-15',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-11-22',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-11-29',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-12-06',t:'wd',l:'Wedstrijddag najaar'},
    {d:'2026-12-13',t:'inhaal',l:'Inhaal / Beker'},
    {d:'2026-12-20',t:'inhaal',l:'Inhaal / Beker',n:'Kerstvakantie 19 dec.-3 jan.'},
    {d:'2027-01-10',t:'vrij',l:'Vrij'},
    {d:'2027-01-17',t:'beker',l:'Beker'},
    {d:'2027-01-24',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-01-31',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-02-07',t:'vrij',l:'Vrij',n:'Carnavalsweekend'},
    {d:'2027-02-14',t:'inhaal',l:'Inhaal / Beker',n:'Vrj.vak. Z: 13-21 feb.'},
    {d:'2027-02-21',t:'inhaal',l:'Inhaal / Beker',n:'Vrj.vak. alle regio\'s'},
    {d:'2027-02-28',t:'wd',l:'Wedstrijddag voorjaar',n:'Vrj.vak. N-M: 20-28 feb'},
    {d:'2027-03-07',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-03-14',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-03-21',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-03-27',t:'inhaal',l:'Inhaal / Beker',n:'Paaszaterdag'},
    {d:'2027-03-29',t:'inhaal',l:'Inhaal / Beker',n:'2e Paasdag'},
    {d:'2027-04-04',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-04-11',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-04-18',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-04-25',t:'inhaal',l:'Inhaal / Beker',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-02',t:'inhaal',l:'Inhaal / Beker',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-06',t:'vrij',l:'Vrij',n:'Hemelvaartsdag'},
    {d:'2027-05-09',t:'wd',l:'Wedstrijddag voorjaar'},
    {d:'2027-05-15',t:'inhaal',l:'Inhaal / Beker'},
    {d:'2027-05-23',t:'wd',l:'Wedstrijddag voorjaar'}
  ],
  sen: [
    {d:'2026-08-16',t:'vrij',l:'Vrij',n:'Schoolvakanties N t/m 16 aug'},
    {d:'2026-08-23',t:'vrij',l:'Vrij',n:'Schoolvakanties Z t/m 23 aug.'},
    {d:'2026-08-30',t:'beker',l:'Beker',n:'Schoolvakanties M t/m 30 aug.'},
    {d:'2026-09-06',t:'beker',l:'Beker'},
    {d:'2026-09-13',t:'beker',l:'Beker'},
    {d:'2026-09-20',t:'wd',l:'Wedstrijddag'},
    {d:'2026-09-27',t:'wd',l:'Wedstrijddag'},
    {d:'2026-10-04',t:'wd',l:'Wedstrijddag'},
    {d:'2026-10-11',t:'wd',l:'Wedstrijddag',n:'Herfstvakantie N: 10-18 okt'},
    {d:'2026-10-18',t:'inhaal',l:'Inhaal / Beker',n:'Herfstvakantie alle regio\'s'},
    {d:'2026-10-25',t:'wd',l:'Wedstrijddag',n:'Herfstvakantie M-Z: 17-25 okt'},
    {d:'2026-10-31',t:'wd',l:'Wedstrijddag'},
    {d:'2026-11-08',t:'wd',l:'Wedstrijddag'},
    {d:'2026-11-15',t:'wd',l:'Wedstrijddag'},
    {d:'2026-11-22',t:'inhaal',l:'Inhaal / Beker'},
    {d:'2026-11-29',t:'wd',l:'Wedstrijddag'},
    {d:'2026-12-06',t:'wd',l:'Wedstrijddag'},
    {d:'2026-12-13',t:'inhaal',l:'Inhaal / Beker'},
    {d:'2026-12-20',t:'inhaal',l:'Inhaal / Beker',n:'Kerstvakantie 19 dec.-3 jan.'},
    {d:'2027-01-10',t:'inhaal',l:'Inhaal / Beker'},
    {d:'2027-01-17',t:'inhaal',l:'Inhaal / Beker'},
    {d:'2027-01-24',t:'wd',l:'Wedstrijddag'},
    {d:'2027-01-31',t:'wd',l:'Wedstrijddag'},
    {d:'2027-02-07',t:'vrij',l:'Vrij',n:'Carnavalsweekend'},
    {d:'2027-02-14',t:'inhaal',l:'Inhaal / Beker',n:'Vrj.vak. Z: 13-21 feb.'},
    {d:'2027-02-21',t:'wd',l:'Wedstrijddag',n:'Vrj.vak. alle regio\'s'},
    {d:'2027-02-28',t:'wd',l:'Wedstrijddag',n:'Vrj.vak. N-M: 20-28 feb'},
    {d:'2027-03-07',t:'wd',l:'Wedstrijddag'},
    {d:'2027-03-11',t:'beker',l:'Beker'},
    {d:'2027-03-14',t:'wd',l:'Wedstrijddag'},
    {d:'2027-03-21',t:'wd',l:'Wedstrijddag'},
    {d:'2027-03-27',t:'inhaal',l:'Inhaal / Beker',n:'Paaszaterdag'},
    {d:'2027-03-29',t:'inhaal',l:'Inhaal / Beker',n:'2e Paasdag'},
    {d:'2027-04-04',t:'wd',l:'Wedstrijddag'},
    {d:'2027-04-11',t:'wd',l:'Wedstrijddag'},
    {d:'2027-04-18',t:'wd',l:'Wedstrijddag'},
    {d:'2027-04-25',t:'inhaal',l:'Inhaal / Beker',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-02',t:'inhaal',l:'Inhaal / Beker',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-06',t:'beker',l:'Beker',n:'Hemelvaartsdag'},
    {d:'2027-05-09',t:'wd',l:'Wedstrijddag'},
    {d:'2027-05-15',t:'vrij',l:'Vrij'},
    {d:'2027-05-23',t:'wd',l:'Wedstrijddag'}
  ],
  mei: [
    {d:'2026-08-16',t:'vrij',l:'Vrij',n:'Schoolvakanties N t/m 16 aug'},
    {d:'2026-08-23',t:'vrij',l:'Vrij',n:'Schoolvakanties Z t/m 23 aug.'},
    {d:'2026-08-30',t:'wd',l:'Fase 1 · start',n:'Schoolvakanties M t/m 30 aug.'},
    {d:'2026-09-06',t:'wd',l:'Fase 1'},
    {d:'2026-09-13',t:'wd',l:'Fase 1'},
    {d:'2026-09-20',t:'wd',l:'Fase 1'},
    {d:'2026-09-27',t:'wd',l:'Fase 1'},
    {d:'2026-10-04',t:'wd',l:'Fase 1'},
    {d:'2026-10-11',t:'wd',l:'Fase 1',n:'Herfstvakantie N: 10-18 okt'},
    {d:'2026-10-18',t:'inhaal',l:'Inhaal',n:'Herfstvakantie alle regio\'s'},
    {d:'2026-10-25',t:'inhaal',l:'Inhaal',n:'Herfstvakantie M-Z: 17-25 okt'},
    {d:'2026-10-31',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-11-08',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-11-15',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-11-22',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-11-29',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-12-06',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-12-13',t:'wd',l:'Div Fase 2 - Hfdkl F2'},
    {d:'2026-12-20',t:'inhaal',l:'Inhaal',n:'Kerstvakantie 19 dec.-3 jan.'},
    {d:'2027-01-10',t:'vrij',l:'Vrij'},
    {d:'2027-01-17',t:'vrij',l:'Vrij'},
    {d:'2027-01-24',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-01-31',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-02-07',t:'vrij',l:'Vrij',n:'Carnavalsweekend'},
    {d:'2027-02-14',t:'inhaal',l:'Inhaal',n:'Vrj.vak. Z: 13-21 feb.'},
    {d:'2027-02-21',t:'wd',l:'Div Inhaal - Hfdkl F3',n:'Vrj.vak. alle regio\'s'},
    {d:'2027-02-28',t:'wd',l:'Div Fase 2 - Hfdkl F3',n:'Vrj.vak. N-M: 20-28 feb'},
    {d:'2027-03-07',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-03-14',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-03-21',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-03-27',t:'inhaal',l:'Inhaal',n:'Paaszaterdag'},
    {d:'2027-03-29',t:'vrij',l:'Vrij',n:'2e Paasdag'},
    {d:'2027-04-04',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-04-11',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-04-18',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-04-25',t:'inhaal',l:'Inhaal',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-02',t:'inhaal',l:'Inhaal',n:'Meivakantie 24 apr.-2 mei'},
    {d:'2027-05-06',t:'vrij',l:'Vrij',n:'Hemelvaartsdag'},
    {d:'2027-05-09',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-05-15',t:'wd',l:'Div Inhaal - Hfdkl F3'},
    {d:'2027-05-23',t:'wd',l:'Div Fase 2 - Hfdkl F3'},
    {d:'2027-05-30',t:'wd',l:'Hfdkl Fase 3'},
    {d:'2027-06-06',t:'wd',l:'Final League',n:'Finales Districtsbeker'}
  ],
};

/* map een team-categorie naar de juiste KNVB-kolom */
export function kalenderKolomVoorCategorie(categorie){
  const c = String(categorie||'').toUpperCase();
  if (c === 'SENIOREN' || c === 'VROUWEN') return 'sen';
  const m = c.match(/^([JM])O(\d+)/);
  if (m){
    const meiden = m[1] === 'M';
    const lft = Number(m[2]);
    if (lft <= 12) return 'pup';
    return meiden ? 'mei' : 'jun';
  }
  return 'jun';
}
export function knvbKalenderVoorTeam(team){
  const kol = kalenderKolomVoorCategorie(team?.categorie);
  return KNVB_KALENDER[kol] || KNVB_KALENDER.jun;
}

/* ==================== ONTWIKKELDOMEINEN (ASV'33 hybride model) ====================
   De 4 voetbal-skills (Technisch/Tactisch/Fysiek/Mentaal) + een pedagogische laag
   (Gedrag & beleving), zoals 4-Skills en het Jeugdbeleidsplan ASV'33 voorstaan:
   "Leren voetballen, met plezier als basis en groei als doel."
   De pedagogische laag komt uit §5 (normen & waarden, teamgevoel, inzet, plezier). */
export const SKILLS = [
  {id:'TE', naam:'Technisch', omschrijving:'Balbeheersing, traptechniek, 1v1 — elke 1v1 durven aangaan'},
  {id:'TA', naam:'Tactisch',  omschrijving:'Inzicht, positiespel, keuzes maken, omschakelen'},
  {id:'FY', naam:'Fysiek',    omschrijving:'Snelheid, actiesnelheid, duelkracht, fitheid'},
  {id:'ME', naam:'Mentaal',   omschrijving:'Zelfvertrouwen, durven kiezen, spelen onder weerstand'},
  {id:'GE', naam:'Gedrag & beleving', omschrijving:'Inzet, teamgevoel, normen & waarden, plezier'},
];
export function skillDomein(id){ return SKILLS.find(s => s.id === id) || null; }
/* alias voor compatibiliteit met eerdere code die 'tipsDomein' aanriep */
export const TIPS = SKILLS;
export function tipsDomein(id){ return skillDomein(id); }

/* ==================== LEERCURVE (Jeugdbeleidsplan §3.3) ====================
   De 14 leerthema's met de leeftijd waarop ze "aan" gaan. Per thema geven we
   de minimale leeftijd (O-getal) en het bijbehorende skill-domein, zodat de app
   leerpunten kan voorstellen die passen bij de leeftijdscategorie van het team.
   Alle thema's blijven altijd kiesbaar; de leeftijdsrelevante worden gemarkeerd. */
export const LEERCURVE = [
  {thema:'Teamsport en plezier',     vanaf:6,  domein:'GE', info:{
    achtergrond:"De rode draad van ASV'33 is \"leren voetballen, met plezier als basis en groei als doel\". Vooral bij de jongste jeugd staan plezier, samen spelen en erbij horen voorop — dat is de voedingsbodem waarop alle andere vaardigheden pas kunnen groeien.",
    tips:[
      'Vier kleine successen hardop — een goede actie, een leuke pass, een gewaagde poging — niet alleen doelpunten.',
      'Kies spelvormen waarin iedereen veel balcontacten krijgt, zodat niemand aan de kant staat.',
      'Positief coachen: benoem wat goed ging vóór je een verbeterpunt geeft.',
      'Laat spelers zelf kleine keuzes maken in het spel — eigenaarschap vergroot plezier.',
    ]}},
  {thema:'Technische vaardigheden',  vanaf:6,  domein:'TE', info:{
    achtergrond:'Techniek is bij ASV\'33 een middel, geen doel op zich — dribbelen, passen, schieten en schijnbewegingen dienen om kansen te creëren en te benutten. Vanaf de mini\'s bouwen spelers een technische basis op met veel herhaling en balcontacten, het liefst in wedstrijdechte situaties.',
    tips:[
      'Herhaal dezelfde techniek in steeds iets andere spelvormen, zodat spelers \'m leren toepassen i.p.v. alleen uitvoeren.',
      'Stimuleer bewust het zwakke been, bijvoorbeeld met een oefening waarin alleen met dat been gescoord mag worden.',
      'Koppel techniekoefeningen aan een wedstrijdsituatie (aannemen onder druk, passen in beweging) i.p.v. statisch drillen.',
      'Geef veel balcontacten per speler — kleinere groepen en meer ballen leveren meer leerrendement op dan grote klassikale oefeningen.',
    ]}},
  {thema:'Uitspelen 1:1',            vanaf:8,  domein:'TE', info:{
    achtergrond:'Het 1-tegen-1 duel is de basis van aanvallend voetbal: een speler die zijn tegenstander kan uitspelen, creëert overtal en ruimte voor het team. Dit sluit aan bij de wens van ASV\'33 om spelers voor te bereiden op spelen onder druk en presteren onder weerstand.',
    tips:[
      'Oefen 1v1-duels met een duidelijk doel (bijv. richting een klein doeltje of lijn) zodat spelers een reden hebben om te kiezen voor een actie.',
      'Beloon lef: een gewaagde 1v1-poging die net mislukt, verdient net zoveel coaching als een geslaagde.',
      'Varieer met overtal- en ondertal-duels (2v1, 1v2) om inzicht in ruimte en timing te vergroten.',
      'Leer spelers meerdere schijnbewegingen — een team dat voorspelbaar is, is makkelijk te verdedigen.',
    ]}},
  {thema:'Scoren',                   vanaf:8,  domein:'TE', info:{
    achtergrond:'Succesbeleving door veel te kunnen scoren is een van de gouden regels van ASV\'33 — de directe beloning voor goed aanvallend voetbal en een belangrijke plezierfactor. Trainen op afwerken hoort dus met regelmaat terug te komen, op elke leeftijd.',
    tips:[
      'Bouw elke training een afrondingsvorm in, ook bij de jongste jeugd — succesbeleving werkt motiverend.',
      'Oefen scoren vanuit realistische spelsituaties (na een voorzet, na een 1v1) i.p.v. los schieten op doel.',
      'Laat spelers ook met het zwakke been en met het hoofd afronden.',
      'Varieer met kleine doeltjes en meerdere doelen om keuzestress en beslissingssnelheid te trainen.',
    ]}},
  {thema:'Positiespel opbouw',       vanaf:8,  domein:'TA', info:{
    achtergrond:"Bij ASV'33 draait opbouw om bewust ruimte creëren en aanspeelbaar blijven vanuit de verdediging — passend bij de visie op aanvallend voetbal waarbij we zoveel mogelijk zelf het initiatief nemen. Dit sluit aan op de 1:4:3:3 basisformatie: bij balbezit schuift een verdediger in naar het middenveld voor een overtal (1:3:4:3). Vanaf O8 leren spelers de bal onder controle houden en simpele passlijnen herkennen; bij de oudere jeugd voegen we de ruitopstelling en het bewust wisselen van de inschuivende verdediger toe.",
    tips:[
      'Rondo (4v2 of 5v2 positiespel) — dwingt spelers continu een passlijn te zoeken en op tijd het hoofd om te draaien.',
      'Overtal-oefening 4v3 op klein veld met 2 doeltjes — leert de vrije man herkennen tijdens opbouw.',
      'Bij O8–O10: eigen bal per speler in de warming-up, gevolgd door 3v3 zonder druk waarbij de coach hardop benoemt wie er "vrijstaat".',
      'Bij O14+: oefen het inschuiven van een verdediger naar het middenveld in een 6v6/8v8-wedstrijdvorm; wissel steeds wie inschuift.',
      'Coach positief op de juíste keuze, niet alleen op het resultaat — een goede opbouwkeuze die net niet lukt, blijft een goede keuze.',
    ]}},
  {thema:'Dieptespel opbouw',        vanaf:8,  domein:'TA', info:{
    achtergrond:"Naast positiespel is dieptespel (de bal snel en direct richting het doel spelen) een belangrijk onderdeel van het aanvallende, initiatiefnemende voetbal dat ASV'33 nastreeft. Spelers leren wanneer ze breed moeten opbouwen en wanneer juist de diepte in.",
    tips:[
      'Oefen het herkennen van het moment om diep te spelen met een simpele regel: "kijk eerst diep, dan breed, dan terug".',
      'Gebruik kleine partijvormen met een duidelijk diepte-doel, bijv. een loper die moet worden aangespeeld.',
      'Beloon een goede diepe pass ook als de aanname niet lukt — het gaat om de keuze.',
      'Bij oudere jeugd: koppel dit aan het herkennen van het omslagmoment tussen opbouwen en versnellen.',
    ]}},
  {thema:'Storen en veroveren',      vanaf:10, domein:'TA', info:{
    achtergrond:"Bij balverlies kiest ASV'33 ervoor zo ver mogelijk naar voren te verdedigen en de tegenstander naar de buitenkant te dwingen. Storen en veroveren draait om het gezamenlijk, gedisciplineerd onder druk zetten van de bal, niet om individueel jagen.",
    tips:[
      'Train het gezamenlijk verschuiven als linie bij balverlies — niet één speler die alleen jaagt.',
      'Oefen het dwingen van de tegenstander naar de zijlijn met kleine partijvormen op een smal veld.',
      'Geef een duidelijk signaal/aanroep voor "nu druk zetten" zodat het hele team tegelijk schakelt.',
      'Beloon agressief maar beheerst verdedigen — storen mag fel, ongeoorloofd ingrijpen niet.',
    ]}},
  {thema:'Verdedigen dieptespel',    vanaf:10, domein:'TA', info:{
    achtergrond:'Een team dat goed positiespel speelt, moet ook diepe ballen van de tegenstander kunnen verdedigen — het voorkomen van doelpunten begint met het bewaken van de ruimte achter de linie.',
    tips:[
      'Oefen het bewaken van de juiste afstand tot de laatste man met kleine partijvormen inclusief een "buitenspellijn".',
      'Train communicatie tussen verdedigers over wie de diepte dekt en wie inschuift.',
      'Werk aan reactiesnelheid bij een lange bal: eerst inschatten, dan pas draaien en sprinten.',
      'Leer spelers vroegtijdig een dreigende diepe pass herkennen aan de lichaamshouding van de tegenstander.',
    ]}},
  {thema:'Verdedigen 1:1',           vanaf:10, domein:'TE', info:{
    achtergrond:'Verdedigen 1-tegen-1 is de spiegel van uitspelen 1-tegen-1: een speler die zijn directe tegenstander kan uitschakelen, voorkomt individueel al veel gevaar. Dit is een technische én mentale vaardigheid — spelen onder druk van een dribbelende tegenstander.',
    tips:[
      'Oefen 1v1-verdedigen met een duidelijk doel: niet per se de bal veroveren, maar de tegenstander wegsturen van het doel.',
      'Train de juiste basishouding (lage rug, kleine pasjes, niet te vroeg inschieten) los van wedstrijddruk.',
      'Beloon een goed getimede tackle én een goed uitgestelde tackle (wachten tot het juiste moment) evenveel.',
      'Varieer met verdedigen in overtal en ondertal om keuzes onder druk te trainen.',
    ]}},
  {thema:'Voorkomen van doelpunten', vanaf:10, domein:'TA', info:{
    achtergrond:'Dit thema bundelt de teamfunctie verdedigen: niet alleen 1v1 en diepte, maar het collectief sluiten van de ruimte rond het eigen doel — de drie manieren van verdedigen uit het beleidsplan (terugtrekken, hoog verdedigen, middenlijn bewaken) komen hier samen.',
    tips:[
      'Kies bewust en met het team welke verdedigingsvorm het beste past (hoog, midden, laag) en oefen die expliciet.',
      'Train compact staan — linies dicht bij elkaar houden zodat er geen ruimte tussen de linies ontstaat.',
      'Oefen het gezamenlijk verdedigen van standaardsituaties (corners, vrije trappen) als apart onderdeel.',
      'Bespreek na een tegendoelpunt in de rust kort en concreet wat er in de opbouw ernaartoe misging.',
    ]}},
  {thema:'Aanvallen met voorzet',    vanaf:11, domein:'TA', info:{
    achtergrond:"Voorzetten vanaf de zijkant zijn een directe uitwerking van de brede opbouw en de vleugelspelers in de 1:4:3:3-formatie van ASV'33 — de bal van buiten naar binnen brengen richting de (diepe) centrumspits.",
    tips:[
      'Oefen het moment van voorzetten geven: te vroeg is voorspelbaar, te laat mist het momentum.',
      'Train specifiek de timing van inlopende spelers op de voorzet — een goede voorzet zonder loper levert niets op.',
      'Varieer met lage en hoge voorzetten, en met voorzetten vanaf de achterlijn.',
      'Laat vleugelspelers ook oefenen met de 1v1 vóór het moment van voorzetten (koppeling met "Uitspelen 1:1").',
    ]}},
  {thema:'Verdedigen van voorzet',   vanaf:11, domein:'TA', info:{
    achtergrond:'De spiegel van "Aanvallen met voorzet": een team dat goed aanvalt met voorzetten, moet dat ook zelf kunnen verdedigen — positiekeuze en communicatie in en rond het strafschopgebied zijn hierbij cruciaal.',
    tips:[
      'Oefen mandekking versus zonedekking bij een voorzet, en kies bewust wat het team hanteert.',
      'Train het tijdig inschatten en onderscheppen van de voorzet vóórdat de bal wordt aangenomen.',
      'Werk aan communicatie tussen keeper en verdedigers over wie de bal claimt.',
      'Herhaal veel met realistische voorzetten (niet alleen ingooien) zodat de situatie herkenbaar blijft.',
    ]}},
  {thema:'Omschakelen balwinst',     vanaf:14, domein:'TA', info:{
    achtergrond:"Bij balwinst wil ASV'33 direct vooruit denken en het initiatief pakken — dit thema hoort bij de oudere jeugd omdat snel schakelen tussen verdedigen en aanvallen veel spelinzicht en besluitvaardigheid vraagt.",
    tips:[
      'Oefen met een directe eerste actie na balverovering: passen of dribbelen richting het doel, niet terugspelen.',
      'Train het herkennen van het omschakelmoment met partijvormen waar balbezit snel wisselt (bijv. 1-goal-games).',
      'Beloon snelheid van denken boven snelheid van lopen — de eerste 2 seconden na balwinst zijn het belangrijkst.',
      'Bespreek na de wedstrijd concrete momenten van goede en gemiste omschakelmomenten.',
    ]}},
  {thema:'Omschakelen balverlies',   vanaf:14, domein:'TA', info:{
    achtergrond:'Bij balverlies kiest het team bewust: direct terugzakken of meteen aftroeven (gegenpressing). Dit thema vraagt discipline van het hele team tegelijk, en is direct gekoppeld aan de teamevaluatie-categorie "Omschakeling bij balverlies/-winst".',
    tips:[
      'Spreek als team een vaste eerste reactie af bij balverlies, bijv. altijd de dichtstbijzijnde speler zet meteen druk.',
      'Oefen dit met kleine partijvormen waar de trainer bewust ballen "weggeeft" om het omschakelmoment te forceren.',
      'Train het razendsnel herkennen van "wij hebben de bal niet meer" — de eerste seconde bepaalt vaak het verschil.',
      'Evalueer na de wedstrijd samen met het team of de afspraak (terugzakken/aftroeven) goed is uitgevoerd.',
    ]}},
];

/* Vind een leercurve-thema op naam, bijv. voor het openen van het infoscherm
   vanuit een string (adviesCat.leercurve, een gekozen leerpunt-tekst, etc). */
export function leercurveThema(naam){ return LEERCURVE.find(t => t.thema === naam) || null; }

/* haal het leeftijdsgetal uit een categorie: 'JO11' → 11, 'MO13' → 13, 'Senioren' → 99 */
export function leeftijdVanCategorie(categorie){
  const m = String(categorie||'').match(/O(\d+)/);
  if (m) return Number(m[1]);
  return 99; // Senioren / Vrouwen → alles relevant
}
/* is een leercurve-thema relevant voor deze categorie? */
export function leercurveRelevant(thema, categorie){
  const lft = leeftijdVanCategorie(categorie);
  return lft >= thema.vanaf;
}

/* Gouden regels (§3.1) — als inspiratie/placeholder bij het maken van leerpunten. */
export const GOUDEN_REGELS = [
  'Beide benen leren gebruiken',
  'Veel balcontacten en herhalingen',
  'Succesbeleving — veel kunnen scoren',
  'Positief coachen en samenspel',
  'Regels naleven',
];

/* ==================== ASV-KOMPAS (§3.1 gouden regels + §3.4 richtlijnen) ====================
   Korte, niet-verplichte tips die roteren op weeknummer, zodat alle coaches van
   een team dezelfde tip zien in dezelfde week (uniformiteit, geen leesplicht). */
export const KOMPAS_TIPS = [
  {bron:'§3.1', tekst:'Plezier, inzet en samenspel staan voorop — elke training.', info:{
    achtergrond:'Dit is de eerste van de gouden regels uit het jeugdbeleidsplan — plezier is niet een leuke bijkomstigheid maar de voorwaarde waarop verdere ontwikkeling rust.',
    tips:['Open elke training met een vorm die energie en plezier geeft.','Benoem inzet net zo vaak als resultaat.','Laat spelers merken dat samenspel wordt gewaardeerd, niet alleen individuele acties.']}},
  {bron:'§3.1', tekst:'Bouw bewust tijd in voor techniektraining, ook bij de oudere jeugd.', info:{
    achtergrond:'Techniektraining wordt vaak gezien als iets voor de jongsten, maar balvaardigheid blijft op elke leeftijd groeien en verdient trainingstijd.',
    tips:['Plan een vast blok techniek in elke training, ook bij O16–O19.','Koppel techniekoefeningen aan de specifieke posities van je oudere spelers.','Herhaal basistechniek onder tijdsdruk om het niveau te verhogen.']}},
  {bron:'§3.1', tekst:'Veel herhalingen en balcontacten leveren het meeste leerrendement op.', info:{
    achtergrond:'Leren voetballen gebeurt vooral door veel te doen, niet door lang uit te leggen — meer balcontacten per speler per minuut betekent meer leren per training.',
    tips:['Kies kleinere groepen per bal in plaats van één grote groep.','Beperk wachtrijen bij oefeningen, bijv. met meerdere stations tegelijk.','Geef korte, duidelijke uitleg en laat spelers vooral doen.']}},
  {bron:'§3.1', tekst:'Stimuleer spelers om beide benen te gebruiken.', info:{
    achtergrond:"Een tweebenige speler is lastiger te verdedigen en veelzijdiger inzetbaar — dit is een expliciete gouden regel van ASV'33.",
    tips:['Bouw oefeningen in die alleen met het zwakke been mogen.','Beloon gebruik van het zwakke been extra tijdens de training.','Laat spelers bewust wisselen van been bij passen en schieten.']}},
  {bron:'§3.1', tekst:'Geef elke speler tijdens oefenvormen een eigen bal.', info:{
    achtergrond:'Wachtrijen en gedeelde ballen kosten balcontacten — en balcontacten zijn de belangrijkste leerbron in jeugdvoetbal.',
    tips:['Zorg voor genoeg ballen zodat iedereen er één heeft bij techniekoefeningen.','Kies oefenvormen die dit toelaten, bijv. individuele dribbelparcours.','Reserveer partijvormen met gedeelde bal voor het tactische deel van de training.']}},
  {bron:'§3.1', tekst:'Succesbeleving: laat spelers vooral veel kunnen scoren.', info:{
    achtergrond:'Scoren is dé beloning in voetbal — vooral bij jonge spelers bouwt succesbeleving zelfvertrouwen en plezier op, wat weer bijdraagt aan verdere ontwikkeling.',
    tips:['Gebruik kleine doeltjes en meerdere doelen zodat scoren vaker voorkomt.','Sluit trainingen af met een leuke afrondingsvorm.','Vier een doelpunt net zo enthousiast in de training als in de wedstrijd.']}},
  {bron:'§3.1', tekst:'Kies voor kleine partijvormen — meer balcontacten, meer betrokkenheid, meer herhaling.', info:{
    achtergrond:'4v4, 6v6 en 8v8 leveren aantoonbaar meer balcontacten, duels en beslismomenten per speler op dan 11v11 — vooral relevant voor de jongere leeftijdscategorieën.',
    tips:['Verklein het veld en het aantal spelers waar mogelijk, ook binnen een grotere training.','Gebruik kleine partijvormen om een specifiek thema (bijv. positiespel) geïsoleerd te oefenen.','Wissel groepen vaker door voor meer variatie in tegenstanders.']}},
  {bron:'§3.1', tekst:'Regels naleven hoort bij het leren voetballen — ook op de training.', info:{
    achtergrond:'Normen en waarden zijn een expliciet hoofdstuk in het beleidsplan — respect voor regels, medespelers en de trainer is onderdeel van de opleiding, niet iets ernaast.',
    tips:['Wees consistent in het handhaven van kleine afspraken (op tijd, luisteren, respect).','Leg uit waarom een regel er is, niet alleen dát die er is.','Corrigeer rustig en direct, zonder de sfeer te verpesten.']}},
  {bron:'§3.1', tekst:'Positief coachen werkt beter dan corrigeren op fouten.', info:{
    achtergrond:'Positieve coaching bouwt zelfvertrouwen op en houdt spelers gemotiveerd om risico\'s te nemen — een speler die bang is voor fouten durft minder te proberen.',
    tips:['Benoem eerst wat goed ging voordat je een verbeterpunt geeft.','Formuleer feedback als een concrete tip ("probeer volgende keer…") in plaats van als kritiek.','Corrigeer gedrag, nooit de persoon.']}},
  {bron:'§3.4', tekst:'Oefen zoveel mogelijk in wedstrijdvorm — met zo min mogelijk onderbrekingen.', info:{
    achtergrond:'Voetballen leer je door te voetballen, in situaties die op de wedstrijd lijken — lange uitleg en veel onderbrekingen kosten kostbare oefentijd en balcontacten.',
    tips:['Leg oefeningen kort en visueel uit, en laat de rest al doende duidelijk worden.','Grijp alleen in als het echt nodig is, niet bij elke kleine fout.','Bouw wedstrijdechte druk (tijd, tegenstander) in oefenvormen in.']}},
  {bron:'§3.4', tekst:'Techniek is een middel, geen doel op zich. Koppel oefeningen aan een spelsituatie.', info:{
    achtergrond:'Statisch oefenen van techniek (bijv. los passen in tweetallen) leert een speler een handeling, maar niet wanneer en waarom die toe te passen in een wedstrijd.',
    tips:['Voeg altijd een doel toe aan een techniekoefening: een tegenstander, een richting, een tijdslimiet.','Vraag spelers na de oefening kort te benoemen wanneer ze dit in een wedstrijd zouden gebruiken.','Bouw oefeningen op van geïsoleerd naar wedstrijdecht binnen dezelfde training.']}},
  {bron:'§3.4', tekst:'Vereenvoudig het spel (4v4, 6v6, 8v8) om het sneller leerbaar te maken.', info:{
    achtergrond:'Voor jonge spelers is 11v11 te complex om het spel te doorzien — kleinere spelvormen maken de teamfuncties aanvallen, verdedigen en omschakelen behapbaar en herkenbaar.',
    tips:['Pas het aantal spelers en de veldgrootte aan op de leeftijdscategorie.','Voeg pas complexiteit toe (meer spelers, groter veld) als de basis beheerst wordt.','Gebruik kleine spelvormen ook bij oudere jeugd om een specifiek thema te isoleren.']}},
  {bron:'§3.4', tekst:'Conditie train je door te voetballen — niet los van de bal.', info:{
    achtergrond:'Het beleidsplan is expliciet: looptraining zonder bal levert geen directe bijdrage aan beter aanvallen, verdedigen of omschakelen — conditie ontstaat als bijproduct van intensieve voetbalvormen.',
    tips:['Verhoog de intensiteit van partijvormen (kleiner veld, minder rust) in plaats van aparte looptraining.','Bouw herstelmomenten in via de oefenvorm zelf, niet als aparte pauze.','Gebruik wedstrijdvormen met veel korte sprints in plaats van duurlopen.']}},
  {bron:'§3.4', tekst:'Geef ook aanwijzingen over spelinzicht en onderlinge communicatie, niet alleen balvaardigheid.', info:{
    achtergrond:'Goed voetballen is meer dan techniek: waarnemen, keuzes maken en communiceren met medespelers zijn net zo belangrijk, en verdienen daarom evenveel coaching-aandacht.',
    tips:['Stel tijdens oefeningen vragen ("wie stond er vrij?", "wat zag je?") in plaats van alleen technische correcties te geven.','Benoem hardop goede communicatie tussen spelers als voorbeeld.','Oefen bewust situaties waarin spelers elkaar moeten aanspreken, bijv. wie verdedigt de diepte.']}},
];
/* ISO-weeknummer van vandaag, gebruikt om de kompas-tip per week te bepalen. */
export function isoWeek(d = new Date()){
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dagNr = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dagNr + 3);
  const eersteDonderdag = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round(((dt - eersteDonderdag) / 86400000 - 3 + ((eersteDonderdag.getUTCDay() + 6) % 7)) / 7);
  return weekNr;
}
export function kompasIndexVoorWeek(week = isoWeek()){ return ((week % KOMPAS_TIPS.length) + KOMPAS_TIPS.length) % KOMPAS_TIPS.length; }

/* Formatie-uitgangspunt van de club (§3.2): 1:4:3:3, omschakelend naar 1:3:4:3 bij balbezit. */
export const CLUB_FORMATIE_11 = '4-3-3';

/* ==================== WEDSTRIJDDOEL-SUGGESTIES (§3.1 t/m §3.4) ====================
   Korte, concrete voorbeelden per leeftijdsband, aansluitend op de leercurve (§3.3),
   de gouden regels (§3.1) en de gewenste speelwijze (§3.2). Puur als inspiratie bij
   het invullen van het vrije 🎯 Wedstrijddoel-veld — nooit verplicht, altijd overschrijfbaar. */
const DOEL_SUGGESTIES_BANDEN = [
  {tot:9,  teksten:[
    'Iedereen probeert minstens 1x een 1-tegen-1',
    'Na balverovering meteen naar het doel dribbelen',
    'Een actie proberen met het zwakke been',
    'Iedereen minstens 1x een doelpoging',
  ]},
  {tot:12, teksten:[
    'Bij balbezit rustig opbouwen van achteruit',
    'Direct druk zetten binnen 5 seconden na balverlies',
    'Voorkomen dat de tegenstander je 1-tegen-1 passeert',
    'Positiespel: steeds een passlijn aanbieden',
  ]},
  {tot:15, teksten:[
    'Voorzetten geven vanaf de zijkant',
    'Snel omschakelen bij balwinst — meteen vooruit denken',
    'Tegenstander naar de zijlijn dwingen bij verdedigen',
    'Bewust omschakelen bij balverlies: direct terugzakken of aftroeven',
  ]},
  {tot:99, teksten:[
    'Bij balbezit een verdediger laten inschuiven naar het middenveld',
    'Compact blijven staan — linies dicht bij elkaar',
    'Constant coachen van je medespelers',
    'Bewust balverlies voorkomen in de opbouw',
  ]},
];
/* geeft 3 roterende suggesties terug, passend bij de categorie van het team. */
export function doelSuggesties(categorie, n = 3){
  const lft = leeftijdVanCategorie(categorie);
  const band = DOEL_SUGGESTIES_BANDEN.find(b => lft <= b.tot) || DOEL_SUGGESTIES_BANDEN[DOEL_SUGGESTIES_BANDEN.length-1];
  const start = isoWeek() % band.teksten.length;
  const uit = [];
  for (let i = 0; i < Math.min(n, band.teksten.length); i++) uit.push(band.teksten[(start+i) % band.teksten.length]);
  return uit;
}

/* niveau 1..5 → kleur + label. Index 0 blijft leeg (scores beginnen bij 1). */
export const NIVEAUS = [
  null,
  {n:1, kleur:'#E5484D', label:'Aandacht',  kort:'AAND'},
  {n:2, kleur:'#F2913C', label:'Op weg',    kort:'OPW'},
  {n:3, kleur:'#F2C94C', label:'Prima',     kort:'PRIMA'},
  {n:4, kleur:'#7DCB6A', label:'Sterk',     kort:'STERK'},
  {n:5, kleur:'#2EA043', label:'Uitblinker',kort:'UITBL'},
];
export function niveau(n){ return NIVEAUS[n] || null; }
export function niveauKleur(n){ return NIVEAUS[n]?.kleur || '#EFEFED'; }

/* Snelle 'opvallend'-tags (optioneel aan te tikken na een wedstrijd/training). */
export const SNEL_TAGS = [
  {id:'inzet',    emoji:'💪', label:'Goede inzet'},
  {id:'duel',     emoji:'🎯', label:'Sterk in 1v1'},
  {id:'team',     emoji:'🤝', label:'Teamspeler'},
  {id:'snel',     emoji:'⚡', label:'Snel'},
  {id:'inzicht',  emoji:'🧠', label:'Goed inzicht'},
  {id:'coach',    emoji:'📣', label:'Coachbaar'},
  {id:'plezier',  emoji:'😄', label:'Veel plezier'},
  {id:'leider',   emoji:'👑', label:'Neemt leiding'},
];
export function snelTag(id){ return SNEL_TAGS.find(t => t.id === id) || null; }

/* ==================== TEAMEVALUATIE (na de wedstrijd) ====================
   8 categorieën voor de teambeoordeling na een wedstrijd. Waar een categorie
   overeenkomt met een leercurve-thema (§3.3), leggen we dat verband vast —
   dat is de schakel voor het automatische trainingsadvies. */
export const TEAM_CATEGORIEEN = [
  {id:'inzet',        naam:'Inzet & concentratie'},
  {id:'samenwerking', naam:'Samenwerking & communicatie'},
  {id:'taken',         naam:'Taakuitvoering per linie'},
  {id:'opbouw',        naam:'Opbouw van achteruit',              leercurve:'Positiespel opbouw'},
  {id:'omschakeling',  naam:'Omschakeling bij balverlies/-winst', leercurve:'Omschakelen balverlies'},
  {id:'druk',          naam:'Druk zetten & veroveren',            leercurve:'Storen en veroveren'},
  {id:'plezier',       naam:'Spelplezier'},
  {id:'coachbaar',     naam:'Coachbaarheid'},
];
export function teamCategorie(id){ return TEAM_CATEGORIEEN.find(c => c.id === id) || null; }

/* Snelle 'opvallend'-tags voor de teamevaluatie (los van de speler-tags hierboven). */
export const TEAM_TAGS = [
  {id:'samenwerking', emoji:'🤝', label:'Goede samenwerking'},
  {id:'geluisterd',   emoji:'📣', label:'Goed geluisterd'},
  {id:'plezier',      emoji:'😄', label:'Veel plezier'},
  {id:'afspraken',    emoji:'⚠️', label:'Afspraken niet nagekomen'},
  {id:'sterke2e',     emoji:'🔥', label:'Sterke 2e helft'},
  {id:'terugval',     emoji:'📉', label:'Terugval na rust'},
];
