(() => {
  const section = document.querySelector('#funksprueche');
  if (!section) return;
  const config = window.PSB_GUESTBOOK || {};
  const api = String(config.apiUrl || '').replace(/\/$/, '');
  const siteKey = String(config.turnstileSiteKey || '');
  const form = section.querySelector('[data-guestbook-form]');
  const name = form.elements.name;
  const message = form.elements.message;
  const submit = form.querySelector('[type=submit]');
  const feedback = section.querySelector('[data-guestbook-feedback]');
  const count = section.querySelector('[data-guestbook-count]');
  const list = section.querySelector('[data-guestbook-messages]');
  const total = section.querySelector('[data-guestbook-total]');
  const more = section.querySelector('[data-guestbook-more]');
  const challenge = section.querySelector('[data-guestbook-challenge]');
  let cursor = null;
  let widget = null;
  let sending = false;
  const t = value => window.PSB_I18N?.t(value) || value;
  function status(value, error = false) {
    feedback.textContent = t(value);
    feedback.classList.toggle('error', error);
  }
  function renderCard(item) {
    const card = document.createElement('article');
    card.className = 'guestbook-card';
    const top = document.createElement('div'); top.className = 'guestbook-card-top';
    const avatar = document.createElement('span'); avatar.className = 'guestbook-avatar'; avatar.setAttribute('aria-hidden','true'); avatar.textContent = '✦';
    const identity = document.createElement('div');
    const author = document.createElement('strong'); author.className = 'guestbook-card-name'; author.textContent = item.name;
    const time = document.createElement('time'); time.className = 'guestbook-card-time';
    time.dateTime = item.created_at;
    time.textContent = new Intl.DateTimeFormat(document.documentElement.lang, {dateStyle:'medium', timeZone:'Europe/Berlin'}).format(new Date(item.created_at));
    identity.append(author,time); top.append(avatar,identity);
    const body = document.createElement('p'); body.textContent = item.message;
    const foot = document.createElement('div'); foot.className = 'guestbook-card-foot';
    const signal = document.createElement('span'); signal.textContent = t('SIGNAL EMPFANGEN');
    const report = document.createElement('button'); report.type = 'button'; report.className = 'guestbook-report'; report.textContent = t('Melden');
    report.setAttribute('aria-label', t('Funkspruch melden'));
    report.addEventListener('click', async () => {
      report.disabled = true;
      try {
        const response = await fetch(`${api}/messages/${encodeURIComponent(item.id)}/report`, {method:'POST'});
        if (!response.ok) throw new Error('report');
        report.textContent = t('Gemeldet');
      } catch { report.disabled = false; report.textContent = t('Erneut versuchen'); }
    });
    foot.append(signal,report); card.append(top,body,foot);
    return card;
  }
  async function load(append = false) {
    try {
      const url = new URL(`${api}/messages`);
      if (append && cursor) url.searchParams.set('before',cursor);
      const response = await fetch(url);
      if (!response.ok) throw new Error('load');
      const data = await response.json();
      if (!append) list.replaceChildren();
      for (const item of data.messages) list.append(renderCard(item));
      cursor = data.next || null;
      more.hidden = !cursor;
      total.textContent = `${data.total} ${t('FUNKSIGNALE')}`;
      if (!list.children.length) {
        const empty = document.createElement('div'); empty.className='guestbook-empty'; empty.textContent=t('Noch kein Funkspruch. Sende den ersten!'); list.append(empty);
      }
    } catch {
      if (!append) list.textContent = t('Funksprüche gerade nicht erreichbar. Versuch es später noch einmal.');
      else more.hidden = true;
    }
  }
  message.addEventListener('input', () => { count.textContent = `${message.value.length} / 280`; });
  section.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    message.value = button.dataset.prompt;
    message.dispatchEvent(new Event('input'));
    message.focus();
  }));
  more.addEventListener('click', () => load(true));
  if (!api || !siteKey) {
    status('Die Funkspruch-Wand wird vorbereitet. Schau bald wieder vorbei.');
    list.textContent = t('Die Funkspruch-Wand wird vorbereitet. Schau bald wieder vorbei.');
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = () => {
    widget = window.turnstile.render(challenge, {sitekey:siteKey, theme:'dark', callback:() => {submit.disabled=false;}, 'expired-callback':() => {submit.disabled=true;}});
    status('Bereit für deinen Funkspruch.');
  };
  script.onerror = () => status('Spam-Schutz nicht erreichbar. Bitte später erneut versuchen.',true);
  document.head.append(script);
  load();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    const token = window.turnstile?.getResponse(widget);
    if (!token) return status('Bitte warte kurz auf die Sicherheitsprüfung.',true);
    sending = true; submit.disabled = true; status('Funkspruch wird übertragen…');
    try {
      const response = await fetch(`${api}/messages`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.value.trim(),message:message.value.trim(),token})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'error');
      form.reset(); count.textContent = '0 / 280';
      status('Funkspruch gesendet! Du siehst ihn jetzt auf der Wand.');
      await load();
    } catch (error) {
      status(error.message === 'rate_limit' ? 'Zu viele Funksprüche. Bitte versuche es später erneut.' : 'Übertragung fehlgeschlagen. Versuch es bitte noch einmal.',true);
    } finally {
      sending = false;
      window.turnstile?.reset(widget);
    }
  });
})();
