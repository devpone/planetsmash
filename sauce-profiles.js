// Shared sauce help for all menu rows, native selects and dynamically opened builders.
(() => {
  'use strict';
  const tr = text => window.PSB_I18N?.t(text) || text;
  const profiles = [
    {key:'area', name:'Area 51', title:'Haus-Ketchup', notes:'Tomatig · würzig · wild', aliases:['Area 51 (Haus-Ketchup)','Area 51 Sauce','Area 51']},
    {key:'mac', name:'Planet Mac', title:'Haus-Mayo', notes:'Cremig · würzig · leicht säuerlich', aliases:['Planet Mac (Haus-Mayo)','Planet Mac Sauce','Planet Mac']},
    {key:'bbq', name:'Roswell BBQ', title:'BBQ-Soße', notes:'Rauchig · kräftig · leicht süßlich', aliases:['Roswell BBQ Sauce','Roswell BBQ']},
    {key:'hot', name:'Käsesoße scharf', title:'Käsesoße scharf', notes:'Cremig · käsig · mit Chili verfeinert', aliases:['Scharfe Käsesoße','scharfe Käsesauce','Käsesauce scharf','Käsesoße scharf']},
    {key:'cheese', name:'Käsesoße', title:'Käsesoße', notes:'Warm · cremig · vollmundiger Cheddar', aliases:['Käsesauce','Käsesoße']},
    {key:'truffle', name:'Trüffelmayonnaise', title:'Trüffel-Mayonnaise', notes:'Cremig · aromatisch · Trüffelnote', aliases:['Trüffelmayonnaise','Trüffel-Mayonnaise']},
    {key:'joppie', name:'Joppiesoße', title:'Joppiesoße', notes:'Cremig · würzig', aliases:['Joppiesauce','Joppiesoße']},
    {key:'mayo', name:'Mayonnaise', title:'Mayonnaise', notes:'Cremig · mild', aliases:['Mayonnaise','Mayo']},
    {key:'ketchup', name:'Ketchup', title:'Ketchup', notes:'Tomatig · mild · leicht süßlich', aliases:['Ketchup']},
    {key:'chili', name:'Grüne Chili-Soße', title:'Chili-Soße', notes:'Grüne Chili-Note · würzig', aliases:['Grüne Chili-Soße','Chili-Soße']}
  ];
  const aliases = profiles.flatMap(profile => [...new Set(profile.aliases.flatMap(name => [name, tr(name)]))]
    .map(alias => ({alias, profile}))).sort((a,b) => b.alias.length - a.alias.length);
  const find = value => {
    const normalized = String(value || '').toLocaleLowerCase();
    return aliases.find(({alias}) => normalized.includes(alias.toLocaleLowerCase()))?.profile;
  };
  const panel = document.createElement('div');
  panel.id = 'sauce-profile-tooltip';
  panel.className = 'sauce-profile-popover';
  panel.setAttribute('role', 'tooltip');
  panel.hidden = true;
  let active = null, pinned = false, closeTimer;
  const close = () => {
    clearTimeout(closeTimer);
    if (active) { active.setAttribute('aria-expanded','false'); active.removeAttribute('aria-describedby'); }
    active = null; pinned = false; panel.hidden = true;
  };
  const show = (button, pin = false) => {
    clearTimeout(closeTimer);
    const profile = profiles.find(p => p.key === button.dataset.sauceKey);
    if (!profile) return;
    if (active && active !== button) close();
    active = button; pinned = pin;
    panel.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = profile.name === profile.title ? tr(profile.name) : tr(profile.name) + ' · ' + tr(profile.title);
    const notes = document.createElement('p');
    notes.textContent = tr(profile.notes);
    panel.append(title, notes);
    (button.closest('dialog[open]') || document.body).append(panel);
    panel.hidden = false;
    button.setAttribute('aria-expanded','true');
    button.setAttribute('aria-describedby',panel.id);
    const box = button.getBoundingClientRect(), size = panel.getBoundingClientRect();
    const width = document.documentElement.clientWidth, height = window.innerHeight;
    panel.style.left = Math.max(12, Math.min(box.left, width - size.width - 12)) + 'px';
    panel.style.top = (box.bottom + size.height + 10 <= height ? box.bottom + 8 : Math.max(12, box.top - size.height - 8)) + 'px';
  };
  const makeButton = (profile, inline = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sauce-help-button' + (inline ? ' sauce-help-inline' : '');
    button.textContent = '?';
    button.dataset.sauceKey = profile.key;
    button.setAttribute('aria-label', tr('Geschmacksprofil') + ': ' + tr(profile.name));
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls', panel.id);
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') show(button, pinned && active === button); });
    button.addEventListener('pointerleave', () => {
      if (active === button && !pinned && document.activeElement !== button) closeTimer = setTimeout(close, 150);
    });
    button.addEventListener('focus', () => show(button, pinned && active === button));
    button.addEventListener('blur', () => { if (active === button) close(); });
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (active === button && pinned) close(); else show(button, true);
    });
    return button;
  };
  document.addEventListener('pointerdown', event => {
    if (active && event.target !== active && !active.contains(event.target) && !panel.contains(event.target)) close();
  });
  panel.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  panel.addEventListener('pointerleave', () => { if (!pinned && document.activeElement !== active) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && active) { event.preventDefault(); close(); event.stopImmediatePropagation(); } }, true);
  document.addEventListener('scroll', event => { if (!panel.contains(event.target)) close(); }, true);
  document.addEventListener('close', close, true);
  window.addEventListener('resize', close);

  const fields = new WeakMap(), headings = new WeakSet(), paragraphs = new WeakSet();
  function enhanceField(label) {
    if (fields.has(label) || label.closest('.sauce-profile-popover')) return;
    const select = label.querySelector('select');
    const numeric = select && Array.from(select.options).every(option => /^\d+$/.test(option.value));
    const labelText = Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ');
    const profile = select && !numeric ? find(select.value) : find(labelText);
    // An unselected sauce field can gain a profile on its next change.
    if (!profile && !(select && Array.from(select.options).some(option => find(option.value)))) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'sauce-help-field';
    label.before(wrapper); wrapper.append(label);
    const button = makeButton(profile || profiles[0]);
    wrapper.append(button); fields.set(label, button);
    const update = () => {
      const next = select && !numeric ? find(select.value) : find(labelText);
      button.hidden = !next;
      if (!next) { if (active === button) close(); return; }
      button.dataset.sauceKey = next.key;
      const aria = tr('Geschmacksprofil') + ': ' + tr(next.name);
      button.setAttribute('aria-label',aria);
      button.setAttribute('data-source-aria-label',aria);
      if (active === button) show(button,pinned);
    };
    select?.addEventListener('change',update);
    update();
  }
  function scan() {
    document.querySelectorAll('label.order-field, label.order-check').forEach(enhanceField);
    document.querySelectorAll('#speisekarte .menu-item h3').forEach(heading => {
      if (headings.has(heading)) return;
      headings.add(heading);
      const name = heading.dataset.sourceName || heading.textContent.trim();
      const profile = aliases.find(({alias}) => alias.toLocaleLowerCase() === name.toLocaleLowerCase())?.profile;
      if (!profile) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'sauce-help-heading';
      heading.before(wrapper); wrapper.append(heading, makeButton(profile));
    });
    document.querySelectorAll('#speisekarte .menu-item > div > p').forEach(paragraph => {
      if (paragraphs.has(paragraph)) return;
      paragraphs.add(paragraph);
      for (const node of Array.from(paragraph.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        let remaining = node.textContent;
        const fragment = document.createDocumentFragment();
        let changed = false;
        while (remaining) {
          let hit = null;
          for (const {alias, profile} of aliases) {
            const at = remaining.toLocaleLowerCase().indexOf(alias.toLocaleLowerCase());
            if (at >= 0 && (!hit || at < hit.at)) hit = {at,alias,profile};
          }
          if (!hit) { fragment.append(document.createTextNode(remaining)); break; }
          fragment.append(document.createTextNode(remaining.slice(0,hit.at + hit.alias.length)), makeButton(hit.profile,true));
          remaining = remaining.slice(hit.at + hit.alias.length); changed = true;
        }
        if (changed) node.replaceWith(fragment);
      }
    });
  }
  let pending = false;
  const observer = new MutationObserver(records => {
    if (records.every(record => record.target.nodeType === Node.ELEMENT_NODE && record.target.closest('.sauce-profile-popover, .sauce-help-button'))) return;
    if (!pending) { pending = true; queueMicrotask(() => { pending = false; scan(); }); }
  });
  scan();
  observer.observe(document.body,{childList:true,subtree:true});
})();
