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
