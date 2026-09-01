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

  function workspaceKey(value) {
    return clean(value).toLowerCase();
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
    const groups = new Map();

    function add(workspace, owner) {
      const key = workspaceKey(workspace);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, new Set());
      for (const person of splitPeople(owner)) groups.get(key).add(person);
    }

    for (const allocation of allocations) {
      if (!allocation?.owner) continue;
      if (allocation.workspace) add(allocation.workspace, allocation.owner);
      for (const featureId of allocationFeatureIds(allocation)) {
        const feature = featureById.get(featureId);
        if (feature?.workspace) add(feature.workspace, allocation.owner);
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
      const people = peopleMap.get(workspaceKey(workspace));
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

    const panel = table.closest('.executive-pipeline-panel');
    const actions = panel?.querySelector('.roadmap-view-actions');
    if (actions && !document.getElementById(EXPORT_BUTTON_ID)) {
      const button = document.createElement('button');
      button.id = EXPORT_BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Export table';
      button.title = 'Export the workspace delivery schedule shown above';
      button.addEventListener('click', () => {
        enhanceWorkspaceTable();
        downloadTable(table);
      });
      actions.appendChild(button);
    }
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
