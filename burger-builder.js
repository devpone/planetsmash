// Prices in cents. Burger portions are separate from Loaded Fries and sauce cups.
(() => {
  'use strict';
  const toppings = [
    ['Bacon', 150], ['Spiegelei', 150], ['Jalapeños', 100],
    ['Crunchy Kartoffeln', 150], ['Chili con Carne', 300], ['Parmesan', 150],
    ['Extra geschmorte Zwiebeln', 100], ['Extra Röstzwiebeln', 100]
  ];
  const sauces = ['Area 51', 'Planet Mac', 'Roswell BBQ', 'Käsesoße', 'Scharfe Käsesoße',
    'Trüffelmayonnaise', 'Joppiesoße', 'Mayonnaise', 'Ketchup', 'Grüne Chili-Soße'];
  const money = cents => new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(cents / 100);
  const count = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

  function quote(state) {
    if (!count(state.beef, 6) || !count(state.veggie, 6) || state.beef + state.veggie < 1 || state.beef + state.veggie > 6) {
      return {valid: false, message: 'Wähle insgesamt ein bis sechs Patties.'};
    }
    const extras = state.toppings || {};
    const extraSauces = state.extraSauces || {};
    if (Object.keys(extras).some(name => !toppings.some(([key]) => key === name)) ||
        Object.keys(extraSauces).some(name => !sauces.includes(name)) ||
        [...Object.values(extras), ...Object.values(extraSauces)].some(qty => !count(qty, 3))) {
      return {valid: false, message: 'Bitte prüfe die gewählten Extras.'};
    }
    // Base 8.50 includes one beef patty (3.00); veggie patties cost 4.00 each.
    const price = 550 + state.beef * 300 + state.veggie * 400 + (state.fresh ? 100 : 0) +
      toppings.reduce((sum, [name, cost]) => sum + (extras[name] || 0) * cost, 0) +
      Object.values(extraSauces).reduce((sum, qty) => sum + qty * 100, 0);
    return {valid: true, price};
  }
  window.PSB_BURGER = {quote, toppings, sauces};
  const trigger = document.querySelector('[data-burger-builder]');
  if (!trigger) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'order-dialog burger-builder-dialog';
  dialog.setAttribute('aria-labelledby', 'burger-builder-title');
  document.body.append(dialog);
  let opener;
  dialog.addEventListener('close', () => opener?.focus());

  const text = (parent, tag, value, className) => {
    const el = document.createElement(tag);
    el.textContent = value;
    if (className) el.className = className;
    parent.append(el);
    return el;
  };
  const section = (parent, title) => {
    const el = document.createElement('fieldset');
    el.className = 'builder-section';
    text(el, 'legend', title);
    parent.append(el);
    return el;
  };
  const select = (parent, label, choices, initial = 0) => {
    const wrap = text(parent, 'label', label, 'order-field');
    const el = document.createElement('select');
    choices.forEach(([value, title]) => {
      const option = text(el, 'option', title);
      option.value = value;
    });
    el.selectedIndex = initial;
    wrap.append(el);
    return el;
  };
  const check = (parent, label, checked = false) => {
    const wrap = document.createElement('label');
    wrap.className = 'order-check';
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = checked;
    wrap.append(el, document.createTextNode(label));
    parent.append(wrap);
    return el;
  };
  const quantities = max => Array.from({length: max + 1}, (_, i) => [String(i), String(i)]);

  function open() {
    if (!window.PSB_CART) return;
    opener = document.activeElement;
    dialog.replaceChildren();
    const close = text(dialog, 'button', 'Schließen ×', 'order-close');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    text(dialog, 'h2', 'Bau dir einen', 'order-title').id = 'burger-builder-title';
    text(dialog, 'p', 'Classic-Basis ab 8,50 €: festes Bun, ein Rindfleischpatty, normale Portionen frischer Zutaten, Zwiebeln, Käsesoße und eine Burgersoße. Wähle selbst, was draufkommt. Weniger Zutaten ändern den Grundpreis nicht.', 'order-small');
    const form = document.createElement('form');
    dialog.append(form);

    const patties = section(form, '1 / Deine Patties');
    const beef = select(patties, 'Rindfleisch-Patties · eines inklusive, weitere je +3,00 €', quantities(6), 1);
    const veggie = select(patties, 'Veggie-Patties · je 4,00 €', quantities(6));
    text(patties, 'p', 'Ein bis sechs Patties, auch gemischt. Ein Veggie-Patty statt des enthaltenen Rindfleischpattys kostet 1,00 € mehr.', 'order-small');

    const greens = section(form, '2 / Frisch dazu · inklusive');
    const vegetables = ['Salat', 'Tomate', 'Essiggurken'].map(name => ({name, input: check(greens, name, true)}));
    const onions = select(greens, 'Zwiebeln · normale Portion inklusive', [
      ['Geschmorte Zwiebeln', 'Geschmorte Zwiebeln'], ['Röstzwiebeln', 'Röstzwiebeln'], ['', 'Keine Zwiebeln']
    ]);
    const fresh = check(greens, 'Extra frisch · mehr Salat, Tomate und Gurke (+1,00 €)');

    const included = section(form, '3 / Deine Soßen · inklusive');
    const cheese = select(included, 'Käsesoße', [['Käsesoße', 'Käsesoße'], ['Scharfe Käsesoße', 'Scharfe Käsesoße'], ['', 'Keine Käsesoße']]);
    const sauce = select(included, 'Eine Burgersoße nach Wahl', [...sauces.map(name => [name, name]), ['', 'Keine Burgersoße']]);

    const extras = section(form, '4 / Deine Toppings');
    const toppingFields = toppings.map(([name, cost]) => ({name, input: select(extras, name + ' · je +' + money(cost), quantities(3))}));
    const extraBox = document.createElement('details');
    extraBox.className = 'builder-extra-sauces';
    text(extraBox, 'summary', '5 / Extra Soßen · je Portion +1,00 €');
    form.append(extraBox);
    const sauceFields = sauces.map(name => ({name, input: select(extraBox, name, quantities(3))}));

    const wishes = text(form, 'label', 'Weitere Wünsche (optional)', 'order-field');
    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 120;
    wishes.append(note);
    const footer = text(form, 'div', '', 'builder-total');
    const total = text(footer, 'p', '', 'order-total');
    total.setAttribute('aria-live', 'polite');
    const error = text(footer, 'p', '', 'builder-error');
    error.setAttribute('role', 'status');
    const add = text(footer, 'button', 'Zum Warenkorb hinzufügen', 'order-submit');
    add.type = 'submit';

    const state = () => ({beef: Number(beef.value), veggie: Number(veggie.value), fresh: fresh.checked,
      toppings: Object.fromEntries(toppingFields.map(({name, input}) => [name, Number(input.value)])),
      extraSauces: Object.fromEntries(sauceFields.map(({name, input}) => [name, Number(input.value)]))});
    const update = () => {
      const result = quote(state());
      total.textContent = result.valid ? 'Dein Burger: ' + money(result.price) : 'Bitte Patties auswählen';
      error.textContent = result.valid ? '' : result.message;
      add.disabled = !result.valid;
      return result;
    };
    fresh.addEventListener('change', () => {
      if (fresh.checked) {
        vegetables.forEach(({input}) => { input.checked = true; });
      }
    });
    vegetables.forEach(({input}) => input.addEventListener('change', () => { if (!input.checked) fresh.checked = false; }));
    form.addEventListener('change', update);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const result = update();
      if (!result.valid) return;
      const current = state();
      const description = ['Festes Bun'];
      if (current.beef) description.push(current.beef + '× Rindfleischpatty');
      if (current.veggie) description.push(current.veggie + '× Veggie-Patty');
      description.push('Frische Zutaten: ' + (vegetables.filter(({input}) => input.checked).map(({name}) => name).join(', ') || 'keine'));
      description.push('Zwiebeln: ' + (onions.value || 'keine'));
      description.push('Käsesoße: ' + (cheese.value || 'keine'));
      description.push('Burgersoße: ' + (sauce.value || 'keine'));
      if (current.fresh) description.push('Extra frisch: mehr Salat, Tomate und Gurke');
      for (const [name, qty] of Object.entries(current.toppings)) if (qty) description.push(qty + '× ' + name);
      for (const [name, qty] of Object.entries(current.extraSauces)) if (qty) description.push(qty + '× Extra Soße: ' + name);
      if (note.value.trim()) description.push('Wunsch: ' + note.value.trim());
      if (window.PSB_CART.add({name: 'Dein Burger', detail: description.join(' · '), price: result.price})) {
        dialog.close();
        document.querySelector('.order-bar-button')?.focus();
      }
    });
    update();
    dialog.showModal();
  }
  trigger.addEventListener('click', open);
  trigger.hidden = false;
})();
