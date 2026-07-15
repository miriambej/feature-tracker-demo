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
const DEFAULT_FINAL_STAGE = 'UAT';
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
function allocationFeatureIds(allocation) {
  const ids = Array.isArray(allocation.matchedFeatureIds) ? [...allocation.matchedFeatureIds] : [];
  if (Array.isArray(allocation.featureIds)) ids.push(...allocation.featureIds);
  if (allocation.featureId) ids.push(allocation.featureId);
  return Array.from(new Set(ids.filter(Boolean)));
}
function allocationHasFeature(allocation, featureId) {
  return allocationFeatureIds(allocation).includes(featureId);
}
function allocationFeatureComplete(allocation, featureId) {
  if (featureId && allocation.childOutcomes && Object.prototype.hasOwnProperty.call(allocation.childOutcomes, featureId)) return !!allocation.childOutcomes[featureId];
  const ids = allocationFeatureIds(allocation);
  if (featureId && ids.length > 1) return featureId === allocation.featureId ? !!allocation.isStageComplete : false;
  return !!allocation.isStageComplete;
}
const PROD_SUPPORT_GROUP = 'Prod Support';
const CREATE_PROD_STORY_VALUE = '__create_prod_support_story__';
function isProdSupportGroup(name) {
  return /\bprod(?:uction)?\s+support\b/i.test(String(name || ''));
}
function prodSupportStoryId(storyId) {
  return `prod-support-story:${storyId}`;
}
function prodSupportDisplayName(story) {
  return `${PROD_SUPPORT_GROUP} - ${story.name}`;
}
function prodSupportStoryFeature(story) {
  return { id: prodSupportStoryId(story.id), localStoryId: story.id, isProdSupportStory: true, feature_name: prodSupportDisplayName(story), workspace: PROD_SUPPORT_GROUP, status: 'initial', owner: '', user_count: 0, notes: story.notes || '' };
}
function commentStoryParts(comment) {
  let text = String(comment || '').split(' | ')[0].replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  const urlId = text.match(/\/_workitems\/edit\/(\d+)/i)?.[1] || '';
  text = text.replace(/https?:\/\/\S+/gi, ' ').replace(/^\s*reply\s*:\s*/i, ' ').replace(/\breply\s*:\s*/ig, ' ');
  const devOpsId = text.match(/user\s*story\s*(\d+)/i)?.[1] || urlId;
  const ticketTitle = text.match(/\b[A-Z]{2,}\d+\s*-\s*(.+)$/i)?.[1] || '';
  const name = (ticketTitle || text).replace(/user\s*story\s*\d+/ig, '').replace(/\b[A-Z]{2,}\d+\s*-\s*/ig, '').replace(/\bgoal\b/ig, '').replace(/\s+/g, ' ').trim();
  return { name, devOpsId };
}
function plannedThrough(featureId, allocations) {
  const stages = allocations.filter(a => allocationHasFeature(a, featureId) && a.isStageComplete).map(a => PLAN_STAGES.indexOf(a.stage)).filter(i => i >= 0);
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
function boardPlanningFloor(status) {
  if (status === 'build_in_progress') return 'Build';
  if (status === 'build_done' || status === 'sit_in_progress') return 'SIT';
  if (status === 'sit_done' || status === 'deployment_in_progress') return 'Deploy';
  if (status === 'deployment_done' || status === 'bs_signoff_in_progress') return 'BA Sign Off';
  if (status === 'bs_signoff_done' || status === 'uat_in_progress') return 'UAT';
  if (status === 'uat_done') return 'Planning Complete';
  return 'Requirement';
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
  const sprints = allocations.filter(a => allocationHasFeature(a, featureId) && a.sprint).map(a => a.sprint).sort();
  return sprints.at(-1) || '-';
}
function normalisePlanStage(v) {
  const raw = String(v || '').trim();
  const clean = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const aliases = {
    req: 'Requirement', requirement: 'Requirement', requirements: 'Requirement', 'tech feasibility': 'Requirement', 'technical feasibility': 'Requirement',
    build: 'Build', development: 'Build', sit: 'SIT', deploy: 'Deploy', deployment: 'Deploy',
    ba: 'BA Sign Off', 'ba sign off': 'BA Sign Off', 'ba signoff': 'BA Sign Off', 'bs sign off': 'BA Sign Off', 'business sign off': 'BA Sign Off', 'skillpi sign off': 'BA Sign Off', 'skillpi sign-off': 'BA Sign Off',
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
function normaliseFinalStage(stage) {
  return PLAN_STAGES.includes(stage) ? stage : DEFAULT_FINAL_STAGE;
}
function finalStageIndex(stage) {
  return PLAN_STAGES.indexOf(normaliseFinalStage(stage));
}
function isTsnswAdultCommunityEducation(feature) {
  return /tsnsw\s+adult\s+community\s+education/i.test(String(feature?.feature_name || ''));
}
function defaultFinalStageForFeature(feature) {
  if (isTsnswAdultCommunityEducation(feature)) return 'UAT';
  if (feature && !feature.planningKey && !feature.isProdSupportStory) return 'BA Sign Off';
  return DEFAULT_FINAL_STAGE;
}
function nextPlanningStageFromRows(feature, rows, finalStage = DEFAULT_FINAL_STAGE) {
  const targetIdx = finalStageIndex(finalStage);
  const doneIdx = PLAN_STAGES.indexOf(actualCompletedThrough(feature.status));
  const completedIdx = rows.filter(a => a.isStageComplete).map(a => PLAN_STAGES.indexOf(a.stage)).filter(i => i >= 0);
  if (Math.max(doneIdx, completedIdx.length ? Math.max(...completedIdx) : -1) >= targetIdx) return 'Planning Complete';
  const actualIdx = PLAN_STAGES.indexOf(actualPlannedThrough(feature.status));
  const plannedIdx = rows.map(a => PLAN_STAGES.indexOf(a.stage)).filter(i => i >= 0);
  const max = Math.max(actualIdx, plannedIdx.length ? Math.max(...plannedIdx) : -1);
  if (max >= targetIdx) return PLAN_STAGES[targetIdx];
  return max >= 0 ? PLAN_STAGES[max + 1] : 'Requirement';
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
  return isProdSupportGroup(name) || /(pbi|power\s*bi).*dashboards?|dashboard.*reporting|migration|workspace|parent/i.test(String(name || ''));
}
function planningKeywords(name) {
  return String(name || '').toLowerCase().replace(/power\s*bi|pbi|pba|dashboards?|reporting|[-&]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(w => w && !['and','the','for','of'].includes(w));
}
function getChildFeatureOptions(allocation, features) {
  const possibleNames = allocation.possibleMatches || [];
  const suggested = possibleNames.length ? features.filter(f=>possibleNames.includes(f.feature_name)) : [];
  const label = allocation.planningGroup || allocation.featureName || allocation.workspaceName || '';
  if (!isSplitPlanningGroup(label)) return suggested;
  const words = planningKeywords(label);
  const scoped = features.filter(f => words.every(w => String(f.workspace || '').toLowerCase().includes(w)));
  const byId = new Map([...suggested, ...scoped].map(f=>[f.id,f]));
  return Array.from(byId.values()).sort((a,b)=>{
    const aSuggested = possibleNames.includes(a.feature_name) ? 0 : 1;
    const bSuggested = possibleNames.includes(b.feature_name) ? 0 : 1;
    return aSuggested-bSuggested || a.feature_name.localeCompare(b.feature_name);
  });
}
function matchTokens(value) {
  const stop=new Set(['power','bi','pbi','dashboard','reporting','report','goal','goals','story','user','and','the','for','of','to','in','by','with']);
  return String(value || '').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/user\s*story\s*\d+/g,' ').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(w=>w&&w.length>1&&!stop.has(w));
}
function matchKey(value) {
  return matchTokens(value).join(' ');
}
function findFeatureFromComment(comment, parentLabel, features) {
  const commentTokens=Array.from(new Set(matchTokens(comment)));
  if(!commentTokens.length)return{match:null,matches:[]};
  const commentKey=commentTokens.join(' ');
  const parentTokens=matchTokens(parentLabel);
  const scoped=features.filter(f=>parentTokens.length?parentTokens.some(w=>matchTokens(f.workspace).includes(w)||matchTokens(f.feature_name).includes(w)):true);
  const pool=scoped.length?scoped:features;
  const contained=pool.map(f=>{const key=matchKey(f.feature_name);return{feature:f,index:key?commentKey.indexOf(key):-1};}).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index||a.feature.feature_name.localeCompare(b.feature.feature_name)).map(x=>x.feature);
  if(contained.length)return{match:contained[0],matches:contained};
  const candidates=pool.map(f=>{const featureTokens=Array.from(new Set([...matchTokens(f.feature_name),...matchTokens(f.workspace)]));const hits=featureTokens.filter(t=>commentTokens.includes(t));return{feature:f,hits};}).filter(x=>x.hits.length>=2||commentKey.includes(matchTokens(x.feature.feature_name).slice(0,3).join(' ')));
  const maxHits=Math.max(0,...candidates.map(x=>x.hits.length));
  const best=candidates.filter(x=>x.hits.length===maxHits);
  return{match:best.length===1?best[0].feature:null,matches:best.map(x=>x.feature)};
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
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : TODAY.getFullYear();
  if (y < 100) y += 2000;
  return new Date(y, Number(m[2]) - 1, Number(m[1]));
}
function toDateInputValue(v) {
  const d = v instanceof Date ? v : parseDate(v);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(v) {
  const d = parseDate(v);
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
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
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
}
function workingDaysBetween(start, end) {
  const s=parseDate(start); const e=parseDate(end);
  if(!s||!e||e<s)return 0;
  let days=0; const d=new Date(s);
  while(d<=e){const day=d.getDay(); if(day!==0&&day!==6)days+=1; d.setDate(d.getDate()+1);}
  return days;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function defaultSprintDateRange(sprintId) {
  const match = String(sprintId || '').match(/^26Q1S(\d+)$/i);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  const start = addDays(new Date(2026, 6, 1), index * 14);
  const end = addDays(start, 13);
  return { sprint: normaliseSprintName(sprintId), startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
}
function effectiveSprintDateRows(sprints, sprintDates) {
  const bySprint = new Map((sprintDates || []).map(row => [normaliseSprintName(row.sprint), row]));
  return sprints.map(sprintId => {
    const sprintKey = normaliseSprintName(sprintId);
    const custom = bySprint.get(sprintKey);
    const fallback = defaultSprintDateRange(sprintKey) || { sprint: sprintKey, startDate: '', endDate: '' };
    return { ...fallback, ...custom, sprint: sprintKey, startDate: custom?.startDate || fallback.startDate, endDate: custom?.endDate || fallback.endDate };
  });
}
function splitDaysOffBySprint(owner, startDate, endDate, sprintDateRows, note = '') {
  const start = parseDate(startDate);
  const end = parseDate(endDate || startDate);
  if (!owner || !start || !end || end < start) return [];
  return sprintDateRows.flatMap(row => {
    const sprintStart = parseDate(row.startDate);
    const sprintEnd = parseDate(row.endDate);
    if (!sprintStart || !sprintEnd || !dateRangesOverlap(start, end, sprintStart, sprintEnd)) return [];
    const overlapStart = start > sprintStart ? start : sprintStart;
    const overlapEnd = end < sprintEnd ? end : sprintEnd;
    const days = workingDaysBetween(overlapStart, overlapEnd);
    return days > 0 ? [{ id: id(), owner, sprint: row.sprint, startDate: toDateInputValue(overlapStart), endDate: toDateInputValue(overlapEnd), days, note }] : [];
  });
}
const MONTH_INDEX={jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};
function workingDaysForMonthDays(startDay,endDay,monthName,year=TODAY.getFullYear()){
  const month=MONTH_INDEX[String(monthName||'').toLowerCase()];
  if(month==null)return 0;
  let days=0;
  for(let day=Number(startDay);day<=Number(endDay);day+=1){
    const d=new Date(year,month,day);
    const weekday=d.getDay();
    if(d.getMonth()===month&&weekday!==0&&weekday!==6)days+=1;
  }
  return days;
}
function daysOffCountFromText(value){
  let text=String(value||'').toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g,'$1').replace(/\s+/g,' ');
  let total=0;
  text=text.replace(/\b(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g,(_,start,end,month)=>{
    total+=workingDaysForMonthDays(start,end,month);
    return ' ';
  });
  const dateList=/((?:\d{1,2}\s*(?:,|and|&)?\s*)+)\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g;
  let match;
  while((match=dateList.exec(text))){
    const seen=new Set();
    (match[1].match(/\d{1,2}/g)||[]).forEach(day=>{
      if(seen.has(day))return;
      seen.add(day);
      total+=workingDaysForMonthDays(day,day,match[2]);
    });
  }
  return total;
}
function personDayOffEntries(comment, owners, fallbackDays){
  const text=String(comment||'').replace(/\s+/g,' ').trim();
  const found=owners.map(owner=>{const escaped=owner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=text.match(new RegExp(`\\b${escaped}\\b\\s*:?`,'i'));return match?{owner,index:match.index,end:match.index+match[0].length}:null;}).filter(Boolean).sort((a,b)=>a.index-b.index);
  if(!found.length)return[];
  return found.map((entry,idx)=>{
    const next=found[idx+1]?.index??text.length;
    const segment=text.slice(entry.end,next).replace(/^[:\s-]+/,'').trim();
    const days=daysOffCountFromText(segment);
    return {owner:entry.owner,days:days||Number(fallbackDays||0),note:`${entry.owner}: ${segment||text}`};
  }).filter(row=>row.days>0);
}
function dateRangesOverlap(aStart,aEnd,bStart,bEnd){
  const as=parseDate(aStart); const ae=parseDate(aEnd); const bs=parseDate(bStart); const be=parseDate(bEnd);
  return !!(as&&ae&&bs&&be&&as<=be&&ae>=bs);
}
function sprintForDateRange(start,end,sprintDates){
  return sprintDates.find(s=>dateRangesOverlap(start,end,s.startDate,s.endDate))?.sprint || '';
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
    <div className="card-meta"><span>{feature.owner || '-'}</span><span className="user-pill">{feature.user_count || 0} users</span></div>
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

function DeliveryPlan({ features, allocations, setAllocations, capacities, setCapacities, customSprints, setCustomSprints, owners, daysOff, setDaysOff, sprintDates, setSprintDates, prodSupportStories, setProdSupportStories, finalStageByFeatureId, setFinalStageByFeatureId }) {
  const sprintOptions = useMemo(() => {
    const fromData = Array.from(new Set([...customSprints, ...capacities.map(c => c.sprint), ...allocations.map(a => a.sprint)].map(s => normaliseSprintName(s)).filter(Boolean)));
    return fromData.length ? fromData.sort() : ['26Q1S1','26Q1S2','26Q1S3','26Q1S4','26Q1S5','26Q1S6','26Q1S7'];
  }, [customSprints, capacities, allocations]);
  const [sprint,setSprint]=useState(sprintOptions[0] || '26Q1S1');
  const ownerOptions=useMemo(()=>Array.from(new Set([...owners.filter(o=>o!=='ALL'), ...capacities.map(c=>c.owner), ...allocations.map(a=>a.owner), ...daysOff.map(d=>d.owner)].map(normalisePersonName).filter(o=>o&&!isRolePlaceholder(o)))).sort(),[owners,capacities,allocations,daysOff]);
  const [ownerFilter,setOwnerFilter]=useState('ALL');
  const [planWorkspaceFilter,setPlanWorkspaceFilter]=useState('ALL');
  const [stageFilter,setStageFilter]=useState('ALL');
  const [allocationOwnerFilter,setAllocationOwnerFilter]=useState('ALL');
  const [warning,setWarning]=useState('');
  const [importMessage,setImportMessage]=useState('');
  const [importDiagnostics,setImportDiagnostics]=useState([]);
  const [newSprint,setNewSprint]=useState('');
  const [selectedPlanFeature,setSelectedPlanFeature]=useState(null);
  const [editingAllocation,setEditingAllocation]=useState(null);
  const [showAllDiagnostics,setShowAllDiagnostics]=useState(false);
  const [dayOffForm,setDayOffForm]=useState({owner:'',startDate:'',endDate:'',note:''});
  const [dayOffWarning,setDayOffWarning]=useState('');
  const [prodStoryDraft,setProdStoryDraft]=useState({name:'',devOpsId:'',notes:''});
  const [quickPlan,setQuickPlan]=useState({stage:'Requirement',sprint:sprintOptions[0] || '26Q1S1',owner:'',days:1,isStageComplete:false});
  useEffect(()=>{setQuickPlan(q=>({...q,sprint:q.sprint||sprintOptions[0]||'26Q1S1',owner:q.owner||ownerOptions[0]||''}));},[sprintOptions,ownerOptions]);
  const prodSupportFeatures=useMemo(()=>prodSupportStories.map(prodSupportStoryFeature),[prodSupportStories]);
  const mappingFeatures=useMemo(()=>[...features,...prodSupportFeatures],[features,prodSupportFeatures]);
  const allFeatureWorkspaces=useMemo(()=>Array.from(new Set([...features.map(f=>f.workspace),...prodSupportFeatures.map(f=>f.workspace)].filter(Boolean))).sort(),[features,prodSupportFeatures]);
  const featureById=useMemo(()=>new Map(mappingFeatures.map(f=>[f.id,f])),[mappingFeatures]);
  const allocationById=useMemo(()=>new Map(allocations.map(a=>[a.id,a])),[allocations]);
  const allocationWorkspace=a=>a.planningGroup||a.workspace||a.featureName||a.workspaceName||'Unknown';
  const allocationDisplayName=a=>a.featureName&&a.planningGroup?a.featureName:(a.actualFeatureName||a.featureName||a.planningGroup||a.workspaceName||'Planning item');
  const allocationsByFeatureId=useMemo(()=>{const map=new Map();allocations.forEach(a=>allocationFeatureIds(a).forEach(featureId=>{if(!map.has(featureId))map.set(featureId,[]);map.get(featureId).push({...a,visibleFeatureId:featureId,isStageComplete:allocationFeatureComplete(a,featureId)});}));return map;},[allocations]);
  const standaloneAllocationsByKey=useMemo(()=>{const map=new Map();allocations.forEach(a=>{if(allocationFeatureIds(a).length||isSplitPlanningGroup(a.planningGroup||a.featureName))return;const key=a.featureName||a.planningGroup||a.workspaceName;if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(a);});return map;},[allocations]);
  const standaloneKeys=Array.from(standaloneAllocationsByKey.keys());
  const planningFeatures=useMemo(()=>[...features,...prodSupportFeatures,...standaloneKeys.map(key=>({id:`standalone:${key}`,planningKey:key,feature_name:key,workspace:standaloneAllocationsByKey.get(key)?.[0]?.workspace||key,status:'initial',owner:'',user_count:0}))],[features,prodSupportFeatures,standaloneKeys.join('|'),standaloneAllocationsByKey]);
  const entityAllocations=feature=>feature.planningKey?(standaloneAllocationsByKey.get(feature.planningKey)||[]):(allocationsByFeatureId.get(feature.id)||[]);
  const featureFinalStage=feature=>finalStageByFeatureId?.[feature.id]?normaliseFinalStage(finalStageByFeatureId[feature.id]):defaultFinalStageForFeature(feature);
  const updateFeatureFinalStage=(featureId,stage)=>setFinalStageByFeatureId(prev=>({...prev,[featureId]:normaliseFinalStage(stage)}));
  const entityThrough=feature=>{const rows=entityAllocations(feature);const actualIdx=PLAN_STAGES.indexOf(actualCompletedThrough(feature.status));const completed=rows.filter(a=>a.isStageComplete).map(a=>PLAN_STAGES.indexOf(a.stage)).filter(i=>i>=0);const max=Math.max(actualIdx,completed.length?Math.max(...completed):-1);return max>=0?PLAN_STAGES[max]:'Not planned';};
  const entityIsPlanningComplete=feature=>PLAN_STAGES.indexOf(entityThrough(feature))>=finalStageIndex(featureFinalStage(feature));
  const entityLatestPlannedStage=feature=>{if(entityIsPlanningComplete(feature))return'Planning Complete';const rows=entityAllocations(feature); const floor=boardPlanningFloor(feature.status);if(floor==='Planning Complete')return floor;const targetIdx=finalStageIndex(featureFinalStage(feature));const floorIdx=PLAN_STAGES.indexOf(floor);const plannedOnly=rows.filter(a=>!a.isStageComplete).map(a=>PLAN_STAGES.indexOf(a.stage)).filter(i=>i>=0);const completedNext=rows.filter(a=>a.isStageComplete).map(a=>PLAN_STAGES.indexOf(a.stage)).filter(i=>i>=0).map(i=>Math.min(i+1,targetIdx));const max=Math.min(targetIdx,Math.max(floorIdx,plannedOnly.length?Math.max(...plannedOnly):-1,completedNext.length?Math.max(...completedNext):-1));if(max>=0)return PLAN_STAGES[max]; return rows.some(a=>a.stage===NEEDS_MAPPING_STAGE)?NEEDS_MAPPING_STAGE:'Requirement';};
  const entityNext=feature=>nextPlanningStageFromRows(feature,entityAllocations(feature),featureFinalStage(feature));
  const entityLatestSprint=feature=>entityAllocations(feature).map(a=>a.sprint).filter(Boolean).sort().at(-1)||'-';
  const entityMilestones=feature=>STAGE_OPTIONS.map(stage=>{const rows=entityAllocations(feature).filter(a=>a.stage===stage&&a.sprint).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint)));const latest=rows.at(-1);return latest?{stage,sprint:latest.sprint,sourceStage:latest.sourceStage,complete:!!latest.isStageComplete}:null;}).filter(Boolean);
  const ownerSprintKey=(owner,sprintId)=>`${normalisePersonName(owner)}||${normaliseSprintName(sprintId)}`;
  const capacityByOwnerSprint=useMemo(()=>{const map=new Map();capacities.forEach(c=>map.set(ownerSprintKey(c.owner,c.sprint),c));return map;},[capacities]);
  const plannedByOwnerSprint=useMemo(()=>{const map=new Map();allocations.forEach(a=>{const key=ownerSprintKey(a.owner,a.sprint);map.set(key,(map.get(key)||0)+Number(a.days||0));});return map;},[allocations]);
  const effectiveSprintDates=useMemo(()=>effectiveSprintDateRows(sprintOptions,sprintDates),[sprintOptions,sprintDates]);
  const daysOffByOwnerSprint=useMemo(()=>{const map=new Map();daysOff.forEach(row=>{const owner=normalisePersonName(row.owner);const sprintId=normaliseSprintName(row.sprint)||sprintForDateRange(row.startDate,row.endDate,effectiveSprintDates);const days=Number(row.days||workingDaysBetween(row.startDate,row.endDate)||0);if(owner&&sprintId&&days>0){const key=ownerSprintKey(owner,sprintId);map.set(key,(map.get(key)||0)+days);}});return map;},[daysOff,effectiveSprintDates]);
  const visibleOwners=ownerFilter==='ALL'?ownerOptions:ownerOptions.filter(o=>o===ownerFilter);
  const capacityRows=visibleOwners.map(owner=>{const ownerKey=normalisePersonName(owner);const key=ownerSprintKey(ownerKey,sprint);const cap=capacityByOwnerSprint.get(key);const base=cap?Number(cap.availableDays||0):null;const off=daysOffByOwnerSprint.get(key)||0;const available=base==null?null:Math.max(0,base-off);const planned=plannedByOwnerSprint.get(key)||0;return{owner:ownerKey,base,off,available,planned,remaining:available==null?null:available-planned,counted:[]};});
  const visibleAllocationRows=useMemo(()=>allocations.flatMap(a=>{const ids=allocationFeatureIds(a);if(ids.length<=1){const featureId=ids[0]||'';return[{...a,sourceAllocationId:a.id,visibleFeatureId:featureId,visibleFeatureName:allocationDisplayName(a),isStageComplete:allocationFeatureComplete(a,featureId)}];}return ids.map(featureId=>{const feature=featureById.get(featureId);const visibleName=feature?.feature_name||String(a.featureName||a.actualFeatureName||'').split(' / ').find(Boolean)||allocationDisplayName(a);return{...a,id:`${a.id}::${featureId}`,sourceAllocationId:a.id,visibleFeatureId:featureId,visibleFeatureName:visibleName,isStageComplete:allocationFeatureComplete(a,featureId)};});}),[allocations,featureById]);
  function remainingFor(owner,sprintId){const key=ownerSprintKey(owner,sprintId);const cap=capacityByOwnerSprint.get(key); if(!cap)return null; return Math.max(0,Number(cap.availableDays||0)-(daysOffByOwnerSprint.get(key)||0))-(plannedByOwnerSprint.get(key)||0);}
  function updateCapacity(owner,availableDays){const ownerKey=normalisePersonName(owner);const sprintKey=normaliseSprintName(sprint);setCapacities(prev=>{const rest=prev.filter(c=>!(normaliseSprintName(c.sprint)===sprintKey&&normalisePersonName(c.owner)===ownerKey));return[...rest,{sprint:sprintKey,owner:ownerKey,availableDays:Number(availableDays||0)}];});}
  function addDayOff(){const owner=normalisePersonName(dayOffForm.owner);const startDate=dayOffForm.startDate;const endDate=dayOffForm.endDate||startDate;const rows=splitDaysOffBySprint(owner,startDate,endDate,effectiveSprintDates,dayOffForm.note||'');if(!rows.length){setDayOffWarning('No sprint date range matched that leave date. Check Sprint date setup.');return;}setDaysOff(prev=>[...rows,...prev]);setDayOffWarning('');setSprint(rows[0].sprint);setDayOffForm({owner:'',startDate:'',endDate:'',note:''});}
  function deleteDayOff(dayOffId){setDaysOff(prev=>prev.filter(row=>row.id!==dayOffId));}
  function updateSprintDates(sprintId,patch){const sprintKey=normaliseSprintName(sprintId);setSprintDates(prev=>{const rest=prev.filter(row=>normaliseSprintName(row.sprint)!==sprintKey);const current=prev.find(row=>normaliseSprintName(row.sprint)===sprintKey)||{sprint:sprintKey,startDate:'',endDate:''};return[...rest,{...current,...patch,sprint:sprintKey}].sort((a,b)=>a.sprint.localeCompare(b.sprint));});}
  function updateAllocation(allocationId,patch){setAllocations(prev=>prev.map(a=>a.id===allocationId?{...a,...patch,stage:patch.stage?normalisePlanStage(patch.stage):a.stage,owner:patch.owner?normalisePersonName(patch.owner):a.owner,sprint:patch.sprint?normaliseSprintName(patch.sprint):a.sprint}:a));}
  function updateChildOutcome(allocationId,featureId,isComplete){setAllocations(prev=>prev.map(a=>{if(a.id!==allocationId)return a;const ids=allocationFeatureIds(a);const complete=!!isComplete;const keepSourceAligned=ids.length<=1||featureId===a.featureId;return{...a,isStageComplete:keepSourceAligned?complete:a.isStageComplete,childOutcomes:{...(a.childOutcomes||{}),[featureId]:complete}};}));}
  function allocationOutcomeFeatureId(allocation){const ids=allocationFeatureIds(allocation);return allocation.visibleFeatureId||(ids.length===1?ids[0]:'');}
  function allocationOutcomeComplete(allocation){const featureId=allocationOutcomeFeatureId(allocation);return featureId?allocationFeatureComplete(allocation,featureId):!!allocation.isStageComplete;}
  function updateAllocationOutcome(allocation,isComplete){const featureId=allocationOutcomeFeatureId(allocation);const allocationId=allocation.sourceAllocationId||allocation.id;if(featureId)updateChildOutcome(allocationId,featureId,isComplete);else updateAllocation(allocationId,{isStageComplete:!!isComplete});}
  function linkAllocationToFeature(allocationId,feature){if(!feature)return; const allocation=allocationById.get(allocationId)||{}; updateAllocation(allocationId,{featureId:feature.id,featureIds:[feature.id],matchedFeatureIds:[feature.id],childOutcomes:{[feature.id]:!!allocation.isStageComplete},actualFeatureName:feature.feature_name,featureName:feature.feature_name,workspace:feature.workspace,mappingStatus:'matched'});}
  function updateAllocationFeature(allocationId,featureId){if(featureId===CREATE_PROD_STORY_VALUE){const allocation=allocationById.get(allocationId);createProdSupportStoryForAllocation(allocationId,allocation?.stageComment||'');return;} linkAllocationToFeature(allocationId,featureById.get(featureId));}
  function createProdSupportStory(seed={}){const name=String(seed.name||prodStoryDraft.name||'').trim();if(!name)return null;const story={id:id(),name,devOpsId:String(seed.devOpsId||prodStoryDraft.devOpsId||'').trim(),notes:String(seed.notes||prodStoryDraft.notes||'').trim()};setProdSupportStories(prev=>[story,...prev]);setProdStoryDraft({name:'',devOpsId:'',notes:''});return prodSupportStoryFeature(story);}
  function createProdSupportStoryForAllocation(allocationId,comment=''){const parts=commentStoryParts(comment);const feature=createProdSupportStory({name:parts.name,devOpsId:parts.devOpsId,notes:comment});if(feature)linkAllocationToFeature(allocationId,feature);}
  function updateDiagnosticFeatureObjects(diagnosticIndex,allocationId,selected){setAllocations(prev=>prev.map(a=>{if(a.id!==allocationId)return a;if(!selected.length)return{...a,featureId:'',featureIds:[],matchedFeatureIds:[],childOutcomes:{},actualFeatureName:'',featureName:a.planningGroup?'':a.featureName,workspace:a.planningGroup?'':a.workspace,mappingStatus:'manual'};const previous=a.childOutcomes||{};const childOutcomes=Object.fromEntries(selected.map((f,idx)=>[f.id,Object.prototype.hasOwnProperty.call(previous,f.id)?!!previous[f.id]:(f.id===a.featureId?!!a.isStageComplete:idx===0&&!!a.isStageComplete)]));return{...a,featureId:selected[0].id,featureIds:selected.map(f=>f.id),matchedFeatureIds:selected.map(f=>f.id),childOutcomes,actualFeatureName:selected.map(f=>f.feature_name).join(' / '),featureName:selected.map(f=>f.feature_name).join(' / '),workspace:selected[0].workspace,mappingStatus:'matched'};}));setImportDiagnostics(prev=>prev.map((row,idx)=>idx===diagnosticIndex?{...row,matchedFeature:selected.map(f=>f.feature_name).join(' | '),mappingStatus:selected.length?'matched':'manual'}:row));}
  function handleDiagnosticFeatureSelect(row,value){if(value===CREATE_PROD_STORY_VALUE){const feature=createProdSupportStory(commentStoryParts(row.comment));if(feature){const current=allocationFeatureIds(allocationById.get(row.allocationId)||{}).map(featureId=>featureById.get(featureId)).filter(Boolean);updateDiagnosticFeatureObjects(row.diagnosticIndex,row.allocationId,[...current,feature]);}return;}addDiagnosticFeature(row.diagnosticIndex,row.allocationId,value);}
  function updateDiagnosticFeatures(diagnosticIndex,allocationId,featureIds){const cleanIds=Array.from(new Set(featureIds.filter(Boolean)));updateDiagnosticFeatureObjects(diagnosticIndex,allocationId,cleanIds.map(featureId=>featureById.get(featureId)).filter(Boolean));}
  function addDiagnosticFeature(diagnosticIndex,allocationId,featureId){if(!featureId)return;updateDiagnosticFeatures(diagnosticIndex,allocationId,[...allocationFeatureIds(allocationById.get(allocationId)||{}),featureId]);}
  function removeDiagnosticFeature(diagnosticIndex,allocationId,featureId){updateDiagnosticFeatures(diagnosticIndex,allocationId,allocationFeatureIds(allocationById.get(allocationId)||{}).filter(id=>id!==featureId));}
  function deleteAllocation(allocationId){if(confirm('Delete this planning allocation?')) setAllocations(prev=>prev.filter(a=>a.id!==allocationId));}
  function saveRecommendedAllocation(feature){const stage=normalisePlanStage(quickPlan.stage)||entityNext(feature); if(stage==='Planning Complete')return false; const sprintToUse=normaliseSprintName(quickPlan.sprint==='ALL'?sprintOptions[0]:quickPlan.sprint); const owner=normalisePersonName(quickPlan.owner||ownerOptions[0]||''); const days=Number(quickPlan.days||0); const remaining=remainingFor(owner,sprintToUse); setWarning(remaining!=null&&days>remaining?`${owner} will be over capacity by ${days-remaining} day(s) in ${sprintToUse}.`: ''); const base={id:id(),featureName:feature.feature_name,workspace:feature.workspace,stage,sprint:sprintToUse,owner,days,isStageComplete:!!quickPlan.isStageComplete}; setAllocations(prev=>[feature.planningKey?{...base,planningGroup:'',workspaceName:feature.planningKey}:{...base,featureId:feature.id},...prev]); setSelectedPlanFeature(null); return true;}
  function addSprint(){const name=normaliseSprintName(newSprint); if(!name)return; setCustomSprints(prev=>Array.from(new Set([...prev.map(normaliseSprintName),name])).sort()); setSprint(name); setQuickPlan(q=>({...q,sprint:name})); setNewSprint('');}
  function exportPlanningData(){const payload={version:1,exportedAt:new Date().toISOString(),customSprints,allocations,capacities,daysOff,sprintDates,prodSupportStories,finalStageByFeatureId};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='planning-kanban-data.json';a.click();URL.revokeObjectURL(url);}
  function importPlanningData(e){const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{try{const data=JSON.parse(String(reader.result||'{}')); if(!Array.isArray(data.allocations)||!Array.isArray(data.capacities)) throw new Error('File does not contain planning allocations and capacities.'); const restoredSprints=Array.isArray(data.customSprints)?data.customSprints.map(normaliseSprintName).filter(Boolean):[]; const restoredAllocations=data.allocations.map(a=>{const sourceStage=a.sourceStage||a.stage; return {...a,sprint:normaliseSprintName(a.sprint),owner:normalisePersonName(a.owner),stage:normalisePlanStage(sourceStage)||normalisePlanStage(a.stage)||NEEDS_MAPPING_STAGE,sourceStage,days:Number(a.days||0)};}); const restoredCapacities=data.capacities.map(c=>({...c,sprint:normaliseSprintName(c.sprint),owner:normalisePersonName(c.owner),availableDays:Number(c.availableDays||0)})); const restoredDaysOff=Array.isArray(data.daysOff)?data.daysOff.map(row=>({...row,id:row.id||id(),owner:normalisePersonName(row.owner),sprint:normaliseSprintName(row.sprint),days:Number(row.days||workingDaysBetween(row.startDate,row.endDate)||0)})):[]; const restoredSprintDates=Array.isArray(data.sprintDates)?data.sprintDates.map(row=>({...row,sprint:normaliseSprintName(row.sprint)})):[]; const restoredProdStories=Array.isArray(data.prodSupportStories)?data.prodSupportStories.map(row=>({...row,id:row.id||id(),name:String(row.name||'').trim()})).filter(row=>row.name):[]; const restoredFinalStages=Object.fromEntries(Object.entries(data.finalStageByFeatureId||{}).map(([featureId,stage])=>[featureId,normaliseFinalStage(stage)])); const nextSprint=Array.from(new Set([...restoredSprints,...restoredCapacities.map(c=>c.sprint),...restoredAllocations.map(a=>a.sprint)].filter(Boolean))).sort()[0]||'26Q1S1'; setAllocations(restoredAllocations); setCapacities(restoredCapacities); setDaysOff(restoredDaysOff); setSprintDates(restoredSprintDates); setProdSupportStories(restoredProdStories); setFinalStageByFeatureId(restoredFinalStages); setCustomSprints(restoredSprints); setImportDiagnostics([]); setSprint(nextSprint); setQuickPlan(q=>({...q,sprint:nextSprint})); setImportMessage(`Imported planning backup with ${restoredAllocations.length} allocation(s), ${restoredCapacities.length} capacity row(s), ${restoredDaysOff.length} day-off row(s), ${restoredProdStories.length} Prod Support stories, ${Object.keys(restoredFinalStages).length} final-stage setting(s), and ${restoredSprints.length} custom sprint(s).`);}catch(err){setImportMessage(`Planning data import failed: ${err.message}`);} finally {e.target.value='';}}; reader.readAsText(file);}
  async function importPlanningExcel(e){
    const file=e.target.files?.[0]; if(!file)return;
    try{
      const XLSX=await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const workbookBuffer=await file.arrayBuffer();
      const wb=XLSX.read(workbookBuffer,{type:'array',cellStyles:true,bookFiles:true});
      const sheet=wb.Sheets['26Q1 Planner'];
      if(!sheet){setImportMessage('Sheet "26Q1 Planner" was not found.');return;}
      const rawCell=(r,c)=>sheet[XLSX.utils.encode_cell({r,c})];
      const cell=(r,c)=>rawCell(r,c)?.v;
      const text=(r,c)=>String(cell(r,c)??'').trim();
      const excelIndexedColors={4:'00FF00',6:'FFFF00',10:'008000',35:'CCFFCC',36:'FFFFCC',43:'92D050'};
      const normaliseFillColor=color=>{if(!color)return''; if(typeof color==='string')return color.toUpperCase().replace(/^FF([0-9A-F]{6})$/,'$1'); if(color.rgb)return String(color.rgb).toUpperCase().replace(/^FF([0-9A-F]{6})$/,'$1'); if(color.indexed!=null)return excelIndexedColors[color.indexed]||`INDEXED:${color.indexed}`; if(color.theme!=null)return `THEME:${color.theme}:${color.tint??''}`; return'';};
      const isExpectedCompleteColor=color=>['FFFF00','92D050'].includes(normaliseFillColor(color));
      const fileText=name=>{const fileEntry=wb.files?.[name]||wb.files?.[`/${name}`]; const content=fileEntry?.content??fileEntry?.data??fileEntry; if(!content)return''; if(typeof content==='string')return content; return new TextDecoder().decode(content);};
      const parseXml=text=>text?new DOMParser().parseFromString(text,'application/xml'):null;
      const cleanCommentText=value=>String(value||'').replace(/\r/g,'\n').replace(/\[Threaded comment\][\s\S]*?Comment:\s*/i,'').replace(/\s+/g,' ').trim();
      const commentCompareKey=value=>String(value||'').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").toLowerCase().replace(/\s+/g,' ').trim();
      const mergeCommentText=(...values)=>{const seen=new Set();return values.flatMap(value=>String(value||'').split(' | ')).map(cleanCommentText).filter(Boolean).filter(txt=>{const key=commentCompareKey(txt);if(seen.has(key))return false;seen.add(key);return true;}).join(' | ');};
      const xmlCommentMap=(()=>{try{const comments={};Object.keys(wb.files||{}).forEach(name=>{const rawName=String(name);const cleanName=rawName.startsWith('/')?rawName.slice(1):rawName;if(cleanName.startsWith('xl/comments')&&cleanName.endsWith('.xml')){const xml=parseXml(fileText(cleanName));xml?.querySelectorAll('comment').forEach(node=>{const ref=node.getAttribute('ref');const txt=cleanCommentText(Array.from(node.querySelectorAll('t')).map(t=>t.textContent||'').join(' '));if(ref&&txt)comments[ref]=mergeCommentText(comments[ref],txt);});}if(cleanName.startsWith('xl/threadedComments/threadedComment')&&cleanName.endsWith('.xml')){const xml=parseXml(fileText(cleanName));xml?.querySelectorAll('threadedComment').forEach(node=>{const ref=node.getAttribute('ref');const txt=cleanCommentText(node.querySelector('text')?.textContent||'');if(ref&&txt)comments[ref]=mergeCommentText(comments[ref],txt);});}});return comments;}catch(err){console.warn('Planning Excel comment diagnostics failed',err);return{};}})();
      const stageComment=(r,c)=>{const ref=XLSX.utils.encode_cell({r,c});const fromXml=xmlCommentMap[ref]||'';const fromSheet=(rawCell(r,c)?.c||[]).map(c=>c.t||c.a||'').join(' | ');return mergeCommentText(fromXml,fromSheet);};
      const xmlFillMap=(()=>{try{const workbookXml=parseXml(fileText('xl/workbook.xml'));const relsXml=parseXml(fileText('xl/_rels/workbook.xml.rels'));const stylesXml=parseXml(fileText('xl/styles.xml'));if(!workbookXml||!relsXml||!stylesXml)return null;const relTargetById=Object.fromEntries(Array.from(relsXml.querySelectorAll('Relationship')).map(rel=>[rel.getAttribute('Id'),rel.getAttribute('Target')]));const sheetNode=Array.from(workbookXml.querySelectorAll('sheet')).find(node=>node.getAttribute('name')==='26Q1 Planner');const relId=sheetNode?.getAttribute('r:id');const target=relTargetById[relId];if(!target)return null;const cleanTarget=target.replace(/^\/xl\//,'').replace(/^\//,'');const sheetPath=cleanTarget.startsWith('xl/')?cleanTarget:`xl/${cleanTarget}`;const sheetXml=parseXml(fileText(sheetPath));if(!sheetXml)return null;const fillValues=Array.from(stylesXml.querySelectorAll('fills > fill')).map(fill=>{const fg=fill.querySelector('patternFill > fgColor');const bg=fill.querySelector('patternFill > bgColor');return normaliseFillColor({rgb:fg?.getAttribute('rgb'),indexed:fg?.getAttribute('indexed'),theme:fg?.getAttribute('theme'),tint:fg?.getAttribute('tint')})||normaliseFillColor({rgb:bg?.getAttribute('rgb'),indexed:bg?.getAttribute('indexed'),theme:bg?.getAttribute('theme'),tint:bg?.getAttribute('tint')});});const fillIdByStyle=Array.from(stylesXml.querySelectorAll('cellXfs > xf')).map(xf=>Number(xf.getAttribute('fillId')||0));const fills={};sheetXml.querySelectorAll('c').forEach(node=>{const ref=node.getAttribute('r');const styleIdx=Number(node.getAttribute('s')||0);const fillId=fillIdByStyle[styleIdx]||0;const color=fillValues[fillId]||'';if(ref&&color)fills[ref]=color;});return fills;}catch(err){console.warn('Planning Excel XML fill diagnostics failed',err);return null;}})();
      const styleFillColors=(r,c)=>{const style=rawCell(r,c)?.s||{}; const fill=style.fill||{}; return [style.fgColor,style.bgColor,fill.fgColor,fill.bgColor,style.patternFill?.fgColor,style.patternFill?.bgColor].map(normaliseFillColor).filter(Boolean);};
      const fillColors=(r,c)=>{const ref=XLSX.utils.encode_cell({r,c});return Array.from(new Set([...(xmlFillMap?.[ref]?[xmlFillMap[ref]]:[]),...styleFillColors(r,c)]));};
      const hasReadableStyle=(r,c)=>[c,c+1,c+2].some(col=>fillColors(r,col).length||Object.keys(rawCell(r,col)?.s||{}).length>0);
      const expectedComplete=(r,c)=>[c,c+1,c+2].some(col=>fillColors(r,col).some(isExpectedCompleteColor));
      const sprintCols=Array.from({length:7},(_,i)=>({label:`S${i+1}`,col:17+i*3,sprint:normaliseSprintName(`26Q1S${i+1}`)}));
      const ownersFromComment=comment=>ownerOptions.filter(owner=>new RegExp(`\\b${owner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(comment));
      const range=XLSX.utils.decode_range(sheet['!ref']||'A1:A220');
      const imported=[];
      const diagnostics=[];
      const pendingProdSupportStories=[];
      let styledAllocationCount=0;
      let expectedCompleteCount=0;
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
            const allocationFillColors=Array.from(new Set([col,col+1,col+2].flatMap(fillCol=>fillColors(r,fillCol)))).join(', ')||'none';
            if(hasReadableStyle(r,col)) styledAllocationCount+=1;
            if(isStageComplete) expectedCompleteCount+=1;
            const split=isSplitPlanningGroup(currentFeature);
            const exactMatch=!split?features.find(f=>f.feature_name.trim().toLowerCase()===currentFeature.toLowerCase()):null;
            const comment=stageComment(r,col+1);
            const prodSupportMatch=split&&isProdSupportGroup(currentFeature)&&comment?(()=>{const parts=commentStoryParts(comment);if(!parts.name)return null;let story=[...prodSupportStories,...pendingProdSupportStories].find(st=>matchKey(st.name)===matchKey(parts.name));if(!story){story={id:id(),name:parts.name,devOpsId:parts.devOpsId,notes:comment};}if(!pendingProdSupportStories.some(st=>matchKey(st.name)===matchKey(story.name)))pendingProdSupportStories.push(story);return prodSupportStoryFeature(story);})():null;
            const commentMatch=split&&comment&&!prodSupportMatch?findFeatureFromComment(comment,currentFeature,mappingFeatures):{match:null,matches:[]};
            const matchedFeatures=prodSupportMatch?[prodSupportMatch]:(commentMatch.matches.length?commentMatch.matches:(commentMatch.match?[commentMatch.match]:(exactMatch?[exactMatch]:[])));
            const match=matchedFeatures[0]||null;
            const possibleMatches=matchedFeatures.length?matchedFeatures.map(f=>f.feature_name):commentMatch.matches.map(f=>f.feature_name);
            const commentHasGoal=/\bgoal\b/i.test(comment);
            const allocationExpectedComplete=!!isStageComplete||commentHasGoal;
            const childOutcomes=Object.fromEntries(matchedFeatures.map((f,idx)=>[f.id,commentHasGoal?idx===0:allocationExpectedComplete]));
            const mappingStatus=matchedFeatures.length?'matched':comment?'unmatched':'manual';
            const allocationId=id();
            diagnostics.push({allocationId,row:r+1,stageCell:XLSX.utils.encode_cell({r,c:col+1}),sprint,person:owner,feature:currentFeature,stage:sourceStage||stage,days,fillColor:allocationFillColors,expectedComplete:allocationExpectedComplete,comment,matchedFeature:matchedFeatures.map(f=>f.feature_name).join(' | '),possibleMatches:possibleMatches.join(' | '),mappingStatus});
            imported.push({id:allocationId,featureId:match?.id||'',featureIds:matchedFeatures.map(f=>f.id),matchedFeatureIds:matchedFeatures.map(f=>f.id),childOutcomes,featureName:matchedFeatures.length?matchedFeatures.map(f=>f.feature_name).join(' / '):(split?'':currentFeature),actualFeatureName:matchedFeatures.map(f=>f.feature_name).join(' / '),planningGroup:split?currentFeature:'',workspaceName:currentFeature,workspace:match?.workspace||(!split?currentFeature:''),sprint,owner,stage,sourceStage,stageComment:comment,possibleMatches,mappingStatus,days,isStageComplete:matchedFeatures.length===1?!!childOutcomes[match.id]:allocationExpectedComplete});
          }
        });
      }

      const importedDaysOff=[];
      for(let r=5;r<=8;r++){
        const days=Number(cell(r,19)||0);
        const comment=stageComment(r,19)||text(r,19);
        if(days>0&&comment){
          const matchedOwners=ownersFromComment(comment);
          personDayOffEntries(comment,matchedOwners,days).forEach(row=>importedDaysOff.push({id:id(),owner:row.owner,sprint:'26Q1S1',days:row.days,startDate:'',endDate:'',note:row.note,source:'26Q1 Planner T6:T9'}));
        }
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
      console.log('imported days off', importedDaysOff);
      setProdSupportStories(()=>{const byKey=new Map();pendingProdSupportStories.forEach(st=>{const key=matchKey(st.name);if(key&&!byKey.has(key))byKey.set(key,st);});return Array.from(byKey.values());});
      setAllocations(imported);
      setCapacities(importedCaps);
      setDaysOff(importedDaysOff);
      setImportDiagnostics(diagnostics);
      console.table(diagnostics);
      const styleWarning=imported.length&&!styledAllocationCount?' Background colours could not be read; expected-complete markers were not imported. Use the Stage Outcome field to mark expected complete manually.':styledAllocationCount&&!expectedCompleteCount?' No yellow or green expected-complete fills were detected. Use the Stage Outcome field to mark expected complete manually if needed.':` Imported ${expectedCompleteCount} expected-complete allocation(s) from yellow/green fills.`;
      const commentedCount=diagnostics.filter(d=>d.comment).length;
      const autoMatchedCount=diagnostics.filter(d=>d.matchedFeature).length;
      const commentMessage=commentedCount?` Read ${commentedCount} stage-cell comment(s) and auto-linked ${autoMatchedCount} allocation(s) to child features.`:' No stage-cell comments were available to the browser parser; manual child-feature mapping remains available.';
      setImportMessage(`Imported ${imported.length} allocation(s). Imported ${importedCaps.length} capacity row(s). Imported ${importedDaysOff.length} day-off row(s).${styleWarning}${commentMessage}`);
    }catch(err){setImportMessage(`Excel import failed: ${err.message}`);}
    finally {e.target.value='';}
  }
  const kanbanBase=planningFeatures.filter(f=>(planWorkspaceFilter==='ALL'||f.workspace===planWorkspaceFilter)&&(ownerFilter==='ALL'||splitOwners(f.owner).includes(ownerFilter)||entityAllocations(f).some(a=>a.owner===ownerFilter)));
  const kanbanItems=kanbanBase.map(feature=>{const through=entityThrough(feature); const next=entityNext(feature); const finalStage=featureFinalStage(feature); const latestStage=entityIsPlanningComplete(feature)?'Planning Complete':entityLatestPlannedStage(feature); return{feature,through,next,finalStage,latest:entityLatestSprint(feature),latestStage,milestones:entityMilestones(feature)};}).sort((a,b)=>priorityRank(a.feature.user_count)-priorityRank(b.feature.user_count)||Number(b.feature.user_count||0)-Number(a.feature.user_count||0));
  const kanbanLabels={Requirement:'Requirement Planning',Build:'Build Planning',SIT:'SIT Planning',Deploy:'Deploy Planning','BA Sign Off':'BA Sign Off Planning',UAT:'UAT Planning','Planning Complete':'Planning Complete'};
  const kanbanColumns=[...PLAN_STAGES,'Planning Complete'].map(stage=>({stage,label:kanbanLabels[stage],items:kanbanItems.filter(item=>item.latestStage===stage)}));
  const selectedAllocations=selectedPlanFeature?entityAllocations(selectedPlanFeature).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint))||stageSortIndex(a.stage)-stageSortIndex(b.stage)):[];
  const selectedRemaining=quickPlan.owner?remainingFor(quickPlan.owner,quickPlan.sprint):null;
  const capacityGuidance=quickPlan.sprint?ownerOptions.map(owner=>({owner,remaining:remainingFor(owner,quickPlan.sprint)})).filter(r=>r.remaining!=null):[];
  const capacityChips=capacityGuidance.map(r=>({...r,tone:r.remaining<0?'over':r.remaining===0?'full':r.remaining<=3?'tight':'available'})).sort((a,b)=>b.remaining-a.remaining||a.owner.localeCompare(b.owner));
  const selectedCapacityTone=selectedRemaining==null?'':selectedRemaining<0?'over':selectedRemaining===0?'full':selectedRemaining<=3?'tight':'available';
  const visibleDaysOff=daysOff.filter(row=>sprint==='ALL'||normaliseSprintName(row.sprint||sprintForDateRange(row.startDate,row.endDate,effectiveSprintDates))===normaliseSprintName(sprint)).slice().sort((a,b)=>normalisePersonName(a.owner).localeCompare(normalisePersonName(b.owner))||String(a.startDate||'').localeCompare(String(b.startDate||'')));
  const openPlanFeature=feature=>{const stage=entityNext(feature);setSelectedPlanFeature(feature);setQuickPlan(q=>({...q,stage:stage==='Planning Complete'?'UAT':stage,sprint:q.sprint==='ALL'?sprintOptions[0]:q.sprint,owner:q.owner||ownerOptions[0]||'',days:q.days||1,isStageComplete:false}));};
  const allocationNeedsMapping=a=>{const ids=allocationFeatureIds(a);if(a.stage===NEEDS_MAPPING_STAGE)return true;if(ids.length>0)return false;return isProdSupportGroup(a.planningGroup||a.workspaceName||a.featureName);};
  const filteredAllocations=visibleAllocationRows.filter(a=>(ownerFilter==='ALL'||a.owner===ownerFilter)&&(allocationOwnerFilter==='ALL'||a.owner===allocationOwnerFilter)&&(planWorkspaceFilter==='ALL'||allocationWorkspace(a)===planWorkspaceFilter)&&(stageFilter==='ALL'||a.stage===stageFilter)).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint))||stageSortIndex(a.stage)-stageSortIndex(b.stage));
  const matrixSprints=Array.from(new Set([...sprintOptions,...filteredAllocations.map(a=>a.sprint||'Unscheduled')].filter(Boolean))).sort();
  const allocationMatrixRows=Object.values(filteredAllocations.reduce((groups,a)=>{const item=a.visibleFeatureName||allocationDisplayName(a);const key=`${item}||${allocationWorkspace(a)}`;groups[key]||(groups[key]={key,item,workspace:allocationWorkspace(a),allocations:[],days:0,sourceIds:new Set(),needsMapping:false});groups[key].allocations.push(a);groups[key].needsMapping=groups[key].needsMapping||allocationNeedsMapping(a);if(!groups[key].sourceIds.has(a.sourceAllocationId||a.id)){groups[key].sourceIds.add(a.sourceAllocationId||a.id);groups[key].days+=Number(a.days||0);}return groups;},{})).sort((a,b)=>a.item.localeCompare(b.item)||a.workspace.localeCompare(b.workspace));
  const editingAllocationRow=editingAllocation?allocations.find(a=>a.id===editingAllocation.id):null;
  const sprintPlanRows=allocations.filter(a=>(ownerFilter==='ALL'||a.owner===ownerFilter)&&(planWorkspaceFilter==='ALL'||allocationWorkspace(a)===planWorkspaceFilter)).map(a=>({sprint:a.sprint||'Unscheduled',item:allocationDisplayName(a),workspace:allocationWorkspace(a),stage:a.stage||NEEDS_MAPPING_STAGE,sourceStage:a.sourceStage||a.stage||'',owner:a.owner||'',days:Number(a.days||0),outcome:a.isStageComplete?'Expected complete':'Planned'})).sort((a,b)=>a.sprint.localeCompare(b.sprint)||stageSortIndex(a.stage)-stageSortIndex(b.stage)||a.item.localeCompare(b.item));
  const sprintPlanGroups=Object.values(sprintPlanRows.reduce((groups,row)=>{groups[row.sprint]||(groups[row.sprint]={sprint:row.sprint,rows:[],days:0});groups[row.sprint].rows.push(row);groups[row.sprint].days+=row.days;return groups;},{}));
  function exportSprintPlanCsv(){const headers=['Sprint','Feature / Planning Item','Workspace','Stage','Source Stage','Owner','Days','Outcome'];const rows=sprintPlanRows.map(r=>[r.sprint,r.item,r.workspace,r.stage,r.sourceStage,r.owner,r.days,r.outcome]);const csv=[headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='plan-by-sprint.csv';a.click();URL.revokeObjectURL(url);}
  const diagnosticsWithIndex=useMemo(()=>importDiagnostics.map((row,idx)=>({...row,diagnosticIndex:idx})),[importDiagnostics]);
  const diagnosticOptionCache=useMemo(()=>{const cache=new Map();diagnosticsWithIndex.forEach(row=>{const key=`${row.feature}||${row.possibleMatches||''}`;if(!cache.has(key)){cache.set(key,getChildFeatureOptions({planningGroup:row.feature,featureName:row.feature,workspaceName:row.feature,possibleMatches:row.possibleMatches?row.possibleMatches.split(' | '):[]},mappingFeatures).slice().sort((a,b)=>a.feature_name.localeCompare(b.feature_name)));}});return cache;},[diagnosticsWithIndex,mappingFeatures]);
  const diagnosticFeatureOptions=row=>diagnosticOptionCache.get(`${row.feature}||${row.possibleMatches||''}`)||[];
  const diagnosticFeatureIds=row=>allocationFeatureIds(allocationById.get(row.allocationId)||{});
  const diagnosticNeedsReview=row=>{const allocation=allocationById.get(row.allocationId)||{};const selectedIds=allocationFeatureIds(allocation);const options=diagnosticFeatureOptions(row);const hasChildContext=!!row.comment||isSplitPlanningGroup(row.feature);const fill=String(row.fillColor||'').toUpperCase();const expectedFill=(fill.includes('FFFF00')||fill.includes('92D050'))&&!row.expectedComplete;const possibleCount=String(row.possibleMatches||'').split(' | ').filter(Boolean).length;const stillAddingMultiple=possibleCount>1&&selectedIds.length<possibleCount;return row.stage===NEEDS_MAPPING_STAGE||row.mappingStatus==='ambiguous'||row.mappingStatus==='unmatched'||stillAddingMultiple||(row.comment&&selectedIds.length===0)||(!row.comment&&hasChildContext&&options.length>1&&selectedIds.length===0)||expectedFill||(hasChildContext&&options.length===0);};
  const reviewDiagnostics=useMemo(()=>diagnosticsWithIndex.filter(diagnosticNeedsReview),[diagnosticsWithIndex,allocationById,diagnosticOptionCache]);
  const visibleDiagnostics=showAllDiagnostics?diagnosticsWithIndex:reviewDiagnostics;
  const diagnosticRowLimit=showAllDiagnostics?120:80;
  const importDiagnosticsPanel=importDiagnostics.length?(
    <div className="panel import-diagnostics"><div className="panel-top"><div><h3>Planning Import Diagnostics</h3><p className="muted">Showing rows that need review or correction.</p></div><div className="toolbar-left"><button onClick={()=>setShowAllDiagnostics(v=>!v)}>{showAllDiagnostics?'Show action needed only':'Show all imported rows'}</button><span className="pill-status neutral">{showAllDiagnostics?importDiagnostics.length:reviewDiagnostics.length} / {importDiagnostics.length} rows</span></div></div>{visibleDiagnostics.length?<table className="compact-table"><thead><tr><th>Row</th><th>Cell</th><th>Sprint</th><th>Person</th><th>Feature</th><th>Stage</th><th>Days</th><th>Expected</th><th>Comment</th><th>Matched Feature</th></tr></thead><tbody>{visibleDiagnostics.slice(0,diagnosticRowLimit).map(row=>{const options=diagnosticFeatureOptions(row);const selectedIds=diagnosticFeatureIds(row);const selectedFeatures=selectedIds.map(id=>featureById.get(id)).filter(Boolean);const availableOptions=options.filter(f=>!selectedIds.includes(f.id));const noContext=!row.comment&&!isSplitPlanningGroup(row.feature);const isProdSupportRow=isProdSupportGroup(row.feature);return <tr key={`${row.row}-${row.sprint}-${row.diagnosticIndex}`}><td>{row.row}</td><td>{row.stageCell}</td><td>{row.sprint}</td><td>{row.person}</td><td>{row.feature}</td><td>{row.stage}</td><td>{row.days}</td><td>{row.expectedComplete?'true':'false'}</td><td>{row.comment||'-'}</td><td>{noContext?<span className="diagnostic-na">No child mapping needed</span>:(options.length||isProdSupportRow)?<div className="diagnostic-mapping-cell"><div className="diagnostic-selected-list">{selectedFeatures.length?selectedFeatures.map(f=><span className="diagnostic-selected-feature" key={f.id}>{f.feature_name}<button type="button" onClick={()=>removeDiagnosticFeature(row.diagnosticIndex,row.allocationId,f.id)}>x</button></span>):<span className="diagnostic-na">No child feature selected</span>}</div>{(availableOptions.length||isProdSupportRow)?<select className="diagnostic-feature-select" value="" onChange={e=>{handleDiagnosticFeatureSelect(row,e.target.value);e.target.value='';}}><option value="">Add feature...</option>{isProdSupportRow&&<option value={CREATE_PROD_STORY_VALUE}>+ Create new Prod Support story</option>}{availableOptions.map(f=><option key={f.id} value={f.id}>{f.feature_name}</option>)}</select>:<small>All scoped child features selected.</small>}<small>Capacity days stay on this one allocation.</small>{row.possibleMatches&&<small>Suggested: {row.possibleMatches}</small>}</div>:<span className="diagnostic-na">No scoped child features</span>}</td></tr>;})}</tbody></table>:<p className="muted">No diagnostics rows need review. Use Show all imported rows for an audit view.</p>}{visibleDiagnostics.length>diagnosticRowLimit&&<p className="muted">Showing first {diagnosticRowLimit} diagnostics rows.</p>}</div>
  ):null;
  const kanbanPanel=<div className="panel planning-kanban-panel"><div className="panel-top"><div><h3>Planning Kanban</h3><p className="muted">Shows the full planning timeline across all imported and locally created sprints.</p></div><div className="mini-stats"><span>{ownerFilter==='ALL'?'All Owners':ownerFilter}</span><span>{planWorkspaceFilter==='ALL'?'All Workspaces':planWorkspaceFilter}</span><span>{customSprints.length} custom sprint{customSprints.length===1?'':'s'}</span></div></div><div className="board-scroll"><div className="board compact planning-board">{kanbanColumns.map(col=><div className="board-col compact" key={col.stage}><div className="col-head"><div><b>{col.label}</b><small>{col.items.length} shown</small></div><span>{col.items.length}</span></div>{col.items.length?col.items.map(({feature,through,next,finalStage,latest,milestones})=><div className={`feature-card compact ${priorityClass(feature.user_count)}`} key={feature.id} onClick={()=>openPlanFeature(feature)}><div className="card-top"><div className="card-title">{feature.feature_name}</div><button onClick={e=>{e.stopPropagation();openPlanFeature(feature);}}>Edit</button></div><div className="card-workspace">{feature.workspace}</div><div className="card-meta"><span>Current: {STATUS_LABEL[feature.status]||'Standalone'}</span><span>{Number(feature.user_count||0).toLocaleString()} users  /  {priority(feature.user_count)}</span></div><div className="planning-milestones">{milestones.length?milestones.map(m=><span className={m.complete?'complete':''} key={`${m.stage}-${m.sprint}`} title={m.sourceStage&&m.sourceStage!==m.stage?`Source stage: ${m.sourceStage}`:''}>{m.stage}: {m.sprint}{m.sourceStage&&m.sourceStage!==m.stage?` (${m.sourceStage})`:''}{m.complete?' done':''}</span>):<span>No sprint milestones yet</span>}</div><div className="card-meta"><span>Through: {through}</span><span>Next: {next}</span></div><div className="card-meta"><span>Latest: {latest}</span><span>Final stage: {finalStage}</span></div></div>):<div className="empty">Nothing here yet.</div>}</div>)}</div></div></div>;
  const allocationMatrixEditor=<div className="panel allocation-matrix-panel"><div className="panel-top"><div><h3>Planning Allocations</h3><p className="muted">Spreadsheet-style view grouped by feature across all imported sprints. Click a chip to edit the allocation.</p></div><div className="toolbar-left"><select value={allocationOwnerFilter} onChange={e=>setAllocationOwnerFilter(e.target.value)}><option value="ALL">All Owners</option>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="ALL">All Stages</option>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select><span className="pill-status neutral">{filteredAllocations.length} allocation{filteredAllocations.length===1?'':'s'}</span></div></div><div className="allocation-matrix-wrap"><table className="allocation-matrix"><thead><tr><th>Feature / Group</th>{matrixSprints.map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{allocationMatrixRows.map(row=><tr key={row.key}><td className="allocation-feature-cell"><b>{row.item}</b><small>{row.workspace}</small><small>{row.allocations.length} allocation{row.allocations.length===1?'':'s'} / {row.days} day{row.days===1?'':'s'}</small>{row.needsMapping&&<span className="mapping-chip">Needs Mapping</span>}</td>{matrixSprints.map(sprintId=>{const sprintAllocs=row.allocations.filter(a=>(a.sprint||'Unscheduled')===sprintId);return <td className="allocation-sprint-cell" key={`${row.key}-${sprintId}`}>{sprintAllocs.length?sprintAllocs.map(a=><button type="button" className={`allocation-chip ${a.isStageComplete?'complete':''} ${allocationNeedsMapping(a)?'needs-map':''}`} key={a.id} onClick={()=>setEditingAllocation({id:a.sourceAllocationId||a.id})}><span>{a.owner||'Unassigned'} / {a.stage} / {Number(a.days||0)}d</span><small>{a.isStageComplete?'Expected Complete':'Planned'}{a.featureIds?.length>1?' / shared allocation':''}</small></button>):<span className="allocation-empty">-</span>}</td>;})}</tr>)}</tbody></table>{!allocationMatrixRows.length&&<p className="muted">No allocations match the current filters.</p>}</div></div>;
  const allocationEditModal=editingAllocationRow&&<div className="modal"><div className="modal-card small"><div className="panel-top"><div><h2>Edit allocation</h2><small>{editingAllocationRow.sprint||'Unscheduled'} / {editingAllocationRow.planningGroup||editingAllocationRow.featureName||editingAllocationRow.workspaceName||'Planning item'}</small></div><button onClick={()=>setEditingAllocation(null)}>Close</button></div><div className="form-grid"><label className="full">Planning item<input value={editingAllocationRow.planningGroup||editingAllocationRow.featureName||editingAllocationRow.workspaceName||''} readOnly/></label>{isSplitPlanningGroup(editingAllocationRow.planningGroup||editingAllocationRow.featureName)&&<label className="full">Child feature<select value={editingAllocationRow.featureId||''} onChange={e=>updateAllocationFeature(editingAllocationRow.id,e.target.value)}><option value="">Select child feature</option>{isProdSupportGroup(editingAllocationRow.planningGroup||editingAllocationRow.featureName)&&<option value={CREATE_PROD_STORY_VALUE}>+ Create new Prod Support story</option>}{getChildFeatureOptions(editingAllocationRow,mappingFeatures).map(f=><option key={f.id} value={f.id}>{f.feature_name}</option>)}</select>{editingAllocationRow.stageComment&&<small>Comment: {editingAllocationRow.stageComment}</small>}{editingAllocationRow.possibleMatches?.length>0&&<small>Possible matches: {editingAllocationRow.possibleMatches.join(' / ')}</small>}{isProdSupportGroup(editingAllocationRow.planningGroup||editingAllocationRow.featureName)&&<div className="prod-story-create"><input placeholder="Story name" value={prodStoryDraft.name} onChange={e=>setProdStoryDraft({...prodStoryDraft,name:e.target.value})}/><input placeholder="DevOps ID" value={prodStoryDraft.devOpsId} onChange={e=>setProdStoryDraft({...prodStoryDraft,devOpsId:e.target.value})}/><input placeholder="Notes" value={prodStoryDraft.notes} onChange={e=>setProdStoryDraft({...prodStoryDraft,notes:e.target.value})}/><button type="button" onClick={()=>{const feature=createProdSupportStory();if(feature)linkAllocationToFeature(editingAllocationRow.id,feature);}}>Create and link</button></div>}</label>}<label>Sprint<select value={editingAllocationRow.sprint||''} onChange={e=>updateAllocation(editingAllocationRow.id,{sprint:e.target.value})}>{matrixSprints.map(s=><option key={s}>{s}</option>)}</select></label><label>Owner<select value={editingAllocationRow.owner||''} onChange={e=>updateAllocation(editingAllocationRow.id,{owner:e.target.value})}>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select><small>{remainingFor(editingAllocationRow.owner,editingAllocationRow.sprint)==null?'No capacity':remainingFor(editingAllocationRow.owner,editingAllocationRow.sprint)<0?`Over capacity by ${Math.abs(remainingFor(editingAllocationRow.owner,editingAllocationRow.sprint))} days`:`Remaining in ${editingAllocationRow.sprint}: ${remainingFor(editingAllocationRow.owner,editingAllocationRow.sprint)} days`}</small></label><label>Stage<select value={editingAllocationRow.stage} onChange={e=>updateAllocation(editingAllocationRow.id,{stage:e.target.value})}>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></label><label>Days<input type="number" min="0" value={editingAllocationRow.days} onChange={e=>updateAllocation(editingAllocationRow.id,{days:Number(e.target.value||0)})}/></label>{allocationFeatureIds(editingAllocationRow).length>1?<div className="full child-outcome-list"><b>Child feature outcomes</b>{allocationFeatureIds(editingAllocationRow).map(featureId=>{const feature=featureById.get(featureId);return <label key={featureId}>{feature?.feature_name||featureId}<select value={allocationFeatureComplete(editingAllocationRow,featureId)?'complete':'planned'} onChange={e=>updateChildOutcome(editingAllocationRow.id,featureId,e.target.value==='complete')}><option value="planned">Planned only</option><option value="complete">Expected complete</option></select></label>;})}<small>Capacity days stay on the shared source allocation.</small></div>:<label className="full">Stage outcome<select value={allocationOutcomeComplete(editingAllocationRow)?'complete':'planned'} onChange={e=>updateAllocationOutcome(editingAllocationRow,e.target.value==='complete')}><option value="planned">Planned only</option><option value="complete">Expected complete</option></select></label>}</div><div className="modal-actions"><button onClick={()=>{deleteAllocation(editingAllocationRow.id);setEditingAllocation(null);}}>Delete</button><button onClick={()=>setEditingAllocation(null)}>Done</button></div></div></div>;
  const planModal=selectedPlanFeature&&(
    <div className="modal"><div className="modal-card"><div className="panel-top"><div><h2>{selectedPlanFeature.feature_name}</h2><small>{selectedPlanFeature.workspace}  /  Current: {STATUS_LABEL[selectedPlanFeature.status]||'Standalone planning item'}</small><small>Planned Through: {entityThrough(selectedPlanFeature)}  /  Next recommended: {entityNext(selectedPlanFeature)}</small><small>Final stage: {featureFinalStage(selectedPlanFeature)}  /  {priority(selectedPlanFeature.user_count)}  /  {Number(selectedPlanFeature.user_count||0).toLocaleString()} users</small></div><button onClick={()=>setSelectedPlanFeature(null)}>Close</button></div><div className="final-stage-control"><label>Complete this item when<select value={featureFinalStage(selectedPlanFeature)} onChange={e=>updateFeatureFinalStage(selectedPlanFeature.id,e.target.value)}>{PLAN_STAGES.filter(stage=>stage!=='Requirement').map(stage=><option key={stage} value={stage}>{stage}</option>)}</select></label><small>When this stage is Expected complete, the card moves to Planning Complete. Board View items default to BA Sign-off; TSNSW Adult Community Education defaults to UAT.</small></div><h3>Existing planning allocations</h3><table><thead><tr><th>Sprint</th><th>Stage</th><th>Owner</th><th>Days</th><th>Outcome</th><th></th></tr></thead><tbody>{selectedAllocations.length?selectedAllocations.map(a=><tr key={a.id}><td><b>{a.sprint||'Unscheduled'}</b></td><td><select value={a.stage} onChange={e=>updateAllocation(a.id,{stage:e.target.value})}>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></td><td><select value={a.owner} onChange={e=>updateAllocation(a.id,{owner:e.target.value})}>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select></td><td><input type="number" min="0" value={a.days} onChange={e=>updateAllocation(a.id,{days:Number(e.target.value||0)})}/></td><td><select value={allocationOutcomeComplete(a)?'complete':'planned'} onChange={e=>updateAllocationOutcome(a,e.target.value==='complete')}><option value="planned">Planned</option><option value="complete">Expected complete</option></select></td><td><button onClick={()=>deleteAllocation(a.id)}>Delete</button></td></tr>):<tr><td colSpan="6">No planning allocations yet.</td></tr>}</tbody></table>{entityNext(selectedPlanFeature)!=='Planning Complete'&&<><h3>Add planning allocation</h3><div className="form-grid"><label>Stage<select value={quickPlan.stage} onChange={e=>setQuickPlan({...quickPlan,stage:e.target.value})}>{STAGE_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></label><label>Sprint<select value={quickPlan.sprint} onChange={e=>setQuickPlan({...quickPlan,sprint:e.target.value})}>{sprintOptions.map(s=><option key={s}>{s}</option>)}</select></label><label>Owner<select value={quickPlan.owner} onChange={e=>setQuickPlan({...quickPlan,owner:e.target.value})}>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select></label><label>Days<input type="number" min="0" value={quickPlan.days} onChange={e=>setQuickPlan({...quickPlan,days:e.target.value})}/></label><label>Stage outcome<select value={quickPlan.isStageComplete?'complete':'planned'} onChange={e=>setQuickPlan({...quickPlan,isStageComplete:e.target.value==='complete'})}><option value="planned">Planned</option><option value="complete">Expected complete</option></select></label><div className="capacity-chip-section">{quickPlan.owner&&selectedRemaining!=null&&<p className={'selected-capacity '+selectedCapacityTone}>{quickPlan.owner}: {selectedRemaining} day{Math.abs(selectedRemaining)===1?'':'s'} remaining in {quickPlan.sprint}</p>}{capacityChips.length?<div className="capacity-chip-list">{capacityChips.map(r=><span key={r.owner} className={'capacity-chip '+r.tone+(r.owner===quickPlan.owner?' selected':'')}><b>{r.owner}</b><span>{r.remaining}d</span></span>)}</div>:<small>No person-level capacity for this sprint.</small>}{selectedRemaining!=null&&Number(quickPlan.days||0)>selectedRemaining&&<p className="capacity-warning">Warning: this exceeds remaining capacity by {Number(quickPlan.days||0)-selectedRemaining} day(s).</p>}</div></div><div className="modal-actions"><button onClick={()=>setSelectedPlanFeature(null)}>Close</button><button onClick={()=>saveRecommendedAllocation(selectedPlanFeature)}>Add Allocation</button></div></>}</div></div>
  );  const capacityTools=<div className="capacity-tools"><div className="panel sprint-planner-panel compact-capacity-panel"><div className="panel-top compact-panel-top"><div><h3>Sprint Planner</h3><p className="muted">Capacity input for the selected sprint.</p></div><label>Capacity Sprint<select value={sprint} onChange={e=>setSprint(e.target.value)}>{sprintOptions.map(s=><option key={s}>{s}</option>)}</select></label></div><table className="compact-table capacity-table"><thead><tr><th>Owner</th><th>Base</th><th>Off</th><th>Avail</th><th>Plan</th><th>Remain</th></tr></thead><tbody>{capacityRows.map(r=><tr key={r.owner}><td>{r.owner}</td><td><input type="number" value={r.base??''} placeholder="-" onChange={e=>updateCapacity(r.owner,e.target.value)}/></td><td>{r.off||''}</td><td>{r.available==null?'-':r.available}</td><td>{r.planned}</td><td className={r.remaining<0?'capacity-negative':''}>{r.remaining==null?'-':r.remaining}</td></tr>)}</tbody></table></div><div className="panel days-off-panel"><div className="panel-top compact-panel-top"><div><h3>Days Off / Capacity</h3><p className="muted">Days off deduct from available capacity.</p></div></div><div className="days-off-form"><label>Person<input list="capacity-owners" value={dayOffForm.owner} onChange={e=>setDayOffForm({...dayOffForm,owner:e.target.value})}/></label><label>Start Date<input type="date" value={dayOffForm.startDate} onChange={e=>setDayOffForm({...dayOffForm,startDate:e.target.value,endDate:dayOffForm.endDate||e.target.value})}/></label><label>End Date<input type="date" value={dayOffForm.endDate} onChange={e=>setDayOffForm({...dayOffForm,endDate:e.target.value})}/></label><label>Note<input value={dayOffForm.note} onChange={e=>setDayOffForm({...dayOffForm,note:e.target.value})}/></label><button onClick={addDayOff}>Add</button></div><datalist id="capacity-owners">{ownerOptions.map(o=><option key={o} value={o}/>)}</datalist>{dayOffWarning&&<p className="capacity-warning">{dayOffWarning}</p>}<details className="sprint-date-setup"><summary>Sprint date setup</summary><div className="sprint-date-grid">{effectiveSprintDates.slice(0,7).map(row=><div key={row.sprint} className="sprint-date-row"><b>{row.sprint}</b><input type="date" value={toDateInputValue(row.startDate)} onChange={e=>updateSprintDates(row.sprint,{startDate:e.target.value})}/><input type="date" value={toDateInputValue(row.endDate)} onChange={e=>updateSprintDates(row.sprint,{endDate:e.target.value})}/></div>)}</div></details><table className="compact-table days-off-table"><thead><tr><th>Person</th><th>Sprint</th><th>Dates</th><th>Days</th><th>Note</th><th></th></tr></thead><tbody>{visibleDaysOff.length?visibleDaysOff.map(row=><tr key={row.id}><td>{row.owner}</td><td><b>{row.sprint||sprintForDateRange(row.startDate,row.endDate,effectiveSprintDates)||'-'}</b></td><td>{fmtDate(row.startDate)}{row.endDate&&row.endDate!==row.startDate?` to ${fmtDate(row.endDate)}`:''}</td><td>{Number(row.days||workingDaysBetween(row.startDate,row.endDate)||0)}</td><td>{row.note||'-'}</td><td><button onClick={()=>deleteDayOff(row.id)}>Remove</button></td></tr>):<tr><td colSpan="6">No days off for this sprint.</td></tr>}</tbody></table></div></div>; return <div className="dashboard"><div className="dash-head"><div><div className="eyebrow">Delivery Plan</div><h1>Stage-by-stage sprint planning</h1></div><div className="toolbar-left"><button onClick={()=>document.getElementById('planning-xlsx').click()}>Import 26Q1 Planning Excel</button><input id="planning-xlsx" type="file" accept=".xlsx,.xls" hidden onChange={importPlanningExcel}/><button onClick={exportPlanningData}>Export Planning Data</button><button onClick={()=>document.getElementById('planning-json').click()}>Import Planning Data</button><input id="planning-json" type="file" accept=".json,application/json" hidden onChange={importPlanningData}/><select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option value="ALL">All Owners</option>{ownerOptions.map(o=><option key={o}>{o}</option>)}</select><select value={planWorkspaceFilter} onChange={e=>setPlanWorkspaceFilter(e.target.value)}><option value="ALL">All Workspaces</option>{allFeatureWorkspaces.map(w=><option key={w}>{w}</option>)}</select></div></div><div className="panel planning-controls"><div className="toolbar-left"><input value={newSprint} onChange={e=>setNewSprint(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addSprint();}} placeholder="Add sprint, e.g. 26Q2S1"/><button onClick={addSprint}>Add Sprint</button></div></div>{importMessage&&<div className="panel import-message">{importMessage}</div>}{importDiagnosticsPanel}{kanbanPanel}{allocationMatrixEditor}{capacityTools}{allocationEditModal}{planModal}</div>;
}

function SprintReview({ allocations, customSprints, features, prodSupportStories }) {
  const sprintOptions=useMemo(()=>['ALL',...Array.from(new Set([...customSprints,...allocations.map(a=>a.sprint)].map(normaliseSprintName).filter(Boolean))).sort()],[allocations,customSprints]);
  const [sprint,setSprint]=useState('ALL');
  const featureById=useMemo(()=>new Map([...features,...prodSupportStories.map(prodSupportStoryFeature)].map(f=>[f.id,f])),[features,prodSupportStories]);
  const rows=useMemo(()=>allocations.flatMap(a=>{const ids=allocationFeatureIds(a);const visible=ids.length>1?ids.map(featureId=>({featureId,featureName:featureById.get(featureId)?.feature_name})).filter(row=>row.featureName):[{featureId:ids[0]||'',featureName:a.featureName&&a.planningGroup?a.featureName:(a.actualFeatureName||a.featureName||a.planningGroup||a.workspaceName||'Planning item')}];return visible.map(row=>{const stageText=a.sourceStage||a.stage||'';return{sprint:a.sprint||'Unscheduled',feature:row.featureName,stage:stageText,keyGoal:/goal/i.test(stageText),achieved:allocationFeatureComplete(a,row.featureId),sourceAllocationId:a.id};});}).filter(a=>sprint==='ALL'||normaliseSprintName(a.sprint)===sprint).sort((a,b)=>String(a.sprint).localeCompare(String(b.sprint))||a.feature.localeCompare(b.feature)||a.stage.localeCompare(b.stage)),[allocations,sprint,featureById]);
  function exportSprintReviewCsv(){const csv=[['Sprint','Feature / Story','Stage','Key Goal','Achieved'].join(','),...rows.map(r=>[r.sprint,r.feature,r.stage,r.keyGoal?'TRUE':'',r.achieved?'TRUE':''].map(csvEscape).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='sprint-review.csv';a.click();URL.revokeObjectURL(url);}
  return <div className="dashboard"><div className="dash-head"><div><div className="eyebrow">Sprint Review</div><h1>Sprint review table</h1></div><div className="toolbar-left"><select value={sprint} onChange={e=>setSprint(e.target.value)}>{sprintOptions.map(s=><option key={s} value={s}>{s==='ALL'?'All Sprints':s}</option>)}</select><button onClick={exportSprintReviewCsv}>Export Review CSV</button></div></div><div className="panel sprint-review-panel"><table className="compact-table sprint-review-table"><thead><tr><th>Feature / Story</th><th>Stage</th><th>Key Goal</th><th>Achieved</th></tr></thead><tbody>{rows.length?rows.map((row,idx)=><tr key={`${row.sprint}-${idx}-${row.feature}-${row.stage}`}><td>{row.feature}<small>{row.sprint}</small></td><td className={row.keyGoal?'review-goal-stage':''}>{row.stage}</td><td>{row.keyGoal?'TRUE':''}</td><td>{row.achieved?'TRUE':''}</td></tr>):<tr><td colSpan="4">No planning allocations yet.</td></tr>}</tbody></table></div></div>;
}

function App(){
 const [features,setFeatures]=useState([]); const [milestones,setMilestones]=useState({}); const [allocations,setAllocations]=useState([]); const [capacities,setCapacities]=useState([]); const [daysOff,setDaysOff]=useState([]); const [sprintDates,setSprintDates]=useState([]); const [prodSupportStories,setProdSupportStories]=useState([]); const [finalStageByFeatureId,setFinalStageByFeatureId]=useState({}); const [customSprints,setCustomSprints]=useState([]); const [mode,setMode]=useState('executive'); const [theme,setTheme]=useState(()=>localStorage.getItem('feature-tracker-theme')||'dark'); const [workspaceFilter,setWorkspaceFilter]=useState('ALL'); const [ownerFilter,setOwnerFilter]=useState('ALL'); const [selectedWorkspace,setSelectedWorkspace]=useState(null); const [editing,setEditing]=useState(null); const [loaded,setLoaded]=useState(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(saved?.features){setFeatures(saved.features);setMilestones(buildWorkspaceMilestones(saved.features,saved.milestones||{}));setAllocations(saved.allocations||[]);setCapacities(saved.capacities||[]);setDaysOff(saved.daysOff||[]);setSprintDates(saved.sprintDates||[]);setProdSupportStories(saved.prodSupportStories||[]);setFinalStageByFeatureId(saved.finalStageByFeatureId||{});setCustomSprints(saved.customSprints||[]);}}catch{} finally { setLoaded(true); }},[]);
 useEffect(()=>{if(!loaded)return;const handle=setTimeout(()=>localStorage.setItem(STORAGE_KEY,JSON.stringify({features,milestones,allocations,capacities,daysOff,sprintDates,prodSupportStories,finalStageByFeatureId,customSprints})),200);return()=>clearTimeout(handle);},[features,milestones,allocations,capacities,daysOff,sprintDates,prodSupportStories,finalStageByFeatureId,customSprints,loaded]);
 useEffect(()=>{localStorage.setItem('feature-tracker-theme',theme);},[theme]);
 const workspaces=useMemo(()=>['ALL',...Array.from(new Set(features.map(f=>f.workspace).filter(Boolean))).sort()],[features]);
 const owners=useMemo(()=>['ALL',...Array.from(new Set(features.flatMap(f=>splitOwners(f.owner)))).sort()],[features]);
 function importFile(e){const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{const rows=parseCsv(String(reader.result||'')); const cleaned=rows.filter(r=>r.feature_name).map(r=>({id:id(),feature_name:r.feature_name,status:normaliseStatus(r.status),workspace:r.workspace||'Unknown',owner:r.owner||'',user_count:Number(r.user_count||0),notes:r.notes||'',Build:r.Build||'',SIT:r.SIT||'','UAT Internal':r['UAT Internal']||''})); setFeatures(cleaned); const inputMilestones=Object.fromEntries(rows.filter(r=>r.workspace).map(r=>[String(r.workspace).trim(),{Build:r.Build||'',SIT:r.SIT||'','UAT Internal':r['UAT Internal']||''}])); setMilestones(buildWorkspaceMilestones(cleaned,inputMilestones));}; reader.readAsText(file); e.target.value='';}
 function exportFile(){const headers=['feature_name','status','workspace','owner','user_count','notes','Build','SIT','UAT Internal']; const rows=features.map(f=>[f.feature_name,f.status,f.workspace,f.owner,f.user_count,f.notes,milestones[f.workspace]?.Build||'',milestones[f.workspace]?.SIT||'',milestones[f.workspace]?.['UAT Internal']||'']); const csv=[headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='feature-tracker-export.csv'; a.click(); URL.revokeObjectURL(url);}
 function addFeature(f){setFeatures(prev=>[f,...prev]); setMilestones(prev=>buildWorkspaceMilestones([f,...features],prev));}
 function saveFeature(f){setFeatures(prev=>prev.map(x=>x.id===f.id?f:x)); setEditing(null);}
 return <div className={`app ${theme}`}><div className="toolbar"><div className="toolbar-left"><button onClick={()=>document.getElementById('csv').click()}>Import</button><button onClick={exportFile}>Export</button><button className={mode==='executive'?'active':''} onClick={()=>setMode('executive')}>Executive Dashboard</button><button className={mode==='overview'?'active':''} onClick={()=>setMode('overview')}>Overview Dashboard</button><button className={mode==='board'?'active':''} onClick={()=>setMode('board')}>Board View</button><button className={mode==='delivery'?'active':''} onClick={()=>setMode('delivery')}>Delivery Plan</button><button className={mode==='sprintReview'?'active':''} onClick={()=>setMode('sprintReview')}>Sprint Review</button><button className="theme-toggle" title={theme==='dark'?'Switch to light mode':'Switch to dark mode'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span className="theme-glyph">{theme==='dark'?'\u263E':'\u2600'}</span></button><input id="csv" type="file" accept=".csv" hidden onChange={importFile}/></div><div className="mini-stats"><span>Total <b>{features.length}</b></span><span>Done <b>{features.filter(f=>f.status==='uat_done').length}</b></span></div></div>{mode==='executive'&&<ExecutiveDashboard features={features} milestones={milestones} setMilestones={setMilestones} workspaces={workspaces} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter} selectedWorkspace={selectedWorkspace} setSelectedWorkspace={setSelectedWorkspace} onEditFeature={setEditing}/>} {mode==='overview'&&<OverviewDashboard features={features} milestones={milestones} workspaces={workspaces} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter}/>} {mode==='board'&&<BoardView features={features} setFeatures={setFeatures} workspaces={workspaces} owners={owners} workspaceFilter={workspaceFilter} setWorkspaceFilter={setWorkspaceFilter} ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} onEdit={setEditing} onAdd={addFeature} allocations={allocations}/>} {mode==='delivery'&&<DeliveryPlan features={features} allocations={allocations} setAllocations={setAllocations} capacities={capacities} setCapacities={setCapacities} customSprints={customSprints} setCustomSprints={setCustomSprints} owners={owners} daysOff={daysOff} setDaysOff={setDaysOff} sprintDates={sprintDates} setSprintDates={setSprintDates} prodSupportStories={prodSupportStories} setProdSupportStories={setProdSupportStories} finalStageByFeatureId={finalStageByFeatureId} setFinalStageByFeatureId={setFinalStageByFeatureId}/>} {mode==='sprintReview'&&<SprintReview allocations={allocations} customSprints={customSprints} features={features} prodSupportStories={prodSupportStories}/>}<FeatureModal feature={editing} workspaces={workspaces} owners={owners} onClose={()=>setEditing(null)} onSave={saveFeature}/></div>;
}

createRoot(document.getElementById('root')).render(<App />);
