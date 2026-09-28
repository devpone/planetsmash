(() => {
  const box = document.querySelector('[data-menu-survey]');
  const menu = document.querySelector('#speisekarte');
  if (!box || !menu) return;

  const API = 'https://planet-funksprueche.devpone.workers.dev';
  const SUPPRESS_KEY = 'psb-menu-survey-suppress-until-v1';
  const ANSWERED_KEY = 'psb-menu-survey-answered-v1';
  const SUPPRESS_MS = 14 * 24 * 60 * 60 * 1000;
  const SHOW_DELAY_MS = 18000;
  const STATUS_ENDPOINT = API + '/survey/menu-feedback';

  const closeBtn = box.querySelector('[data-survey-close]');
  const yesBtn = box.querySelector('[data-survey-yes]');
  const noBtn = box.querySelector('[data-survey-no]');
  const detail = box.querySelector('[data-survey-detail]');
  const textarea = box.querySelector('[data-survey-answer]');
  const count = box.querySelector('[data-survey-count]');
  const submit = box.querySelector('[data-survey-submit]');
  const status = box.querySelector('[data-survey-status]');
  const question = box.querySelector('[data-survey-question]');
  const thanks = box.querySelector('[data-survey-thanks]');

  let timer = null;
  let shown = false;

  function suppressed(){
    try{
      const until = Number(localStorage.getItem(SUPPRESS_KEY) || 0);
      const answered = localStorage.getItem(ANSWERED_KEY) === '1';
      return answered || until > Date.now();
    }catch{
      return false;
    }
  }

  function suppress(answered=false){
    try{
      localStorage.setItem(SUPPRESS_KEY, String(Date.now() + SUPPRESS_MS));
      if(answered) localStorage.setItem(ANSWERED_KEY, '1');
    }catch{}
  }

  function show(){
    if(shown || suppressed()) return;
    shown = true;
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('is-visible'));
  }

  function hide(){
    box.classList.remove('is-visible');
    window.setTimeout(() => { box.hidden = true; }, 280);
  }

  function closeForNow(){
    suppress(false);
    hide();
  }

  async function send(payload){
    const res = await fetch(API + '/survey/menu-feedback', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('survey_submit_failed');
    return res.json().catch(()=>({ok:true}));
  }

  function finish(){
    suppress(true);
    question.hidden = true;
    detail.hidden = true;
    thanks.hidden = false;
    window.setTimeout(hide, 2400);
  }

  closeBtn.addEventListener('click', closeForNow);

  yesBtn.addEventListener('click', () => {
    detail.hidden = false;
    yesBtn.setAttribute('aria-pressed','true');
    textarea.focus();
  });

  noBtn.addEventListener('click', async () => {
    noBtn.disabled = true;
    yesBtn.disabled = true;
    status.textContent = 'Antwort wird gesendet …';
    try{
      await send({missing:false, answer:'', source:'website-menu-survey'});
      finish();
    }catch{
      status.textContent = 'Die Übermittlung ist gerade nicht erreichbar. Die Umfrage wird für heute ausgeblendet.';
      suppress(false);
      window.setTimeout(hide, 1800);
    }
  });

  textarea.addEventListener('input', () => {
    count.textContent = String(textarea.value.length);
  });

  submit.addEventListener('click', async () => {
    const answer = textarea.value.trim().replace(/\s+/g,' ').slice(0,240);
    if(!answer){
      status.textContent = 'Schreib kurz rein, was dir auf der Karte fehlt.';
      textarea.focus();
      return;
    }

    submit.disabled = true;
    status.textContent = 'Signal wird gesendet …';

    try{
      await send({missing:true, answer, source:'website-menu-survey'});
      finish();
    }catch{
      status.textContent = 'Die Übermittlung ist gerade nicht erreichbar. Versuch es bitte später noch einmal.';
      submit.disabled = false;
    }
  });

  async function backendReady(){
    try{
      const res = await fetch(STATUS_ENDPOINT, {method:'GET', cache:'no-store'});
      if(!res.ok) return false;
      const data = await res.json().catch(()=>({}));
      return data && data.ok === true;
    }catch{
      return false;
    }
  }

  const observer = new IntersectionObserver((entries) => {
    if(suppressed()) {
      observer.disconnect();
      return;
    }
    if(entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .2)){
      observer.disconnect();
      timer = window.setTimeout(show, SHOW_DELAY_MS);
    }
  }, {threshold:[.2,.35]});

  backendReady().then(ready => {
    if(ready) observer.observe(menu);
  });

  window.addEventListener('beforeunload', () => {
    if(timer) window.clearTimeout(timer);
  });
})();
