const STORAGE_KEY = "selfSupportAppTrialStateV2";
const DEFAULT_MINUTES = 30;
const TASK_NAME_NEW = "__new__";
const MINUTES_OTHER = "other";
const MINUTE_OPTIONS = [10, 20, 30, 40, 60];

const app = document.getElementById("app");
const todayLabel = document.getElementById("todayLabel");

let tickTimer = null;

const state = loadState();
render();

function getTodayKeyJst() {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = fmt.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year").value;
  const month = parts.find((part) => part.type === "month").value;
  const day = parts.find((part) => part.type === "day").value;
  return `${year}-${month}-${day}`;
}

function getTodayDisplayJst() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());
}

function createDefaultPlanTimes() {
  return {
    wakeUp: "06:30",
    departure: "07:30",
    returnHome: "18:30",
    studyStart: "19:00"
  };
}

function createPlanningForm() {
  return {
    mode: "add",
    targetId: null,
    taskNameChoice: TASK_NAME_NEW,
    customTaskName: "",
    minutesChoice: String(DEFAULT_MINUTES),
    customMinutes: "",
    content: ""
  };
}

function createRunningState() {
  return {
    taskId: null,
    startedAt: null,
    baseSeconds: 0,
    isPaused: false,
    confirmingComplete: false
  };
}

function createReviewState() {
  return {
    pendingIds: [],
    index: 0,
    pendingAction: null,
    draftMemo: ""
  };
}

function createInitialState(dateKey, tasks = []) {
  return {
    dateKey,
    phase: "planning",
    navHistory: [],
    homeReturnPhase: "planning",
    planFor: "tomorrow",
    planTimes: createDefaultPlanTimes(),
    tasks,
    planningForm: createPlanningForm(),
    taskNameStats: [],
    confirmedPlan: null,
    running: createRunningState(),
    review: createReviewState(),
    goPressedAt: null
  };
}

function createTask(name, plannedMinutes, content) {
  return {
    id: crypto.randomUUID(),
    name,
    plannedMinutes,
    content,
    status: "pending",
    actualSeconds: null,
    memo: "",
    closeAction: ""
  };
}

function buildCarryoverTasks(previousState) {
  if (!previousState || !Array.isArray(previousState.tasks)) {
    return [];
  }

  return previousState.tasks
    .filter((task) => task && task.status === "deferred")
    .map((task) => createTask(
      String(task.name || "").trim(),
      sanitizeMinutes(task.plannedMinutes),
      String(task.content || "").trim()
    ));
}

function normalizeTask(rawTask) {
  return {
    id: rawTask.id || crypto.randomUUID(),
    name: String(rawTask.name || ""),
    plannedMinutes: sanitizeMinutes(rawTask.plannedMinutes || DEFAULT_MINUTES),
    content: String(rawTask.content || ""),
    status: ["pending", "done", "deferred", "discarded"].includes(rawTask.status) ? rawTask.status : "pending",
    actualSeconds: typeof rawTask.actualSeconds === "number" ? rawTask.actualSeconds : null,
    memo: String(rawTask.memo || ""),
    closeAction: String(rawTask.closeAction || "")
  };
}

function normalizeTaskNameStats(rawStats) {
  if (!Array.isArray(rawStats)) {
    return [];
  }

  return rawStats
    .filter((item) => item && typeof item.name === "string" && item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      count: Math.max(0, Number(item.count) || 0),
      lastUsedAt: typeof item.lastUsedAt === "number" ? item.lastUsedAt : 0
    }));
}

function loadState() {
  const todayKey = getTodayKeyJst();
  todayLabel.textContent = `本日: ${getTodayDisplayJst()}`;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState(todayKey);
    }

    const parsed = JSON.parse(raw);
    if (!parsed) {
      return createInitialState(todayKey);
    }

    if (parsed.dateKey !== todayKey) {
      const resetState = createInitialState(todayKey, buildCarryoverTasks(parsed));
      resetState.taskNameStats = normalizeTaskNameStats(parsed.taskNameStats);
      return resetState;
    }

    const safeState = {
      ...createInitialState(todayKey),
      ...parsed,
      dateKey: todayKey
    };

    safeState.phase = ["home", "planning", "planConfirm", "planReport", "execution", "review", "result"].includes(safeState.phase)
      ? safeState.phase
      : "planning";
    safeState.navHistory = Array.isArray(safeState.navHistory) ? safeState.navHistory : [];
    safeState.homeReturnPhase = ["planning", "planConfirm", "planReport", "execution", "review", "result"].includes(safeState.homeReturnPhase)
      ? safeState.homeReturnPhase
      : "planning";
    safeState.planFor = safeState.planFor === "today" ? "today" : "tomorrow";
    safeState.planTimes = {
      ...createDefaultPlanTimes(),
      ...(safeState.planTimes || {})
    };
    safeState.tasks = Array.isArray(safeState.tasks) ? safeState.tasks.map(normalizeTask) : [];
    safeState.planningForm = normalizePlanningForm(safeState.planningForm);
    safeState.taskNameStats = normalizeTaskNameStats(safeState.taskNameStats);
    safeState.running = {
      ...createRunningState(),
      ...(safeState.running || {})
    };
    safeState.review = {
      ...createReviewState(),
      ...(safeState.review || {})
    };
    safeState.confirmedPlan = normalizeConfirmedPlan(safeState.confirmedPlan);

    return safeState;
  } catch (error) {
    return createInitialState(todayKey);
  }
}

function normalizePlanningForm(rawForm) {
  const base = {
    ...createPlanningForm(),
    ...(rawForm || {})
  };

  base.mode = base.mode === "edit" ? "edit" : "add";
  base.targetId = base.targetId || null;
  base.taskNameChoice = typeof base.taskNameChoice === "string" ? base.taskNameChoice : TASK_NAME_NEW;
  base.customTaskName = String(base.customTaskName || "");
  base.content = String(base.content || "");
  base.minutesChoice = typeof base.minutesChoice === "string" ? base.minutesChoice : String(DEFAULT_MINUTES);
  base.customMinutes = String(base.customMinutes || "");
  return base;
}

function normalizeConfirmedPlan(rawPlan) {
  if (!rawPlan) {
    return null;
  }

  return {
    planFor: rawPlan.planFor === "today" ? "today" : "tomorrow",
    planTimes: {
      ...createDefaultPlanTimes(),
      ...(rawPlan.planTimes || {})
    },
    tasks: Array.isArray(rawPlan.tasks) ? rawPlan.tasks.map(normalizeTask) : [],
    totalPlanned: sanitizeMinutesOrZero(rawPlan.totalPlanned),
    reportText: String(rawPlan.reportText || ""),
    confirmedAt: typeof rawPlan.confirmedAt === "number" ? rawPlan.confirmedAt : 0
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  clearTickTimer();

  if (state.phase === "home") {
    renderHome();
    return;
  }
  if (state.phase === "planning") {
    renderPlanning();
    return;
  }
  if (state.phase === "planConfirm") {
    renderPlanConfirm();
    return;
  }
  if (state.phase === "planReport") {
    renderPlanReport();
    return;
  }
  if (state.phase === "execution") {
    renderExecution();
    return;
  }
  if (state.phase === "review") {
    renderReview();
    return;
  }
  renderResult();
}

function renderHome() {
  const counts = getCounts();
  const runningTask = getRunningTask();
  const homeActions = [];

  if (runningTask && state.running.isPaused) {
    homeActions.push(`
      <div class="task-card paused-card">
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>${secondsToMinutes(getRunningElapsedSeconds())}分で中断中</p>
        <div class="btn-row compact-stack">
          <button id="resumePausedBtn" class="btn-main" type="button">再開</button>
        </div>
      </div>
    `);
  } else if (runningTask) {
    homeActions.push(`
      <div class="task-card paused-card">
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>実行中: ${getRunningElapsedSeconds()}秒</p>
        <div class="btn-row compact-stack">
          <button id="returnExecutionBtn" class="btn-main" type="button">実行画面へ戻る</button>
        </div>
      </div>
    `);
  } else if (state.goPressedAt) {
    homeActions.push(`
      <div class="btn-row compact-stack">
        <button id="resumeExecutionBtn" class="btn-main" type="button">タスク実行へ戻る</button>
      </div>
    `);
  }

  renderScreen(`
    <h2>ホーム</h2>
    <p class="helper">現在の予定と進みを確認できます。</p>

    <div class="summary">
      <p>予定を作る日: ${state.planFor === "today" ? "今日" : "明日"}</p>
      <p>起床: ${formatTimeForDisplay(state.planTimes.wakeUp)}</p>
      <p>出発: ${formatTimeForDisplay(state.planTimes.departure)}</p>
      <p>帰宅: ${formatTimeForDisplay(state.planTimes.returnHome)}</p>
      <p>勉強開始: ${formatTimeForDisplay(state.planTimes.studyStart)}</p>
      <p>予定タスク数: ${counts.total}件</p>
      <p>完了数: ${counts.done}件</p>
      <p>未完了数: ${counts.unfinished}件</p>
      <p>学習予定時間の合計: ${sumPlanned()}分</p>
    </div>

    ${homeActions.join("")}

    <div class="btn-row compact-stack">
      <button id="openPlanningBtn" class="btn-quiet" type="button">予定入力へ戻る</button>
    </div>
  `);

  document.getElementById("openPlanningBtn")?.addEventListener("click", () => changePhase("planning", false));
  document.getElementById("resumePausedBtn")?.addEventListener("click", resumePausedTask);
  document.getElementById("returnExecutionBtn")?.addEventListener("click", () => changePhase("execution", false));
  document.getElementById("resumeExecutionBtn")?.addEventListener("click", () => changePhase("execution", false));
}

function renderPlanning() {
  const editingTask = state.planningForm.mode === "edit" ? findTask(state.planningForm.targetId) : null;
  const showCustomName = state.planningForm.taskNameChoice === TASK_NAME_NEW;
  const showCustomMinutes = state.planningForm.minutesChoice === MINUTES_OTHER;

  renderScreen(`
    <h2>予定入力</h2>
    <p class="helper">時刻とタスクを入力してから最終確認へ進みます。</p>

    <p class="legend">予定を作る日</p>
    <div class="option-group compact-options">
      <label class="option-item">
        <input type="radio" name="planFor" value="tomorrow" ${state.planFor === "tomorrow" ? "checked" : ""} />
        <span>明日</span>
      </label>
      <label class="option-item">
        <input type="radio" name="planFor" value="today" ${state.planFor === "today" ? "checked" : ""} />
        <span>今日</span>
      </label>
    </div>

    <div class="time-grid">
      <div>
        <label for="wakeUpTime">起床時間</label>
        <input id="wakeUpTime" type="time" value="${state.planTimes.wakeUp}" />
      </div>
      <div>
        <label for="departureTime">出発時間</label>
        <input id="departureTime" type="time" value="${state.planTimes.departure}" />
      </div>
      <div>
        <label for="returnHomeTime">帰宅時間</label>
        <input id="returnHomeTime" type="time" value="${state.planTimes.returnHome}" />
      </div>
      <div>
        <label for="studyStartTime">勉強開始時間</label>
        <input id="studyStartTime" type="time" value="${state.planTimes.studyStart}" />
      </div>
    </div>

    <h3>登録済みタスク</h3>
    <ul id="taskList" class="task-list compact-task-list"></ul>

    <div class="task-form-box">
      <p class="helper">${editingTask ? "修正する内容を入力してください。" : "次の1件を入力してください。"}</p>
      <div class="form-stack">
        <div>
          <label for="taskNameSelect">タスク名</label>
          <select id="taskNameSelect">${renderTaskNameOptions()}</select>
        </div>
        <div id="customTaskNameWrap" class="${showCustomName ? "" : "hidden"}">
          <label for="customTaskName">新しいタスク名</label>
          <input id="customTaskName" type="text" value="${escapeHtml(state.planningForm.customTaskName)}" maxlength="40" placeholder="例: 原田先生" />
        </div>
        <div>
          <label for="minutesSelect">予定時間</label>
          <select id="minutesSelect">${renderMinuteOptions()}</select>
        </div>
        <div id="customMinutesWrap" class="${showCustomMinutes ? "" : "hidden"}">
          <label for="customMinutes">その他の分数</label>
          <input id="customMinutes" type="number" min="1" max="600" value="${escapeHtml(state.planningForm.customMinutes)}" />
        </div>
        <div>
          <label for="taskContent">内容</label>
          <input id="taskContent" type="text" value="${escapeHtml(state.planningForm.content)}" maxlength="120" placeholder="例: 新中学問題集 p54" />
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="saveTaskBtn" class="btn-sub" type="button">${editingTask ? "修正を保存" : "追加"}</button>
      </div>
    </div>

    <div class="summary" id="totalPlanned"></div>

    <div class="btn-row compact-stack">
      <button id="goBtn" class="btn-main" type="button">最終確認へ</button>
    </div>
  `);

  renderTaskListForPlanning();
  bindPlanningEvents();
}

function renderTaskListForPlanning() {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  if (state.tasks.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "task-card compact-empty";
    emptyItem.innerHTML = "<p>登録済みタスクはまだありません。</p>";
    list.appendChild(emptyItem);
    updateTotalPlanned();
    return;
  }

  state.tasks.forEach((task, index) => {
    const item = document.createElement("li");
    const isEditing = state.planningForm.mode === "edit" && state.planningForm.targetId === task.id;
    item.className = `task-card compact-task-row${isEditing ? " editing-row" : ""}`;
    item.innerHTML = `
      <div class="task-inline-text">${escapeHtml(task.name)} <span>${task.plannedMinutes}分</span></div>
      <div class="task-inline-actions">
        <button type="button" class="btn-mini btn-quiet" data-action="up" data-id="${task.id}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn-mini btn-quiet" data-action="down" data-id="${task.id}" ${index === state.tasks.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn-mini btn-sub" data-action="edit" data-id="${task.id}">修正</button>
        <button type="button" class="btn-mini btn-danger" data-action="delete" data-id="${task.id}">削除</button>
      </div>
    `;
    list.appendChild(item);
  });

  updateTotalPlanned();
}

function renderTaskNameOptions() {
  const options = [
    `<option value="${TASK_NAME_NEW}" ${state.planningForm.taskNameChoice === TASK_NAME_NEW ? "selected" : ""}>新しいタスク名を入力</option>`
  ];

  getSortedTaskNameOptions().forEach((option) => {
    options.push(`<option value="${escapeHtml(option.name)}" ${state.planningForm.taskNameChoice === option.name ? "selected" : ""}>${escapeHtml(option.name)}</option>`);
  });

  return options.join("");
}

function renderMinuteOptions() {
  const options = MINUTE_OPTIONS.map((minutes) => {
    const value = String(minutes);
    return `<option value="${value}" ${state.planningForm.minutesChoice === value ? "selected" : ""}>${minutes}分</option>`;
  });
  options.push(`<option value="${MINUTES_OTHER}" ${state.planningForm.minutesChoice === MINUTES_OTHER ? "selected" : ""}>その他</option>`);
  return options.join("");
}

function bindPlanningEvents() {
  document.querySelectorAll("input[name='planFor']").forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.planFor = event.target.value === "today" ? "today" : "tomorrow";
      saveState();
    });
  });

  bindPlanTimeInput("wakeUpTime", "wakeUp");
  bindPlanTimeInput("departureTime", "departure");
  bindPlanTimeInput("returnHomeTime", "returnHome");
  bindPlanTimeInput("studyStartTime", "studyStart");

  document.getElementById("taskNameSelect").addEventListener("change", (event) => {
    state.planningForm.taskNameChoice = event.target.value;
    saveState();
    renderPlanning();
  });
  document.getElementById("customTaskName")?.addEventListener("input", (event) => {
    state.planningForm.customTaskName = event.target.value;
    saveState();
  });

  document.getElementById("minutesSelect").addEventListener("change", (event) => {
    state.planningForm.minutesChoice = event.target.value;
    saveState();
    renderPlanning();
  });
  document.getElementById("customMinutes")?.addEventListener("input", (event) => {
    state.planningForm.customMinutes = event.target.value;
    saveState();
  });
  document.getElementById("taskContent").addEventListener("input", (event) => {
    state.planningForm.content = event.target.value;
    saveState();
  });

  document.getElementById("saveTaskBtn").addEventListener("click", savePlanningTask);

  document.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const taskId = button.dataset.id;
      const action = button.dataset.action;
      if (!taskId || !action) {
        return;
      }

      if (action === "up") {
        moveTask(taskId, -1);
      }
      if (action === "down") {
        moveTask(taskId, 1);
      }
      if (action === "edit") {
        loadTaskIntoForm(taskId);
      }
      if (action === "delete") {
        const task = findTask(taskId);
        if (!task) {
          return;
        }
        if (!window.confirm(`「${task.name}」を削除しますか？`)) {
          return;
        }
        state.tasks = state.tasks.filter((item) => item.id !== taskId);
        if (state.planningForm.targetId === taskId) {
          state.planningForm = createPlanningForm();
        }
      }

      saveState();
      renderPlanning();
    });
  });

  document.getElementById("goBtn").addEventListener("click", onGoToPlanConfirm);
}

function bindPlanTimeInput(elementId, key) {
  document.getElementById(elementId).addEventListener("input", (event) => {
    state.planTimes[key] = sanitizeTimeValue(event.target.value, createDefaultPlanTimes()[key]);
    saveState();
  });
}

function loadTaskIntoForm(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  const knownName = getSortedTaskNameOptions().find((option) => option.name === task.name);
  const knownMinutes = MINUTE_OPTIONS.includes(task.plannedMinutes);

  state.planningForm = {
    mode: "edit",
    targetId: task.id,
    taskNameChoice: knownName ? task.name : TASK_NAME_NEW,
    customTaskName: knownName ? "" : task.name,
    minutesChoice: knownMinutes ? String(task.plannedMinutes) : MINUTES_OTHER,
    customMinutes: knownMinutes ? "" : String(task.plannedMinutes),
    content: task.content
  };
}

function savePlanningTask() {
  const taskName = getPlanningFormTaskName();
  const plannedMinutes = getPlanningFormMinutes();
  const content = state.planningForm.content.trim();

  if (!taskName) {
    alert("タスク名を入力してください。");
    return;
  }
  if (!plannedMinutes) {
    alert("予定時間を入力してください。");
    return;
  }
  if (!content) {
    alert("内容を入力してください。");
    return;
  }

  if (state.planningForm.mode === "edit") {
    const task = findTask(state.planningForm.targetId);
    if (!task) {
      return;
    }
    task.name = taskName;
    task.plannedMinutes = plannedMinutes;
    task.content = content;
  } else {
    state.tasks.push(createTask(taskName, plannedMinutes, content));
  }

  state.planningForm = createPlanningForm();
  saveState();
  renderPlanning();
}

function onGoToPlanConfirm() {
  if (state.tasks.length === 0) {
    alert("タスクが0件のため、最終確認へ進めません。");
    return;
  }

  const invalidTask = state.tasks.find((task) => !task.name.trim() || !task.content.trim());
  if (invalidTask) {
    alert("タスク名と内容が入力されているか確認してください。");
    return;
  }

  changePhase("planConfirm");
}

function renderPlanConfirm() {
  renderScreen(`
    <h2>${state.planFor === "today" ? "今日" : "明日"}の予定を確認してください</h2>

    <div class="summary confirm-summary">
      <p>起床　　　　${formatTimeForDisplay(state.planTimes.wakeUp)}</p>
      <p>出発　　　　${formatTimeForDisplay(state.planTimes.departure)}</p>
      <p>帰宅　　　　${formatTimeForDisplay(state.planTimes.returnHome)}</p>
      <p>勉強開始　　${formatTimeForDisplay(state.planTimes.studyStart)}</p>
    </div>

    <ol class="confirm-list" id="confirmTaskList"></ol>

    <div class="summary">
      <p>学習予定時間の合計: ${sumPlanned()}分</p>
    </div>

    <div class="btn-row compact-stack">
      <button id="confirmPlanBtn" class="btn-main" type="button">この予定で決定</button>
      <button id="backToPlanningBtn" class="btn-quiet" type="button">戻って修正</button>
    </div>
  `);

  const list = document.getElementById("confirmTaskList");
  state.tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = "confirm-item";
    item.innerHTML = `
      <p class="confirm-head">${escapeHtml(task.name)}　${task.plannedMinutes}分</p>
      <p class="confirm-body">内容：${escapeHtml(task.content)}</p>
    `;
    list.appendChild(item);
  });

  document.getElementById("confirmPlanBtn").addEventListener("click", confirmPlan);
  document.getElementById("backToPlanningBtn").addEventListener("click", () => changePhase("planning"));
}

function confirmPlan() {
  state.tasks = state.tasks.map((task) => ({
    ...task,
    name: task.name.trim(),
    plannedMinutes: sanitizeMinutes(task.plannedMinutes),
    content: task.content.trim(),
    status: "pending",
    actualSeconds: null,
    memo: "",
    closeAction: ""
  }));

  updateTaskNameStats();

  const confirmedTasks = state.tasks.map((task) => ({ ...task }));
  const planReportText = buildPlanReportText();
  state.confirmedPlan = {
    planFor: state.planFor,
    planTimes: { ...state.planTimes },
    tasks: confirmedTasks,
    totalPlanned: sumPlanned(),
    reportText: planReportText,
    confirmedAt: Date.now()
  };
  state.goPressedAt = Date.now();
  state.running = createRunningState();
  state.review = createReviewState();
  changePhase("planReport");
}

function updateTaskNameStats() {
  const map = new Map(state.taskNameStats.map((item) => [item.name, { ...item }]));
  const now = Date.now();

  state.tasks.forEach((task) => {
    const name = task.name.trim();
    if (!name) {
      return;
    }
    const current = map.get(name) || { name, count: 0, lastUsedAt: 0 };
    current.count += 1;
    current.lastUsedAt = now;
    map.set(name, current);
  });

  state.taskNameStats = Array.from(map.values());
}

function buildPlanReportText() {
  const lines = [];
  const label = state.planFor === "today" ? "今日" : "明日";
  lines.push(`【${label}の予定】`);
  lines.push("");
  lines.push(`起床　　　　${formatTimeForDisplay(state.planTimes.wakeUp)}`);
  lines.push(`出発　　　　${formatTimeForDisplay(state.planTimes.departure)}`);
  lines.push(`帰宅　　　　${formatTimeForDisplay(state.planTimes.returnHome)}`);
  lines.push(`勉強開始　　${formatTimeForDisplay(state.planTimes.studyStart)}`);
  lines.push("");
  state.tasks.forEach((task) => {
    lines.push(`・${task.name}　${task.plannedMinutes}分`);
    lines.push(`　${task.content}`);
    lines.push("");
  });
  lines.push(`合計${sumPlanned()}分`);

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function renderPlanReport() {
  const reportText = state.confirmedPlan?.reportText || buildPlanReportText();
  renderScreen(`
    <h2>親への予定報告</h2>
    <div id="planReportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyPlanBtn" class="btn-main" type="button">予定をコピー</button>
      <button id="startExecutionBtn" class="btn-quiet" type="button">タスク実行へ進む</button>
    </div>
    <p id="copyPlanMessage" class="helper" aria-live="polite"></p>
  `);

  document.getElementById("planReportText").textContent = reportText;
  document.getElementById("copyPlanBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(reportText);
    document.getElementById("copyPlanMessage").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
  document.getElementById("startExecutionBtn").addEventListener("click", () => changePhase("execution"));
}

function renderExecution() {
  const runningTask = getRunningTask();
  const pending = state.tasks.filter((task) => task.status === "pending");

  renderScreen(`
    <h2>タスク実行</h2>
    <h2>今やることを選んでください</h2>
    <div id="runArea"></div>
    <hr class="sep" />
    <div class="btn-row compact-stack">
      <button id="finishTodayBtn" class="btn-danger" type="button">今日は終了</button>
    </div>
  `);

  const runArea = document.getElementById("runArea");

  if (runningTask && !state.running.isPaused) {
    runArea.innerHTML = `
      <div class="timer-box">
        <p class="helper">実行中</p>
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>予定時間: ${runningTask.plannedMinutes}分</p>
        <p class="helper">内容: ${escapeHtml(runningTask.content)}</p>
        <p class="elapsed" id="elapsedLabel">${getRunningElapsedSeconds()}秒</p>
        <div class="btn-row split compact-stack">
          <button id="completeBtn" class="btn-ok" type="button">完了</button>
          <button id="interruptBtn" class="btn-quiet" type="button">中断</button>
        </div>
        <div id="completeConfirmArea"></div>
      </div>
    `;

    document.getElementById("completeBtn").addEventListener("click", () => {
      state.running.confirmingComplete = true;
      saveState();
      renderExecution();
    });
    document.getElementById("interruptBtn").addEventListener("click", interruptRunningTask);

    if (state.running.confirmingComplete) {
      document.getElementById("completeConfirmArea").innerHTML = `
        <div class="notice info confirm-box">
          <p>本当に完了しますか？</p>
          <div class="btn-row split compact-stack">
            <button id="confirmCompleteBtn" class="btn-ok" type="button">完了する</button>
            <button id="cancelCompleteBtn" class="btn-quiet" type="button">戻る</button>
          </div>
        </div>
      `;
      document.getElementById("confirmCompleteBtn").addEventListener("click", finalizeTaskCompletion);
      document.getElementById("cancelCompleteBtn").addEventListener("click", () => {
        state.running.confirmingComplete = false;
        saveState();
        renderExecution();
      });
    }

    tickTimer = setInterval(() => {
      const label = document.getElementById("elapsedLabel");
      if (!label) {
        return;
      }
      label.textContent = `${getRunningElapsedSeconds()}秒`;
      saveState();
    }, 1000);
  } else if (pending.length > 0) {
    runArea.innerHTML = `
      <ul class="task-list" id="selectList"></ul>
      <p class="notice info">タスクカードをタップすると計測が始まります。</p>
    `;

    const selectList = document.getElementById("selectList");
    pending.slice(0, 3).forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-card selectable-card";
      item.dataset.taskId = task.id;
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.innerHTML = `
        <h3>${escapeHtml(task.name)}</h3>
        <p>予定時間: ${task.plannedMinutes}分</p>
      `;
      selectList.appendChild(item);
    });

    selectList.querySelectorAll("li[data-task-id]").forEach((card) => {
      card.addEventListener("click", () => startTask(card.dataset.taskId));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          startTask(card.dataset.taskId);
        }
      });
    });
  } else {
    runArea.innerHTML = `<p class="notice warn">未完了タスクはありません。</p>`;
  }

  document.getElementById("finishTodayBtn").addEventListener("click", startTodayFinishFlow);
}

function startTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== "pending") {
    return;
  }

  state.running = {
    taskId,
    startedAt: Date.now(),
    baseSeconds: typeof task.actualSeconds === "number" ? task.actualSeconds : 0,
    isPaused: false,
    confirmingComplete: false
  };
  saveState();

  if (state.phase !== "execution") {
    changePhase("execution");
    return;
  }
  renderExecution();
}

function getRunningTask() {
  if (!state.running.taskId) {
    return null;
  }
  return findTask(state.running.taskId);
}

function getRunningElapsedSeconds() {
  if (!state.running.taskId) {
    return 0;
  }
  if (!state.running.startedAt) {
    return Math.max(0, state.running.baseSeconds || 0);
  }
  const passed = Math.floor((Date.now() - state.running.startedAt) / 1000);
  return Math.max(0, (state.running.baseSeconds || 0) + passed);
}

function interruptRunningTask() {
  const task = getRunningTask();
  if (!task) {
    return;
  }

  const elapsed = Math.max(1, getRunningElapsedSeconds());
  task.actualSeconds = elapsed;
  state.running.baseSeconds = elapsed;
  state.running.startedAt = null;
  state.running.isPaused = true;
  state.running.confirmingComplete = false;
  goHome();
}

function resumePausedTask() {
  const task = getRunningTask();
  if (!task || !state.running.isPaused) {
    return;
  }

  state.running.startedAt = Date.now();
  state.running.baseSeconds = typeof task.actualSeconds === "number" ? task.actualSeconds : 0;
  state.running.isPaused = false;
  state.running.confirmingComplete = false;
  changePhase("execution", false);
}

function finalizeTaskCompletion() {
  const task = getRunningTask();
  if (!task) {
    return;
  }

  task.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  task.status = "done";
  state.running = createRunningState();
  saveState();
  renderExecution();
}

function startTodayFinishFlow() {
  const task = getRunningTask();
  if (task) {
    task.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  }

  state.running = createRunningState();
  state.review = {
    pendingIds: state.tasks.filter((item) => item.status === "pending").map((item) => item.id),
    index: 0,
    pendingAction: null,
    draftMemo: ""
  };
  changePhase("review");
}

function renderReview() {
  moveReviewCursorToPending();
  const task = getCurrentReviewTask();

  if (!task) {
    renderScreen(`
      <h2>今日は終了</h2>
      <p class="helper">未完了タスクの確認が終わりました。</p>
      <div class="btn-row compact-stack">
        <button id="toResultBtn" class="btn-main" type="button">結果を見る</button>
      </div>
    `);
    document.getElementById("toResultBtn").addEventListener("click", () => changePhase("result"));
    return;
  }

  renderScreen(`
    <h2>今日は終了</h2>
    <p class="helper">未完了タスクを1件ずつ確認します。</p>
    <div class="task-card">
      <h3>${escapeHtml(task.name)}</h3>
      <p>予定時間: ${task.plannedMinutes}分</p>
      <p>内容: ${escapeHtml(task.content)}</p>
    </div>
    <div class="btn-row triple compact-stack">
      <button id="doTodayBtn" class="btn-main" type="button">今日やる</button>
      <button id="moveTomorrowBtn" class="btn-sub" type="button">明日に回す</button>
      <button id="dropTaskBtn" class="btn-danger" type="button">不要になった</button>
    </div>
    <div id="memoPanel" class="hidden">
      <label for="reviewMemo">自由記述メモ</label>
      <textarea id="reviewMemo" placeholder="理由や状況を自由に入力"></textarea>
      <div class="btn-row compact-stack">
        <button id="saveReviewBtn" class="btn-main" type="button">この内容で次へ</button>
      </div>
    </div>
  `);

  document.getElementById("doTodayBtn").addEventListener("click", () => startTask(task.id));
  document.getElementById("moveTomorrowBtn").addEventListener("click", () => showMemoPanel("deferred"));
  document.getElementById("dropTaskBtn").addEventListener("click", () => showMemoPanel("discarded"));

  if (state.review.pendingAction === "deferred" || state.review.pendingAction === "discarded") {
    showMemoPanel(state.review.pendingAction, true);
  }
}

function moveReviewCursorToPending() {
  while (state.review.index < state.review.pendingIds.length) {
    const task = findTask(state.review.pendingIds[state.review.index]);
    if (task && task.status === "pending") {
      return;
    }
    state.review.index += 1;
  }
}

function getCurrentReviewTask() {
  const id = state.review.pendingIds[state.review.index];
  return findTask(id);
}

function showMemoPanel(action, restore = false) {
  state.review.pendingAction = action;
  if (!restore) {
    state.review.draftMemo = "";
  }
  saveState();

  const panel = document.getElementById("memoPanel");
  const memoEl = document.getElementById("reviewMemo");
  panel.classList.remove("hidden");
  memoEl.value = state.review.draftMemo || "";
  memoEl.addEventListener("input", (event) => {
    state.review.draftMemo = event.target.value;
    saveState();
  });

  document.getElementById("saveReviewBtn").onclick = () => {
    const task = getCurrentReviewTask();
    if (!task) {
      return;
    }
    task.status = action;
    task.closeAction = action;
    task.memo = memoEl.value.trim();
    state.review.index += 1;
    state.review.pendingAction = null;
    state.review.draftMemo = "";
    saveState();
    renderReview();
  };
}

function renderResult() {
  const done = state.tasks.filter((task) => task.status === "done");
  const deferred = state.tasks.filter((task) => task.status === "deferred");
  const discarded = state.tasks.filter((task) => task.status === "discarded");
  const unfinished = state.tasks.length - done.length;
  const totalActual = sumActualMinutes();
  const reportText = buildResultReportText(done, deferred, discarded, unfinished, totalActual);

  renderScreen(`
    <h2>今日の結果</h2>
    <div class="summary">
      <p>今日の予定タスク数: ${state.tasks.length}件</p>
      <p>完了数: ${done.length}件</p>
      <p>未完了数: ${unfinished}件</p>
      <p>合計予定時間: ${sumPlanned()}分</p>
      <p>合計実績時間: ${totalActual}分</p>
    </div>
    <h3>各タスク</h3>
    <ul class="result-list" id="taskResultList"></ul>
    <h3>保護者への報告文</h3>
    <div id="resultReportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyResultBtn" class="btn-main" type="button">報告文をコピー</button>
    </div>
    <p id="copyResultMessage" class="helper" aria-live="polite"></p>
  `);

  const list = document.getElementById("taskResultList");
  state.tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = "result-card";
    item.innerHTML = `
      <h3>${escapeHtml(task.name)}</h3>
      <p>予定時間: ${task.plannedMinutes}分</p>
      <p>実績時間: ${secondsToMinutes(task.actualSeconds)}分</p>
      <p>状態: ${getTaskStatusLabel(task.status)}</p>
      ${task.status === "deferred" || task.status === "discarded" ? `<p>メモ: ${escapeHtml(task.memo || "(未入力)")}</p>` : ""}
    `;
    list.appendChild(item);
  });

  document.getElementById("resultReportText").textContent = reportText;
  document.getElementById("copyResultBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(reportText);
    document.getElementById("copyResultMessage").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
}

function buildResultReportText(done, deferred, discarded, unfinished, totalActual) {
  const lines = [];
  lines.push("【今日の結果】");
  lines.push("");
  lines.push(`予定：${state.tasks.length}件`);
  lines.push(`完了：${done.length}件`);
  lines.push(`未完了：${unfinished}件`);
  lines.push("");
  lines.push(`予定時間：${sumPlanned()}分`);
  lines.push(`実績時間：${totalActual}分`);
  lines.push("");

  if (done.length > 0) {
    lines.push("完了");
    done.forEach((task) => {
      lines.push(`・${task.name}　予定${task.plannedMinutes}分／実績${secondsToMinutes(task.actualSeconds)}分`);
    });
    lines.push("");
  }

  if (deferred.length > 0) {
    lines.push("明日に回す");
    deferred.forEach((task) => {
      lines.push(`・${task.name}`);
      lines.push(`　理由：${task.memo || "(未入力)"}`);
    });
    lines.push("");
  }

  if (discarded.length > 0) {
    lines.push("不要になった");
    discarded.forEach((task) => {
      lines.push(`・${task.name}`);
      lines.push(`　理由：${task.memo || "(未入力)"}`);
    });
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function renderScreen(content) {
  app.innerHTML = `${renderTopNav()}${content}`;
  bindTopNav();
}

function renderTopNav() {
  return `
    <div class="top-nav">
      <button id="homeBtn" class="btn-mini btn-quiet" type="button">ホーム</button>
      <button id="backBtn" class="btn-mini btn-quiet" type="button" ${state.navHistory.length === 0 ? "disabled" : ""}>戻る</button>
    </div>
  `;
}

function bindTopNav() {
  document.getElementById("homeBtn")?.addEventListener("click", goHome);
  document.getElementById("backBtn")?.addEventListener("click", goBack);
}

function goHome() {
  if (state.phase === "home") {
    return;
  }
  state.homeReturnPhase = state.phase;
  state.navHistory.push(state.phase);
  state.phase = "home";
  saveState();
  render();
}

function goBack() {
  if (state.navHistory.length === 0) {
    return;
  }
  state.phase = state.navHistory.pop();
  saveState();
  render();
}

function changePhase(nextPhase, pushHistory = true) {
  if (pushHistory && state.phase !== nextPhase) {
    state.navHistory.push(state.phase);
  }
  state.phase = nextPhase;
  if (nextPhase !== "home") {
    state.homeReturnPhase = nextPhase;
  }
  saveState();
  render();
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function moveTask(taskId, direction) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.tasks.length) {
    return;
  }
  const temp = state.tasks[index];
  state.tasks[index] = state.tasks[nextIndex];
  state.tasks[nextIndex] = temp;
}

function getPlanningFormTaskName() {
  if (state.planningForm.taskNameChoice === TASK_NAME_NEW) {
    return state.planningForm.customTaskName.trim();
  }
  return state.planningForm.taskNameChoice.trim();
}

function getPlanningFormMinutes() {
  if (state.planningForm.minutesChoice === MINUTES_OTHER) {
    return sanitizeMinutes(state.planningForm.customMinutes);
  }
  return sanitizeMinutes(state.planningForm.minutesChoice);
}

function getSortedTaskNameOptions() {
  return [...state.taskNameStats].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastUsedAt - a.lastUsedAt;
  });
}

function getCounts() {
  const done = state.tasks.filter((task) => task.status === "done").length;
  return {
    total: state.tasks.length,
    done,
    unfinished: state.tasks.length - done
  };
}

function updateTotalPlanned() {
  const totalEl = document.getElementById("totalPlanned");
  if (!totalEl) {
    return;
  }
  totalEl.textContent = `学習予定時間の合計 ${sumPlanned()}分`;
}

function sumPlanned() {
  return state.tasks.reduce((sum, task) => sum + sanitizeMinutes(task.plannedMinutes), 0);
}

function sumActualMinutes() {
  return state.tasks.reduce((sum, task) => sum + secondsToMinutes(task.actualSeconds), 0);
}

function secondsToMinutes(seconds) {
  if (typeof seconds !== "number" || seconds <= 0) {
    return 0;
  }
  return Math.ceil(seconds / 60);
}

function sanitizeMinutes(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.min(600, Math.max(1, Math.round(num)));
}

function sanitizeMinutesOrZero(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return Math.round(num);
}

function sanitizeTimeValue(value, fallback) {
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function formatTimeForDisplay(value) {
  if (!value) {
    return "--:--";
  }
  const [hour, minute] = value.split(":");
  return `${Number(hour)}:${minute}`;
}

function getTaskStatusLabel(status) {
  if (status === "done") return "完了";
  if (status === "deferred") return "明日に回す";
  if (status === "discarded") return "不要になった";
  return "未完了";
}

function clearTickTimer() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const tmp = document.createElement("textarea");
      tmp.value = text;
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.focus();
      tmp.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(tmp);
      return ok;
    } catch (error) {
      return false;
    }
  }
}
