(() => {
  const api = String(window.PSB_GUESTBOOK?.apiUrl || '').replace(/\/$/,'');
  const form = document.querySelector('[data-admin-form]');
  const list = document.querySelector('[data-admin-list]');
  const status = document.querySelector('[data-admin-status]');
  let token = '';
  async function load() {
    try {
      const response = await fetch(`${api}/admin/messages`,{headers:{Authorization:`Bearer ${token}`}});
      if (!response.ok) throw new Error(response.status === 401 ? 'Schlüssel ungültig.' : 'Nachrichten nicht erreichbar.');
      const data = await response.json();
      list.replaceChildren();
      status.textContent = `${data.messages.length} sichtbare Funksprüche geladen.`;
      for (const item of data.messages) {
        const article = document.createElement('article'); article.className = 'guestbook-card';
        const name = document.createElement('strong'); name.textContent = item.name;
        const body = document.createElement('p'); body.textContent = item.message;
        const detail = document.createElement('p'); detail.textContent = `${new Date(item.created_at).toLocaleString('de-DE')} · ${item.reports} Meldungen`;
        const remove = document.createElement('button'); remove.className = 'button small'; remove.textContent = 'Ausblenden';
        remove.addEventListener('click', async () => {
          if (!confirm('Diesen Funkspruch wirklich ausblenden?')) return;
          remove.disabled = true;
          try {
            const response = await fetch(`${api}/admin/messages/${encodeURIComponent(item.id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
            if (!response.ok) throw new Error();
            article.remove(); status.textContent = 'Funkspruch ausgeblendet.';
          } catch { remove.disabled = false; status.textContent = 'Ausblenden fehlgeschlagen.'; }
        });
        article.append(name,body,detail,remove); list.append(article);
      }
    } catch (error) { status.textContent = error.message; }
  }
  form.addEventListener('submit',event => {
    event.preventDefault();
    token = form.querySelector('input').value;
    form.querySelector('input').value = '';
    if (!api) { status.textContent = 'Die Nachrichtenwand ist noch nicht verbunden.'; return; }
    load();
  });
})();
