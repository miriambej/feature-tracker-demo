(() => {
  const APP_KEY = 'feature-tracker-v2-full';
  const PEOPLE_HEADER = 'People';
  const EXPORT_BUTTON_ID = 'executive-workspace-export-button';
  const STYLE_ID = 'executive-workspace-table-styles';

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
    const workspaceByKey = new Map(
      workspaceNames.map((workspace) => [matchKey(workspace), workspace]),
    );
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

      for (const workspaceValue of [allocation.workspace, allocation.workspaceName]) {
        if (workspaceValue) {
          const canonical = workspaceByKey.get(matchKey(workspaceValue)) || workspaceValue;
          add(canonical, owner);
        }
      }

      for (const featureId of allocationFeatureIds(allocation)) {
        const feature = featureById.get(featureId);
        if (feature?.workspace) add(feature.workspace, owner);
      }

      for (const featureName of [allocation.actualFeatureName, allocation.featureName]) {
        if (featureName) addFromNamedFeature(featureName, owner);
      }

      if (allocation.planningGroup) {
        const canonical = workspaceByKey.get(matchKey(allocation.planningGroup));
        if (canonical) add(canonical, owner);
      }
    }

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
        return [
          key,
          {
            names,
            label: names.length > 5 ? 'Whole team' : names.join(', ') || '—',
          },
        ];
      }),
    );
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadTable(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) =>
      clean(cell.textContent),
    );
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

  function hideMilestoneRoadmap(table) {
    const dashboard = table.closest('.dashboard');
    if (!dashboard) return;
    for (const panel of dashboard.querySelectorAll('.roadmap-panel')) {
      const heading = panel.querySelector('h3');
      if (clean(heading?.textContent).toLowerCase() === 'milestone roadmap') {
        panel.dataset.executiveHiddenMilestoneRoadmap = 'true';
        panel.style.display = 'none';
      }
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .executive-pipeline-panel .delivery-tables-grid{
        grid-template-columns:minmax(0,1.65fr) minmax(250px,.85fr)!important;
        align-items:start;
        gap:12px!important;
      }
      .executive-pipeline-panel .delivery-schedule-table-wrap{
        grid-column:auto;
        width:100%;
        min-width:0;
      }
      .executive-pipeline-panel .delivery-schedule-table{
        width:100%;
        table-layout:fixed;
      }
      .executive-pipeline-panel .delivery-schedule-table th,
      .executive-pipeline-panel .delivery-schedule-table td{
        padding-left:6px;
        padding-right:6px;
        vertical-align:top;
      }
      .executive-pipeline-panel .delivery-schedule-table th:nth-child(1),
      .executive-pipeline-panel .delivery-schedule-table td:nth-child(1){width:28%;}
      .executive-pipeline-panel .delivery-schedule-table th:nth-child(2),
      .executive-pipeline-panel .delivery-schedule-table td:nth-child(2){width:7%;text-align:center;}
      .executive-pipeline-panel .delivery-schedule-table th:nth-child(3),
      .executive-pipeline-panel .delivery-schedule-table td:nth-child(3){width:13%;}
      .executive-pipeline-panel .delivery-schedule-table th:nth-child(4),
      .executive-pipeline-panel .delivery-schedule-table td:nth-child(4){width:16%;}
      .executive-pipeline-panel .delivery-schedule-table th:nth-child(5),
      .executive-pipeline-panel .delivery-schedule-table td:nth-child(5){width:36%;white-space:normal;overflow-wrap:anywhere;}
      .executive-pipeline-panel .executive-backlog-wrap{
        grid-column:auto;
        min-width:0;
      }
      [data-executive-workspace-export-controls]{
        display:flex;
        justify-content:flex-end;
        margin-bottom:8px;
      }
      @media print{
        .executive-pipeline-panel .delivery-tables-grid{
          grid-template-columns:minmax(0,1.65fr) minmax(220px,.85fr)!important;
          gap:8px!important;
        }
        .executive-pipeline-panel .delivery-schedule-table{
          font-size:9px!important;
        }
        .executive-pipeline-panel .delivery-schedule-table th,
        .executive-pipeline-panel .delivery-schedule-table td{
          padding:3px 4px!important;
        }
        .executive-pipeline-panel .executive-backlog-table{
          font-size:9px!important;
        }
        [data-executive-workspace-export-controls]{display:none!important;}
        [data-executive-hidden-milestone-roadmap="true"]{display:none!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureExportButton(table) {
    if (document.getElementById(EXPORT_BUTTON_ID)) return;
    const wrap = table.closest('.delivery-schedule-table-wrap');
    if (!wrap) return;

    const controls = document.createElement('div');
    controls.dataset.executiveWorkspaceExportControls = 'true';

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

    ensureStyles();
    hideMilestoneRoadmap(table);

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
    if (button?.textContent?.trim() === 'Executive Dashboard') {
      setTimeout(tryInstall, 50);
    }
  });

  document.addEventListener('change', () => setTimeout(enhanceWorkspaceTable, 80));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  } else {
    tryInstall();
  }
})();
