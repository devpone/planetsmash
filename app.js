function getBerlinParts(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Berlin',
    weekday:'short',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit',
    hourCycle:'h23'
  }).formatToParts(now).map(p => [p.type,p.value]));
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return {
    day: days.indexOf(parts.weekday),
    year: Number(parts.year),
    month: Number(parts.month),
    date: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

const openingHours=[14,null,16,16,16,16,16];

const specialClosures={
  '2026-10-03':{
    reason:'Tag der Deutschen Einheit',
    announceFrom:'2026-09-29',
    announcement:'Samstag, 3. Oktober geschlossen – Tag der Deutschen Einheit.'
  },
  '2026-12-24':{
    reason:'Heiligabend',
    announceFrom:'2026-12-01',
    announcement:'24.–26. Dezember geschlossen – Heiligabend & Weihnachten.'
  },
  '2026-12-25':{
    reason:'1. Weihnachtstag',
    announceFrom:'2026-12-01',
    announcement:'24.–26. Dezember geschlossen – Heiligabend & Weihnachten.'
  },
  '2026-12-26':{
    reason:'2. Weihnachtstag',
    announceFrom:'2026-12-01',
    announcement:'24.–26. Dezember geschlossen – Heiligabend & Weihnachten.'
  }
};

const specialOpeningNotices={
  '2026-11-01':{
    announceFrom:'2026-09-29',
    label:'Allerheiligen ist',
    emphasis:'GEÖFFNET'
  }
};

function dateKeyForOffset(parts,offset=0){
  const d=new Date(Date.UTC(parts.year,parts.month-1,parts.date+offset));
  const y=d.getUTCFullYear();
  const m=String(d.getUTCMonth()+1).padStart(2,'0');
  const day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function getSpecialClosure(parts,offset=0){
  return specialClosures[dateKeyForOffset(parts,offset)] || null;
}

function getScheduledOpening(parts,offset=0){
  const weekday=(parts.day+offset)%7;
  if(getSpecialClosure(parts,offset)) return null;
  return openingHours[weekday];
}

function getOpeningStatus(now = new Date()) {
  const names=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const parts=getBerlinParts(now);
  const {day,hour,minute}=parts;
  const time=hour+minute/60;
  const closure=getSpecialClosure(parts);
  const todayOpen=getScheduledOpening(parts);

  if(!closure && todayOpen!==null && time>=todayOpen && time<22) return 'Jetzt geöffnet · bis 22 Uhr';
  if(!closure && todayOpen!==null && time<todayOpen) return `Heute ab ${todayOpen} Uhr geöffnet`;

  let offset=1;
  let nextOpen=null;
  while(offset<=7 && nextOpen===null){
    nextOpen=getScheduledOpening(parts,offset);
    if(nextOpen===null) offset++;
  }
  const next=(day+offset)%7;

  if(closure) return `Heute geschlossen · ${closure.reason} · ${offset===1?'morgen':names[next]} ab ${nextOpen} Uhr`;
  return `${day===1?'Heute Ruhetag':'Jetzt geschlossen'} · ${offset===1?'morgen':names[next]} ab ${nextOpen} Uhr`;
}

function getCountdown(now = new Date()) {
  const parts=getBerlinParts(now);
  const {day,hour,minute,second}=parts;
  const current=day*86400+hour*3600+minute*60+second;
  const open=getScheduledOpening(parts);
  let target;
  let label;

  if(open!==null && current>=day*86400+open*3600 && current<day*86400+22*3600){
    target=day*86400+22*3600;
    label='Schließt in';
  } else {
    label='Öffnet in';
    for(let offset=0;offset<=7;offset++){
      const candidateDay=day+offset;
      const candidateOpen=getScheduledOpening(parts,offset);
      if(candidateOpen===null) continue;
      const candidate=candidateDay*86400+candidateOpen*3600;
      if(candidate>current){
        target=candidate;
        break;
      }
    }
  }

  const remaining=Math.max(0,target-current);
  const days=Math.floor(remaining/86400);
  const hours=Math.floor((remaining%86400)/3600);
  const minutes=Math.floor((remaining%3600)/60);
  const seconds=Math.floor(remaining%60);
  const clock=[hours,minutes,seconds].map(v=>String(v).padStart(2,'0')).join(':');
  return `${label} ${days?days+'T ':''}${clock}`;
}

function getNextOpeningCountdown(now = new Date()) {
  const parts=getBerlinParts(now);
  const {day,hour,minute,second}=parts;
  const current=day*86400+hour*3600+minute*60+second;
  const open=getScheduledOpening(parts);
  const isOpen=open!==null && current>=day*86400+open*3600 && current<day*86400+22*3600;

  if(isOpen) return {open:true,hours:0,minutes:0,seconds:0};

  let target=null;
  for(let offset=0;offset<=7;offset++){
    const candidateDay=day+offset;
    const candidateOpen=getScheduledOpening(parts,offset);
    if(candidateOpen===null) continue;
    const candidate=candidateDay*86400+candidateOpen*3600;
    if(candidate>current){
      target=candidate;
      break;
    }
  }

  const remaining=Math.max(0,(target ?? current)-current);
  return {
    open:false,
    hours:Math.floor(remaining/3600),
    minutes:Math.floor((remaining%3600)/60),
    seconds:Math.floor(remaining%60)
  };
}

function updateHeroOpeningCountdown(now = new Date()) {
  const countdown=getNextOpeningCountdown(now);
  const box=document.querySelector('[data-hero-countdown]');
  if(!box) return;

  const container=box.closest('.hero-opening');
  if(container) container.hidden=countdown.open;
  box.hidden=countdown.open;
  if(countdown.open) return;

  const values={
    hours:String(countdown.hours).padStart(2,'0'),
    minutes:String(countdown.minutes).padStart(2,'0'),
    seconds:String(countdown.seconds).padStart(2,'0')
  };

  Object.entries(values).forEach(([key,value])=>{
    const el=box.querySelector(`[data-opening-${key}]`);
    if(el) el.textContent=value;
  });
}

function updateSpecialClosureNotice(now = new Date()){
  const parts=getBerlinParts(now);
  const todayKey=dateKeyForOffset(parts);
  const visitStatus=document.querySelector('.visit-copy [data-status]');
  if(!visitStatus) return;

  let notice=document.querySelector('[data-special-closure-notice]');
  const entry=Object.entries(specialClosures).find(([dateKey,closure])=>
    todayKey>=closure.announceFrom && todayKey<=dateKey
  );

  if(!entry){
    notice?.remove();
    return;
  }

  const [dateKey,closure]=entry;
  if(!notice){
    notice=document.createElement('p');
    notice.className='visit-status';
    notice.setAttribute('data-special-closure-notice','');
    visitStatus.insertAdjacentElement('afterend',notice);
  }

  notice.textContent=todayKey===dateKey
    ? `Heute geschlossen – ${closure.reason}.`
    : closure.announcement;
}

function updateSpecialOpeningNotice(now = new Date()){
  const parts=getBerlinParts(now);
  const todayKey=dateKeyForOffset(parts);
  const visitStatus=document.querySelector('.visit-copy [data-status]');
  if(!visitStatus) return;

  let notice=document.querySelector('[data-special-opening-notice]');
  const entry=Object.entries(specialOpeningNotices).find(([dateKey,opening])=>
    todayKey>=opening.announceFrom && todayKey<=dateKey
  );

  if(!entry){
    notice?.remove();
    return;
  }

  const [,opening]=entry;
  if(!notice){
    notice=document.createElement('p');
    notice.className='visit-status';
    notice.setAttribute('data-special-opening-notice','');
    visitStatus.insertAdjacentElement('afterend',notice);
  }

  notice.replaceChildren();
  notice.append(document.createTextNode(opening.label+' '));
  const strong=document.createElement('strong');
  strong.textContent=opening.emphasis;
  strong.style.fontWeight='900';
  notice.append(strong,document.createTextNode('.'));
}

function updateOpeningStatus(){
  const status=getOpeningStatus();
  document.querySelectorAll('[data-status]').forEach(el=>el.textContent=status);
  document.querySelectorAll('[data-countdown]').forEach(el=>el.textContent=getCountdown());
  updateHeroOpeningCountdown();
  updateSpecialClosureNotice();
  updateSpecialOpeningNotice();
  document.querySelectorAll('[data-call]').forEach(slot=>{
    const open=status.startsWith('Jetzt geöffnet');
    const tag=open?'A':'SPAN';
    if(slot.firstElementChild?.tagName!==tag){
      const action=document.createElement(tag);
      action.className=open?'button call-button':'call-closed';
      if(open) action.href='tel:+4916092870140';
      slot.replaceChildren(action);
    }
    slot.firstElementChild.textContent=open?'Jetzt anrufen ↗':status;
  });
}
updateOpeningStatus();
setInterval(updateOpeningStatus,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateOpeningStatus();});
window.addEventListener('pageshow',updateOpeningStatus);


/* --- Planet Control Station --- */
function updateControlStation(){
  const status=getOpeningStatus();
  const countdown=getCountdown();
  document.querySelectorAll('[data-control-countdown]').forEach(el=>el.textContent=countdown);

  const mission=document.querySelector('[data-mission-status]');
  if(mission){
    if(status.startsWith('Jetzt geöffnet')) mission.textContent='BASE OPEN // LANDUNG FREI';
    else if(status.startsWith('Heute Ruhetag')) mission.textContent='BASE OFFLINE // CREW RECHARGING';
    else mission.textContent='BASE CLOSED // NEXT LAUNCH PENDING';
  }
}
updateControlStation();
setInterval(updateControlStation,1000);

// Echtes globales Besucherregister über den eigenen Cloudflare Worker + D1.
// Pro Browser wird genau einmal eine Landung gezählt; danach wird nur noch der Gesamtstand gelesen.
async function updateVisitorCount(){
  const countEl=document.querySelector('[data-visitor-count]');
  const copyEl=document.querySelector('[data-earthling-copy]');
  if(!countEl) return;

  const api='https://planet-funksprueche.devpone.workers.dev';
  const landedKey='psb-visitor-landed-v2';
  const numberKey='psb-earthling-number-v2';

  try{
    const alreadyLanded=localStorage.getItem(landedKey)==='1';
    const endpoint=alreadyLanded ? '/visitors' : '/visitors/land';
    const response=await fetch(api+endpoint,{
      method:alreadyLanded ? 'GET' : 'POST',
      cache:'no-store'
    });
    if(!response.ok) throw new Error('Visitor counter '+response.status);

    const data=await response.json();
    const value=Number(data.value);
    if(!Number.isFinite(value)||value<0) throw new Error('Ungültiger Zählerwert');

    if(!alreadyLanded){
      localStorage.setItem(landedKey,'1');
      localStorage.setItem(numberKey,String(value));
    }

    countEl.textContent=new Intl.NumberFormat('de-DE').format(value);

    const landingNumber=Number(localStorage.getItem(numberKey));
    if(copyEl){
      if(Number.isFinite(landingNumber)&&landingNumber>0){
        copyEl.textContent=(window.PSB_I18N?.t('Schon {n} Erdlinge auf diesem Planeten gelandet. Du bist Erdling #{id}.') || 'Schon {n} Erdlinge auf diesem Planeten gelandet. Du bist Erdling #{id}.')
          .replace('{n}',new Intl.NumberFormat('de-DE').format(value))
          .replace('{id}',new Intl.NumberFormat('de-DE').format(landingNumber));
      }else{
        copyEl.textContent='Echter Besucherstand aus der Planet-Datenbank.';
      }
    }
  }catch(error){
    countEl.textContent='SIGNAL GESTÖRT';
    if(copyEl) copyEl.textContent='Der echte Besucherzähler ist gerade nicht erreichbar. Es wird keine Ersatz- oder Fantasiezahl angezeigt.';
    console.warn('Besucherzähler:',error);
  }
}
updateVisitorCount();

(function initSmashMeter(){
  const fill=document.querySelector('[data-smash-fill]');
  const levelEl=document.querySelector('[data-smash-level]');
  const comment=document.querySelector('[data-smash-comment]');
  if(!fill||!levelEl) return;

  let level=Number(sessionStorage.getItem('psb-smash-level'));
  if(!level){
    level=88+Math.floor(Math.random()*12);
    sessionStorage.setItem('psb-smash-level',String(level));
  }

  requestAnimationFrame(()=>{fill.style.width=level+'%';});
  levelEl.textContent=level+' %';

  if(comment){
    comment.textContent=level>=99?'KRITISCH: Bacon hat die Erdanziehung verlassen.'
      :level>=97?'Extrem starke Burger-Gravitation erkannt.'
      :level>=94?'Smash-Feld stabil. Pommes werden angezogen.'
      :level>=91?'Hohe Anziehungskraft. Widerstand zwecklos.'
      :'Gravitation auf Smash-Niveau.';
  }
})();

// UFO scanner starts only after the visitor deliberately activates the control station.
const station=document.querySelector('[data-control-station]');
const scanner=document.querySelector('[data-ufo-scan]');
const scanText=document.querySelector('[data-scan-text]');
const activateButton=document.querySelector('[data-control-activate]');
const activationPanel=document.querySelector('[data-control-activation]');
const controlContent=document.querySelectorAll('[data-control-content]');
if(station&&scanner&&scanText&&activateButton){
  const scanMessages=[
    'UNBEKANNTES OBJEKT ERFASST',
    'LEBENSFORM ERKANNT',
    'HUNGERLEVEL: KRITISCH',
    'LANDERLAUBNIS ERTEILT'
  ];

  const runScan=()=>{
    if(station.dataset.scanned==='1') return;
    station.dataset.scanned='1';
    activateButton.disabled=true;
    activationPanel?.classList.add('activated');

    // Turn the scan into a viewport overlay. No page jump is needed, so Safari
    // cannot land at the wrong document position and the show stays large everywhere.
    station.classList.add('scan-active');
    document.body.classList.add('control-scan-open');
    scanner.classList.add('scanning');
    scanMessages.forEach((message,index)=>{
      setTimeout(()=>{scanText.textContent=message;},index*700);
    });
    setTimeout(()=>{
      scanner.classList.remove('scanning');
      station.classList.remove('scan-active');
      document.body.classList.remove('control-scan-open');
      activationPanel?.setAttribute('hidden','');
      controlContent.forEach(el=>el.removeAttribute('hidden'));
      requestAnimationFrame(()=>requestAnimationFrame(()=>station.scrollIntoView({behavior:'smooth',block:'start'})));
    },3300);
  };

  activateButton.addEventListener('click',runScan);
}

const secretMessages=[
"Die Wahrheit ist da draußen. Der Bacon ist hier.",
"Keine intelligenten Lebensformen gefunden. Aber gute Burger.",
"Mission aktualisiert: Pommes bestellen.",
"Roswell meldet: Käsesauce kritisch niedrig.",
"Area 51 bestätigt: Extra Bacon ist kein Zufall.",
"Unbekanntes Flugobjekt gesichtet. Es riecht verdächtig nach BBQ.",
"Die Aliens kommen in Frieden. Und wegen der Pommes.",
"Geheime Satellitendaten zeigen: Hunger nimmt exponentiell zu.",
"Interstellare Analyse abgeschlossen: Noch ein Burger wäre wissenschaftlich vertretbar.",
"Die NASA bestreitet alles. Wir bestreiten nur trockene Burger.",
"Kosmische Strahlung erkannt. Ursache vermutlich geschmolzener Käse.",
"Der Mond ist nicht aus Käse. Unsere Sauce schon eher.",
"Bordcomputer sagt: Kalorien existieren im All nicht.",
"Wissenschaftlicher Konsens: Bacon verbessert die Umlaufbahn.",
"Gravitationsanomalie lokalisiert: direkt über den Smashpommes.",
"Zeitreise erfolgreich. Dein Burger ist trotzdem frisch.",
"Das Mutterschiff hat geparkt. Parkscheibe liegt aus.",
"Alien an Bodenstation: „Einmal alles. Ohne Zwiebeln.“",
"Signalstärke 100 %. Selbstkontrolle 12 %.",
"Unbekannte Energiequelle lokalisiert: Fritteuse.",
"Abhörprotokoll: „Sag niemandem, dass ich zwei Burger hatte.“",
"Warnung: Dieses Terminal ist möglicherweise hungrig.",
"Die letzte Pommes wurde unter Schutz gestellt.",
"Funkstille beendet. Jemand hat Bacon erwähnt.",
"Forschungsbericht: Pommes schmecken im Vakuum nicht besser. Hier schon.",
"Die Aliens verstehen unsere Sprache nicht. „Extra Käse“ verstehen sie.",
"Mission „nur kurz gucken“ ist offiziell gescheitert.",
"Der Scanner erkennt: 87 % Mensch, 13 % Hunger.",
"Wir haben versucht, die Sauce zu analysieren. Labor evakuiert.",
"Der Bordcomputer hat „Salat“ vorgeschlagen. Er wurde neu gestartet.",
"Roswell bestätigt: Dieser Funkspruch wurde vor 51 Sekunden gesendet.",
"Warnung: Zu viel Scrollen kann zu spontanem Vorbeikommen führen.",
"Wir empfangen ein schwaches Signal aus der Küche: „Bestellung fertig!“",
'Du hast Clearance Level 51 erreicht. Offiziell ist das nie passiert.',
'Geheime Akte geöffnet: Der Bacon-Vorrat ist größer als öffentlich bekannt.',
'Das Alien im Logo grüßt dich. Es behauptet, du wärst bereit.',
'Projekt NICE TO MEAT YOU: Testperson reagiert erwartungsgemäß mit Hunger.',
'Sicherheitsprotokoll umgangen. Belohnung: imaginärer Extra-Bacon.',
'Du kennst jetzt zu viel. Bestell einen Burger und wir vergessen die Sache.',
'AREA 51 INTERN: Die Käsesauce wurde nicht auf diesem Planeten entwickelt.',
'Zugriff gewährt. Die Wahrheit: Niemand braucht wirklich nur eine Sauce.',
'Geheimarchiv 51: Das erste Patty wurde um 03:17 Uhr gesmasht. Angeblich.',
'Du hast den versteckten Kanal gefunden. Roswell hört mit.',
'TOP SECRET: Der Planet Mac ist weniger ein Burger als ein diplomatischer Zwischenfall.',
'CLEARANCE ACCEPTED: Deine Akte wurde unter „hungrig, aber vertrauenswürdig“ abgelegt.',
'Die Regierung dementiert dieses Easter Egg.',
'Fünf Klicks. Respekt. Die meisten Erdlinge geben nach drei auf.',
'Willkommen im inneren Kreis. Bitte keine Fotos von der Bacon-Technologie.',
'Geheimfrequenz 51,1 MHz: „Mehr Käse.“ Ende der Übertragung.',
'Du hast soeben ein digitales UFO aufgeschreckt.',
'Akte geöffnet: Operation CRUNCHY POTATO bleibt streng vertraulich.',
'Das hier ist kein Easter Egg. Du hast nichts gesehen.',
'Interne Notiz: Wer das findet, bekommt offiziell gar nichts. Inoffiziell Ruhm.',
'LEVEL 51: Die Roswell-BBQ-Rezeptur wurde von drei Behörden geschwärzt.',
'INTERN: Das UFO wird nach Feierabend hinter dem Truck geparkt.',
'Geheimakte B-12: Bacon wurde als strategische Ressource eingestuft.',
'Wenn dich jemand fragt: Dieses Fenster war nie hier.',
'Du wurdest ausgewählt. Warum, weiß selbst der Bordcomputer nicht.',
'CLASSIFIED: Die Käsesauce hat einen eigenen Sicherheitscode.',
'Geheimer Test bestanden: Du kannst offenbar fünfmal auf ein Logo klicken.',
'Roswell-Zentrale bestätigt deinen Status: ERDLING MIT POTENZIAL.',
'Operation DOUBLE läuft. Details nur gegen Vorlage eines zweiten Patties.',
'Aktennotiz: Subjekt zeigt erhöhte Neigung zu knusprigen Kartoffeln.',
'Das Alien sagt, du sollst auf keinen Fall noch einmal klicken. Wirklich nicht.',
'CLEARANCE 51: Zugang zum intergalaktischen Pausenraum gewährt.',
'TOP SECRET: Wir wissen, wer das letzte Chili Cheese Nugget gegessen hat.',
'Geheime Koordinate entschlüsselt: 51° N. Mehr dürfen wir nicht sagen.',
'Interne Warnung: Zu viel Wissen kann spontanen Burgerhunger auslösen.',
'Du bist jetzt Teil des Programms. Das Programm hat allerdings kein Budget.',
'Die Akte über Area 51 Sauce umfasst 847 Seiten und einen Fettfleck.',
'Zugriff auf Projekt BACON ORBIT gewährt.',
'Das Mutterschiff kennt deinen Browser. Mehr verraten wir nicht.',
'Du bist tiefer vorgedrungen als jeder normale Erdling.',
'TOP SECRET: Der Smash-Sound ist unser eigentliches Kommunikationssignal.',
'Geheimdienstlich bestätigt: Niemand sagt „nur eine Pommes“ und meint es ernst.',
'Das UFO hat dich markiert: „wahrscheinlich freundlich, definitiv hungrig“.',
'Interne Meldung: Der Chef weiß angeblich nichts von diesem Menü.',
'Du hast die geheime Tür gefunden. Hinter ihr: noch eine Käsesauce.',
'LEVEL 51 UNLOCKED: Keine weiteren Rechte. Aber deutlich mehr Respekt.',
'Die Aliens haben eine Frage: Warum heißt es Fast Food, wenn Warten auf Bacon so lange dauert?',
'TOP SECRET: Unser stärkstes Verteidigungssystem ist eine heiße Grillplatte.',
'Protokoll gelöscht. Erinnerung an diese Nachricht bitte ebenfalls löschen.',
'Geheime Akte geschlossen. Hunger bleibt offen.',
'CLASSIFIED: Der Planet Mac besitzt einen Reisepass aus Andromeda.',
'Du wurdest nicht gehackt. Du hast nur zu neugierig geklickt.',
'Geheimdienstnotiz: Diese Nachricht zerstört sich nicht selbst. Budgetkürzungen.',
'LEVEL 51: Die Wahrheit liegt zwischen Bun und Patty.',
'TOP SECRET: Der Grill hat einen Decknamen. Wir dürfen ihn nicht nennen.',
'Du bist jetzt offiziell zu neugierig für die normale Speisekarte.',
'Interner Funkspruch: „Der Erdling hat das Easter Egg gefunden.“ – „Schon wieder?“',
'Aktenzeichen 51-BBQ: Vorgang bleibt wegen zu guter Sauce unter Verschluss.',
'Geheimcode akzeptiert. Leider war der Geheimcode einfach fünfmal klicken.',
'Das Kontrollzentrum beobachtet dich nicht. Also… nicht ständig.',
'CLEARANCE: VIOLETT. Berechtigung: geheime Sprüche lesen.',
'Roswell hat angerufen. Sie behaupten weiterhin, wir hätten ihre Sauce.',
'TOP SECRET: Die genaue Bacon-Menge wird aus Gründen der nationalen Sicherheit geschwärzt.',
'Geheimes Protokoll: Erst fünf Klicks, dann Hunger. Funktioniert zuverlässig.',
'Du hast Zugang zum dunklen Teil des Menüs. Der Teil ist nur metaphorisch dunkel.',
'INTERNE AKTE: UFO-Pilot bevorzugt Chili Cheese.',
'CLASSIFIED: Das letzte Patty verließ die Atmosphäre mit 11,2 km/s.',
'Du hast gerade Level 51 erreicht. Level 52 existiert offiziell nicht.',
'Geheime Nachricht: Schau unauffällig. Das Alien schaut zurück.',
'TOP SECRET: Unser Satellit misst Grilltemperatur statt Wetter.',
'Freigabestufe 51: Die nächste Nachricht könnte noch geheimer sein.',
'Interner Bericht: Mensch klickt fünfmal auf Logo. Wissenschaft ist begeistert.',
'Die Wahrheit wurde geschwärzt. Übrig blieb: Extra Bacon.',
'Geheimakte X-51: Knusprigkeit liegt über dem erlaubten Grenzwert.',
'Du bist jetzt in einem sehr exklusiven Club mit erstaunlich wenig Mitgliedsbeitrag.',
'TOP SECRET: Diese Website enthält mehr Aliens als Cookies.',
'Das Alien hat deinen Klickcode erkannt. Es nickt anerkennend.',
'Geheime Bodenstation: Identität bestätigt. Hunger unbestätigt.',
'Projekt SMASH SIGNAL sendet auf einer Frequenz, die nur Hungrige hören.',
'CLASSIFIED: Jemand hat versucht, Käsesauce als Treibstoff zu verwenden.',
'Willkommen hinter der vierten Wand. Die fünfte Wand ist in Area 51.',
'CLEARANCE ACCEPTED: Du darfst diese Nachricht lesen. Mehr aber wirklich nicht.',
'Interner Hinweis: Wenn du noch einmal klickst, passiert vermutlich… wieder ein Spruch.',
'TOP SECRET: Die Aliens nennen uns „die mit den guten Pommes“.',
'Geheimes Ende der Akte: Nice to meat you, Agent.'
];

const localizedSecrets=window.PSB_I18N?.lang==='de' ? secretMessages : secretMessages.slice(0,8).map(window.PSB_I18N.t);
let secretBag=shuffled(localizedSecrets);
function nextSecretMessage(){
  if(!secretBag.length) secretBag=shuffled(localizedSecrets);
  return secretBag.pop();
}

let logoClicks=0;
let logoTimer;
const secret=document.querySelector('[data-secret-access]');
const secretMessage=document.querySelector('[data-secret-message]');

function showSecretMessage(){
  if(secretMessage) secretMessage.textContent=nextSecretMessage();
}
function openSecret(){
  if(!secret) return;
  showSecretMessage();
  secret.classList.add('active');
  secret.setAttribute('aria-hidden','false');
  document.body.classList.add('secret-open');
}
function closeSecret(){
  if(!secret) return;
  secret.classList.remove('active');
  secret.setAttribute('aria-hidden','true');
  document.body.classList.remove('secret-open');
}

document.querySelectorAll('.logo-secret-trigger').forEach(trigger=>{
  trigger.addEventListener('click',()=>{
    logoClicks++;
    clearTimeout(logoTimer);
    const logo=trigger.querySelector('.original-logo');
    logo?.classList.add('logo-pulse');
    setTimeout(()=>logo?.classList.remove('logo-pulse'),180);

    if(logoClicks>=5){
      logoClicks=0;
      openSecret();
      return;
    }
    logoTimer=setTimeout(()=>{logoClicks=0;},2600);
  });
});

document.querySelector('[data-secret-next]')?.addEventListener('click',showSecretMessage);
document.querySelector('[data-secret-close]')?.addEventListener('click',closeSecret);
secret?.addEventListener('click',event=>{if(event.target===secret) closeSecret();});
document.addEventListener('keydown',event=>{if(event.key==='Escape') closeSecret();});


/* --- Flying Planet Smashburger UFO --- */
(function initFlyingLogoUfo(){
  const flyer=document.createElement('div');
  flyer.className='flying-logo-ufo';
  flyer.setAttribute('aria-hidden','true');
  flyer.innerHTML='<div class="ufo-trail"></div><img src="assets/logo.webp" alt=""><span class="ufo-uiii"></span>';
  document.body.appendChild(flyer);

  let busy=false;

  function fly(peek,fromLeft,label){
    if(busy||document.hidden)return;
    busy=true;
    const size=window.innerWidth<=800?100:130;
    const y=Math.max(70,Math.min(window.innerHeight-size-100,Math.round(window.innerHeight*(.12+Math.random()*.55))));
    flyer.style.top=y+'px';
    flyer.style.left='0';
    flyer.style.right='auto';
    flyer.classList.toggle('from-right',!fromLeft);
    flyer.classList.toggle('peek-flight',peek);
    const bubble=flyer.querySelector('.ufo-uiii');
    if(bubble){
      bubble.textContent=label||'';
      bubble.classList.toggle('peek-word',Boolean(label));
    }
    flyer.style.opacity='1';

    const vw=document.documentElement.clientWidth;
    const startX=fromLeft?-size-35:vw+35;
    const endX=fromLeft?vw+35:-size-35;
    const peekX=fromLeft?-28:vw-size+28;
    const frames=peek?[
      {transform:'translate3d('+startX+'px,0,0) rotate('+(fromLeft?-8:8)+'deg)',opacity:0},
      {transform:'translate3d('+peekX+'px,0,0) rotate('+(fromLeft?5:-5)+'deg)',opacity:1,offset:.22},
      {transform:'translate3d('+peekX+'px,0,0) rotate('+(fromLeft?5:-5)+'deg)',opacity:1,offset:.72},
      {transform:'translate3d('+startX+'px,0,0) rotate('+(fromLeft?-8:8)+'deg)',opacity:0}
    ]:[
      {transform:'translate3d('+startX+'px,18px,0) rotate('+(fromLeft?-10:10)+'deg)',opacity:0},
      {transform:'translate3d('+(fromLeft?vw*.48:vw*.52-size)+'px,-22px,0) rotate('+(fromLeft?5:-5)+'deg)',opacity:1,offset:.48},
      {transform:'translate3d('+endX+'px,14px,0) rotate('+(fromLeft?-4:4)+'deg)',opacity:0}
    ];

    const anim=flyer.animate(frames,{duration:peek?4000:6000,easing:peek?'ease-in-out':'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
    anim.onfinish=()=>{flyer.style.opacity='0';flyer.classList.remove('from-right','peek-flight');busy=false;};
  }

  // One appearance sequence per page load: Planet, Planet, then the full fly-by.
  setTimeout(()=>fly(true,true,'PLANET'),15000);
  setTimeout(()=>fly(true,false,'PLANET'),38000);
  setTimeout(()=>fly(false,true,'PLANET SMASH BURGER'),62000);
})();
