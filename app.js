// PalGate PWA — App Logic

const STORAGE_KEY = 'palgate_config';
const NAMES_KEY   = 'palgate_names';
let pollTimer = null;

// ---------- Storage ----------

function getConfig() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveConfig(cfg) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
function clearConfig()   { localStorage.removeItem(STORAGE_KEY); }

function getCustomNames() {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY)) || {}; } catch { return {}; }
}
function saveCustomName(deviceId, name) {
  const names = getCustomNames();
  names[deviceId] = name;
  localStorage.setItem(NAMES_KEY, JSON.stringify(names));
}
function getDisplayName(deviceId, apiName) {
  return getCustomNames()[deviceId] || apiName;
}

// ---------- Screen management ----------

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
function showOverlay(text) {
  document.getElementById('overlay-text').textContent = text;
  document.getElementById('overlay').classList.remove('hidden');
}
function hideOverlay() { document.getElementById('overlay').classList.add('hidden'); }
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : ' success');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// ---------- API proxy ----------

async function apiCall(endpoint, cfg) {
  const token = generateToken(cfg.token, cfg.phone, cfg.tokenType);
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, token })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- Gate screen ----------

async function loadGates(cfg) {
  show('screen-gate');
  const container = document.getElementById('gates-container');
  container.innerHTML = '<p class="status-text">Loading gates...</p>';

  try {
    const data = await apiCall('devices/', cfg);
    // API returns { devices: [...] }, each with id and name1
    const devices = Array.isArray(data) ? data : (data.devices || data.data || []);

    if (!devices.length) {
      container.innerHTML = '<p class="status-text">No gates found.</p>';
      return;
    }

    container.innerHTML = '';
    devices.forEach(device => {
      const id      = device.id || device._id || device.deviceId || '';
      const apiName = device.name1 || device.name || device.title || id || 'Gate';
      renderGateBtn(container, id, apiName, cfg);
    });
  } catch (err) {
    container.innerHTML = `<p class="status-text error-text">Error: ${escHtml(err.message)}</p>`;
  }
}

function renderGateBtn(container, id, apiName, cfg) {
  const displayName = getDisplayName(id, apiName);
  const wrap = document.createElement('div');
  wrap.className = 'gate-btn';
  wrap.dataset.deviceId = id;
  wrap.innerHTML = `
    <svg class="gate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="18" rx="1"/>
      <rect x="14" y="3" width="7" height="18" rx="1"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
    <span class="gate-name">${escHtml(displayName)}</span>
    <button class="rename-btn" title="Rename">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>`;

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.rename-btn')) return;
    openGate(id, getDisplayName(id, apiName), cfg);
  });

  wrap.querySelector('.rename-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const cur = getDisplayName(id, apiName);
    const newName = prompt('Rename gate:', cur);
    if (newName && newName.trim()) {
      saveCustomName(id, newName.trim());
      wrap.querySelector('.gate-name').textContent = newName.trim();
    }
  });

  container.appendChild(wrap);
}

async function openGate(deviceId, name, cfg) {
  showOverlay(`Opening ${name}...`);
  try {
    await apiCall(`device/${deviceId}/open-gate?outputNum=1`, cfg);
    hideOverlay();
    showToast('Gate opened!', false);
  } catch (err) {
    hideOverlay();
    showToast(err.message, true);
  }
}

// ---------- QR linking ----------

async function startLinking() {
  const uniqueId = crypto.randomUUID();
  const qrData   = JSON.stringify({ id: uniqueId });

  show('screen-qr');
  document.getElementById('qr-status').textContent = 'Waiting for scan...';

  const container = document.getElementById('qr-container');
  container.innerHTML = '';

  try {
    new QRCode(container, {
      text: qrData,
      width: 220,
      height: 220,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (e) {
    container.innerHTML = `<pre class="qr-fallback">${escHtml(qrData)}</pre>`;
  }

  pollTimer = setInterval(async () => {
    try {
      const res  = await fetch(`/api/link-poll?id=${uniqueId}`);
      const data = await res.json();
      if (data.user && data.secondary !== undefined) {
        clearInterval(pollTimer);
        pollTimer = null;
        const cfg = {
          phone:     data.user.id,
          token:     data.user.token,
          tokenType: parseInt(data.secondary, 10)
        };
        saveConfig(cfg);
        document.getElementById('qr-status').textContent = 'Linked! Loading gates...';
        await loadGates(cfg);
      }
    } catch { /* keep polling */ }
  }, 3000);
}

function cancelLinking() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  show('screen-setup');
}

// ---------- Manual setup ----------

function showManual() {
  show('screen-manual');
  document.getElementById('m-phone').value  = '';
  document.getElementById('m-token').value  = '';
  document.getElementById('m-type').value   = '2';
  document.getElementById('m-device').value = '';
}

async function saveManual() {
  const phone     = document.getElementById('m-phone').value.trim();
  const token     = document.getElementById('m-token').value.trim();
  const tokenType = parseInt(document.getElementById('m-type').value, 10);
  const deviceId  = document.getElementById('m-device').value.trim();

  if (!phone || !token || !deviceId) { showToast('Fill in all fields', true); return; }
  if (!/^[0-9a-fA-F]{32}$/.test(token)) { showToast('Token must be 32 hex characters', true); return; }

  const cfg = { phone: parseInt(phone, 10), token, tokenType };
  try { generateToken(token, parseInt(phone, 10), tokenType); }
  catch (err) { showToast(`Invalid credentials: ${err.message}`, true); return; }

  saveConfig(cfg);

  show('screen-gate');
  const container = document.getElementById('gates-container');
  container.innerHTML = '';
  renderGateBtn(container, deviceId, deviceId, cfg);
}

// ---------- Settings ----------

function unlinkDevice() {
  if (!confirm('Unlink device? You will need to link again.')) return;
  clearConfig();
  show('screen-setup');
}

// ---------- Utils ----------

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Boot ----------

function init() {
  document.getElementById('btn-link').addEventListener('click', startLinking);
  document.getElementById('btn-manual').addEventListener('click', showManual);
  document.getElementById('btn-cancel-qr').addEventListener('click', cancelLinking);
  document.getElementById('btn-cancel-manual').addEventListener('click', () => show('screen-setup'));
  document.getElementById('btn-save-manual').addEventListener('click', saveManual);
  document.getElementById('btn-unlink').addEventListener('click', unlinkDevice);
  document.getElementById('btn-refresh').addEventListener('click', () => {
    const cfg = getConfig(); if (cfg) loadGates(cfg);
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  const cfg = getConfig();
  if (cfg) loadGates(cfg); else show('screen-setup');
}

document.addEventListener('DOMContentLoaded', init);
