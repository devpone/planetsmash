function getBerlinParts(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Berlin',
    weekday:'short',
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit',
    hourCycle:'h23'
  }).formatToParts(now).map(p => [p.type,p.value]));
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return {
    day: days.indexOf(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

const openingHours=[14,null,16,16,16,16,16];

function getOpeningStatus(now = new Date()) {
  const names=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const {day,hour,minute}=getBerlinParts(now);
  const time=hour+minute/60;
  if(openingHours[day]!==null && time>=openingHours[day] && time<22) return 'Jetzt geöffnet · bis 22 Uhr';
  if(openingHours[day]!==null && time<openingHours[day]) return `Heute ab ${openingHours[day]} Uhr geöffnet`;
  let offset=1; while(openingHours[(day+offset)%7]===null) offset++;
  const next=(day+offset)%7;
  return `${day===1?'Heute Ruhetag':'Jetzt geschlossen'} · ${offset===1?'morgen':names[next]} ab ${openingHours[next]} Uhr`;
}

function getCountdown(now = new Date()) {
  const {day,hour,minute,second}=getBerlinParts(now);
  const current=day*86400+hour*3600+minute*60+second;
  const open=openingHours[day];
  let target;
  let label;

  if(open!==null && current>=day*86400+open*3600 && current<day*86400+22*3600){
    target=day*86400+22*3600;
    label='Schließt in';
  } else {
    label='Öffnet in';
    for(let offset=0;offset<=7;offset++){
      const candidateDay=day+offset;
      const candidateOpen=openingHours[candidateDay%7];
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

function updateOpeningStatus(){
  const status=getOpeningStatus();
  document.querySelectorAll('[data-status]').forEach(el=>el.textContent=status);
  document.querySelectorAll('[data-countdown]').forEach(el=>el.textContent=getCountdown());
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

// CounterAPI: public, no account/key required. The value is unique visitors,
// while the personal landing number is remembered locally in the browser.
async function updateVisitorCount(){
  const countEl=document.querySelector('[data-visitor-count]');
  const copyEl=document.querySelector('[data-earthling-copy]');
  if(!countEl) return;

  try{
    const response=await fetch('https://counterapi.com/api/planetsmashburger.de/landing/homepage?unique=true',{
      cache:'no-store'
    });
    if(!response.ok) throw new Error('Counter '+response.status);
    const data=await response.json();
    const value=Number(data.value);
    if(!Number.isFinite(value)) throw new Error('Ungültiger Zählerwert');

    countEl.textContent=new Intl.NumberFormat('de-DE').format(value);

    let landingNumber=Number(localStorage.getItem('psb-earthling-number'));
    if(!Number.isFinite(landingNumber)||landingNumber<1){
      landingNumber=value;
      localStorage.setItem('psb-earthling-number',String(landingNumber));
    }
    if(copyEl){
      copyEl.textContent='Schon '+new Intl.NumberFormat('de-DE').format(value)+' Erdlinge auf diesem Planeten gelandet. Du bist Erdling #'+new Intl.NumberFormat('de-DE').format(landingNumber)+'.';
    }
  }catch(error){
    countEl.textContent='SIGNAL GESTÖRT';
    if(copyEl) copyEl.textContent='Die Bodenstation antwortet gerade nicht. Versuch es beim nächsten Vorbeiflug nochmal.';
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

const transmissions=[
'Die Wahrheit ist da draußen. Der Bacon ist hier.',
'Keine intelligenten Lebensformen gefunden. Aber gute Burger.',
'Mission aktualisiert: Pommes bestellen.',
'Roswell meldet: Käsesauce kritisch niedrig.',
'Area 51 bestätigt: Extra Bacon ist kein Zufall.',
'Unbekanntes Flugobjekt gesichtet. Es riecht verdächtig nach BBQ.',
'Die Aliens kommen in Frieden. Und wegen der Pommes.',
'Geheime Satellitendaten zeigen: Hunger nimmt exponentiell zu.',
'Houston sagt, du sollst den Double nehmen.',
'Der Rat der Galaxie empfiehlt: Sauce nicht vergessen.',
'Signal aus Roswell: Das Patty muss gesmasht werden.',
'Interstellare Analyse abgeschlossen: Noch ein Burger wäre wissenschaftlich vertretbar.',
'Warnung: Käsekonzentration nähert sich kritischem Niveau.',
'Das UFO landet nur für Bacon.',
'Mars meldet Lieferverzug. Komm lieber selbst vorbei.',
'Unbekannte Lebensform verlangt Area 51 Sauce.',
'Planetenkern stabil. Fritteuse stabil. Mission läuft.',
'Geheimdienstnotiz: Niemand hat jemals nur eine Pommes gegessen.',
'Alien-Protokoll 7B: Erst Burger. Dann Weltübernahme.',
'Die NASA bestreitet alles. Wir bestreiten nur trockene Burger.',
'Kosmische Strahlung erkannt. Ursache vermutlich geschmolzener Käse.',
'Funkspruch abgefangen: „Bring zwei Classic Cheese mit.“',
'Der Mond ist nicht aus Käse. Unsere Sauce schon eher.',
'Sektor 51 meldet: Jalapeños erfolgreich bewaffnet.',
'Bordcomputer sagt: Kalorien existieren im All nicht.',
'Wissenschaftlicher Konsens: Bacon verbessert die Umlaufbahn.',
'Planet Smashburger an Erde: Hungerstatus bitte bestätigen.',
'Sicherheitsstufe LILA: Trüffelmayonnaise wurde entdeckt.',
'Gravitationsanomalie lokalisiert: direkt über den Smashpommes.',
'Crewmeldung: Einer geht noch.',
'Geheimer Befehl: Nicht mit leerem Magen weiterlesen.',
'Die Sterne stehen günstig für Chili Cheese.',
'Systemdiagnose: 99 % funktionsfähig. 1 % braucht Käsesauce.',
'Alien-Übersetzung abgeschlossen: „Nice to meat you.“',
'Kontrollzentrum: Wir haben ein Patty im Orbit.',
'Unbestätigte Berichte über knusprigen Bacon im Sektor Aufderhöhe.',
'Zeitreise erfolgreich. Dein Burger ist trotzdem frisch.',
'Schwarzes Loch entdeckt. Es hat gerade die letzten Pommes verschluckt.',
'Der Autopilot empfiehlt Roswell BBQ.',
'Neue Galaxie entdeckt. Name: Bacon & Egg.',
'Sternenkarte aktualisiert: Zielkoordinaten Nußbaumstraße 1.',
'Der Bordcomputer verweigert den Dienst ohne Pommes.',
'Möglicherweise außerirdisch. Definitiv hungrig.',
'Telemetrie sagt: Dein Hunger sendet auf allen Frequenzen.',
'Planetare Verteidigung aktiviert. Gegen labbrige Pommes.',
'Erde an Smashburger: Wir kommen in Frieden und mit Appetit.',
'Raumanzug optional. Hunger erforderlich.',
'Geheime Akte geöffnet: Operation Molten Cheddar.',
'Das Signal ist schwach. Der Bacon ist stark.',
'Sektor Pommes meldet vollständige Knusprigkeit.',
'UFO-Besatzung fragt, ob das auch als Menü geht.',
'Kontakt hergestellt. Erste Forderung der Aliens: Extra Patty.',
'Kosmischer Wetterbericht: 100 % Chance auf Smash.',
'Bordlogbuch: Tag 51. Noch immer kein Grund, Ketchup aufzugeben.',
'Intergalaktischer Zoll hat die Käsesauce durchgewunken.',
'Galaktische Behörde warnt vor plötzlichem Burgerverlangen.',
'Das Kontrollzentrum dementiert Gerüchte über eine geheime Baconreserve.',
'Ein kleiner Biss für einen Menschen. Ein großer Smash für die Menschheit.',
'Funkspruch aus Andromeda: „Was kostet Extra Patty?“',
'Die Sonde hat intelligentes Leben entdeckt. Es bestellt Chili Cheese.',
'Planetare Temperatur steigt. Ursache: Grillplatte.',
'Sternzeit 20:26. Mission: satt werden.',
'Bacon-Satellit erfolgreich in niedrigen Erdorbit gebracht.',
'Area 51 an Küche: Zielperson zeigt eindeutige Hungersymptome.',
'Der Geheimcode lautet: MEHR KÄSE.',
'Alien-Diplomatie gescheitert. Sie wollten die letzte Pommes.',
'Unerklärliches Phänomen: Der Burger war plötzlich weg.',
'Die Milchstraße wurde umbenannt. Ab jetzt Käsestraße.',
'Crew an Basis: Wir brauchen Verstärkung. Und Servietten.',
'Satellitenbild bestätigt: Aufderhöhe ist nicht auf dem Mars.',
'Unbekanntes Signal entschlüsselt: „Mach scharf.“',
'Warnung: Öffnen dieser Nachricht kann Appetit verursachen.',
'Das Universum expandiert. Dein Menü offenbar auch.',
'Die Area-51-Akte sagt: Doppelt Käse zählt als Sicherheitsmaßnahme.',
'Mission Control meldet: Bun-Integrität 100 %.',
'Außerirdische Zivilisation entdeckt. Sie dippt Pommes in Käsesauce.',
'Zeit-Raum-Kontinuum stabil. Mittagessen verspätet.',
'Orbit erreicht. Bacon secured.',
'Protokoll 51-A: Niemand verlässt den Planeten hungrig.',
'Der nächste Funkspruch ist streng geheim. Dieser hier war nur Ablenkung.',
'CLASSIFIED // Die Sauce kennt die Wahrheit.',
'CLASSIFIED // Projekt CRISPY läuft nach Plan.',
'TOP SECRET // Das Alien im Logo weiß mehr, als es zugibt.',
'TOP SECRET // Die fünfte Dimension schmeckt nach BBQ.',
'CLASSIFIED // Operation DOUBLE PATTY wurde autorisiert.',
'TOP SECRET // Wir haben nie behauptet, dass die Kühe von der Erde kommen.',
'CLASSIFIED // Der Planet Mac besitzt diplomatische Immunität.',
'TOP SECRET // Der Bacon-Satellit sendet seit Dienstag.',
'CLASSIFIED // Das Rezept liegt in einem Bunker unter Solingen.',
'TOP SECRET // Sauce 51 wurde offiziell nie entwickelt.',
'Kosmische Prognose: Heute hohe Wahrscheinlichkeit für Extra Patty.',
'Das Mutterschiff hat geparkt. Parkscheibe liegt aus.',
'Alien an Bodenstation: „Einmal alles. Ohne Zwiebeln.“',
'Der Scanner findet bei dir ungewöhnlich hohe Burgerkompatibilität.',
'Bordlogbuch: Wir hätten mehr Servietten mitnehmen sollen.',
'Die Umlaufbahn ist stabil. Der Käse nicht.',
'Notfallprotokoll aktiviert: Erst dippen, dann diskutieren.',
'Die Crew hat abgestimmt. Einstimmig für Pommes.',
'Signalstärke 100 %. Selbstkontrolle 12 %.',
'Unbekannte Energiequelle lokalisiert: Fritteuse.',
'Die Aliens wollten unsere Technologie. Jetzt wollen sie die Käsesauce.',
'Planet Smashburger empfiehlt keine Raumfahrt auf leeren Magen.',
'Radar meldet ein Objekt mit hoher Bacon-Dichte.',
'Abhörprotokoll: „Sag niemandem, dass ich zwei Burger hatte.“',
'Gravitationswelle erkannt. Ursprung: Double Patty.',
'Die Sterne lügen nicht. Du hast Hunger.',
'Interstellarer Rat: Menü-Upgrade genehmigt.',
'Roswell an Solingen: Paket mit Jalapeños unterwegs.',
'Der Bordcomputer fragt zum dritten Mal nach Trüffelmayonnaise.',
'Warnung: Dieses Terminal ist möglicherweise hungrig.',
'Operation NICE TO MEAT YOU verläuft exakt nach Plan.',
'Die letzte Pommes wurde unter Schutz gestellt.',
'Funkstille beendet. Jemand hat Bacon erwähnt.',
'Ein kosmischer Riss wurde entdeckt. Dahinter: noch mehr Käsesauce.',
'Die Crew meldet ein seltenes Phänomen: freiwillig geteilte Pommes.',
'Bodenstation an UFO: Landeplatz frei. Hunger bitte eingeschaltet lassen.',
'Area 51 hat angerufen. Sie wollen ihre Sauce zurück.',
'Die Galaxie ist groß. Dein Appetit offenbar größer.',
'Unbekanntes Objekt im Anflug. Form: rund. Vermutlich Bun.',
'Die Raumzeit krümmt sich. Wahrscheinlich wegen des Double.',
'Forschungsbericht: Pommes schmecken im Vakuum nicht besser. Hier schon.',
'Die Sternenflotte fordert eine zweite Portion.',
'Warnung aus dem Orbit: Wer Bacon teilt, verliert Rangpunkte.',
'Der Mars-Rover hat Spuren gefunden. Sie führen zur Käsesauce.',
'Kontrollzentrum an Crew: Bitte Patty nicht unbeaufsichtigt im Orbit lassen.',
'Galaktische Zollkontrolle abgeschlossen. Bacon verzollt.',
'Die Aliens verstehen unsere Sprache nicht. „Extra Käse“ verstehen sie.',
'Mission „nur kurz gucken“ ist offiziell gescheitert.',
'Der Scanner erkennt: 87 % Mensch, 13 % Hunger.',
'Wir haben versucht, die Sauce zu analysieren. Labor evakuiert.',
'Funkmeldung: Das Menü ist größer als auf den Satellitenbildern.',
'Geheime Prognose: In wenigen Minuten denkst du wieder an Burger.',
'Unbekannter Planet entdeckt. Atmosphäre: BBQ.',
'Die Crew bittet um Bestätigung: Mayo zählt als Raumfahrtbedarf.',
'CLASSIFIED // Das Patty kennt deinen Namen.',
'TOP SECRET // Der Grill sendet nachts Morsezeichen.',
'CLASSIFIED // Die Pommes wurden für höhere Knusprigkeit genetisch nicht verändert. Angeblich.',
'TOP SECRET // Nußbaumstraße 1 ist auf keiner offiziellen Sternenkarte.',
'CLASSIFIED // Die Area-51-Sauce hat ihren eigenen Anwalt.',
'TOP SECRET // Das UFO akzeptiert nur Barzahlung in Bacon.',
'Die Galaxie fragt: mit oder ohne Jalapeños?',
'Interplanetare Nachricht: Teilen ist erlaubt. Muss aber nicht.',
'Die Sensoren schlagen aus. Irgendwo wird gerade Käse geschmolzen.',
'Crewstatus: satt? Negative Rückmeldung.',
'Der Bordcomputer hat „Salat“ vorgeschlagen. Er wurde neu gestartet.',
'Die Mission wurde verlängert. Grund: Dessert nicht vorhanden, also noch Pommes.',
'Roswell bestätigt: Dieser Funkspruch wurde vor 51 Sekunden gesendet.',
'Warnung: Zu viel Scrollen kann zu spontanem Vorbeikommen führen.',
'Wir empfangen ein schwaches Signal aus der Küche: „Bestellung fertig!“'
];

function shuffled(source){
  const bag=[...source];
  for(let i=bag.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [bag[i],bag[j]]=[bag[j],bag[i]];
  }
  return bag;
}

let transmissionBag=shuffled(transmissions);
function nextTransmission(){
  if(!transmissionBag.length) transmissionBag=shuffled(transmissions);
  return transmissionBag.pop();
}

const transmissionButton=document.querySelector('[data-transmission-button]');
const transmissionText=document.querySelector('[data-transmission]');
if(transmissionButton&&transmissionText){
  transmissionButton.addEventListener('click',()=>{
    const message=nextTransmission();
    transmissionText.classList.remove('transmission-pop','classified');
    void transmissionText.offsetWidth;
    transmissionText.textContent=message;
    if(message.startsWith('CLASSIFIED')||message.startsWith('TOP SECRET')) transmissionText.classList.add('classified');
    transmissionText.classList.add('transmission-pop');
    transmissionButton.textContent='Nächste Nachricht ↗';
  });
}

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
    },3300);
  };

  activateButton.addEventListener('click',runScan);
}

const secretMessages=[
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

let secretBag=shuffled(secretMessages);
function nextSecretMessage(){
  if(!secretBag.length) secretBag=shuffled(secretMessages);
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

document.querySelectorAll('.original-logo').forEach(logo=>{
  logo.addEventListener('click',event=>{
    event.preventDefault();
    logoClicks++;
    clearTimeout(logoTimer);
    logo.classList.add('logo-pulse');
    setTimeout(()=>logo.classList.remove('logo-pulse'),180);

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
  flyer.innerHTML='<div class="ufo-trail"></div><img src="assets/logo.webp" alt=""><span class="ufo-uiii">Wiiiiiiii!</span>';
  document.body.appendChild(flyer);

  let busy=false,flightCount=0,audioCtx=null,audioUnlocked=false;

  function unlockAudio(){
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return;
      if(!audioCtx)audioCtx=new AudioCtx();
      audioCtx.resume().then(()=>{audioUnlocked=audioCtx.state==='running';}).catch(()=>{});
    }catch(e){}
  }
  ['touchstart','pointerdown','click'].forEach(type=>document.addEventListener(type,unlockAudio,{once:true,passive:true}));

  function playWiiii(duration=2.15){
    if(!audioUnlocked||!audioCtx||audioCtx.state!=='running')return;
    try{
      duration=Math.max(.25,Math.min(2.15,duration));
      const now=audioCtx.currentTime;
      const master=audioCtx.createGain();
      master.gain.setValueAtTime(.0001,now);
      master.gain.exponentialRampToValueAtTime(.13,now+.04);
      master.gain.setValueAtTime(.12,now+Math.max(.08,duration-.18));
      master.gain.exponentialRampToValueAtTime(.0001,now+duration);
      master.connect(audioCtx.destination);

      const voice1=audioCtx.createOscillator(),voice2=audioCtx.createOscillator();
      const vibrato=audioCtx.createOscillator(),vibratoGain=audioCtx.createGain();
      voice1.type='sawtooth'; voice2.type='triangle';
      voice1.frequency.setValueAtTime(285,now);
      voice1.frequency.linearRampToValueAtTime(365,now+Math.min(.55,duration*.45));
      voice1.frequency.linearRampToValueAtTime(330,now+duration);
      voice2.frequency.setValueAtTime(570,now);
      voice2.frequency.linearRampToValueAtTime(730,now+Math.min(.55,duration*.45));
      voice2.frequency.linearRampToValueAtTime(660,now+duration);
      vibrato.type='sine'; vibrato.frequency.value=5.2; vibratoGain.gain.value=7;
      vibrato.connect(vibratoGain); vibratoGain.connect(voice1.frequency); vibratoGain.connect(voice2.frequency);

      const tone=audioCtx.createBiquadFilter(),mix1=audioCtx.createGain(),mix2=audioCtx.createGain();
      tone.type='lowpass'; tone.frequency.value=1450; tone.Q.value=.7;
      mix1.gain.value=.7; mix2.gain.value=.22;
      voice1.connect(mix1); voice2.connect(mix2); mix1.connect(tone); mix2.connect(tone); tone.connect(master);
      voice1.start(now); voice2.start(now); vibrato.start(now);
      voice1.stop(now+duration+.03); voice2.stop(now+duration+.03); vibrato.stop(now+duration+.03);
    }catch(e){}
  }

  function fly(forcePeek=null,forceFromLeft=null,peekSoundDuration=0,peekWord=''){
    if(busy||document.hidden)return;
    busy=true;flightCount++;
    const fromLeft=forceFromLeft===null?Math.random()>.5:forceFromLeft;
    const peek=forcePeek===null?flightCount%3===0:forcePeek;
    const size=window.innerWidth<=800?100:130;
    const y=Math.max(70,Math.min(window.innerHeight-size-100,Math.round(window.innerHeight*(.12+Math.random()*.55))));
    flyer.style.top=y+'px';
    flyer.style.left='0';
    flyer.style.right='auto';
    flyer.classList.toggle('from-right',!fromLeft);
    flyer.classList.toggle('peek-flight',peek);
    const bubble=flyer.querySelector('.ufo-uiii');
    if(bubble){
      bubble.textContent=peek&&peekWord?peekWord:'Wiiiiiiii!';
      bubble.classList.toggle('peek-word',Boolean(peek&&peekWord));
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
    if(peek&&peekSoundDuration>0)playWiiii(peekSoundDuration);
    if(!peek)playWiiii();
    const anim=flyer.animate(frames,{duration:peek?4000:6000,easing:peek?'ease-in-out':'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
    anim.onfinish=()=>{flyer.style.opacity='0';flyer.classList.remove('from-right','peek-flight');busy=false;};
  }

  // Each 90-second cycle: peek exactly three times (left, right, left),
  // then make one full fly-by with sound.
  function scheduleUfoCycle(){
    setTimeout(()=>fly(true,true,0,'KOMM'),15000);
    setTimeout(()=>fly(true,false,0,'BURGER'),38000);
    setTimeout(()=>fly(true,true,0,'ESSEN'),62000);
    setTimeout(()=>fly(false),90000);
  }

  scheduleUfoCycle();
  setInterval(scheduleUfoCycle,90000);
})();
