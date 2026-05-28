/**
 * Operations Module — Production Operations Workflow for Maria
 * ─────────────────────────────────────────────────────────────
 * Provides: Publish Queue, Scheduling, Snapshots, Rollback,
 * Preview, Audit Log, Warnings, Archive/Restore, Timeline
 */
'use strict';

const OPS_API = window.BKDN_CONFIG?.rest || '/api';
const OPS_BASE = `${OPS_API}/ops`;

// ── API Helper ────────────────────────────────────────────────────────
async function opsApi(path, opts = {}) {
  const token = localStorage.getItem('bkdn_token');
  const res = await fetch(`${OPS_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

// ── Operations Views Registry ─────────────────────────────────────────
window.OpsViews = {};

// ── Publish Queue View ────────────────────────────────────────────────
OpsViews.publishQueue = async function (container) {
  const { data } = await opsApi('/publish-queue');
  const items = data?.items || [];
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>📋 Publish Queue</h2>
        <span class="ops-badge">${items.length} pending</span>
      </div>
      ${items.length === 0 ? '<p class="ops-empty">No pending changes. All clear!</p>' : `
        <div class="ops-list">
          ${items.map(item => `
            <div class="ops-card" data-id="${item.id}">
              <div class="ops-card-header">
                <span class="ops-type-badge ops-type-${item.entity_type}">${item.entity_type}</span>
                <span class="ops-action-badge">${item.action || 'publish'}</span>
              </div>
              <p class="ops-card-summary">${item.change_summary || `${item.entity_type} #${item.entity_id}`}</p>
              ${item.scheduled_for ? `<p class="ops-scheduled">⏰ Scheduled: ${new Date(item.scheduled_for).toLocaleString()}</p>` : ''}
              <div class="ops-card-actions">
                <button class="btn-ops btn-approve" onclick="OpsActions.approveQueue(${item.id})">✓ Approve</button>
                <button class="btn-ops btn-reject" onclick="OpsActions.rejectQueue(${item.id})">✗ Reject</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
};

// ── Snapshots & Rollback View ─────────────────────────────────────────
OpsViews.snapshots = async function (container) {
  const { data } = await opsApi('/snapshots?limit=20');
  const snapshots = data?.snapshots || [];
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>📸 System Snapshots</h2>
        <button class="btn-ops btn-primary" onclick="OpsActions.createSnapshot()">+ Create Snapshot</button>
      </div>
      <p class="ops-hint">Snapshots capture the full system state. Use rollback to restore any previous version.</p>
      ${snapshots.length === 0 ? '<p class="ops-empty">No snapshots yet.</p>' : `
        <div class="ops-list">
          ${snapshots.map(s => `
            <div class="ops-card ops-snapshot-card">
              <div class="ops-card-header">
                <span class="ops-type-badge ops-type-snapshot">${s.trigger_type}</span>
                <span class="ops-timestamp">${new Date(s.created_at).toLocaleString()}</span>
              </div>
              <p class="ops-card-summary"><strong>${s.label || 'Unnamed snapshot'}</strong></p>
              ${s.created_by_name ? `<p class="ops-user">by ${s.created_by_name}</p>` : ''}
              <div class="ops-card-actions">
                <button class="btn-ops btn-view" onclick="OpsActions.viewSnapshot(${s.id})">View</button>
                ${s.is_rollback_target ? `<button class="btn-ops btn-danger" onclick="OpsActions.rollback(${s.id})">⏪ Rollback</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
};

// ── Warnings View ─────────────────────────────────────────────────────
OpsViews.warnings = async function (container) {
  const { data } = await opsApi('/warnings');
  const warnings = data?.warnings || [];
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>⚠️ Operational Warnings</h2>
        <span class="ops-badge ${warnings.length > 0 ? 'ops-badge-warn' : 'ops-badge-ok'}">${warnings.length} issues</span>
      </div>
      ${warnings.length === 0 ? '<p class="ops-empty ops-all-clear">✅ All systems healthy. No warnings detected.</p>' : `
        <div class="ops-warnings-list">
          ${warnings.map(w => `
            <div class="ops-warning ops-severity-${w.severity}">
              <div class="ops-warning-icon">${w.severity === 'critical' ? '🔴' : w.severity === 'warning' ? '🟡' : 'ℹ️'}</div>
              <div class="ops-warning-content">
                <strong>${w.type.replace(/_/g, ' ')}</strong>
                <p>${w.message}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
};

// ── Audit Log View ────────────────────────────────────────────────────
OpsViews.auditLog = async function (container) {
  const { data } = await opsApi('/audit-log?limit=50');
  const logs = data?.logs || [];
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>📝 Audit Log</h2>
        <span class="ops-hint">${data?.total || 0} total entries</span>
      </div>
      ${logs.length === 0 ? '<p class="ops-empty">No audit entries yet.</p>' : `
        <div class="ops-audit-list">
          ${logs.map(log => `
            <div class="ops-audit-entry">
              <div class="ops-audit-time">${new Date(log.created_at).toLocaleString()}</div>
              <div class="ops-audit-content">
                <span class="ops-audit-action">${log.action}</span>
                ${log.entity_type ? `<span class="ops-type-badge ops-type-${log.entity_type}">${log.entity_type}</span>` : ''}
                ${log.entity_label ? `<span class="ops-audit-label">${log.entity_label}</span>` : ''}
                ${log.user_name ? `<span class="ops-user">— ${log.user_name}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
};

// ── Archive View ──────────────────────────────────────────────────────
OpsViews.archived = async function (container) {
  const { data } = await opsApi('/archived');
  const pages = data?.pages || [];
  const buttons = data?.buttons || [];
  const shortlinks = data?.shortlinks || [];
  const total = pages.length + buttons.length + shortlinks.length;
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>🗄️ Archived Items</h2>
        <span class="ops-badge">${total} archived</span>
      </div>
      ${total === 0 ? '<p class="ops-empty">No archived items.</p>' : `
        ${pages.length > 0 ? `
          <h3>Pages</h3>
          <div class="ops-list">
            ${pages.map(p => `
              <div class="ops-card ops-archived-card">
                <p><strong>${p.title}</strong> <span class="ops-slug">/${p.slug}</span></p>
                <p class="ops-timestamp">Archived: ${new Date(p.deleted_at).toLocaleString()}</p>
                <button class="btn-ops btn-restore" onclick="OpsActions.restore('page', ${p.id})">↩ Restore</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${buttons.length > 0 ? `
          <h3>Buttons</h3>
          <div class="ops-list">
            ${buttons.map(b => `
              <div class="ops-card ops-archived-card">
                <p><strong>${b.label}</strong> ${b.page_title ? `on ${b.page_title}` : ''}</p>
                <p class="ops-timestamp">Archived: ${new Date(b.deleted_at).toLocaleString()}</p>
                <button class="btn-ops btn-restore" onclick="OpsActions.restore('button', ${b.id})">↩ Restore</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${shortlinks.length > 0 ? `
          <h3>Shortlinks</h3>
          <div class="ops-list">
            ${shortlinks.map(s => `
              <div class="ops-card ops-archived-card">
                <p><strong>${s.code}</strong> → ${s.destination}</p>
                <button class="btn-ops btn-restore" onclick="OpsActions.restore('shortlink', ${s.id})">↩ Restore</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `}
    </div>`;
};

// ── Environment View ──────────────────────────────────────────────────
OpsViews.environment = async function (container) {
  const { data } = await opsApi('/environment');
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>🖥️ Environment</h2>
        <span class="ops-env-badge ops-env-${data?.environment || 'unknown'}">${(data?.environment || 'unknown').toUpperCase()}</span>
      </div>
      <div class="ops-env-grid">
        <div class="ops-env-item"><label>Environment</label><span>${data?.environment || '—'}</span></div>
        <div class="ops-env-item"><label>Node Version</label><span>${data?.node_version || '—'}</span></div>
        <div class="ops-env-item"><label>Server Started</label><span>${data?.server_started ? new Date(data.server_started).toLocaleString() : '—'}</span></div>
        ${data?.manifest ? `
          <div class="ops-env-item"><label>Admin Version</label><span>${data.manifest.version || '—'}</span></div>
          <div class="ops-env-item"><label>Build</label><span>${data.manifest.build_name || '—'}</span></div>
          <div class="ops-env-item"><label>Commit</label><span>${data.manifest.commit?.substring(0, 7) || '—'}</span></div>
        ` : ''}
      </div>
    </div>`;
};

// ── Preview View ──────────────────────────────────────────────────────
OpsViews.preview = async function (container, pageId) {
  if (!pageId) {
    container.innerHTML = '<p class="ops-empty">Select a page to preview.</p>';
    return;
  }
  const { data } = await opsApi(`/preview/page/${pageId}`);
  if (!data) { container.innerHTML = '<p class="ops-empty">Page not found.</p>'; return; }
  const page = data.page;
  const buttons = data.buttons || [];
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>👁️ Preview: ${page.title}</h2>
        <div class="ops-preview-controls">
          <label>Preview at: <input type="datetime-local" id="ops-preview-time" onchange="OpsActions.previewAt(${pageId})"></label>
        </div>
      </div>
      <div class="ops-preview-frame">
        <div class="ops-preview-phone">
          <div class="ops-preview-header">${page.headline || page.title}</div>
          <div class="ops-preview-buttons">
            ${buttons.map(b => `
              <a class="ops-preview-btn ops-style-${b.style_variant || 'secondary'}" href="${b.url}" target="_blank">
                ${b.label}
                ${b.subtitle ? `<small>${b.subtitle}</small>` : ''}
              </a>
            `).join('')}
          </div>
          ${data.is_future_preview ? `<p class="ops-future-note">⏰ Showing state at: ${new Date(data.preview_at).toLocaleString()}</p>` : ''}
        </div>
      </div>
    </div>`;
};

// ── Actions (button handlers) ─────────────────────────────────────────
window.OpsActions = {
  async approveQueue(id) {
    if (!confirm('Approve this change for publishing?')) return;
    await opsApi(`/publish-queue/${id}/approve`, { method: 'POST' });
    OpsViews.publishQueue(document.getElementById('ops-content'));
  },
  async rejectQueue(id) {
    const reason = prompt('Reason for rejection (optional):');
    await opsApi(`/publish-queue/${id}/reject`, { method: 'POST', body: { reason } });
    OpsViews.publishQueue(document.getElementById('ops-content'));
  },
  async cancelSchedule(id) {
    if (!confirm('Cancel this scheduled action?')) return;
    await opsApi(`/scheduled/${id}`, { method: 'DELETE' });
    OpsViews.timeline(document.getElementById('ops-content'));
  },
  async createSnapshot() {
    const label = prompt('Snapshot label (optional):') || 'Manual snapshot';
    await opsApi('/snapshots', { method: 'POST', body: { label } });
    OpsViews.snapshots(document.getElementById('ops-content'));
  },
  async viewSnapshot(id) {
    const { data } = await opsApi(`/snapshots/${id}`);
    const snap = data?.snapshot;
    if (!snap) return alert('Snapshot not found');
    const content = JSON.parse(snap.snapshot || '{}');
    alert(`Snapshot: ${snap.label}\nPages: ${content.pages?.length || 0}\nButtons: ${content.buttons?.length || 0}\nBlog Posts: ${content.blog_posts?.length || 0}`);
  },
  async rollback(id) {
    if (!confirm('⚠️ ROLLBACK WARNING\n\nThis will restore the entire system to this snapshot state.\n\nA pre-rollback snapshot will be created automatically.\n\nContinue?')) return;
    if (!confirm('Are you absolutely sure? This affects the LIVE site.')) return;
    const result = await opsApi(`/snapshots/${id}/rollback`, { method: 'POST' });
    if (result.ok) {
      alert('✅ Rollback completed successfully!\n\n' + (result.data?.label || ''));
      OpsViews.snapshots(document.getElementById('ops-content'));
    } else {
      alert('❌ Rollback failed: ' + (result.error || 'Unknown error'));
    }
  },
  async restore(type, id) {
    if (!confirm(`Restore this ${type}?`)) return;
    await opsApi(`/restore/${type}/${id}`, { method: 'POST' });
    OpsViews.archived(document.getElementById('ops-content'));
  },
  async previewAt(pageId) {
    const input = document.getElementById('ops-preview-time');
    const at = input?.value ? new Date(input.value).toISOString() : '';
    const { data } = await opsApi(`/preview/page/${pageId}${at ? '?at=' + at : ''}`);
    // Re-render preview with new time
    if (data) OpsViews.preview(document.getElementById('ops-content'), pageId);
  },
};

// ── Main Operations Dashboard ─────────────────────────────────────────
OpsViews.dashboard = async function (container) {
  const [queueRes, warningsRes, timelineRes] = await Promise.all([
    opsApi('/publish-queue'),
    opsApi('/warnings'),
    opsApi('/timeline?days=7'),
  ]);
  const queueCount = queueRes.data?.items?.length || 0;
  const warningCount = warningsRes.data?.warnings?.length || 0;
  const upcomingCount = timelineRes.data?.upcoming?.length || 0;

  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>🎛️ Operations Center</h2>
      </div>
      <div class="ops-dashboard-grid">
        <div class="ops-dash-card" onclick="OpsNav.go('queue')">
          <div class="ops-dash-icon">📋</div>
          <div class="ops-dash-count">${queueCount}</div>
          <div class="ops-dash-label">Pending Changes</div>
        </div>
        <div class="ops-dash-card" onclick="OpsNav.go('warnings')">
          <div class="ops-dash-icon">${warningCount > 0 ? '⚠️' : '✅'}</div>
          <div class="ops-dash-count">${warningCount}</div>
          <div class="ops-dash-label">Warnings</div>
        </div>
        <div class="ops-dash-card" onclick="OpsNav.go('timeline')">
          <div class="ops-dash-icon">📅</div>
          <div class="ops-dash-count">${upcomingCount}</div>
          <div class="ops-dash-label">Upcoming</div>
        </div>
        <div class="ops-dash-card" onclick="OpsNav.go('snapshots')">
          <div class="ops-dash-icon">📸</div>
          <div class="ops-dash-label">Snapshots</div>
        </div>
        <div class="ops-dash-card" onclick="OpsNav.go('audit')">
          <div class="ops-dash-icon">📝</div>
          <div class="ops-dash-label">Audit Log</div>
        </div>
        <div class="ops-dash-card" onclick="OpsNav.go('archived')">
          <div class="ops-dash-icon">🗄️</div>
          <div class="ops-dash-label">Archived</div>
        </div>
        <div class="ops-dash-card" onclick="OpsNav.go('environment')">
          <div class="ops-dash-icon">🖥️</div>
          <div class="ops-dash-label">Environment</div>
        </div>
      </div>
      ${warningCount > 0 ? `
        <div class="ops-dashboard-warnings">
          <h3>⚠️ Active Warnings</h3>
          ${(warningsRes.data?.warnings || []).slice(0, 3).map(w => `
            <div class="ops-warning ops-severity-${w.severity}">
              <span>${w.severity === 'critical' ? '🔴' : '🟡'} ${w.message}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
};

// ── Navigation ────────────────────────────────────────────────────────
window.OpsNav = {
  go(view) {
    const container = document.getElementById('ops-content');
    if (!container) return;
    switch (view) {
      case 'queue': OpsViews.publishQueue(container); break;
      case 'timeline': OpsViews.timeline(container); break;
      case 'snapshots': OpsViews.snapshots(container); break;
      case 'warnings': OpsViews.warnings(container); break;
      case 'audit': OpsViews.auditLog(container); break;
      case 'archived': OpsViews.archived(container); break;
      case 'environment': OpsViews.environment(container); break;
      default: OpsViews.dashboard(container);
    }
  }
};
// ── Timeline View ─────────────────────────────────────────────────────
OpsViews.timeline = async function (container) {
  const { data } = await opsApi('/timeline?days=14');
  const upcoming = data?.upcoming || [];
  const recent = data?.recent || [];
  container.innerHTML = `
    <div class="ops-section">
      <div class="ops-header">
        <h2>📅 Operations Timeline</h2>
      </div>
      <h3>Upcoming Publishes</h3>
      ${upcoming.length === 0 ? '<p class="ops-empty">No scheduled actions in the next 14 days.</p>' : `
        <div class="ops-timeline">
          ${upcoming.map(a => `
            <div class="ops-timeline-item">
              <div class="ops-timeline-time">${new Date(a.scheduled_at).toLocaleString()}</div>
              <div class="ops-timeline-content">
                <span class="ops-type-badge ops-type-${a.entity_type}">${a.entity_type}</span>
                <strong>${a.action}</strong> #${a.entity_id}
                ${a.user_name ? `<span class="ops-user">by ${a.user_name}</span>` : ''}
              </div>
              <button class="btn-ops btn-cancel-sm" onclick="OpsActions.cancelSchedule(${a.id})">Cancel</button>
            </div>
          `).join('')}
        </div>
      `}
      <h3>Recently Executed</h3>
      ${recent.length === 0 ? '<p class="ops-empty">No recent executions.</p>' : `
        <div class="ops-timeline ops-timeline-past">
          ${recent.map(a => `
            <div class="ops-timeline-item ops-done">
              <div class="ops-timeline-time">${new Date(a.executed_at).toLocaleString()}</div>
              <div class="ops-timeline-content">
                <span class="ops-type-badge ops-type-${a.entity_type}">${a.entity_type}</span>
                <strong>${a.action}</strong> #${a.entity_id} ✓
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
};
