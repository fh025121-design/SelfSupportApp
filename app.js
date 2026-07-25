const STORAGE_KEY = "selfSupportAppTrialStateV1";
const DEFAULT_MINUTES = 20;

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

function getTodayDisplayJst() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());
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
      return createInitialStateWithTasks(todayKey, buildCarryoverTasks(parsed));
    }

    const safeState = {
      ...createInitialState(todayKey),
      ...parsed,
      dateKey: todayKey
    };

    safeState.tasks = Array.isArray(safeState.tasks) ? safeState.tasks : [];
    safeState.navHistory = Array.isArray(safeState.navHistory) ? safeState.navHistory : [];
    safeState.planFor = safeState.planFor === "today" ? "today" : "tomorrow";
    safeState.additionalChoice = safeState.additionalChoice === "add" ? "add" : "none";

    safeState.planningForm = {
      ...createPlanningForm(),
      ...(safeState.planningForm || {})
    };
    safeState.planningForm.mode = safeState.planningForm.mode === "edit" ? "edit" : "add";
    safeState.planningForm.name = String(safeState.planningForm.name || "");
    safeState.planningForm.plannedMinutes = sanitizeMinutes(safeState.planningForm.plannedMinutes || DEFAULT_MINUTES);

    safeState.running = {
      taskId: null,
      startedAt: null,
      baseSeconds: 0,
      isPaused: false,
      confirmingComplete: false,
      ...(safeState.running || {})
    };

    safeState.review = {
      pendingIds: [],
      index: 0,
      pendingAction: null,
      draftMemo: "",
      ...(safeState.review || {})
    };

    if (typeof safeState.review.draftMemo !== "string") {
      safeState.review.draftMemo = "";
    }

    safeState.homeReturnPhase = ["planning", "execution", "review", "result"].includes(safeState.homeReturnPhase)
      ? safeState.homeReturnPhase
      : "planning";

    if (!["home", "planning", "execution", "review", "result"].includes(safeState.phase)) {
      safeState.phase = "planning";
    }

    return safeState;
  } catch (error) {
    return createInitialState(todayKey);
  }
}

function createInitialState(todayKey) {
  return createInitialStateWithTasks(todayKey, []);
}

function createInitialStateWithTasks(todayKey, tasks) {
  return {
    dateKey: todayKey,
    phase: "planning",
    navHistory: [],
    homeReturnPhase: "planning",
    planFor: "tomorrow",
    additionalChoice: "none",
    tasks: Array.isArray(tasks) ? tasks : [],
    planningForm: createPlanningForm(),
    running: createRunningState(),
    review: createReviewState(),
    goPressedAt: null
  };
}

function createPlanningForm() {
  return {
    mode: "add",
    targetId: null,
    name: "",
    plannedMinutes: DEFAULT_MINUTES
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

function buildCarryoverTasks(previousState) {
  if (!previousState || !Array.isArray(previousState.tasks)) {
    return [];
  }

  return previousState.tasks
    .filter((task) => task && task.status === "deferred")
    .map((task) => createTask(String(task.name || "").trim(), sanitizeMinutes(task.plannedMinutes)));
}

function createTask(name, plannedMinutes) {
  return {
    id: crypto.randomUUID(),
    name,
    plannedMinutes,
    status: "pending",
    actualSeconds: null,
    memo: "",
    closeAction: ""
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
  const isPaused = Boolean(runningTask && state.running.isPaused);
  const isActive = Boolean(runningTask && !state.running.isPaused);
  const returnPhase = getHomeReturnPhase();

  let actionBlock = `
    <div class="btn-row compact-stack">
      <button id="openPlanningBtn" class="btn-main" type="button">予定確認へ</button>
    </div>
  `;

  if (isPaused) {
    actionBlock = `
      <div class="task-card paused-card">
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>${secondsToMinutes(getRunningElapsedSeconds())}分で中断中</p>
        <div class="btn-row compact-stack">
          <button id="resumePausedBtn" class="btn-main" type="button">再開</button>
          <button id="openPlanningBtn" class="btn-quiet" type="button">予定確認へ</button>
        </div>
      </div>
    `;
  } else if (isActive) {
    actionBlock = `
      <div class="task-card paused-card">
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>実行中: ${getRunningElapsedSeconds()}秒</p>
        <div class="btn-row compact-stack">
          <button id="returnExecutionBtn" class="btn-main" type="button">実行画面へ戻る</button>
          <button id="openPlanningBtn" class="btn-quiet" type="button">予定確認へ</button>
        </div>
      </div>
    `;
  } else if (returnPhase === "review" && hasReviewTarget()) {
    actionBlock = `
      <div class="btn-row compact-stack">
        <button id="resumeReviewBtn" class="btn-main" type="button">終了確認へ戻る</button>
        <button id="openPlanningBtn" class="btn-quiet" type="button">予定確認へ</button>
      </div>
    `;
  } else if (returnPhase === "result") {
    actionBlock = `
      <div class="btn-row compact-stack">
        <button id="resumeResultBtn" class="btn-main" type="button">結果を見る</button>
        <button id="openPlanningBtn" class="btn-quiet" type="button">予定確認へ</button>
      </div>
    `;
  } else if (state.goPressedAt) {
    actionBlock = `
      <div class="btn-row compact-stack">
        <button id="resumeExecutionBtn" class="btn-main" type="button">タスク実行へ戻る</button>
        <button id="openPlanningBtn" class="btn-quiet" type="button">予定確認へ</button>
      </div>
    `;
  }

  renderScreen(`
    <h2>ホーム</h2>
    <p class="helper">現在の進みをここから確認できます。</p>

    <div class="summary">
      <p>予定を作る日: ${state.planFor === "today" ? "今日" : "明日"}</p>
      <p>予定タスク数: ${counts.total}件</p>
      <p>完了数: ${counts.done}件</p>
      <p>未完了数: ${counts.unfinished}件</p>
      <p>合計予定時間: ${sumPlanned()}分</p>
    </div>

    ${actionBlock}
  `);

  document.getElementById("openPlanningBtn")?.addEventListener("click", () => {
    changePhase("planning", false);
  });
  document.getElementById("resumeExecutionBtn")?.addEventListener("click", () => {
    changePhase("execution", false);
  });
  document.getElementById("returnExecutionBtn")?.addEventListener("click", () => {
    changePhase("execution", false);
  });
  document.getElementById("resumeReviewBtn")?.addEventListener("click", () => {
    changePhase("review", false);
  });
  document.getElementById("resumeResultBtn")?.addEventListener("click", () => {
    changePhase("result", false);
  });
  document.getElementById("resumePausedBtn")?.addEventListener("click", () => {
    resumePausedTask();
  });
}

function renderPlanning() {
  const showForm = state.planningForm.mode === "edit" || state.additionalChoice === "add" || state.tasks.length === 0;
  const editingTask = state.planningForm.mode === "edit" ? findTask(state.planningForm.targetId) : null;

  renderScreen(`
    <h2>1. 今日の予定確認</h2>
    <p class="helper">登録済みタスクを確認し、必要なら修正してからGOを押します。</p>

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

    <h3>登録済みタスク</h3>
    <ul id="taskList" class="task-list compact-task-list"></ul>

    <div class="summary" id="totalPlanned"></div>

    <p class="legend">追加事項はありますか？</p>
    <div class="option-group compact-options">
      <label class="option-item">
        <input type="radio" name="additional" value="none" ${state.additionalChoice === "none" ? "checked" : ""} />
        <span>なし</span>
      </label>
      <label class="option-item">
        <input type="radio" name="additional" value="add" ${state.additionalChoice === "add" ? "checked" : ""} />
        <span>追加する</span>
      </label>
    </div>

    <div id="planningFormArea" class="${showForm ? "" : "hidden"}">
      <div class="task-form-box">
        <p class="helper">${editingTask ? "修正する内容を入力してください。" : "次に追加するタスクを入力してください。"}</p>
        <div class="grid-2">
          <div>
            <label for="taskFormName">タスク名</label>
            <input id="taskFormName" type="text" value="${escapeHtml(state.planningForm.name)}" placeholder="例: 数学" maxlength="40" />
          </div>
          <div>
            <label for="taskFormMinutes">予定時間（分）</label>
            <input id="taskFormMinutes" type="number" min="1" max="600" value="${sanitizeMinutes(state.planningForm.plannedMinutes)}" />
          </div>
        </div>
        <div class="btn-row compact-stack">
          <button id="saveTaskBtn" class="btn-sub" type="button">${editingTask ? "修正を保存" : "追加"}</button>
        </div>
      </div>
    </div>

    <hr class="sep" />
    <div class="btn-row">
      <button id="goBtn" class="btn-main" type="button">GO</button>
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

  state.tasks.forEach((task, idx) => {
    const item = document.createElement("li");
    const isEditing = state.planningForm.mode === "edit" && state.planningForm.targetId === task.id;
    item.className = `task-card compact-task-row${isEditing ? " editing-row" : ""}`;
    item.innerHTML = `
      <div class="task-inline-text">${escapeHtml(task.name)} <span>${task.plannedMinutes}分</span></div>
      <div class="task-inline-actions">
        <button type="button" class="btn-mini btn-quiet" data-action="up" data-id="${task.id}" ${idx === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn-mini btn-quiet" data-action="down" data-id="${task.id}" ${idx === state.tasks.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn-mini btn-sub" data-action="edit" data-id="${task.id}">修正</button>
        <button type="button" class="btn-mini btn-danger" data-action="delete" data-id="${task.id}">削除</button>
      </div>
    `;
    list.appendChild(item);
  });

  updateTotalPlanned();
}

function bindPlanningEvents() {
  document.querySelectorAll("input[name='planFor']").forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.planFor = event.target.value === "today" ? "today" : "tomorrow";
      saveState();
    });
  });

  document.querySelectorAll("input[name='additional']").forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.additionalChoice = event.target.value === "add" ? "add" : "none";
      if (state.additionalChoice === "none" && state.planningForm.mode === "add") {
        state.planningForm = createPlanningForm();
      }
      saveState();
      renderPlanning();
    });
  });

  const nameEl = document.getElementById("taskFormName");
  const minutesEl = document.getElementById("taskFormMinutes");
  if (nameEl) {
    nameEl.addEventListener("input", (event) => {
      state.planningForm.name = event.target.value;
      saveState();
    });
  }
  if (minutesEl) {
    minutesEl.addEventListener("input", (event) => {
      state.planningForm.plannedMinutes = sanitizeMinutes(event.target.value);
      event.target.value = state.planningForm.plannedMinutes;
      saveState();
    });
  }

  document.getElementById("saveTaskBtn")?.addEventListener("click", savePlanningTask);

  document.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (!id || !action) return;

      if (action === "up") {
        moveTask(id, -1);
      }
      if (action === "down") {
        moveTask(id, 1);
      }
      if (action === "edit") {
        const task = findTask(id);
        if (!task) return;
        state.planningForm = {
          mode: "edit",
          targetId: id,
          name: task.name,
          plannedMinutes: sanitizeMinutes(task.plannedMinutes)
        };
      }
      if (action === "delete") {
        state.tasks = state.tasks.filter((task) => task.id !== id);
        if (state.planningForm.targetId === id) {
          state.planningForm = createPlanningForm();
        }
      }

      saveState();
      renderPlanning();
    });
  });

  document.getElementById("goBtn").addEventListener("click", onGo);
}

function savePlanningTask() {
  const name = state.planningForm.name.trim();
  const plannedMinutes = sanitizeMinutes(state.planningForm.plannedMinutes);

  if (!name) {
    alert("タスク名を入力してください。");
    document.getElementById("taskFormName")?.focus();
    return;
  }

  if (state.planningForm.mode === "edit") {
    const task = findTask(state.planningForm.targetId);
    if (!task) return;
    task.name = name;
    task.plannedMinutes = plannedMinutes;
    state.planningForm = createPlanningForm();
  } else {
    state.tasks.push(createTask(name, plannedMinutes));
    state.planningForm = createPlanningForm();
  }

  saveState();
  renderPlanning();
}

function onGo() {
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
    alert("タスクが0件のため、GOできません。タスクを追加してください。");
    return;
  }

  const invalid = state.tasks.find((task) => !task.name.trim());
  if (invalid) {
    alert("タスク名が未入力の項目があります。");
    return;
  }

  state.tasks = state.tasks.map((task) => ({
    ...task,
    name: task.name.trim(),
    plannedMinutes: sanitizeMinutes(task.plannedMinutes),
    status: "pending",
    actualSeconds: null,
    memo: "",
    closeAction: ""
  }));

  state.goPressedAt = Date.now();
  state.running = createRunningState();
  state.review = createReviewState();
  changePhase("execution");
}

function renderExecution() {
  const runningTask = getRunningTask();
  const pending = state.tasks.filter((task) => task.status === "pending");

  renderScreen(`
    <h2>2. タスク実行</h2>
    <h2>今やることを選んでください</h2>

    <div id="runArea"></div>

    <hr class="sep" />
    <div class="btn-row compact-stack">
      <button id="finishTodayBtn" class="btn-danger" type="button">今日は終了</button>
    </div>
  `);

  const runArea = document.getElementById("runArea");

  if (runningTask && !state.running.isPaused) {
    const confirmArea = state.running.confirmingComplete
      ? `
        <div class="notice info confirm-box">
          <p>本当に完了しますか？</p>
          <div class="btn-row split compact-stack">
            <button id="confirmCompleteBtn" class="btn-ok" type="button">完了する</button>
            <button id="cancelCompleteBtn" class="btn-quiet" type="button">戻る</button>
          </div>
        </div>
      `
      : "";

    runArea.innerHTML = `
      <div class="timer-box">
        <p class="helper">実行中</p>
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>予定時間: ${runningTask.plannedMinutes}分</p>
        <p class="elapsed" id="elapsedLabel">${getRunningElapsedSeconds()}秒</p>
        <div class="btn-row split compact-stack">
          <button id="completeBtn" class="btn-ok" type="button">完了</button>
          <button id="interruptBtn" class="btn-quiet" type="button">中断</button>
        </div>
        ${confirmArea}
      </div>
    `;

    document.getElementById("completeBtn").addEventListener("click", () => {
      state.running.confirmingComplete = true;
      saveState();
      renderExecution();
    });
    document.getElementById("interruptBtn").addEventListener("click", interruptRunningTask);
    document.getElementById("confirmCompleteBtn")?.addEventListener("click", finalizeTaskCompletion);
    document.getElementById("cancelCompleteBtn")?.addEventListener("click", () => {
      state.running.confirmingComplete = false;
      saveState();
      renderExecution();
    });

    tickTimer = setInterval(() => {
      const label = document.getElementById("elapsedLabel");
      if (!label) return;
      label.textContent = `${getRunningElapsedSeconds()}秒`;
      saveState();
    }, 1000);
  } else if (pending.length > 0) {
    const topThree = pending.slice(0, 3);
    runArea.innerHTML = `
      <ul class="task-list" id="selectList"></ul>
      <p class="notice info">タスクカードをタップすると計測が始まります。</p>
    `;

    const selectList = document.getElementById("selectList");
    topThree.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-card selectable-card";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.dataset.taskId = task.id;
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
    runArea.innerHTML = `
      <p class="notice warn">未完了タスクはありません。</p>
    `;
  }

  document.getElementById("finishTodayBtn").addEventListener("click", startTodayFinishFlow);
}

function startTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== "pending") return;

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

function interruptRunningTask() {
  const runningTask = getRunningTask();
  if (!runningTask) return;

  const elapsed = Math.max(1, getRunningElapsedSeconds());
  runningTask.actualSeconds = elapsed;
  state.running.baseSeconds = elapsed;
  state.running.startedAt = null;
  state.running.isPaused = true;
  state.running.confirmingComplete = false;
  goHome();
}

function resumePausedTask() {
  const runningTask = getRunningTask();
  if (!runningTask || !state.running.isPaused) return;

  state.running.startedAt = Date.now();
  state.running.baseSeconds = typeof runningTask.actualSeconds === "number" ? runningTask.actualSeconds : state.running.baseSeconds;
  state.running.isPaused = false;
  state.running.confirmingComplete = false;
  changePhase("execution", false);
}

function finalizeTaskCompletion() {
  const runningTask = getRunningTask();
  if (!runningTask) return;

  const elapsed = Math.max(1, getRunningElapsedSeconds());
  runningTask.actualSeconds = elapsed;
  runningTask.status = "done";
  state.running = createRunningState();
  saveState();
  renderExecution();
}

function getRunningTask() {
  if (!state.running || !state.running.taskId) return null;
  return findTask(state.running.taskId);
}

function getRunningElapsedSeconds() {
  if (!state.running || !state.running.taskId) {
    return 0;
  }

  if (!state.running.startedAt) {
    return Math.max(0, state.running.baseSeconds || 0);
  }

  const passed = Math.floor((Date.now() - state.running.startedAt) / 1000);
  return Math.max(0, (state.running.baseSeconds || 0) + passed);
}

function startTodayFinishFlow() {
  const runningTask = getRunningTask();
  if (runningTask) {
    runningTask.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  }

  state.running = createRunningState();
  state.review = {
    pendingIds: state.tasks.filter((task) => task.status === "pending").map((task) => task.id),
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
      <h2>3. 今日は終了</h2>
      <p class="helper">未完了タスクの確認が終わりました。</p>
      <div class="btn-row compact-stack">
        <button id="toResultBtn" class="btn-main" type="button">結果を見る</button>
      </div>
    `);

    document.getElementById("toResultBtn").addEventListener("click", () => {
      changePhase("result");
    });
    return;
  }

  renderScreen(`
    <h2>3. 今日は終了</h2>
    <p class="helper">未完了タスクを1件ずつ確認します。</p>

    <div class="task-card">
      <h3>${escapeHtml(task.name)}</h3>
      <p>予定時間: ${task.plannedMinutes}分</p>
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

  document.getElementById("doTodayBtn").addEventListener("click", () => {
    startTask(task.id);
  });
  document.getElementById("moveTomorrowBtn").addEventListener("click", () => showMemoPanel("deferred"));
  document.getElementById("dropTaskBtn").addEventListener("click", () => showMemoPanel("discarded"));

  if (state.review.pendingAction === "deferred" || state.review.pendingAction === "discarded") {
    showMemoPanel(state.review.pendingAction, true);
  }
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

function renderResult() {
  const done = state.tasks.filter((task) => task.status === "done");
  const deferred = state.tasks.filter((task) => task.status === "deferred");
  const discarded = state.tasks.filter((task) => task.status === "discarded");
  const unfinished = state.tasks.length - done.length;
  const totalPlanned = sumPlanned();
  const totalActual = sumActualMinutes();
  const reportText = buildReportText({
    total: state.tasks.length,
    done,
    unfinished,
    totalPlanned,
    totalActual,
    deferred,
    discarded
  });

  renderScreen(`
    <h2>4. 今日の結果</h2>

    <div class="summary">
      <p>今日の予定タスク数: ${state.tasks.length}件</p>
      <p>完了数: ${done.length}件</p>
      <p>未完了数: ${unfinished}件</p>
      <p>合計予定時間: ${totalPlanned}分</p>
      <p>合計実績時間: ${totalActual}分</p>
    </div>

    <h3>各タスク</h3>
    <ul class="result-list" id="taskResultList"></ul>

    <h3>保護者への報告文</h3>
    <div id="reportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyBtn" class="btn-main" type="button">報告文をコピー</button>
    </div>
    <p id="copyMessage" class="helper" aria-live="polite"></p>
  `);

  const resultList = document.getElementById("taskResultList");
  state.tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "result-card";
    li.innerHTML = `
      <h3>${escapeHtml(task.name)}</h3>
      <p>予定時間: ${task.plannedMinutes}分</p>
      <p>実績時間: ${secondsToMinutes(task.actualSeconds)}分</p>
      <p>状態: ${getTaskStatusLabel(task.status)}</p>
      ${task.status === "deferred" || task.status === "discarded" ? `<p>メモ: ${escapeHtml(task.memo || "(未入力)")}</p>` : ""}
    `;
    resultList.appendChild(li);
  });

  document.getElementById("reportText").textContent = reportText;
  document.getElementById("copyBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(reportText);
    document.getElementById("copyMessage").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
}

function buildReportText(data) {
  const lines = [];
  lines.push("【今日の結果】");
  lines.push("");
  lines.push(`予定：${data.total}件`);
  lines.push(`完了：${data.done.length}件`);
  lines.push(`未完了：${data.unfinished}件`);
  lines.push("");
  lines.push(`予定時間：${data.totalPlanned}分`);
  lines.push(`実績時間：${data.totalActual}分`);
  lines.push("");

  if (data.done.length > 0) {
    lines.push("完了");
    data.done.forEach((task) => {
      lines.push(`・${task.name}　予定${task.plannedMinutes}分／実績${secondsToMinutes(task.actualSeconds)}分`);
    });
    lines.push("");
  }

  if (data.deferred.length > 0) {
    lines.push("明日に回す");
    data.deferred.forEach((task) => {
      lines.push(`・${task.name}`);
      lines.push(`　理由：${task.memo || "(未入力)"}`);
    });
    lines.push("");
  }

  if (data.discarded.length > 0) {
    lines.push("不要になった");
    data.discarded.forEach((task) => {
      lines.push(`・${task.name}`);
      lines.push(`　理由：${task.memo || "(未入力)"}`);
    });
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function getTaskStatusLabel(status) {
  if (status === "done") return "完了";
  if (status === "deferred") return "明日に回す";
  if (status === "discarded") return "不要になった";
  return "未完了";
}

function renderScreen(content) {
  app.innerHTML = `${renderTopNav()}${content}`;
  bindTopNav();
}

function renderTopNav() {
  const disabled = state.navHistory.length === 0 ? "disabled" : "";
  return `
    <div class="top-nav">
      <button id="homeBtn" class="btn-mini btn-quiet" type="button">ホーム</button>
      <button id="backBtn" class="btn-mini btn-quiet" type="button" ${disabled}>戻る</button>
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

function getHomeReturnPhase() {
  if (["planning", "execution", "review", "result"].includes(state.homeReturnPhase)) {
    return state.homeReturnPhase;
  }
  return "planning";
}

function hasReviewTarget() {
  moveReviewCursorToPending();
  return Boolean(getCurrentReviewTask());
}

function getCounts() {
  const done = state.tasks.filter((task) => task.status === "done").length;
  return {
    total: state.tasks.length,
    done,
    unfinished: state.tasks.length - done
  };
}

function findTask(id) {
  return state.tasks.find((task) => task.id === id);
}

function moveTask(id, direction) {
  const idx = state.tasks.findIndex((task) => task.id === id);
  if (idx === -1) return;

  const next = idx + direction;
  if (next < 0 || next >= state.tasks.length) return;

  const temp = state.tasks[idx];
  state.tasks[idx] = state.tasks[next];
  state.tasks[next] = temp;
}

function updateTotalPlanned() {
  const totalEl = document.getElementById("totalPlanned");
  if (!totalEl) return;
  totalEl.textContent = `合計予定時間 ${sumPlanned()}分`;
}

function sumPlanned() {
  return state.tasks.reduce((sum, task) => sum + sanitizeMinutes(task.plannedMinutes), 0);
}

function sumActualMinutes() {
  return state.tasks.reduce((sum, task) => sum + secondsToMinutes(task.actualSeconds), 0);
}

function secondsToMinutes(sec) {
  if (typeof sec !== "number" || sec <= 0) return 0;
  return Math.ceil(sec / 60);
}

function sanitizeMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(600, Math.max(1, Math.round(n)));
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
