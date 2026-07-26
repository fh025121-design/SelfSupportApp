const STORAGE_KEY = "selfSupportAppTrialStateV3";
const DEFAULT_MINUTES = 30;
const TASK_NAME_NEW = "__new__";
const MINUTES_OTHER = "other";
const MINUTE_OPTIONS = [10, 20, 30, 40, 60];
const TASK_KIND_OPTIONS = [
  { value: "study", label: "学習" },
  { value: "outing", label: "外出予定" },
  { value: "medicine", label: "薬" }
];
const DEPARTURE_CHECK_ITEMS = [
  "テーブルに物は残っていないか",
  "コンタクトのゴミを捨てたか",
  "提出物を指差し確認・目視したか",
  "今日の予定に目を通したか",
  "スマホを玄関へ置いたか"
];

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
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function getNowInJst() {
  const now = new Date();
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
  return new Date(`${text.replace(" ", "T")}`);
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
    content: "",
    kind: "study",
    eventTime: ""
  };
}

function createRunningState() {
  return {
    taskId: null,
    startedAt: null,
    baseSeconds: 0,
    isPaused: false,
    confirmingComplete: false,
    alertAtSeconds: null,
    alerting: false,
    lastAlertTarget: null,
    customExtendMinutes: ""
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

function createDepartureCheckState() {
  return {
    outingId: null,
    index: 0,
    completedByOuting: {}
  };
}

function createReturnCheckState() {
  return {
    done: false,
    answers: {
      homework: "",
      trouble: "",
      reply: ""
    },
    reportText: "",
    copied: false
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
    departureCheck: createDepartureCheckState(),
    returnCheck: createReturnCheckState(),
    goPressedAt: null,
    dayClosed: false,
    previousDayPending: null
  };
}

function createTask(name, plannedMinutes, content, kind = "study", eventTime = "") {
  return {
    id: crypto.randomUUID(),
    name,
    plannedMinutes,
    content,
    kind,
    eventTime,
    status: "pending",
    actualSeconds: null,
    memo: "",
    closeAction: ""
  };
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    name: String(task.name || ""),
    plannedMinutes: sanitizeMinutes(task.plannedMinutes || DEFAULT_MINUTES),
    content: String(task.content || ""),
    kind: ["study", "outing", "medicine"].includes(task.kind) ? task.kind : "study",
    eventTime: String(task.eventTime || ""),
    status: ["pending", "done", "deferred", "discarded"].includes(task.status) ? task.status : "pending",
    actualSeconds: typeof task.actualSeconds === "number" ? task.actualSeconds : null,
    memo: String(task.memo || ""),
    closeAction: String(task.closeAction || "")
  };
}

function normalizeTaskNameStats(rawStats) {
  if (!Array.isArray(rawStats)) return [];
  return rawStats
    .filter((item) => item && typeof item.name === "string" && item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      count: Math.max(0, Number(item.count) || 0),
      lastUsedAt: typeof item.lastUsedAt === "number" ? item.lastUsedAt : 0
    }));
}

function buildCarryoverTasks(previousState) {
  if (!previousState || !Array.isArray(previousState.tasks)) return [];
  return previousState.tasks
    .filter((task) => task && task.status === "deferred")
    .map((task) => createTask(
      String(task.name || "").trim(),
      sanitizeMinutes(task.plannedMinutes),
      String(task.content || "").trim(),
      task.kind || "study",
      String(task.eventTime || "")
    ));
}

function loadState() {
  const todayKey = getTodayKeyJst();
  todayLabel.textContent = `本日: ${getTodayDisplayJst()}`;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState(todayKey);

    const parsed = JSON.parse(raw);
    if (!parsed) return createInitialState(todayKey);

    if (parsed.dateKey !== todayKey) {
      const nextState = createInitialState(todayKey, buildCarryoverTasks(parsed));
      nextState.taskNameStats = normalizeTaskNameStats(parsed.taskNameStats);
      if (parsed.goPressedAt && !parsed.dayClosed) {
        nextState.previousDayPending = {
          dateKey: parsed.dateKey,
          summary: buildPastDaySummary(parsed)
        };
        nextState.phase = "previousDayEnd";
      }
      return nextState;
    }

    const safe = {
      ...createInitialState(todayKey),
      ...parsed,
      dateKey: todayKey
    };

    safe.phase = [
      "home", "planning", "planConfirm", "planReport", "execution", "review", "result",
      "departureCheck", "returnCheck", "returnReport", "dayEnd", "previousDayEnd"
    ].includes(safe.phase) ? safe.phase : "planning";
    safe.navHistory = Array.isArray(safe.navHistory) ? safe.navHistory : [];
    safe.homeReturnPhase = [
      "planning", "planConfirm", "planReport", "execution", "review", "result", "departureCheck", "returnCheck", "returnReport", "dayEnd"
    ].includes(safe.homeReturnPhase) ? safe.homeReturnPhase : "planning";
    safe.planFor = safe.planFor === "today" ? "today" : "tomorrow";
    safe.planTimes = { ...createDefaultPlanTimes(), ...(safe.planTimes || {}) };
    safe.tasks = Array.isArray(safe.tasks) ? safe.tasks.map(normalizeTask) : [];
    safe.planningForm = normalizePlanningForm(safe.planningForm);
    safe.taskNameStats = normalizeTaskNameStats(safe.taskNameStats);
    safe.running = { ...createRunningState(), ...(safe.running || {}) };
    safe.review = { ...createReviewState(), ...(safe.review || {}) };
    safe.departureCheck = { ...createDepartureCheckState(), ...(safe.departureCheck || {}) };
    safe.returnCheck = {
      ...createReturnCheckState(),
      ...(safe.returnCheck || {}),
      answers: {
        ...createReturnCheckState().answers,
        ...((safe.returnCheck && safe.returnCheck.answers) || {})
      }
    };
    safe.confirmedPlan = normalizeConfirmedPlan(safe.confirmedPlan);
    safe.previousDayPending = safe.previousDayPending || null;
    safe.dayClosed = Boolean(safe.dayClosed);

    return safe;
  } catch (_) {
    return createInitialState(todayKey);
  }
}

function buildPastDaySummary(prev) {
  const tasks = Array.isArray(prev.tasks) ? prev.tasks : [];
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const planned = tasks.reduce((sum, t) => sum + (Number(t.plannedMinutes) || 0), 0);
  const actual = tasks.reduce((sum, t) => sum + secondsToMinutes(t.actualSeconds), 0);
  return {
    total,
    done,
    unfinished: total - done,
    planned,
    actual,
    dateKey: prev.dateKey
  };
}

function normalizePlanningForm(raw) {
  const base = { ...createPlanningForm(), ...(raw || {}) };
  base.mode = base.mode === "edit" ? "edit" : "add";
  base.targetId = base.targetId || null;
  base.taskNameChoice = typeof base.taskNameChoice === "string" ? base.taskNameChoice : TASK_NAME_NEW;
  base.customTaskName = String(base.customTaskName || "");
  base.minutesChoice = typeof base.minutesChoice === "string" ? base.minutesChoice : String(DEFAULT_MINUTES);
  base.customMinutes = String(base.customMinutes || "");
  base.content = String(base.content || "");
  base.kind = ["study", "outing", "medicine"].includes(base.kind) ? base.kind : "study";
  base.eventTime = String(base.eventTime || "");
  return base;
}

function normalizeConfirmedPlan(raw) {
  if (!raw) return null;
  return {
    planFor: raw.planFor === "today" ? "today" : "tomorrow",
    planTimes: { ...createDefaultPlanTimes(), ...(raw.planTimes || {}) },
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask) : [],
    totalPlanned: sanitizeMinutesOrZero(raw.totalPlanned),
    reportText: String(raw.reportText || ""),
    confirmedAt: typeof raw.confirmedAt === "number" ? raw.confirmedAt : 0
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  clearTickTimer();
  enforcePriorityPhase();

  if (state.phase === "previousDayEnd") return renderPreviousDayEnd();
  if (state.phase === "departureCheck") return renderDepartureCheck();
  if (state.phase === "home") return renderHome();
  if (state.phase === "planning") return renderPlanning();
  if (state.phase === "planConfirm") return renderPlanConfirm();
  if (state.phase === "planReport") return renderPlanReport();
  if (state.phase === "execution") return renderExecution();
  if (state.phase === "review") return renderReview();
  if (state.phase === "returnCheck") return renderReturnCheck();
  if (state.phase === "returnReport") return renderReturnReport();
  if (state.phase === "dayEnd") return renderDayEnd();
  return renderResult();
}

function enforcePriorityPhase() {
  if (state.previousDayPending) {
    state.phase = "previousDayEnd";
    return;
  }

  if (state.phase === "execution" && state.running.taskId && !state.running.isPaused) {
    return;
  }

  const dueOuting = getDueOutingForDepartureCheck();
  if (dueOuting) {
    if (state.phase !== "departureCheck") {
      state.phase = "departureCheck";
      state.departureCheck.outingId = dueOuting.id;
      state.departureCheck.index = state.departureCheck.completedByOuting[dueOuting.id] ? DEPARTURE_CHECK_ITEMS.length : 0;
    }
    return;
  }

  if (needsReturnCheck() && !["returnCheck", "returnReport"].includes(state.phase)) {
    state.phase = "returnCheck";
  }
}

function renderPreviousDayEnd() {
  const s = state.previousDayPending?.summary;
  renderScreen(`
    <h2>前日の終了処理</h2>
    <p class="helper">前日の終了処理が未完了です。先に完了してください。</p>
    <div class="summary">
      <p>対象日: ${escapeHtml(s?.dateKey || "-")}</p>
      <p>予定: ${s?.total || 0}件</p>
      <p>完了: ${s?.done || 0}件</p>
      <p>未完了: ${s?.unfinished || 0}件</p>
      <p>予定時間: ${s?.planned || 0}分</p>
      <p>実績時間: ${s?.actual || 0}分</p>
    </div>
    <div id="prevReportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyPrevEndBtn" class="btn-main" type="button">コピーして終了処理を完了</button>
    </div>
    <p id="prevEndMsg" class="helper" aria-live="polite"></p>
  `);

  const report = `【前日の結果】\n予定:${s?.total || 0}件\n完了:${s?.done || 0}件\n未完了:${s?.unfinished || 0}件\n予定時間:${s?.planned || 0}分\n実績時間:${s?.actual || 0}分`;
  document.getElementById("prevReportText").textContent = report;
  document.getElementById("copyPrevEndBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(report);
    document.getElementById("prevEndMsg").textContent = ok ? "コピーしました" : "コピーに失敗しました";
    if (ok) {
      state.previousDayPending = null;
      state.dayClosed = true;
      state.phase = "planning";
      saveState();
      render();
    }
  });
}

function renderHome() {
  const runningTask = getRunningTask();
  const counts = getCounts();
  const departureWarn = isAnyDepartureCheckIncomplete();

  renderScreen(`
    <h2>今日の予定</h2>
    ${departureWarn ? '<p class="notice warn">出発前チェック未完了</p>' : ""}
    <div class="summary">
      <p>予定を作る日: ${state.planFor === "today" ? "今日" : "明日"}</p>
      <p>予定タスク数: ${counts.total}件 / 完了: ${counts.done}件</p>
      <p>合計予定時間: ${sumPlanned()}分</p>
    </div>

    <ul class="task-list" id="homeTaskList"></ul>

    <div class="btn-row compact-stack">
      <button id="openPlanningBtn" class="btn-quiet" type="button">予定入力へ</button>
      <button id="openExecutionBtn" class="btn-main" type="button">タスク実行へ</button>
      <button id="openDayEndBtn" class="btn-danger" type="button">1日の終了</button>
    </div>

    ${runningTask && state.running.isPaused ? '<div class="notice info">中断中タスクがあります。再開してください。</div>' : ""}
  `);

  const list = document.getElementById("homeTaskList");
  state.tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task-card compact-task-row";
    const status = getUnifiedStatus(task);
    li.innerHTML = `
      <div class="task-inline-text">${status} ${escapeHtml(task.name)} <span>${task.plannedMinutes}分</span></div>
      <div class="task-inline-actions">
        ${status === "【中断】" ? `<button class="btn-mini btn-main" data-resume-id="${task.id}" type="button">再開</button>` : ""}
      </div>
    `;
    list.appendChild(li);
  });

  document.querySelectorAll("button[data-resume-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.running.taskId === btn.dataset.resumeId) {
        resumePausedTask();
      }
    });
  });

  document.getElementById("openPlanningBtn").addEventListener("click", () => changePhase("planning", false));
  document.getElementById("openExecutionBtn").addEventListener("click", () => changePhase("execution", false));
  document.getElementById("openDayEndBtn").addEventListener("click", () => changePhase("dayEnd"));
}

function getUnifiedStatus(task) {
  if (task.status === "done") return "【完了】";
  if (state.running.taskId === task.id && state.running.isPaused) return "【中断】";
  if (state.running.taskId === task.id && !state.running.isPaused) return "【実行中】";
  return "○";
}

function renderPlanning() {
  const editingTask = state.planningForm.mode === "edit" ? findTask(state.planningForm.targetId) : null;
  const showCustomName = state.planningForm.taskNameChoice === TASK_NAME_NEW;
  const showCustomMinutes = state.planningForm.minutesChoice === MINUTES_OTHER;
  const showEventTime = state.planningForm.kind === "outing" || state.planningForm.kind === "medicine";

  renderScreen(`
    <h2>予定入力</h2>
    <p class="helper">内容は必須です。例を参考に入力してください。</p>

    <p class="legend">予定を作る日</p>
    <div class="option-group compact-options">
      <label class="option-item"><input type="radio" name="planFor" value="tomorrow" ${state.planFor === "tomorrow" ? "checked" : ""} /><span>明日</span></label>
      <label class="option-item"><input type="radio" name="planFor" value="today" ${state.planFor === "today" ? "checked" : ""} /><span>今日</span></label>
    </div>

    <div class="time-grid">
      <div><label for="wakeUpTime">起床時間</label><input id="wakeUpTime" type="time" value="${state.planTimes.wakeUp}" /></div>
      <div><label for="departureTime">出発時間</label><input id="departureTime" type="time" value="${state.planTimes.departure}" /></div>
      <div><label for="returnHomeTime">帰宅時間</label><input id="returnHomeTime" type="time" value="${state.planTimes.returnHome}" /></div>
      <div><label for="studyStartTime">勉強開始時間</label><input id="studyStartTime" type="time" value="${state.planTimes.studyStart}" /></div>
    </div>

    <h3>登録済みタスク</h3>
    <ul id="taskList" class="task-list compact-task-list"></ul>

    <div class="task-form-box">
      <p class="helper">${editingTask ? "修正内容を入力してください。" : "次の1件を入力してください。"}</p>
      <div class="form-stack">
        <div><label for="taskKind">種類</label><select id="taskKind">${TASK_KIND_OPTIONS.map((k) => `<option value="${k.value}" ${state.planningForm.kind === k.value ? "selected" : ""}>${k.label}</option>`).join("")}</select></div>
        <div><label for="taskNameSelect">タスク名</label><select id="taskNameSelect">${renderTaskNameOptions()}</select></div>
        <div id="customTaskNameWrap" class="${showCustomName ? "" : "hidden"}"><label for="customTaskName">新しいタスク名</label><input id="customTaskName" type="text" value="${escapeHtml(state.planningForm.customTaskName)}" maxlength="40" placeholder="例: 原田先生" /></div>
        <div><label for="minutesSelect">予定時間</label><select id="minutesSelect">${renderMinuteOptions()}</select></div>
        <div id="customMinutesWrap" class="${showCustomMinutes ? "" : "hidden"}"><label for="customMinutes">その他の分数</label><input id="customMinutes" type="number" min="1" max="600" value="${escapeHtml(state.planningForm.customMinutes)}" /></div>
        <div id="eventTimeWrap" class="${showEventTime ? "" : "hidden"}"><label for="eventTime">${state.planningForm.kind === "medicine" ? "飲む時刻" : "出発時刻"}</label><input id="eventTime" type="time" value="${state.planningForm.eventTime || (state.planningForm.kind === "outing" ? state.planTimes.departure : "")}" /></div>
        <div><label for="taskContent">内容</label><input id="taskContent" type="text" value="${escapeHtml(state.planningForm.content)}" maxlength="120" placeholder="例: 新中学問題集 p54" /></div>
      </div>
      <div class="btn-row compact-stack"><button id="saveTaskBtn" class="btn-sub" type="button">${editingTask ? "修正を保存" : "追加"}</button></div>
    </div>

    <div class="summary" id="totalPlanned"></div>
    <div class="btn-row compact-stack"><button id="goBtn" class="btn-main" type="button">最終確認へ</button></div>
  `);

  renderTaskListForPlanning();
  bindPlanningEvents();
}

function renderTaskListForPlanning() {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  if (state.tasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-card compact-empty";
    empty.innerHTML = "<p>登録済みタスクはまだありません。</p>";
    list.appendChild(empty);
    updateTotalPlanned();
    return;
  }

  state.tasks.forEach((task, idx) => {
    const done = task.status === "done";
    const li = document.createElement("li");
    li.className = `task-card compact-task-row${state.planningForm.targetId === task.id ? " editing-row" : ""}`;
    li.innerHTML = `
      <div class="task-inline-text">${escapeHtml(task.name)} <span>${task.plannedMinutes}分</span> ${done ? '<span class="status-chip">完了</span>' : ""}</div>
      <div class="task-inline-actions">
        <button type="button" class="btn-mini btn-quiet" data-action="up" data-id="${task.id}" ${done ? "disabled" : ""}>↑</button>
        <button type="button" class="btn-mini btn-quiet" data-action="down" data-id="${task.id}" ${done ? "disabled" : ""}>↓</button>
        <button type="button" class="btn-mini btn-sub" data-action="edit" data-id="${task.id}" ${done ? "disabled" : ""}>修正</button>
        <button type="button" class="btn-mini btn-danger" data-action="delete" data-id="${task.id}" ${done ? "disabled" : ""}>削除</button>
      </div>
    `;
    list.appendChild(li);
  });

  updateTotalPlanned();
}

function renderTaskNameOptions() {
  const options = [`<option value="${TASK_NAME_NEW}" ${state.planningForm.taskNameChoice === TASK_NAME_NEW ? "selected" : ""}>新しいタスク名を入力</option>`];
  getSortedTaskNameOptions().forEach((opt) => {
    options.push(`<option value="${escapeHtml(opt.name)}" ${state.planningForm.taskNameChoice === opt.name ? "selected" : ""}>${escapeHtml(opt.name)}</option>`);
  });
  return options.join("");
}

function renderMinuteOptions() {
  const opts = MINUTE_OPTIONS.map((m) => `<option value="${m}" ${state.planningForm.minutesChoice === String(m) ? "selected" : ""}>${m}分</option>`);
  opts.push(`<option value="${MINUTES_OTHER}" ${state.planningForm.minutesChoice === MINUTES_OTHER ? "selected" : ""}>その他</option>`);
  return opts.join("");
}

function bindPlanningEvents() {
  document.querySelectorAll("input[name='planFor']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.planFor = e.target.value === "today" ? "today" : "tomorrow";
      saveState();
    });
  });

  bindPlanTimeInput("wakeUpTime", "wakeUp");
  bindPlanTimeInput("departureTime", "departure");
  bindPlanTimeInput("returnHomeTime", "returnHome");
  bindPlanTimeInput("studyStartTime", "studyStart");

  document.getElementById("taskKind").addEventListener("change", (e) => {
    state.planningForm.kind = e.target.value;
    saveState();
    renderPlanning();
  });
  document.getElementById("taskNameSelect").addEventListener("change", (e) => {
    state.planningForm.taskNameChoice = e.target.value;
    saveState();
    renderPlanning();
  });
  document.getElementById("customTaskName")?.addEventListener("input", (e) => {
    state.planningForm.customTaskName = e.target.value;
    saveState();
  });
  document.getElementById("minutesSelect").addEventListener("change", (e) => {
    state.planningForm.minutesChoice = e.target.value;
    saveState();
    renderPlanning();
  });
  document.getElementById("customMinutes")?.addEventListener("input", (e) => {
    state.planningForm.customMinutes = e.target.value;
    saveState();
  });
  document.getElementById("eventTime")?.addEventListener("input", (e) => {
    state.planningForm.eventTime = e.target.value;
    saveState();
  });
  document.getElementById("taskContent").addEventListener("input", (e) => {
    state.planningForm.content = e.target.value;
    saveState();
  });

  document.getElementById("saveTaskBtn").addEventListener("click", savePlanningTask);

  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const task = findTask(id);
      if (!id || !action || !task || task.status === "done") return;

      if (action === "up") movePendingTask(id, -1);
      if (action === "down") movePendingTask(id, 1);
      if (action === "edit") loadTaskIntoForm(id);
      if (action === "delete") {
        if (!window.confirm(`「${task.name}」を削除しますか？`)) return;
        state.tasks = state.tasks.filter((t) => t.id !== id);
        if (state.planningForm.targetId === id) state.planningForm = createPlanningForm();
      }
      saveState();
      renderPlanning();
    });
  });

  document.getElementById("goBtn").addEventListener("click", onGoToPlanConfirm);
}

function movePendingTask(taskId, dir) {
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  const target = idx + dir;
  if (target < 0 || target >= state.tasks.length) return;
  if (state.tasks[target].status === "done") return;
  const tmp = state.tasks[idx];
  state.tasks[idx] = state.tasks[target];
  state.tasks[target] = tmp;
}

function bindPlanTimeInput(elementId, key) {
  document.getElementById(elementId).addEventListener("input", (e) => {
    state.planTimes[key] = sanitizeTimeValue(e.target.value, createDefaultPlanTimes()[key]);
    saveState();
  });
}

function loadTaskIntoForm(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === "done") return;

  const knownName = getSortedTaskNameOptions().find((o) => o.name === task.name);
  const knownMinutes = MINUTE_OPTIONS.includes(task.plannedMinutes);
  state.planningForm = {
    mode: "edit",
    targetId: task.id,
    taskNameChoice: knownName ? task.name : TASK_NAME_NEW,
    customTaskName: knownName ? "" : task.name,
    minutesChoice: knownMinutes ? String(task.plannedMinutes) : MINUTES_OTHER,
    customMinutes: knownMinutes ? "" : String(task.plannedMinutes),
    content: task.content,
    kind: task.kind,
    eventTime: task.eventTime || ""
  };
}

function savePlanningTask() {
  const name = getPlanningFormTaskName();
  const minutes = getPlanningFormMinutes();
  const content = state.planningForm.content.trim();
  const kind = state.planningForm.kind;
  const eventTime = (kind === "outing" || kind === "medicine") ? sanitizeTimeValue(state.planningForm.eventTime, kind === "outing" ? state.planTimes.departure : "06:30") : "";

  if (!name) return alert("タスク名を入力してください。");
  if (!minutes) return alert("予定時間を入力してください。");
  if (!content) return alert("内容を入力してください。");

  if (state.planningForm.mode === "edit") {
    const task = findTask(state.planningForm.targetId);
    if (!task || task.status === "done") return;
    task.name = name;
    task.plannedMinutes = minutes;
    task.content = content;
    task.kind = kind;
    task.eventTime = eventTime;
  } else {
    state.tasks.push(createTask(name, minutes, content, kind, eventTime));
  }

  state.planningForm = createPlanningForm();
  saveState();
  renderPlanning();
}

function onGoToPlanConfirm() {
  if (state.tasks.length === 0) return alert("タスクが0件です。");

  const invalid = state.tasks.find((t) => !t.name.trim() || !t.content.trim());
  if (invalid) return alert("タスク名と内容を確認してください。");

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
    <div class="summary"><p>学習予定時間の合計: ${sumPlanned()}分</p></div>
    <div class="btn-row compact-stack">
      <button id="confirmPlanBtn" class="btn-main" type="button">この予定で決定</button>
      <button id="backToPlanningBtn" class="btn-quiet" type="button">戻って修正</button>
    </div>
  `);

  const list = document.getElementById("confirmTaskList");
  state.tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "confirm-item";
    li.innerHTML = `
      <p class="confirm-head">${escapeHtml(task.name)}　${task.plannedMinutes}分</p>
      <p class="confirm-body">内容：${escapeHtml(task.content)}</p>
    `;
    list.appendChild(li);
  });

  document.getElementById("confirmPlanBtn").addEventListener("click", confirmPlan);
  document.getElementById("backToPlanningBtn").addEventListener("click", () => changePhase("planning"));
}

function confirmPlan() {
  state.tasks = state.tasks.map((t) => ({
    ...t,
    name: t.name.trim(),
    content: t.content.trim(),
    plannedMinutes: sanitizeMinutes(t.plannedMinutes)
  }));

  updateTaskNameStats();

  state.confirmedPlan = {
    planFor: state.planFor,
    planTimes: { ...state.planTimes },
    tasks: state.tasks.map((t) => ({ ...t })),
    totalPlanned: sumPlanned(),
    reportText: buildPlanReportText(),
    confirmedAt: Date.now()
  };

  if (!state.goPressedAt) {
    state.running = createRunningState();
    state.review = createReviewState();
  }

  state.goPressedAt = Date.now();
  state.dayClosed = false;
  saveState();
  changePhase("planReport");
}

function updateTaskNameStats() {
  const map = new Map(state.taskNameStats.map((s) => [s.name, { ...s }]));
  const now = Date.now();
  state.tasks.forEach((task) => {
    const name = task.name.trim();
    if (!name) return;
    const s = map.get(name) || { name, count: 0, lastUsedAt: 0 };
    s.count += 1;
    s.lastUsedAt = now;
    map.set(name, s);
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
    if (task.kind === "medicine" && task.eventTime) lines.push(`　服用時刻: ${formatTimeForDisplay(task.eventTime)}`);
    if (task.kind === "outing" && task.eventTime) lines.push(`　出発時刻: ${formatTimeForDisplay(task.eventTime)}`);
    lines.push("");
  });
  lines.push(`合計${sumPlanned()}分`);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function renderPlanReport() {
  const report = state.confirmedPlan?.reportText || buildPlanReportText();
  renderScreen(`
    <h2>親への予定報告</h2>
    <div id="planReportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyPlanBtn" class="btn-main" type="button">予定をコピー</button>
      <button id="startExecutionBtn" class="btn-quiet" type="button">タスク実行へ進む</button>
    </div>
    <p id="copyPlanMessage" class="helper" aria-live="polite"></p>
  `);

  document.getElementById("planReportText").textContent = report;
  document.getElementById("copyPlanBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(report);
    document.getElementById("copyPlanMessage").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
  document.getElementById("startExecutionBtn").addEventListener("click", () => changePhase("execution"));
}

function renderExecution() {
  const runningTask = getRunningTask();
  const pending = state.tasks.filter((t) => t.status === "pending" && t.kind !== "medicine");
  const medicineDue = getDueMedicineTasks();

  renderScreen(`
    <h2>タスク実行</h2>
    <h2>今やることを選んでください</h2>
    ${medicineDue.length > 0 ? '<div class="notice warn" id="medicineArea"></div>' : ""}
    <div id="runArea"></div>
    <hr class="sep" />
    <div class="btn-row compact-stack"><button id="finishTodayBtn" class="btn-danger" type="button">今日は終了</button></div>
  `);

  if (medicineDue.length > 0) {
    const medArea = document.getElementById("medicineArea");
    medArea.innerHTML = medicineDue.map((t) => `${escapeHtml(t.name)}（${formatTimeForDisplay(t.eventTime)}） <button class="btn-mini btn-main" data-med-id="${t.id}" type="button">飲んだ</button>`).join("<br>");
    document.querySelectorAll("button[data-med-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const task = findTask(btn.dataset.medId);
        if (!task) return;
        task.status = "done";
        task.actualSeconds = Math.max(1, task.actualSeconds || 1);
        saveState();
        renderExecution();
      });
    });
  }

  const runArea = document.getElementById("runArea");

  if (runningTask && !state.running.isPaused) {
    if (state.running.alertAtSeconds == null) {
      state.running.alertAtSeconds = runningTask.plannedMinutes * 60;
    }

    const elapsed = getRunningElapsedSeconds();
    checkOverrunNotification(elapsed);

    runArea.innerHTML = `
      <div class="timer-box">
        <p class="helper">実行中</p>
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>予定時間: ${runningTask.plannedMinutes}分</p>
        <p class="helper">内容: ${escapeHtml(runningTask.content)}</p>
        <p class="elapsed" id="elapsedLabel">${formatElapsedSmart(elapsed)}</p>
        <div class="btn-row split compact-stack">
          <button id="completeBtn" class="btn-ok" type="button">完了</button>
          <button id="interruptBtn" class="btn-quiet" type="button">中断</button>
        </div>
        ${renderOverrunControls(elapsed)}
        <div id="completeConfirmArea"></div>
      </div>
    `;

    bindExecutionButtons();

    tickTimer = setInterval(() => {
      const sec = getRunningElapsedSeconds();
      const label = document.getElementById("elapsedLabel");
      if (label) label.textContent = formatElapsedSmart(sec);
      checkOverrunNotification(sec);
      saveState();
    }, 1000);
  } else if (pending.length > 0) {
    runArea.innerHTML = `<ul class="task-list" id="selectList"></ul><p class="notice info">タスクカードをタップすると計測が始まります。</p>`;
    const list = document.getElementById("selectList");
    pending.slice(0, 3).forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-card selectable-card";
      li.dataset.taskId = task.id;
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.innerHTML = `<h3>${escapeHtml(task.name)}</h3><p>予定時間: ${task.plannedMinutes}分</p>`;
      list.appendChild(li);
    });
    list.querySelectorAll("li[data-task-id]").forEach((card) => {
      card.addEventListener("click", () => startTask(card.dataset.taskId));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startTask(card.dataset.taskId);
        }
      });
    });
  } else {
    runArea.innerHTML = `<p class="notice warn">未完了タスクはありません。</p>`;
  }

  document.getElementById("finishTodayBtn").addEventListener("click", startTodayFinishFlow);
}

function renderOverrunControls(elapsed) {
  if (state.running.alertAtSeconds == null || elapsed < state.running.alertAtSeconds) return "";
  return `
    <div class="notice warn">
      <p>予定時間を超えました。</p>
      <div class="btn-row split compact-stack">
        <button id="stopNotifyBtn" class="btn-quiet" type="button">通知停止</button>
        <button id="extend10Btn" class="btn-sub" type="button">10分延長</button>
        <button id="extend20Btn" class="btn-sub" type="button">20分延長</button>
      </div>
      <div class="grid-2">
        <div>
          <label for="extendCustom">時間指定延長（分）</label>
          <input id="extendCustom" type="number" min="1" max="180" value="${escapeHtml(state.running.customExtendMinutes || "")}" />
        </div>
        <div class="btn-row compact-stack">
          <button id="extendCustomBtn" class="btn-sub" type="button">延長する</button>
        </div>
      </div>
    </div>
  `;
}

function bindExecutionButtons() {
  document.getElementById("completeBtn")?.addEventListener("click", () => {
    state.running.confirmingComplete = true;
    saveState();
    renderExecution();
  });
  document.getElementById("interruptBtn")?.addEventListener("click", interruptRunningTask);

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

  document.getElementById("stopNotifyBtn")?.addEventListener("click", () => {
    state.running.alerting = false;
    saveState();
    renderExecution();
  });
  document.getElementById("extend10Btn")?.addEventListener("click", () => extendRunningTask(10));
  document.getElementById("extend20Btn")?.addEventListener("click", () => extendRunningTask(20));
  document.getElementById("extendCustom")?.addEventListener("input", (e) => {
    state.running.customExtendMinutes = e.target.value;
    saveState();
  });
  document.getElementById("extendCustomBtn")?.addEventListener("click", () => {
    const n = Number(state.running.customExtendMinutes);
    if (!Number.isFinite(n) || n <= 0) return alert("延長分を入力してください。");
    extendRunningTask(Math.round(n));
  });
}

function extendRunningTask(min) {
  state.running.alertAtSeconds = (state.running.alertAtSeconds || 0) + min * 60;
  state.running.alerting = false;
  state.running.lastAlertTarget = null;
  state.running.customExtendMinutes = "";
  saveState();
  renderExecution();
}

function checkOverrunNotification(elapsed) {
  const target = state.running.alertAtSeconds;
  if (target == null) return;
  if (elapsed >= target && state.running.lastAlertTarget !== target) {
    state.running.alerting = true;
    state.running.lastAlertTarget = target;
    triggerAlertFeedback();
  }
}

function triggerAlertFeedback() {
  try {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  } catch (_) {
    // Ignore vibration failures.
  }
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      audio.close();
    }, 200);
  } catch (_) {
    // Ignore audio failures.
  }
}

function startTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== "pending") return;
  state.running = {
    taskId,
    startedAt: Date.now(),
    baseSeconds: typeof task.actualSeconds === "number" ? task.actualSeconds : 0,
    isPaused: false,
    confirmingComplete: false,
    alertAtSeconds: task.plannedMinutes * 60,
    alerting: false,
    lastAlertTarget: null,
    customExtendMinutes: ""
  };
  saveState();
  if (state.phase !== "execution") return changePhase("execution");
  renderExecution();
}

function getRunningTask() {
  if (!state.running.taskId) return null;
  return findTask(state.running.taskId);
}

function getRunningElapsedSeconds() {
  if (!state.running.taskId) return 0;
  if (!state.running.startedAt) return Math.max(0, state.running.baseSeconds || 0);
  const passed = Math.floor((Date.now() - state.running.startedAt) / 1000);
  return Math.max(0, (state.running.baseSeconds || 0) + passed);
}

function interruptRunningTask() {
  const task = getRunningTask();
  if (!task) return;
  const elapsed = Math.max(1, getRunningElapsedSeconds());
  task.actualSeconds = elapsed;
  state.running.baseSeconds = elapsed;
  state.running.startedAt = null;
  state.running.isPaused = true;
  state.running.confirmingComplete = false;
  state.running.alerting = false;
  goHome();
}

function resumePausedTask() {
  const task = getRunningTask();
  if (!task || !state.running.isPaused) return;
  state.running.startedAt = Date.now();
  state.running.baseSeconds = typeof task.actualSeconds === "number" ? task.actualSeconds : 0;
  state.running.isPaused = false;
  state.running.confirmingComplete = false;
  changePhase("execution", false);
}

function finalizeTaskCompletion() {
  const task = getRunningTask();
  if (!task) return;
  task.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  task.status = "done";
  state.running = createRunningState();
  saveState();
  renderExecution();
}

function formatElapsedSmart(sec) {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s}秒`;
}

function getDueMedicineTasks() {
  const now = getNowInJst();
  return state.tasks.filter((task) => {
    if (task.kind !== "medicine" || task.status !== "pending" || !task.eventTime) return false;
    const t = getDateTimeToday(task.eventTime);
    return t && now >= t;
  });
}

function startTodayFinishFlow() {
  const runningTask = getRunningTask();
  if (runningTask) runningTask.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  state.running = createRunningState();
  state.review = {
    pendingIds: state.tasks.filter((t) => t.status === "pending").map((t) => t.id),
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
      <div class="btn-row compact-stack"><button id="toResultBtn" class="btn-main" type="button">結果を見る</button></div>
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
      <div class="btn-row compact-stack"><button id="saveReviewBtn" class="btn-main" type="button">この内容で次へ</button></div>
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
    if (task && task.status === "pending") return;
    state.review.index += 1;
  }
}

function getCurrentReviewTask() {
  return findTask(state.review.pendingIds[state.review.index]);
}

function showMemoPanel(action, restore = false) {
  state.review.pendingAction = action;
  if (!restore) state.review.draftMemo = "";
  saveState();

  const panel = document.getElementById("memoPanel");
  const memoEl = document.getElementById("reviewMemo");
  panel.classList.remove("hidden");
  memoEl.value = state.review.draftMemo || "";
  memoEl.addEventListener("input", (e) => {
    state.review.draftMemo = e.target.value;
    saveState();
  });

  document.getElementById("saveReviewBtn").onclick = () => {
    const task = getCurrentReviewTask();
    if (!task) return;
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

function needsReturnCheck() {
  const hasOuting = state.tasks.some((t) => t.kind === "outing");
  if (!hasOuting || state.returnCheck.done) return false;
  const now = getNowInJst();
  const rt = getDateTimeToday(state.planTimes.returnHome);
  return rt && now >= rt;
}

function renderReturnCheck() {
  renderScreen(`
    <h2>帰宅後チェック</h2>
    <div class="task-form-box">
      <div class="form-stack">
        <div><label for="homeworkAnswer">宿題の有無</label><input id="homeworkAnswer" type="text" value="${escapeHtml(state.returnCheck.answers.homework)}" placeholder="例: あり / なし" /></div>
        <div><label for="troubleAnswer">困ったことの有無</label><input id="troubleAnswer" type="text" value="${escapeHtml(state.returnCheck.answers.trouble)}" placeholder="例: あり（内容） / なし" /></div>
        <div><label for="replyAnswer">家庭教師・親への返信</label><input id="replyAnswer" type="text" value="${escapeHtml(state.returnCheck.answers.reply)}" placeholder="例: LINEで返信した" /></div>
      </div>
      <div class="btn-row compact-stack"><button id="finishReturnCheckBtn" class="btn-main" type="button">帰宅後チェックを完了</button></div>
    </div>
  `);

  document.getElementById("homeworkAnswer").addEventListener("input", (e) => { state.returnCheck.answers.homework = e.target.value; saveState(); });
  document.getElementById("troubleAnswer").addEventListener("input", (e) => { state.returnCheck.answers.trouble = e.target.value; saveState(); });
  document.getElementById("replyAnswer").addEventListener("input", (e) => { state.returnCheck.answers.reply = e.target.value; saveState(); });
  document.getElementById("finishReturnCheckBtn").addEventListener("click", finishReturnCheck);
}

function finishReturnCheck() {
  const a = state.returnCheck.answers;
  state.returnCheck.reportText = [
    "【帰宅後報告】",
    `宿題: ${a.homework || "(未入力)"}`,
    `困ったこと: ${a.trouble || "(未入力)"}`,
    `返信: ${a.reply || "(未入力)"}`
  ].join("\n");
  state.phase = "returnReport";
  saveState();
  render();
}

function renderReturnReport() {
  renderScreen(`
    <h2>帰宅後報告</h2>
    <div id="returnReportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyOpenLineBtn" class="btn-main" type="button">コピーしてLINEを開く</button>
      <button id="sentReturnBtn" class="btn-quiet" type="button">送信しました</button>
    </div>
    <p id="returnReportMsg" class="helper"></p>
  `);
  document.getElementById("returnReportText").textContent = state.returnCheck.reportText || "";
  document.getElementById("copyOpenLineBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(state.returnCheck.reportText || "");
    if (ok) {
      document.getElementById("returnReportMsg").textContent = "コピーしました";
      window.open("https://line.me", "_blank");
    } else {
      document.getElementById("returnReportMsg").textContent = "コピーに失敗しました";
    }
  });
  document.getElementById("sentReturnBtn").addEventListener("click", () => {
    state.returnCheck.done = true;
    saveState();
    changePhase("home", false);
  });
}

function renderResult() {
  const done = state.tasks.filter((t) => t.status === "done");
  const deferred = state.tasks.filter((t) => t.status === "deferred");
  const discarded = state.tasks.filter((t) => t.status === "discarded");
  const unfinished = state.tasks.length - done.length;
  const totalActual = sumActualMinutes();
  const report = buildResultReportText(done, deferred, discarded, unfinished, totalActual);

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
      <button id="endDayBtn" class="btn-danger" type="button">1日の終了へ</button>
    </div>
    <p id="copyResultMessage" class="helper"></p>
  `);

  const list = document.getElementById("taskResultList");
  state.tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "result-card";
    li.innerHTML = `
      <h3>${escapeHtml(task.name)}</h3>
      <p>予定時間: ${task.plannedMinutes}分</p>
      <p>実績時間: ${secondsToMinutes(task.actualSeconds)}分</p>
      <p>状態: ${getTaskStatusLabel(task.status)}</p>
      ${(task.status === "deferred" || task.status === "discarded") ? `<p>メモ: ${escapeHtml(task.memo || "(未入力)")}</p>` : ""}
    `;
    list.appendChild(li);
  });

  document.getElementById("resultReportText").textContent = report;
  document.getElementById("copyResultBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(report);
    document.getElementById("copyResultMessage").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
  document.getElementById("endDayBtn").addEventListener("click", () => changePhase("dayEnd"));
}

function renderDayEnd() {
  const report = buildResultReportText(
    state.tasks.filter((t) => t.status === "done"),
    state.tasks.filter((t) => t.status === "deferred"),
    state.tasks.filter((t) => t.status === "discarded"),
    state.tasks.filter((t) => t.status !== "done").length,
    sumActualMinutes()
  );

  renderScreen(`
    <h2>1日の終了</h2>
    <p class="helper">明日の予定作成に進む前に、報告文をコピーしてください。</p>
    <div id="dayEndReport" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyDayEndBtn" class="btn-main" type="button">コピーして終了</button>
    </div>
    <p id="dayEndMsg" class="helper"></p>
  `);

  document.getElementById("dayEndReport").textContent = report;
  document.getElementById("copyDayEndBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(report);
    document.getElementById("dayEndMsg").textContent = ok ? "コピーしました" : "コピーに失敗しました";
    if (ok) {
      state.dayClosed = true;
      state.phase = "planning";
      state.goPressedAt = null;
      state.running = createRunningState();
      state.review = createReviewState();
      saveState();
      render();
    }
  });
}

function buildResultReportText(done, deferred, discarded, unfinished, totalActual) {
  const lines = [
    "【今日の結果】",
    "",
    `予定：${state.tasks.length}件`,
    `完了：${done.length}件`,
    `未完了：${unfinished}件`,
    "",
    `予定時間：${sumPlanned()}分`,
    `実績時間：${totalActual}分`,
    ""
  ];

  if (done.length > 0) {
    lines.push("完了");
    done.forEach((task) => lines.push(`・${task.name}　予定${task.plannedMinutes}分／実績${secondsToMinutes(task.actualSeconds)}分`));
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

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function getDueOutingForDepartureCheck() {
  const now = getNowInJst();
  for (const task of state.tasks) {
    if (task.kind !== "outing" || !task.eventTime) continue;
    const dep = getDateTimeToday(task.eventTime);
    if (!dep) continue;
    const start = new Date(dep.getTime() - 30 * 60 * 1000);
    const completed = Boolean(state.departureCheck.completedByOuting[task.id]);
    if (now >= start && !completed) return task;
  }
  return null;
}

function renderDepartureCheck() {
  const outing = findTask(state.departureCheck.outingId) || getDueOutingForDepartureCheck();
  if (!outing) {
    state.phase = "home";
    saveState();
    return renderHome();
  }

  const idx = state.departureCheck.index;
  const done = idx >= DEPARTURE_CHECK_ITEMS.length;

  if (done) {
    state.departureCheck.completedByOuting[outing.id] = true;
    state.phase = "home";
    saveState();
    return renderHome();
  }

  renderScreen(`
    <h2>出発前チェック</h2>
    <div class="task-card checklist-card">
      <p>${idx + 1}. ${DEPARTURE_CHECK_ITEMS[idx]}</p>
      <div class="btn-row compact-stack">
        <button id="confirmDepartureItemBtn" class="btn-main" type="button">確認した</button>
        <button id="skipToHomeBtn" class="btn-quiet" type="button">ホームへ進む</button>
      </div>
    </div>
  `);

  document.getElementById("confirmDepartureItemBtn").addEventListener("click", () => {
    state.departureCheck.index += 1;
    saveState();
    renderDepartureCheck();
  });
  document.getElementById("skipToHomeBtn").addEventListener("click", () => {
    changePhase("home", false);
  });
}

function isAnyDepartureCheckIncomplete() {
  return Boolean(getDueOutingForDepartureCheck());
}

function getDateTimeToday(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const now = getNowInJst();
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(now);
  dt.setHours(h, m, 0, 0);
  return dt;
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
  if (state.phase === "home") return;
  state.homeReturnPhase = state.phase;
  state.navHistory.push(state.phase);
  state.phase = "home";
  saveState();
  render();
}

function goBack() {
  if (state.navHistory.length === 0) return;
  state.phase = state.navHistory.pop();
  saveState();
  render();
}

function changePhase(next, pushHistory = true) {
  if (pushHistory && state.phase !== next) state.navHistory.push(state.phase);
  state.phase = next;
  if (next !== "home") state.homeReturnPhase = next;
  saveState();
  render();
}

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function getPlanningFormTaskName() {
  if (state.planningForm.taskNameChoice === TASK_NAME_NEW) return state.planningForm.customTaskName.trim();
  return state.planningForm.taskNameChoice.trim();
}

function getPlanningFormMinutes() {
  if (state.planningForm.minutesChoice === MINUTES_OTHER) return sanitizeMinutes(state.planningForm.customMinutes);
  return sanitizeMinutes(state.planningForm.minutesChoice);
}

function getSortedTaskNameOptions() {
  return [...state.taskNameStats].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastUsedAt - a.lastUsedAt;
  });
}

function updateTotalPlanned() {
  const totalEl = document.getElementById("totalPlanned");
  if (!totalEl) return;
  totalEl.textContent = `学習予定時間の合計 ${sumPlanned()}分`;
}

function getCounts() {
  const done = state.tasks.filter((t) => t.status === "done").length;
  return { total: state.tasks.length, done, unfinished: state.tasks.length - done };
}

function sumPlanned() {
  return state.tasks.reduce((sum, t) => sum + sanitizeMinutes(t.plannedMinutes), 0);
}

function sumActualMinutes() {
  return state.tasks.reduce((sum, t) => sum + secondsToMinutes(t.actualSeconds), 0);
}

function secondsToMinutes(sec) {
  if (typeof sec !== "number" || sec <= 0) return 0;
  return Math.ceil(sec / 60);
}

function sanitizeMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(600, Math.max(1, Math.round(n)));
}

function sanitizeMinutesOrZero(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function sanitizeTimeValue(value, fallback) {
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function formatTimeForDisplay(value) {
  if (!value) return "--:--";
  const [h, m] = value.split(":");
  return `${Number(h)}:${m}`;
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
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
