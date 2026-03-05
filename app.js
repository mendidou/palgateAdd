// PalGate PWA — App Logic

const STORAGE_KEY = 'palgate_config';
let pollTimer = null;

// ---------- Storage ----------

function getConfig() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
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

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
}

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
    // API may return array directly or wrapped
    const devices = Array.isArray(data) ? data : (data.devices || data.data || []);

    if (!devices.length) {
      container.innerHTML = '<p class="status-text">No gates found.</p>';
      return;
    }

    container.innerHTML = '';
    devices.forEach(device => {
      const id   = device.id   || device._id   || device.deviceId   || '';
      const name = device.name || device.title || device.label || id || 'Gate';
      const btn  = document.createElement('button');
      btn.className = 'gate-btn';
      btn.innerHTML = `
        <svg class="gate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="18" rx="1"/>
          <rect x="14" y="3" width="7" height="18" rx="1"/>
          <line x1="10" y1="12" x2="14" y2="12"/>
        </svg>
        <span class="gate-name">${escHtml(name)}</span>
        <svg class="gate-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>`;
      btn.addEventListener('click', () => openGate(id, name, cfg));
      container.appendChild(btn);
    });
  } catch (err) {
    container.innerHTML = `<p class="status-text error-text">Error: ${escHtml(err.message)}</p>`;
  }
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

  // Render QR via qrcodejs (loaded from CDN in index.html)
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

  // Poll for linking response every 3 s
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
  // Pre-fill test credentials for convenience
  document.getElementById('m-phone').value     = '';
  document.getElementById('m-token').value     = '';
  document.getElementById('m-type').value      = '2';
  document.getElementById('m-device').value    = '';
}

async function saveManual() {
  const phone     = document.getElementById('m-phone').value.trim();
  const token     = document.getElementById('m-token').value.trim();
  const tokenType = parseInt(document.getElementById('m-type').value, 10);
  const deviceId  = document.getElementById('m-device').value.trim();

  if (!phone || !token || !deviceId) {
    showToast('Fill in all fields', true);
    return;
  }
  if (!/^[0-9a-fA-F]{32}$/.test(token)) {
    showToast('Token must be 32 hex characters', true);
    return;
  }

  const cfg = { phone: parseInt(phone, 10), token, tokenType };

  // Try generating a token to validate credentials
  try {
    generateToken(token, parseInt(phone, 10), tokenType);
  } catch (err) {
    showToast(`Invalid credentials: ${err.message}`, true);
    return;
  }

  saveConfig(cfg);

  // Inject the device directly without calling devices/ since user provided it
  show('screen-gate');
  const container = document.getElementById('gates-container');
  container.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'gate-btn';
  btn.innerHTML = `
    <svg class="gate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="18" rx="1"/>
      <rect x="14" y="3" width="7" height="18" rx="1"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
    <span class="gate-name">${escHtml(deviceId)}</span>
    <svg class="gate-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="9 18 15 12 9 6"/>
    </svg>`;
  btn.addEventListener('click', () => openGate(deviceId, deviceId, cfg));
  container.appendChild(btn);
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Boot ----------

function init() {
  // Wire up buttons
  document.getElementById('btn-link').addEventListener('click', startLinking);
  document.getElementById('btn-manual').addEventListener('click', showManual);
  document.getElementById('btn-cancel-qr').addEventListener('click', cancelLinking);
  document.getElementById('btn-cancel-manual').addEventListener('click', () => show('screen-setup'));
  document.getElementById('btn-save-manual').addEventListener('click', saveManual);
  document.getElementById('btn-unlink').addEventListener('click', unlinkDevice);
  document.getElementById('btn-refresh').addEventListener('click', () => {
    const cfg = getConfig();
    if (cfg) loadGates(cfg);
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Route to correct screen
  const cfg = getConfig();
  if (cfg) {
    loadGates(cfg);
  } else {
    show('screen-setup');
  }
}

document.addEventListener('DOMContentLoaded', init);
