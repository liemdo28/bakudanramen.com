/**
 * Bakudan Links Hub — Marketing Admin SPA
 * Vanilla JS, hash-based routing, JWT auth via localStorage
 * Talks to /wp-json/bkdn/v1/ REST endpoints
 */
(function () {
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   CONFIG & STATE
═══════════════════════════════════════════════════════════════════ */
const CFG = window.BKDN_CONFIG || {};
const REST = (CFG.rest || '').replace(/\/$/, '');

const state = {
  token: localStorage.getItem('bkdn_token') || null,
  user:  JSON.parse(localStorage.getItem('bkdn_user') || 'null'),
  currentPage: null,   // page object being edited
  currentButtons: [],  // buttons for current page editor
  dragSrc: null,       // drag-and-drop source element
};

/* ═══════════════════════════════════════════════════════════════════
   API CLIENT
═══════════════════════════════════════════════════════════════════ */
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = 'Bearer ' + state.token;
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(REST + path, opts);

  if (res.status === 401) {
    logout(true);
    return null;
  }

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const GET    = (path)        => api('GET',    path);
const POST   = (path, body)  => api('POST',   path, body);
const PUT    = (path, body)  => api('PUT',    path, body);
const PATCH  = (path, body)  => api('PATCH',  path, body);
const DELETE = (path)        => api('DELETE', path);

/* ═══════════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════════ */
function saveAuth(token, user) {
  state.token = token;
  state.user  = user;
  localStorage.setItem('bkdn_token', token);
  localStorage.setItem('bkdn_user',  JSON.stringify(user));
}

function logout(expired = false) {
  state.token = null;
  state.user  = null;
  localStorage.removeItem('bkdn_token');
  localStorage.removeItem('bkdn_user');
  if (expired) sessionStorage.setItem('bkdn_expired', '1');
  navigate('/login');
}

function isLoggedIn() {
  return !!state.token && !!state.user;
}

function can(roles) {
  if (!state.user) return false;
  return roles.includes(state.user.role);
}

/* ═══════════════════════════════════════════════════════════════════
   ROUTER
═══════════════════════════════════════════════════════════════════ */
const routes = [
  { pattern: /^\/login$/,              view: viewLogin },
  { pattern: /^\/dashboard$/,          view: viewDashboard },
  { pattern: /^\/pages$/,              view: viewPages },
  { pattern: /^\/pages\/(\d+)$/,       view: (m) => viewPageEditor(m[1]) },
  { pattern: /^\/analytics$/,          view: viewAnalytics },
  { pattern: /^\/subscribers$/,        view: viewSubscribers },
  { pattern: /^\/shortlinks$/,         view: viewShortlinks },
  { pattern: /^\/settings$/,           view: viewSettings },
  { pattern: /^\/profile$/,            view: viewProfile },
  { pattern: /^\/users$/,              view: viewUsers },
];

function getHash() {
  return window.location.hash.replace(/^#/, '') || '/dashboard';
}

function navigate(path) {
  window.location.hash = '#' + path;
}

function router() {
  const path = getHash();

  if (!isLoggedIn() && path !== '/login') {
    navigate('/login');
    return;
  }
  if (isLoggedIn() && path === '/login') {
    navigate('/dashboard');
    return;
  }

  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) {
      renderShell();
      route.view(m);
      setActiveNav(path);
      return;
    }
  }

  // 404 fallback
  renderShell();
  setContent('<div class="empty-state"><div class="empty-state-icon">404</div><p>Page not found.</p></div>');
}

window.addEventListener('hashchange', router);

/* ═══════════════════════════════════════════════════════════════════
   SHELL / LAYOUT
═══════════════════════════════════════════════════════════════════ */
function renderShell() {
  if (!isLoggedIn()) {
    document.getElementById('app').innerHTML = '';
    return;
  }

  if (document.getElementById('spa-shell')) return; // already rendered

  const u = state.user;
  const isSuper = can(['super_admin']);
  const isMgr   = can(['super_admin','marketing_manager']);

  document.getElementById('app').innerHTML = `
    <div id="spa-shell" class="spa-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <span style="font-size:28px">爆</span>
          <div>
            <div style="font-weight:700;font-size:14px;line-height:1.2">Links Hub</div>
            <div style="font-size:11px;color:#64748b">Marketing Admin</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <a class="sidebar-link" href="#/dashboard" data-path="/dashboard">
            ${iconDash()} Dashboard
          </a>
          <a class="sidebar-link" href="#/pages" data-path="/pages">
            ${iconPages()} Pages
          </a>
          <a class="sidebar-link" href="#/analytics" data-path="/analytics">
            ${iconChart()} Analytics
          </a>
          ${isMgr ? `<a class="sidebar-link" href="#/subscribers" data-path="/subscribers">${iconUsers()} Subscribers</a>` : ''}
          ${isMgr ? `<a class="sidebar-link" href="#/shortlinks" data-path="/shortlinks">${iconLink()} Shortlinks</a>` : ''}
          ${isMgr ? `<a class="sidebar-link" href="#/settings" data-path="/settings">${iconCog()} Settings</a>` : ''}
          ${isSuper ? `<a class="sidebar-link" href="#/users" data-path="/users">${iconShield()} Users</a>` : ''}
        </nav>
        <div class="sidebar-footer">
          <a class="sidebar-link" href="#/profile" data-path="/profile" style="margin-bottom:4px">
            <span style="width:20px;height:20px;border-radius:50%;background:#334155;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${(u.name||'?')[0].toUpperCase()}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(u.name)}</span>
          </a>
          <button class="sidebar-link" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;color:#ef4444" onclick="BKDN.logout()">
            ${iconLogout()} Sign Out
          </button>
        </div>
      </aside>
      <main class="main-content" id="main-content">
        <div id="view-container"></div>
      </main>
    </div>
  `;
}

function setContent(html) {
  const el = document.getElementById('view-container');
  if (el) el.innerHTML = html;
}

function setActiveNav(path) {
  document.querySelectorAll('.sidebar-link[data-path]').forEach(a => {
    const p = a.dataset.path;
    const active = path === p || (p !== '/dashboard' && path.startsWith(p));
    a.classList.toggle('active', active);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════ */
let toastTimer;
function toast(msg, type = 'success') {
  let el = document.getElementById('bkdn-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bkdn-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ═══════════════════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════════════════════ */
function openModal(titleText, bodyHtml, footerHtml = '') {
  let overlay = document.getElementById('bkdn-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bkdn-modal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${escHtml(titleText)}</h3>
        <button class="modal-close" onclick="BKDN.closeModal()">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  overlay.classList.add('open');
}

function closeModal() {
  const el = document.getElementById('bkdn-modal');
  if (el) el.classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

function roleLabel(role) {
  const m = { super_admin:'Super Admin', marketing_manager:'Marketing Mgr', store_manager:'Store Mgr', viewer:'Viewer' };
  return m[role] || role;
}

function loading() {
  return '<div style="padding:60px;text-align:center;color:#64748b">Loading…</div>';
}

function pageTitle(title, sub = '') {
  return `<div class="page-header">
    <div>
      <h1 class="page-title">${escHtml(title)}</h1>
      ${sub ? `<p class="page-sub">${escHtml(sub)}</p>` : ''}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   SVG ICONS (inline)
═══════════════════════════════════════════════════════════════════ */
const iconDash  = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const iconPages = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
const iconChart = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const iconUsers = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const iconLink  = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const iconCog   = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const iconShield= () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const iconLogout= () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
const iconPlus  = () => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const iconEdit  = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const iconTrash = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const iconCopy  = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const iconExt   = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const iconDrag  = () => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
const iconQR    = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="16" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/></svg>`;

/* ═══════════════════════════════════════════════════════════════════
   VIEW: LOGIN
═══════════════════════════════════════════════════════════════════ */
function viewLogin() {
  document.getElementById('spa-shell')?.remove();

  // Detect session-expired flag set by logout()
  const expired = sessionStorage.getItem('bkdn_expired');
  if (expired) sessionStorage.removeItem('bkdn_expired');

  document.getElementById('app').innerHTML = `
    <div class="login-page">
      ${expired ? `
        <div class="login-session-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Your session has expired. Please sign in again.
        </div>` : ''}
      <div class="login-card">

        <!-- Brand header -->
        <div class="login-header">
          <div class="login-mark">爆</div>
          <h1 class="login-title">Links Hub Admin</h1>
          <p class="login-subtitle">Marketing control panel for links, QR campaigns, and conversion tools.</p>
        </div>

        <!-- Alert box (hidden until error) -->
        <div id="login-alert" class="login-alert" role="alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" flex-shrink="0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span id="login-alert-msg"></span>
        </div>

        <!-- Form — novalidate disables browser native tooltip -->
        <form id="login-form" class="login-form" novalidate autocomplete="on">

          <div class="form-group" style="margin-bottom:18px">
            <label class="form-label" for="login-email">Admin Email</label>
            <input id="login-email" type="email" class="form-control"
              placeholder="admin@bakudanramen.com"
              autocomplete="username" inputmode="email">
            <div id="err-email" class="field-error">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span></span>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label" for="login-pwd">Password</label>
            <div class="pwd-wrap">
              <input id="login-pwd" type="password" class="form-control"
                placeholder="Enter your password"
                autocomplete="current-password">
              <button type="button" class="pwd-toggle" id="pwd-toggle" aria-label="Show password" tabindex="-1">
                <svg id="eye-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            <div id="err-pwd" class="field-error">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span></span>
            </div>
          </div>

          <div class="login-extras">
            <label class="login-remember">
              <input type="checkbox" id="login-remember"> Keep me signed in
            </label>
            <a href="#" class="login-forgot" onclick="return false;">Forgot password?</a>
          </div>

          <button type="submit" class="login-btn" id="login-btn">
            <div class="spin"></div>
            <span class="btn-label">Sign In to Dashboard</span>
          </button>

        </form>

        <div class="login-footer">
          Need access? <a href="mailto:admin@bakudanramen.com">Contact the administrator.</a>
        </div>
      </div>
    </div>
  `;

  // ── Password show/hide toggle ──────────────────────────────────
  const pwdInput = document.getElementById('login-pwd');
  document.getElementById('pwd-toggle').addEventListener('click', () => {
    const show = pwdInput.type === 'password';
    pwdInput.type = show ? 'text' : 'password';
    document.getElementById('eye-icon').innerHTML = show
      ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  // ── Field validators ───────────────────────────────────────────
  function showFieldError(id, msg) {
    const el = document.getElementById(id);
    el.querySelector('span').textContent = msg;
    el.classList.add('show');
  }
  function clearFieldError(id) {
    document.getElementById(id).classList.remove('show');
  }
  function showAlert(msg) {
    document.getElementById('login-alert-msg').textContent = msg;
    document.getElementById('login-alert').classList.add('show');
  }
  function clearAlert() {
    document.getElementById('login-alert').classList.remove('show');
  }

  // Clear field errors on input
  document.getElementById('login-email').addEventListener('input', () => clearFieldError('err-email'));
  document.getElementById('login-pwd').addEventListener('input',   () => clearFieldError('err-pwd'));

  // ── Form submit ────────────────────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearAlert();
    clearFieldError('err-email');
    clearFieldError('err-pwd');

    const email = document.getElementById('login-email').value.trim();
    const pwd   = document.getElementById('login-pwd').value;
    let valid   = true;

    if (!email) {
      showFieldError('err-email', 'Please enter your admin email.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError('err-email', 'Please enter a valid email address.');
      valid = false;
    }

    if (!pwd) {
      showFieldError('err-pwd', 'Please enter your password.');
      valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.classList.add('loading');

    const res = await POST('/auth/login', { email, password: pwd }).catch(() => null);

    btn.disabled = false;
    btn.classList.remove('loading');

    if (!res) {
      showAlert('Something went wrong. Please try again.');
      return;
    }
    if (res.ok && res.data.success) {
      saveAuth(res.data.token, res.data.user);
      navigate('/dashboard');
      return;
    }

    // Map backend messages to user-friendly copy
    const msg = res.data?.message || '';
    if (/inactive/i.test(msg)) {
      showAlert('This account is inactive. Please contact the administrator.');
    } else if (/password/i.test(msg) || /email/i.test(msg) || res.status === 401) {
      showAlert('Invalid email or password.');
    } else {
      showAlert('Something went wrong. Please try again.');
    }
  });

  // Enter key on any field submits form
  document.getElementById('login-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-form').requestSubmit();
  });

  // Focus email on load
  setTimeout(() => document.getElementById('login-email')?.focus(), 50);
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: DASHBOARD
═══════════════════════════════════════════════════════════════════ */
async function viewDashboard() {
  setContent(loading());

  const res = await GET('/admin/dashboard');
  if (!res) return;
  const d = res.data.data || {};

  const statsHtml = [
    { label:'Total Pages',      value: d.pages_total   || 0 },
    { label:'Active Pages',     value: d.pages_active  || 0 },
    { label:'Views (30 days)',  value: fmtNum(d.views_30d) },
    { label:'Clicks (30 days)', value: fmtNum(d.clicks_30d) },
    { label:'Subscribers',      value: fmtNum(d.subscribers) },
    { label:'Shortlinks',       value: d.shortlinks    || 0 },
  ].map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${escHtml(s.label)}</div>
    </div>
  `).join('');

  const topPages = (d.top_pages || []).map(p => `
    <tr>
      <td><a href="#/pages/${p.id}" style="color:#94a3b8">${escHtml(p.title)}</a></td>
      <td><code style="font-size:12px;color:#64748b">/${escHtml(p.slug)}</code></td>
      <td style="text-align:right">${fmtNum(p.views)}</td>
      <td style="text-align:right">${fmtNum(p.clicks)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:20px">No data yet</td></tr>';

  setContent(`
    ${pageTitle('Dashboard', 'Welcome back, ' + (state.user?.name || ''))}
    <div class="stats-grid">${statsHtml}</div>
    <div class="card" style="margin-top:24px">
      <div class="card-header">
        <h3 class="card-title">Top Pages (30 days)</h3>
        <a href="#/analytics" class="btn btn-sm btn-ghost">View All Analytics</a>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Title</th><th>Slug</th><th style="text-align:right">Views</th><th style="text-align:right">Clicks</th></tr></thead>
          <tbody>${topPages}</tbody>
        </table>
      </div>
    </div>
  `);
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: PAGES LIST
═══════════════════════════════════════════════════════════════════ */
async function viewPages() {
  setContent(loading());
  const res = await GET('/admin/pages');
  if (!res) return;
  const pages = res.data.pages || [];

  const isMgr = can(['super_admin','marketing_manager']);

  const rows = pages.map(p => {
    const statusClass = p.is_active ? 'badge badge-green' : 'badge badge-gray';
    const statusLabel = p.is_active ? 'Active' : 'Inactive';
    return `
      <tr>
        <td>
          <a href="#/pages/${p.id}" style="font-weight:600;color:#e2e8f0">${escHtml(p.title)}</a>
          ${p.store_slug ? `<span class="badge badge-blue" style="margin-left:6px">${escHtml(p.store_slug)}</span>` : ''}
        </td>
        <td><code style="font-size:12px;color:#64748b">/${escHtml(p.slug)}</code></td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td>${fmtDate(p.updated_at)}</td>
        <td>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <a href="${escHtml(CFG.siteUrl)}/links/${escHtml(p.slug)}" target="_blank" title="Preview" class="btn btn-sm btn-ghost">${iconExt()}</a>
            <a href="#/pages/${p.id}" title="Edit" class="btn btn-sm btn-ghost">${iconEdit()}</a>
            ${isMgr ? `<button onclick="BKDN.duplicatePage(${p.id})" title="Duplicate" class="btn btn-sm btn-ghost">${iconCopy()}</button>` : ''}
            ${isMgr ? `<button onclick="BKDN.deletePage(${p.id}, '${escHtml(p.title)}')" title="Delete" class="btn btn-sm btn-danger">${iconTrash()}</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:30px">No pages yet.</td></tr>';

  setContent(`
    ${pageTitle('Pages', 'Manage your link hub pages')}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">All Pages <span class="badge badge-gray" style="margin-left:8px">${pages.length}</span></h3>
        ${isMgr ? `<button class="btn btn-primary btn-sm" onclick="BKDN.openCreatePage()">${iconPlus()} New Page</button>` : ''}
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Updated</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `);
}

/* ── Create page modal ──────────────────────────────────────────── */
function openCreatePage() {
  openModal('New Page', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input id="cp-title" class="form-control" placeholder="Bakudan Ramen — The Rim">
    </div>
    <div class="form-group">
      <label class="form-label">Slug <span style="color:#64748b;font-size:11px">(URL-friendly, no spaces)</span></label>
      <input id="cp-slug" class="form-control" placeholder="rim">
    </div>
    <div class="form-group">
      <label class="form-label">Headline</label>
      <input id="cp-headline" class="form-control" placeholder="BAKUDAN — THE RIM">
    </div>
    <div class="form-group">
      <label class="form-label">Store Slug <span style="color:#64748b;font-size:11px">(optional)</span></label>
      <input id="cp-store" class="form-control" placeholder="rim">
    </div>
  `, `
    <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="BKDN.createPage()">Create Page</button>
  `);

  // Auto-slug from title
  document.getElementById('cp-title').addEventListener('input', e => {
    const slugEl = document.getElementById('cp-slug');
    if (!slugEl._touched) {
      slugEl.value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'');
    }
  });
  document.getElementById('cp-slug').addEventListener('input', () => {
    document.getElementById('cp-slug')._touched = true;
  });
}

async function createPage() {
  const title    = document.getElementById('cp-title').value.trim();
  const slug     = document.getElementById('cp-slug').value.trim();
  const headline = document.getElementById('cp-headline').value.trim();
  const store    = document.getElementById('cp-store').value.trim();

  if (!title || !slug) { toast('Title and slug are required.', 'error'); return; }

  const res = await POST('/admin/pages', { title, slug, headline, store_slug: store || null });
  if (res?.ok) {
    toast('Page created!');
    closeModal();
    navigate('/pages/' + res.data.id);
  } else {
    toast(res?.data?.message || 'Failed to create page.', 'error');
  }
}

async function duplicatePage(id) {
  if (!confirm('Duplicate this page?')) return;
  const res = await POST('/admin/pages/' + id + '/duplicate', {});
  if (res?.ok) {
    toast('Page duplicated!');
    navigate('/pages/' + res.data.id);
  } else {
    toast('Failed to duplicate page.', 'error');
  }
}

async function deletePage(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  const res = await DELETE('/admin/pages/' + id);
  if (res?.ok) {
    toast('Page deleted.');
    viewPages();
  } else {
    toast('Failed to delete page.', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: PAGE EDITOR
═══════════════════════════════════════════════════════════════════ */
async function viewPageEditor(id) {
  setContent(loading());

  const [pRes, bRes] = await Promise.all([
    GET('/admin/pages/' + id),
    GET('/admin/pages/' + id + '/buttons'),
  ]);

  if (!pRes?.ok) { toast('Page not found.', 'error'); navigate('/pages'); return; }

  state.currentPage    = pRes.data.page;
  state.currentButtons = bRes?.data?.buttons || [];

  const p = state.currentPage;
  const isMgr   = can(['super_admin','marketing_manager']);
  const canEdit  = can(['super_admin','marketing_manager','store_manager']);
  const previewUrl = escHtml(`${CFG.siteUrl}/links/${p.slug}`);

  setContent(`
    ${pageTitle(escHtml(p.title), `/${escHtml(p.slug)}`)}
    <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;align-items:center">
      <a href="${previewUrl}" target="_blank" class="btn btn-ghost btn-sm">${iconExt()} Preview</a>
      ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="BKDN.savePage()">Save Changes</button>` : ''}
      ${canEdit ? `<button class="btn btn-sm ${p.is_active?'btn-ghost':'btn-primary'}" onclick="BKDN.togglePageActive()">${p.is_active ? 'Unpublish' : 'Publish'}</button>` : ''}
      <a href="#/pages" class="btn btn-ghost btn-sm" style="margin-left:auto">← Back to Pages</a>
    </div>

    <div class="tabs" id="editor-tabs">
      <button class="tab active" data-tab="info"     onclick="BKDN.switchTab(this,'info')">Info</button>
      <button class="tab"        data-tab="buttons"  onclick="BKDN.switchTab(this,'buttons')">Buttons</button>
      <button class="tab"        data-tab="theme"    onclick="BKDN.switchTab(this,'theme')">Theme</button>
      <button class="tab"        data-tab="campaign" onclick="BKDN.switchTab(this,'campaign')">Campaign</button>
      <button class="tab"        data-tab="analytics" onclick="BKDN.switchTab(this,'analytics')">Analytics</button>
      ${isMgr ? `<button class="tab" data-tab="redirects" onclick="BKDN.switchTab(this,'redirects')">Redirects</button>` : ''}
    </div>

    <div id="tab-info"      class="tab-pane active">${buildInfoTab(p, canEdit)}</div>
    <div id="tab-buttons"   class="tab-pane">${buildButtonsTab(canEdit)}</div>
    <div id="tab-theme"     class="tab-pane">${buildThemeTab(p, canEdit)}</div>
    <div id="tab-campaign"  class="tab-pane">${buildCampaignTab(p, canEdit)}</div>
    <div id="tab-analytics" class="tab-pane"><div id="page-analytics-content">${loading()}</div></div>
    ${isMgr ? `<div id="tab-redirects" class="tab-pane"><div id="page-redirects-content">${loading()}</div></div>` : ''}
  `);

  renderButtonList();
}

/* ── Tab switcher ───────────────────────────────────────────────── */
function switchTab(btn, name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const pane = document.getElementById('tab-' + name);
  if (pane) pane.classList.add('active');

  if (name === 'analytics') loadPageAnalytics();
  if (name === 'redirects')  loadPageRedirects();
}

/* ── Info Tab ───────────────────────────────────────────────────── */
function buildInfoTab(p, canEdit) {
  const dis = canEdit ? '' : ' disabled';
  const theme = p.theme_json ? (typeof p.theme_json === 'string' ? JSON.parse(p.theme_json) : p.theme_json) : {};
  return `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input id="p-title" class="form-control" value="${escHtml(p.title)}"${dis}>
      </div>
      <div class="form-group">
        <label class="form-label">Slug <span style="color:#64748b;font-size:11px">(changing may break QR codes)</span></label>
        <input id="p-slug" class="form-control" value="${escHtml(p.slug)}"${dis}>
      </div>
      <div class="form-group">
        <label class="form-label">Headline</label>
        <input id="p-headline" class="form-control" value="${escHtml(p.headline||'')}"${dis}>
      </div>
      <div class="form-group">
        <label class="form-label">Subheadline</label>
        <input id="p-subheadline" class="form-control" value="${escHtml(p.subheadline||'')}"${dis}>
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">SEO Description</label>
        <textarea id="p-seo-desc" class="form-control" rows="2"${dis}>${escHtml(p.seo_desc||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Store Slug <span style="color:#64748b;font-size:11px">(for multi-store filtering)</span></label>
        <input id="p-store-slug" class="form-control" value="${escHtml(p.store_slug||'')}"${dis}>
      </div>
    </div>
  `;
}

/* ── Theme Tab ──────────────────────────────────────────────────── */
function buildThemeTab(p, canEdit) {
  const theme = p.theme_json ? (typeof p.theme_json === 'string' ? JSON.parse(p.theme_json) : p.theme_json) : {};
  const dis = canEdit ? '' : ' disabled';
  const tokens = [
    { key:'bg_color',               label:'Background' },
    { key:'card_color',             label:'Card Background' },
    { key:'button_primary_color',   label:'Primary Button' },
    { key:'button_secondary_color', label:'Secondary Button' },
    { key:'text_primary',           label:'Primary Text' },
    { key:'text_secondary',         label:'Secondary Text' },
    { key:'border_color',           label:'Border' },
    { key:'accent_color',           label:'Accent / Red' },
  ];

  const colorInputs = tokens.map(t => `
    <div class="color-item">
      <input type="color" id="theme-${t.key}" class="color-swatch" value="${escHtml(theme[t.key]||'#000000')}"${dis}>
      <span class="color-label">${escHtml(t.label)}</span>
    </div>
  `).join('');

  return `
    <div class="color-grid">${colorInputs}</div>
    <div style="margin-top:20px;display:flex;gap:10px">
      ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="BKDN.saveTheme()">Save Theme</button>` : ''}
      ${canEdit ? `<button class="btn btn-ghost btn-sm" onclick="BKDN.resetTheme()">Reset to Default</button>` : ''}
    </div>
  `;
}

/* ── Campaign Tab ───────────────────────────────────────────────── */
function buildCampaignTab(p, canEdit) {
  const dis = canEdit ? '' : ' disabled';
  const pub = p.published_at ? p.published_at.replace(' ','T').slice(0,16) : '';
  const exp = p.expires_at   ? p.expires_at.replace(' ','T').slice(0,16)   : '';
  return `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Campaign Name <span style="color:#64748b;font-size:11px">(for analytics filtering)</span></label>
        <input id="p-campaign" class="form-control" value="${escHtml(p.campaign_name||'')}"${dis}>
      </div>
      <div class="form-group">
        <label class="form-label">Publish Date</label>
        <input id="p-published-at" type="datetime-local" class="form-control" value="${escHtml(pub)}"${dis}>
      </div>
      <div class="form-group">
        <label class="form-label">Expiry Date <span style="color:#64748b;font-size:11px">(page hides after this)</span></label>
        <input id="p-expires-at" type="datetime-local" class="form-control" value="${escHtml(exp)}"${dis}>
      </div>
    </div>
  `;
}

/* ── Save page ──────────────────────────────────────────────────── */
async function savePage() {
  const p = state.currentPage;
  if (!p) return;

  const theme = {};
  document.querySelectorAll('[id^="theme-"]').forEach(el => {
    const key = el.id.replace('theme-','');
    theme[key] = el.value;
  });

  const body = {
    title:         document.getElementById('p-title')?.value.trim(),
    slug:          document.getElementById('p-slug')?.value.trim(),
    headline:      document.getElementById('p-headline')?.value.trim(),
    subheadline:   document.getElementById('p-subheadline')?.value.trim(),
    seo_desc:      document.getElementById('p-seo-desc')?.value.trim(),
    store_slug:    document.getElementById('p-store-slug')?.value.trim() || null,
    campaign_name: document.getElementById('p-campaign')?.value.trim() || null,
    published_at:  document.getElementById('p-published-at')?.value.replace('T',' ') || null,
    expires_at:    document.getElementById('p-expires-at')?.value.replace('T',' ')   || null,
    theme_json:    theme,
    is_active:     p.is_active,
  };

  const res = await PUT('/admin/pages/' + p.id, body);
  if (res?.ok) {
    state.currentPage = { ...p, ...body };
    toast('Saved!');
  } else {
    toast(res?.data?.message || 'Save failed.', 'error');
  }
}

async function saveTheme() {
  await savePage();
}

async function resetTheme() {
  if (!confirm('Reset theme to default colors?')) return;
  const defaults = {
    bg_color:'#0a0a0a', card_color:'#141414',
    button_primary_color:'#B91C1C', button_secondary_color:'#141414',
    text_primary:'#ffffff', text_secondary:'#888888',
    border_color:'#262626', accent_color:'#B91C1C',
  };
  Object.entries(defaults).forEach(([k,v]) => {
    const el = document.getElementById('theme-'+k);
    if (el) el.value = v;
  });
  toast('Theme reset — click Save Theme to apply.');
}

async function togglePageActive() {
  const p = state.currentPage;
  if (!p) return;
  const res = await PUT('/admin/pages/' + p.id, { ...p, is_active: p.is_active ? 0 : 1 });
  if (res?.ok) {
    state.currentPage.is_active = p.is_active ? 0 : 1;
    toast(state.currentPage.is_active ? 'Page published!' : 'Page unpublished.');
    viewPageEditor(p.id);
  } else {
    toast('Failed to update page status.', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   BUTTONS TAB + DRAG-AND-DROP
═══════════════════════════════════════════════════════════════════ */
function buildButtonsTab(canEdit) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <p style="color:#64748b;font-size:13px;margin:0">Drag rows to reorder. Click edit to change details.</p>
      ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="BKDN.openAddButton()">${iconPlus()} Add Button</button>` : ''}
    </div>
    <div id="btn-list" class="btn-list"></div>
  `;
}

function renderButtonList() {
  const el = document.getElementById('btn-list');
  if (!el) return;

  const canEdit = can(['super_admin','marketing_manager','store_manager']);

  if (!state.currentButtons.length) {
    el.innerHTML = '<div class="empty-state"><p>No buttons yet. Add your first link!</p></div>';
    return;
  }

  el.innerHTML = state.currentButtons.map((b, i) => `
    <div class="btn-row ${b.enabled?'':'btn-row--disabled'}" draggable="${canEdit}" data-id="${b.id}" data-idx="${i}">
      <div class="btn-row-drag" title="Drag to reorder">${iconDrag()}</div>
      <div class="btn-row-body">
        <div class="btn-row-title">${escHtml(b.title)}</div>
        <div class="btn-row-meta">
          ${b.icon_key ? `<span class="badge badge-gray" style="font-size:10px">${escHtml(b.icon_key)}</span>` : ''}
          <span class="badge badge-${b.style_variant==='primary'?'blue':'gray'}" style="font-size:10px">${escHtml(b.style_variant)}</span>
          ${b.subtitle ? `<span style="color:#64748b;font-size:11px">${escHtml(b.subtitle)}</span>` : ''}
        </div>
      </div>
      <div class="btn-row-url" title="${escHtml(b.url||'')}">
        ${b.url ? `<a href="${escHtml(b.url)}" target="_blank" style="color:#64748b;font-size:11px">${escHtml((b.url||'').substring(0,40)+(b.url&&b.url.length>40?'…':''))}</a>` : '<span style="color:#475569;font-size:11px">no url</span>'}
      </div>
      <div class="btn-row-toggle">
        <label class="toggle">
          <input type="checkbox" ${b.enabled?'checked':''} onchange="BKDN.toggleButton(${b.id}, this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${canEdit ? `
      <div class="btn-row-actions">
        <button class="btn btn-sm btn-ghost" onclick="BKDN.openEditButton(${b.id})" title="Edit">${iconEdit()}</button>
        <button class="btn btn-sm btn-ghost" onclick="BKDN.duplicateButton(${b.id})" title="Duplicate">${iconCopy()}</button>
        <button class="btn btn-sm btn-danger" onclick="BKDN.deleteButton(${b.id})" title="Delete">${iconTrash()}</button>
      </div>` : ''}
    </div>
  `).join('');

  if (canEdit) initDragDrop();
}

/* ── HTML5 Drag-and-drop reorder ─────────────────────────────────── */
function initDragDrop() {
  const list = document.getElementById('btn-list');
  if (!list) return;

  list.addEventListener('dragstart', e => {
    const row = e.target.closest('.btn-row');
    if (!row) return;
    state.dragSrc = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.btn-row');
    if (!row || row === state.dragSrc) return;
    list.querySelectorAll('.btn-row').forEach(r => r.classList.remove('drag-over'));
    row.classList.add('drag-over');
  });

  list.addEventListener('dragleave', e => {
    const row = e.target.closest('.btn-row');
    if (row) row.classList.remove('drag-over');
  });

  list.addEventListener('dragend', e => {
    list.querySelectorAll('.btn-row').forEach(r => {
      r.classList.remove('dragging','drag-over');
    });
    state.dragSrc = null;
  });

  list.addEventListener('drop', async e => {
    e.preventDefault();
    const target = e.target.closest('.btn-row');
    if (!target || !state.dragSrc || target === state.dragSrc) return;

    // Reorder in DOM
    const rows = [...list.querySelectorAll('.btn-row')];
    const srcIdx = rows.indexOf(state.dragSrc);
    const tgtIdx = rows.indexOf(target);

    if (srcIdx < tgtIdx) {
      target.after(state.dragSrc);
    } else {
      target.before(state.dragSrc);
    }

    // Build new order
    const newOrder = [...list.querySelectorAll('.btn-row')].map(r => parseInt(r.dataset.id));
    state.currentButtons.sort((a,b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));

    // Persist
    const p = state.currentPage;
    const res = await PATCH('/admin/pages/' + p.id + '/buttons/reorder', { order: newOrder });
    if (!res?.ok) toast('Reorder failed — refresh to see server state.', 'error');
  });
}

/* ── Toggle button enabled ────────────────────────────────────────── */
async function toggleButton(id, enabled) {
  const b = state.currentButtons.find(x => x.id === id);
  if (!b) return;
  const res = await PUT('/admin/buttons/' + id, { ...b, enabled: enabled ? 1 : 0 });
  if (res?.ok) {
    b.enabled = enabled ? 1 : 0;
  } else {
    toast('Failed to toggle button.', 'error');
  }
}

/* ── Button editor modal ─────────────────────────────────────────── */
const ICON_KEYS = (CFG.iconKeys || ['order','website','email','events','instagram','facebook','directions','phone','menu','gift','ticket','external']);
const STYLE_VARIANTS = ['primary','secondary','order_sub','coming_soon'];

function buttonForm(b = {}) {
  const iconOpts = ['', ...ICON_KEYS].map(k =>
    `<option value="${k}" ${(b.icon_key||'')=== k?'selected':''}>${k||'(none)'}</option>`
  ).join('');
  const styleOpts = STYLE_VARIANTS.map(v =>
    `<option value="${v}" ${(b.style_variant||'secondary')===v?'selected':''}>${v}</option>`
  ).join('');

  return `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Title *</label>
        <input id="bf-title" class="form-control" value="${escHtml(b.title||'')}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Subtitle</label>
        <input id="bf-subtitle" class="form-control" value="${escHtml(b.subtitle||'')}">
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">URL</label>
        <input id="bf-url" class="form-control" value="${escHtml(b.url||'')}" placeholder="https://…">
      </div>
      <div class="form-group">
        <label class="form-label">Icon</label>
        <select id="bf-icon" class="form-control">${iconOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Style Variant</label>
        <select id="bf-style" class="form-control">${styleOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Starts At</label>
        <input id="bf-start" type="datetime-local" class="form-control" value="${escHtml((b.start_at||'').replace(' ','T').slice(0,16))}">
      </div>
      <div class="form-group">
        <label class="form-label">Ends At</label>
        <input id="bf-end" type="datetime-local" class="form-control" value="${escHtml((b.end_at||'').replace(' ','T').slice(0,16))}">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <label class="toggle"><input id="bf-new-tab" type="checkbox" ${b.opens_in_new_tab!==0?'checked':''}><span class="toggle-slider"></span></label>
        <span class="form-label" style="margin:0">Open in new tab</span>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <label class="toggle"><input id="bf-featured" type="checkbox" ${b.is_featured?'checked':''}><span class="toggle-slider"></span></label>
        <span class="form-label" style="margin:0">Featured</span>
      </div>
    </div>
  `;
}

function getButtonFormValues() {
  return {
    title:           document.getElementById('bf-title').value.trim(),
    subtitle:        document.getElementById('bf-subtitle').value.trim() || null,
    url:             document.getElementById('bf-url').value.trim(),
    icon_key:        document.getElementById('bf-icon').value || null,
    style_variant:   document.getElementById('bf-style').value,
    start_at:        document.getElementById('bf-start').value.replace('T',' ') || null,
    end_at:          document.getElementById('bf-end').value.replace('T',' ')   || null,
    opens_in_new_tab: document.getElementById('bf-new-tab').checked ? 1 : 0,
    is_featured:     document.getElementById('bf-featured').checked ? 1 : 0,
  };
}

function openAddButton() {
  openModal('Add Button', buttonForm(), `
    <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="BKDN.addButton()">Add Button</button>
  `);
}

async function addButton() {
  const vals = getButtonFormValues();
  if (!vals.title) { toast('Title is required.', 'error'); return; }

  const p = state.currentPage;
  const res = await POST('/admin/pages/' + p.id + '/buttons', {
    ...vals,
    sort_order: state.currentButtons.length,
    enabled: 1, is_active: 1,
  });
  if (res?.ok) {
    state.currentButtons.push({ id: res.data.id, ...vals, enabled:1, is_active:1 });
    renderButtonList();
    closeModal();
    toast('Button added!');
  } else {
    toast(res?.data?.message || 'Failed to add button.', 'error');
  }
}

function openEditButton(id) {
  const b = state.currentButtons.find(x => x.id === id);
  if (!b) return;
  openModal('Edit Button', buttonForm(b), `
    <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="BKDN.updateButton(${id})">Save Button</button>
  `);
}

async function updateButton(id) {
  const vals = getButtonFormValues();
  if (!vals.title) { toast('Title is required.', 'error'); return; }

  const res = await PUT('/admin/buttons/' + id, vals);
  if (res?.ok) {
    const idx = state.currentButtons.findIndex(x => x.id === id);
    if (idx !== -1) state.currentButtons[idx] = { ...state.currentButtons[idx], ...vals };
    renderButtonList();
    closeModal();
    toast('Button saved!');
  } else {
    toast(res?.data?.message || 'Failed to update button.', 'error');
  }
}

async function duplicateButton(id) {
  const res = await POST('/admin/buttons/' + id, {});
  if (res?.ok) {
    const original = state.currentButtons.find(x => x.id === id);
    if (original) state.currentButtons.push({ ...original, id: res.data.id, title: original.title + ' (copy)' });
    renderButtonList();
    toast('Button duplicated!');
  } else {
    toast('Failed to duplicate button.', 'error');
  }
}

async function deleteButton(id) {
  if (!confirm('Delete this button?')) return;
  const res = await DELETE('/admin/buttons/' + id);
  if (res?.ok) {
    state.currentButtons = state.currentButtons.filter(b => b.id !== id);
    renderButtonList();
    toast('Button deleted.');
  } else {
    toast('Failed to delete button.', 'error');
  }
}

/* ── Page Analytics tab ──────────────────────────────────────────── */
async function loadPageAnalytics() {
  const el = document.getElementById('page-analytics-content');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';

  const p = state.currentPage;
  const res = await GET('/admin/pages/' + p.id + '/analytics');
  if (!res?.ok) { el.innerHTML = '<p style="color:#64748b;padding:20px">No analytics data.</p>'; return; }
  const d = res.data.data || {};
  el.innerHTML = renderAnalyticsCards(d);
}

/* ── Page Redirects tab ──────────────────────────────────────────── */
async function loadPageRedirects() {
  const el = document.getElementById('page-redirects-content');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';

  const p = state.currentPage;
  const res = await GET('/admin/pages/' + p.id + '/redirects');
  const rules = res?.data?.rules || [];

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:16px">
      <p style="color:#64748b;margin:0;font-size:13px">Active redirect overrides the link page temporarily.</p>
      <button class="btn btn-primary btn-sm" onclick="BKDN.openAddRedirect(${p.id})">${iconPlus()} Add Redirect</button>
    </div>
    ${rules.length ? `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Target URL</th><th>Type</th><th>Start</th><th>End</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${rules.map(r => `
            <tr>
              <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="${escHtml(r.target_url)}" target="_blank" style="color:#94a3b8">${escHtml(r.target_url)}</a></td>
              <td><span class="badge badge-gray">${r.redirect_type}</span></td>
              <td>${fmtDate(r.start_at)}</td>
              <td>${fmtDate(r.end_at)}</td>
              <td><span class="badge badge-${r.is_active?'green':'gray'}">${r.is_active?'Yes':'No'}</span></td>
              <td><button class="btn btn-sm btn-danger" onclick="BKDN.deleteRedirect(${r.id},${p.id})">${iconTrash()}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '<p style="color:#64748b;text-align:center;padding:30px">No redirect rules.</p>'}
  `;
}

function openAddRedirect(pageId) {
  openModal('Add Redirect Rule', `
    <div class="form-group">
      <label class="form-label">Target URL *</label>
      <input id="rr-url" class="form-control" placeholder="https://…">
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select id="rr-type" class="form-control">
        <option value="302">302 (Temporary)</option>
        <option value="301">301 (Permanent)</option>
      </select>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Start At</label>
        <input id="rr-start" type="datetime-local" class="form-control">
      </div>
      <div class="form-group">
        <label class="form-label">End At</label>
        <input id="rr-end" type="datetime-local" class="form-control">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input id="rr-notes" class="form-control" placeholder="Reason for redirect…">
    </div>
  `, `
    <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="BKDN.addRedirect(${pageId})">Save Redirect</button>
  `);
}

async function addRedirect(pageId) {
  const url = document.getElementById('rr-url').value.trim();
  if (!url) { toast('Target URL is required.', 'error'); return; }
  const res = await POST('/admin/pages/' + pageId + '/redirects', {
    target_url:    url,
    redirect_type: document.getElementById('rr-type').value,
    start_at:      document.getElementById('rr-start').value.replace('T',' ') || null,
    end_at:        document.getElementById('rr-end').value.replace('T',' ')   || null,
    notes:         document.getElementById('rr-notes').value.trim() || null,
    is_active:     1,
  });
  if (res?.ok) {
    toast('Redirect saved!');
    closeModal();
    const el = document.getElementById('page-redirects-content');
    if (el) { delete el.dataset.loaded; loadPageRedirects(); }
  } else {
    toast('Failed to save redirect.', 'error');
  }
}

async function deleteRedirect(id, pageId) {
  if (!confirm('Delete this redirect rule?')) return;
  const res = await DELETE('/admin/redirects/' + id);
  if (res?.ok) {
    toast('Redirect deleted.');
    const el = document.getElementById('page-redirects-content');
    if (el) { delete el.dataset.loaded; loadPageRedirects(); }
  } else {
    toast('Failed to delete redirect.', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: ANALYTICS
═══════════════════════════════════════════════════════════════════ */
async function viewAnalytics() {
  setContent(`
    ${pageTitle('Analytics', 'Traffic overview for all pages')}
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <select id="an-period" class="form-control" style="width:auto" onchange="BKDN.loadAnalytics()">
        <option value="7">Last 7 days</option>
        <option value="30" selected>Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>
    </div>
    <div id="analytics-body">${loading()}</div>
  `);
  await loadAnalytics();
}

async function loadAnalytics() {
  const el = document.getElementById('analytics-body');
  if (!el) return;
  const days = document.getElementById('an-period')?.value || 30;
  const res = await GET('/admin/analytics?days=' + days);
  if (!res?.ok) { el.innerHTML = '<p style="color:#64748b">Failed to load analytics.</p>'; return; }
  const d = res.data.data || {};
  el.innerHTML = renderAnalyticsCards(d, true);
}

function renderAnalyticsCards(d, showTopPages = false) {
  const statsHtml = [
    { label:'Views',    value: fmtNum(d.views) },
    { label:'Clicks',   value: fmtNum(d.clicks) },
    { label:'CTR',      value: d.ctr != null ? (parseFloat(d.ctr).toFixed(1) + '%') : '—' },
    { label:'Mobile',   value: d.device_mobile  ? fmtNum(d.device_mobile)  : '—' },
    { label:'Desktop',  value: d.device_desktop ? fmtNum(d.device_desktop) : '—' },
  ].map(s => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${escHtml(s.label)}</div></div>`).join('');

  const topButtonsHtml = (d.top_buttons||[]).map(b =>
    `<tr><td>${escHtml(b.title)}</td><td style="text-align:right">${fmtNum(b.clicks)}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="text-align:center;color:#64748b;padding:16px">No data</td></tr>';

  const topPagesHtml = showTopPages && (d.top_pages||[]).map(p =>
    `<tr><td><a href="#/pages/${p.id}" style="color:#94a3b8">${escHtml(p.title||p.slug)}</a></td><td style="text-align:right">${fmtNum(p.views)}</td><td style="text-align:right">${fmtNum(p.clicks)}</td></tr>`
  ).join('');

  return `
    <div class="stats-grid">${statsHtml}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-top:24px">
      ${showTopPages && topPagesHtml ? `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Top Pages</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Page</th><th style="text-align:right">Views</th><th style="text-align:right">Clicks</th></tr></thead>
            <tbody>${topPagesHtml}</tbody>
          </table>
        </div>
      </div>` : ''}
      <div class="card">
        <div class="card-header"><h3 class="card-title">Top Buttons</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Button</th><th style="text-align:right">Clicks</th></tr></thead>
            <tbody>${topButtonsHtml}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: SUBSCRIBERS
═══════════════════════════════════════════════════════════════════ */
async function viewSubscribers() {
  setContent(loading());
  const res = await GET('/admin/subscribers');
  const subs = res?.data?.subscribers || [];

  const rows = subs.map(s => `
    <tr>
      <td>${escHtml(s.email)}</td>
      <td>${escHtml(s.first_name||'—')}</td>
      <td>${escHtml(s.store_slug||'—')}</td>
      <td><span class="badge badge-${s.integration_status==='synced'?'green':'gray'}">${escHtml(s.integration_status)}</span></td>
      <td>${fmtDate(s.created_at)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:30px">No subscribers yet.</td></tr>';

  setContent(`
    ${pageTitle('Subscribers', subs.length + ' total')}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Email List</h3>
        <a href="${REST}/admin/subscribers/export?token=${encodeURIComponent(state.token)}" class="btn btn-ghost btn-sm" target="_blank">Export CSV</a>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Email</th><th>Name</th><th>Store</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `);
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: SHORTLINKS
═══════════════════════════════════════════════════════════════════ */
async function viewShortlinks() {
  setContent(loading());
  const res = await GET('/admin/shortlinks');
  const links = res?.data?.shortlinks || [];

  const rows = links.map(l => `
    <tr>
      <td><code style="color:#94a3b8">/go/${escHtml(l.slug)}</code></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <a href="${escHtml(l.target_url)}" target="_blank" style="color:#64748b;font-size:12px">${escHtml(l.target_url)}</a>
      </td>
      <td style="text-align:right">${fmtNum(l.click_count)}</td>
      <td><span class="badge badge-${l.is_active?'green':'gray'}">${l.is_active?'Active':'Off'}</span></td>
      <td>${fmtDate(l.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-sm btn-ghost" onclick="BKDN.showQR('${escHtml(CFG.siteUrl)}/go/${escHtml(l.slug)}', '${escHtml(l.slug)}')" title="QR">${iconQR()}</button>
          <button class="btn btn-sm btn-danger" onclick="BKDN.deleteShortlink(${l.id})" title="Delete">${iconTrash()}</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:30px">No shortlinks yet.</td></tr>';

  setContent(`
    ${pageTitle('Shortlinks', 'UTM-tagged short URLs for campaigns')}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">All Shortlinks</h3>
        <button class="btn btn-primary btn-sm" onclick="BKDN.openAddShortlink()">${iconPlus()} New Shortlink</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Short URL</th><th>Target</th><th style="text-align:right">Clicks</th><th>Status</th><th>Created</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `);
}

function openAddShortlink() {
  openModal('New Shortlink', `
    <div class="form-group">
      <label class="form-label">Slug <span style="color:#64748b;font-size:11px">(becomes /go/slug)</span></label>
      <input id="sl-slug" class="form-control" placeholder="summer24">
    </div>
    <div class="form-group">
      <label class="form-label">Target URL *</label>
      <input id="sl-url" class="form-control" placeholder="https://…">
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">UTM Source</label>
        <input id="sl-utm-source" class="form-control" placeholder="instagram">
      </div>
      <div class="form-group">
        <label class="form-label">UTM Medium</label>
        <input id="sl-utm-medium" class="form-control" placeholder="bio">
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">UTM Campaign</label>
        <input id="sl-utm-campaign" class="form-control" placeholder="summer-promo">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input id="sl-notes" class="form-control" placeholder="Internal note…">
    </div>
  `, `
    <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="BKDN.createShortlink()">Create</button>
  `);
}

async function createShortlink() {
  const slug = document.getElementById('sl-slug').value.trim();
  const url  = document.getElementById('sl-url').value.trim();
  if (!slug || !url) { toast('Slug and URL are required.', 'error'); return; }

  const res = await POST('/admin/shortlinks', {
    slug,
    target_url:   url,
    utm_source:   document.getElementById('sl-utm-source').value.trim()   || null,
    utm_medium:   document.getElementById('sl-utm-medium').value.trim()   || null,
    utm_campaign: document.getElementById('sl-utm-campaign').value.trim() || null,
    notes:        document.getElementById('sl-notes').value.trim()        || null,
    is_active: 1,
  });
  if (res?.ok) {
    toast('Shortlink created!');
    closeModal();
    viewShortlinks();
  } else {
    toast(res?.data?.message || 'Failed to create shortlink.', 'error');
  }
}

async function deleteShortlink(id) {
  if (!confirm('Delete this shortlink?')) return;
  const res = await DELETE('/admin/shortlinks/' + id);
  if (res?.ok) { toast('Shortlink deleted.'); viewShortlinks(); }
  else toast('Failed to delete.', 'error');
}

/* ── QR code modal ───────────────────────────────────────────────── */
function showQR(url, label) {
  openModal('QR Code — ' + label, `
    <div class="qr-box">
      <div id="qr-canvas"></div>
      <div class="qr-url">${escHtml(url)}</div>
    </div>
    <div style="text-align:center;margin-top:16px">
      <button class="btn btn-ghost btn-sm" onclick="BKDN.downloadQR('${escHtml(label)}')">Download PNG</button>
    </div>
  `);

  // Generate via QRCode.js CDN (loaded lazily)
  loadQRLib(() => {
    new QRCode(document.getElementById('qr-canvas'), {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
    });
  });
}

function downloadQR(label) {
  const canvas = document.querySelector('#qr-canvas canvas');
  if (!canvas) { toast('QR not ready yet.', 'error'); return; }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'qr-' + label + '.png';
  a.click();
}

function loadQRLib(cb) {
  if (window.QRCode) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: SETTINGS
═══════════════════════════════════════════════════════════════════ */
async function viewSettings() {
  setContent(loading());
  const res = await GET('/admin/settings');
  const opts = res?.data?.settings || {};

  setContent(`
    ${pageTitle('Settings', 'Global plugin configuration')}
    <div class="card">
      <div class="card-header"><h3 class="card-title">Order URLs</h3></div>
      <div style="padding:20px">
        <div class="form-grid">
          ${['rim','stone_oak','bandera'].map(k => `
            <div class="form-group">
              <label class="form-label">${k.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())} Order URL</label>
              <input id="s-order-${k}" class="form-control" value="${escHtml(opts['order_'+k]||'')}">
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><h3 class="card-title">Social Links</h3></div>
      <div style="padding:20px">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Instagram URL</label>
            <input id="s-ig" class="form-control" value="${escHtml(opts.instagram_url||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Facebook URL</label>
            <input id="s-fb" class="form-control" value="${escHtml(opts.facebook_url||'')}">
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><h3 class="card-title">Optional Sections</h3></div>
      <div style="padding:20px">
        <div style="display:flex;flex-direction:column;gap:16px">
          ${[
            { key:'show_email_club',  label:'Show Email Club section' },
            { key:'show_events',      label:'Show Events section' },
            { key:'show_coming_soon', label:'Show Coming Soon items' },
          ].map(o => `
            <div style="display:flex;align-items:center;gap:12px">
              <label class="toggle">
                <input id="s-${o.key}" type="checkbox" ${opts[o.key]?'checked':''}>
                <span class="toggle-slider"></span>
              </label>
              <span class="form-label" style="margin:0">${escHtml(o.label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div style="margin-top:20px">
      <button class="btn btn-primary" onclick="BKDN.saveSettings()">Save Settings</button>
    </div>
  `);
}

async function saveSettings() {
  const settings = {
    order_rim:       document.getElementById('s-order-rim').value.trim(),
    order_stone_oak: document.getElementById('s-order-stone_oak').value.trim(),
    order_bandera:   document.getElementById('s-order-bandera').value.trim(),
    instagram_url:   document.getElementById('s-ig').value.trim(),
    facebook_url:    document.getElementById('s-fb').value.trim(),
    show_email_club:  document.getElementById('s-show_email_club').checked  ? 1 : 0,
    show_events:      document.getElementById('s-show_events').checked       ? 1 : 0,
    show_coming_soon: document.getElementById('s-show_coming_soon').checked  ? 1 : 0,
  };
  const res = await POST('/admin/settings', settings);
  if (res?.ok) toast('Settings saved!');
  else toast('Failed to save settings.', 'error');
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: PROFILE
═══════════════════════════════════════════════════════════════════ */
function viewProfile() {
  const u = state.user || {};
  setContent(`
    ${pageTitle('My Profile', escHtml(u.email||''))}
    <div class="card" style="max-width:480px">
      <div style="padding:24px">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input class="form-control" value="${escHtml(u.name||'')}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" value="${escHtml(u.email||'')}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <input class="form-control" value="${escHtml(roleLabel(u.role||''))}" disabled>
        </div>
        <hr style="border-color:#1e293b;margin:24px 0">
        <h4 style="color:#e2e8f0;margin-bottom:16px">Change Password</h4>
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input id="pwd-current" type="password" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input id="pwd-new" type="password" class="form-control">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input id="pwd-confirm" type="password" class="form-control">
        </div>
        <button class="btn btn-primary" onclick="BKDN.changePassword()">Update Password</button>
      </div>
    </div>
  `);
}

async function changePassword() {
  const cur = document.getElementById('pwd-current').value;
  const nw  = document.getElementById('pwd-new').value;
  const conf= document.getElementById('pwd-confirm').value;
  if (!cur || !nw) { toast('Fill in all password fields.', 'error'); return; }
  if (nw !== conf) { toast('New passwords do not match.', 'error'); return; }
  if (nw.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }

  const res = await POST('/auth/change-password', { current_password: cur, new_password: nw });
  if (res?.ok) {
    toast('Password updated! Please sign in again.');
    setTimeout(logout, 1500);
  } else {
    toast(res?.data?.message || 'Failed to change password.', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   VIEW: USERS (super_admin only)
═══════════════════════════════════════════════════════════════════ */
async function viewUsers() {
  if (!can(['super_admin'])) { navigate('/dashboard'); return; }
  setContent(loading());
  const res = await GET('/admin/users');
  const users = res?.data?.users || [];

  const rows = users.map(u => `
    <tr>
      <td>${escHtml(u.name)}</td>
      <td>${escHtml(u.email)}</td>
      <td><span class="badge badge-blue">${escHtml(roleLabel(u.role))}</span></td>
      <td>${escHtml(u.store_slug||'—')}</td>
      <td><span class="badge badge-${u.is_active?'green':'gray'}">${u.is_active?'Active':'Inactive'}</span></td>
      <td>${fmtDate(u.last_login)}</td>
      <td>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-sm btn-ghost" onclick="BKDN.openEditUser(${u.id})">${iconEdit()}</button>
          <button class="btn btn-sm btn-danger" onclick="BKDN.deleteUser(${u.id}, '${escHtml(u.name)}')">${iconTrash()}</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:30px">No users.</td></tr>';

  setContent(`
    ${pageTitle('User Management', 'Control who can access Links Hub')}
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Admin Users</h3>
        <button class="btn btn-primary btn-sm" onclick="BKDN.openCreateUser()">${iconPlus()} New User</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Store</th><th>Status</th><th>Last Login</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `);
}

function userForm(u = {}) {
  const roles = ['super_admin','marketing_manager','store_manager','viewer'];
  const roleOpts = roles.map(r => `<option value="${r}" ${(u.role||'viewer')===r?'selected':''}>${escHtml(roleLabel(r))}</option>`).join('');
  return `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input id="uf-name" class="form-control" value="${escHtml(u.name||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input id="uf-email" type="email" class="form-control" value="${escHtml(u.email||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Password ${u.id?'<span style="color:#64748b;font-size:11px">(leave blank to keep)</span>':' *'}</label>
        <input id="uf-password" type="password" class="form-control" placeholder="${u.id?'(unchanged)':'••••••••'}">
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select id="uf-role" class="form-control">${roleOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Store Slug <span style="color:#64748b;font-size:11px">(for store_manager)</span></label>
        <input id="uf-store" class="form-control" value="${escHtml(u.store_slug||'')}" placeholder="rim / stone-oak / bandera">
      </div>
      ${u.id ? `
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <label class="toggle"><input id="uf-active" type="checkbox" ${u.is_active?'checked':''}><span class="toggle-slider"></span></label>
        <span class="form-label" style="margin:0">Active</span>
      </div>` : ''}
    </div>
  `;
}

function openCreateUser() {
  openModal('New User', userForm(), `
    <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="BKDN.createUser()">Create User</button>
  `);
}

async function createUser() {
  const name  = document.getElementById('uf-name').value.trim();
  const email = document.getElementById('uf-email').value.trim();
  const pwd   = document.getElementById('uf-password').value;
  if (!name || !email || !pwd) { toast('Name, email, and password are required.', 'error'); return; }

  const res = await POST('/admin/users', {
    name, email, password: pwd,
    role:       document.getElementById('uf-role').value,
    store_slug: document.getElementById('uf-store').value.trim() || null,
    is_active:  1,
  });
  if (res?.ok) { toast('User created!'); closeModal(); viewUsers(); }
  else toast(res?.data?.message || 'Failed to create user.', 'error');
}

let editUserId = null;
function openEditUser(id) {
  editUserId = id;
  // Fetch user data from existing table row
  GET('/admin/users').then(res => {
    const u = (res?.data?.users||[]).find(x => x.id === id);
    if (!u) { toast('User not found.', 'error'); return; }
    openModal('Edit User', userForm(u), `
      <button class="btn btn-ghost" onclick="BKDN.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BKDN.updateUser(${id})">Save</button>
    `);
  });
}

async function updateUser(id) {
  const pwd = document.getElementById('uf-password').value;
  const body = {
    name:       document.getElementById('uf-name').value.trim(),
    role:       document.getElementById('uf-role').value,
    store_slug: document.getElementById('uf-store').value.trim() || null,
    is_active:  document.getElementById('uf-active').checked ? 1 : 0,
  };
  if (pwd) body.password = pwd;

  const res = await PUT('/admin/users/' + id, body);
  if (res?.ok) { toast('User updated!'); closeModal(); viewUsers(); }
  else toast(res?.data?.message || 'Failed to update user.', 'error');
}

async function deleteUser(id, name) {
  if (id === state.user?.id) { toast('Cannot delete your own account.', 'error'); return; }
  if (!confirm(`Delete user "${name}"?`)) return;
  const res = await DELETE('/admin/users/' + id);
  if (res?.ok) { toast('User deleted.'); viewUsers(); }
  else toast('Failed to delete user.', 'error');
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC API (attached to window for onclick handlers)
═══════════════════════════════════════════════════════════════════ */
window.BKDN = {
  logout,
  closeModal,
  // Dashboard
  // Pages
  openCreatePage, createPage, duplicatePage, deletePage,
  // Page editor
  savePage, saveTheme, resetTheme, togglePageActive, switchTab,
  // Buttons
  openAddButton, addButton, openEditButton, updateButton, duplicateButton, deleteButton, toggleButton,
  // Redirects
  openAddRedirect, addRedirect, deleteRedirect,
  // Analytics
  loadAnalytics,
  // Shortlinks
  openAddShortlink, createShortlink, deleteShortlink, showQR, downloadQR,
  // Settings
  saveSettings,
  // Profile
  changePassword,
  // Users
  openCreateUser, createUser, openEditUser, updateUser, deleteUser,
};

/* ═══════════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Remove the static loading screen
  const splash = document.getElementById('spa-loading');
  if (splash) splash.remove();

  router();
});

})();
