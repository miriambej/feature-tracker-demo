
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

const SPRINT_STAGE_OPTIONS = [
  "Requirement",
  "Deployment",
  "Build",
  "SIT",
  "BA Sign off",
  "UAT",
];

function sprintStage(stage) {
  const value = normText(stage).toLowerCase();
  if (value === "requirement" || value === "tech feasibility")
    return "Requirement";
  if (value.includes("deploy")) return "Deployment";
  if (value.includes("build")) return "Build";
  if (value.includes("sit") && value.includes("ba") && value.includes("sign"))
    return "BA Sign off";
  if (value.includes("sit")) return "SIT";
  if (value.includes("ba") && value.includes("sign")) return "BA Sign off";
  if (value.includes("uat")) return "UAT";
  return normText(stage || "Not set");
}

function normSprint(value) {
  return String(value || "").trim().toUpperCase();
}

function normText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function keyText(value) {
  return normText(value).toLowerCase();
}

function devOpsUserStoryUrl(userStoryId) {
  const id = normText(userStoryId);
  return id
    ? `https://educationbi.visualstudio.com/Skilling%20for%20Recovery/_workitems/edit/${id}`
    : "";
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
  completedFeatureComments,
  setCompletedFeatureComments,
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

  const defaultSprint = useMemo(() => {
    const now = new Date();
    const dated = sprintOptions
      .map((sprintId) => {
        const dates = dateBySprint.get(sprintId) || {};
        const start = dates.startDate
          ? new Date(String(dates.startDate).slice(0, 10) + "T00:00:00")
          : null;
        const end = dates.endDate
          ? new Date(String(dates.endDate).slice(0, 10) + "T23:59:59")
          : null;
        return { sprintId, start, end };
      });

    const current = dated.find(
      (item) =>
        item.start &&
        item.end &&
        item.start <= now &&
        now <= item.end,
    );
    if (current) return current.sprintId;

    const latestFinished = dated
      .filter((item) => item.end && item.end < now)
      .sort((a, b) => b.end - a.end)[0];
    if (latestFinished) return latestFinished.sprintId;

    const nextUpcoming = dated
      .filter((item) => item.start && item.start > now)
      .sort((a, b) => a.start - b.start)[0];
    return nextUpcoming?.sprintId || sprintOptions[0] || "";
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

  const [sprint, setSprint] = useState(defaultSprint);
  const [quarter, setQuarter] = useState(
    defaultSprint.match(/^(\d{2}Q\d)/)?.[1] || "26Q2",
  );
  const [showHidden, setShowHidden] = useState(false);
  const [stretchFeatureId, setStretchFeatureId] = useState("");
  const [stretchSearch, setStretchSearch] = useState("");
  const [stretchStage, setStretchStage] = useState("UAT");
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    if (!sprintOptions.includes(sprint)) setSprint(defaultSprint);
  }, [sprintOptions, sprint, defaultSprint]);

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
        const rawStage = normText(
          allocation.stage || allocation.sourceStage || "Not set",
        );
        const stage = sprintStage(rawStage);
        const goal = Boolean(allocation.isStageComplete);
        const key = [
          keyText(featureName),
          keyText(workspace),
          keyText(stage),
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
            owners: [],
            sourceStages: [],
          });
        }
        const group = groups.get(key);
        group.allocationIds.push(allocation.id);
        group.statuses.push(outcomeStatus(allocation));
        group.isGoal = group.isGoal || goal;
        if (allocation.isUnplannedStretch) group.isStretch = true;
        const owner = normText(allocation.owner);
        if (owner && !group.owners.includes(owner)) group.owners.push(owner);
        if (rawStage && !group.sourceStages.includes(rawStage))
          group.sourceStages.push(rawStage);
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

  const openFeaturesForStretch = useMemo(() => {
    const search = keyText(stretchSearch);
    return features
      .filter((feature) => {
        const finalStage = getFinalStage(feature);
        const finalIndex = stageIndex(finalStage);
        const finalStageCompleted = allocations.some(
          (allocation) =>
            allocation.featureId === feature.id &&
            outcomeStatus(allocation) === "achieved" &&
            stageIndex(allocation.stage) >= finalIndex,
        );
        const explicitlyClosed =
          feature.status === "uat_done" ||
          feature.status === "closed" ||
          feature.status === "completed";
        if (finalStageCompleted || explicitlyClosed) return false;

        if (!search) return true;
        return (
          keyText(feature.feature_name).includes(search) ||
          keyText(feature.workspace).includes(search)
        );
      })
      .sort((a, b) =>
        String(a.feature_name || "").localeCompare(
          String(b.feature_name || ""),
        ),
      );
  }, [features, allocations, getFinalStage, stretchSearch]);

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

  function showTooltip(event, heading, badge, entries) {
    const items = (Array.isArray(entries) ? entries : [entries])
      .map((entry) => normText(entry))
      .filter(Boolean);
    if (!items.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      heading,
      badge,
      items,
      left: Math.min(
        window.innerWidth - 170,
        Math.max(170, rect.left + rect.width / 2),
      ),
      top: Math.max(12, rect.top - 10),
    });
  }

  function addCompletedStretch() {
    const feature = featureById.get(stretchFeatureId);
    if (!feature || !sprint || !stretchStage) return;
    const alreadyExists = allocations.some(
      (allocation) =>
        allocation.featureId === feature.id &&
        normSprint(allocation.sprint) === normSprint(sprint) &&
        keyText(sprintStage(allocation.stage || allocation.sourceStage)) ===
          keyText(stretchStage),
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
    setStretchSearch("");
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

  const completedFeatures = useMemo(() => {
    const featureIsClosed = (feature) =>
      ["uat_done", "closed", "completed"].includes(
        keyText(feature?.status).replace(/\s+/g, "_"),
      );

    const finalAchievementSprintByFeatureId = new Map();

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

      if (completed.length)
        finalAchievementSprintByFeatureId.set(feature.id, completed.at(-1));
    });

    const rows = [];

    const groups = new Map();
    features.forEach((feature) => {
      const groupName = normText(
        feature.workspace || feature.feature_name || "Unknown",
      );
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(feature);
    });

    Array.from(groups.entries()).forEach(([groupName, groupFeatures]) => {
      const everyFeatureComplete = groupFeatures.every(
        (feature) =>
          featureIsClosed(feature) ||
          finalAchievementSprintByFeatureId.has(feature.id),
      );
      if (!everyFeatureComplete) return;

      const quarterCompletionSprints = groupFeatures
        .map((feature) => finalAchievementSprintByFeatureId.get(feature.id))
        .filter((sprintId) => sprintId?.startsWith(quarter))
        .sort();

      if (!quarterCompletionSprints.length) return;

      const userStoryIds = Array.from(
        new Set(
          groupFeatures
            .map((feature) =>
              normText(feature.parentUserStoryId || feature.devOpsId),
            )
            .filter(Boolean),
        ),
      );
      rows.push({
        name: groupName,
        sprintId: quarterCompletionSprints.at(-1),
        featureCount: groupFeatures.length,
        userStoryIds,
        closureKey: `group:${keyText(groupName)}`,
      });
    });

    const standaloneByName = new Map();
    const standaloneAllocations = allocations.filter(
      (allocation) =>
        !allocation.featureId &&
        !allocation.featureIds?.length &&
        !allocation.matchedFeatureIds?.length,
    );

    const standaloneGroups = new Map();
    standaloneAllocations.forEach((allocation) => {
      const name = normText(
        allocation.actualFeatureName ||
          allocation.featureName ||
          allocation.planningGroup ||
          allocation.workspaceName ||
          allocation.workspace ||
          "Planning item",
      );
      const key = keyText(name);
      if (!standaloneGroups.has(key))
        standaloneGroups.set(key, { name, allocations: [] });
      standaloneGroups.get(key).allocations.push(allocation);
    });

    standaloneGroups.forEach(({ name, allocations: itemAllocations }, key) => {
      const achievedStages = itemAllocations
        .filter((allocation) => outcomeStatus(allocation) === "achieved")
        .map((allocation) => ({
          sprintId: normSprint(allocation.sprint),
          stage: sprintStage(allocation.stage || allocation.sourceStage),
        }))
        .filter((row) => row.sprintId?.startsWith(quarter));

      if (!achievedStages.length) return;

      const highestAchievedIndex = Math.max(
        ...achievedStages.map((row) => stageIndex(row.stage)),
      );
      const inferredFinalIndex = Math.max(
        ...itemAllocations.map((allocation) =>
          stageIndex(sprintStage(allocation.stage || allocation.sourceStage)),
        ),
      );

      if (highestAchievedIndex < inferredFinalIndex) return;

      const sprintId = achievedStages
        .filter((row) => stageIndex(row.stage) >= inferredFinalIndex)
        .map((row) => row.sprintId)
        .sort()
        .at(-1);

      if (!sprintId) return;

      const userStoryIds = Array.from(
        new Set(
          itemAllocations
            .map((allocation) =>
              normText(allocation.parentUserStoryId || allocation.devOpsId),
            )
            .filter(Boolean),
        ),
      );
      standaloneByName.set(key, {
        name,
        sprintId,
        featureCount: 1,
        userStoryIds,
        closureKey: `standalone:${key}`,
      });
    });

    standaloneByName.forEach((row) => rows.push(row));

    return rows
      .filter(
        (row, index, all) =>
          all.findIndex(
            (candidate) =>
              keyText(candidate.name) === keyText(row.name) &&
              candidate.sprintId === row.sprintId,
          ) === index,
      )
      .sort(
        (a, b) =>
          a.sprintId.localeCompare(b.sprintId) ||
          a.name.localeCompare(b.name),
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
            <div className="sprint-stretch-feature-picker">
              <input
                type="search"
                value={stretchSearch}
                onChange={(event) => {
                  setStretchSearch(event.target.value);
                  setStretchFeatureId("");
                }}
                placeholder="Search feature or group..."
                aria-label="Search open features"
              />
              <select
                value={stretchFeatureId}
                onChange={(event) => setStretchFeatureId(event.target.value)}
              >
                <option value="">
                  {openFeaturesForStretch.length
                    ? `Select open feature (${openFeaturesForStretch.length})`
                    : "No open features found"}
                </option>
                {openFeaturesForStretch.map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.feature_name}
                    {feature.workspace &&
                    feature.workspace !== feature.feature_name
                      ? ` — ${feature.workspace}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <select
              value={stretchStage}
              onChange={(event) => setStretchStage(event.target.value)}
            >
              {SPRINT_STAGE_OPTIONS.map((stage) => (
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
                        aria-label="Show feature, group, or hide row"
                        title="F = feature, G = group, – = hide"
                      >
                        <option value="feature">F</option>
                        <option value="group">G</option>
                        <option value="hidden">–</option>
                      </select>
                    </td>
                    <td
                      className="capacity-hover-target"
                      tabIndex="0"
                      onMouseEnter={(event) =>
                        showTooltip(
                          event,
                          "Worked on by",
                          row.stage,
                          row.owners.length
                            ? row.owners
                            : ["No person recorded for this work"],
                        )
                      }
                      onMouseLeave={() => setTooltip(null)}
                      onFocus={(event) =>
                        showTooltip(
                          event,
                          "Worked on by",
                          row.stage,
                          row.owners.length
                            ? row.owners
                            : ["No person recorded for this work"],
                        )
                      }
                      onBlur={() => setTooltip(null)}
                    >
                      <span className="sprint-row-name">
                        {row.displayMode === "group" ? row.workspace : row.featureName}
                      </span>
                      {row.displayMode === "feature" && row.workspace !== row.featureName && (
                        <small>{row.workspace}</small>
                      )}
                    </td>
                    <td
                      className="capacity-hover-target"
                      tabIndex="0"
                      onMouseEnter={(event) =>
                        showTooltip(
                          event,
                          "Sprint stage",
                          row.stage,
                          row.sourceStages.length
                            ? row.sourceStages
                            : [row.stage],
                        )
                      }
                      onMouseLeave={() => setTooltip(null)}
                      onFocus={(event) =>
                        showTooltip(
                          event,
                          "Sprint stage",
                          row.stage,
                          row.sourceStages.length
                            ? row.sourceStages
                            : [row.stage],
                        )
                      }
                      onBlur={() => setTooltip(null)}
                    >
                      {row.stage}
                    </td>
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

      {tooltip && (
        <div
          className="modern-capacity-tooltip"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div className="modern-tooltip-heading">
            <b>{tooltip.heading}</b>
            <span>{tooltip.badge}</span>
          </div>
          <div className="modern-tooltip-list">
            {tooltip.items.map((entry, index) => (
              <div className="modern-tooltip-body" key={`${entry}-${index}`}>
                <span className="modern-tooltip-dot" />
                <span>{entry}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel completed-features-panel">
        <div className="panel-top">
          <div>
            <h3>Features completed</h3>
            <p className="muted">
              All completed features/groups in {quarter}, regardless of which sprint is selected above.
            </p>
          </div>
          <span className="mini-count">{completedFeatures.length}</span>
        </div>
        <div className="sprint-planning-table-wrap">
          <table className="compact-table">
            <thead><tr><th>Feature</th><th>Completed sprint</th><th>Close in DevOps</th><th>Comments</th></tr></thead>
            <tbody>
              {completedFeatures.map(
                ({ name, sprintId, closureKey, userStoryIds = [] }) => (
                <tr
                  key={closureKey}
                  className={
                    completedFeatureClosures[closureKey]
                      ? ""
                      : "completed-feature-needs-action"
                  }
                >
                  <td>
                    {userStoryIds.length === 1 ? (
                      <a
                        className="completed-feature-link"
                        href={devOpsUserStoryUrl(userStoryIds[0])}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open User Story ${userStoryIds[0]} in Azure DevOps`}
                      >
                        {name}
                      </a>
                    ) : (
                      <>
                        <span>{name}</span>
                        {userStoryIds.length > 1 && (
                          <div className="completed-feature-story-links">
                            {userStoryIds.map((userStoryId) => (
                              <a
                                key={userStoryId}
                                href={devOpsUserStoryUrl(userStoryId)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                US {userStoryId}
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td>{sprintId}</td>
                  <td
                    className={
                      completedFeatureClosures[closureKey]
                        ? ""
                        : "completed-feature-close-missing"
                    }
                  >
                    <input
                      type="date"
                      value={completedFeatureClosures[closureKey] || ""}
                      onChange={(event) =>
                        setCompletedFeatureClosures((current) => ({
                          ...current,
                          [closureKey]: event.target.value,
                        }))
                      }
                      aria-label={`DevOps closure date for ${name}`}
                    />
                    {!completedFeatureClosures[closureKey] && (
                      <small className="completed-feature-action-label">
                        Action needed
                      </small>
                    )}
                  </td>
                  <td>
                    <input
                      className="completed-feature-comment"
                      type="text"
                      value={completedFeatureComments?.[closureKey] || ""}
                      onChange={(event) =>
                        setCompletedFeatureComments((current) => ({
                          ...(current || {}),
                          [closureKey]: event.target.value,
                        }))
                      }
                      placeholder="Why not closed / action needed"
                      aria-label={`Comments for ${name}`}
                    />
                  </td>
                </tr>
              ))}
              {!completedFeatures.length && (
                <tr><td colSpan="4">No completed features in {quarter} yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
