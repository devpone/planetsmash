
(() => {
  const API = 'https://planet-funksprueche.devpone.workers.dev';
  const wall = document.querySelector('[data-radio-wall]');
  if (!wall) return;

  const form = wall.querySelector('[data-radio-form]');
  const feed = wall.querySelector('[data-radio-feed]');
  const totalEl = wall.querySelector('[data-radio-total]');
  const moreBtn = wall.querySelector('[data-radio-more]');
  const refreshBtn = wall.querySelector('[data-radio-refresh]');
  const submitBtn = wall.querySelector('[data-radio-submit]');
  const statusEl = wall.querySelector('[data-radio-status]');
  const textarea = form.querySelector('textarea[name="message"]');
  const countEl = wall.querySelector('[data-radio-count]');
  let nextCursor = null;
  let loading = false;

  const escDate = value => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('de-DE', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
  };

  function setStatus(message, type='') {
    statusEl.textContent = message;
    statusEl.className = 'radio-form-status' + (type ? ' ' + type : '');
  }

  function makeMessage(item) {
    const article = document.createElement('article');
    article.className = 'radio-message';

    const head = document.createElement('div');
    head.className = 'radio-message-head';

    const name = document.createElement('span');
    name.className = 'radio-message-name';
    name.textContent = item.name || 'Unbekannter Erdling';

    const time = document.createElement('time');
    time.dateTime = item.created_at || '';
    time.textContent = escDate(item.created_at);

    const text = document.createElement('p');
    text.textContent = item.message || '';

    const actions = document.createElement('div');
    actions.className = 'radio-message-actions';
    const report = document.createElement('button');
    report.type = 'button';
    report.textContent = 'Melden';
    report.addEventListener('click', async () => {
      if (report.disabled) return;
      report.disabled = true;
      report.textContent = 'Wird gemeldet …';
      try {
        const res = await fetch(`${API}/messages/${encodeURIComponent(item.id)}/report`, {method:'POST'});
        if (!res.ok) throw new Error('report_failed');
        report.textContent = 'Gemeldet ✓';
      } catch {
        report.disabled = false;
        report.textContent = 'Nochmal versuchen';
      }
    });
    actions.append(report);
    head.append(name, time);
    article.append(head, text, actions);
    return article;
  }

  async function loadMessages({append=false} = {}) {
    if (loading) return;
    loading = true;
    if (!append) {
      feed.innerHTML = '<div class="radio-loading"><span></span><p>Suche Signale im Orbit …</p></div>';
      moreBtn.hidden = true;
    } else {
      moreBtn.disabled = true;
      moreBtn.textContent = 'Empfange …';
    }

    try {
      const url = new URL(API + '/messages');
      if (append && nextCursor) url.searchParams.set('before', nextCursor);
      const res = await fetch(url, {cache:'no-store'});
      if (!res.ok) throw new Error('load_failed');
      const data = await res.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];

      if (!append) feed.replaceChildren();
      if (!append && messages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'radio-empty';
        empty.innerHTML = '<strong>NOCH STILLE IM ORBIT.</strong><span>Sei der erste Funkspruch auf diesem Planeten.</span>';
        feed.append(empty);
      } else {
        messages.forEach(item => feed.append(makeMessage(item)));
      }

      if (Number.isFinite(Number(data.total))) totalEl.textContent = Number(data.total).toLocaleString('de-DE');
      else totalEl.textContent = messages.length ? 'LIVE' : '0';

      nextCursor = data.next || null;
      moreBtn.hidden = !nextCursor;
    } catch {
      if (!append) feed.innerHTML = '<div class="radio-error">Die Bodenstation antwortet gerade nicht. Versuch es gleich noch einmal.</div>';
    } finally {
      loading = false;
      moreBtn.disabled = false;
      moreBtn.textContent = 'Ältere Funksprüche empfangen ↓';
    }
  }

  textarea.addEventListener('input', () => { countEl.textContent = textarea.value.length; });

  wall.querySelectorAll('[data-radio-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      textarea.value = btn.dataset.radioPrompt || '';
      countEl.textContent = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  });

  refreshBtn.addEventListener('click', () => loadMessages());
  moreBtn.addEventListener('click', () => loadMessages({append:true}));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setStatus('');
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const message = String(data.get('message') || '').trim();
    const token = String(data.get('cf-turnstile-response') || '').trim();

    if (!name || !message) return setStatus('Name und Funkspruch fehlen noch.', 'error');
    if (!token) return setStatus('Bitte kurz die Sicherheitsprüfung abschließen.', 'error');

    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'ÜBERTRAGE …';

    try {
      const res = await fetch(API + '/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name,message,token})
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) throw new Error('rate');
        if (out.error === 'verification_failed') throw new Error('verify');
        throw new Error('send');
      }

      form.reset();
      countEl.textContent = '0';
      setStatus('Funkspruch angekommen. Signal ist live! 🛸', 'ok');
      if (window.turnstile) window.turnstile.reset();
      await loadMessages();
    } catch (err) {
      if (err.message === 'rate') setStatus('Zu viele Signale auf einmal. Versuch es in ein paar Minuten nochmal.', 'error');
      else if (err.message === 'verify') setStatus('Sicherheitsprüfung fehlgeschlagen. Bitte neu bestätigen.', 'error');
      else setStatus('Übertragung fehlgeschlagen. Versuch es gleich nochmal.', 'error');
      if (window.turnstile) window.turnstile.reset();
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'FUNKSPRUCH SENDEN';
    }
  });

  loadMessages();
})();
