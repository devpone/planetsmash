// Loaded Fries: size changes the base price, never the topping portion or price.
(() => {
  'use strict';
  const bases = {
    pommes: {name: 'Pommes', normal: 350, big: 550},
    sweet: {name: 'Süßkartoffel-Pommes', normal: 550, big: 1000}
  };
  const toppings = [
    ['Hackfleisch', 300], ['Veganes Hackfleisch', 400], ['Chili con Carne', 300],
    ['Parmesan', 250], ['Bacon', 150], ['Spiegelei', 150], ['Jalapeños', 150],
    ['Geschmorte Zwiebeln', 150], ['Röstzwiebeln', 150]
  ];
  const sauces = ['Area 51', 'Planet Mac', 'Roswell BBQ', 'Käsesoße', 'Scharfe Käsesoße',
    'Trüffelmayonnaise', 'Joppiesoße', 'Mayonnaise', 'Ketchup', 'Grüne Chili-Soße'];
  const money = cents => new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(cents / 100);
  function quote(state) {
    if (!Object.hasOwn(bases, state.base) || !['normal', 'big'].includes(state.size)) return {valid: false};
    const extra = state.toppings || {}, sauce = state.sauces || {};
    if (Object.keys(extra).some(name => !toppings.some(([key]) => key === name)) ||
        Object.keys(sauce).some(name => !sauces.includes(name)) ||
        [...Object.values(extra), ...Object.values(sauce)].some(qty => !Number.isInteger(qty) || qty < 0 || qty > 3)) return {valid: false};
    return {valid: true, price: bases[state.base][state.size] +
      toppings.reduce((sum, [name, price]) => sum + (extra[name] || 0) * price, 0) +
      Object.values(sauce).reduce((sum, qty) => sum + qty * 150, 0)};
  }
  window.PSB_FRIES = {bases, toppings, sauces, quote};
  const trigger = document.querySelector('[data-fries-builder]');
  if (!trigger) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'order-dialog fries-builder-dialog';
  dialog.setAttribute('aria-labelledby', 'fries-builder-title');
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
  const select = (parent, label, options) => {
    const wrap = text(parent, 'label', label, 'order-field');
    const el = document.createElement('select');
    options.forEach(([value, title]) => { const option = text(el, 'option', title); option.value = value; });
    wrap.append(el);
    return el;
  };
  const quantities = Array.from({length: 4}, (_, i) => [String(i), String(i)]);
  function open() {
    if (!window.PSB_CART) return;
    opener = document.activeElement;
    dialog.replaceChildren();
    const close = text(dialog, 'button', 'Schließen ×', 'order-close');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    text(dialog, 'h2', 'Bau deine Loaded Fries', 'order-title').id = 'fries-builder-title';
    text(dialog, 'p', 'Wähle deine Pommes und stelle dir Soßen und Toppings selbst zusammen. Toppings haben bei Normal und Big dieselbe Portion und denselben Preis.', 'order-small');
    const form = document.createElement('form');
    dialog.append(form);
    const baseBox = section(form, '1 / Deine Pommes');
    const base = select(baseBox, 'Pommesart', Object.entries(bases).map(([key, value]) => [key, value.name]));
    const size = select(baseBox, 'Portionsgröße', [['normal', 'Normal · 3,50 €'], ['big', 'Big · 5,50 €']]);
    const sauceBox = section(form, '2 / Deine Soßen · je Portion +1,50 €');
    const sauceFields = sauces.map(name => ({name, input: select(sauceBox, name, quantities)}));
    const toppingBox = section(form, '3 / Deine Toppings');
    const toppingFields = toppings.map(([name, price]) => ({name, input: select(toppingBox, name + ' · je +' + money(price), quantities)}));
    const noteBox = text(form, 'label', 'Weitere Wünsche (optional)', 'order-field');
    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 120;
    noteBox.append(note);
    const footer = text(form, 'div', '', 'builder-total');
    const total = text(footer, 'p', '', 'order-total');
    total.setAttribute('aria-live', 'polite');
    const add = text(footer, 'button', 'Zum Warenkorb hinzufügen', 'order-submit');
    add.type = 'submit';
    const state = () => ({base: base.value, size: size.value,
      toppings: Object.fromEntries(toppingFields.map(({name, input}) => [name, Number(input.value)])),
      sauces: Object.fromEntries(sauceFields.map(({name, input}) => [name, Number(input.value)]))});
    const update = () => {
      const result = quote(state());
      total.textContent = result.valid ? 'Deine Loaded Fries: ' + money(result.price) : 'Bitte Auswahl prüfen';
      add.disabled = !result.valid;
      return result;
    };
    base.addEventListener('change', () => {
      const prices = bases[base.value];
      size.options[0].textContent = 'Normal · ' + money(prices.normal);
      size.options[1].textContent = 'Big · ' + money(prices.big);
    });
    form.addEventListener('change', update);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const result = update();
      if (!result.valid) return;
      const current = state();
      const description = [bases[current.base].name + ' ' + (current.size === 'big' ? 'Big' : 'Normal')];
      const selectedSauces = Object.entries(current.sauces).filter(([, qty]) => qty);
      description.push('Soßen: ' + (selectedSauces.map(([name, qty]) => qty + '× ' + name).join(', ') || 'keine'));
      const selectedToppings = Object.entries(current.toppings).filter(([, qty]) => qty);
      description.push('Toppings: ' + (selectedToppings.map(([name, qty]) => qty + '× ' + name).join(', ') || 'keine'));
      if (note.value.trim()) description.push('Wunsch: ' + note.value.trim());
      if (window.PSB_CART.add({name: 'Deine Loaded Fries', detail: description.join(' · '), price: result.price})) {
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
