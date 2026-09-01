(() => {
  const APP_KEY = 'feature-tracker-v2-full';
  const PEOPLE_HEADER = 'People';
  const EXPORT_BUTTON_ID = 'executive-workspace-export-button';

  function safeParse(value, fallback = {}) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function appState() {
    return safeParse(localStorage.getItem(APP_KEY), {}) || {};
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function matchKey(value) {
    return clean(value)
      .toLowerCase()
      .replace(/power\s*bi|pbi/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function allocationFeatureIds(allocation) {
    return Array.from(new Set([
      ...(Array.isArray(allocation?.matchedFeatureIds) ? allocation.matchedFeatureIds : []),
      ...(Array.isArray(allocation?.featureIds) ? allocation.featureIds : []),
      allocation?.featureId,
    ].filter(Boolean)));
  }

  function splitPeople(value) {
    const raw = clean(value);
    if (!raw || /^unassigned$/i.test(raw)) return [];
    return raw
      .split(/\s*(?:,|\/|&|\+| and )\s*/i)
      .map(clean)
      .filter(Boolean);
  }

  function peopleByWorkspace() {
    const app = appState();
    const features = Array.isArray(app.features) ? app.features : [];
    const allocations = Array.isArray(app.allocations) ? app.allocations : [];
    const featureById = new Map(features.map((feature) => [feature.id, feature]));
    const featureByName = new Map(
      features
        .filter((feature) => feature?.feature_name)
        .map((feature) => [matchKey(feature.feature_name), feature]),
    );
    const workspaceNames = Array.from(
      new Set(features.map((feature) => clean(feature.workspace)).filter(Boolean)),
    );
    const workspaceByKey = new Map(workspaceNames.map((workspace) => [matchKey(workspace), workspace]));
    const groups = new Map();

    function add(workspace, owner) {
      const key = matchKey(workspace);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, new Set());
      for (const person of splitPeople(owner)) groups.get(key).add(person);
    }

    function addFromNamedFeature(value, owner) {
      const feature = featureByName.get(matchKey(value));
      if (feature?.workspace) add(feature.workspace, owner);
    }

    for (const allocation of allocations) {
      const owner = allocation?.owner;
      if (!owner) continue;

      // Direct workspace fields used by different planning/import versions.
      for (const workspaceValue of [
        allocation.workspace,
        allocation.workspaceName,
      ]) {
        if (workspaceValue) {
          const canonical = workspaceByKey.get(matchKey(workspaceValue)) || workspaceValue;
          add(canonical, owner);
        }
      }

      // Strongest link: feature IDs.
      for (const featureId of allocationFeatureIds(allocation)) {
        const feature = featureById.get(featureId);
        if (feature?.workspace) add(feature.workspace, owner);
      }

      // Imported planning can retain the feature by name instead of ID.
      for (const featureName of [
        allocation.actualFeatureName,
        allocation.featureName,
      ]) {
        if (featureName) addFromNamedFeature(featureName, owner);
      }

      // Some grouped planning rows store the workspace/group name here.
      if (allocation.planningGroup) {
        const canonical = workspaceByKey.get(matchKey(allocation.planningGroup));
        if (canonical) add(canonical, owner);
      }
    }

    // Only as a fallback for a workspace with no mapped planning people at all,
    // use feature owners already recorded in the tracker.
    for (const workspace of workspaceNames) {
      const key = matchKey(workspace);
      if (groups.get(key)?.size) continue;
      for (const feature of features.filter((item) => matchKey(item.workspace) === key)) {
        if (feature?.owner) add(workspace, feature.owner);
      }
    }

    return new Map(
      Array.from(groups.entries()).map(([key, people]) => {
        const names = Array.from(people).sort((a, b) => a.localeCompare(b));
        return [key, {
          names,
          label: names.length > 5 ? 'Whole team' : names.join(', ') || '—',
        }];
      }),
    );
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadTable(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => clean(cell.textContent));
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => clean(cell.textContent)),
    );
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `executive-workspace-delivery-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function removeOldFeaturePanel() {
    document.getElementById('executive-feature-schedule-panel')?.remove();
  }

  function ensureExportButton(table) {
    if (document.getElementById(EXPORT_BUTTON_ID)) return;
    const wrap = table.closest('.delivery-schedule-table-wrap');
    if (!wrap) return;

    const controls = document.createElement('div');
    controls.dataset.executiveWorkspaceExportControls = 'true';
    controls.style.display = 'flex';
    controls.style.justifyContent = 'flex-end';
    controls.style.marginBottom = '10px';

    const button = document.createElement('button');
    button.id = EXPORT_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Export CSV';
    button.title = 'Export workspace, feature count, planned dates and people';
    button.addEventListener('click', () => {
      enhanceWorkspaceTable();
      downloadTable(table);
    });

    controls.appendChild(button);
    wrap.insertBefore(controls, table);
  }

  function enhanceWorkspaceTable() {
    removeOldFeaturePanel();
    const table = document.querySelector('.delivery-schedule-table');
    if (!table) return false;

    const peopleMap = peopleByWorkspace();
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return false;

    let peopleHeader = Array.from(headerRow.children).find(
      (cell) => clean(cell.textContent) === PEOPLE_HEADER,
    );
    if (!peopleHeader) {
      peopleHeader = document.createElement('th');
      peopleHeader.textContent = PEOPLE_HEADER;
      headerRow.appendChild(peopleHeader);
    }

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td');
      if (!cells.length) continue;
      const workspace = clean(cells[0].textContent);
      const people = peopleMap.get(matchKey(workspace));
      let cell = row.querySelector('td[data-executive-workspace-people]');
      if (!cell) {
        cell = document.createElement('td');
        cell.dataset.executiveWorkspacePeople = 'true';
        row.appendChild(cell);
      }
      const next = people?.label || '—';
      if (cell.textContent !== next) cell.textContent = next;
      cell.title = people?.names?.length > 5 ? people.names.join(', ') : '';
    }

    ensureExportButton(table);
    return true;
  }

  function tryInstall() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (enhanceWorkspaceTable() || attempts >= 20) clearInterval(timer);
    }, 250);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button?.textContent?.trim() === 'Executive Dashboard') setTimeout(tryInstall, 50);
  });

  document.addEventListener('change', () => setTimeout(enhanceWorkspaceTable, 80));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  } else {
    tryInstall();
  }
})();
