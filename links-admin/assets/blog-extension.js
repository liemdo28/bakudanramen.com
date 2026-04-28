/**
 * Bakudan Ramen — Blog CMS Extension
 * Injects a full Blog/Stories editor into the existing links-admin SPA.
 * TipTap rich editor loaded via esm.sh CDN (no build step).
 */
(function () {
  'use strict';

  const API = (window.BKDN_CONFIG && window.BKDN_CONFIG.rest) || '/api';
  const SITE = (window.BKDN_CONFIG && window.BKDN_CONFIG.siteUrl) || '';

  // ── Token capture ──────────────────────────────────────────────────
  // Monkey-patch fetch to capture JWT as soon as the main SPA makes any auth'd call
  let _cachedToken = null;
  const _origFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (opts && opts.headers) {
      const h = opts.headers instanceof Headers
        ? opts.headers.get('Authorization')
        : (opts.headers['Authorization'] || opts.headers['authorization']);
      if (h && h.startsWith('Bearer ')) _cachedToken = h.slice(7);
    }
    return _origFetch(url, opts);
  };

  function getToken() {
    if (_cachedToken) return _cachedToken;
    const keys = ['bkdn_token', 'bakudan_token', 'token', 'auth_token', 'jwt', 'bakudan-links_token'];
    for (const k of keys) {
      const t = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (t) { _cachedToken = t; return t; }
    }
    return null;
  }

  // ── API helpers ────────────────────────────────────────────────────
  async function apiFetch(method, path, body) {
    const tok = getToken();
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...(tok ? { 'Authorization': 'Bearer ' + tok } : {}) },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    return r.json();
  }

  async function uploadFile(file, onProgress) {
    const fd = new FormData();
    fd.append('file', file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', API + '/upload');
      const tok = getToken();
      if (tok) xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
      xhr.onload = () => resolve(JSON.parse(xhr.responseText));
      xhr.onerror = () => reject(new Error('Upload failed'));
      if (onProgress) xhr.upload.onprogress = e => onProgress(e.loaded / e.total);
      xhr.send(fd);
    });
  }

  // ── State ──────────────────────────────────────────────────────────
  const state = {
    view: 'list',        // 'list' | 'editor'
    posts: [],
    total: 0,
    loading: false,
    filter: 'all',
    search: '',
    currentPost: null,
    editor: null,        // TipTap Editor instance
    tiptapLoaded: false,
    autoSaveTimer: null,
    autoSaveStatus: '',  // '' | 'saving' | 'saved' | 'error'
    previewTab: 'desktop',
    form: {
      id: null, title: '', slug: '', excerpt: '', category: '',
      tags: '', cover_image: '', og_image: '',
      seo_title: '', seo_description: '',
      status: 'draft', scheduled_at: '',
      content: '', tiptap_json: null,
    },
  };

  // ── Overlay container ──────────────────────────────────────────────
  let overlay = null;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'bkdn-blog-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9000;',
      'background:#0f172a;color:#e2e8f0;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'display:none;flex-direction:column;overflow:hidden;',
    ].join('');
    document.body.appendChild(overlay);
    injectStyles();
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #bkdn-blog-overlay * { box-sizing: border-box; }
      #bkdn-blog-overlay button { cursor: pointer; }
      .bkdn-btn {
        display:inline-flex;align-items:center;gap:6px;
        padding:7px 14px;border-radius:7px;border:none;
        font-size:13px;font-weight:600;transition:all .15s;
      }
      .bkdn-btn-primary { background:#ef4444;color:#fff; }
      .bkdn-btn-primary:hover { background:#dc2626; }
      .bkdn-btn-ghost { background:transparent;color:#94a3b8;border:1px solid #334155; }
      .bkdn-btn-ghost:hover { background:#1e293b;color:#e2e8f0; }
      .bkdn-btn-danger { background:transparent;color:#f87171;border:1px solid #7f1d1d; }
      .bkdn-btn-danger:hover { background:#7f1d1d;color:#fff; }
      .bkdn-btn-sm { padding:5px 10px;font-size:12px; }
      .bkdn-badge {
        display:inline-block;padding:2px 8px;border-radius:12px;
        font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;
      }
      .bkdn-badge-published { background:#14532d;color:#86efac; }
      .bkdn-badge-draft     { background:#1e3a5f;color:#93c5fd; }
      .bkdn-badge-scheduled { background:#78350f;color:#fcd34d; }
      .bkdn-badge-archived  { background:#1e293b;color:#64748b; }
      .bkdn-input {
        width:100%;padding:8px 12px;border-radius:7px;
        background:#1e293b;border:1px solid #334155;color:#e2e8f0;
        font-size:14px;outline:none;transition:border .15s;
      }
      .bkdn-input:focus { border-color:#ef4444; }
      .bkdn-input::placeholder { color:#64748b; }
      .bkdn-label { display:block;font-size:12px;color:#94a3b8;margin-bottom:5px;font-weight:500; }
      .bkdn-field { margin-bottom:16px; }
      .bkdn-section { margin-bottom:24px; }
      .bkdn-section-title {
        font-size:11px;text-transform:uppercase;letter-spacing:.8px;
        color:#64748b;font-weight:700;margin-bottom:12px;
        padding-bottom:8px;border-bottom:1px solid #1e293b;
      }

      /* Blog list table */
      .bkdn-post-table { width:100%;border-collapse:collapse; }
      .bkdn-post-table th {
        text-align:left;padding:10px 12px;font-size:11px;
        text-transform:uppercase;letter-spacing:.6px;color:#64748b;
        border-bottom:1px solid #1e293b;font-weight:600;
      }
      .bkdn-post-table td { padding:12px;border-bottom:1px solid #0f172a;vertical-align:middle; }
      .bkdn-post-row { transition:background .1s; }
      .bkdn-post-row:hover { background:#1e293b; }
      .bkdn-post-title { font-weight:600;color:#e2e8f0;font-size:14px;line-height:1.4; }
      .bkdn-post-meta { font-size:12px;color:#64748b;margin-top:3px; }

      /* TipTap editor */
      .bkdn-editor-wrap {
        border:1px solid #334155;border-radius:8px;overflow:hidden;
        display:flex;flex-direction:column;flex:1;min-height:0;
      }
      .bkdn-toolbar {
        display:flex;flex-wrap:wrap;gap:2px;padding:8px;
        background:#1e293b;border-bottom:1px solid #334155;
        align-items:center;
      }
      .bkdn-tb-btn {
        padding:5px 7px;border:none;border-radius:5px;
        background:transparent;color:#94a3b8;font-size:13px;
        transition:all .1s;line-height:1;
      }
      .bkdn-tb-btn:hover { background:#334155;color:#e2e8f0; }
      .bkdn-tb-btn.is-active { background:#ef4444;color:#fff; }
      .bkdn-tb-sep { width:1px;height:20px;background:#334155;margin:0 4px; }
      .bkdn-tb-select {
        padding:4px 6px;border-radius:5px;
        background:#0f172a;border:1px solid #334155;color:#94a3b8;
        font-size:12px;outline:none;
      }
      .bkdn-editor-content {
        flex:1;overflow-y:auto;padding:24px 32px;
        background:#0f172a;line-height:1.75;font-size:16px;
      }
      .bkdn-editor-content .ProseMirror { outline:none;min-height:300px; }
      .bkdn-editor-content .ProseMirror p.is-editor-empty:first-child::before {
        content:attr(data-placeholder);color:#475569;pointer-events:none;float:left;height:0;
      }
      .bkdn-editor-content h1 { font-size:2em;font-weight:700;margin:1em 0 .5em; }
      .bkdn-editor-content h2 { font-size:1.5em;font-weight:700;margin:.9em 0 .4em; }
      .bkdn-editor-content h3 { font-size:1.25em;font-weight:600;margin:.8em 0 .3em; }
      .bkdn-editor-content blockquote {
        border-left:3px solid #ef4444;padding-left:16px;color:#94a3b8;font-style:italic;
      }
      .bkdn-editor-content code {
        background:#1e293b;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:.9em;
      }
      .bkdn-editor-content pre {
        background:#1e293b;padding:16px;border-radius:8px;overflow-x:auto;
      }
      .bkdn-editor-content pre code { background:none;padding:0; }
      .bkdn-editor-content a { color:#ef4444;text-decoration:underline; }
      .bkdn-editor-content img { max-width:100%;border-radius:8px;margin:8px 0; }
      .bkdn-editor-content table { border-collapse:collapse;width:100%;margin:16px 0; }
      .bkdn-editor-content th,
      .bkdn-editor-content td { border:1px solid #334155;padding:8px 12px; }
      .bkdn-editor-content th { background:#1e293b;font-weight:600; }
      .bkdn-editor-content ul,
      .bkdn-editor-content ol { padding-left:1.5em; }

      /* Char count */
      .bkdn-charcount { font-size:11px;color:#475569;padding:4px 12px;text-align:right;background:#0a0f1a; }

      /* Image upload area */
      .bkdn-drop-zone {
        border:2px dashed #334155;border-radius:8px;padding:24px;
        text-align:center;color:#64748b;font-size:13px;transition:all .2s;cursor:pointer;
      }
      .bkdn-drop-zone:hover { border-color:#ef4444;color:#e2e8f0; }
      .bkdn-drop-zone.drag-over { border-color:#ef4444;background:#1a0a0a; }

      /* Preview pane */
      .bkdn-preview-tabs { display:flex;gap:4px;padding:12px 16px;border-bottom:1px solid #1e293b; }
      .bkdn-preview-tab {
        padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;
        border:none;background:transparent;color:#64748b;transition:all .15s;
      }
      .bkdn-preview-tab.active { background:#ef4444;color:#fff; }
      .bkdn-preview-tab:hover:not(.active) { background:#1e293b;color:#e2e8f0; }

      /* Scrollbar */
      #bkdn-blog-overlay ::-webkit-scrollbar { width:6px;height:6px; }
      #bkdn-blog-overlay ::-webkit-scrollbar-track { background:#0f172a; }
      #bkdn-blog-overlay ::-webkit-scrollbar-thumb { background:#334155;border-radius:3px; }
    `;
    document.head.appendChild(style);
  }

  // ── Nav injection ──────────────────────────────────────────────────
  function injectNav() {
    const tryInject = () => {
      const navs = document.querySelectorAll('nav a, [class*="sidebar"] a, [class*="nav"] a, aside a');
      let inserted = false;
      for (const a of navs) {
        if (a.textContent.trim().match(/dashboard|pages|buttons|link/i) && !document.getElementById('bkdn-blog-navlink')) {
          const li = a.closest('li') || a.parentElement;
          const parent = li.parentElement;
          const newEl = li.cloneNode ? li.cloneNode(true) : document.createElement('li');
          newEl.id = 'bkdn-blog-navlink-wrap';
          newEl.innerHTML = '';
          const link = document.createElement('a');
          link.id = 'bkdn-blog-navlink';
          link.href = '#';
          link.innerHTML = a.innerHTML.replace(/[a-zA-Z一-鿿].*/s, '') + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Blog CMS';
          link.style.cssText = a.style.cssText;
          link.className = a.className;
          link.style.cursor = 'pointer';
          link.onclick = e => { e.preventDefault(); showBlog(); };
          newEl.appendChild(link);
          parent.appendChild(newEl);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        // Fallback: inject a floating button
        if (!document.getElementById('bkdn-blog-fab')) {
          const fab = document.createElement('button');
          fab.id = 'bkdn-blog-fab';
          fab.innerHTML = '✏️ Blog CMS';
          fab.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:8999;padding:12px 20px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(239,68,68,.4);';
          fab.onclick = showBlog;
          document.body.appendChild(fab);
        }
      }
    };
    // Try immediately, then retry in case SPA renders asynchronously
    tryInject();
    setTimeout(tryInject, 1000);
    setTimeout(tryInject, 3000);
  }

  // ── Show / hide ────────────────────────────────────────────────────
  function showBlog() {
    overlay.style.display = 'flex';
    if (state.view === 'list') loadPostsAndRender();
    else render();
  }

  function hideBlog() {
    overlay.style.display = 'none';
    destroyEditor();
    state.view = 'list';
  }

  // ── Main render ────────────────────────────────────────────────────
  function render() {
    if (state.view === 'list') renderList();
    else if (state.view === 'editor') renderEditor();
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────
  async function loadPostsAndRender() {
    state.loading = true;
    renderList();
    const params = new URLSearchParams();
    if (state.filter !== 'all') params.set('status', state.filter);
    if (state.search) params.set('q', state.search);
    params.set('limit', '50');
    const res = await apiFetch('GET', '/blog?' + params);
    if (res.ok) { state.posts = res.data.posts; state.total = res.data.total; }
    state.loading = false;
    renderList();
  }

  function renderList() {
    const filterTabs = ['all','published','draft','scheduled','archived'].map(f => `
      <button class="bkdn-preview-tab ${state.filter===f?'active':''}" data-filter="${f}" style="font-size:13px;">
        ${f.charAt(0).toUpperCase()+f.slice(1)}
      </button>`).join('');

    const rows = state.loading
      ? '<tr><td colspan="5" style="text-align:center;padding:40px;color:#64748b;">Loading…</td></tr>'
      : state.posts.length === 0
        ? '<tr><td colspan="5" style="text-align:center;padding:40px;color:#64748b;">No posts found.</td></tr>'
        : state.posts.map(p => `
          <tr class="bkdn-post-row" data-id="${p.id}">
            <td>
              <div class="bkdn-post-title">${esc(p.title)}</div>
              <div class="bkdn-post-meta">/stories/${esc(p.slug)}${p.category?' · '+esc(p.category):''}</div>
            </td>
            <td><span class="bkdn-badge bkdn-badge-${p.status}">${p.status}</span></td>
            <td style="font-size:12px;color:#64748b;white-space:nowrap;">${p.reading_time||1} min read</td>
            <td style="font-size:12px;color:#64748b;white-space:nowrap;">${fmtDate(p.published_at||p.created_at)}</td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="bkdn-btn bkdn-btn-ghost bkdn-btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
                ${p.status==='published'?`<a href="${SITE}/stories/${p.slug}" target="_blank" class="bkdn-btn bkdn-btn-ghost bkdn-btn-sm" style="text-decoration:none;">View</a>`:''}
                <button class="bkdn-btn bkdn-btn-danger bkdn-btn-sm" data-action="archive" data-id="${p.id}">Archive</button>
              </div>
            </td>
          </tr>`).join('');

    overlay.innerHTML = `
      <div style="display:flex;align-items:center;padding:14px 20px;background:#0a0f1a;border-bottom:1px solid #1e293b;gap:12px;flex-shrink:0;">
        <button onclick="window._bkdnBlog.hide()" style="padding:6px 10px;background:transparent;border:none;color:#64748b;font-size:18px;line-height:1;">←</button>
        <div style="display:flex;align-items:center;gap:10px;flex:1;">
          <span style="font-size:18px;font-weight:700;color:#e2e8f0;">Blog CMS</span>
          <span style="font-size:12px;color:#64748b;">${state.total} post${state.total!==1?'s':''}</span>
        </div>
        <button class="bkdn-btn bkdn-btn-primary" id="bkdn-new-post-btn">+ New Post</button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;background:#0a0f1a;flex-shrink:0;">
        <div style="display:flex;gap:4px;">${filterTabs}</div>
        <div style="flex:1;max-width:320px;margin-left:auto;">
          <input id="bkdn-search" class="bkdn-input" placeholder="Search posts…" value="${esc(state.search)}" style="padding:6px 12px;font-size:13px;">
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:20px;">
        <div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:10px;overflow:hidden;">
          <table class="bkdn-post-table">
            <thead>
              <tr>
                <th>Title</th><th>Status</th><th>Read</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;

    // Events
    overlay.querySelector('#bkdn-new-post-btn').onclick = () => openEditor(null);

    overlay.querySelectorAll('[data-filter]').forEach(btn => {
      btn.onclick = () => { state.filter = btn.dataset.filter; loadPostsAndRender(); };
    });

    let searchTimer;
    overlay.querySelector('#bkdn-search').oninput = e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = e.target.value; loadPostsAndRender(); }, 400);
    };

    overlay.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.onclick = () => openEditor(parseInt(btn.dataset.id));
    });

    overlay.querySelectorAll('[data-action="archive"]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Archive this post?')) return;
        await apiFetch('DELETE', '/blog/' + btn.dataset.id);
        loadPostsAndRender();
      };
    });
  }

  // ── EDITOR VIEW ────────────────────────────────────────────────────
  async function openEditor(postId) {
    destroyEditor();
    state.view = 'editor';
    if (postId) {
      const res = await apiFetch('GET', '/blog/' + postId);
      if (res.ok) {
        const p = res.data.post;
        state.form = {
          id: p.id, title: p.title || '', slug: p.slug || '',
          excerpt: p.excerpt || '', category: p.category || '',
          tags: p.tags || '', cover_image: p.cover_image || '',
          og_image: p.og_image || '', seo_title: p.seo_title || '',
          seo_description: p.seo_description || '', status: p.status || 'draft',
          scheduled_at: p.scheduled_at || '', content: p.content || '',
          tiptap_json: p.tiptap_json ? (typeof p.tiptap_json === 'string' ? JSON.parse(p.tiptap_json) : p.tiptap_json) : null,
        };
        state.currentPost = p;
      }
    } else {
      state.form = {
        id: null, title: '', slug: '', excerpt: '', category: '',
        tags: '', cover_image: '', og_image: '', seo_title: '',
        seo_description: '', status: 'draft', scheduled_at: '',
        content: '', tiptap_json: null,
      };
      state.currentPost = null;
    }
    renderEditor();
  }

  function renderEditor() {
    const f = state.form;
    const isNew = !f.id;

    overlay.innerHTML = `
      <div style="display:flex;align-items:center;padding:12px 16px;background:#0a0f1a;border-bottom:1px solid #1e293b;gap:10px;flex-shrink:0;">
        <button id="bkdn-back-btn" class="bkdn-btn bkdn-btn-ghost bkdn-btn-sm">← Back</button>
        <div style="flex:1;">
          <input id="bkdn-title-input" class="bkdn-input" placeholder="Post title…"
            value="${esc(f.title)}"
            style="font-size:20px;font-weight:700;background:transparent;border:none;padding:4px 0;width:100%;color:#e2e8f0;">
        </div>
        <span id="bkdn-autosave-badge" style="font-size:11px;color:#64748b;padding:0 8px;"></span>
        <button id="bkdn-save-draft-btn" class="bkdn-btn bkdn-btn-ghost bkdn-btn-sm">Save Draft</button>
        <button id="bkdn-preview-btn" class="bkdn-btn bkdn-btn-ghost bkdn-btn-sm">Preview</button>
        <button id="bkdn-publish-btn" class="bkdn-btn bkdn-btn-primary bkdn-btn-sm">
          ${f.status === 'published' ? 'Update' : 'Publish'}
        </button>
      </div>

      <div style="display:flex;flex:1;min-height:0;">
        <!-- Editor column -->
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;padding:16px;gap:8px;">
          <div class="bkdn-editor-wrap" id="bkdn-editor-wrap">
            <div class="bkdn-toolbar" id="bkdn-toolbar">
              <span style="font-size:12px;color:#475569;">Loading editor…</span>
            </div>
            <div class="bkdn-editor-content" id="bkdn-editor-mount"></div>
            <div class="bkdn-charcount" id="bkdn-charcount">0 words</div>
          </div>
        </div>

        <!-- Settings sidebar -->
        <div style="width:320px;flex-shrink:0;overflow-y:auto;padding:16px;border-left:1px solid #1e293b;background:#0a0f1a;">

          <div class="bkdn-section">
            <div class="bkdn-section-title">Publish Settings</div>
            <div class="bkdn-field">
              <label class="bkdn-label">Status</label>
              <select id="bkdn-status-sel" class="bkdn-input bkdn-tb-select" style="width:100%;background:#1e293b;">
                <option value="draft" ${f.status==='draft'?'selected':''}>Draft</option>
                <option value="published" ${f.status==='published'?'selected':''}>Published</option>
                <option value="scheduled" ${f.status==='scheduled'?'selected':''}>Scheduled</option>
              </select>
            </div>
            <div class="bkdn-field" id="bkdn-sched-wrap" style="${f.status!=='scheduled'?'display:none':''}">
              <label class="bkdn-label">Publish At (UTC)</label>
              <input id="bkdn-scheduled-at" class="bkdn-input" type="datetime-local" value="${f.scheduled_at ? f.scheduled_at.replace(' ','T').slice(0,16) : ''}">
            </div>
            <div class="bkdn-field">
              <label class="bkdn-label">URL Slug</label>
              <input id="bkdn-slug" class="bkdn-input" value="${esc(f.slug)}" placeholder="auto-generated">
            </div>
          </div>

          <div class="bkdn-section">
            <div class="bkdn-section-title">Post Info</div>
            <div class="bkdn-field">
              <label class="bkdn-label">Excerpt (max 160 chars)</label>
              <textarea id="bkdn-excerpt" class="bkdn-input" rows="3" maxlength="200" placeholder="Short description of this post…" style="resize:vertical;">${esc(f.excerpt)}</textarea>
            </div>
            <div class="bkdn-field">
              <label class="bkdn-label">Category</label>
              <input id="bkdn-category" class="bkdn-input" value="${esc(f.category)}" placeholder="e.g. Ramen Tips">
            </div>
            <div class="bkdn-field">
              <label class="bkdn-label">Tags (comma-separated)</label>
              <input id="bkdn-tags" class="bkdn-input" value="${esc(f.tags)}" placeholder="tonkotsu, broth, recipe">
            </div>
          </div>

          <div class="bkdn-section">
            <div class="bkdn-section-title">Featured Image</div>
            <div class="bkdn-field">
              <div class="bkdn-drop-zone" id="bkdn-cover-drop">
                ${f.cover_image
                  ? `<img src="${esc(f.cover_image)}" style="max-width:100%;max-height:120px;border-radius:6px;object-fit:cover;">`
                  : '<div>Click or drop image here</div><div style="font-size:11px;margin-top:4px;">JPEG, PNG, WEBP — max 10 MB</div>'}
              </div>
              <input type="file" id="bkdn-cover-file" accept="image/*" style="display:none;">
              <input id="bkdn-cover-image" class="bkdn-input" value="${esc(f.cover_image)}" placeholder="or paste URL" style="margin-top:8px;font-size:12px;">
            </div>
          </div>

          <div class="bkdn-section">
            <div class="bkdn-section-title">SEO & Social</div>
            <div class="bkdn-field">
              <label class="bkdn-label">SEO Title (max 60 chars)</label>
              <input id="bkdn-seo-title" class="bkdn-input" maxlength="70" value="${esc(f.seo_title)}" placeholder="Defaults to post title">
              <div id="bkdn-seo-title-count" style="font-size:11px;color:#64748b;margin-top:3px;text-align:right;">${f.seo_title.length}/60</div>
            </div>
            <div class="bkdn-field">
              <label class="bkdn-label">SEO Description (max 155 chars)</label>
              <textarea id="bkdn-seo-desc" class="bkdn-input" rows="3" maxlength="170" placeholder="Defaults to excerpt…" style="resize:vertical;">${esc(f.seo_description)}</textarea>
              <div id="bkdn-seo-desc-count" style="font-size:11px;color:#64748b;margin-top:3px;text-align:right;">${f.seo_description.length}/155</div>
            </div>
            <div class="bkdn-field">
              <label class="bkdn-label">OG Image URL (social share)</label>
              <input id="bkdn-og-image" class="bkdn-input" value="${esc(f.og_image)}" placeholder="Defaults to featured image">
            </div>
          </div>

          <div id="bkdn-seo-preview" class="bkdn-section" style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;">
            <div class="bkdn-section-title" style="border:none;margin-bottom:8px;">Google Preview</div>
            <div id="bkdn-google-title" style="font-size:16px;color:#8ab4f8;font-weight:600;line-height:1.3;margin-bottom:4px;">${esc(f.seo_title||f.title||'Post Title')}</div>
            <div style="font-size:12px;color:#34a853;margin-bottom:4px;">${SITE}/stories/${esc(f.slug||'your-post-slug')}</div>
            <div id="bkdn-google-desc" style="font-size:13px;color:#bdc1c6;line-height:1.5;">${esc(f.seo_description||f.excerpt||'Your post description will appear here…')}</div>
          </div>
        </div>
      </div>

      <!-- Preview modal -->
      <div id="bkdn-preview-modal" style="display:none;position:absolute;inset:0;z-index:100;background:#0f172a;flex-direction:column;">
        <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #1e293b;flex-shrink:0;">
          <div class="bkdn-preview-tabs" style="padding:0;border:none;">
            <button class="bkdn-preview-tab active" data-tab="desktop">Desktop</button>
            <button class="bkdn-preview-tab" data-tab="mobile">Mobile</button>
            <button class="bkdn-preview-tab" data-tab="seo">SEO Card</button>
          </div>
          <button id="bkdn-close-preview" style="margin-left:auto;" class="bkdn-btn bkdn-btn-ghost bkdn-btn-sm">✕ Close</button>
        </div>
        <div id="bkdn-preview-body" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:20px;background:#1e293b;"></div>
      </div>`;

    bindEditorEvents();
    initTipTap();
  }

  function bindEditorEvents() {
    const f = state.form;

    overlay.querySelector('#bkdn-back-btn').onclick = () => {
      if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
      destroyEditor();
      state.view = 'list';
      loadPostsAndRender();
    };

    const titleInput = overlay.querySelector('#bkdn-title-input');
    titleInput.oninput = e => {
      f.title = e.target.value;
      if (!f.id) {
        const slugEl = overlay.querySelector('#bkdn-slug');
        const auto = slugify(f.title);
        slugEl.value = auto;
        f.slug = auto;
      }
      scheduleAutoSave();
      updateSeoPreview();
    };

    overlay.querySelector('#bkdn-slug').oninput = e => { f.slug = e.target.value; updateSeoPreview(); };
    overlay.querySelector('#bkdn-excerpt').oninput = e => { f.excerpt = e.target.value; scheduleAutoSave(); updateSeoPreview(); };
    overlay.querySelector('#bkdn-category').oninput = e => { f.category = e.target.value; };
    overlay.querySelector('#bkdn-tags').oninput = e => { f.tags = e.target.value; };

    const statusSel = overlay.querySelector('#bkdn-status-sel');
    statusSel.onchange = e => {
      f.status = e.target.value;
      const sw = overlay.querySelector('#bkdn-sched-wrap');
      if (sw) sw.style.display = f.status === 'scheduled' ? '' : 'none';
    };
    overlay.querySelector('#bkdn-scheduled-at').oninput = e => { f.scheduled_at = e.target.value.replace('T',' '); };

    const seoTitleEl = overlay.querySelector('#bkdn-seo-title');
    seoTitleEl.oninput = e => {
      f.seo_title = e.target.value;
      overlay.querySelector('#bkdn-seo-title-count').textContent = f.seo_title.length + '/60';
      updateSeoPreview();
    };
    const seoDescEl = overlay.querySelector('#bkdn-seo-desc');
    seoDescEl.oninput = e => {
      f.seo_description = e.target.value;
      overlay.querySelector('#bkdn-seo-desc-count').textContent = f.seo_description.length + '/155';
      updateSeoPreview();
    };
    overlay.querySelector('#bkdn-og-image').oninput = e => { f.og_image = e.target.value; };
    overlay.querySelector('#bkdn-cover-image').oninput = e => {
      f.cover_image = e.target.value;
      updateCoverPreview(f.cover_image);
    };

    // Cover image upload
    const dropZone = overlay.querySelector('#bkdn-cover-drop');
    const fileInput = overlay.querySelector('#bkdn-cover-file');
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
    dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
    dropZone.ondrop = e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleCoverUpload(e.dataTransfer.files[0]);
    };
    fileInput.onchange = e => { if (e.target.files[0]) handleCoverUpload(e.target.files[0]); };

    // Save / publish
    overlay.querySelector('#bkdn-save-draft-btn').onclick = () => savePost('draft');
    overlay.querySelector('#bkdn-publish-btn').onclick = () => {
      const s = f.status === 'published' ? 'published' : 'published';
      savePost(s);
    };

    // Preview
    overlay.querySelector('#bkdn-preview-btn').onclick = showPreview;
    overlay.querySelector('#bkdn-close-preview').onclick = () => {
      overlay.querySelector('#bkdn-preview-modal').style.display = 'none';
    };
    overlay.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.previewTab = btn.dataset.tab;
        renderPreviewBody();
      };
    });
  }

  function updateSeoPreview() {
    const f = state.form;
    const gtEl = overlay.querySelector('#bkdn-google-title');
    const gdEl = overlay.querySelector('#bkdn-google-desc');
    const slugEl = overlay.querySelector('#bkdn-seo-preview div:nth-child(3)');
    if (gtEl) gtEl.textContent = f.seo_title || f.title || 'Post Title';
    if (gdEl) gdEl.textContent = f.seo_description || f.excerpt || 'Your post description will appear here…';
    const slugPart = overlay.querySelector('#bkdn-seo-preview');
    if (slugPart) {
      const urlDiv = slugPart.querySelectorAll('div')[1];
      if (urlDiv) urlDiv.textContent = SITE + '/stories/' + (f.slug || 'your-post-slug');
    }
  }

  async function handleCoverUpload(file) {
    const zone = overlay.querySelector('#bkdn-cover-drop');
    zone.innerHTML = '<div style="color:#94a3b8;">Uploading…</div>';
    try {
      const res = await uploadFile(file);
      if (res.ok && res.data.url) {
        state.form.cover_image = res.data.url;
        const urlInput = overlay.querySelector('#bkdn-cover-image');
        if (urlInput) urlInput.value = res.data.url;
        updateCoverPreview(res.data.url);
      } else {
        zone.innerHTML = '<div style="color:#f87171;">Upload failed. Try a URL instead.</div>';
      }
    } catch {
      zone.innerHTML = '<div style="color:#f87171;">Upload error.</div>';
    }
  }

  function updateCoverPreview(url) {
    const zone = overlay.querySelector('#bkdn-cover-drop');
    if (!zone) return;
    zone.innerHTML = url
      ? `<img src="${esc(url)}" style="max-width:100%;max-height:120px;border-radius:6px;object-fit:cover;">`
      : '<div>Click or drop image here</div><div style="font-size:11px;margin-top:4px;">JPEG, PNG, WEBP — max 10 MB</div>';
  }

  // ── TipTap ─────────────────────────────────────────────────────────
  async function initTipTap() {
    const mount = overlay.querySelector('#bkdn-editor-mount');
    if (!mount) return;

    if (!state.tiptapLoaded) {
      overlay.querySelector('#bkdn-toolbar').innerHTML = '<span style="font-size:12px;color:#64748b;">Loading editor…</span>';
    }

    try {
      const [
        { Editor },
        { default: StarterKit },
        { default: Underline },
        { default: Link },
        { default: Image },
        { default: TextAlign },
        { default: TextStyle },
        { default: Color },
        { default: Highlight },
        { default: Table },
        { default: TableRow },
        { default: TableCell },
        { default: TableHeader },
        { default: Placeholder },
        { default: FontFamily },
        { default: CharacterCount },
      ] = await Promise.all([
        import('https://esm.sh/@tiptap/core@2.11.5'),
        import('https://esm.sh/@tiptap/starter-kit@2.11.5'),
        import('https://esm.sh/@tiptap/extension-underline@2.11.5'),
        import('https://esm.sh/@tiptap/extension-link@2.11.5'),
        import('https://esm.sh/@tiptap/extension-image@2.11.5'),
        import('https://esm.sh/@tiptap/extension-text-align@2.11.5'),
        import('https://esm.sh/@tiptap/extension-text-style@2.11.5'),
        import('https://esm.sh/@tiptap/extension-color@2.11.5'),
        import('https://esm.sh/@tiptap/extension-highlight@2.11.5'),
        import('https://esm.sh/@tiptap/extension-table@2.11.5'),
        import('https://esm.sh/@tiptap/extension-table-row@2.11.5'),
        import('https://esm.sh/@tiptap/extension-table-cell@2.11.5'),
        import('https://esm.sh/@tiptap/extension-table-header@2.11.5'),
        import('https://esm.sh/@tiptap/extension-placeholder@2.11.5'),
        import('https://esm.sh/@tiptap/extension-font-family@2.11.5'),
        import('https://esm.sh/@tiptap/extension-character-count@2.11.5'),
      ]);

      state.tiptapLoaded = true;

      const editor = new Editor({
        element: mount,
        extensions: [
          StarterKit,
          Underline,
          Link.configure({ openOnClick: false, autolink: true }),
          Image.configure({ inline: false, allowBase64: true }),
          TextAlign.configure({ types: ['heading', 'paragraph'] }),
          TextStyle,
          Color,
          Highlight.configure({ multicolor: true }),
          Table.configure({ resizable: false }),
          TableRow, TableCell, TableHeader,
          Placeholder.configure({ placeholder: 'Start writing your story here…' }),
          FontFamily,
          CharacterCount,
        ],
        content: state.form.tiptap_json || state.form.content || '',
        onUpdate({ editor }) {
          state.form.content = editor.getHTML();
          state.form.tiptap_json = editor.getJSON();
          const wc = editor.storage.characterCount.words();
          const ccEl = document.querySelector('#bkdn-charcount');
          if (ccEl) ccEl.textContent = wc + ' word' + (wc !== 1 ? 's' : '') + ' · ~' + Math.max(1, Math.round(wc / 200)) + ' min read';
          scheduleAutoSave();
        },
      });

      state.editor = editor;

      // Handle image paste
      mount.addEventListener('paste', async e => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (imgItem) {
          e.preventDefault();
          const file = imgItem.getAsFile();
          try {
            const res = await uploadFile(file);
            if (res.ok) editor.chain().focus().setImage({ src: res.data.url }).run();
          } catch {}
        }
      });

      renderToolbar(editor);
    } catch (err) {
      console.error('[Blog CMS] TipTap load error:', err);
      const tb = overlay.querySelector('#bkdn-toolbar');
      if (tb) tb.innerHTML = `<span style="color:#f87171;font-size:12px;">Editor failed to load: ${err.message}</span>`;
    }
  }

  function renderToolbar(editor) {
    const tb = overlay.querySelector('#bkdn-toolbar');
    if (!tb) return;

    const btn = (icon, cmd, tip, checkFn) => {
      const b = document.createElement('button');
      b.className = 'bkdn-tb-btn';
      b.title = tip;
      b.innerHTML = icon;
      b.onclick = e => { e.preventDefault(); cmd(); updateToolbar(); };
      if (checkFn) b._check = checkFn;
      return b;
    };
    const sep = () => { const d = document.createElement('div'); d.className = 'bkdn-tb-sep'; return d; };
    const sel = (opts, onChange, title, val) => {
      const s = document.createElement('select');
      s.className = 'bkdn-tb-select';
      s.title = title;
      opts.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; s.appendChild(o); });
      s.value = val || '';
      s.onchange = e => onChange(e.target.value);
      return s;
    };

    tb.innerHTML = '';

    // Heading
    const headSel = sel(
      [['0','Paragraph'],['1','Heading 1'],['2','Heading 2'],['3','Heading 3'],['4','Heading 4']],
      v => v === '0' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: parseInt(v) }).run(),
      'Text style', '0'
    );
    headSel.id = 'bkdn-head-sel';
    tb.appendChild(headSel);

    // Font family
    const fontSel = sel(
      [['','Default'],['Arial','Arial'],['Georgia','Georgia'],['Courier New','Monospace'],['Bebas Neue','Bebas Neue']],
      v => v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run(),
      'Font family', ''
    );
    tb.appendChild(fontSel);

    tb.appendChild(sep());

    // Format buttons
    const fmtBtns = [
      ['<b>B</b>', () => editor.chain().focus().toggleBold().run(), 'Bold', () => editor.isActive('bold')],
      ['<i>I</i>', () => editor.chain().focus().toggleItalic().run(), 'Italic', () => editor.isActive('italic')],
      ['<u>U</u>', () => editor.chain().focus().toggleUnderline().run(), 'Underline', () => editor.isActive('underline')],
      ['<s>S</s>', () => editor.chain().focus().toggleStrike().run(), 'Strikethrough', () => editor.isActive('strike')],
      ['<code>&lt;/&gt;</code>', () => editor.chain().focus().toggleCode().run(), 'Inline code', () => editor.isActive('code')],
    ];
    fmtBtns.forEach(([icon, cmd, tip, check]) => tb.appendChild(btn(icon, cmd, tip, check)));

    tb.appendChild(sep());

    // Align
    [
      ['≡', () => editor.chain().focus().setTextAlign('left').run(), 'Align left', () => editor.isActive({ textAlign: 'left' })],
      ['≡', () => editor.chain().focus().setTextAlign('center').run(), 'Center', () => editor.isActive({ textAlign: 'center' })],
      ['≡', () => editor.chain().focus().setTextAlign('right').run(), 'Right', () => editor.isActive({ textAlign: 'right' })],
    ].forEach(([icon, cmd, tip, check]) => tb.appendChild(btn(icon, cmd, tip, check)));

    tb.appendChild(sep());

    // Lists
    tb.appendChild(btn('• List', () => editor.chain().focus().toggleBulletList().run(), 'Bullet list', () => editor.isActive('bulletList')));
    tb.appendChild(btn('1. List', () => editor.chain().focus().toggleOrderedList().run(), 'Ordered list', () => editor.isActive('orderedList')));
    tb.appendChild(btn('❝', () => editor.chain().focus().toggleBlockquote().run(), 'Blockquote', () => editor.isActive('blockquote')));
    tb.appendChild(btn('```', () => editor.chain().focus().toggleCodeBlock().run(), 'Code block', () => editor.isActive('codeBlock')));
    tb.appendChild(btn('─', () => editor.chain().focus().setHorizontalRule().run(), 'Horizontal rule', null));

    tb.appendChild(sep());

    // Link
    tb.appendChild(btn('🔗', () => {
      const prev = editor.getAttributes('link').href;
      const url = prompt('Link URL:', prev || 'https://');
      if (url === null) return;
      if (url === '') { editor.chain().focus().unsetLink().run(); return; }
      editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
    }, 'Insert link', () => editor.isActive('link')));

    // Image upload
    tb.appendChild(btn('🖼', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async e => {
        if (!e.target.files[0]) return;
        const res = await uploadFile(e.target.files[0]);
        if (res.ok) editor.chain().focus().setImage({ src: res.data.url }).run();
      };
      inp.click();
    }, 'Insert image', null));

    // Image by URL
    tb.appendChild(btn('🌐', () => {
      const url = prompt('Image URL:');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }, 'Image from URL', null));

    tb.appendChild(sep());

    // Table
    tb.appendChild(btn('⊞', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'Insert table', null));

    tb.appendChild(sep());

    // Color
    const colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.title = 'Text color';
    colorInput.style.cssText = 'width:26px;height:26px;border:none;border-radius:4px;cursor:pointer;padding:0;background:transparent;';
    colorInput.onchange = e => editor.chain().focus().setColor(e.target.value).run();
    tb.appendChild(colorInput);

    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color'; bgColorInput.title = 'Highlight color';
    bgColorInput.value = '#fef08a';
    bgColorInput.style.cssText = 'width:26px;height:26px;border:2px solid #334155;border-radius:4px;cursor:pointer;padding:0;';
    bgColorInput.onchange = e => editor.chain().focus().setHighlight({ color: e.target.value }).run();
    tb.appendChild(bgColorInput);

    tb.appendChild(sep());

    // Undo/redo
    tb.appendChild(btn('↩', () => editor.chain().focus().undo().run(), 'Undo', null));
    tb.appendChild(btn('↪', () => editor.chain().focus().redo().run(), 'Redo', null));

    // Update toolbar state on selection change
    editor.on('selectionUpdate', updateToolbar);
    editor.on('transaction', updateToolbar);

    function updateToolbar() {
      tb.querySelectorAll('.bkdn-tb-btn').forEach(b => {
        if (b._check) b.classList.toggle('is-active', b._check());
      });
      // Update heading select
      const hSel = document.getElementById('bkdn-head-sel');
      if (hSel) {
        for (let i = 1; i <= 4; i++) {
          if (editor.isActive('heading', { level: i })) { hSel.value = String(i); return; }
        }
        hSel.value = '0';
      }
    }
  }

  function destroyEditor() {
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    if (state.autoSaveTimer) { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; }
  }

  // ── Auto-save ──────────────────────────────────────────────────────
  function scheduleAutoSave() {
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(() => autoSave(), 5000);
    setBadge('•');
  }

  async function autoSave() {
    if (!state.form.title) return;
    setBadge('Saving…');
    try {
      await savePost(state.form.status, true);
      setBadge('Saved ✓');
      setTimeout(() => setBadge(''), 3000);
    } catch {
      setBadge('⚠ Save failed');
    }
  }

  function setBadge(text) {
    const el = overlay.querySelector('#bkdn-autosave-badge');
    if (el) el.textContent = text;
  }

  // ── Save post ──────────────────────────────────────────────────────
  async function savePost(status, silent = false) {
    const f = state.form;
    if (!f.title) { if (!silent) alert('Title is required.'); return; }

    const payload = {
      title: f.title,
      slug: f.slug || slugify(f.title),
      excerpt: f.excerpt,
      category: f.category,
      tags: f.tags,
      cover_image: f.cover_image,
      og_image: f.og_image || f.cover_image,
      seo_title: f.seo_title,
      seo_description: f.seo_description,
      status: status || f.status,
      scheduled_at: f.scheduled_at || null,
      content: state.editor ? state.editor.getHTML() : f.content,
      tiptap_json: state.editor ? state.editor.getJSON() : f.tiptap_json,
    };

    let res;
    if (f.id) {
      res = await apiFetch('PUT', '/blog/' + f.id, payload);
    } else {
      res = await apiFetch('POST', '/blog', payload);
    }

    if (res.ok) {
      const p = res.data.post;
      state.form.id = p.id;
      state.form.slug = p.slug;
      state.form.status = p.status;
      if (!silent) {
        const slugEl = overlay.querySelector('#bkdn-slug');
        if (slugEl) slugEl.value = p.slug;
        const pubBtn = overlay.querySelector('#bkdn-publish-btn');
        if (pubBtn && p.status === 'published') pubBtn.textContent = 'Update';
      }
    } else {
      if (!silent) alert('Save failed: ' + (res.error || 'Unknown error'));
      throw new Error(res.error);
    }
    return res;
  }

  // ── Preview ────────────────────────────────────────────────────────
  function showPreview() {
    const modal = overlay.querySelector('#bkdn-preview-modal');
    modal.style.display = 'flex';
    renderPreviewBody();
  }

  function renderPreviewBody() {
    const body = overlay.querySelector('#bkdn-preview-body');
    const f = state.form;
    const content = state.editor ? state.editor.getHTML() : f.content;
    const tab = state.previewTab;

    if (tab === 'seo') {
      body.innerHTML = `
        <div style="max-width:600px;width:100%;background:#fff;border-radius:12px;padding:24px;color:#000;">
          <div style="font-size:13px;color:#006621;margin-bottom:4px;">${SITE}/stories/${f.slug||'preview'}</div>
          <div style="font-size:19px;color:#1a0dab;font-weight:400;margin-bottom:6px;">${esc(f.seo_title||f.title||'Post Title')}</div>
          <div style="font-size:13px;color:#545454;">${esc(f.seo_description||f.excerpt||'Post description…')}</div>
          <hr style="margin:20px 0;border-color:#e0e0e0;">
          <div style="font-size:13px;color:#555;margin-bottom:8px;font-weight:600;">Twitter / OG Card</div>
          ${(f.og_image||f.cover_image) ? `<img src="${esc(f.og_image||f.cover_image)}" style="width:100%;height:160px;object-fit:cover;border-radius:8px 8px 0 0;">` : '<div style="width:100%;height:120px;background:#eee;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;color:#999;">No image</div>'}
          <div style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;padding:14px;">
            <div style="font-size:14px;font-weight:600;color:#111;margin-bottom:4px;">${esc(f.seo_title||f.title||'Post Title')}</div>
            <div style="font-size:12px;color:#555;">${esc(f.seo_description||f.excerpt||'Description…')}</div>
            <div style="font-size:11px;color:#999;margin-top:6px;">bakudanramen.com</div>
          </div>
        </div>`;
      return;
    }

    const postHtml = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${esc(f.title)}</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#fff; color:#111; line-height:1.75; }
        .wrap { max-width:700px; margin:0 auto; padding:40px 20px; }
        h1 { font-size:2.2em; font-weight:800; line-height:1.2; margin-bottom:16px; }
        h2 { font-size:1.6em; font-weight:700; margin:32px 0 12px; }
        h3 { font-size:1.25em; font-weight:600; margin:24px 0 10px; }
        p { margin-bottom:16px; }
        img { max-width:100%; border-radius:8px; }
        blockquote { border-left:3px solid #ef4444; padding-left:16px; color:#666; font-style:italic; margin:16px 0; }
        code { background:#f3f4f6; padding:2px 6px; border-radius:4px; font-size:.9em; }
        pre { background:#1e293b; color:#e2e8f0; padding:16px; border-radius:8px; overflow-x:auto; margin:16px 0; }
        table { width:100%; border-collapse:collapse; margin:16px 0; }
        td,th { border:1px solid #e5e7eb; padding:8px 12px; }
        th { background:#f9fafb; font-weight:600; }
        ul,ol { padding-left:1.5em; margin-bottom:16px; }
        .cover { width:100%; height:320px; object-fit:cover; border-radius:12px; margin-bottom:32px; }
        .meta { color:#6b7280; font-size:14px; margin-bottom:32px; }
        a { color:#ef4444; }
      </style></head><body><div class="wrap">
      ${f.cover_image ? `<img class="cover" src="${esc(f.cover_image)}">` : ''}
      <h1>${esc(f.title||'Untitled Post')}</h1>
      <div class="meta">${f.category ? esc(f.category) + ' · ' : ''}${Math.max(1, Math.round((state.editor?.storage?.characterCount?.words()||0)/200))} min read</div>
      ${content || '<p><em>(No content yet)</em></p>'}
      </div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.srcdoc = postHtml;
    iframe.style.cssText = tab === 'mobile'
      ? 'width:390px;height:80vh;border:none;border-radius:12px;box-shadow:0 0 0 2px #334155;'
      : 'width:100%;max-width:900px;height:80vh;border:none;border-radius:12px;';
    body.innerHTML = '';
    body.appendChild(iframe);
  }

  // ── Utils ──────────────────────────────────────────────────────────
  function slugify(str) {
    return str.toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80).replace(/-$/, '');
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }
    catch { return s; }
  }

  // ── Boot ───────────────────────────────────────────────────────────
  function boot() {
    buildOverlay();
    injectNav();
    // Expose public API for debugging
    window._bkdnBlog = { show: showBlog, hide: hideBlog, state };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.addEventListener('bkdn:booted', boot, { once: true });
      setTimeout(boot, 5000); // fallback
    });
  } else {
    document.addEventListener('bkdn:booted', boot, { once: true });
    setTimeout(boot, 3000); // fallback if already loaded
  }
})();
