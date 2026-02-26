const KEYS = { servers: 'rustops.servers', selected: 'rustops.selected' };
const defaultTabs = ['overview', 'players', 'groups', 'plugins', 'console', 'automation'];
const state = {
  servers: JSON.parse(localStorage.getItem(KEYS.servers) || '[]'),
  selectedId: localStorage.getItem(KEYS.selected) || null,
  activeTab: 'overview',
  connected: false,
  lastData: { status: null, players: [], groups: [], plugins: [] },
  consoleLog: []
};

const el = (id) => document.getElementById(id);
const serverList = el('serverList');
const serverCount = el('serverCount');
const activeServerName = el('activeServerName');
const activeServerMeta = el('activeServerMeta');
const kpiGrid = el('kpiGrid');
const tabs = el('tabs');
const tabContent = el('tabContent');
const connectBtn = el('connectBtn');
const disconnectBtn = el('disconnectBtn');

const modal = el('serverModal');
const inputs = {
  name: el('srvName'), host: el('srvHost'), port: el('srvPort'), password: el('srvPassword'), feed: el('srvFeed')
};
let editingId = null;

function uid() { return Math.random().toString(36).slice(2, 10); }
function persist() {
  localStorage.setItem(KEYS.servers, JSON.stringify(state.servers));
  if (state.selectedId) localStorage.setItem(KEYS.selected, state.selectedId);
}
function currentServer() { return state.servers.find((s) => s.id === state.selectedId) || null; }
function setSelected(id) { state.selectedId = id; persist(); render(); }

function renderServers() {
  serverList.innerHTML = '';
  serverCount.textContent = `${state.servers.length} total`;
  for (const server of state.servers) {
    const li = document.createElement('li');
    li.className = `server-item ${server.id === state.selectedId ? 'active' : ''}`;
    li.innerHTML = `<div class="font-medium">${server.name}</div><div class="text-xs text-slate-400">${server.host}:${server.port}</div>`;
    li.onclick = () => setSelected(server.id);
    li.oncontextmenu = (event) => {
      event.preventDefault();
      if (confirm(`Delete server profile ${server.name}?`)) {
        state.servers = state.servers.filter((s) => s.id !== server.id);
        if (state.selectedId === server.id) state.selectedId = state.servers[0]?.id || null;
        persist();
        render();
      }
    };
    serverList.appendChild(li);
  }
}

function renderHeader() {
  const server = currentServer();
  if (!server) {
    activeServerName.textContent = 'No server selected';
    activeServerMeta.textContent = 'Select or add a server to begin.';
    connectBtn.disabled = true;
    disconnectBtn.disabled = true;
    return;
  }
  activeServerName.textContent = server.name;
  activeServerMeta.textContent = `${server.host}:${server.port} • ${state.connected ? 'Connected' : 'Disconnected'}`;
  connectBtn.disabled = state.connected;
  disconnectBtn.disabled = !state.connected;
}

function renderKPIs() {
  const status = state.lastData.status || {};
  const players = state.lastData.players || [];
  const plugins = state.lastData.plugins || [];
  const staleCount = plugins.filter((p) => p.outdated).length;
  const cards = [
    ['Players Online', status.players ?? players.length],
    ['Queued', status.queue ?? 0],
    ['Plugins', plugins.length],
    ['Outdated Plugins', staleCount]
  ];
  kpiGrid.innerHTML = cards.map(([label, value]) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`).join('');
}

function renderTabs() {
  tabs.innerHTML = defaultTabs.map((t) => `<button class="tab-btn ${state.activeTab === t ? 'active' : ''}" data-tab="${t}">${t[0].toUpperCase()}${t.slice(1)}</button>`).join('');
  for (const b of tabs.querySelectorAll('button')) b.onclick = () => { state.activeTab = b.dataset.tab; renderTabContent(); renderTabs(); };
}

function renderTable(headers, rows) {
  return `<div class="overflow-auto"><table class="table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}" class="text-slate-400">No data yet.</td></tr>`}</tbody></table></div>`;
}

function renderTabContent() {
  if (state.activeTab === 'overview') {
    tabContent.innerHTML = `
      <div class="grid md:grid-cols-2 gap-3">
        <div class="panel p-3"><h3 class="font-semibold mb-2">Connection checklist</h3><ul class="text-sm text-slate-300 list-disc pl-5 space-y-1"><li>RCON enabled and websocket port open.</li><li>Use strong passwords for each server profile.</li><li>Set optional plugin feed endpoint for update checks.</li></ul></div>
        <div class="panel p-3"><h3 class="font-semibold mb-2">Quick commands</h3><div class="flex flex-wrap gap-2">${['status','global.status','players','oxide.show groups','oxide.plugins'].map((c)=>`<button class="btn-secondary qc" data-cmd="${c}">${c}</button>`).join('')}</div></div>
      </div>
      <div class="mt-3 panel p-3"><h3 class="font-semibold mb-2">Recent console output</h3><pre class="text-xs text-slate-300 whitespace-pre-wrap">${state.consoleLog.slice(-8).join('\n') || 'No console output yet.'}</pre></div>`;
    tabContent.querySelectorAll('.qc').forEach((b) => b.onclick = () => runCommand(b.dataset.cmd));
    return;
  }

  if (state.activeTab === 'players') {
    const rows = state.lastData.players.map((p) => `<tr><td>${p.name}</td><td>${p.id}</td><td>${p.ping ?? '-'}</td><td>${p.address ?? '-'}</td><td><button class="btn-secondary kick" data-id="${p.id}">Kick</button></td></tr>`);
    tabContent.innerHTML = renderTable(['Name', 'SteamID', 'Ping', 'IP', 'Actions'], rows);
    tabContent.querySelectorAll('.kick').forEach((b) => b.onclick = () => runCommand(`kick ${b.dataset.id} "Kicked by RustOps"`));
    return;
  }

  if (state.activeTab === 'groups') {
    const rows = state.lastData.groups.map((g) => `<tr><td>${g.player}</td><td>${g.group}</td><td>${g.rank ?? '-'}</td><td>${g.title ?? '-'}</td></tr>`);
    tabContent.innerHTML = `${renderTable(['Player', 'Group', 'Rank', 'Title'], rows)}<div class="mt-3 flex gap-2"><input id="groupCmd" class="input flex-1" placeholder="oxide.usergroup add 7656119... vip" /><button id="groupRun" class="btn-primary">Run</button></div>`;
    el('groupRun').onclick = () => runCommand(el('groupCmd').value.trim());
    return;
  }

  if (state.activeTab === 'plugins') {
    const rows = state.lastData.plugins.map((p) => `<tr><td>${p.name}</td><td>${p.currentVersion ?? '-'}</td><td>${p.latestVersion ?? '-'}</td><td><span class="badge ${p.outdated ? 'warn' : 'ok'}">${p.outdated ? 'outdated' : 'current'}</span></td></tr>`);
    tabContent.innerHTML = `${renderTable(['Plugin', 'Installed', 'Latest', 'Status'], rows)}<div class="mt-3"><button id="pluginRefresh" class="btn-primary">Check Updates</button></div>`;
    el('pluginRefresh').onclick = refreshPlugins;
    return;
  }

  if (state.activeTab === 'console') {
    tabContent.innerHTML = `<textarea id="consoleOut" readonly>${state.consoleLog.join('\n')}</textarea><div class="mt-2 flex gap-2"><input id="consoleIn" class="input flex-1" placeholder="say Server restart in 15 minutes"/><button id="consoleSend" class="btn-primary">Send</button></div>`;
    el('consoleSend').onclick = () => runCommand(el('consoleIn').value.trim());
    return;
  }

  if (state.activeTab === 'automation') {
    tabContent.innerHTML = `<div class="grid md:grid-cols-2 gap-3"><div><h3 class="font-semibold mb-2">Broadcast</h3><input id="autoMessage" class="input w-full" placeholder="Server restart in 10 minutes"/><button id="sendBroadcast" class="btn-primary mt-2">Send chat broadcast</button></div><div><h3 class="font-semibold mb-2">Maintenance macros</h3><div class="flex flex-wrap gap-2"><button class="btn-secondary macro" data-cmd="save">Save</button><button class="btn-secondary macro" data-cmd="server.writecfg">Write cfg</button><button class="btn-secondary macro" data-cmd="oxide.reload *">Reload all plugins</button></div></div></div>`;
    el('sendBroadcast').onclick = () => runCommand(`say ${el('autoMessage').value.trim()}`);
    tabContent.querySelectorAll('.macro').forEach((b) => b.onclick = () => runCommand(b.dataset.cmd));
  }
}

async function api(path, payload) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function parsePlayers(text) {
  const lines = text.split('\n').map((x) => x.trim()).filter(Boolean);
  return lines.map((line) => {
    const m = line.match(/^(\d+)\s+(.+?)\s+\((\d+)\)/) || line.match(/^(.+?)\s+\((\d+)\)/);
    if (!m) return null;
    if (m.length === 4) return { id: m[1], name: m[2], ping: Number(m[3]) };
    return { id: m[2], name: m[1] };
  }).filter(Boolean);
}

function parseGroups(text) {
  const lines = text.split('\n').map((x) => x.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    const m = line.match(/(.+?)\s*[:\-]>\s*(\w+)\s*\(?rank:?\s*(\d+)?\)?/i);
    if (m) entries.push({ player: m[1], group: m[2], rank: m[3] || null, title: '' });
  }
  return entries;
}

async function runCommand(command) {
  if (!command) return;
  const server = currentServer();
  if (!server) return alert('Select a server first.');
  try {
    const out = await api('/.netlify/functions/rcon', { host: server.host, port: server.port, password: server.password, command });
    state.consoleLog.push(`> ${command}\n${out.output || '[no output]'}`);
    if (state.consoleLog.length > 250) state.consoleLog = state.consoleLog.slice(-250);
    if (command.includes('players')) state.lastData.players = parsePlayers(out.output || '');
    if (command.includes('oxide.show') && command.includes('group')) state.lastData.groups = parseGroups(out.output || '');
    if (command.includes('status')) {
      const pm = (out.output || '').match(/players\s*:?\s*(\d+)/i);
      const qm = (out.output || '').match(/queue\s*:?\s*(\d+)/i);
      state.lastData.status = { players: pm ? Number(pm[1]) : state.lastData.players.length, queue: qm ? Number(qm[1]) : 0 };
    }
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function refreshPlugins() {
  const server = currentServer();
  if (!server) return;
  try {
    const rcon = await api('/.netlify/functions/rcon', { host: server.host, port: server.port, password: server.password, command: 'oxide.plugins' });
    const pluginLines = (rcon.output || '').split('\n').filter((x) => x.trim());
    const plugins = pluginLines.map((line) => {
      const m = line.match(/^(.+?)\s+v?(\d[\w\.-]*)/);
      return m ? { name: m[1].trim(), currentVersion: m[2] } : null;
    }).filter(Boolean);

    const check = await api('/.netlify/functions/plugins', { feed: server.feed, plugins });
    state.lastData.plugins = check.plugins || plugins;
    state.consoleLog.push('Plugin update check complete.');
    render();
  } catch (err) {
    alert(`Plugin check failed: ${err.message}`);
  }
}

async function refreshAll() {
  await runCommand('status');
  await runCommand('players');
  await runCommand('oxide.show groups');
  await refreshPlugins();
}

function connect() {
  state.connected = true;
  render();
}
function disconnect() {
  state.connected = false;
  render();
}

function openModal(server = null) {
  editingId = server?.id || null;
  inputs.name.value = server?.name || '';
  inputs.host.value = server?.host || '';
  inputs.port.value = server?.port || 28016;
  inputs.password.value = server?.password || '';
  inputs.feed.value = server?.feed || '';
  modal.classList.remove('hidden');
}
function closeModal() { modal.classList.add('hidden'); }

function saveServer() {
  const profile = {
    id: editingId || uid(),
    name: inputs.name.value.trim() || 'Rust Server',
    host: inputs.host.value.trim(),
    port: Number(inputs.port.value || 28016),
    password: inputs.password.value,
    feed: inputs.feed.value.trim()
  };
  if (!profile.host || !profile.password) return alert('Host and password are required.');
  const exists = state.servers.findIndex((s) => s.id === profile.id);
  if (exists >= 0) state.servers[exists] = profile;
  else state.servers.push(profile);
  state.selectedId = profile.id;
  persist();
  closeModal();
  render();
}

function render() {
  renderServers();
  renderHeader();
  renderKPIs();
  renderTabs();
  renderTabContent();
}

el('addServerBtn').onclick = () => openModal();
el('refreshAllBtn').onclick = refreshAll;
connectBtn.onclick = connect;
disconnectBtn.onclick = disconnect;
el('saveServerBtn').onclick = saveServer;
el('cancelServerBtn').onclick = closeModal;

if (!state.selectedId && state.servers[0]) state.selectedId = state.servers[0].id;
render();
