import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'feature-tracker-v2-full';
const TODAY = new Date(2026, 6, 7); // 7 Jul 2026
const CURRENT_SPRINT_END = new Date(2026, 6, 14);
const NEXT_SPRINT_END = new Date(2026, 6, 28);

const STATUSES = [
  ['initial', 'Initial'],
  ['build_in_progress', 'Build'],
  ['build_done', 'Build Done'],
  ['sit_in_progress', 'SIT'],
  ['sit_done', 'SIT Done'],
  ['deployment_in_progress', 'Deploy'],
  ['deployment_done', 'Deploy Done'],
  ['bs_signoff_in_progress', 'BA Sign Off'],
  ['bs_signoff_done', 'BA Sign Off Done'],
  ['uat_in_progress', 'UAT'],
  ['uat_done', 'Done'],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const STATUS_WEIGHT = {
  initial: 0,
  build_in_progress: 15,
  build_done: 30,
  sit_in_progress: 40,
  sit_done: 50,
  deployment_in_progress: 55,
  deployment_done: 60,
  bs_signoff_in_progress: 70,
  bs_signoff_done: 80,
  uat_in_progress: 90,
  uat_done: 100,
};
const MILESTONES = [
  { key: 'Build', label: 'Build', target: 'build_done', short: 'B' },
  { key: 'SIT', label: 'SIT', target: 'sit_done', short: 'S' },
  { key: 'UAT Internal', label: 'UAT Internal', target: 'bs_signoff_done', short: 'U' },
];
const NEEDS_MAPPING_STAGE = 'Needs Mapping';
const PLAN_STAGES = ['Requirement', 'Build', 'SIT', 'Deploy', 'BA Sign Off', 'UAT'];
const STAGE_OPTIONS = [...PLAN_STAGES, NEEDS_MAPPING_STAGE];
const READY_NEXT_STAGE = {
  build_done: 'Ready for SIT',
  sit_done: 'Ready for Deployment',
  deployment_done: 'Ready for BA Sign Off',
  bs_signoff_done: 'Ready for UAT',
};
const NEXT_STAGE_MILESTONE = {
  build_done: 'SIT',
  sit_done: 'UAT Internal',
  deployment_done: 'UAT Internal',
  bs_signoff_done: 'UAT Internal',
};

function id() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function score(status) { return STATUS_WEIGHT[status] ?? 0; }
function isAtLeast(status, target) { return score(status) >= score(target); }
function priority(count) {
  const n = Number(count || 0);
  if (n >= 1000) return 'Critical';
  if (n >= 500) return 'High';
  if (n >= 100) return 'Medium';
  return 'Low';
}
function priorityClass(count) { return priority(count).toLowerCase(); }
function nextStageLabel(status) { return READY_NEXT_STAGE[status] || ''; }
function nextStageDueDate(feature, milestones) {
  const milestone = NEXT_STAGE_MILESTONE[feature.status];
  return milestone ? milestones[feature.workspace]?.[milestone] || '' : '';
}
function plannedThrough(featureId, allocations) {
  const stages = allocations.filter(a => a.featureId === featureId && a.isStageComplete).map(a => PLAN_STAGES.indexOf(a.stage)).filter(i => i >= 0);
  const max = stages.length ? Math.max(...stages) : -1;
  return max >= 0 ? PLAN_STAGES[max] : 'Not planned';
}
function actualPlannedThrough(status) {
  if (['build_done'].includes(status)) return 'Build';
  if (['sit_in_progress', 'sit_done'].includes(status)) return 'SIT';
  if (['deployment_in_progress', 'deployment_done'].includes(status)) return 'Deploy';
  if (['bs_signoff_in_progress', 'bs_signoff_done'].includes(status)) return 'BA Sign Off';
  if (['uat_in_progress', 'uat_done'].includes(status)) return 'UAT';
  return 'Not planned';
}
function actualCompletedThrough(status) {
  if (['build_done'].includes(status)) return 'Build';
  if (['sit_done'].includes(status)) return 'SIT';
  if (['deployment_done'].includes(status)) return 'Deploy';
  if (['bs_signoff_done'].includes(status)) return 'BA Sign Off';
  if (['uat_done'].includes(status)) return 'UAT';
  return 'Not planned';
}
function effectivePlannedThrough(feature, allocations) {
  const actualIdx = PLAN_STAGES.indexOf(actualCompletedThrough(feature.status));
  const plannedIdx = PLAN_STAGES.indexOf(plannedThrough(feature.id, allocations));
  const max = Math.max(actualIdx, plannedIdx);
  return max >= 0 ? PLAN_STAGES[max] : 'Not planned';
}
function nextPlanStage(featureId, allocations, feature = null) {
  const through = feature ? effectivePlannedThrough(feature, allocations) : plannedThrough(featureId, allocations);
  const idx = PLAN_STAGES.indexOf(through);
  return idx >= PLAN_STAGES.length - 1 ? 'Planning Complete' : PLAN_STAGES[idx + 1];
}
function planningBadge(featureId, allocations) {
  const next = nextPlanStage(featureId, allocations);
  return next === 'Planning Complete' ? `Planned to ${PLAN_STAGES.at(-1)}` : (plannedThrough(featureId, allocations) === 'Not planned' ? '' : `Next: ${next}`);
}
function priorityRank(count) { return { Critical: 0, High: 1, Medium: 2, Low: 3 }[priority(count)] ?? 4; }
function latestPlannedSprint(featureId, allocations) {
  const sprints = allocations.filter(a => a.featureId === featureId && a.sprint).map(a => a.sprint).sort();
  return sprints.at(-1) || '—';
}
function normalisePlanStage(v) {
  const raw = String(v || '').trim();
  const clean = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const aliases = {
    req: 'Requirement', requirement: 'Requirement', requirements: 'Requirement', 'tech feasibility': 'Requirement', 'technical feasibility': 'Requirement',
    build: 'Build', development: 'Build', sit: 'SIT', deploy: 'Deploy', deployment: 'Deploy',
    ba: 'BA Sign Off', 'ba sign off': 'BA Sign Off', 'ba signoff': 'BA Sign Off', 'bs sign off': 'BA Sign Off', 'business sign off': 'BA Sign Off', 'ps sign off': 'BA Sign Off', 'skillpi sign off': 'BA Sign Off', 'skillpi sign-off': 'BA Sign Off',
    uat: 'UAT', 'uat internal': 'UAT', 'uat dev support': 'UAT', 'user acceptance testing': 'UAT',
    'needs mapping': NEEDS_MAPPING_STAGE, unmapped: NEEDS_MAPPING_STAGE
  };
  if (STAGE_OPTIONS.includes(raw)) return raw;
  if (aliases[clean]) return aliases[clean];
  if (clean.endsWith(' support')) {
    const parent = clean.replace(/\s+support$/, '');
    if (aliases[parent]) return aliases[parent];
  }
  return '';
}
function stageSortIndex(stage) {
  const idx = STAGE_OPTIONS.indexOf(stage);
  return idx >= 0 ? idx : STAGE_OPTIONS.length;
}
function nextPlanningStageFromRows(feature, rows) {
  const doneIdx = PLAN_STAGES.indexOf(actualCompletedThrough(feature.status));
  const completedIdx = rows.filter(a => a.isStageComplete).map(a => PLAN_STAGES.indexOf(a.stage)).filter(i => i >= 0);
  if (Math.max(doneIdx, completedIdx.length ? Math.max(...completedIdx) : -1) >= PLAN_STAGES.length - 1) return 'Planning Complete';
  const actualIdx = PLAN_STAGES.indexOf(actualPlannedThrough(feature.status));
  const plannedIdx = rows.map(a => PLAN_STAGES.indexOf(a.stage)).filter(i => i >= 0);
  const max = Math.max(actualIdx, plannedIdx.length ? Math.max(...plannedIdx) : -1);
  return max >= PLAN_STAGES.length - 1 ? 'Planning Complete' : (max >= 0 ? PLAN_STAGES[max + 1] : 'Requirement');
}
function normaliseSprintName(v, fallbackQuarter = '26Q1') {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const squashed = raw.toUpperCase().replace(/\s+/g, '');
  const quarterMatch = squashed.match(/(\d{2}Q\d)S?(\d+)/);
  if (quarterMatch) return `${quarterMatch[1]}S${quarterMatch[2]}`;
  const sprintMatch = raw.match(/(?:sprint|s)\s*(\d+)/i);
  return sprintMatch ? `${fallbackQuarter}S${sprintMatch[1]}` : squashed;
}
function normalisePersonName(v) {
  const name = String(v || '').trim().replace(/\s+/g, ' ');
  const key = name.toLowerCase();
  const aliases = { erkarmine: 'Encarmine', encarmine: 'Encarmine', seven: 'Sebin', tavish: 'Tabish' };
  return aliases[key] || name;
}
function isRolePlaceholder(name) {
  return /^(developers?|testers?|tester|ba|bi|sd|solution designer|business analyst|developer)$/i.test(String(name || '').trim());
}
function isSplitPlanningGroup(name) {
  return /(pbi|power\s*bi).*dashboard.*reporting|dashboard.*reporting/i.test(String(name || ''));
}
function planningKeywords(name) {
  return String(name || '').toLowerCase().replace(/power\s*bi|pbi|dashboard|reporting|[-–—&]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w && !['and','the','for','of'].includes(w));
}
function getChildFeatureOptions(allocation, features) {
  const label = allocation.planningGroup || allocation.featureName || allocation.workspaceName || '';
  if (!isSplitPlanningGroup(label)) return [];
  const words = planningKeywords(label);
  const scoped = features.filter(f => words.every(w => String(f.workspace || '').toLowerCase().includes(w)));
  return scoped.length ? scoped : features;
}
function splitOwners(v) {
  const raw = String(v || '').trim();
  if (!raw) return ['Unassigned'];
  return raw.split(/\s*(?:,|\/|&|\+| and )\s*/i).map(x => x.trim()).filter(Boolean);
}
function normaliseStatus(v) {
  const raw = String(v || '').trim().toLowerCase().replace(/\s+/g, '_');
  const aliases = {
    '': 'initial', initial: 'initial', build: 'build_in_progress', sit: 'sit_in_progress',
    deploy: 'deployment_in_progress', deployment: 'deployment_in_progress', ba: 'bs_signoff_in_progress',
    bs: 'bs_signoff_in_progress', done: 'uat_done', uat: 'uat_in_progress'
  };
  return STATUS_LABEL[raw] ? raw : (aliases[raw] || 'initial');
}
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : TODAY.getFullYear();
  if (y < 100) y += 2000;
  return new Date(y, Number(m[2]) - 1, Number(m[1]));
}
function fmtDate(v) {
  const d = parseDate(v);
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonth(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function monthLabel(d) { return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }); }
function monthIndex(date, months) {
  if (!date) return -1;
  return months.findIndex(m => m.getFullYear() === date.getFullYear() && m.getMonth() === date.getMonth());
}
function csvSplit(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]; const nx = line[i + 1];
    if (ch === '"' && q && nx === '"') { cur += '"'; i++; }
    else if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = csvSplit(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = csvSplit(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function buildWorkspaceMilestones(features, existing = {}) {
  const map = { ...existing };
  features.forEach(f => {
    const ws = f.workspace || 'Unknown';
    if (!map[ws]) map[ws] = { Build: '', SIT: '', 'UAT Internal': '' };
    if (!map[ws].Build && f.Build) map[ws].Build = f.Build;
    if (!map[ws].SIT && f.SIT) map[ws].SIT = f.SIT;
    if (!map[ws]['UAT Internal'] && f['UAT Internal']) map[ws]['UAT Internal'] = f['UAT Internal'];
  });
  return map;
}
function milestoneHealth(dueValue, features, target) {
  const due = parseDate(dueValue);
  const blockers = features.filter(f => !isAtLeast(f.status, target));
  const critical = blockers.filter(f => priority(f.user_count) === 'Critical').length;
  if (!due) return { label: 'No date', tone: 'neutral', blockers, critical };
  if (!blockers.length) return TODAY < due ? { label: 'Ahead', tone: 'ahead', blockers, critical } : { label: 'Completed', tone: 'completed', blockers, critical };
  if (TODAY > due) return { label: 'Delayed', tone: 'delayed', blockers, critical };
  if (due <= NEXT_SPRINT_END) return { label: 'Due Next Sprint', tone: 'due_next', blockers, critical };
  return { label: 'On Track', tone: 'track', blockers, critical };
}
function workspaceSummaries(features, milestones) {
  const byWs = {};
  features.forEach(f => {
    const ws = f.workspace || 'Unknown';
    if (!byWs[ws]) byWs[ws] = [];
    byWs[ws].push(f);
  });
  return Object.entries(byWs).map(([workspace, items]) => {
    const dates = milestones[workspace] || { Build: '', SIT: '', 'UAT Internal': '' };
    const ms = MILESTONES.map(m => ({ ...m, health: milestoneHealth(dates[m.key], items, m.target) }));
    const blockers = Array.from(new Map(ms.flatMap(m => m.health.blockers).map(f => [f.id, f])).values());
    const delayed = ms.some(m => m.health.tone === 'delayed');
    const dueNext = ms.some(m => m.health.tone === 'due_next');
    const allAhead = ms.every(m => m.health.tone === 'ahead');
    const allMet = ms.every(m => ['ahead', 'completed'].includes(m.health.tone));
    const overallTone = delayed ? 'delayed' : dueNext ? 'due_next' : allAhead ? 'ahead' : allMet ? 'completed' : 'track';
    const overallLabel = delayed ? 'Delayed' : dueNext ? 'Due Next Sprint' : allAhead ? 'Ahead' : allMet ? 'Completed' : 'On Track';
    return { workspace, features: items, dates, milestones: ms, blockers, overallTone, overallLabel, progress: items.length ? Math.round(items.reduce((sum, f) => sum + score(f.status), 0) / items.length) : 0, totalUsers: items.reduce((s, f) => s + Number(f.user_count || 0), 0), criticalBlockers: blockers.filter(f => priority(f.user_count) === 'Critical').length };
  }).sort((a, b) => b.totalUsers - a.totalUsers);
}

function fmtDateValue(d) {
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function dueThisSprint(features, milestones) {
  const incomplete = [];
  features.forEach(feature => {
    const dates = milestones[feature.workspace] || {};
    MILESTONES.forEach(milestone => {
      const due = parseDate(dates[milestone.key]);
      if (due && !isAtLeast(feature.status, milestone.target)) {
        incomplete.push({ feature, milestone, due });
      }
    });
  });
  const futureDueDates = incomplete.map(item => item.due).filter(d => d > NEXT_SPRINT_END).sort((a, b) => a - b);
  const sprintEnds = [CURRENT_SPRINT_END, NEXT_SPRINT_END, ...futureDueDates];
  const sprintEnd = sprintEnds.find(end => incomplete.some(item => item.due <= end)) || null;
  const items = sprintEnd ? incomplete.filter(item => item.due <= sprintEnd) : [];
  items.sort((a, b) => a.due - b.due || Number(b.feature.user_count || 0) - Number(a.feature.user_count || 0));
  return { sprintEnd, items };
}

function groupDueSprintItems(items) {
  return Object.values(items.reduce((groups, item) => {
    const workspace = item.feature.workspace || 'Unknown';
    if (!groups[workspace]) groups[workspace] = { workspace, items: [], critical: 0 };
    groups[workspace].items.push(item);
    if (priority(item.feature.user_count) === 'Critical') groups[workspace].critical += 1;
    return groups;
  }, {})).sort((a, b) => b.items.length - a.items.length || a.workspace.localeCompare(b.workspace));
}
function timelineMonths(summaries) {
  const points = [monthStart(CURRENT_SPRINT_END)];
  summaries.forEach(ws => MILESTONES.forEach(m => { const d = parseDate(ws.dates[m.key]); if (d) points.push(monthStart(d)); }));
  const min = points.reduce((a, b) => a < b ? a : b);
  const max = points.reduce((a, b) => a > b ? a : b);
  const out = []; let c = monthStart(min);
  while (c <= max) { out.push(new Date(c)); c = addMonth(c, 1); }
  return out;
}

function StatusPill({ tone, label }) { return <span className={`pill-status ${tone}`}>{label}</span>; }
function SummaryCard({ label, value, hint }) { return <div className="summary-card"><div className="summary-label">{label}</div><div className="summary-value">{value}</div><div className="summary-hint">{hint}</div></div>; }

function FeatureCard({ feature, density, onEdit, onDragStart, allocations }) {
  return <div className={`feature-card ${density} ${priorityClass(feature.user_count)}`} draggable onDragStart={e => onDragStart(e, feature.id)} onDoubleClick={() => onEdit(feature)}>
    <div className="card-top"><div className="card-title">{feature.feature_name}</div><button onClick={() => onEdit(feature)}>Edit</button></div>
    <div className="card-workspace">{feature.workspace}</div>
    <div className="card-meta"><span>{feature.owner || '—'}</span><span className="user-pill">{feature.user_count || 0} users</span></div>
    <div className="card-meta"><span>{priority(feature.user_count)}</span><span>{STATUS_LABEL[feature.status]}</span></div>
    {density !== 'compact' && nextStageLabel(feature.status) && <div className="ready-tag">{nextStageLabel(feature.status)}</div>}
    {planningBadge(feature.id, allocations) && <div className="plan-badge">{planningBadge(feature.id, allocations)}</div>}
  </div>;
}
function BoardView({ features, setFeatures, workspaces, owners, workspaceFilter, setWorkspaceFilter, ownerFilter, setOwnerFilter, onEdit, onAdd, allocations }) {
  const [density, setDensity] = useState('standard');
  const boardFeatures = features.filter(f => (workspaceFilter === 'ALL' || f.workspace === workspaceFilter) && (ownerFilter === 'ALL' || splitOwners(f.owner).includes(ownerFilter)));
  const inFlight = boardFeatures.filter(f => !['initial', 'uat_done'].includes(f.status)).length;
  const readyNext = boardFeatures.filter(f => ['build_done', 'sit_done', 'deployment_done', 'bs_signoff_done'].includes(f.status)).length;
  function start(e, fid) { e.dataTransfer.setData('featureId', fid); }
  function drop(e, status) {
    e.preventDefault();
    const fid = e.dataTransfer.getData('featureId');
    setFeatures(prev => prev.map(f => f.id === fid ? { ...f, status } : f));
  }
  return <>
    <div className="toolbar sub"><div className="toolbar-left"><strong>Board View</strong><select value={workspaceFilter} onChange={e => setWorkspaceFilter(e.target.value)}>{workspaces.map(w => <option key={w}>{w}</option>)}</select><select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>{owners.map(o => <option key={o}>{o}</option>)}</select><select value={density} onChange={e => setDensity(e.target.value)}><option value="standard">Standard</option><option value="compact">Compact</option></select></div><AddFeature workspaces={workspaces} onAdd={onAdd} /><div className="mini-stats"><span>In Flight <b>{inFlight}</b></span><span>Ready Next <b>{readyNext}</b></span></div></div>
    <ReadyQueue features={boardFeatures} onEdit={onEdit} />
    <div className="board-scroll"><div className={`board ${density}`}>{STATUSES.map(([key, label]) => {
      const list = boardFeatures.filter(f => f.status === key);
      return <div className={`board-col ${density}`} key={key} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, key)}><div className="col-head"><div><b>{label}</b><small>{list.length} shown</small></div><span>{list.length}</span></div>{list.length ? list.map(f => <FeatureCard key={f.id} feature={f} density={density} onEdit={onEdit} onDragStart={start} allocations={allocations} />) : <div className="empty">Drop here</div>}</div>;
    })}</div></div>
  </>;
}
function AddFeature({ workspaces, onAdd }) {
  const [form, setForm] = useState({ feature_name: '', workspace: '', owner: '', user_count: '' });
  useEffect(() => { if (!form.workspace) setForm(p => ({ ...p, workspace: workspaces.find(w => w !== 'ALL') || '' })); }, [workspaces, form.workspace]);
  function add() {
    if (!form.feature_name.trim()) return;
    onAdd({ id: id(), feature_name: form.feature_name.trim(), workspace: form.workspace || 'Unknown', owner: form.owner.trim(), user_count: Number(form.user_count || 0), status: 'initial', notes: '' });
    setForm(p => ({ ...p, feature_name: '', owner: '', user_count: '' }));
  }
  return <div className="add-feature"><input placeholder="Add new feature" value={form.feature_name} onChange={e => setForm({ ...form, feature_name: e.target.value })} onKeyDown={e => e.key === 'Enter' && add()} /><select value={form.workspace} onChange={e => setForm({ ...form, workspace: e.target.value })}>{workspaces.filter(w => w !== 'ALL').map(w => <option key={w}>{w}</option>)}</select><input placeholder="Owner" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} /><input placeholder="Users" type="number" value={form.user_count} onChange={e => setForm({ ...form, user_count: e.target.value })} /><button onClick={add}>Add</button></div>;
}
function ReadyQueue({ features, onEdit }) {
  const buckets = [['build_done', 'Ready for SIT'], ['sit_done', 'Ready for Deployment'], ['deployment_done', 'Ready for BA Sign Off'], ['bs_signoff_done', 'Ready for UAT']];
  return <div className="panel"><h3>Planning queue</h3><div className="queue-grid">{buckets.map(([status, title]) => <div className="queue" key={status}><h4>{title}</h4>{features.filter(f => f.status === status).sort((a, b) => Number(b.user_count || 0) - Number(a.user_count || 0)).map(f => <div className={`queue-card ${priorityClass(f.user_count)}`} key={f.id}><div><b>{f.feature_name}</b><small>{f.workspace} · {f.owner || 'No owner'}</small></div><div className="detail-card-actions"><span>{Number(f.user_count || 0).toLocaleString()} users</span><button onClick={() => onEdit(f)}>Edit</button></div></div>) || null}</div>)}</div></div>;
}

function ExecutiveDashboard({ features, milestones, setMilestones, workspaces, workspaceFilter, setWorkspaceFilter, selectedWorkspace, setSelectedWorkspace, onEditFeature }) {
  const filtered = workspaceFilter === 'ALL' ? features : features.filter(f => f.workspace === workspaceFilter);
  const summaries = workspaceSummaries(filtered, milestones);
  const months = timelineMonths(summaries);
  const todayIdx = monthIndex(monthStart(CURRENT_SPRINT_END), months);
  const selected = summaries.find(s => s.workspace === selectedWorkspace);
  const [editWs, setEditWs] = useState(null);
  return <div className="dashboard">
    <div className="dash-head"><div><div className="eyebrow">Executive Dashboard</div><h1>Workspace milestone roadmap</h1></div><select value={workspaceFilter} onChange={e => { setWorkspaceFilter(e.target.value); setSelectedWorkspace(null); }}>{workspaces.map(w => <option key={w}>{w}</option>)}</select></div>
    <div className="summary-grid"><SummaryCard label="Workspaces" value={summaries.length} hint="Current view"/><SummaryCard label="Delayed" value={summaries.filter(s => s.overallTone === 'delayed').length} hint="Missed milestone"/><SummaryCard label="Due Next Sprint" value={summaries.filter(s => s.overallTone === 'due_next').length} hint="Needs planning focus"/><SummaryCard label="Completed / Ahead" value={summaries.filter(s => ['completed','ahead'].includes(s.overallTone)).length} hint="Meeting targets"/><SummaryCard label="Blocking Features" value={summaries.reduce((n,s)=>n+s.blockers.length,0)} hint="Blocking milestones"/><SummaryCard label="Critical Blocking" value={summaries.reduce((n,s)=>n+s.criticalBlockers,0)} hint="Critical blockers"/></div>
    <div className="panel roadmap-panel"><h3>Milestone roadmap</h3><div className="timeline-head exec-roadmap-head" style={{ gridTemplateColumns: `280px 180px repeat(${months.length}, minmax(88px,1fr)) 150px` }}><span>Workspace</span><span>Progress</span>{months.map((m,i)=><span key={i} className={i===todayIdx?'today-month':''}>{monthLabel(m)}</span>)}<span>Health</span></div>{summaries.map(s => <div className="timeline-row exec-roadmap-row" style={{ gridTemplateColumns: `280px 180px 1fr 150px` }} key={s.workspace} onClick={() => setSelectedWorkspace(s.workspace)}><div><b>{s.workspace}</b><small>{s.features.length} features · {s.blockers.length} blockers</small></div><div className="roadmap-progress"><div className="progress-track"><i className={s.overallTone} style={{width:`${s.progress}%`}}/></div><small>{s.progress}%</small></div><div className="timeline-track" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(88px,1fr))` }}>{months.map((m,i)=><div key={i} className={i===todayIdx?'today-cell':''}/>) }{todayIdx>=0&&<div className="today-line" style={{left:`calc(${((todayIdx+.5)/months.length)*100}% - 1px)`}}/>}{s.milestones.map(m=>{const idx=monthIndex(parseDate(s.dates[m.key]),months);return idx<0?null:<div key={m.key} className={`dot ${m.health.tone}`} style={{left:`calc(${((idx+.5)/months.length)*100}% - 12px)`}} title={`${m.label} ${fmtDate(s.dates[m.key])}`}>{m.short}</div>})}</div><div className="row-actions"><StatusPill tone={s.overallTone} label={s.overallLabel}/><button onClick={(e)=>{e.stopPropagation();setEditWs(s.workspace)}}>Edit dates</button></div></div>)}</div>
    <div className="two-col"><div className="panel"><h3>Workspace milestone summary</h3><table><thead><tr><th>Workspace</th><th>Build</th><th>SIT</th><th>UAT Internal</th><th>Overall</th><th>Features</th><th>Blocking</th><th>Critical</th></tr></thead><tbody>{summaries.map(s=><tr key={s.workspace} onClick={()=>setSelectedWorkspace(s.workspace)}><td>{s.workspace}</td>{s.milestones.map(m=><td key={m.key}><StatusPill tone={m.health.tone} label={m.health.label}/><small>{fmtDate(s.dates[m.key])}</small></td>)}<td><StatusPill tone={s.overallTone} label={s.overallLabel}/></td><td>{s.features.length}</td><td>{s.blockers.length}</td><td>{s.criticalBlockers}</td></tr>)}</tbody></table></div><WorkspaceDetail summary={selected} onClose={()=>setSelectedWorkspace(null)} onEdit={onEditFeature}/></div>
    {editWs && <WorkspaceModal workspace={editWs} dates={milestones[editWs]} onClose={()=>setEditWs(null)} onSave={(ws,dates)=>{setMilestones(p=>({...p,[ws]:dates}));setEditWs(null)}}/>}
  </div>;
}
function WorkspaceDetail({ summary, onClose, onEdit }) {
  if (!summary) return <div className="panel"><h3>Workspace detail</h3><p className="muted">Select a workspace to view blockers.</p></div>;
  return <div className="panel"><div className="panel-top"><div><h3>{summary.workspace}</h3><small>Blocking features by milestone</small></div><button onClick={onClose}>Close</button></div>{summary.milestones.map(m=>{const ranked=m.health.blockers.slice().sort((a,b)=>Number(b.user_count||0)-Number(a.user_count||0));return <div className="detail-section" key={m.key}><div className="panel-top"><div><b>{m.label}</b><small>Due {fmtDate(summary.dates[m.key])}</small></div><StatusPill tone={m.health.tone} label={m.health.label}/></div>{ranked.length?ranked.map(f=><div className={`queue-card ${priorityClass(f.user_count)}`} key={f.id}><div><b>{f.feature_name}</b><small>{f.owner || 'Unassigned'} · {STATUS_LABEL[f.status]}</small></div><div className="detail-card-actions"><span>{Number(f.user_count||0).toLocaleString()} users</span><button onClick={()=>onEdit(f)}>Edit</button></div></div>):<p className="muted">No blocking features.</p>}</div>})}</div>;
}
function WorkspaceModal({ workspace, dates, onClose, onSave }) {
  const [form,setForm]=useState(dates || {Build:'',SIT:'','UAT Internal':''});
  return <div className="modal"><div className="modal-card small"><div className="panel-top"><h2>Edit workspace milestones</h2><button onClick={onClose}>Close</button></div><h3>{workspace}</h3>{MILESTONES.map(m=><label key={m.key}>{m.label} due<input value={form[m.key]||''} onChange={e=>setForm({...form,[m.key]:e.target.value})} placeholder="19/05/2026"/></label>)}<div className="modal-actions"><button onClick={onClose}>Cancel</button><button onClick={()=>onSave(workspace,form)}>Save</button></div></div></div>;
}
function FeatureModal({ feature, workspaces, owners, onClose, onSave }) {
  const [form,setForm]=useState(feature||{}); useEffect(()=>setForm(feature||{}),[feature]); if(!feature)return null;
  return <div className="modal"><div className="modal-card"><div className="panel-top"><h2>Edit feature</h2><button onClick={onClose}>Close</button></div><div className="form-grid"><label>Feature name<input value={form.feature_name||''} onChange={e=>setForm({...form,feature_name:e.target.value})}/></label><label>Workspace<select value={form.workspace||''} onChange={e=>setForm({...form,workspace:e.target.value})}>{workspaces.filter(w=>w!=='ALL').map(w=><option key={w}>{w}</option>)}</select></label><label>Owner<input value={form.owner||''} onChange={e=>setForm({...form,owner:e.target.value})} list="owners"/></label><label>User count<input type="number" value={form.user_count||0} onChange={e=>setForm({...form,user_count:Number(e.target.value||0)})}/></label><label>Status<select value={form.status||'initial'} onChange={e=>setForm({...form,status:e.target.value})}>{STATUSES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label><label className="full">Notes<textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div><datalist id="owners">{owners.filter(o=>o!=='ALL').map(o=><option key={o} value={o}/>)}</datalist><div className="modal-actions"><button onClick={onClose}>Cancel</button><button onClick={()=>onSave(form)}>Save</button></div></div></div>;
}
function OverviewDashboard({ features, milestones, workspaces, workspaceFilter, setWorkspaceFilter }) {
  const filtered=workspaceFilter==='ALL'?features:features.filter(f=>f.workspace===workspaceFilter);
  const grouped=Object.fromEntries(STATUSES.map(([k])=>[k,filtered.filter(f=>f.status===k).length]));
  const total=filtered.length; const totalUsers=filtered.reduce((s,f)=>s+Number(f.user_count||0),0);
  const nextActions=filtered.filter(f=>['build_done','sit_done','deployment_done','bs_signoff_done'].includes(f.status)).sort((a,b)=>Number(b.user_count||0)-Number(a.user_count||0)).slice(0,8);
  const dueSprint=dueThisSprint(filtered,milestones);
  const dueGroups=groupDueSprintItems(dueSprint.items);
  return <div className="dashboard"><div className="dash-head"><div><div className="eyebrow">Overview Dashboard</div><h1>Stage health and next sprint focus</h1></div><select value={workspaceFilter} onChange={e=>setWorkspaceFilter(e.target.value)}>{workspaces.map(w=><option key={w}>{w}</option>)}</select></div><div className="summary-grid"><SummaryCard label="Total Features" value={total} hint="Current view"/><SummaryCard label="In Flight" value={filtered.filter(f=>!['initial','uat_done'].includes(f.status)).length} hint="Not initial or done"/><SummaryCard label="Ready Next" value={nextActions.length} hint="Ready for next stage"/><SummaryCard label="Total Users" value={totalUsers.toLocaleString()} hint="Usage impact"/><SummaryCard label="Done" value={grouped.uat_done||0} hint="UAT done"/><SummaryCard label="Progress" value={`${total?Math.round(filtered.reduce((s,f)=>s+score(f.status),0)/total):0}%`} hint="Weighted maturity"/></div><div className="two-col overview-grid"><div className="panel due-panel"><div className="panel-top"><div><h3>Due This Sprint</h3><p className="muted">Sprint ending {fmtDateValue(dueSprint.sprintEnd)}</p></div><span className="pill-status due_next">{dueSprint.items.length} items</span></div>{dueGroups.length?dueGroups.map(group=><div className="priority-block workspace-due-block" key={group.workspace}><div className="workspace-due-head"><div><b>{group.workspace}</b><small>{group.items.length} blocking features · {group.critical} critical</small></div><span className="ready-tag">{group.items[0].milestone.label}</span></div>{group.items.map(({feature:f,milestone:m,due})=><div key={`${f.id}-${m.key}`} className={`next-action-card ${priorityClass(f.user_count)}`}><div className="next-action-main"><b>{f.feature_name}</b><small>{f.workspace} · {STATUS_LABEL[f.status]}</small><small>Milestone needed: {m.label} · Due {fmtDateValue(due)}</small></div><div className="next-action-impact"><span>{Number(f.user_count||0).toLocaleString()} users</span><b>{priority(f.user_count)}</b></div></div>)}</div>):<p className="muted">No incomplete milestone work has a due date.</p>}</div><div className="panel stage-panel"><h3>Stage breakdown</h3>{STATUSES.map(([k,l])=><div className="bar-row" key={k}><span>{l}</span><b>{grouped[k]||0}</b><div><i style={{width:`${total?(grouped[k]||0)/total*100:0}%`}}/></div></div>)}</div></div><div className="panel"><h3>Top next actions</h3>{nextActions.length?nextActions.map(f=><div className={`next-action-card ${priorityClass(f.user_count)}`} key={f.id}><div className="next-action-main"><b>{f.feature_name}</b><small>{f.workspace}</small><small>Current: {STATUS_LABEL[f.status]}</small><small>Next: {nextStageLabel(f.status)}</small><small>Due: {fmtDate(nextStageDueDate(f,milestones))}</small></div><div className="next-action-impact"><span>{Number(f.user_count||0).toLocaleString()} users</span><b>{priority(f.user_count)}</b></div></div>):<p className="muted">No features currently ready for the next action.</p>}</div></div>;
}

function DeliveryPlan({ features, allocations, setAllocations, capacities, setCapacities, customSprints, setCustomSprints, owners }) {
  const sprintOptions = useMemo(() => {
    const fromData = Array.from(new Set([...customSprints, ...capacities.map(c => c.sprint), ...allocations.map(a => a.sprint)].map(s => normaliseSprintName(s)).filter(Boolean)));
    return fromData.length ? fromData.sort() : ['26Q1S1','26Q1S2','26Q1S3','26Q1S4','26Q1S5','26Q1S6','26Q1S7'];
  }, [customSprints, capacities, allocations]);
  const [sprint,setSprint]=useState(sprintOptions[0] || '26Q1S1');
  const ownerOptions=useMemo(()=>Array.from(new Set([...owners.filter(o=>o!=='ALL'), ...capacities.map(c=>c.owner), ...allocations.map(a=>a.owner)].map(normalisePersonName).filter(o=>o&&!isRolePlaceholder(o)))).sort(),[owners,capacities,allocations]);
  const [ownerFilter,setOwnerFilter]=useState('ALL');
  const [planWorkspaceFilter,setPlanWorkspaceFilter]=useState('ALL');
  const [stageFilter,setStageFilter]=useState('ALL');
  const [warning,setWarning]=useState('');
  const [importMessage,setImportMessage]=useState('');
  const [newSprint,setNewSprint]=useState('');
  const [selectedPlanFeature,setSelectedPlanFeature]=useState(null);
  const [quickPlan,setQuickPlan]=useState({stage:'Requirement',sprint:sprintOptions[0] || '26Q1S1',owner:'',days:1,isStageComplete:false});
  useEffect(()=>{setQuickPlan(q=>({...q,sprint:q.sprint||sprintOptions[0]||'26Q1S1',owner:q.owner||ownerOptions[0]||''}));},[sprintOptions,ownerOptions]);
  const allFeatureWorkspaces=Array.from(new Set(features.map(f=>f.workspace).filter(Boolean))).sort();
  const allocationWorkspace=a=>a.workspace||a.planningGroup||a.featureName||a.workspaceName||'Unknown';
  const standaloneKeys=Array.from(new Set(allocations.filter(a=>!a.featureId&&!isSplitPlanningGroup(a.planningGroup||a.featureName)).map(a=>a.featureName||a.planningGroup||a.workspaceName).filter(Boolean)));
  const planningFeatures=[...features,...standaloneKeys.map(key=>({id:`standalone:${key}`,planningKey:key,feature_name:key,workspace:allocations.find(a=>(a.featureName||a.planningGroup||a.workspaceName)===key)?.workspace||key,status:'initial',owner:'',user_count:0}))];
  const entityAllocations=feature=>feature.planningKey?allocations.filter(a=>!a.featureId&&(a.featureName||a.planningGroup||a.workspaceName)===feature.planningKey):allocations.filter(a=>a.featureId===feature.id);
  const entityThrough=feature=>{const actualIdx=PLAN_STAGES.indexOf(actualCompletedThrough(feature.status));const completed=entityAllocations(feature).filter(a=>a.isStageComplete).map(a=>PLAN_STAGES.indexOf(a.stage)).filter(i=>i>=0);const max=Math.max(actualIdx,completed.length?Math.max(...completed):-1);return max>=0?PLAN_STAGES[max]:'Not planned';};
  const entityIsPlanningComplete=feature=>PLAN_STAGES.indexOf(entityThrough(feature))>=PLAN_STAGES.length-1;
  const entityLatestPlannedStage=feature=>{const rows=entityAllocations(feature); const planned=rows.map(a=>PLAN_STAGES.indexOf(a.stage)).filter(i=>i>=0);const actualIdx=PLAN_STAGES.indexOf(actualPlannedThrough(feature.status));const max=Math.max(actualIdx,planned.length?Math.max(...planned):-1);if(max>=0)return PLAN_STAGES[max]; return rows.some(a=>a.stage===NEEDS_MAPPING_STAGE)?NEEDS_MAPPING_STAGE:'Requirement';};
  const entityNext=feature=>nextPlanningStageFromRows(feature,entityAllocations(feature));
  const entityLatestSprint=feature=>entityAllocations(feature).map(a=>a.sprint).filter(Boolean).sort().at(-1)||'—';
  const entityMilestones=feature=>STAGE_OPTIONS.map(stage=>{const rows=entityAllocations(feature).filter(a=>a.stage===stage&&a.sprint).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint)));const latest=rows.at(-1);return latest?{stage,sprint:latest.sprint,sourceStage:latest.sourceStage,complete:!!latest.isStageComplete}:null;}).filter(Boolean);
  const visibleOwners=ownerFilter==='ALL'?ownerOptions:ownerOptions.filter(o=>o===ownerFilter);
  const capacityRows=visibleOwners.map(owner=>{const ownerKey=normalisePersonName(owner);const sprintKey=normaliseSprintName(sprint);const cap=capacities.find(c=>normaliseSprintName(c.sprint)===sprintKey&&normalisePersonName(c.owner)===ownerKey);const counted=allocations.filter(a=>normaliseSprintName(a.sprint)===sprintKey&&normalisePersonName(a.owner)===ownerKey);const available=cap?Number(cap.availableDays||0):null;const planned=counted.reduce((n,a)=>n+Number(a.days||0),0);return{owner:ownerKey,available,planned,remaining:available==null?null:available-planned,counted};});
  const ownerSprintTotals=allocations.reduce((map,a)=>{const key=`${a.sprint}||${a.owner}`; if(!map[key]) map[key]={sprint:a.sprint,owner:a.owner,planned:0}; map[key].planned+=Number(a.days||0); return map;},{});
  function remainingFor(owner,sprintId){const ownerKey=normalisePersonName(owner);const sprintKey=normaliseSprintName(sprintId);const cap=capacities.find(c=>normaliseSprintName(c.sprint)===sprintKey&&normalisePersonName(c.owner)===ownerKey); if(!cap)return null; const planned=allocations.filter(a=>normaliseSprintName(a.sprint)===sprintKey&&normalisePersonName(a.owner)===ownerKey).reduce((n,a)=>n+Number(a.days||0),0); return Number(cap.availableDays||0)-planned;}
  function updateCapacity(owner,availableDays){const ownerKey=normalisePersonName(owner);const sprintKey=normaliseSprintName(sprint);setCapacities(prev=>{const rest=prev.filter(c=>!(normaliseSprintName(c.sprint)===sprintKey&&normalisePersonName(c.owner)===ownerKey));return[...rest,{sprint:sprintKey,owner:ownerKey,availableDays:Number(availableDays||0)}];});}
  function updateAllocation(allocationId,patch){setAllocations(prev=>prev.map(a=>a.id===allocationId?{...a,...patch,stage:patch.stage?normalisePlanStage(patch.stage):a.stage,owner:patch.owner?normalisePersonName(patch.owner):a.owner,sprint:patch.sprint?normaliseSprintName(patch.sprint):a.sprint}:a));}
  function updateAllocationFeature(allocationId,featureId){const feature=features.find(f=>f.id===featureId); if(!feature)return; updateAllocation(allocationId,{featureId:feature.id,actualFeatureName:feature.feature_name,featureName:feature.feature_name,workspace:feature.workspace});}
  function deleteAllocation(allocationId){if(confirm('Delete this planning allocation?')) setAllocations(prev=>prev.filter(a=>a.id!==allocationId));}
  function saveRecommendedAllocation(feature){const stage=normalisePlanStage(quickPlan.stage)||entityNext(feature); if(stage==='Planning Complete')return false; const sprintToUse=normaliseSprintName(quickPlan.sprint==='ALL'?sprintOptions[0]:quickPlan.sprint); const owner=normalisePersonName(quickPlan.owner||ownerOptions[0]||''); const days=Number(quickPlan.days||0); const remaining=remainingFor(owner,sprintToUse); setWarning(remaining!=null&&days>remaining?`${owner} will be over capacity by ${days-remaining} day(s) in ${sprintToUse}.`: ''); const base={id:id(),featureName:feature.feature_name,workspace:feature.workspace,stage,sprint:sprintToUse,owner,days,isStageComplete:!!quickPlan.isStageComplete}; setAllocations(prev=>[feature.planningKey?{...base,planningGroup:'',workspaceName:feature.planningKey}:{...base,featureId:feature.id},...prev]); setSelectedPlanFeature(null); return true;}
  function addSprint(){const name=normaliseSprintName(newSprint); if(!name)return; setCustomSprints(prev=>Array.from(new Set([...prev.map(normaliseSprintName),name])).sort()); setSprint(name); setQuickPlan(q=>({...q,sprint:name})); setNewSprint('');}
  function exportPlanningData(){const payload={version:1,exportedAt:new Date().toISOString(),customSprints,allocations,capacities};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='planning-kanban-data.json';a.click();URL.revokeObjectURL(url);}
  function importPlanningData(e){const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{try{const data=JSON.parse(String(reader.result||'{}')); if(!Array.isArray(data.allocations)||!Array.isArray(data.capacities)) throw new Error('File does not contain planning allocations and capacities.'); const restoredSprints=Array.isArray(data.customSprints)?data.customSprints.map(normaliseSprintName).filter(Boolean):[]; const restoredAllocations=data.allocations.map(a=>{const sourceStage=a.sourceStage||a.stage; return {...a,sprint:normaliseSprintName(a.sprint),owner:normalisePersonName(a.owner),stage:normalisePlanStage(sourceStage)||normalisePlanStage(a.stage)||NEEDS_MAPPING_STAGE,sourceStage,days:Number(a.days||0)};}); const restoredCapacities=data.capacities.map(c=>({...c,sprint:normaliseSprintName(c.sprint),owner:normalisePersonName(c.owner),availableDays:Number(c.availableDays||0)})); const nextSprint=Array.from(new Set([...restoredSprints,...restoredCapacities.map(c=>c.sprint),...restoredAllocations.map(a=>a.sprint)].filter(Boolean))).sort()[0]||'26Q1S1'; setAllocations(restoredAllocations); setCapacities(restoredCapacities); setCustomSprints(restoredSprints); setSprint(nextSprint); setQuickPlan(q=>({...q,sprint:nextSprint})); setImportMessage(`Imported planning backup with ${restoredAllocations.length} allocation(s), ${restoredCapacities.length} capacity row(s), and ${restoredSprints.length} custom sprint(s).`);}catch(err){setImportMessage(`Planning data import failed: ${err.message}`);} finally {e.target.value='';}}; reader.readAsText(file);}
  async function importPlanningExcel(e){
    const file=e.target.files?.[0]; if(!file)return;
    try{
      const XLSX=await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellStyles:true});
      const sheet=wb.Sheets['26Q1 Planner'];
      if(!sheet){setImportMessage('Sheet "26Q1 Planner" was not found.');return;}
      const rawCell=(r,c)=>sheet[XLSX.utils.encode_cell({r,c})];
      const cell=(r,c)=>rawCell(r,c)?.v;
      const text=(r,c)=>String(cell(r,c)??'').trim();
      const fillRgb=(r,c)=>String(rawCell(r,c)?.s?.fill?.fgColor?.rgb||rawCell(r,c)?.s?.fgColor?.rgb||'').toUpperCase();
      const expectedComplete=(r,c)=>[c,c+1,c+2].some(col=>fillRgb(r,col)==='FFFFFF00');
      const sprintCols=Array.from({length:7},(_,i)=>({label:`S${i+1}`,col:17+i*3,sprint:normaliseSprintName(`26Q1S${i+1}`)}));
      const range=XLSX.utils.decode_range(sheet['!ref']||'A1:A220');
      const imported=[];
      let currentFeature='';
      let capacityStart=-1;

      for(let r=12;r<=range.e.r;r++){
        if(/^name$/i.test(text(r,17))&&/^capacity$/i.test(text(r,18))){
          capacityStart=r;
          break;
        }
        const featureCell=text(r,2);
        if(featureCell) currentFeature=featureCell;
        if(!currentFeature) continue;
        if(/^name$/i.test(text(r,17))||/^total$/i.test(text(r,17))||/^capacity$/i.test(text(r,18))) continue;
        sprintCols.forEach(({sprint,col})=>{
          const owner=normalisePersonName(text(r,col));
          const sourceStage=text(r,col+1);
          const stage=normalisePlanStage(sourceStage)||NEEDS_MAPPING_STAGE;
          const days=Number(cell(r,col+2)||0);
          const isStageComplete=expectedComplete(r,col);
          if(owner&&!/^total$/i.test(owner)&&days&&!isRolePlaceholder(owner)){
            const split=isSplitPlanningGroup(currentFeature);
            const match=!split?features.find(f=>f.feature_name.trim().toLowerCase()===currentFeature.toLowerCase()):null;
            imported.push({id:id(),featureId:match?.id||'',featureName:split?'':currentFeature,actualFeatureName:match?.feature_name||'',planningGroup:split?currentFeature:'',workspaceName:currentFeature,workspace:match?.workspace||(!split?currentFeature:''),sprint,owner,stage,sourceStage,days,isStageComplete});
          }
        });
      }

      const importedCaps=[];
      if(capacityStart>=0){
        for(let r=capacityStart+1;r<=range.e.r;r++){
          const hasAnyCapacity=sprintCols.some(({col})=>text(r,col)||cell(r,col+1));
          if(!hasAnyCapacity) break;
          sprintCols.forEach(({sprint,col})=>{
            const owner=normalisePersonName(text(r,col));
            const availableDays=Number(cell(r,col+1)||0);
            if(owner&&!/^total$/i.test(owner)&&Number.isFinite(availableDays)&&availableDays>0&&!isRolePlaceholder(owner)){
              importedCaps.push({sprint,owner,availableDays});
            }
          });
        }
      }
      console.log('imported allocations', imported);
      console.log('imported capacities', importedCaps);
      setAllocations(imported);
      setCapacities(importedCaps);
      setImportMessage(`Imported ${imported.length} allocation(s). Imported ${importedCaps.length} capacity row(s).`);
    }catch(err){setImportMessage(`Excel import failed: ${err.message}`);}
    finally {e.target.value='';}
  }
  const kanbanBase=planningFeatures.filter(f=>(planWorkspaceFilter==='ALL'||f.workspace===planWorkspaceFilter)&&(ownerFilter==='ALL'||splitOwners(f.owner).includes(ownerFilter)||entityAllocations(f).some(a=>a.owner===ownerFilter)));
  const kanbanItems=kanbanBase.map(feature=>{const through=entityThrough(feature); const next=entityNext(feature); const latestStage=entityIsPlanningComplete(feature)?'Planning Complete':entityLatestPlannedStage(feature); return{feature,through,next,latest:entityLatestSprint(feature),latestStage,milestones:entityMilestones(feature)};}).sort((a,b)=>priorityRank(a.feature.user_count)-priorityRank(b.feature.user_count)||Number(b.feature.user_count||0)-Number(a.feature.user_count||0));
  const kanbanLabels={Requirement:'Requirement Planning',Build:'Build Planning',SIT:'SIT Planning',Deploy:'Deploy Planning','BA Sign Off':'BA Sign Off Planning',UAT:'UAT Planning',[NEEDS_MAPPING_STAGE]:'Needs Mapping','Planning Complete':'Planning Complete'};
  const kanbanColumns=[...STAGE_OPTIONS,'Planning Complete'].map(stage=>({stage,label:kanbanLabels[stage],items:kanbanItems.filter(item=>item.latestStage===stage)}));
  const selectedAllocations=selectedPlanFeature?entityAllocations(selectedPlanFeature).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint))||stageSortIndex(a.stage)-stageSortIndex(b.stage)):[];
  const selectedRemaining=quickPlan.owner?remainingFor(quickPlan.owner,quickPlan.sprint):null;
  const capacityGuidance=quickPlan.sprint?ownerOptions.map(owner=>({owner,remaining:remainingFor(owner,quickPlan.sprint)})).filter(r=>r.remaining!=null):[];
  const openPlanFeature=feature=>{const stage=entityNext(feature);setSelectedPlanFeature(feature);setQuickPlan(q=>({...q,stage:stage==='Planning Complete'?'UAT':stage,sprint:q.sprint==='ALL'?sprintOptions[0]:q.sprint,owner:q.owner||ownerOptions[0]||'',days:q.days||1,isStageComplete:false}));};
  const filteredAllocations=allocations.filter(a=>(ownerFilter==='ALL'||a.owner===ownerFilter)&&(planWorkspaceFilter==='ALL'||allocationWorkspace(a)===planWorkspaceFilter)&&(stageFilter==='ALL'||a.stage===stageFilter)).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint))||stageSortIndex(a.stage)-stageSortIndex(b.stage));
  const sprintPlanRows=allocations.filter(a=>(ownerFilter==='ALL'||a.owner===ownerFilter)&&(planWorkspaceFilter==='ALL'||allocationWorkspace(a)===planWorkspaceFilter)).map(a=>({sprint:a.sprint||'Unscheduled',item:a.planningGroup||a.featureName||a.workspaceName||'Planning item',workspace:allocationWorkspace(a),stage:a.stage||NEEDS_MAPPING_STAGE,sourceStage:a.sourceStage||a.stage||'',owner:a.owner||'',days:Number(a.days||0),outcome:a.isStageComplete?'Expected complete':'Planned'})).sort((a,b)=>a.sprint.localeCompare(b.sprint)||stageSortIndex(a.stage)-stageSortIndex(b.stage)||a.item.localeCompare(b.item));
  const sprintPlanGroups=Object.values(sprintPlanRows.reduce((groups,row)=>{groups[row.sprint]||(groups[row.sprint]={sprint:row.sprint,rows:[],days:0});groups[row.sprint].rows.push(row);groups[row.sprint].days+=row.days;return groups;},{}));
  function exportSprintPlanCsv(){const headers=['Sprint','Feature / Planning Item','Workspace','Stage','Source Stage','Owner','Days','Outcome'];const rows=sprintPlanRows.map(r=>[r.sprint,r.item,r.workspace,r.stage,r.sourceStage,r.owner,r.days,r.outcome]);const csv=[headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='plan-by-sprint.csv';a.click();URL.revokeObjectURL(url);}
  const planBySprint=<div className="panel plan-by-sprint"><div className="panel-top"><div><h3>Plan by Sprint</h3><p className="muted">Review the sprint-by-sprint plan or export it back to Excel.</p></div><button onClick={exportSprintPlanCsv}>Export Plan CSV</button></div>{sprintPlanGroups.length?sprintPlanGroups.map(group=><div className="sprint-plan-group" key={group.sprint}><div className="sprint-plan-head"><b>{group.sprint}</b><span>{group.rows.length} item{group.rows.length===1?'':'s'} / {group.days} day{group.days===1?'':'s'}</span></div><table className="compact-table"><thead><tr><th>Feature / Planning Item</th><th>Workspace</th><th>Stage</th><th>Source Stage</th><th>Owner</th><th>Days</th><th>Outcome</th></tr></thead><tbody>{group.rows.map((row,idx)=><tr key={`${group.sprint}-${idx}-${row.item}`}><td>{row.item}</td><td>{row.workspace}</td><td>{row.stage}</td><td>{row.sourceStage&&row.sourceStage!==row.stage?row.sourceStage:''}</td><td>{row.owner||'Unassigned'}</td><td>{row.days}</td><td>{row.outcome}</td></tr>)}</tbody></table></div>):<p className="muted">No planning allocations yet.</p>}</div>;
  const kanbanPanel=<div className="panel planning-kanban-panel"><div className="panel-top"><div><h3>Planning Kanban</h3><p className="muted">Shows the full planning timeline across all imported and locally created sprints.</p></div><div className="mini-stats"><span>{ownerFilter==='ALL'?'All Owners':ownerFilter}</span><span>{planWorkspaceFilter==='ALL'?'All Workspaces':planWorkspaceFilter}</span><span>{customSprints.length} custom sprint{customSprints.length===1?'':'s'}</span></div></div><div className="board-scroll"><div className="board compact planning-board">{kanbanColumns.map(col=><div className="board-col compact" key={col.stage}><div className="col-head"><div><b>{col.label}</b><small>{col.items.length} shown</small></div><span>{col.items.length}</span></div>{col.items.length?col.items.map(({feature,through,next,latest,milestones})=><div className={`feature-card compact ${priorityClass(feature.user_count)}`} key={feature.id} onClick={()=>openPlanFeature(feature)}><div className="card-top"><div className="card-title">{feature.feature_name}</div><button onClick={e=>{e.stopPropagation();openPlanFeature(feature);}}>Edit</button></div><div className="card-workspace">{feature.workspace}</div><div className="card-meta"><span>Current: {STATUS_LABEL[feature.status]||'Standalone'}</span><span>{Number(feature.user_count||0).toLocaleString()} users · {priority(feature.user_count)}</span></div><div className="planning-milestones">{milestones.length?milestones.map(m=><span className={m.complete?'complete':''} key={`${m.stage}-${m.sprint}`} title={m.sourceStage&&m.sourceStage!==m.stage?`Source stage: ${m.sourceStage}`:''}>{m.stage}: {m.sprint}{m.sourceStage&&m.sourceStage!==m.stage?` (${m.sourceStage})`:''}{m.complete?' ✓':''}</span>):<span>No sprint milestones yet</span>}</div><div className="card-meta"><span>Through: {through}</span><span>Next: {next}</span></div><div className="card-meta"><span>Latest: {latest}</span></div></div>):<div className="empty">Nothing here yet.</div>}</div>)}</div></div></div>;
  const allocationEditor=<div className="panel"><div className="panel-top"><div><h3>Planning Allocations</h3><p className="muted">All allocation rows for the current owner/workspace filters. Sprint is shown as allocation data, not a board filter.</p></div><div className="toolbar-left"><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="ALL">All Stages</option>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div></div><div className="summary-grid allocation-summary"><SummaryCard label="Planned Days" value={filteredAllocations.reduce((n,a)=>n+Number(a.days||0),0)} hint="Current view"/><SummaryCard label="Over Capacity" value={capacityRows.filter(r=>r.remaining!=null&&r.remaining<0).length} hint="Owners in sprint"/><SummaryCard label="Allocations" value={filteredAllocations.length} hint="Current view"/></div><table><thead><tr><th>Sprint</th><th>Feature / Planning Item</th><th>Workspace</th><th>Stage</th><th>Owner</th><th>Days</th><th>Stage Outcome</th><th>Actions</th></tr></thead><tbody>{filteredAllocations.map(a=><tr key={a.id}><td><b>{a.sprint||'Unscheduled'}</b></td><td><b>{a.planningGroup||a.featureName||a.workspaceName}</b>{a.planningGroup&&a.featureName&&<small>Child: {a.featureName}</small>}{isSplitPlanningGroup(a.planningGroup||a.featureName)&&<select value={a.featureId||''} onChange={e=>updateAllocationFeature(a.id,e.target.value)}><option value="">Select child feature</option>{getChildFeatureOptions(a,features).map(f=><option key={f.id} value={f.id}>{f.feature_name}</option>)}</select>}</td><td>{allocationWorkspace(a)}</td><td><select value={a.stage} onChange={e=>updateAllocation(a.id,{stage:e.target.value})}>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></td><td><select value={a.owner} onChange={e=>updateAllocation(a.id,{owner:e.target.value})}>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select><small>{remainingFor(a.owner,a.sprint)==null?'No capacity':remainingFor(a.owner,a.sprint)<0?`Over capacity by ${Math.abs(remainingFor(a.owner,a.sprint))} days`:`Remaining in ${a.sprint}: ${remainingFor(a.owner,a.sprint)} days`}</small></td><td><input type="number" min="0" value={a.days} onChange={e=>updateAllocation(a.id,{days:Number(e.target.value||0)})}/></td><td><select value={a.isStageComplete?'complete':'planned'} onChange={e=>updateAllocation(a.id,{isStageComplete:e.target.value==='complete'})}><option value="planned">Planned</option><option value="complete">Expected complete</option></select></td><td><button onClick={()=>deleteAllocation(a.id)}>Delete</button></td></tr>)}</tbody></table>{!filteredAllocations.length&&<p className="muted">No allocations match the current filters.</p>}</div>;
  const planModal=selectedPlanFeature&&<div className="modal"><div className="modal-card"><div className="panel-top"><div><h2>{selectedPlanFeature.feature_name}</h2><small>{selectedPlanFeature.workspace} · Current: {STATUS_LABEL[selectedPlanFeature.status]||'Standalone planning item'}</small><small>Planned Through: {entityThrough(selectedPlanFeature)} · Next recommended: {entityNext(selectedPlanFeature)}</small><small>{priority(selectedPlanFeature.user_count)} · {Number(selectedPlanFeature.user_count||0).toLocaleString()} users</small></div><button onClick={()=>setSelectedPlanFeature(null)}>Close</button></div><h3>Existing planning allocations</h3><table><thead><tr><th>Sprint</th><th>Stage</th><th>Owner</th><th>Days</th><th>Outcome</th><th></th></tr></thead><tbody>{selectedAllocations.length?selectedAllocations.map(a=><tr key={a.id}><td><b>{a.sprint||'Unscheduled'}</b></td><td><select value={a.stage} onChange={e=>updateAllocation(a.id,{stage:e.target.value})}>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></td><td><select value={a.owner} onChange={e=>updateAllocation(a.id,{owner:e.target.value})}>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select></td><td><input type="number" min="0" value={a.days} onChange={e=>updateAllocation(a.id,{days:Number(e.target.value||0)})}/></td><td><select value={a.isStageComplete?'complete':'planned'} onChange={e=>updateAllocation(a.id,{isStageComplete:e.target.value==='complete'})}><option value="planned">Planned</option><option value="complete">Expected complete</option></select></td><td><button onClick={()=>deleteAllocation(a.id)}>Delete</button></td></tr>):<tr><td colSpan="6">No planning allocations yet.</td></tr>}</tbody></table>{entityNext(selectedPlanFeature)!=='Planning Complete'&&<><h3>Add planning allocation</h3><div className="form-grid"><label>Stage<select value={quickPlan.stage} onChange={e=>setQuickPlan({...quickPlan,stage:e.target.value})}>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></label><label>Sprint<select value={quickPlan.sprint} onChange={e=>setQuickPlan({...quickPlan,sprint:e.target.value})}>{sprintOptions.map(s=><option key={s}>{s}</option>)}</select></label><label>Owner<select value={quickPlan.owner} onChange={e=>setQuickPlan({...quickPlan,owner:e.target.value})}>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select></label><label>Days<input type="number" min="0" value={quickPlan.days} onChange={e=>setQuickPlan({...quickPlan,days:e.target.value})}/></label><label>Stage outcome<select value={quickPlan.isStageComplete?'complete':'planned'} onChange={e=>setQuickPlan({...quickPlan,isStageComplete:e.target.value==='complete'})}><option value="planned">Planned</option><option value="complete">Expected complete</option></select></label><div><small>{capacityGuidance.length?capacityGuidance.map(r=>`${r.owner}: ${r.remaining} days`).join(' · '):'No person-level capacity for this sprint.'}</small>{quickPlan.owner&&selectedRemaining!=null&&<small>{quickPlan.owner} has {selectedRemaining} days remaining in {quickPlan.sprint}.</small>}{selectedRemaining!=null&&Number(quickPlan.days||0)>selectedRemaining&&<p className="capacity-warning">Warning: this exceeds remaining capacity by {Number(quickPlan.days||0)-selectedRemaining} day(s).</p>}</div></div><div className="modal-actions"><button onClick={()=>setSelectedPlanFeature(null)}>Close</button><button onClick={()=>saveRecommendedAllocation(selectedPlanFeature)}>Add Allocation</button></div></>}</div></div>;
  return <div className="dashboard"><div className="dash-head"><div><div className="eyebrow">Delivery Plan</div><h1>Stage-by-stage sprint planning</h1></div><div className="toolbar-left"><button onClick={()=>document.getElementById('planning-xlsx').click()}>Import 26Q1 Planning Excel</button><input id="planning-xlsx" type="file" accept=".xlsx,.xls" hidden onChange={importPlanningExcel}/><button onClick={exportPlanningData}>Export Planning Data</button><button onClick={()=>document.getElementById('planning-json').click()}>Import Planning Data</button><input id="planning-json" type="file" accept=".json,application/json" hidden onChange={importPlanningData}/><select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="ALL">All Owners</option>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select><select value={planWorkspaceFilter} onChange={e=>setPlanWorkspaceFilter(e.target.value)}><option value="ALL">All Workspaces</option>{allFeatureWorkspaces.map(w=><option key={w}>{w}</option>)}</select></div></div><div className="panel planning-controls"><div className="toolbar-left"><input value={newSprint} onChange={e=>setNewSprint(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addSprint();}} placeholder="Add sprint, e.g. 26Q2S1"/><button onClick={addSprint}>Add Sprint</button></div></div>{importMessage&&<div className="panel import-message">{importMessage}</div>}{kanbanPanel}<div className="panel sprint-planner-panel"><div className="panel-top compact-panel-top"><div><h3>Sprint Planner</h3><p className="muted">Capacity input for the selected sprint.</p></div><label>Capacity Sprint<select value={sprint} onChange={e=>setSprint(e.target.value)}>{sprintOptions.map(s=><option key={s}>{s}</option>)}</select></label></div><table className="compact-table"><thead><tr><th>Owner</th><th>Available Days</th><th>Planned Days</th><th>Remaining Days</th></tr></thead><tbody>{capacityRows.map(r=><tr key={r.owner}><td>{r.owner}</td><td><input type="number" value={r.available??''} placeholder="—" onChange={e=>updateCapacity(r.owner,e.target.value)}/></td><td>{r.planned}</td><td className={r.remaining<0?'capacity-negative':''}>{r.remaining==null?'—':r.remaining}</td></tr>)}</tbody></table></div>{planBySprint}{allocationEditor}{planModal}</div>;
}

function App(){
 const [features,setFeatures]=useState([]); const [milestones,setMilestones]=useState({}); const [allocations,setAllocations]=useState([]); const [capacities,setCapacities]=useState([]); const [customSprints,setCustomSprints]=useState([]); const [mode,setMode]=useState('executive'); const [theme,setTheme]=useState(()=>localStorage.getItem('feature-tracker-theme')||'dark'); const [workspaceFilter,setWorkspaceFilter]=useState('ALL'); const [ownerFilter,setOwnerFilter]=useState('ALL'); const [selectedWorkspace,setSelectedWorkspace]=useState(null); const [editing,setEditing]=useState(null); const [loaded,setLoaded]=useState(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(saved?.features){setFeatures(saved.features);setMilestones(buildWorkspaceMilestones(saved.features,saved.milestones||{}));setAllocations(saved.allocations||[]);setCapacities(saved.capacities||[]);setCustomSprints(saved.customSprints||[]);}}catch{} finally { setLoaded(true); }},[]);
 useEffect(()=>{if (loaded) localStorage.setItem(STORAGE_KEY,JSON.stringify({features,milestones,allocations,capacities,customSprints}));},[features,milestones,allocations,capacities,customSprints,loaded]);
 useEffect(()=>{localStorage.setItem('feature-tracker-theme',theme);},[theme]);
 const workspaces=useMemo(()=>['ALL',...Array.from(new Set(features.map(f=>f.workspace).filter(Boolean))).sort()],[features]);
 const owners=useMemo(()=>['ALL',...Array.from(new Set(features.flatMap(f=>splitOwners(f.owner)))).sort()],[features]);
 function importFile(e){const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{const rows=parseCsv(String(reader.result||'')); const cleaned=rows.filter(r=>r.feature_name).map(r=>({id:id(),feature_name:r.feature_name,status:normaliseStatus(r.status),workspace:r.workspace||'Unknown',owner:r.owner||'',user_count:Number(r.user_count||0),notes:r.notes||'',Build:r.Build||'',SIT:r.SIT||'','UAT Internal':r['UAT Internal']||''})); setFeatures(cleaned); const inputMilestones=Object.fromEntries(rows.filter(r=>r.workspace).map(r=>[String(r.workspace).trim(),{Build:r.Build||'',SIT:r.SIT||'','UAT Internal':r['UAT Internal']||''}])); setMilestones(buildWorkspaceMilestones(cleaned,inputMilestones));}; reader.readAsText(file); e.target.value='';}
 function exportFile(){const headers=['feature_name','status','workspace','owner','user_count','notes','Build','SIT','UAT Internal']; const rows=features.map(f=>[f.feature_name,f.status,f.workspace,f.owner,f.user_count,f.notes,milestones[f.workspace]?.Build||'',milestones[f.workspace]?.SIT||'',milestones[f.workspace]?.['UAT Internal']||'']); const csv=[headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='feature-tracker-export.csv'; a.click(); URL.revokeObjectURL(url);}
 function addFeature(f){setFeatures(prev=>[f,...prev]); setMilestones(prev=>buildWorkspaceMilestones([f,...features],prev));}
 function saveFeature(f){setFeatures(prev=>prev.map(x=>x.id===f.id?f:x)); setEditing(null);}
 return <div className={`app ${theme}`}><div className="toolbar"><div className="toolbar-left"><button onClick={()=>document.getElementById('csv').click()}>Import</button><button onClick={exportFile}>Export</button><button className={mode==='executive'?'active':''} onClick={()=>setMode('executive')}>Executive Dashboard</button><button className={mode==='overview'?'active':''} onClick={()=>setMode('overview')}>Overview Dashboard</button><button className={mode==='board'?'active':''} onClick={()=>setMode('board')}>Board View</button><button className={mode==='delivery'?'active':''} onClick={()=>setMode('delivery')}>Delivery Plan</button><button className="theme-toggle" title={theme==='dark'?'Switch to light mode':'Switch to dark mode'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span className="theme-glyph">{theme==='dark'?'☾':'☀︎'}</span></button><input id="csv" type="file" accept=".csv" hidden onChange={importFile}/></div><div className="mini-stats"><span>Total <b>{features.length}</b></span><span>Done <b>{features.filter(f=>f.status==='uat_done').length}</b></span></div></div>{mode==='executive'&&<ExecutiveDashboard features={features} milestones={milestones} setMilestones={setMilestones} workspaces={workspaces} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter} selectedWorkspace={selectedWorkspace} setSelectedWorkspace={setSelectedWorkspace} onEditFeature={setEditing}/>} {mode==='overview'&&<OverviewDashboard features={features} milestones={milestones} workspaces={workspaces} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter}/>} {mode==='board'&&<BoardView features={features} setFeatures={setFeatures} workspaces={workspaces} owners={owners} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter} ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} onEdit={setEditing} onAdd={addFeature} allocations={allocations}/>} {mode==='delivery'&&<DeliveryPlan features={features} allocations={allocations} setAllocations={setAllocations} capacities={capacities} setCapacities={setCapacities} customSprints={customSprints} setCustomSprints={setCustomSprints} owners={owners}/>}<FeatureModal feature={editing} workspaces={workspaces} owners={owners} onClose={()=>setEditing(null)} onSave={saveFeature}/></div>;
}

createRoot(document.getElementById('root')).render(<App />);
