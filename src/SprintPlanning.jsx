
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
            allocationIds: [],
            statuses: [],
          });
        }
        const group = groups.get(key);
        group.allocationIds.push(allocation.id);
        group.statuses.push(outcomeStatus(allocation));
      });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      status: rowStatus(group.statuses),
    }));
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
  }, [sprint, allocations, featureById, sprintPlanningDisplay]);

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

  function toneFor(row) {
    if (row.status === "not_achieved") return "not-achieved";
    if (row.status === "achieved" && row.isGoal) return "goal-achieved";
    if (row.status === "achieved" && !row.isGoal) return "stretch-achieved";
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
      (row) => !row.isGoal && row.status === "achieved",
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

  const completedFeatures = useMemo(() => {
    return features
      .map((feature) => {
        const finalStage = getFinalStage(feature);
        const finalIndex = stageIndex(finalStage);
        const completed = allocations
          .filter(
            (allocation) =>
              allocation.featureId === feature.id &&
              outcomeStatus(allocation) === "achieved" &&
              stageIndex(allocation.stage) >= finalIndex,
          )
          .sort((a, b) => normSprint(a.sprint).localeCompare(normSprint(b.sprint)));
        if (!completed.length) return null;
        return { feature, sprintId: normSprint(completed[0].sprint) };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.sprintId.localeCompare(b.sprintId) ||
          a.feature.feature_name.localeCompare(b.feature.feature_name),
      );
  }, [features, allocations, getFinalStage]);

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
          <div className="sprint-planning-table-wrap">
            <table className="compact-table sprint-planning-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Show</th>
                  <th>Feature</th>
                  <th>Stage</th>
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
                  <tr><td colSpan="5">No sprint planning rows to show.</td></tr>
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
            <h3>Features completed</h3>
            <p className="muted">A feature appears when its final planned stage is marked achieved.</p>
          </div>
          <span className="mini-count">{completedFeatures.length}</span>
        </div>
        <div className="sprint-planning-table-wrap">
          <table className="compact-table">
            <thead><tr><th>Name</th><th>Sprint</th><th>Close in DevOps</th></tr></thead>
            <tbody>
              {completedFeatures.map(({ feature, sprintId }) => (
                <tr key={feature.id}>
                  <td>{feature.feature_name}</td>
                  <td>{sprintId}</td>
                  <td>
                    <input
                      type="date"
                      value={completedFeatureClosures[feature.id] || ""}
                      onChange={(event) =>
                        setCompletedFeatureClosures((current) => ({
                          ...current,
                          [feature.id]: event.target.value,
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {!completedFeatures.length && (
                <tr><td colSpan="3">No completed features yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
