(() => {
  const APP_KEY = 'feature-tracker-v2-full';
  const PREFIX = 'feature-tracker-';
  const MODAL_ID = 'full-backup-modal';
  const BUTTON_ID = 'full-backup-button';

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function appStateFrom(storageMap) {
    return safeParse(storageMap?.[APP_KEY] ?? localStorage.getItem(APP_KEY), {}) || {};
  }

  function boardCounts(app) {
    const counts = {};
    for (const feature of app.features || []) {
      const key = feature.status || 'initial';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  function planningCounts(app) {
    const PLAN = ['Requirement', 'Build', 'SIT', 'Deploy', 'BA Sign Off', 'UAT'];
    const statusFloor = (status) => {
      if (status === 'build_in_progress') return 'Build';
      if (status === 'build_done' || status === 'sit_in_progress') return 'SIT';
      if (status === 'sit_done' || status === 'deployment_in_progress') return 'Deploy';
      if (status === 'deployment_done' || status === 'bs_signoff_in_progress') return 'BA Sign Off';
      if (status === 'bs_signoff_done' || status === 'uat_in_progress') return 'UAT';
      if (status === 'uat_done') return 'Planning Complete';
      return 'Requirement';
    };
    const allocationFeatureIds = (a) => Array.from(new Set([
      ...(Array.isArray(a?.matchedFeatureIds) ? a.matchedFeatureIds : []),
      ...(Array.isArray(a?.featureIds) ? a.featureIds : []),
      a?.featureId,
    ].filter(Boolean)));
    const counts = {};
    for (const feature of app.features || []) {
      const floor = statusFloor(feature.status);
      if (floor === 'Planning Complete') {
        counts['Planning Complete'] = (counts['Planning Complete'] || 0) + 1;
        continue;
      }
      const floorIndex = PLAN.indexOf(floor);
      const related = (app.allocations || []).filter(a => allocationFeatureIds(a).includes(feature.id));
      const maxPlanned = related.reduce((max, a) => Math.max(max, PLAN.indexOf(a.stage)), -1);
      const nextIndex = Math.max(floorIndex, Math.min(PLAN.length - 1, maxPlanned + 1));
      const stage = PLAN[nextIndex] || 'Requirement';
      counts[`${stage} Planning`] = (counts[`${stage} Planning`] || 0) + 1;
    }
    return counts;
  }

  function summary(storageMap) {
    const app = appStateFrom(storageMap);
    const finalStages = app.finalStageByFeatureId && typeof app.finalStageByFeatureId === 'object'
      ? Object.keys(app.finalStageByFeatureId).length : 0;
    return {
      features: (app.features || []).length,
      allocations: (app.allocations || []).length,
      capacities: (app.capacities || []).length,
      daysOff: (app.daysOff || []).length,
      customSprints: (app.customSprints || []).length,
      finalStageEntries: finalStages,
      boardCounts: boardCounts(app),
      planningCounts: planningCounts(app),
    };
  }

  function collectStorage() {
    const storage = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(PREFIX) || key === 'feature-tracker-theme') {
        storage[key] = localStorage.getItem(key);
      }
    }
    if (!(APP_KEY in storage)) storage[APP_KEY] = localStorage.getItem(APP_KEY);
    return storage;
  }

  function makePayload() {
    const storage = collectStorage();
    return {
      format: 'feature-tracker-full-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      storage,
      summary: summary(storage),
    };
  }

  function downloadBackup() {
    const payload = makePayload();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature-tracker-full-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const status = document.querySelector('#full-backup-status');
    if (status) status.textContent = `Full backup downloaded: ${payload.summary.features} features, ${payload.summary.allocations} planning allocations.`;
  }

  function fmtCounts(obj = {}) {
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'None';
  }

  function renderPreview(payload) {
    const target = document.querySelector('#full-backup-preview');
    if (!target) return;
    if (!payload) { target.innerHTML = ''; return; }
    const s = payload.summary || summary(payload.storage || {});
    target.innerHTML = `
      <div class="fb-preview-card">
        <strong>Backup preview</strong>
        <div><b>${s.features ?? 0}</b> features · <b>${s.allocations ?? 0}</b> planning allocations · <b>${s.capacities ?? 0}</b> capacity rows</div>
        <div class="fb-small"><b>Board:</b> ${escapeHtml(fmtCounts(s.boardCounts))}</div>
        <div class="fb-small"><b>Planning:</b> ${escapeHtml(fmtCounts(s.planningCounts))}</div>
        <div class="fb-small">Exported ${escapeHtml(payload.exportedAt || 'unknown time')}</div>
      </div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function validatePayload(payload) {
    if (!payload || payload.format !== 'feature-tracker-full-backup') return 'This is not a Feature Tracker full-backup file.';
    if (!payload.storage || typeof payload.storage !== 'object') return 'The backup does not contain browser state.';
    if (!payload.storage[APP_KEY]) return 'The backup does not contain the main Feature Tracker state.';
    const app = safeParse(payload.storage[APP_KEY]);
    if (!app || !Array.isArray(app.features)) return 'The backup main state is invalid.';
    return '';
  }

  function restore(payload) {
    const error = validatePayload(payload);
    const status = document.querySelector('#full-backup-status');
    if (error) { if (status) status.textContent = error; return; }
    const s = payload.summary || summary(payload.storage);
    const ok = window.confirm(`Restore this full backup?\n\n${s.features || 0} features\n${s.allocations || 0} planning allocations\n\nThis replaces Feature Tracker data stored in this browser. Your current data will be overwritten.`);
    if (!ok) return;

    const before = makePayload();
    try {
      localStorage.setItem('feature-tracker-pre-restore-backup', JSON.stringify(before));
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(PREFIX) || key === 'feature-tracker-theme')) keysToRemove.push(key);
      }
      for (const key of keysToRemove) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(payload.storage)) {
        if (value === null || value === undefined) continue;
        localStorage.setItem(key, String(value));
      }
      const after = summary(payload.storage);
      const expected = payload.summary || after;
      if (after.features !== expected.features || after.allocations !== expected.allocations) {
        throw new Error(`Restore validation failed. Expected ${expected.features} features/${expected.allocations} allocations, got ${after.features}/${after.allocations}.`);
      }
      if (status) status.textContent = 'Restore validated. Reloading the app…';
      setTimeout(() => location.reload(), 350);
    } catch (err) {
      if (status) status.textContent = `Restore failed: ${err?.message || err}`;
    }
  }

  function ensureStyles() {
    if (document.getElementById('full-backup-styles')) return;
    const style = document.createElement('style');
    style.id = 'full-backup-styles';
    style.textContent = `
      #${BUTTON_ID}{position:fixed;right:18px;bottom:18px;z-index:99990;border:0;border-radius:999px;padding:10px 14px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;background:#fff;color:#172033}
      #${MODAL_ID}{position:fixed;inset:0;z-index:99999;background:rgba(8,12,20,.72);display:flex;align-items:center;justify-content:center;padding:20px}
      #${MODAL_ID}[hidden]{display:none}
      #${MODAL_ID} .fb-card{width:min(760px,100%);max-height:88vh;overflow:auto;background:var(--panel,#172033);color:inherit;border:1px solid rgba(127,127,127,.28);border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      #${MODAL_ID} .fb-head{display:flex;justify-content:space-between;gap:16px;align-items:start}
      #${MODAL_ID} .fb-head h2{margin:0 0 6px}
      #${MODAL_ID} .fb-actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
      #${MODAL_ID} button,#${MODAL_ID} .fb-file-label{border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer;background:rgba(127,127,127,.12);color:inherit}
      #${MODAL_ID} .fb-primary{background:#fff;color:#172033;border-color:#fff}
      #${MODAL_ID} .fb-close{font-size:20px;padding:3px 9px}
      #${MODAL_ID} .fb-file-label input{display:none}
      #${MODAL_ID} .fb-preview-card{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:12px;margin-top:12px}
      #${MODAL_ID} .fb-small{font-size:12px;opacity:.82;margin-top:7px;line-height:1.45}
      #${MODAL_ID} #full-backup-status{margin-top:12px;font-size:13px;font-weight:700}
      #${MODAL_ID} .fb-note{font-size:13px;opacity:.78;line-height:1.5}
    `;
    document.head.appendChild(style);
  }

  function openModal() {
    ensureModal();
    const modal = document.getElementById(MODAL_ID);
    modal.hidden = false;
    const current = makePayload();
    const info = document.querySelector('#full-backup-current');
    if (info) info.textContent = `Current browser: ${current.summary.features} features · ${current.summary.allocations} planning allocations`;
  }

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.hidden = true;
    modal.innerHTML = `
      <div class="fb-card" role="dialog" aria-modal="true" aria-label="Full backup and restore">
        <div class="fb-head">
          <div><h2>Full Backup / Restore</h2><div class="fb-note">Use this when moving Feature Tracker between computers. It copies the exact browser state instead of rebuilding the board from CSV or planning allocations.</div></div>
          <button class="fb-close" type="button" aria-label="Close">×</button>
        </div>
        <div id="full-backup-current" class="fb-small"></div>
        <div class="fb-actions">
          <button class="fb-primary" type="button" data-action="download">Download Full Backup</button>
          <label class="fb-file-label">Choose Backup to Restore<input type="file" accept="application/json,.json" data-role="restore-file"></label>
        </div>
        <div id="full-backup-preview"></div>
        <div class="fb-actions" id="full-backup-restore-actions" hidden><button type="button" class="fb-primary" data-action="restore">Restore This Backup</button></div>
        <div id="full-backup-status"></div>
        <p class="fb-note">A restore first keeps an emergency copy of the current browser state under <code>feature-tracker-pre-restore-backup</code>, then validates feature/allocation totals before reloading.</p>
      </div>`;
    document.body.appendChild(modal);
    let selectedPayload = null;
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('.fb-close')) { modal.hidden = true; return; }
      if (e.target.closest('[data-action="download"]')) { downloadBackup(); return; }
      if (e.target.closest('[data-action="restore"]') && selectedPayload) restore(selectedPayload);
    });
    modal.querySelector('[data-role="restore-file"]').addEventListener('change', async e => {
      const file = e.target.files?.[0];
      const status = modal.querySelector('#full-backup-status');
      const actions = modal.querySelector('#full-backup-restore-actions');
      selectedPayload = null;
      actions.hidden = true;
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const error = validatePayload(payload);
        if (error) throw new Error(error);
        selectedPayload = payload;
        renderPreview(payload);
        actions.hidden = false;
        status.textContent = 'Backup file is valid. Review the counts above before restoring.';
      } catch (err) {
        renderPreview(null);
        status.textContent = `Cannot use this file: ${err?.message || err}`;
      }
    });
  }

  function start() {
    ensureStyles();
    ensureModal();
    if (!document.getElementById(BUTTON_ID)) {
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Backup / Restore';
      button.title = 'Move the exact Feature Tracker state between computers';
      button.addEventListener('click', openModal);
      document.body.appendChild(button);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
