(() => {
  const API = 'https://planet-funksprueche.devpone.workers.dev';
  const section = document.querySelector('[data-newsletter]');
  if (!section) return;

  const form = section.querySelector('[data-newsletter-form]');
  const status = section.querySelector('[data-newsletter-status]');
  const submit = section.querySelector('[data-newsletter-submit]');

  function setStatus(message, type = '') {
    status.textContent = message;
    status.className = 'newsletter-status' + (type ? ' ' + type : '');
  }

  async function readiness() {
    try {
      const res = await fetch(API + '/newsletter/status', {cache:'no-store'});
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok === true) section.hidden = false;
    } catch {}
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setStatus('');

    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const consent = form.querySelector('input[name="consent"]');
    const token = String(data.get('cf-turnstile-response') || '').trim();

    if (!email) return setStatus('Bitte gib deine E-Mail-Adresse ein.', 'error');
    if (!consent?.checked) return setStatus('Bitte bestätige die Newsletter-Einwilligung.', 'error');
    if (!token) return setStatus('Bitte kurz die Sicherheitsprüfung abschließen.', 'error');

    submit.disabled = true;
    submit.textContent = 'SENDE BESTÄTIGUNG …';

    try {
      const res = await fetch(API + '/newsletter/subscribe', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email,token})
      });
      const out = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) throw new Error('rate');
        if (out.error === 'verification_failed') throw new Error('verify');
        throw new Error('send');
      }

      form.reset();
      if (window.turnstile) window.turnstile.reset();
      setStatus('Fast geschafft: Bitte öffne jetzt die Bestätigungs-Mail und klicke auf den Link.', 'ok');
    } catch (err) {
      if (err.message === 'rate') setStatus('Zu viele Versuche. Bitte probiere es später noch einmal.', 'error');
      else if (err.message === 'verify') setStatus('Sicherheitsprüfung fehlgeschlagen. Bitte neu bestätigen.', 'error');
      else setStatus('Die Anmeldung konnte gerade nicht gesendet werden. Bitte versuche es später noch einmal.', 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'THE SMASHINGTON POST ABONNIEREN ↗';
    }
  });

  readiness();
})();
