// The original German text remains the source of truth for prices and product IDs.
(() => {
  const langs = ['de', 'en', 'tr', 'ar', 'es', 'ku'];
  const names = {de:'Deutsch', en:'English', tr:'Türkçe', ar:'العربية', es:'Español', ku:'Kurmancî'};
  const query = new URLSearchParams(location.search);
  const lang = langs.includes(query.get('lang')) ? query.get('lang') : 'de';
  document.documentElement.lang = lang === 'ku' ? 'kmr' : lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const translations = window.PSB_TRANSLATIONS || {};
  const dict = translations[lang] || {};
  const source = new WeakMap();
  const output = new WeakMap();
  const t = value => {
    if (dict[value]) return dict[value];
    let match = value.match(/^(.+) zum Warenkorb hinzufügen$/);
    if (match) return t(match[1]) + ' ' + t('zum Warenkorb hinzufügen');
    match = value.match(/^(.+): (weniger|mehr)$/);
    if (match) return t(match[1]) + ': ' + t(match[2]);
    match = value.match(/^Warenkorb ansehen (\(\d+\))$/);
    if (match) return t('Warenkorb ansehen') + ' ' + match[1];
    match = value.match(/^Heute ab (\d+) Uhr geöffnet$/);
    if (match) return t('Heute ab {h} Uhr geöffnet').replace('{h}', match[1]);
    match = value.match(/^Jetzt geöffnet · bis (\d+) Uhr$/);
    if (match) return t('Jetzt geöffnet · bis {h} Uhr').replace('{h}', match[1]);
    match = value.match(/^(Heute Ruhetag|Jetzt geschlossen) · (morgen|Sonntag|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag) ab (\d+) Uhr$/);
    if (match) return t(match[1] + ' · {day} ab {h} Uhr').replace('{day}', t(match[2])).replace('{h}', match[3]);
    match = value.match(/^(Öffnet in|Schließt in) ((?:\d+T )?\d\d:\d\d:\d\d)$/);
    if (match) return t(match[1]) + ' ' + match[2];
    return value;
  };
  window.PSB_I18N = {lang, t, names};

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('script, style, .language-switch')) return;
      if (!source.has(node) || (output.has(node) && node.nodeValue !== output.get(node))) source.set(node, node.nodeValue);
      const original = source.get(node);
      const key = original.trim();
      if (!key) return;
      const translated = t(key);
      if (translated !== key) {
        const start = original.match(/^\s*/)[0], end = original.match(/\s*$/)[0];
        const next = start + translated + end;
        output.set(node, next);
        if (node.nodeValue !== next) node.nodeValue = next;
      } else output.set(node, node.nodeValue);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches('script, style, .language-switch')) return;
    for (const attr of ['aria-label', 'alt', 'placeholder', 'title', 'content']) {
      if (!node.hasAttribute(attr)) continue;
      const original = node.getAttribute('data-source-' + attr) || node.getAttribute(attr);
      if (!node.hasAttribute('data-source-' + attr)) node.setAttribute('data-source-' + attr, original);
      const translated = t(original);
      if (translated !== original) node.setAttribute(attr, translated);
    }
    for (const child of node.childNodes) translateNode(child);
  }

  function languageLink(code) {
    const link = document.createElement('a');
    const target = new URL(location.href);
    if (code === 'de') target.searchParams.delete('lang');
    else target.searchParams.set('lang', code);
    link.href = target.pathname + target.search + target.hash;
    link.lang = code === 'ku' ? 'kmr' : code;
    link.textContent = names[code];
    if (code === lang) link.setAttribute('aria-current', 'true');
    return link;
  }
  function switcher() {
    const details = document.createElement('details');
    details.className = 'language-switch';
    const summary = document.createElement('summary');
    summary.textContent = '🌐 ' + names[lang];
    summary.setAttribute('aria-label', t('Sprache wählen') + ': ' + names[lang]);
    details.append(summary);
    const options = document.createElement('div');
    options.className = 'language-options';
    for (const code of langs) options.append(languageLink(code));
    details.append(options);
    return details;
  }

  // Keep links within the site in the visitor's chosen language.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.closest('.language-switch') || lang === 'de') return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/\.(?:html)?$/.test(url.pathname) && url.pathname !== '/') return;
    url.searchParams.set('lang', lang);
    link.href = url.pathname + url.search + url.hash;
  }, true);

  document.querySelectorAll('#speisekarte .menu-item h3').forEach(el => { el.dataset.sourceName = el.textContent.trim(); });
  translateNode(document.documentElement);
  const header = document.querySelector('header.header');
  const footer = document.querySelector('footer');
  if (header) header.append(switcher());
  else document.querySelector('main')?.prepend(switcher());
  if (footer) footer.append(switcher());
  else document.querySelector('main')?.append(switcher());
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') translateNode(record.target);
      else for (const node of record.addedNodes) translateNode(node);
    }
  });
  observer.observe(document.body, {childList:true, characterData:true, subtree:true});
})();
