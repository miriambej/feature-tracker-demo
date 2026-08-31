(() => {
  const APP_KEY = 'feature-tracker-v2-full';
  const BUTTON_ID = 'executive-schedule-export-button';

  function safeParse(value, fallback = {}) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function appState() {
    return safeParse(localStorage.getItem(APP_KEY), {}) || {};
  }

  function allocationFeatureIds(allocation) {
    return Array.from(new Set([
      ...(Array.isArray(allocation?.matchedFeatureIds) ? allocation.matchedFeatureIds : []),
      ...(Array.isArray(allocation?.featureIds) ? allocation.featureIds : []),
      allocation?.featureId,
    ].filter(Boolean)));
  }

  function peopleByWorkspace() {
    const app = appState();
    const features = Array.isArray(app.features) ? app.features : [];
    const allocations = Array.isArray(app.allocations) ? app.allocations : [];
    const featureById = new Map(features.map((feature) => [feature.id, feature]));
    const result = new Map();

    const add = (workspace, person) => {
      const cleanWorkspace = String(workspace || '').trim();
      const cleanPerson = String(person || '').trim();
      if (!cleanWorkspace || !cleanPerson) return;
      if (!result.has(cleanWorkspace)) result.set(cleanWorkspace, new Set());
      result.get(cleanWorkspace).add(cleanPerson);
    };

    for (const allocation of allocations) {
      const owner = allocation?.owner;
      if (!owner) continue;
      if (allocation?.workspace) add(allocation.workspace, owner);
      for (const featureId of allocationFeatureIds(allocation)) {
        const feature = featureById.get(featureId);
        if (feature?.workspace) add(feature.workspace, owner);
      }
    }

    for (const feature of features) {
      if (feature?.owner) add(feature.workspace, feature.owner);
    }

    return new Map(
      Array.from(result.entries()).map(([workspace, people]) => [
        workspace,
        Array.from(people).sort((a, b) => a.localeCompare(b)).join(', '),
      ]),
    );
  }

  function cleanText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  }

  function downloadCsv(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map(cleanText);
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map(cleanText),
    );
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `executive-delivery-schedule-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function enhanceTable() {
    const table = document.querySelector('.delivery-schedule-table');
    if (!table) return false;

    const peopleMap = peopleByWorkspace();
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !Array.from(headerRow.children).some((cell) => cleanText(cell) === 'People')) {
      const th = document.createElement('th');
      th.textContent = 'People';
      headerRow.appendChild(th);
    }

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td');
      if (!cells.length) continue;
      const workspace = cleanText(cells[0]);
      let peopleCell = row.querySelector('td[data-executive-people]');
      if (!peopleCell) {
        peopleCell = document.createElement('td');
        peopleCell.dataset.executivePeople = 'true';
        row.appendChild(peopleCell);
      }
      peopleCell.textContent = peopleMap.get(workspace) || '—';
    }

    const panel = table.closest('.executive-pipeline-panel');
    const actions = panel?.querySelector('.roadmap-view-actions');
    if (actions && !document.getElementById(BUTTON_ID)) {
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Export table';
      button.title = 'Export the executive delivery schedule as CSV';
      button.addEventListener('click', () => {
        enhanceTable();
        downloadCsv(table);
      });
      actions.appendChild(button);
    }
    return true;
  }

  function start() {
    enhanceTable();
    const observer = new MutationObserver(() => enhanceTable());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
