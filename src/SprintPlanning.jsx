
import React, { useEffect, useMemo, useState } from "react";

const STAGE_ORDER = [
  "Requirement",
  "Tech Feasibility",
  "Deployment",
  "Build",
  "Build Support",
  "SIT Prep",
  "SIT",
  "SIT Support",
  "BA Sign off prep",
  "BA Sign off",
  "BA sign off Support",
  "SIT+BA Sign off Support",
  "UAT Prep",
  "UAT",
  "UAT Dev Support",
];

function normSprint(value) {
  return String(value || "").trim().toUpperCase();
}

function normText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function keyText(value) {
  return normText(value).toLowerCase();
}

function stageIndex(stage) {
  const value = normText(stage).toLowerCase();
  const index = STAGE_ORDER.findIndex((item) => item.toLowerCase() === value);
  if (index >= 0) return index;
  if (value.includes("uat")) return 13;
  if (value.includes("ba") && value.includes("sign")) return 9;
  if (value.includes("sit")) return 6;
  if (value.includes("deploy")) return 2;
  if (value.includes("build")) return 3;
  return 0;
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function outcomeStatus(allocation) {
  return allocation.achievementStatus || "pending";
}

function rowStatus(statuses) {
  if (statuses.includes("not_achieved")) return "not_achieved";
  if (statuses.length && statuses.every((value) => value === "achieved"))
    return "achieved";
  return "pending";
}

export default function SprintPlanning({
  allocations,
  setAllocations,
  customSprints,
  sprintDates,
  features,
  getFinalStage,
  sprintPlanningMeta,
  setSprintPlanningMeta,
  sprintPlanningDisplay,
  setSprintPlanningDisplay,
  completedFeatureClosures,
  setCompletedFeatureClosures,
}) {
  const featureById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features],
  );

  const sprintOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...customSprints, ...allocations.map((row) => row.sprint)]
            .map(normSprint)
            .filter(Boolean),
        ),
      ).sort(),
    [customSprints, allocations],
  );

  const dateBySprint = useMemo(() => {
    const map = new Map();
    sprintDates.forEach((row) => map.set(normSprint(row.sprint), row));
    return map;
  }, [sprintDates]);

  const lastFinishedSprint = useMemo(() => {
    const now = new Date();
    const candidates = sprintOptions
      .map((sprintId) => {
        const endValue = dateBySprint.get(sprintId)?.endDate;
        const end = endValue
          ? new Date(String(endValue).slice(0, 10) + "T23:59:59")
          : null;
        return { sprintId, end };
      })
      .filter((item) => item.end && item.end < now)
      .sort((a, b) => b.end - a.end);
    return candidates[0]?.sprintId || sprintOptions[0] || "";
  }, [sprintOptions, dateBySprint]);

  const quarterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          sprintOptions
            .map((sprintId) => sprintId.match(/^(\d{2}Q\d)/)?.[1])
            .filter(Boolean),
        ),
      ).sort(),
    [sprintOptions],
  );

  const [sprint, setSprint] = useState(lastFinishedSprint);
  const [quarter, setQuarter] = useState(
    lastFinishedSprint.match(/^(\d{2}Q\d)/)?.[1] || "26Q2",
  );
  const [showHidden, setShowHidden] = useState(false);
  const [stretchFeatureId, setStretchFeatureId] = useState("");
  const [stretchStage, setStretchStage] = useState("UAT");

  useEffect(() => {
    if (!sprintOptions.includes(sprint)) setSprint(lastFinishedSprint);
  }, [sprintOptions, sprint, lastFinishedSprint]);

  useEffect(() => {
    const sprintQuarter = sprint.match(/^(\d{2}Q\d)/)?.[1];
    if (sprintQuarter) setQuarter(sprintQuarter);
  }, [sprint]);

  function allocationFeature(allocation) {
    return featureById.get(allocation.featureId) || null;
  }

  function allocationFeatureName(allocation) {
    return (
      allocationFeature(allocation)?.feature_name ||
      allocation.actualFeatureName ||
      allocation.featureName ||
      allocation.planningGroup ||
      allocation.workspaceName ||
      "Planning item"
    );
  }

  function allocationWorkspace(allocation) {
    return (
      allocationFeature(allocation)?.workspace ||
      allocation.planningGroup ||
      allocation.workspace ||
      allocation.workspaceName ||
      "Unknown"
    );
  }

  function makeGroups(sprintId) {
    const groups = new Map();
    allocations
      .filter((allocation) => normSprint(allocation.sprint) === sprintId)
      .forEach((allocation) => {
        const featureName = allocationFeatureName(allocation);
        const workspace = allocationWorkspace(allocation);
        const stage = normText(allocation.stage || allocation.sourceStage || "Not set");
        const goal = Boolean(allocation.isStageComplete);
        const key = [
          keyText(featureName),
          keyText(workspace),
          keyText(stage),
          goal ? "goal" : "planned",
        ].join("||");
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            featureName,
            workspace,
            stage,
            isGoal: goal,
            isStretch: false,
            allocationIds: [],
            statuses: [],
          });
        }
        const group = groups.get(key);
        group.allocationIds.push(allocation.id);
        group.statuses.push(outcomeStatus(allocation));
        if (allocation.isUnplannedStretch) group.isStretch = true;
      });
    const goalOverrides = sprintPlanningMeta[sprintId]?.goalOverrides || {};
    const classificationOverrides =
      sprintPlanningMeta[sprintId]?.classificationOverrides || {};
    return Array.from(groups.values()).map((group) => {
      const legacyGoalOverride = Object.prototype.hasOwnProperty.call(
        goalOverrides,
        group.key,
      )
        ? !!goalOverrides[group.key]
        : null;
      const defaultClassification = group.isGoal
        ? "goal"
        : group.isStretch
          ? "stretch"
          : "other";
      const classification =
        classificationOverrides[group.key] ||
        (legacyGoalOverride === true
          ? "goal"
          : legacyGoalOverride === false
            ? "other"
            : defaultClassification);
      return {
        ...group,
        classification,
        isGoal: classification === "goal",
        isStretch: classification === "stretch",
        status: rowStatus(group.statuses),
      };
    });
  }

  const rows = useMemo(() => {
    return makeGroups(sprint)
      .map((row) => {
        const prefKey = [sprint, row.key].join("||");
        return {
          ...row,
          prefKey,
          displayMode: sprintPlanningDisplay[prefKey] || "feature",
        };
      })
      .sort(
        (a, b) =>
          a.workspace.localeCompare(b.workspace) ||
          a.featureName.localeCompare(b.featureName) ||
          stageIndex(a.stage) - stageIndex(b.stage),
      );
  }, [
    sprint,
    allocations,
    featureById,
    sprintPlanningDisplay,
    sprintPlanningMeta,
  ]);

  const visibleRows = rows.filter(
    (row) => showHidden || row.displayMode !== "hidden",
  );

  function setRowOutcome(row, status) {
    setAllocations((current) =>
      current.map((allocation) =>
        row.allocationIds.includes(allocation.id)
          ? { ...allocation, achievementStatus: status }
          : allocation,
      ),
    );
  }

  function setDisplay(row, displayMode) {
    setSprintPlanningDisplay((current) => ({
      ...current,
      [row.prefKey]: displayMode,
    }));
  }

  function setClassification(row, classification) {
    setSprintPlanningMeta((current) => ({
      ...current,
      [sprint]: {
        ...(current[sprint] || {}),
        classificationOverrides: {
          ...((current[sprint] || {}).classificationOverrides || {}),
          [row.key]: classification,
        },
      },
    }));
  }

  function addCompletedStretch() {
    const feature = featureById.get(stretchFeatureId);
    if (!feature || !sprint || !stretchStage) return;
    const alreadyExists = allocations.some(
      (allocation) =>
        allocation.featureId === feature.id &&
        normSprint(allocation.sprint) === normSprint(sprint) &&
        keyText(allocation.stage || allocation.sourceStage) === keyText(stretchStage),
    );
    if (alreadyExists) return;

    const allocationId =
      globalThis.crypto?.randomUUID?.() ||
      `stretch-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setAllocations((current) => [
      ...current,
      {
        id: allocationId,
        featureId: feature.id,
        featureIds: [feature.id],
        matchedFeatureIds: [feature.id],
        featureName: feature.feature_name,
        actualFeatureName: feature.feature_name,
        planningGroup: feature.workspace || feature.feature_name,
        workspace: feature.workspace || "",
        workspaceName: feature.workspace || "",
        stage: stretchStage,
        sourceStage: stretchStage,
        sprint,
        owner: "",
        days: 0,
        isStageComplete: false,
        achievementStatus: "achieved",
        isUnplannedStretch: true,
      },
    ]);
    setStretchFeatureId("");
  }

  function toneFor(row) {
    if (row.status === "not_achieved") return "not-achieved";
    if (row.status === "achieved" && row.isGoal) return "goal-achieved";
    if (row.status === "achieved" && row.isStretch) return "stretch-achieved";
    if (row.isGoal) return "goal-pending";
    return "planned-pending";
  }

  const quarterSprints = sprintOptions.filter((item) => item.startsWith(quarter));
  const sprintStats = quarterSprints.map((sprintId) => {
    const grouped = makeGroups(sprintId);
    const totalGoals = grouped.filter((row) => row.isGoal).length;
    const goalsCompleted = grouped.filter(
      (row) => row.isGoal && row.status === "achieved",
    ).length;
    const stretch = grouped.filter(
      (row) => row.isStretch && row.status === "achieved",
    ).length;
    const counts = sprintPlanningMeta[sprintId]?.fistOfFive || {};
    const responses = [1, 2, 3, 4, 5].reduce(
      (sum, rating) => sum + Number(counts[rating] || 0),
      0,
    );
    const score = responses
      ? [1, 2, 3, 4, 5].reduce(
          (sum, rating) => sum + rating * Number(counts[rating] || 0),
          0,
        ) / responses
      : null;
    const dates = dateBySprint.get(sprintId) || {};
    return {
      sprintId,
      startDate: dates.startDate || "",
      endDate: dates.endDate || "",
      totalGoals,
      goalsCompleted,
      stretch,
      predictability: totalGoals
        ? Math.round((goalsCompleted / totalGoals) * 100)
        : null,
      responses,
      score,
    };
  });

  const selectedFist = sprintPlanningMeta[sprint]?.fistOfFive || {};

  function setFistResponse(rating, value) {
    setSprintPlanningMeta((current) => ({
      ...current,
      [sprint]: {
        ...(current[sprint] || {}),
        fistOfFive: {
          ...((current[sprint] || {}).fistOfFive || {}),
          [rating]: Math.max(0, Number(value || 0)),
        },
      },
    }));
  }

  const completedGroups = useMemo(() => {
    const completionByFeatureId = new Map();

    features.forEach((feature) => {
      const finalStage = getFinalStage(feature);
      const finalIndex = stageIndex(finalStage);
      const completed = allocations
        .filter(
          (allocation) =>
            allocation.featureId === feature.id &&
            outcomeStatus(allocation) === "achieved" &&
            stageIndex(allocation.stage) >= finalIndex,
        )
        .map((allocation) => normSprint(allocation.sprint))
        .filter(Boolean)
        .sort();
      if (completed.length) completionByFeatureId.set(feature.id, completed[0]);
    });

    const groups = new Map();
    features.forEach((feature) => {
      const groupName = normText(feature.workspace || feature.feature_name || "Unknown");
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(feature);
    });

    return Array.from(groups.entries())
      .map(([groupName, groupFeatures]) => {
        const completionSprints = groupFeatures
          .map((feature) => completionByFeatureId.get(feature.id))
          .filter(Boolean);
        if (
          completionSprints.length !== groupFeatures.length ||
          !completionSprints.length
        )
          return null;
        const sprintId = completionSprints.slice().sort().at(-1);
        if (!sprintId?.startsWith(quarter)) return null;
        return {
          groupName,
          sprintId,
          featureCount: groupFeatures.length,
          closureKey: `group:${keyText(groupName)}`,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.sprintId.localeCompare(b.sprintId) ||
          a.groupName.localeCompare(b.groupName),
      );
  }, [features, allocations, getFinalStage, quarter]);

  const selectedStat = sprintStats.find((item) => item.sprintId === sprint);

  return (
    <div className="dashboard sprint-planning-dashboard">
      <div className="dash-head">
        <div>
          <div className="eyebrow">Sprint Planning</div>
          <h1>Planning & predictability</h1>
        </div>
        <div className="sprint-planning-filters">
          <label>
            Quarter
            <select
              value={quarter}
              onChange={(event) => {
                const nextQuarter = event.target.value;
                setQuarter(nextQuarter);
                const nextSprint = sprintOptions
                  .filter((item) => item.startsWith(nextQuarter))
                  .at(-1);
                if (nextSprint) setSprint(nextSprint);
              }}
            >
              {quarterOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Sprint
            <select value={sprint} onChange={(event) => setSprint(event.target.value)}>
              {sprintOptions
                .filter((item) => item.startsWith(quarter))
                .map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="sprint-planning-grid">
        <div className="panel sprint-planning-work-panel">
          <div className="panel-top">
            <div>
              <h3>{sprint || "Sprint"} work</h3>
              <p className="muted">
                Yellow = goal · light green = goal achieved · dark green = stretch achieved · red = not achieved.
              </p>
            </div>
            <label className="show-hidden-toggle">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.target.checked)}
              />
              Show hidden
            </label>
          </div>
          <div className="sprint-planning-add-stretch">
            <b>Record unplanned completed work</b>
            <select
              value={stretchFeatureId}
              onChange={(event) => setStretchFeatureId(event.target.value)}
            >
              <option value="">Select feature</option>
              {[...features]
                .sort((a, b) =>
                  String(a.feature_name || "").localeCompare(
                    String(b.feature_name || ""),
                  ),
                )
                .map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.feature_name}
                  </option>
                ))}
            </select>
            <select
              value={stretchStage}
              onChange={(event) => setStretchStage(event.target.value)}
            >
              {STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              disabled={!stretchFeatureId || !sprint}
              onClick={addCompletedStretch}
            >
              Add completed stretch
            </button>
          </div>
          <div className="sprint-planning-table-wrap">
            <table className="compact-table sprint-planning-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Show</th>
                  <th>Feature</th>
                  <th>Stage</th>
                  <th>Type</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr
                    key={row.prefKey}
                    className={"sprint-planning-row " + toneFor(row) + (row.displayMode === "hidden" ? " hidden-row" : "")}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <select
                        className={"sprint-row-display " + row.displayMode}
                        value={row.displayMode}
                        onChange={(event) => setDisplay(row, event.target.value)}
                        title="F = feature, G = workspace/group, – = hide"
                      >
                        <option value="feature">F</option>
                        <option value="group">G</option>
                        <option value="hidden">–</option>
                      </select>
                    </td>
                    <td>
                      <b>{row.displayMode === "group" ? row.workspace : row.featureName}</b>
                      {row.displayMode === "feature" && row.workspace !== row.featureName && (
                        <small>{row.workspace}</small>
                      )}
                    </td>
                    <td>{row.stage}</td>
                    <td>
                      <select
                        className="sprint-row-classification"
                        value={row.classification}
                        onChange={(event) =>
                          setClassification(row, event.target.value)
                        }
                        title="Sprint reporting only. This does not change Delivery Plan expected completion."
                      >
                        <option value="goal">Goal</option>
                        <option value="stretch">Stretch</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td>
                      <div className="achievement-buttons">
                        <button
                          type="button"
                          className={row.status === "pending" ? "active" : ""}
                          onClick={() => setRowOutcome(row, "pending")}
                          title="Not confirmed yet"
                        >?</button>
                        <button
                          type="button"
                          className={row.status === "achieved" ? "active" : ""}
                          onClick={() => setRowOutcome(row, "achieved")}
                          title="Achieved"
                        >✓</button>
                        <button
                          type="button"
                          className={row.status === "not_achieved" ? "active" : ""}
                          onClick={() => setRowOutcome(row, "not_achieved")}
                          title="Not achieved"
                        >×</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleRows.length && (
                  <tr><td colSpan="6">No sprint planning rows to show.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sprint-planning-side">
          <div className="panel">
            <div className="panel-top">
              <div>
                <h3>Goals predictability</h3>
                <p className="muted">{quarter}</p>
              </div>
            </div>
            <div className="sprint-planning-table-wrap">
              <table className="compact-table predictability-table">
                <thead>
                  <tr>
                    <th>Sprint</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Fist of Five</th>
                    <th>Total Goals</th>
                    <th>Goals Completed</th>
                    <th>Stretch</th>
                    <th>Predictability</th>
                  </tr>
                </thead>
                <tbody>
                  {sprintStats.map((row) => (
                    <tr key={row.sprintId}>
                      <td><b>{row.sprintId}</b></td>
                      <td>{fmtDate(row.startDate)}</td>
                      <td>{fmtDate(row.endDate)}</td>
                      <td>{row.score == null ? "-" : row.score.toFixed(1)}</td>
                      <td>{row.totalGoals}</td>
                      <td>{row.goalsCompleted}</td>
                      <td>{row.stretch}</td>
                      <td>{row.predictability == null ? "-" : row.predictability + "%"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel fist-five-panel">
            <div className="panel-top">
              <div>
                <h3>Fist of Five</h3>
                <p className="muted">{sprint}</p>
              </div>
            </div>
            <table className="compact-table">
              <thead><tr><th>Rating</th><th># Responses</th></tr></thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <tr key={rating}>
                    <td>{rating}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={Number(selectedFist[rating] || 0)}
                        onChange={(event) => setFistResponse(rating, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="fist-five-summary">
              <span>Average <b>{selectedStat?.score == null ? "-" : selectedStat.score.toFixed(1)}</b></span>
              <span>Responses <b>{selectedStat?.responses || 0}</b></span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel completed-features-panel">
        <div className="panel-top">
          <div>
            <h3>Groups completed</h3>
            <p className="muted">
              All groups completed in {quarter}, regardless of which sprint is selected above.
            </p>
          </div>
          <span className="mini-count">{completedGroups.length}</span>
        </div>
        <div className="sprint-planning-table-wrap">
          <table className="compact-table">
            <thead><tr><th>Group</th><th>Completed sprint</th><th>Close in DevOps</th></tr></thead>
            <tbody>
              {completedGroups.map(({ groupName, sprintId, closureKey }) => (
                <tr key={closureKey}>
                  <td>{groupName}</td>
                  <td>{sprintId}</td>
                  <td>
                    <input
                      type="date"
                      value={completedFeatureClosures[closureKey] || ""}
                      onChange={(event) =>
                        setCompletedFeatureClosures((current) => ({
                          ...current,
                          [closureKey]: event.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {!completedGroups.length && (
                <tr><td colSpan="3">No groups completed in {quarter} yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
