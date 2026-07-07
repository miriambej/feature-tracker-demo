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

function FeatureCard({ feature, density, onEdit, onDragStart }) {
  return <div className={`feature-card ${density} ${priorityClass(feature.user_count)}`} draggable onDragStart={e => onDragStart(e, feature.id)} onDoubleClick={() => onEdit(feature)}>
    <div className="card-top"><div className="card-title">{feature.feature_name}</div><button onClick={() => onEdit(feature)}>Edit</button></div>
    <div className="card-workspace">{feature.workspace}</div>
    <div className="card-meta"><span>{feature.owner || '—'}</span><span>{feature.user_count || 0} users</span></div>
    <div className="card-meta"><span>{priority(feature.user_count)}</span><span>{STATUS_LABEL[feature.status]}</span></div>
    {density !== 'compact' && nextStageLabel(feature.status) && <div className="ready-tag">{nextStageLabel(feature.status)}</div>}
  </div>;
}
function BoardView({ features, setFeatures, workspaces, owners, workspaceFilter, setWorkspaceFilter, ownerFilter, setOwnerFilter, onEdit, onAdd }) {
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
      return <div className={`board-col ${density}`} key={key} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, key)}><div className="col-head"><div><b>{label}</b><small>{list.length} shown</small></div><span>{list.length}</span></div>{list.length ? list.map(f => <FeatureCard key={f.id} feature={f} density={density} onEdit={onEdit} onDragStart={start} />) : <div className="empty">Drop here</div>}</div>;
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
  return <div className="panel"><h3>Planning queue</h3><div className="queue-grid">{buckets.map(([status, title]) => <div className="queue" key={status}><h4>{title}</h4>{features.filter(f => f.status === status).sort((a, b) => Number(b.user_count || 0) - Number(a.user_count || 0)).map(f => <div className={`queue-card ${priorityClass(f.user_count)}`} key={f.id}><div><b>{f.feature_name}</b><small>{f.workspace} · {f.owner || 'No owner'}</small></div><button onClick={() => onEdit(f)}>Edit</button></div>) || null}</div>)}</div></div>;
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
  return <div className="panel"><div className="panel-top"><h3>{summary.workspace}</h3><button onClick={onClose}>Close</button></div>{summary.milestones.map(m=><div className="detail-section" key={m.key}><div className="panel-top"><div><b>{m.label}</b><small>Due {fmtDate(summary.dates[m.key])}</small></div><StatusPill tone={m.health.tone} label={m.health.label}/></div>{m.health.blockers.length?m.health.blockers.map(f=><div className={`queue-card ${priorityClass(f.user_count)}`} key={f.id}><div><b>{f.feature_name}</b><small>{f.owner || 'Unassigned'} · {STATUS_LABEL[f.status]}</small></div><button onClick={()=>onEdit(f)}>Edit</button></div>):<p className="muted">No blocking features.</p>}</div>)}</div>;
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

function App(){
 const [features,setFeatures]=useState([]); const [milestones,setMilestones]=useState({}); const [mode,setMode]=useState('executive'); const [theme,setTheme]=useState(()=>localStorage.getItem('feature-tracker-theme')||'dark'); const [workspaceFilter,setWorkspaceFilter]=useState('ALL'); const [ownerFilter,setOwnerFilter]=useState('ALL'); const [selectedWorkspace,setSelectedWorkspace]=useState(null); const [editing,setEditing]=useState(null); const [loaded,setLoaded]=useState(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(saved?.features){setFeatures(saved.features);setMilestones(buildWorkspaceMilestones(saved.features,saved.milestones||{}));}}catch{} finally { setLoaded(true); }},[]);
 useEffect(()=>{if (loaded) localStorage.setItem(STORAGE_KEY,JSON.stringify({features,milestones}));},[features,milestones,loaded]);
 useEffect(()=>{localStorage.setItem('feature-tracker-theme',theme);},[theme]);
 const workspaces=useMemo(()=>['ALL',...Array.from(new Set(features.map(f=>f.workspace).filter(Boolean))).sort()],[features]);
 const owners=useMemo(()=>['ALL',...Array.from(new Set(features.flatMap(f=>splitOwners(f.owner)))).sort()],[features]);
 function importFile(e){const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{const rows=parseCsv(String(reader.result||'')); const cleaned=rows.filter(r=>r.feature_name).map(r=>({id:id(),feature_name:r.feature_name,status:normaliseStatus(r.status),workspace:r.workspace||'Unknown',owner:r.owner||'',user_count:Number(r.user_count||0),notes:r.notes||'',Build:r.Build||'',SIT:r.SIT||'','UAT Internal':r['UAT Internal']||''})); setFeatures(cleaned); const inputMilestones=Object.fromEntries(rows.filter(r=>r.workspace).map(r=>[String(r.workspace).trim(),{Build:r.Build||'',SIT:r.SIT||'','UAT Internal':r['UAT Internal']||''}])); setMilestones(buildWorkspaceMilestones(cleaned,inputMilestones));}; reader.readAsText(file); e.target.value='';}
 function exportFile(){const headers=['feature_name','status','workspace','owner','user_count','notes','Build','SIT','UAT Internal']; const rows=features.map(f=>[f.feature_name,f.status,f.workspace,f.owner,f.user_count,f.notes,milestones[f.workspace]?.Build||'',milestones[f.workspace]?.SIT||'',milestones[f.workspace]?.['UAT Internal']||'']); const csv=[headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='feature-tracker-export.csv'; a.click(); URL.revokeObjectURL(url);}
 function addFeature(f){setFeatures(prev=>[f,...prev]); setMilestones(prev=>buildWorkspaceMilestones([f,...features],prev));}
 function saveFeature(f){setFeatures(prev=>prev.map(x=>x.id===f.id?f:x)); setEditing(null);}
 return <div className={`app ${theme}`}><div className="toolbar"><div className="toolbar-left"><button onClick={()=>document.getElementById('csv').click()}>Import</button><button onClick={exportFile}>Export</button><button className={mode==='executive'?'active':''} onClick={()=>setMode('executive')}>Executive Dashboard</button><button className={mode==='overview'?'active':''} onClick={()=>setMode('overview')}>Overview Dashboard</button><button className={mode==='board'?'active':''} onClick={()=>setMode('board')}>Board View</button><button onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'Light mode':'Dark mode'}</button><input id="csv" type="file" accept=".csv" hidden onChange={importFile}/></div><div className="mini-stats"><span>Total <b>{features.length}</b></span><span>Done <b>{features.filter(f=>f.status==='uat_done').length}</b></span></div></div>{mode==='executive'&&<ExecutiveDashboard features={features} milestones={milestones} setMilestones={setMilestones} workspaces={workspaces} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter} selectedWorkspace={selectedWorkspace} setSelectedWorkspace={setSelectedWorkspace} onEditFeature={setEditing}/>} {mode==='overview'&&<OverviewDashboard features={features} milestones={milestones} workspaces={workspaces} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter}/>} {mode==='board'&&<BoardView features={features} setFeatures={setFeatures} workspaces={workspaces} owners={owners} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter} ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} onEdit={setEditing} onAdd={addFeature}/>}<FeatureModal feature={editing} workspaces={workspaces} owners={owners} onClose={()=>setEditing(null)} onSave={saveFeature}/></div>;
}

createRoot(document.getElementById('root')).render(<App />);
