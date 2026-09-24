// A local shopping list for telephone or WhatsApp enquiries. Nothing is sent automatically.
(() => {
  const menu = document.querySelector('#speisekarte');
  if (!menu) return;

  const phone = '4916092870140';
  const key = 'planet-smashburger-call-cart';
  const money = cents => new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'}).format(cents / 100);
  const sauces = ['Area 51', 'Roswell BBQ', 'Planet Mac', 'Käsesauce', 'Käsesauce scharf', 'Joppiesauce', 'Mayonnaise', 'Ketchup', 'Trüffelmayonnaise'];
  const drinks = ['Cola', 'Cola Zero', 'Fanta', 'Fanta Exotic', 'Sprite', 'Wasser mit Kohlensäure', 'Wasser ohne Kohlensäure'];
  let items = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) items = saved.filter(item => typeof item.name === 'string' && Number.isInteger(item.price) && Number.isInteger(item.quantity) && item.quantity > 0).slice(0, 50).map(item => {
      // Correct carts saved before the Veggie surcharge was applied to extra patties.
      const extra = item.detail?.match(/(?:^| · )([1-5]) extra Patty(?= · |$)/);
      let corrected = item;
      if (item.detail?.includes('Veggie-Patty') && extra) {
        corrected = {...item, price: item.price + Number(extra[1]) * 100,
          detail: item.detail.replace(extra[0], extra[0].replace('extra Patty', Number(extra[1]) === 1 ? 'extra Veggie-Patty' : 'extra Veggie-Patties'))};
      }
      const hasCan = drinks.includes(corrected.name) || ['Mit Kohlensäure', 'Ohne Kohlensäure'].includes(corrected.name)
        || corrected.detail?.includes('Menü mit Pommes, ');
      if (hasCan && !corrected.depositIncluded) {
        corrected = {...corrected, price: corrected.price + 25, depositIncluded: true,
          detail: [corrected.detail, 'inkl. 0,25 € Pfand'].filter(Boolean).join(' · ')};
      }
      return corrected;
    });
  } catch (_) { /* Browsers with disabled storage can still use the cart. */ }

  const category = row => row.closest('details')?.querySelector('summary')?.textContent?.trim() || '';
  const price = text => Math.round(Number(text.split('/')[0].replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  const addText = (parent, tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (_) {}
    render();
  };

  const bar = document.createElement('div');
  bar.className = 'order-bar';
  bar.hidden = true;
  bar.innerHTML = '<button type="button" class="order-bar-button" aria-haspopup="dialog">Warenkorb ansehen <span data-order-count></span></button><strong data-order-sum></strong>';
  document.body.append(bar);

  const dialog = document.createElement('dialog');
  dialog.className = 'order-dialog';
  dialog.setAttribute('aria-labelledby', 'order-title');
  document.body.append(dialog);

  const chooser = document.createElement('dialog');
  chooser.className = 'order-dialog order-chooser';
  chooser.setAttribute('aria-labelledby', 'choice-title');
  document.body.append(chooser);

  const closeButton = target => {
    const button = addText(target, 'button', 'Schließen ×', 'order-close');
    button.type = 'button';
    button.addEventListener('click', () => target.close());
  };

  function selectField(form, label, choices) {
    const wrapper = addText(form, 'label', label, 'order-field');
    const select = document.createElement('select');
    for (const option of choices) {
      const child = document.createElement('option');
      child.value = option;
      child.textContent = option;
      select.append(child);
    }
    wrapper.append(select);
    return select;
  }

  function openChooser(row) {
    chooser.replaceChildren();
    closeButton(chooser);
    const name = row.querySelector('h3').textContent.trim();
    const kind = category(row);
    const isBurger = kind.startsWith('Smashburger');
    const form = document.createElement('form');
    form.addEventListener('submit', event => event.preventDefault());
    addText(form, 'h2', name, 'order-title').id = 'choice-title';
    const text = row.querySelector('strong').textContent.trim();
    let cents = price(text);
    let label = name;
    const details = [];
    const variantChoices = {
      'Pommes': ['Klein – 3,50 €', 'Groß – 5,50 €'],
      'Süßkartoffelpommes': ['Klein – 5,50 €', 'Groß – 10,00 €'],
      'Cola, Cola Zero, Fanta, Fanta Exotic, Sprite': ['Cola', 'Cola Zero', 'Fanta', 'Fanta Exotic', 'Sprite'],
      'Wasser mit / ohne': ['Wasser mit Kohlensäure', 'Wasser ohne Kohlensäure']
    };
    const variant = variantChoices[name] ? selectField(form, 'Auswahl', variantChoices[name]) : null;
    let menuToggle, sauce, drink, veggie, patty;
    if (isBurger) {
      const menuLabel = addText(form, 'label', '', 'order-check');
      menuToggle = document.createElement('input');
      menuToggle.type = 'checkbox';
      menuLabel.append(menuToggle, document.createTextNode(' Als Menü: Pommes + Sauce + Getränk (+ 6,25 € inkl. Pfand)'));
      const menuOptions = addText(form, 'div', '', 'order-menu-options');
      menuOptions.hidden = true;
      sauce = selectField(menuOptions, 'Sauce im Menü', sauces);
      drink = selectField(menuOptions, 'Getränk im Menü', drinks);
      menuToggle.addEventListener('change', () => { menuOptions.hidden = !menuToggle.checked; });
      const veggieLabel = addText(form, 'label', '', 'order-check');
      veggie = document.createElement('input');
      veggie.type = 'checkbox';
      veggieLabel.append(veggie, document.createTextNode(' Veggie-Patty statt Rind (+ 1,00 € je Patty)'));
      patty = selectField(form, 'Extra Patty', ['Keins', ...Array.from({length: 5}, (_, index) => {
        const count = index + 1;
        return count + ' extra (+ ' + money(count * 300) + ')';
      })]);
      veggie.addEventListener('change', () => {
        for (let count = 1; count <= 5; count++) {
          patty.options[count].textContent = veggie.checked
            ? count + ' extra Veggie-' + (count === 1 ? 'Patty' : 'Patties') + ' (+ ' + money(count * 400) + ')'
            : count + ' extra (+ ' + money(count * 300) + ')';
        }
      });
    }
    const noteLabel = addText(form, 'label', 'Wünsche für diesen Artikel (optional)', 'order-field');
    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 120;
    note.placeholder = 'z. B. ohne Zwiebeln';
    noteLabel.append(note);
    const add = addText(form, 'button', 'Zum Warenkorb hinzufügen', 'order-submit');
    add.type = 'submit';
    form.addEventListener('submit', () => {
      if (variant) {
        label = name === 'Cola, Cola Zero, Fanta, Fanta Exotic, Sprite' || name === 'Wasser mit / ohne'
          ? variant.value
          : name + ' (' + variant.value.split(' – ')[0] + ')';
        if (name === 'Pommes' && variant.selectedIndex === 1) cents = 550;
        if (name === 'Süßkartoffelpommes' && variant.selectedIndex === 1) cents = 1000;
      }
      if (menuToggle?.checked) {
        cents += 600;
        details.push('Menü mit Pommes, ' + sauce.value + ', ' + drink.value);
      }
      if (veggie?.checked) { cents += (1 + patty.selectedIndex) * 100; details.push('Veggie-Patty'); }
      if (patty && patty.selectedIndex) { cents += patty.selectedIndex * 300; details.push(patty.selectedIndex + (veggie?.checked ? (patty.selectedIndex === 1 ? ' extra Veggie-Patty' : ' extra Veggie-Patties') : ' extra Patty')); }
      if (note.value.trim()) details.push(note.value.trim());
      const hasCan = !!menuToggle?.checked || name === 'Cola, Cola Zero, Fanta, Fanta Exotic, Sprite' || name === 'Wasser mit / ohne';
      if (hasCan) { cents += 25; details.push('inkl. 0,25 € Pfand'); }
      const detail = details.join(' · ');
      const match = items.find(item => item.name === label && item.detail === detail && item.price === cents);
      if (match) match.quantity += 1;
      else items.push({name:label, detail, price:cents, quantity:1, depositIncluded:hasCan});
      persist();
      chooser.close();
      bar.querySelector('button').focus();
    });
    chooser.append(form);
    chooser.showModal();
  }

  menu.querySelectorAll('.menu-item').forEach(row => {
    const button = addText(row, 'button', '+ Hinzufügen', 'order-add');
    button.type = 'button';
    button.setAttribute('aria-label', row.querySelector('h3').textContent.trim() + ' zum Warenkorb hinzufügen');
    button.addEventListener('click', () => openChooser(row));
  });

  const summary = () => items.map(item => item.quantity + '× ' + item.name +
    (item.detail ? ' (' + item.detail + ')' : '') + ' – ' + money(item.price * item.quantity)).join('\n');

  function openCart() {
    dialog.replaceChildren();
    closeButton(dialog);
    addText(dialog, 'h2', 'Dein Warenkorb', 'order-title').id = 'order-title';
    if (!items.length) {
      addText(dialog, 'p', 'Wähle etwas aus der Speisekarte aus.');
      dialog.showModal();
      return;
    }
    const list = addText(dialog, 'ul', '', 'order-list');
    items.forEach((item, index) => {
      const li = addText(list, 'li', '', 'order-line');
      const copy = addText(li, 'div', '', 'order-line-copy');
      addText(copy, 'strong', item.name);
      if (item.detail) addText(copy, 'small', item.detail);
      addText(copy, 'span', money(item.price * item.quantity));
      const controls = addText(li, 'div', '', 'order-quantity');
      for (const [symbol, change, action] of [['−', -1, 'weniger'], ['+', 1, 'mehr']]) {
        const button = addText(controls, 'button', symbol);
        button.type = 'button';
        button.setAttribute('aria-label', item.name + ': ' + action);
        button.addEventListener('click', () => {
          item.quantity += change;
          if (item.quantity < 1) items.splice(index, 1);
          persist();
          openCart();
        });
      }
      addText(controls, 'span', String(item.quantity)).setAttribute('aria-label', 'Anzahl');
    });
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    addText(dialog, 'p', 'Zwischensumme: ' + money(total), 'order-total');
    addText(dialog, 'p', 'Alle Getränke sind Dosen. 0,25 € Pfand je Dose sind in der Zwischensumme enthalten. Preis und Verfügbarkeit bitte beim Anruf bestätigen lassen.', 'order-small');
    addText(dialog, 'p', 'Wichtig: Eine WhatsApp-Nachricht ist noch keine angenommene Bestellung. Deine Bestellung gilt erst, wenn wir sie ausdrücklich bestätigen. Falls du keine Antwort bekommst, ruf bitte an.', 'order-warning');
    const actions = addText(dialog, 'div', '', 'order-actions');
    const whatsapp = addText(actions, 'a', 'Per WhatsApp anfragen ↗', 'order-whatsapp');
    whatsapp.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(
      'Hallo Planet Smashburger, ich möchte Folgendes zur Abholung anfragen:\n\n' +
      summary() + '\nZwischensumme: ' + money(total) + ' (inkl. 0,25 € Pfand je Dose)\n\nBitte bestätigt mir Bestellung, Endpreis und Abholzeit. Mir ist klar, dass die Anfrage ohne eure Antwort noch keine angenommene Bestellung ist.'
    );
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    const call = addText(actions, 'a', 'Jetzt anrufen ↗', 'order-call');
    call.href = 'tel:+' + phone;
    const copy = addText(actions, 'button', 'Liste kopieren', 'order-copy');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(summary());
        copy.textContent = 'Liste kopiert ✓';
      } catch (_) { copy.textContent = 'Kopieren nicht möglich'; }
    });
    addText(dialog, 'p', 'Beim Anrufen öffnet dein Handy die Telefon-App. Die Liste bleibt hier erhalten.', 'order-small');
    if (!dialog.open) dialog.showModal();
  }

  function render() {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    bar.hidden = count === 0;
    bar.querySelector('[data-order-count]').textContent = '(' + count + ')';
    bar.querySelector('[data-order-sum]').textContent = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  }
  bar.querySelector('button').addEventListener('click', openCart);
  render();
})();
