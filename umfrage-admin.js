(() => {
  const API = 'https://planet-funksprueche.devpone.workers.dev';
  const ENDPOINT = API + '/admin/survey/menu-feedback';
  const TOKEN_KEY = 'psb-survey-admin-token';

  const login = document.querySelector('[data-login]');
  const dashboard = document.querySelector('[data-dashboard]');
  const form = document.querySelector('[data-login-form]');
  const tokenInput = document.querySelector('[data-token]');
  const loginStatus = document.querySelector('[data-login-status]');
  const dashboardStatus = document.querySelector('[data-dashboard-status]');
  const refreshBtn = document.querySelector('[data-refresh]');
  const exportBtn = document.querySelector('[data-export]');
  const logoutBtn = document.querySelector('[data-logout]');
  const totalEl = document.querySelector('[data-total]');
  const yesEl = document.querySelector('[data-yes]');
  const noEl = document.querySelector('[data-no]');
  const yesPercentEl = document.querySelector('[data-yes-percent]');
  const noPercentEl = document.querySelector('[data-no-percent]');
  const ratioYes = document.querySelector('[data-ratio-yes]');
  const ratioNo = document.querySelector('[data-ratio-no]');
  const updatedEl = document.querySelector('[data-updated]');
  const responsesEl = document.querySelector('[data-responses]');
  const filters = [...document.querySelectorAll('[data-filter]')];

  let data = null;
  let activeFilter = 'missing';

  function getToken(){
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; }
    catch { return ''; }
  }

  function setToken(value){
    try { sessionStorage.setItem(TOKEN_KEY, value); } catch {}
  }

  function clearToken(){
    try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  }

  function formatDate(value){
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '–';
    return new Intl.DateTimeFormat('de-DE',{
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
    }).format(date);
  }

  function percent(part,total){
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }

  async function fetchData(token){
    const res = await fetch(ENDPOINT,{
      headers:{Authorization:'Bearer ' + token},
      cache:'no-store'
    });

    if(res.status === 401) throw new Error('unauthorized');
    if(!res.ok) throw new Error('request_failed');
    return res.json();
  }

  function render(){
    if(!data) return;

    const summary = data.summary || {};
    const total = Number(summary.total || 0);
    const yes = Number(summary.missing_yes || 0);
    const no = Number(summary.missing_no || 0);
    const yesPct = percent(yes,total);
    const noPct = total > 0 ? 100 - yesPct : 0;

    totalEl.textContent = total.toLocaleString('de-DE');
    yesEl.textContent = yes.toLocaleString('de-DE');
    noEl.textContent = no.toLocaleString('de-DE');
    yesPercentEl.textContent = yesPct + ' %';
    noPercentEl.textContent = noPct + ' %';
    ratioYes.style.width = yesPct + '%';
    ratioNo.style.width = noPct + '%';
    updatedEl.textContent = 'Aktualisiert ' + new Intl.DateTimeFormat('de-DE',{
      hour:'2-digit',minute:'2-digit',second:'2-digit'
    }).format(new Date());

    responsesEl.replaceChildren();
    const rows = Array.isArray(data.responses) ? data.responses : [];
    const visible = activeFilter === 'all' ? rows : rows.filter(row => Number(row.missing) === 1);

    if(!visible.length){
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = activeFilter === 'missing'
        ? 'Noch keine Freitext-Ideen vorhanden.'
        : 'Noch keine Antworten vorhanden.';
      responsesEl.append(p);
      return;
    }

    visible.forEach(row => {
      const item = document.createElement('article');
      item.className = 'response-item';

      const badge = document.createElement('span');
      badge.className = 'response-badge' + (Number(row.missing) === 1 ? '' : ' no');
      badge.textContent = Number(row.missing) === 1 ? 'FEHLT ETWAS' : 'PASST SO';

      const text = document.createElement('p');
      text.className = 'response-text';
      text.textContent = Number(row.missing) === 1
        ? (String(row.answer || '').trim() || 'Keine nähere Angabe')
        : 'Keine Ergänzung gewünscht';

      const date = document.createElement('time');
      date.className = 'response-date';
      date.dateTime = row.created_at || '';
      date.textContent = formatDate(row.created_at);

      item.append(badge,text,date);
      responsesEl.append(item);
    });
  }

  async function load(token,{initial=false}={}){
    if(!token) return;
    refreshBtn.disabled = true;
    exportBtn.disabled = true;
    const status = initial ? loginStatus : dashboardStatus;
    status.textContent = 'Daten werden geladen …';

    try{
      data = await fetchData(token);
      setToken(token);
      login.hidden = true;
      dashboard.hidden = false;
      refreshBtn.disabled = false;
      exportBtn.disabled = false;
      loginStatus.textContent = '';
      dashboardStatus.textContent = '';
      render();
    }catch(err){
      refreshBtn.disabled = true;
      exportBtn.disabled = true;
      if(err.message === 'unauthorized'){
        clearToken();
        dashboard.hidden = true;
        login.hidden = false;
        loginStatus.textContent = 'Admin-Token ist nicht gültig.';
        tokenInput.focus();
      }else{
        status.textContent = 'Die Umfragedaten konnten gerade nicht geladen werden.';
      }
    }
  }

  function csvCell(value){
    return '"' + String(value ?? '').replace(/"/g,'""') + '"';
  }

  function exportCsv(){
    if(!data || !Array.isArray(data.responses)) return;
    const rows = [['Antwort','Fehlt etwas','Text','Zeitpunkt']];
    data.responses.forEach((row,index) => {
      rows.push([
        index + 1,
        Number(row.missing) === 1 ? 'Ja' : 'Nein',
        row.answer || '',
        row.created_at || ''
      ]);
    });
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planet-smashburger-umfrage-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  form.addEventListener('submit',event => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    if(token) load(token,{initial:true});
  });

  refreshBtn.addEventListener('click',() => load(getToken()));
  exportBtn.addEventListener('click',exportCsv);

  logoutBtn.addEventListener('click',() => {
    clearToken();
    data = null;
    dashboard.hidden = true;
    login.hidden = false;
    refreshBtn.disabled = true;
    exportBtn.disabled = true;
    tokenInput.value = '';
    loginStatus.textContent = 'Token aus diesem Browser-Tab entfernt.';
    tokenInput.focus();
  });

  filters.forEach(button => {
    button.addEventListener('click',() => {
      activeFilter = button.dataset.filter;
      filters.forEach(item => item.classList.toggle('is-active', item === button));
      render();
    });
  });

  const saved = getToken();
  if(saved) load(saved,{initial:true});
})();
