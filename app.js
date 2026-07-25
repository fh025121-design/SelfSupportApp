const STORAGE_KEY = "selfSupportAppTrialStateV1";

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

    if (!Array.isArray(safeState.tasks)) {
      safeState.tasks = [];
    }

    if (safeState.tasks.length === 0) {
      safeState.tasks = [createTask("", 30)];
    }

    if (!safeState.running) {
      safeState.running = { taskId: null, startedAt: null, baseSeconds: 0 };
    }

    if (!safeState.review) {
      safeState.review = { pendingIds: [], index: 0, pendingAction: null, draftMemo: "" };
    }

    if (typeof safeState.review.draftMemo !== "string") {
      safeState.review.draftMemo = "";
    }

    return safeState;
  } catch (e) {
    return createInitialState(todayKey);
  }
}

function createInitialState(todayKey) {
  return createInitialStateWithTasks(todayKey, [createTask("", 30)]);
}

function createInitialStateWithTasks(todayKey, tasks) {
  const initialTasks = Array.isArray(tasks) && tasks.length > 0 ? tasks : [createTask("", 30)];
  return {
    dateKey: todayKey,
    phase: "planning",
    additionalChoice: "none",
    tasks: initialTasks,
    running: {
      taskId: null,
      startedAt: null,
      baseSeconds: 0
    },
    review: {
      pendingIds: [],
      index: 0,
      pendingAction: null,
      draftMemo: ""
    },
    goPressedAt: null
  };
}

function buildCarryoverTasks(previousState) {
  if (!previousState || !Array.isArray(previousState.tasks)) {
    return [createTask("", 30)];
  }

  const carried = previousState.tasks
    .filter((task) => task && task.status === "deferred")
    .map((task) => createTask(String(task.name || "").trim(), sanitizeMinutes(task.plannedMinutes)));

  if (carried.length > 0) {
    return carried;
  }
  return [createTask("", 30)];
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

function renderPlanning() {
  app.innerHTML = `
    <h2>1. 今日の予定確認</h2>
    <p class="helper">タスク名と予定時間を入れて、今日の最終予定を作成します。</p>
    <ul id="taskList" class="task-list"></ul>

    <div class="summary" id="totalPlanned"></div>

    <p class="legend">追加事項はありますか？</p>
    <div class="option-group">
      <label class="option-item">
        <input type="radio" name="additional" value="none" ${state.additionalChoice === "none" ? "checked" : ""} />
        <span>なし</span>
      </label>
      <label class="option-item">
        <input type="radio" name="additional" value="add" ${state.additionalChoice === "add" ? "checked" : ""} />
        <span>追加する</span>
      </label>
    </div>

    <div id="additionalPanel" class="hidden">
      <p class="inline-text">追加タスクを登録できます。</p>
      <div class="grid-2">
        <div>
          <label for="newTaskName">タスク名</label>
          <input id="newTaskName" type="text" placeholder="例: 英検" maxlength="40" />
        </div>
        <div>
          <label for="newTaskMinutes">予定時間（分）</label>
          <input id="newTaskMinutes" type="number" min="1" max="600" value="20" />
        </div>
      </div>
      <div class="btn-row">
        <button id="addAdditionalBtn" class="btn-sub" type="button">追加タスクを登録</button>
      </div>
    </div>

    <hr class="sep" />
    <div class="btn-row">
      <button id="goBtn" class="btn-main" type="button">GO</button>
    </div>
  `;

  renderTaskListForPlanning();
  bindPlanningEvents();
}

function renderTaskListForPlanning() {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  state.tasks.forEach((task, idx) => {
    const li = document.createElement("li");
    li.className = "task-card";
    li.innerHTML = `
      <h3>タスク ${idx + 1}</h3>
      <div class="grid-2">
        <div>
          <label for="name-${task.id}">タスク名</label>
          <input id="name-${task.id}" type="text" value="${escapeHtml(task.name)}" maxlength="40" />
        </div>
        <div>
          <label for="minutes-${task.id}">予定時間（分）</label>
          <input id="minutes-${task.id}" type="number" min="1" max="600" value="${Number(task.plannedMinutes) || 1}" />
        </div>
      </div>

      <div class="btn-row split">
        <button type="button" class="btn-quiet" data-action="up" data-id="${task.id}" ${idx === 0 ? "disabled" : ""}>上へ</button>
        <button type="button" class="btn-quiet" data-action="down" data-id="${task.id}" ${idx === state.tasks.length - 1 ? "disabled" : ""}>下へ</button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn-sub" data-action="add" data-id="${task.id}">この下に追加</button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn-danger" data-action="delete" data-id="${task.id}">削除</button>
      </div>
    `;
    list.appendChild(li);
  });

  updateTotalPlanned();

  const additionalPanel = document.getElementById("additionalPanel");
  if (state.additionalChoice === "add") {
    additionalPanel.classList.remove("hidden");
  } else {
    additionalPanel.classList.add("hidden");
  }
}

function bindPlanningEvents() {
  const list = document.getElementById("taskList");

  list.querySelectorAll("input[id^='name-']").forEach((input) => {
    input.addEventListener("input", (e) => {
      const id = e.target.id.replace("name-", "");
      const task = findTask(id);
      if (!task) return;
      task.name = e.target.value;
      saveState();
    });
  });

  list.querySelectorAll("input[id^='minutes-']").forEach((input) => {
    input.addEventListener("input", (e) => {
      const id = e.target.id.replace("minutes-", "");
      const task = findTask(id);
      if (!task) return;
      task.plannedMinutes = sanitizeMinutes(e.target.value);
      e.target.value = task.plannedMinutes;
      updateTotalPlanned();
      saveState();
    });
  });

  list.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (!id || !action) return;
      if (action === "delete") {
        if (state.tasks.length === 1) {
          alert("タスクは1件以上必要です。");
          return;
        }
        state.tasks = state.tasks.filter((t) => t.id !== id);
      }
      if (action === "up") {
        moveTask(id, -1);
      }
      if (action === "down") {
        moveTask(id, 1);
      }
      if (action === "add") {
        insertTaskAfter(id);
      }
      saveState();
      renderPlanning();
    });
  });

  document.querySelectorAll("input[name='additional']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.additionalChoice = e.target.value;
      saveState();
      renderPlanning();
    });
  });

  const addAdditionalBtn = document.getElementById("addAdditionalBtn");
  if (addAdditionalBtn) {
    addAdditionalBtn.addEventListener("click", () => {
      const nameEl = document.getElementById("newTaskName");
      const minutesEl = document.getElementById("newTaskMinutes");
      const name = nameEl.value.trim();
      const planned = sanitizeMinutes(minutesEl.value);
      if (!name) {
        alert("追加タスク名を入力してください。");
        nameEl.focus();
        return;
      }
      state.tasks.push(createTask(name, planned));
      nameEl.value = "";
      minutesEl.value = "20";
      saveState();
      renderPlanning();
    });
  }

  document.getElementById("goBtn").addEventListener("click", onGo);
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

  state.phase = "execution";
  state.goPressedAt = Date.now();
  state.running = { taskId: null, startedAt: null, baseSeconds: 0 };
  state.review = { pendingIds: [], index: 0, pendingAction: null, draftMemo: "" };
  saveState();
  render();
}

function renderExecution() {
  const runningTask = getRunningTask();
  const pending = state.tasks.filter((t) => t.status === "pending");

  app.innerHTML = `
    <h2>2. タスク実行</h2>
    <h2>今やることを選んでください</h2>

    <div id="runArea"></div>

    <hr class="sep" />
    <div class="btn-row">
      <button id="finishTodayBtn" class="btn-danger" type="button">今日は終了</button>
    </div>
  `;

  const runArea = document.getElementById("runArea");

  if (runningTask) {
    runArea.innerHTML = `
      <div class="timer-box">
        <p class="helper">実行中</p>
        <h3>${escapeHtml(runningTask.name)}</h3>
        <p>予定時間: ${runningTask.plannedMinutes}分</p>
        <p class="elapsed" id="elapsedLabel">${getRunningElapsedSeconds()}秒</p>
        <div class="btn-row">
          <button id="completeBtn" class="btn-ok" type="button">完了</button>
        </div>
      </div>
    `;

    document.getElementById("completeBtn").addEventListener("click", completeRunningTask);

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
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
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
    baseSeconds: 0
  };
  saveState();
  render();
}

function completeRunningTask() {
  const runningTask = getRunningTask();
  if (!runningTask) return;

  const elapsed = Math.max(1, getRunningElapsedSeconds());
  runningTask.actualSeconds = elapsed;
  runningTask.status = "done";

  state.running = { taskId: null, startedAt: null, baseSeconds: 0 };
  saveState();
  render();
}

function getRunningTask() {
  if (!state.running || !state.running.taskId) return null;
  return findTask(state.running.taskId);
}

function getRunningElapsedSeconds() {
  if (!state.running || !state.running.taskId || !state.running.startedAt) {
    return 0;
  }
  const passed = Math.floor((Date.now() - state.running.startedAt) / 1000);
  return Math.max(0, (state.running.baseSeconds || 0) + passed);
}

function startTodayFinishFlow() {
  // Treat running task as unfinished when entering finish review.
  state.running = { taskId: null, startedAt: null, baseSeconds: 0 };

  const pendingIds = state.tasks.filter((t) => t.status === "pending").map((t) => t.id);
  state.phase = "review";
  state.review = {
    pendingIds,
    index: 0,
    pendingAction: null,
    draftMemo: ""
  };
  saveState();
  render();
}

function renderReview() {
  moveReviewCursorToPending();

  const task = getCurrentReviewTask();
  if (!task) {
    app.innerHTML = `
      <h2>3. 今日終了</h2>
      <p class="helper">未完了タスクの確認が完了しました。</p>
      <div class="btn-row">
        <button id="toResultBtn" class="btn-main" type="button">結果を見る</button>
      </div>
    `;

    document.getElementById("toResultBtn").addEventListener("click", () => {
      state.phase = "result";
      saveState();
      render();
    });
    return;
  }

  app.innerHTML = `
    <h2>3. 今日終了</h2>
    <p class="helper">未完了タスクを1件ずつ確認します。</p>

    <div class="task-card">
      <h3>${escapeHtml(task.name)}</h3>
      <p>予定時間: ${task.plannedMinutes}分</p>
    </div>

    <div class="btn-row triple">
      <button id="doTodayBtn" class="btn-main" type="button">今日やる</button>
      <button id="moveTomorrowBtn" class="btn-sub" type="button">明日に回す</button>
      <button id="dropTaskBtn" class="btn-danger" type="button">不要になった</button>
    </div>

    <div id="memoPanel" class="hidden">
      <label for="reviewMemo">自由記述メモ</label>
      <textarea id="reviewMemo" placeholder="理由や状況を自由に入力"></textarea>
      <div class="btn-row">
        <button id="saveReviewBtn" class="btn-main" type="button">この内容で次へ</button>
      </div>
    </div>
  `;

  document.getElementById("doTodayBtn").addEventListener("click", () => {
    state.running = {
      taskId: task.id,
      startedAt: Date.now(),
      baseSeconds: 0
    };
    state.phase = "execution";
    state.review.pendingAction = null;
    state.review.draftMemo = "";
    saveState();
    render();
  });

  document.getElementById("moveTomorrowBtn").addEventListener("click", () => showMemoPanel("deferred"));
  document.getElementById("dropTaskBtn").addEventListener("click", () => showMemoPanel("discarded"));

  if (state.review.pendingAction === "deferred" || state.review.pendingAction === "discarded") {
    showMemoPanel(state.review.pendingAction, true);
  }
}

function showMemoPanel(action, skipReset = false) {
  state.review.pendingAction = action;
  if (!skipReset) {
    state.review.draftMemo = "";
  }
  saveState();

  const panel = document.getElementById("memoPanel");
  panel.classList.remove("hidden");

  const memoEl = document.getElementById("reviewMemo");
  memoEl.value = state.review.draftMemo || "";
  memoEl.addEventListener("input", (e) => {
    state.review.draftMemo = e.target.value;
    saveState();
  });

  const saveBtn = document.getElementById("saveReviewBtn");
  saveBtn.onclick = () => {
    const task = getCurrentReviewTask();
    if (!task) return;

    const memo = memoEl.value.trim();
    task.status = action;
    task.closeAction = action;
    task.memo = memo;

    state.review.index += 1;
    state.review.pendingAction = null;
    state.review.draftMemo = "";
    saveState();
    render();
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
  const done = state.tasks.filter((t) => t.status === "done");
  const deferred = state.tasks.filter((t) => t.status === "deferred");
  const discarded = state.tasks.filter((t) => t.status === "discarded");
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

  app.innerHTML = `
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
    <div class="btn-row">
      <button id="copyBtn" class="btn-main" type="button">報告文をコピー</button>
    </div>
    <p id="copyMessage" class="helper" aria-live="polite"></p>
  `;

  const resultList = document.getElementById("taskResultList");
  state.tasks.forEach((t) => {
    const actualMinutes = `${secondsToMinutes(t.actualSeconds)}分`;
    const statusLabel = getTaskStatusLabel(t.status);
    const memoBlock = (t.status === "deferred" || t.status === "discarded")
      ? `<p>メモ: ${escapeHtml(t.memo || "(未入力)")}</p>`
      : "";
    const li = document.createElement("li");
    li.className = "result-card";
    li.innerHTML = `
      <h3>${escapeHtml(t.name)}</h3>
      <p>予定時間: ${t.plannedMinutes}分</p>
      <p>実績時間: ${actualMinutes}</p>
      <p>状態: ${statusLabel}</p>
      ${memoBlock}
    `;
    resultList.appendChild(li);
  });

  document.getElementById("reportText").textContent = reportText;
  document.getElementById("copyBtn").addEventListener("click", async () => {
    const copyMessageEl = document.getElementById("copyMessage");
    const ok = await copyToClipboard(reportText);
    copyMessageEl.textContent = ok ? "コピーしました" : "コピーに失敗しました";
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
    data.done.forEach((t) => {
      lines.push(`・${t.name}　予定${t.plannedMinutes}分／実績${secondsToMinutes(t.actualSeconds)}分`);
    });
    lines.push("");
  }

  if (data.deferred.length > 0) {
    lines.push("明日に回す");
    data.deferred.forEach((t) => {
      lines.push(`・${t.name}`);
      lines.push(`　理由：${t.memo || "(未入力)"}`);
    });
    lines.push("");
  }

  if (data.discarded.length > 0) {
    lines.push("不要になった");
    data.discarded.forEach((t) => {
      lines.push(`・${t.name}`);
      lines.push(`　理由：${t.memo || "(未入力)"}`);
    });
  }

  // Avoid trailing empty lines in clipboard text.
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

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function moveTask(id, direction) {
  const idx = state.tasks.findIndex((t) => t.id === id);
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

function insertTaskAfter(id) {
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  state.tasks.splice(idx + 1, 0, createTask("", 20));
}

function sumPlanned() {
  return state.tasks.reduce((sum, t) => sum + sanitizeMinutes(t.plannedMinutes), 0);
}

function sumActualMinutes() {
  return state.tasks.reduce((sum, t) => {
    if (typeof t.actualSeconds !== "number") return sum;
    return sum + secondsToMinutes(t.actualSeconds);
  }, 0);
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

function formatElapsed(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
    } catch (e) {
      return false;
    }
  }
}
