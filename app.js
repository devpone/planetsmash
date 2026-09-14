function getOpeningStatus(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Berlin',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p => [p.type,p.value]));
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const names=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const day=days.indexOf(parts.weekday), time=Number(parts.hour)+Number(parts.minute)/60;
  const opens=[14,null,16,16,16,16,16];
  if(opens[day]!==null && time>=opens[day] && time<22) return 'Jetzt geöffnet · bis 22 Uhr';
  if(opens[day]!==null && time<opens[day]) return `Heute ab ${opens[day]} Uhr geöffnet`;
  let offset=1; while(opens[(day+offset)%7]===null) offset++;
  const next=(day+offset)%7;
  return `${day===1?'Heute Ruhetag':'Jetzt geschlossen'} · ${offset===1?'morgen':names[next]} ab ${opens[next]} Uhr`;
}
function updateOpeningStatus(){
  const status=getOpeningStatus();
  document.querySelectorAll('[data-status]').forEach(el=>el.textContent=status);
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
