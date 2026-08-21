(() => {
  const APP_STORAGE_KEY = 'feature-tracker-v2-full';
  const PRIORITY_STORAGE_KEY = 'feature-tracker-priority-v1';
  const OVERLAY_ID = 'priority-planner-overlay';
  const OPEN_BUTTON_ID = 'priority-planner-open-button';

  const TIME_CRITICALITY = {
    1: 'No known deadline / more than 3 years',
    2: 'Due within 3 years',
    3: 'Due within 2 years',
    4: 'Due within 1 year',
    5: 'Due within 9 months',
    6: 'Due within 6 months',
    7: 'Due within 3 months',
    8: 'Due within 2 months',
    9: 'Due within 1 month',
    10: 'Due within 2 weeks',
  };

  const EFFORT = {
    1: { size: 'XS', days: 'Up to 8 days' },
    2: { size: 'XS+', days: '9–16 days' },
    3: { size: 'S', days: '17–22 days' },
    4: { size: 'M', days: '23–30 days' },
    5: { size: 'L', days: '31–42 days' },
    6: { size: 'XL', days: '43–60 days' },
    7: { size: 'XXL', days: '61–80 days' },
    8: { size: 'XXL+', days: '81–120 days' },
    9: { size: 'XXXL', days: '121–160 days' },
    10: { size: 'XXXL+', days: 'More than 160 days' },
  };

  const BUSINESS_VALUE = {
    1: 'Minimal or unclear business benefit',
    2: 'Low value – convenience or small improvement',
    3: 'Limited value – helpful enhancement but relatively minor',
    4: 'Some value – benefits a smaller group or improves an existing process',
    5: 'Moderate value – useful improvement but the business can operate without it',
    6: 'Good value – clear benefit and worthwhile improvement',
    7: 'Strong value – meaningful improvement for an important stakeholder group',
    8: 'High value – solves an important business problem with clear measurable benefit',
    9: 'Very high value – significant impact across multiple business areas or a major customer group',
    10: 'Critical business outcome – major strategic, executive, regulatory or organisation-wide value',
  };

  const RISK_OPPORTUNITY = {
    1: 'Does not materially reduce risk or enable other work',
    2: 'Very limited risk / opportunity benefit',
    3: 'Small improvement to risk or future capability',
    4: 'Some risk reduction or minor dependency benefit',
    5: 'Moderate benefit – reduces some risk or improves future delivery',
    6: 'Meaningful risk reduction or enables another planned feature',
    7: 'Strong risk reduction or removes an important dependency',
    8: 'Significant risk reduction or enables major future work',
    9: 'Removes a major risk / dependency or enables several important pieces of work',
    10: 'Removes a critical risk / blocker or unlocks many other high-priority features',
  };

  let plannerState = {
    workspace: 'ALL',
    quarter: 'ALL',
    stage: 'Requirement Planning',
    scoring: 'ALL',
    search: '',
    order: 'manual',
    expandedId: null,
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function readAppState() {
    try {
      const value = JSON.parse(localStorage.getItem(APP_STORAGE_KEY) || 'null');
      return value && typeof value === 'object'
        ? { features: [], allocations: [], capacities: [], milestones: {}, customSprints: [], ...value }
        : { features: [], allocations: [], capacities: [], milestones: {}, customSprints: [] };
    } catch {
      return { features: [], allocations: [], capacities: [], milestones: {}, customSprints: [] };
    }
  }

  function readScores() {
    let scores = {};
    try {
      scores = JSON.parse(localStorage.getItem(PRIORITY_STORAGE_KEY) || '{}') || {};
    } catch {
      scores = {};
    }

    const app = readAppState();
    const embedded = app.priorityScores && typeof app.priorityScores === 'object' ? app.priorityScores : {};
    scores = { ...embedded, ...scores };

    for (const feature of app.features || []) {
      if (!feature?.id) continue;
      const fromFeature = {
        businessValueScore: feature.businessValueScore,
        timeCriticalityScore: feature.timeCriticalityScore,
        riskOpportunityScore: feature.riskOpportunityScore,
        effortScore: feature.effortScore,
        priorityNote: feature.priorityNote,
      };
      if (Object.values(fromFeature).some(v => v !== undefined && v !== null && v !== '')) {
        scores[feature.id] = { ...fromFeature, ...(scores[feature.id] || {}) };
      }
    }
    return scores;
  }

  function writeScores(scores) {
    localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(scores));
    const app = readAppState();
    app.priorityScores = scores;
    app.features = (app.features || []).map(feature => {
      const entry = scores[feature.id];
      if (!entry) return feature;
      return {
        ...feature,
        businessValueScore: entry.businessValueScore,
        timeCriticalityScore: entry.timeCriticalityScore,
        riskOpportunityScore: entry.riskOpportunityScore,
        effortScore: entry.effortScore,
        priorityNote: entry.priorityNote || '',
      };
    });
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(app));
  }

  function validScore(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 10;
  }

  function isFullyScored(entry) {
    return !!entry && ['businessValueScore', 'timeCriticalityScore', 'riskOpportunityScore', 'effortScore'].every(k => validScore(entry[k]));
  }

  function wsjf(entry) {
    if (!isFullyScored(entry)) return null;
    return (Number(entry.businessValueScore) + Number(entry.timeCriticalityScore) + Number(entry.riskOpportunityScore)) / Number(entry.effortScore);
  }

  function rankMap(features, scores) {
    const ranked = features
      .map((feature, index) => ({ feature, index, score: wsjf(scores[feature.id]) }))
      .filter(row => row.score !== null)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return new Map(ranked.map((row, index) => [row.feature.id, index + 1]));
  }

  function featureQuarter(feature, app) {
    const sprints = (app.allocations || [])
      .filter(a => a?.featureId === feature.id || (Array.isArray(a?.featureIds) && a.featureIds.includes(feature.id)))
      .map(a => String(a.sprint || '').toUpperCase());
    const quarters = sprints.map(s => s.match(/(\d{2}Q\d)/)?.[1]).filter(Boolean).sort();
    return quarters.at(-1) || 'Unscheduled';
  }

  function featureStage(feature, app) {
    const status = String(feature.status || 'initial');
    if (status === 'uat_done') return 'Planning Complete';
    if (['uat_in_progress'].includes(status)) return 'UAT Planning';
    if (['bs_signoff_in_progress', 'bs_signoff_done'].includes(status)) return 'BA Sign Off Planning';
    if (['deployment_in_progress', 'deployment_done'].includes(status)) return 'Deploy Planning';
    if (['sit_in_progress', 'sit_done'].includes(status)) return 'SIT Planning';
    if (['build_in_progress', 'build_done'].includes(status)) return 'Build Planning';

    const allocations = (app.allocations || []).filter(a => a?.featureId === feature.id || (Array.isArray(a?.featureIds) && a.featureIds.includes(feature.id)));
    if (!allocations.length) return 'Requirement Planning';
    const stages = ['Requirement', 'Build', 'SIT', 'Deploy', 'BA Sign Off', 'UAT'];
    const maxIndex = Math.max(-1, ...allocations.map(a => stages.indexOf(a.stage)).filter(i => i >= 0));
    const nextIndex = Math.min(stages.length - 1, maxIndex + 1);
    return `${stages[nextIndex]} Planning`;
  }

  function scoreLabel(feature, scores, ranks) {
    const score = wsjf(scores[feature.id]);
    if (score === null) return 'Not scored';
    return `Priority #${ranks.get(feature.id)} · ${score.toFixed(2)}`;
  }

  function ensureStyles() {
    if (document.getElementById('priority-planner-styles')) return;
    const style = document.createElement('style');
    style.id = 'priority-planner-styles';
    style.textContent = `
      #${OPEN_BUTTON_ID} { margin-top: 6px; font-size: 11px; padding: 5px 8px; }
      .priority-card-badge { position:absolute; right:8px; bottom:8px; border:1px solid rgba(71,125,255,.45); background:rgba(71,125,255,.12); color:inherit; border-radius:999px; padding:4px 7px; font-size:10px; font-weight:800; line-height:1; z-index:2; cursor:pointer; }
      .priority-card-badge.unscored { opacity:.68; }
      #${OVERLAY_ID} { position:fixed; inset:0; z-index:100001; background:var(--bg,#0d1420); color:inherit; overflow:auto; }
      #${OVERLAY_ID} * { box-sizing:border-box; }
      #${OVERLAY_ID} .pp-shell { width:min(1500px, 100%); margin:0 auto; padding:24px; }
      #${OVERLAY_ID} .pp-top { position:sticky; top:0; z-index:8; background:var(--bg,#0d1420); padding:10px 0 14px; border-bottom:1px solid rgba(127,127,127,.2); }
      #${OVERLAY_ID} .pp-head { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; }
      #${OVERLAY_ID} .pp-head h1 { margin:3px 0 6px; }
      #${OVERLAY_ID} .pp-help { max-width:900px; margin:8px 0 0; padding:10px 12px; border-radius:10px; background:rgba(71,125,255,.1); border:1px solid rgba(71,125,255,.25); font-size:13px; }
      #${OVERLAY_ID} .pp-filters { display:grid; grid-template-columns:minmax(220px,2fr) repeat(5,minmax(135px,1fr)); gap:10px; margin-top:14px; }
      #${OVERLAY_ID} input, #${OVERLAY_ID} select, #${OVERLAY_ID} textarea { width:100%; }
      #${OVERLAY_ID} .pp-summary { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
      #${OVERLAY_ID} .pp-pill { border:1px solid rgba(127,127,127,.3); border-radius:999px; padding:6px 10px; font-size:12px; font-weight:700; }
      #${OVERLAY_ID} .pp-feature { border:1px solid rgba(127,127,127,.25); border-radius:14px; margin:10px 0; overflow:hidden; background:var(--panel,#182130); }
      #${OVERLAY_ID} .pp-feature-head { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:12px; align-items:center; padding:13px 15px; cursor:pointer; }
      #${OVERLAY_ID} .pp-feature-title { font-weight:800; }
      #${OVERLAY_ID} .pp-feature-meta { opacity:.68; font-size:12px; margin-top:3px; }
      #${OVERLAY_ID} .pp-score { font-weight:900; white-space:nowrap; }
      #${OVERLAY_ID} .pp-score.unscored { opacity:.6; }
      #${OVERLAY_ID} .pp-feature-body { border-top:1px solid rgba(127,127,127,.2); padding:16px; }
      #${OVERLAY_ID} .pp-score-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
      #${OVERLAY_ID} .pp-factor { border:1px solid rgba(127,127,127,.22); border-radius:12px; padding:13px; }
      #${OVERLAY_ID} .pp-factor-title { display:flex; justify-content:space-between; gap:10px; align-items:center; font-weight:800; }
      #${OVERLAY_ID} .pp-factor-question { margin:5px 0 10px; opacity:.72; font-size:12px; }
      #${OVERLAY_ID} input[type=range] { padding:0; }
      #${OVERLAY_ID} .pp-meaning { min-height:38px; margin-top:8px; font-size:12px; font-weight:700; }
      #${OVERLAY_ID} .pp-meaning.unset { opacity:.6; font-weight:500; }
      #${OVERLAY_ID} .pp-note { margin-top:14px; }
      #${OVERLAY_ID} .pp-note textarea { min-height:72px; resize:vertical; }
      #${OVERLAY_ID} .pp-table-wrap { margin-top:22px; overflow:auto; border:1px solid rgba(127,127,127,.24); border-radius:12px; }
      #${OVERLAY_ID} table { width:100%; border-collapse:collapse; min-width:980px; }
      #${OVERLAY_ID} th, #${OVERLAY_ID} td { padding:9px 10px; text-align:left; border-bottom:1px solid rgba(127,127,127,.16); font-size:12px; }
      #${OVERLAY_ID} th { position:sticky; top:0; background:var(--panel,#182130); }
      #${OVERLAY_ID} .pp-empty { padding:28px; text-align:center; opacity:.65; }
      #${OVERLAY_ID} .pp-actions { display:flex; gap:8px; align-items:center; }
      #${OVERLAY_ID} .pp-export-import { display:flex; gap:8px; margin-top:10px; }
      @media(max-width:1000px){ #${OVERLAY_ID} .pp-filters{grid-template-columns:repeat(2,minmax(0,1fr));} #${OVERLAY_ID} .pp-score-grid{grid-template-columns:1fr;} }
      @media(max-width:620px){ #${OVERLAY_ID} .pp-shell{padding:12px;} #${OVERLAY_ID} .pp-filters{grid-template-columns:1fr;} #${OVERLAY_ID} .pp-feature-head{grid-template-columns:1fr auto;} #${OVERLAY_ID} .pp-feature-head .pp-stage{display:none;} }
    `;
    document.head.appendChild(style);
  }

  function scoreMeaning(type, score) {
    if (!validScore(score)) return 'Not scored yet – move the slider to choose a score.';
    if (type === 'businessValueScore') return `${score} – ${BUSINESS_VALUE[score]}`;
    if (type === 'timeCriticalityScore') return `${score} – ${TIME_CRITICALITY[score]}`;
    if (type === 'riskOpportunityScore') return `${score} – ${RISK_OPPORTUNITY[score]}`;
    if (type === 'effortScore') return `${score} – ${EFFORT[score].size} · ${EFFORT[score].days}`;
    return String(score);
  }

  function factorHtml(featureId, entry, key, title, question) {
    const set = validScore(entry?.[key]);
    const value = set ? Number(entry[key]) : 1;
    return `<div class="pp-factor">
      <div class="pp-factor-title"><span>${escapeHtml(title)}</span><span data-factor-value="${key}">${set ? value : '—'}</span></div>
      <div class="pp-factor-question">${escapeHtml(question)}</div>
      <input type="range" min="1" max="10" step="1" value="${value}" data-feature-id="${escapeHtml(featureId)}" data-score-key="${key}" aria-label="${escapeHtml(title)}">
      <div class="pp-meaning ${set ? '' : 'unset'}" data-meaning-for="${key}">${escapeHtml(scoreMeaning(key, set ? value : null))}</div>
    </div>`;
  }

  function filterFeatures(app, scores) {
    let features = [...(app.features || [])];
    const search = plannerState.search.trim().toLowerCase();
    if (search) features = features.filter(f => `${f.feature_name || ''} ${f.id || ''} ${f.workspace || ''}`.toLowerCase().includes(search));
    if (plannerState.workspace !== 'ALL') features = features.filter(f => String(f.workspace || 'Unassigned') === plannerState.workspace);
    if (plannerState.quarter !== 'ALL') features = features.filter(f => featureQuarter(f, app) === plannerState.quarter);
    if (plannerState.stage !== 'ALL') features = features.filter(f => featureStage(f, app) === plannerState.stage);
    if (plannerState.scoring === 'SCORED') features = features.filter(f => isFullyScored(scores[f.id]));
    if (plannerState.scoring === 'UNSCORED') features = features.filter(f => !isFullyScored(scores[f.id]));

    const originalOrder = new Map((app.features || []).map((f, i) => [f.id, i]));
    features.sort((a, b) => {
      const ea = scores[a.id] || {}; const eb = scores[b.id] || {};
      const sa = wsjf(ea); const sb = wsjf(eb);
      if (plannerState.order === 'priority') return (sb ?? -Infinity) - (sa ?? -Infinity) || (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
      if (plannerState.order === 'business') return Number(eb.businessValueScore || 0) - Number(ea.businessValueScore || 0);
      if (plannerState.order === 'time') return Number(eb.timeCriticalityScore || 0) - Number(ea.timeCriticalityScore || 0);
      if (plannerState.order === 'risk') return Number(eb.riskOpportunityScore || 0) - Number(ea.riskOpportunityScore || 0);
      if (plannerState.order === 'effort') return (validScore(ea.effortScore) ? Number(ea.effortScore) : 99) - (validScore(eb.effortScore) ? Number(eb.effortScore) : 99);
      if (plannerState.order === 'name') return String(a.feature_name || '').localeCompare(String(b.feature_name || ''));
      return (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
    });
    return features;
  }

  function renderPlanner() {
    ensureStyles();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const app = readAppState();
    const scores = readScores();
    const ranks = rankMap(app.features || [], scores);
    const features = filterFeatures(app, scores);
    const workspaces = [...new Set((app.features || []).map(f => String(f.workspace || 'Unassigned')))].sort();
    const quarters = [...new Set((app.features || []).map(f => featureQuarter(f, app)))].sort();
    const stages = ['Requirement Planning', 'Build Planning', 'SIT Planning', 'Deploy Planning', 'BA Sign Off Planning', 'UAT Planning', 'Planning Complete'];
    const fullyScoredCount = (app.features || []).filter(f => isFullyScored(scores[f.id])).length;

    const featureCards = features.map(feature => {
      const entry = scores[feature.id] || {};
      const expanded = plannerState.expandedId === feature.id;
      const score = wsjf(entry);
      return `<section class="pp-feature" data-feature="${escapeHtml(feature.id)}">
        <div class="pp-feature-head" data-action="toggle-feature" data-feature-id="${escapeHtml(feature.id)}">
          <div><div class="pp-feature-title">${escapeHtml(feature.feature_name || 'Untitled feature')}</div><div class="pp-feature-meta">${escapeHtml(feature.workspace || 'Unassigned')} · ${escapeHtml(feature.id || '')} · ${escapeHtml(featureQuarter(feature, app))}</div></div>
          <div class="pp-stage">${escapeHtml(featureStage(feature, app))}</div>
          <div class="pp-score ${score === null ? 'unscored' : ''}" data-score-for="${escapeHtml(feature.id)}">${escapeHtml(scoreLabel(feature, scores, ranks))}</div>
        </div>
        ${expanded ? `<div class="pp-feature-body">
          <div class="pp-score-grid">
            ${factorHtml(feature.id, entry, 'businessValueScore', 'Business Value', 'How valuable is this feature to the business?')}
            ${factorHtml(feature.id, entry, 'timeCriticalityScore', 'Time Criticality', 'When does this need to be delivered?')}
            ${factorHtml(feature.id, entry, 'riskOpportunityScore', 'Risk Reduction / Enables Other Work', 'Does this reduce an important risk, remove a blocker, or enable other work?')}
            ${factorHtml(feature.id, entry, 'effortScore', 'Effort', 'How much effort do we expect this feature to take?')}
          </div>
          <label class="pp-note"><b>Priority Note</b><div class="pp-factor-question">Optional – record why these scores were chosen.</div><textarea data-priority-note="${escapeHtml(feature.id)}" placeholder="e.g. Reporting deadline in October and dependency for two other dashboards.">${escapeHtml(entry.priorityNote || '')}</textarea></label>
        </div>` : ''}
      </section>`;
    }).join('');

    const comparison = [...features].sort((a, b) => {
      const sa = wsjf(scores[a.id]); const sb = wsjf(scores[b.id]);
      if (sa === null && sb === null) return String(a.feature_name || '').localeCompare(String(b.feature_name || ''));
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa;
    });

    overlay.innerHTML = `<div class="pp-shell">
      <div class="pp-top">
        <div class="pp-head"><div><div class="eyebrow">Delivery Plan</div><h1>Priority Planner</h1><p class="muted">Score features to help decide what should be picked up first. Based on the WSJF prioritisation method.</p></div><div class="pp-actions"><button type="button" data-action="close-planner">Close</button></div></div>
        <div class="pp-help"><b>How it works:</b> Higher-value, more time-critical work that reduces risk or enables other work receives a higher score. Effort is the denominator, so smaller valuable items can rise in priority. This is guidance only – your manual feature order is never changed.</div>
        <div class="pp-filters">
          <input type="search" data-filter="search" value="${escapeHtml(plannerState.search)}" placeholder="Search feature name or ID">
          <select data-filter="workspace"><option value="ALL">All Workspaces</option>${workspaces.map(v => `<option ${plannerState.workspace === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
          <select data-filter="quarter"><option value="ALL">All Quarters</option>${quarters.map(v => `<option ${plannerState.quarter === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
          <select data-filter="stage"><option value="ALL">All Stages</option>${stages.map(v => `<option ${plannerState.stage === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
          <select data-filter="scoring"><option value="ALL" ${plannerState.scoring === 'ALL' ? 'selected' : ''}>All scoring</option><option value="UNSCORED" ${plannerState.scoring === 'UNSCORED' ? 'selected' : ''}>Not scored</option><option value="SCORED" ${plannerState.scoring === 'SCORED' ? 'selected' : ''}>Fully scored</option></select>
          <select data-filter="order"><option value="manual" ${plannerState.order === 'manual' ? 'selected' : ''}>Manual order</option><option value="priority" ${plannerState.order === 'priority' ? 'selected' : ''}>Priority score</option><option value="business" ${plannerState.order === 'business' ? 'selected' : ''}>Business value</option><option value="time" ${plannerState.order === 'time' ? 'selected' : ''}>Time criticality</option><option value="risk" ${plannerState.order === 'risk' ? 'selected' : ''}>Risk / enables work</option><option value="effort" ${plannerState.order === 'effort' ? 'selected' : ''}>Lowest effort</option><option value="name" ${plannerState.order === 'name' ? 'selected' : ''}>Feature name</option></select>
        </div>
        <div class="pp-summary"><span class="pp-pill">${features.length} shown</span><span class="pp-pill">${fullyScoredCount} of ${(app.features || []).length} fully scored</span><span class="pp-pill">Manual order preserved</span></div>
      </div>
      <div>${featureCards || '<div class="pp-empty">No features match these filters.</div>'}</div>
      <h2 style="margin-top:28px">Compare Priorities</h2>
      <p class="muted">Scored features are ranked highest first. Unscored features stay below them.</p>
      <div class="pp-table-wrap"><table><thead><tr><th>Rank</th><th>Feature</th><th>Workspace</th><th>Business Value</th><th>Time Criticality</th><th>Risk / Enables</th><th>Effort</th><th>Score</th></tr></thead><tbody>${comparison.map(feature => {
        const entry = scores[feature.id] || {}; const score = wsjf(entry);
        return `<tr><td>${score === null ? '—' : `#${ranks.get(feature.id)}`}</td><td>${escapeHtml(feature.feature_name || '')}</td><td>${escapeHtml(feature.workspace || '')}</td><td>${validScore(entry.businessValueScore) ? entry.businessValueScore : '—'}</td><td>${validScore(entry.timeCriticalityScore) ? entry.timeCriticalityScore : '—'}</td><td>${validScore(entry.riskOpportunityScore) ? entry.riskOpportunityScore : '—'}</td><td>${validScore(entry.effortScore) ? `${entry.effortScore} · ${EFFORT[entry.effortScore].size}` : '—'}</td><td><b>${score === null ? 'Not scored' : score.toFixed(2)}</b></td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="pp-export-import"><button type="button" data-action="export-priority">Export Priority Data</button><button type="button" data-action="import-priority">Import Priority Data</button><input type="file" accept=".json,application/json" data-role="priority-file" hidden></div>
    </div>`;
  }

  function openPlanner(featureId = null) {
    ensureStyles();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      document.body.appendChild(overlay);
    }
    if (featureId) {
      plannerState.expandedId = featureId;
      plannerState.stage = 'ALL';
      plannerState.workspace = 'ALL';
      plannerState.quarter = 'ALL';
      plannerState.scoring = 'ALL';
      plannerState.search = '';
    }
    document.body.style.overflow = 'hidden';
    renderPlanner();
    if (featureId) setTimeout(() => overlay.querySelector(`[data-feature="${CSS.escape(featureId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
  }

  function closePlanner() {
    document.getElementById(OVERLAY_ID)?.remove();
    document.body.style.overflow = '';
    syncCards();
  }

  function exportPriorityData() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), priorityScores: readScores() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'feature-priority-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function importPriorityFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'));
        const incoming = data.priorityScores && typeof data.priorityScores === 'object' ? data.priorityScores : data;
        const current = readScores();
        writeScores({ ...current, ...incoming });
        renderPlanner();
        syncCards();
      } catch (error) {
        alert(`Priority data import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function bindPlannerEvents() {
    document.addEventListener('click', event => {
      const overlay = event.target.closest?.(`#${OVERLAY_ID}`);
      if (!overlay) return;
      const actionEl = event.target.closest?.('[data-action]');
      const action = actionEl?.dataset?.action;
      if (action === 'close-planner') { closePlanner(); return; }
      if (action === 'toggle-feature') {
        const featureId = actionEl.dataset.featureId;
        plannerState.expandedId = plannerState.expandedId === featureId ? null : featureId;
        renderPlanner(); return;
      }
      if (action === 'export-priority') { exportPriorityData(); return; }
      if (action === 'import-priority') { overlay.querySelector('[data-role="priority-file"]')?.click(); return; }
    });

    document.addEventListener('input', event => {
      if (!event.target.closest?.(`#${OVERLAY_ID}`)) return;
      const scoreKey = event.target.dataset?.scoreKey;
      if (scoreKey) {
        const featureId = event.target.dataset.featureId;
        const value = Number(event.target.value);
        const scores = readScores();
        scores[featureId] = { ...(scores[featureId] || {}), [scoreKey]: value };
        writeScores(scores);
        const factor = event.target.closest('.pp-factor');
        const valueEl = factor?.querySelector(`[data-factor-value="${scoreKey}"]`);
        const meaningEl = factor?.querySelector(`[data-meaning-for="${scoreKey}"]`);
        if (valueEl) valueEl.textContent = String(value);
        if (meaningEl) { meaningEl.textContent = scoreMeaning(scoreKey, value); meaningEl.classList.remove('unset'); }
        const app = readAppState(); const freshScores = readScores(); const ranks = rankMap(app.features || [], freshScores);
        const feature = (app.features || []).find(f => f.id === featureId);
        const scoreEl = event.target.closest('.pp-feature')?.querySelector(`[data-score-for="${CSS.escape(featureId)}"]`);
        if (scoreEl && feature) { scoreEl.textContent = scoreLabel(feature, freshScores, ranks); scoreEl.classList.toggle('unscored', wsjf(freshScores[featureId]) === null); }
        return;
      }
      if (event.target.matches('[data-priority-note]')) {
        const featureId = event.target.dataset.priorityNote;
        const scores = readScores();
        scores[featureId] = { ...(scores[featureId] || {}), priorityNote: event.target.value };
        writeScores(scores);
        return;
      }
      if (event.target.dataset?.filter === 'search') {
        plannerState.search = event.target.value;
        clearTimeout(event.target.__ppTimer);
        event.target.__ppTimer = setTimeout(renderPlanner, 220);
      }
    });

    document.addEventListener('change', event => {
      if (!event.target.closest?.(`#${OVERLAY_ID}`)) return;
      const filter = event.target.dataset?.filter;
      if (filter === 'workspace') plannerState.workspace = event.target.value;
      if (filter === 'quarter') plannerState.quarter = event.target.value;
      if (filter === 'stage') plannerState.stage = event.target.value;
      if (filter === 'scoring') plannerState.scoring = event.target.value;
      if (filter === 'order') plannerState.order = event.target.value;
      if (filter) { renderPlanner(); return; }
      if (event.target.dataset?.scoreKey) { renderPlanner(); syncCards(); return; }
      if (event.target.dataset?.role === 'priority-file') { importPriorityFile(event.target.files?.[0]); event.target.value = ''; }
    });
  }

  function ensureOpenButton() {
    if (document.getElementById(OPEN_BUTTON_ID)) return;
    const requirementHead = [...document.querySelectorAll('.col-head')].find(head => head.querySelector('b')?.textContent?.trim() === 'Requirement Planning');
    if (!requirementHead) return;
    const button = document.createElement('button');
    button.id = OPEN_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Prioritise Features';
    button.title = 'Open Priority Planner';
    button.addEventListener('click', event => { event.stopPropagation(); openPlanner(); });
    const left = requirementHead.querySelector('div') || requirementHead;
    left.appendChild(button);
  }

  function syncCards() {
    const app = readAppState();
    const scores = readScores();
    const ranks = rankMap(app.features || [], scores);
    const requirementHead = [...document.querySelectorAll('.col-head')].find(head => head.querySelector('b')?.textContent?.trim() === 'Requirement Planning');
    const column = requirementHead?.closest('.board-col');
    if (!column) return;
    for (const card of column.querySelectorAll('.feature-card')) {
      const title = card.querySelector('.card-title')?.textContent?.trim();
      if (!title) continue;
      const feature = (app.features || []).find(f => String(f.feature_name || '').trim() === title);
      if (!feature) continue;
      card.style.position = 'relative';
      card.style.paddingBottom = '34px';
      let badge = card.querySelector('.priority-card-badge');
      if (!badge) {
        badge = document.createElement('button');
        badge.type = 'button'; badge.className = 'priority-card-badge';
        badge.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openPlanner(feature.id); });
        card.appendChild(badge);
      }
      badge.textContent = scoreLabel(feature, scores, ranks);
      badge.classList.toggle('unscored', wsjf(scores[feature.id]) === null);
    }
  }

  function relocateBulkButton() {
    const bulkButton = document.getElementById('bulk-add-features-button');
    if (!bulkButton) return;
    const deliveryPlanVisible = [...document.querySelectorAll('h1')].some(h => h.textContent.trim() === 'Stage-by-stage sprint planning');
    if (!deliveryPlanVisible) return;
    const addButton = [...document.querySelectorAll('button')].find(b => /^\+?\s*Add Feature$/i.test(b.textContent.trim()));
    if (!addButton || addButton === bulkButton) return;
    if (addButton.nextElementSibling !== bulkButton) addButton.insertAdjacentElement('afterend', bulkButton);
  }

  let syncTimer = null;
  function sync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      ensureStyles();
      ensureOpenButton();
      syncCards();
      relocateBulkButton();
    }, 60);
  }

  function start() {
    ensureStyles();
    bindPlannerEvents();
    const existingScores = readScores();
    writeScores(existingScores);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
