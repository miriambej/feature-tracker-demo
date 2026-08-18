(() => {
  const STORAGE_KEY = 'feature-tracker-v2-full';
  const RETURN_KEY = 'feature-tracker-bulk-return-delivery';
  const NOTICE_KEY = 'feature-tracker-bulk-notice';
  const BUTTON_ID = 'bulk-add-features-button';
  const MODAL_ID = 'bulk-add-features-modal';
  const BACKLOG_ID = 'bulk-prioritised-backlog';

  function uid() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  }

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved && typeof saved === 'object'
        ? { features: [], milestones: {}, allocations: [], capacities: [], customSprints: [], ...saved }
        : { features: [], milestones: {}, allocations: [], capacities: [], customSprints: [] };
    } catch {
      return { features: [], milestones: {}, allocations: [], capacities: [], customSprints: [] };
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nameKey(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function parseLine(raw) {
    let line = String(raw || '').trim();
    if (!line) return '';

    if (line.includes('\t')) {
      line = line.split('\t').map(v => v.trim()).find(Boolean) || '';
    }

    if (line.startsWith('|') || line.endsWith('|')) {
      const cells = line
        .replace(/^\|+/, '')
        .replace(/\|+$/, '')
        .split('|')
        .map(v => v.trim())
        .filter(Boolean);
      line = cells[0] || '';
    }

    line = line.trim();
    if (!line) return '';
    if (/^:?-{3,}:?$/.test(line.replace(/\s+/g, ''))) return '';
    if (/^(feature|features|feature name)$/i.test(line)) return '';
    return line;
  }

  function parseRows(text) {
    const state = readState();
    const existingByKey = new Map((state.features || []).map(f => [nameKey(f.feature_name), f]).filter(([k]) => k));
    const seen = new Set();

    return String(text || '')
      .split(/\r?\n/)
      .map(parseLine)
      .filter(Boolean)
      .map((name, index) => {
        const key = nameKey(name);
        const existingFeature = existingByKey.get(key) || null;
        const batchDuplicate = seen.has(key);
        if (!seen.has(key)) seen.add(key);
        const alreadyCorrect = !!existingFeature && nameKey(existingFeature.workspace) === key;
        const action = batchDuplicate ? 'skip' : existingFeature ? (alreadyCorrect ? 'correct' : 'update') : 'create';
        return {
          id: `${index}-${key}`,
          name,
          key,
          existingFeature,
          batchDuplicate,
          alreadyCorrect,
          action,
          selected: action === 'create' || action === 'update',
        };
      });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function ensureStyles() {
    if (document.getElementById('bulk-feature-styles')) return;
    const style = document.createElement('style');
    style.id = 'bulk-feature-styles';
    style.textContent = `
      #${MODAL_ID} { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.68); display: flex; align-items: center; justify-content: center; padding: 24px; }
      #${MODAL_ID} .bulk-card { width: min(980px, 96vw); max-height: 92vh; overflow: auto; border-radius: 16px; background: var(--panel, #182130); color: inherit; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 24px 70px rgba(0,0,0,.45); padding: 22px; }
      #${MODAL_ID} .bulk-head, #${MODAL_ID} .bulk-actions, #${BACKLOG_ID} .bulk-backlog-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      #${MODAL_ID} textarea { width:100%; min-height:230px; resize:vertical; box-sizing:border-box; margin-top:8px; }
      #${MODAL_ID} .bulk-preview { max-height:340px; overflow:auto; border:1px solid rgba(127,127,127,.28); border-radius:10px; margin:14px 0; }
      #${MODAL_ID} .bulk-row { display:grid; grid-template-columns:28px minmax(0,1fr) minmax(180px,auto) auto; gap:10px; align-items:center; padding:9px 10px; border-bottom:1px solid rgba(127,127,127,.18); }
      #${MODAL_ID} .bulk-row:last-child { border-bottom:0; }
      #${MODAL_ID} .bulk-muted { opacity:.6; }
      #${MODAL_ID} .bulk-warning, #${MODAL_ID} .bulk-ok { font-size:12px; font-weight:700; white-space:nowrap; }
      #${MODAL_ID} .bulk-remove { padding:4px 8px; font-size:12px; }
      #${MODAL_ID} .bulk-count { margin-top:8px; font-weight:700; }
      #${MODAL_ID} .bulk-note { margin:14px 0; padding:10px 12px; border-radius:10px; border:1px solid rgba(127,127,127,.25); }
      #${BACKLOG_ID} { margin-top:16px; }
      #${BACKLOG_ID} .bulk-backlog-list { display:grid; gap:8px; margin-top:12px; }
      #${BACKLOG_ID} .bulk-backlog-row { display:grid; grid-template-columns:minmax(0,2fr) minmax(140px,1fr) 110px; gap:12px; align-items:center; padding:10px 12px; border:1px solid rgba(127,127,127,.18); border-radius:10px; }
      #bulk-feature-notice { position:fixed; right:22px; bottom:22px; z-index:100000; background:#176b42; color:white; padding:12px 16px; border-radius:10px; box-shadow:0 12px 30px rgba(0,0,0,.3); font-weight:700; }
      @media (max-width: 720px) {
        #${MODAL_ID} .bulk-row { grid-template-columns:28px minmax(0,1fr) auto; }
        #${MODAL_ID} .bulk-warning, #${MODAL_ID} .bulk-ok { grid-column:2/4; }
        #${BACKLOG_ID} .bulk-backlog-row { grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function showNotice(message) {
    document.getElementById('bulk-feature-notice')?.remove();
    const notice = document.createElement('div');
    notice.id = 'bulk-feature-notice';
    notice.textContent = message;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 5500);
  }

  function openModal() {
    ensureStyles();
    document.getElementById(MODAL_ID)?.remove();
    let rows = [];

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="bulk-card">
        <div class="bulk-head">
          <div>
            <div class="eyebrow">Delivery Plan</div>
            <h2 style="margin:4px 0 0">Bulk Add / Fix Features</h2>
            <p class="muted" style="margin:6px 0 0">Each pasted feature will use the exact same name as its workspace.</p>
          </div>
          <button type="button" data-action="close">Close</button>
        </div>

        <div class="bulk-note">
          <b>Workspace rule:</b> Feature name = Workspace name. If a pasted feature already exists, its existing record will be kept and only its workspace will be corrected. Existing IDs, status, owner, notes and planning allocations are preserved.
        </div>

        <label>Paste feature names
          <textarea data-role="text" placeholder="A&T SNAP Dataset Repointing to A&T Dashboards\nABS Data Ingestion Automation\nANP marketshare"></textarea>
        </label>

        <div class="bulk-actions" style="margin-top:14px">
          <button type="button" data-action="preview">Parse / Preview</button>
          <span class="bulk-count" data-role="count">Paste features to preview.</span>
        </div>
        <div class="bulk-preview" data-role="preview" hidden></div>
        <div class="bulk-actions" style="margin-top:16px">
          <button type="button" data-action="cancel">Cancel</button>
          <button type="button" data-action="apply" disabled>Apply Changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const text = modal.querySelector('[data-role="text"]');
    const preview = modal.querySelector('[data-role="preview"]');
    const count = modal.querySelector('[data-role="count"]');
    const applyButton = modal.querySelector('[data-action="apply"]');

    function selectedRows() {
      return rows.filter(r => r.selected && !r.batchDuplicate && (r.action === 'create' || r.action === 'update'));
    }

    function renderPreview() {
      const selected = selectedRows();
      const creates = selected.filter(r => r.action === 'create').length;
      const updates = selected.filter(r => r.action === 'update').length;
      const correct = rows.filter(r => r.action === 'correct').length;
      const duplicates = rows.filter(r => r.batchDuplicate).length;

      const parts = [];
      if (creates) parts.push(`${creates} new`);
      if (updates) parts.push(`${updates} workspace fix${updates === 1 ? '' : 'es'}`);
      if (correct) parts.push(`${correct} already correct`);
      if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
      count.textContent = parts.length ? parts.join(' · ') : 'No changes ready.';
      applyButton.textContent = selected.length ? `Apply ${selected.length} Change${selected.length === 1 ? '' : 's'}` : 'Apply Changes';
      applyButton.disabled = selected.length === 0;
      preview.hidden = rows.length === 0;

      preview.innerHTML = rows.map((row, index) => {
        let status = '';
        let rowClass = '';
        let disabled = '';
        if (row.batchDuplicate) {
          status = 'Duplicate in paste — skipped';
          rowClass = 'bulk-muted';
          disabled = 'disabled';
        } else if (row.action === 'update') {
          status = `Update workspace: ${row.existingFeature?.workspace || 'Unassigned'} → ${row.name}`;
        } else if (row.action === 'correct') {
          status = 'Already correct';
          rowClass = 'bulk-muted';
          disabled = 'disabled';
        } else {
          status = `Create new feature + workspace: ${row.name}`;
        }

        const statusClass = row.action === 'correct' ? 'bulk-ok' : 'bulk-warning';
        return `<div class="bulk-row ${rowClass}" data-index="${index}">
          <input type="checkbox" data-action="toggle" ${row.selected ? 'checked' : ''} ${disabled}>
          <span>${escapeHtml(row.name)}</span>
          <span class="${statusClass}">${escapeHtml(status)}</span>
          <button type="button" class="bulk-remove" data-action="remove">Remove</button>
        </div>`;
      }).join('');
    }

    function previewText() {
      rows = parseRows(text.value);
      renderPreview();
    }

    modal.addEventListener('click', event => {
      const action = event.target?.dataset?.action;
      if (action === 'close' || action === 'cancel') {
        modal.remove();
        return;
      }
      if (action === 'preview') {
        previewText();
        return;
      }
      if (action === 'remove') {
        const index = Number(event.target.closest('[data-index]')?.dataset?.index);
        if (Number.isFinite(index)) {
          rows.splice(index, 1);
          renderPreview();
        }
        return;
      }
      if (action === 'apply') {
        const selected = selectedRows();
        if (!selected.length) return;

        const saved = readState();
        const features = [...(saved.features || [])];
        const existingIndexByKey = new Map(features.map((f, index) => [nameKey(f.feature_name), index]).filter(([key]) => key));
        let created = 0;
        let updated = 0;

        selected.forEach(row => {
          const existingIndex = existingIndexByKey.get(row.key);
          if (existingIndex != null) {
            const existing = features[existingIndex];
            if (nameKey(existing.workspace) !== row.key) {
              features[existingIndex] = { ...existing, workspace: row.name };
              updated += 1;
            }
          } else {
            const feature = {
              id: uid(),
              feature_name: row.name,
              status: 'initial',
              workspace: row.name,
              owner: '',
              user_count: 0,
              notes: '',
            };
            features.unshift(feature);
            existingIndexByKey.set(row.key, 0);
            created += 1;
          }
        });

        saved.features = features;
        writeState(saved);
        sessionStorage.setItem(RETURN_KEY, '1');
        const bits = [];
        if (created) bits.push(`${created} feature${created === 1 ? '' : 's'} added`);
        if (updated) bits.push(`${updated} workspace${updated === 1 ? '' : 's'} corrected`);
        sessionStorage.setItem(NOTICE_KEY, `${bits.join(' · ')}. Feature names now match their workspaces.`);
        location.reload();
      }
    });

    modal.addEventListener('change', event => {
      if (event.target?.dataset?.action === 'toggle') {
        const index = Number(event.target.closest('[data-index]')?.dataset?.index);
        if (Number.isFinite(index) && rows[index]) {
          rows[index].selected = !!event.target.checked;
          renderPreview();
        }
      }
    });

    text.addEventListener('paste', () => setTimeout(previewText, 0));
    text.focus();
  }

  function ensureButton() {
    const toolbar = document.querySelector('.toolbar .toolbar-left');
    if (!toolbar || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Bulk Add / Fix Features';
    button.title = 'Paste multiple features and make each workspace match the feature name';
    button.addEventListener('click', openModal);
    const deliveryButton = Array.from(toolbar.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delivery Plan');
    if (deliveryButton?.nextSibling) toolbar.insertBefore(button, deliveryButton.nextSibling);
    else toolbar.appendChild(button);
  }

  function allocationFeatureIds(allocation) {
    const ids = Array.isArray(allocation?.featureIds) ? [...allocation.featureIds] : [];
    if (allocation?.featureId) ids.push(allocation.featureId);
    return new Set(ids.filter(Boolean));
  }

  function backlogFeatures() {
    const state = readState();
    const allocated = new Set();
    (state.allocations || []).forEach(a => allocationFeatureIds(a).forEach(id => allocated.add(id)));
    return (state.features || [])
      .filter(f => f && f.status === 'initial' && !allocated.has(f.id))
      .sort((a, b) => Number(b.user_count || 0) - Number(a.user_count || 0) || String(a.feature_name || '').localeCompare(String(b.feature_name || '')));
  }

  function ensureBacklog() {
    const executive = Array.from(document.querySelectorAll('.eyebrow')).find(el => el.textContent.trim() === 'Executive Dashboard');
    if (!executive) {
      document.getElementById(BACKLOG_ID)?.remove();
      return;
    }
    const dashboard = executive.closest('.dashboard');
    if (!dashboard) return;
    const summary = dashboard.querySelector('.summary-grid');
    if (!summary) return;

    const features = backlogFeatures();
    let panel = document.getElementById(BACKLOG_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = BACKLOG_ID;
      panel.className = 'panel';
      summary.insertAdjacentElement('afterend', panel);
    }

    panel.innerHTML = `
      <div class="bulk-backlog-head">
        <div>
          <h3 style="margin:0">Prioritised Backlog</h3>
          <p class="muted" style="margin:5px 0 0">Features waiting for Requirement Planning.</p>
        </div>
        <span class="pill-status neutral">${features.length} feature${features.length === 1 ? '' : 's'}</span>
      </div>
      ${features.length ? `<div class="bulk-backlog-list">${features.map(f => `
        <div class="bulk-backlog-row">
          <b>${escapeHtml(f.feature_name || 'Untitled feature')}</b>
          <span>${escapeHtml(f.workspace || 'Unassigned')}</span>
          <span>${Number(f.user_count || 0).toLocaleString()} users</span>
        </div>`).join('')}</div>` : '<p class="muted">No features are currently waiting for Requirement Planning.</p>'}
    `;
  }

  function returnToDeliveryPlan() {
    if (sessionStorage.getItem(RETURN_KEY) !== '1') return;
    const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delivery Plan');
    if (!button) return;
    sessionStorage.removeItem(RETURN_KEY);
    button.click();
  }

  let scheduled = false;
  function sync() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensureStyles();
      ensureButton();
      returnToDeliveryPlan();
      ensureBacklog();
    }, 40);
  }

  function start() {
    sync();
    const notice = sessionStorage.getItem(NOTICE_KEY);
    if (notice) {
      sessionStorage.removeItem(NOTICE_KEY);
      setTimeout(() => showNotice(notice), 250);
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();