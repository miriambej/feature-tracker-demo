(() => {
  const APP_KEY = 'feature-tracker-v2-full';
  const PANEL_ID = 'executive-feature-schedule-panel';
  const PLAN_STAGES = ['Requirement', 'Build', 'SIT', 'Deploy', 'BA Sign Off', 'UAT'];
  const Q2 = [
    ['26Q2S1', '2026-10-07', '2026-10-20'],
    ['26Q2S2', '2026-10-21', '2026-11-03'],
    ['26Q2S3', '2026-11-04', '2026-11-17'],
    ['26Q2S4', '2026-11-18', '2026-12-01'],
    ['26Q2S5', '2026-12-02', '2026-12-15'],
    ['26Q2S6', '2026-12-16', '2026-12-24'],
  ];

  function safeParse(value, fallback = {}) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function appState() {
    return safeParse(localStorage.getItem(APP_KEY), {}) || {};
  }

  function normaliseSprint(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function isoDate(date) {
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function defaultSprintDates(sprint) {
    const key = normaliseSprint(sprint);
    const q2 = Q2.find(([id]) => id === key);
    if (q2) return { startDate: q2[1], endDate: q2[2] };
    const q1 = key.match(/^26Q1S(\d+)$/);
    if (!q1) return null;
    const index = Number(q1[1]) - 1;
    const start = addDays(new Date(2026, 6, 1), index * 14);
    return { startDate: isoDate(start), endDate: isoDate(addDays(start, 13)) };
  }

  function sprintDateMap(app) {
    const map = new Map();
    for (const row of app.sprintDates || []) {
      const key = normaliseSprint(row?.sprint);
      if (key) map.set(key, { startDate: row.startDate || '', endDate: row.endDate || '' });
    }
    for (const sprint of app.customSprints || []) {
      const key = normaliseSprint(sprint);
      if (key && !map.has(key)) {
        const fallback = defaultSprintDates(key);
        if (fallback) map.set(key, fallback);
      }
    }
    for (let i = 1; i <= 7; i += 1) {
      const key = `26Q1S${i}`;
      if (!map.has(key)) map.set(key, defaultSprintDates(key));
    }
    for (const [key, startDate, endDate] of Q2) {
      if (!map.has(key)) map.set(key, { startDate, endDate });
    }
    return map;
  }

  function allocationFeatureIds(a) {
    return Array.from(new Set([
      ...(Array.isArray(a?.matchedFeatureIds) ? a.matchedFeatureIds : []),
      ...(Array.isArray(a?.featureIds) ? a.featureIds : []),
      a?.featureId,
    ].filter(Boolean)));
  }

  function parseDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const au = s.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
    if (!au) return null;
    let year = au[3] ? Number(au[3]) : 2026;
    if (year < 100) year += 2000;
    return new Date(year, Number(au[2]) - 1, Number(au[1]));
  }

  function fmtDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';
  }

  function finalStageFor(feature, app) {
    const configured = app.finalStageByFeatureId?.[feature.id];
    return PLAN_STAGES.includes(configured) ? configured : 'UAT';
  }

  function featureRows() {
    const app = appState();
    const features = Array.isArray(app.features) ? app.features : [];
    const allocations = Array.isArray(app.allocations) ? app.allocations : [];
    const dates = sprintDateMap(app);

    const baseRows = features.map((feature) => {
      const rows = allocations
        .filter((a) => allocationFeatureIds(a).includes(feature.id) && normaliseSprint(a.sprint))
        .sort((a, b) => normaliseSprint(a.sprint).localeCompare(normaliseSprint(b.sprint)));
      if (!rows.length) return null;

      const people = Array.from(new Set(rows.map((a) => String(a.owner || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      const firstSprint = normaliseSprint(rows[0].sprint);
      const latestSprint = normaliseSprint(rows.at(-1)?.sprint);
      const plannedStart = dates.get(firstSprint)?.startDate || '';
      const plannedThrough = latestSprint ? dates.get(latestSprint)?.endDate || '' : '';
      const finalStage = finalStageFor(feature, app);
      const finalIdx = PLAN_STAGES.indexOf(finalStage);
      const completionRow = rows
        .filter((a) => PLAN_STAGES.indexOf(a.stage) >= finalIdx)
        .at(-1);
      const completionSprint = normaliseSprint(completionRow?.sprint);
      const plannedCompletion = completionSprint ? dates.get(completionSprint)?.endDate || '' : '';

      return {
        workspace: feature.workspace || 'Unknown',
        feature: feature.feature_name || 'Unnamed feature',
        people: people.join(', ') || 'Unassigned',
        plannedStart,
        plannedThrough,
        plannedCompletion,
      };
    }).filter(Boolean);

    const workspaceTargets = new Map();
    for (const row of baseRows) {
      if (!workspaceTargets.has(row.workspace)) {
        workspaceTargets.set(row.workspace, {
          completionDate: null,
          completionValue: '',
          hasIncomplete: false,
          plannedThroughDate: null,
        });
      }
      const target = workspaceTargets.get(row.workspace);
      const completionDate = parseDate(row.plannedCompletion);
      const plannedThroughDate = parseDate(row.plannedThrough);
      if (!completionDate) target.hasIncomplete = true;
      if (completionDate && (!target.completionDate || completionDate > target.completionDate)) {
        target.completionDate = completionDate;
        target.completionValue = row.plannedCompletion;
      }
      if (plannedThroughDate && (!target.plannedThroughDate || plannedThroughDate > target.plannedThroughDate)) {
        target.plannedThroughDate = plannedThroughDate;
      }
    }

    return baseRows.map((row) => {
      const target = workspaceTargets.get(row.workspace);
      const workspaceCompletionFinalised = !!target?.completionDate && !target?.hasIncomplete;
      const featureDue = workspaceCompletionFinalised ? target.completionValue : '';
      const completionDate = parseDate(row.plannedCompletion);
      const dueDate = parseDate(featureDue);
      let delivery = 'Planning incomplete';
      if (!workspaceCompletionFinalised) delivery = 'Workspace completion not finalised';
      else if (!completionDate) delivery = 'Planning incomplete';
      else if (dueDate) delivery = completionDate > dueDate ? 'Past roadmap completion' : 'On track';

      return {
        ...row,
        featureDue,
        workspaceCompletionFinalised,
        delivery,
      };
    }).sort((a, b) => {
      const ad = parseDate(a.featureDue)?.getTime() || Number.MAX_SAFE_INTEGER;
      const bd = parseDate(b.featureDue)?.getTime() || Number.MAX_SAFE_INTEGER;
      return ad - bd || a.feature.localeCompare(b.feature);
    });
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadCsv(rows) {
    const header = ['Feature', 'People', 'Planned Start', 'Planned Completion', 'Executive Roadmap Completion', 'Delivery'];
    const body = rows.map((row) => [
      row.feature,
      row.people,
      fmtDate(row.plannedStart),
      row.plannedCompletion ? fmtDate(row.plannedCompletion) : 'Planning incomplete',
      row.featureDue ? fmtDate(row.featureDue) : 'Workspace completion not finalised',
      row.delivery,
    ]);
    const csv = [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `executive-feature-delivery-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function ensureStyles() {
    if (document.getElementById('executive-feature-schedule-styles')) return;
    const style = document.createElement('style');
    style.id = 'executive-feature-schedule-styles';
    style.textContent = `
      #${PANEL_ID}{margin-top:14px;border-top:1px solid rgba(127,127,127,.22);padding-top:12px}
      #${PANEL_ID}>summary{cursor:pointer;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 2px}
      #${PANEL_ID}>summary::-webkit-details-marker{display:none}
      #${PANEL_ID} .efs-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:8px 0 10px}
      #${PANEL_ID} .efs-table-wrap{overflow:auto;max-height:520px}
      #${PANEL_ID} table{min-width:980px}
      #${PANEL_ID} .efs-status{font-weight:700}
      #${PANEL_ID} .efs-status.past{color:#ef4444}
      #${PANEL_ID} .efs-status.incomplete{color:#f59e0b}
      .app.light #${PANEL_ID} .efs-status.past{color:#b91c1c}
      .app.light #${PANEL_ID} .efs-status.incomplete{color:#92400e}
    `;
    document.head.appendChild(style);
  }

  function renderPanel() {
    if (document.getElementById(PANEL_ID)) return true;
    const existingTable = document.querySelector('.delivery-schedule-table-wrap');
    if (!existingTable) return false;
    const rows = featureRows();
    ensureStyles();
    const panel = document.createElement('details');
    panel.id = PANEL_ID;
    panel.open = false;
    const rowHtml = rows.map((row) => {
      const statusClass = row.delivery === 'Past roadmap completion' ? 'past' : row.delivery !== 'On track' ? 'incomplete' : '';
      return `<tr><td><b>${escapeHtml(row.feature)}</b></td><td>${escapeHtml(row.people)}</td><td>${escapeHtml(fmtDate(row.plannedStart))}</td><td>${escapeHtml(row.plannedCompletion ? fmtDate(row.plannedCompletion) : 'Planning incomplete')}</td><td><b>${escapeHtml(row.featureDue ? fmtDate(row.featureDue) : 'Not finalised')}</b></td><td><span class="efs-status ${statusClass}">${escapeHtml(row.delivery)}</span></td></tr>`;
    }).join('');
    panel.innerHTML = `
      <summary><span>Feature delivery schedule</span><span>${rows.length} planned features ▾</span></summary>
      <div class="efs-head"><small>Executive roadmap completion is inherited from the workspace completion shown in the six-month roadmap above. It is not taken from Migration Dashboard milestones.</small><button type="button" data-efs-export>Export feature table</button></div>
      <div class="efs-table-wrap"><table class="compact-table"><thead><tr><th>Feature</th><th>People</th><th>Planned start</th><th>Planned completion</th><th>Executive roadmap completion</th><th>Delivery</th></tr></thead><tbody>${rowHtml || '<tr><td colspan="6">No planned features yet.</td></tr>'}</tbody></table></div>`;
    existingTable.parentElement?.insertBefore(panel, existingTable.nextSibling);
    panel.querySelector('[data-efs-export]')?.addEventListener('click', () => downloadCsv(featureRows()));
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function tryInstall() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (renderPanel() || attempts >= 20) clearInterval(timer);
    }, 250);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button?.textContent?.trim() === 'Executive Dashboard') setTimeout(tryInstall, 50);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  else tryInstall();
})();
