// Stage 1: local-only, manually approved, allowlisted publication snapshots.
// Do not upload this JSON to public hosting. Secure delivery is a separate stage.
export const PUBLICATION_STORAGE_KEY = 'feature-tracker-approved-publications-v1';
const SPRINT_RE = /^(\d{2}Q[1-4])S(\d+)$/i;
export function sprintQuarter(sprint) {
  const match = String(sprint || '').trim().toUpperCase().match(SPRINT_RE);
  return match ? match[1] : null;
}
const clean = value => typeof value === 'string' ? value : '';
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export function availableSprints(allocations, quarter) {
  return [...new Set((allocations || []).map(a => clean(a.sprint).toUpperCase())
    .filter(s => sprintQuarter(s) === quarter))].sort((a,b) => Number(a.split('S').at(-1)) - Number(b.split('S').at(-1)));
}
export function buildSprintSnapshot({sprint, quarter, features, allocations, publishedAt}) {
  if (sprintQuarter(sprint) !== quarter) throw new Error('Sprint must belong to the selected quarter.');
  const rows = (allocations || []).filter(a => clean(a.sprint).toUpperCase() === sprint);
  if (!rows.length) throw new Error('No allocations found for this sprint.');
  // Explicit field allowlist: never spread local data objects into public snapshots.
  const exportRows = rows.map(a => ({
    sprint, owner: clean(a.owner), stage: clean(a.stage),
    days: finite(a.days), startDate: clean(a.startDate || a.start),
    endDate: clean(a.endDate || a.end),
    workspace: clean(a.workspace || a.workspaceName),
    featureIds: [...new Set([...(Array.isArray(a.featureIds) ? a.featureIds : []), a.featureId].filter(Boolean))].map(String),
    featureName: clean(a.featureName || a.planningGroup),
  }));
  const selectedIds = new Set(exportRows.flatMap(a => a.featureIds));
  const exportFeatures = (features || []).filter(f => selectedIds.has(String(f.id))).map(f => ({
    id: String(f.id), name: clean(f.feature_name || f.name), workspace: clean(f.workspace),
    stage: clean(f.status), owner: clean(f.owner),
  }));
  return { sprint, quarter, publishedAt, allocations: exportRows, features: exportFeatures };
}
export function loadPublications() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUBLICATION_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
export function publicationExport(publications, quarter) {
  const sprints = Object.values(publications || {}).filter(p =>
    p && p.quarter === quarter && sprintQuarter(p.sprint) === quarter);
  return { schemaVersion: 1, quarter, exportedAt: new Date().toISOString(),
    sprints: sprints.sort((a,b) => a.sprint.localeCompare(b.sprint)) };
}
export function downloadPublishedSnapshot(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'approved-team-planning-' + data.quarter + '.json';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
