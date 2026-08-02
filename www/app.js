import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQjvGNR-C_vSTlihkuFn9WIx31eQrjS_Q",
  authDomain: "selfsupportapp-web.firebaseapp.com",
  projectId: "selfsupportapp-web",
  storageBucket: "selfsupportapp-web.firebasestorage.app",
  messagingSenderId: "714557706189",
  appId: "1:714557706189:web:53fbfed35647ec89bd7e84"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const STORAGE_KEY = "selfSupportAppTrialStateV3";
const STORAGE_OWNER_UID_KEY = "selfSupportAppTrialStateV3_ownerUid";
const DEFAULT_MINUTES = 30;
const EXECUTION_SELECT_LIMIT = 5;
const TASK_NAME_NEW = "__new__";
const SUBMISSION_TEMPLATE_NONE = "";
const HOMEWORK_WORK_TYPE_WITH_WORK = "with-work";
const HOMEWORK_WORK_TYPE_NO_WORK = "no-work";
const STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID = "standard-homework-submission";
const NO_HOMEWORK_SUBMISSION_TEMPLATE_ID = "no-homework-submission";
const NO_HOMEWORK_FIRST_STEP_LABEL = "黒の手帳へ書いた";
const NO_HOMEWORK_FIRST_STEP_LABEL_LEGACY = "黒の手帳へ記録した";
const NO_HOMEWORK_SECOND_STEP_LABEL = "カバンへ入れた";
const NO_HOMEWORK_SECOND_STEP_LABEL_LEGACY = "かばんへ入れた";
const NO_HOMEWORK_THIRD_STEP_LABEL = "提出した";
const NO_HOMEWORK_FOURTH_STEP_LABEL = "報告した";
const NO_HOMEWORK_FOURTH_STEP_LABEL_LEGACY = "親へ報告した";
const CONTENT_ASSIST_EXACT_MATCH_WORDS = new Set([
  "問題集",
  "プリント",
  "教科書",
  "ワーク",
  "宿題",
  "提出",
  "確認",
  "質問",
  "勉強",
  "やる",
  "ノート",
  "テスト"
]);
const DEFAULT_SUBMISSION_TEMPLATES = [
  {
    id: STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID,
    name: "通常の提出",
    items: [
      { id: "standard-homework-1", label: "黒の手帳へ書いた" },
      { id: "standard-homework-2", label: "カバンへ入れた" },
      { id: "standard-homework-3", label: "提出した" },
      { id: "standard-homework-4", label: "報告した" }
    ]
  },
  {
    id: NO_HOMEWORK_SUBMISSION_TEMPLATE_ID,
    name: "書類提出・質問・確認（自宅での作業なし）",
    items: [
      { id: "no-homework-1", label: "黒の手帳へ書いた" },
      { id: "no-homework-2", label: "カバンへ入れた" },
      { id: "no-homework-3", label: "提出した" },
      { id: "no-homework-4", label: "報告した" }
    ]
  },
  {
    id: "school-submission",
    name: "学校提出物",
    items: [
      { id: "school-submission-1", label: "宿題を終えた" },
      { id: "school-submission-2", label: "やりなおしをした" },
      { id: "school-submission-3", label: "鞄へ入れた" },
      { id: "school-submission-4", label: "提出した" }
    ]
  },
  {
    id: "harada",
    name: "原田先生",
    items: [
      { id: "harada-1", label: "宿題を終えた" },
      { id: "harada-2", label: "やりなおしをした" },
      { id: "harada-3", label: "写真を提出した" }
    ]
  },
  {
    id: "iwamaru",
    name: "岩丸先生",
    items: [
      { id: "iwamaru-1", label: "宿題を終えた" },
      { id: "iwamaru-2", label: "やりなおしをした" },
      { id: "iwamaru-3", label: "チェックリストを確認した" },
      { id: "iwamaru-4", label: "父へ報告した" },
      { id: "iwamaru-5", label: "写真を提出した" }
    ]
  }
];
function normalizeDepartureNotificationSettings(raw) {
  const base = { ...createDepartureNotificationSettings(), ...(raw || {}) };
  if (base.leadMinutes === null || base.leadMinutes === "none") {
    base.leadMinutes = null;
    return base;
  }
  const leadMinutes = Number(base.leadMinutes);
  base.leadMinutes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(leadMinutes)
    ? leadMinutes
    : DEFAULT_DEPARTURE_NOTIFICATION_LEAD_MINUTES;
  return base;
}
const MINUTE_OPTIONS = [10, 20, 30, 40, 60];
const RECURRING_DAY_KEYS = ["daily", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const RECURRING_DAY_LABELS = {
  daily: "毎日",
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
  sat: "土",
  sun: "日"
};
const DEPARTURE_CHECK_ITEMS = [
  "テーブルに物は残っていないか",
  "コンタクトのゴミを捨てたか",
  "提出物・持ち物を指差し確認・目視したか",
  "今日の予定に目を通したか",
  "スマホを玄関へ置いたか"
];

const app = document.getElementById("app");
const todayLabel = document.getElementById("todayLabel");
const syncHeaderLabel = document.getElementById("syncHeaderLabel");
const headerHomeActions = document.getElementById("headerHomeActions");

let tickTimer = null;
let phaseRefreshTimer = null;
let notificationAudioCtx = null;
let secondAlertTimeoutId = null;
let secondAlertScheduledKey = "";
let secondAlertActiveOscillators = [];
let secondAlertActiveGains = [];
let authReady = false;
let authErrorMessage = "";
let authLoading = false;
let currentUser = null;
let syncStatus = "syncing";
let syncReady = false;
let syncOwnerUid = null;
let syncUnsubscribe = null;
let syncSaveTimer = null;
let syncSaveInFlight = false;
let isApplyingRemoteState = false;
let lastSavedStateHash = "";
let syncWritesBlocked = false;
let localBootHasValidData = false;
let localBootRawExisted = false;
let localBootOwnerUid = "";
let isTextInputFocused = false;
let isComposingText = false;
let pendingRemoteState = null;
let pendingRemoteHash = "";
let pendingPassiveRender = false;
let deferredUiBlockUntil = 0;
let activeSaveActionKey = "";
let uiNotice = { type: "", text: "" };
let uiNoticeTimer = null;
let pendingSyncHash = "";
let syncDrainPromise = null;
let resolveSyncDrainPromise = null;
let devAlertTestConfig = {
  volume: 5,
  toneType: "type1",
  durationSeconds: 5
};

const SECOND_ALERT_DELAY_MS = 30 * 1000;
const SECOND_ALERT_DURATION_SECONDS = 10;
const UNIFIED_ALERT_NOTIFICATION_CHANNEL_ID = "task-alert-v2";
const DEFAULT_ALARM_SOUND_MARKER = "__DEFAULT_ALARM__";
const DEFAULT_NOTIFICATION_SOUND_MARKER = "__DEFAULT_NOTIFICATION__";
const LEGACY_ALERT_NOTIFICATION_CHANNEL_IDS = ["task-finish-test"];
const LOCAL_NOTIFICATION_TEST_NOTIFICATION_ID = 10001;
const TASK_FINISH_NOTIFICATION_ID_BASE = 20000;
const TASK_FINISH_NOTIFICATION_ID_RANGE = 60000;
const DEPARTURE_NOTIFICATION_ID_BASE = 80000;
const DEPARTURE_NOTIFICATION_ID_RANGE = 60000;
const MEDICINE_REMINDER_NOTIFICATION_ID_BASE = 140000;
const MEDICINE_REMINDER_NOTIFICATION_ID_RANGE = 30000;
const MEDICINE_REMINDER_FIRST_HOUR = 18;
const MEDICINE_REMINDER_FIRST_MINUTE = 0;
const MEDICINE_REMINDER_INTERVAL_MINUTES = 15;
const MEDICINE_REMINDER_LAST_HOUR = 23;
const MEDICINE_REMINDER_LAST_MINUTE = 45;
const MEDICINE_TYPE_BLUE = "blue";
const MEDICINE_TYPE_RED = "red";
const HISTORY_EVENT_TYPE_CHECK_DEPARTURE_COMPLETED = "check_departure_completed";
const HISTORY_EVENT_TYPE_CHECK_RETURN_COMPLETED = "check_return_completed";
const HISTORY_EVENT_TYPE_MEDICINE_BLUE_COMPLETED = "medicine_blue_completed";
const HISTORY_EVENT_TYPE_MEDICINE_RED_COMPLETED = "medicine_red_completed";
const HISTORY_EVENT_TYPE_TASK_STARTED = "task_started";
const HISTORY_EVENT_TYPE_TASK_PAUSED = "task_paused";
const HISTORY_EVENT_TYPE_TASK_RESUMED = "task_resumed";
const HISTORY_EVENT_TYPE_TASK_COMPLETED = "task_completed";
const HISTORY_EVENT_TYPES = new Set([
  HISTORY_EVENT_TYPE_CHECK_DEPARTURE_COMPLETED,
  HISTORY_EVENT_TYPE_CHECK_RETURN_COMPLETED,
  HISTORY_EVENT_TYPE_MEDICINE_BLUE_COMPLETED,
  HISTORY_EVENT_TYPE_MEDICINE_RED_COMPLETED,
  HISTORY_EVENT_TYPE_TASK_STARTED,
  HISTORY_EVENT_TYPE_TASK_PAUSED,
  HISTORY_EVENT_TYPE_TASK_RESUMED,
  HISTORY_EVENT_TYPE_TASK_COMPLETED
]);
const HISTORY_EVENT_DISPLAYABLE_TYPES = new Set([
  HISTORY_EVENT_TYPE_CHECK_DEPARTURE_COMPLETED,
  HISTORY_EVENT_TYPE_CHECK_RETURN_COMPLETED,
  HISTORY_EVENT_TYPE_MEDICINE_BLUE_COMPLETED,
  HISTORY_EVENT_TYPE_MEDICINE_RED_COMPLETED,
  HISTORY_EVENT_TYPE_TASK_STARTED,
  HISTORY_EVENT_TYPE_TASK_PAUSED,
  HISTORY_EVENT_TYPE_TASK_RESUMED,
  HISTORY_EVENT_TYPE_TASK_COMPLETED
]);
const DEFAULT_DEPARTURE_NOTIFICATION_LEAD_MINUTES = 10;

const SYNC_SCHEMA_VERSION = 1;
const SYNC_SAVE_DEBOUNCE_MS = 700;
const SYNC_DEBUG = ["localhost", "127.0.0.1"].includes(window.location.hostname);

let localNotificationTestMessage = "";
let localNotificationsPluginRef = null;
let ringtonePickerPluginRef = null;
let planningRecurringPickerOpen = false;
let localNotificationListenerRegistered = false;
let lastAppliedNotificationSoundConfigHash = "";

const NOTIFICATION_SOUND_TARGET_DEPARTURE = "departure";
const NOTIFICATION_SOUND_TARGET_TASK_FINISH = "taskFinish";
const NOTIFICATION_SOUND_TARGET_TASK_RECHECK = "taskRecheck";

function getNotificationSoundTargetPrefix(target) {
  if (target === NOTIFICATION_SOUND_TARGET_DEPARTURE) return "departure-alarm";
  if (target === NOTIFICATION_SOUND_TARGET_TASK_RECHECK) return "task-recheck-sound";
  return "task-finish-sound";
}

function getNotificationSoundFallbackTitle(toneType) {
  return toneType === "alarm" ? "端末の既定アラーム" : "端末の既定通知";
}

function buildNotificationChannelId(target, toneType, uri) {
  const normalizedToneType = toneType === "alarm" ? "alarm" : "notification";
  const fallbackMarker = normalizedToneType === "alarm" ? DEFAULT_ALARM_SOUND_MARKER : DEFAULT_NOTIFICATION_SOUND_MARKER;
  const source = String(uri || fallbackMarker);
  const hash = hashStringToPositiveInt(`${target}::${normalizedToneType}::${source}`).toString(36).slice(0, 8);
  return `${getNotificationSoundTargetPrefix(target)}-${hash || "default"}`;
}

const state = loadState();
setupInputGuard();
initializeLocalNotificationTrial();
setupLocalNotificationActionListener();
restorePendingTaskFinishNotification();
restorePendingDepartureNotification();
requestMedicineReminderNotificationRefresh();
render();

window.addEventListener("online", () => {
  if (syncStatus === "offline") {
    syncStatus = syncReady ? "synced" : "syncing";
    requestPassiveRender();
  }
});

window.addEventListener("offline", () => {
  syncStatus = "offline";
  requestPassiveRender();
});

onAuthStateChanged(auth, async (user) => {
  authReady = true;
  authLoading = false;
  authErrorMessage = "";

  if (!user) {
    currentUser = null;
    teardownSyncSession();
    render();
    return;
  }

  currentUser = user;
  try {
    await startSyncSessionForUser(user);
  } catch (error) {
    reportFirestoreError("session-init", error);
    syncStatus = navigator.onLine ? "error" : "offline";
    syncOwnerUid = user.uid;
    syncReady = true;
  }
  render();
});

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
    taskName: "",
    taskNameChoice: TASK_NAME_NEW,
    customTaskName: "",
    minutesChoice: String(DEFAULT_MINUTES),
    customMinutes: String(DEFAULT_MINUTES),
    content: "",
    submissionTemplateId: SUBMISSION_TEMPLATE_NONE
  };
}

function createRecurringForm() {
  return {
    mode: "add",
    targetId: null,
    name: "",
    minutes: String(DEFAULT_MINUTES),
    content: "",
    belongings: [],
    belongingInput: "",
    submissionTemplateId: SUBMISSION_TEMPLATE_NONE,
    repeatType: "daily",
    days: [],
    googleSync: false
  };
}

function createHomeworkForm() {
  return {
    mode: "add",
    targetId: null,
    name: "",
    deadlineDate: "",
    content: "",
    homeworkWorkType: HOMEWORK_WORK_TYPE_WITH_WORK,
    googleSync: false,
    done: false,
    submissionTemplateId: STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID
  };
}

function createSubmissionTemplateEditorForm() {
  return {
    templateId: null,
    itemInput: ""
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
    nextAlertKind: "task-finish",
    alerting: false,
    lastAlertTarget: null
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
    remainingIndices: [],
    completedIndices: [],
    activatedOnce: false,
    belongingChecked: {},
    lastAutoPromptAt: 0,
    done: false,
    completedAtMs: 0,
    completedAtTimeLabel: ""
  };
}

function createReturnCheckState() {
  return {
    done: false,
    answers: {
      homework: "",
      trouble: "",
      reply: "",
      delayedContact: ""
    },
    reminderPromptTriggered: false,
    reminderDeferred: false,
    reminderVisible: false,
    reminderSnoozeUntil: 0,
    reportText: "",
    copied: false,
    completedAtMs: 0,
    completedAtTimeLabel: ""
  };
}

function createHistoryEventsByDate() {
  return {};
}

function createDepartureNotificationSettings() {
  return {
    leadMinutes: DEFAULT_DEPARTURE_NOTIFICATION_LEAD_MINUTES
  };
}

function createNotificationSoundSettings() {
  return {
    departure: {
      target: NOTIFICATION_SOUND_TARGET_DEPARTURE,
      uri: "",
      title: getNotificationSoundFallbackTitle("alarm"),
      toneType: "alarm",
      channelId: buildNotificationChannelId(NOTIFICATION_SOUND_TARGET_DEPARTURE, "alarm", "")
    },
    taskFinish: {
      target: NOTIFICATION_SOUND_TARGET_TASK_FINISH,
      uri: "",
      title: getNotificationSoundFallbackTitle("notification"),
      toneType: "notification",
      channelId: buildNotificationChannelId(NOTIFICATION_SOUND_TARGET_TASK_FINISH, "notification", "")
    },
    taskRecheck: {
      target: NOTIFICATION_SOUND_TARGET_TASK_RECHECK,
      uri: "",
      title: getNotificationSoundFallbackTitle("notification"),
      toneType: "notification",
      channelId: buildNotificationChannelId(NOTIFICATION_SOUND_TARGET_TASK_RECHECK, "notification", "")
    }
  };
}

function normalizeNotificationSoundEntry(raw, target, fallbackToneType) {
  const toneType = fallbackToneType === "alarm" ? "alarm" : "notification";
  const uri = typeof raw?.uri === "string" ? raw.uri.trim() : "";
  const title = typeof raw?.title === "string" && raw.title.trim()
    ? raw.title.trim()
    : getNotificationSoundFallbackTitle(toneType);
  const channelId = typeof raw?.channelId === "string" && raw.channelId.trim()
    ? raw.channelId.trim()
    : buildNotificationChannelId(target, toneType, uri);
  return {
    target,
    uri,
    title,
    toneType,
    channelId
  };
}

function normalizeNotificationSoundSettings(raw) {
  return {
    departure: normalizeNotificationSoundEntry(raw?.departure, NOTIFICATION_SOUND_TARGET_DEPARTURE, "alarm"),
    taskFinish: normalizeNotificationSoundEntry(raw?.taskFinish, NOTIFICATION_SOUND_TARGET_TASK_FINISH, "notification"),
    taskRecheck: normalizeNotificationSoundEntry(raw?.taskRecheck, NOTIFICATION_SOUND_TARGET_TASK_RECHECK, "notification")
  };
}

function createMedicineDoseState() {
  return {
    done: false,
    doneAt: ""
  };
}

function createMedicineReminderState(dateKey = getTodayKeyJst()) {
  return {
    dateKey: normalizeTaskDateKey(dateKey) || getTodayKeyJst(),
    blue: createMedicineDoseState(),
    red: createMedicineDoseState(),
    snoozeUntil: 0,
    forceOpen: false
  };
}

function createInitialState(dateKey, tasks = [], historyEventsByDate = null) {
  return {
    dateKey,
    phase: "planning",
    navHistory: [],
    homeTaskListExpanded: false,
    executionTaskListExpanded: false,
    homeViewMode: "current",
    previousDayArchive: null,
    homeReturnPhase: "planning",
    planFor: "tomorrow",
    planTimes: createDefaultPlanTimes(),
    tasks,
    planningForm: createPlanningForm(),
    submissionTemplates: createDefaultSubmissionTemplates(),
    submissionTemplateEditorForm: createSubmissionTemplateEditorForm(),
    submissionChecklistTarget: null,
    taskNameStats: [],
    recurringPlans: [],
    recurringForm: createRecurringForm(),
    recurringPlansAppliedByDate: {},
    recurringSyncDateKey: null,
    historyEventsByDate: normalizeHistoryEventsByDate(historyEventsByDate, dateKey),
    dailySpecialBelongingsByDate: {},
    planningDailyBelongingInput: "",
    homeworkTasks: [],
    homeworkForm: createHomeworkForm(),
    confirmedPlan: null,
    running: createRunningState(),
    review: createReviewState(),
    departureCheck: createDepartureCheckState(),
    departureNotification: createDepartureNotificationSettings(),
    notificationSoundSettings: createNotificationSoundSettings(),
    medicineReminder: createMedicineReminderState(dateKey),
    returnCheck: createReturnCheckState(),
    goPressedAt: null,
    dayClosed: false,
    previousDayPending: null,
    lastResultReportText: ""
  };
}

function createRecurringPlan(name, plannedMinutes, content, repeatType, days, googleSync, belongings = [], submissionTemplateId = SUBMISSION_TEMPLATE_NONE) {
  return {
    id: crypto.randomUUID(),
    name,
    plannedMinutes,
    content,
    belongings: normalizeBelongingsList(belongings),
    repeatType: normalizeRecurringRepeatType(repeatType),
    days: normalizeRepeatDays(days),
    googleSync: Boolean(googleSync),
    submissionTemplateId: normalizeSubmissionTemplateId(submissionTemplateId)
  };
}

function createTask(name, plannedMinutes, content, meta = {}) {
  const targetDateKey = normalizeTaskDateKey(meta.targetDateKey) || normalizeTaskDateKey(meta.recurringDateKey);
  return {
    id: crypto.randomUUID(),
    name,
    plannedMinutes,
    content,
    targetDateKey: targetDateKey || null,
    recurringPlanId: typeof meta.recurringPlanId === "string" ? meta.recurringPlanId : null,
    recurringDateKey: typeof meta.recurringDateKey === "string" ? meta.recurringDateKey : null,
    homeworkId: typeof meta.homeworkId === "string" ? meta.homeworkId : null,
    status: "pending",
    actualSeconds: null,
    memo: "",
    closeAction: "",
    submissionTemplateId: normalizeSubmissionTemplateId(meta.submissionTemplateId),
    submissionCheckedItemIds: [],
    submissionChecklistCompleted: false
  };
}

function normalizeTaskDateKey(value) {
  const dateKey = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  return dateKey;
}

function normalizeTask(task, fallbackDateKey = "") {
  const normalizedRecurringDateKey = normalizeTaskDateKey(task?.recurringDateKey);
  const normalizedTargetDateKey = normalizeTaskDateKey(task?.targetDateKey)
    || normalizedRecurringDateKey
    || normalizeTaskDateKey(fallbackDateKey);
  return {
    id: task.id || crypto.randomUUID(),
    name: String(task.name || ""),
    plannedMinutes: sanitizeMinutes(task.plannedMinutes || DEFAULT_MINUTES),
    content: String(task.content || ""),
    targetDateKey: normalizedTargetDateKey || null,
    recurringPlanId: typeof task.recurringPlanId === "string" ? task.recurringPlanId : null,
    recurringDateKey: normalizedRecurringDateKey || null,
    homeworkId: typeof task.homeworkId === "string" ? task.homeworkId : null,
    status: ["pending", "done", "deferred", "discarded"].includes(task.status) ? task.status : "pending",
    actualSeconds: typeof task.actualSeconds === "number" ? task.actualSeconds : null,
    memo: String(task.memo || ""),
    closeAction: String(task.closeAction || ""),
    submissionTemplateId: normalizeSubmissionTemplateId(task.submissionTemplateId),
    submissionCheckedItemIds: normalizeSubmissionCheckedItemIds(task.submissionCheckedItemIds),
    submissionChecklistCompleted: Boolean(task.submissionChecklistCompleted)
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

function normalizeRecurringDays(rawDays) {
  const list = Array.isArray(rawDays) ? rawDays : [];
  const normalized = list
    .map((d) => String(d || "").toLowerCase())
    .filter((d) => RECURRING_DAY_KEYS.includes(d));
  if (normalized.includes("daily")) return ["daily"];
  const unique = [];
  normalized.forEach((d) => {
    if (!unique.includes(d)) unique.push(d);
  });
  return unique;
}

function normalizeRecurringRepeatType(value) {
  return String(value || "daily") === "weekday" ? "weekday" : "daily";
}

function normalizeRepeatType(value) {
  const v = String(value || "none");
  if (v === "daily" || v === "weekday" || v === "none") return v;
  return "none";
}

function normalizeRepeatDays(rawDays) {
  const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  if (!Array.isArray(rawDays)) return [];
  const out = [];
  rawDays.forEach((d) => {
    const key = String(d || "").toLowerCase();
    if (weekdayKeys.includes(key) && !out.includes(key)) out.push(key);
  });
  return out;
}

function normalizeDeadlineType(value) {
  return String(value || "none") === "date" ? "date" : "none";
}

function normalizeDeadlineDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeBelongingName(value) {
  return String(value || "").trim();
}

function normalizeBelongingsList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((item) => {
    const name = normalizeBelongingName(item);
    if (!name) return;
    if (!out.includes(name)) out.push(name);
  });
  return out;
}

function normalizeDailySpecialBelongingsMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  Object.entries(raw).forEach(([dateKey, list]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const normalized = normalizeBelongingsList(list);
    if (normalized.length > 0) {
      out[dateKey] = normalized;
    }
  });
  return out;
}

function normalizeRecurringPlansAppliedByDate(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  Object.entries(raw).forEach(([dateKey, applied]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    if (applied === true) out[dateKey] = true;
  });
  return out;
}

function collectAppliedRecurringDatesFromTasks(tasks) {
  if (!Array.isArray(tasks)) return {};
  const out = {};
  tasks.forEach((task) => {
    const dateKey = String(task?.recurringDateKey || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    out[dateKey] = true;
  });
  return out;
}

function normalizeRecurringPlan(item) {
  const normalizedDays = normalizeRecurringDays(item?.days);
  const migratedType = normalizedDays.includes("daily") ? "daily" : "weekday";
  return {
    id: item?.id || crypto.randomUUID(),
    name: String(item?.name || "").trim(),
    plannedMinutes: sanitizeMinutes(item?.plannedMinutes || DEFAULT_MINUTES),
    content: String(item?.content || "").trim(),
    belongings: normalizeBelongingsList(item?.belongings),
    repeatType: normalizeRecurringRepeatType(item?.repeatType || migratedType),
    days: normalizeRepeatDays(normalizedDays),
    googleSync: Boolean(item?.googleSync),
    submissionTemplateId: normalizeSubmissionTemplateId(item?.submissionTemplateId)
  };
}

function normalizeRecurringPlans(rawPlans) {
  if (!Array.isArray(rawPlans)) return [];
  return rawPlans
    .map(normalizeRecurringPlan)
    .filter((p) => p.name && p.content && (p.repeatType === "daily" || p.days.length > 0));
}

function createDefaultSubmissionTemplates() {
  return DEFAULT_SUBMISSION_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    items: template.items.map((item) => ({ id: item.id, label: item.label }))
  }));
}

function normalizeSubmissionTemplateId(value) {
  if (typeof value !== "string") return SUBMISSION_TEMPLATE_NONE;
  return value;
}

function normalizeHomeworkWorkType(value) {
  return value === HOMEWORK_WORK_TYPE_NO_WORK ? HOMEWORK_WORK_TYPE_NO_WORK : HOMEWORK_WORK_TYPE_WITH_WORK;
}

function normalizeSubmissionCheckedItemIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((id) => {
    const text = String(id || "").trim();
    if (!text) return;
    if (!out.includes(text)) out.push(text);
  });
  return out;
}

function normalizeSubmissionTemplateItem(rawItem) {
  const id = String(rawItem?.id || crypto.randomUUID());
  const label = String(rawItem?.label || "").trim();
  return { id, label };
}

function normalizeSubmissionTemplate(rawTemplate) {
  const id = String(rawTemplate?.id || crypto.randomUUID());
  const name = String(rawTemplate?.name || "").trim();
  const items = Array.isArray(rawTemplate?.items)
    ? rawTemplate.items.map(normalizeSubmissionTemplateItem).filter((item) => item.label)
    : [];
  return { id, name, items };
}

function normalizeSubmissionTemplates(rawTemplates) {
  const base = Array.isArray(rawTemplates) ? rawTemplates : createDefaultSubmissionTemplates();
  const normalized = base
    .map(normalizeSubmissionTemplate)
    .filter((template) => template.name);
  const fallback = createDefaultSubmissionTemplates();
  if (normalized.length === 0) return fallback;
  const requiredTemplateIds = [STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID, NO_HOMEWORK_SUBMISSION_TEMPLATE_ID];
  requiredTemplateIds.forEach((templateId) => {
    const exists = normalized.some((template) => template.id === templateId);
    if (exists) return;
    const fallbackTemplate = fallback.find((template) => template.id === templateId);
    if (fallbackTemplate) normalized.push(fallbackTemplate);
  });
  return normalized;
}

function normalizeSubmissionTemplateEditorForm(raw) {
  const base = { ...createSubmissionTemplateEditorForm(), ...(raw || {}) };
  base.templateId = typeof base.templateId === "string" ? base.templateId : null;
  base.itemInput = String(base.itemInput || "");
  return base;
}

function normalizeSubmissionChecklistTarget(raw) {
  if (!raw || typeof raw !== "object") return null;
  const targetType = raw.targetType === "homework" ? "homework" : raw.targetType === "task" ? "task" : "";
  const targetId = String(raw.targetId || "");
  if (!targetType || !targetId) return null;
  return {
    targetType,
    targetId,
    returnPhase: String(raw.returnPhase || "")
  };
}

function normalizeHomeworkTask(item) {
  const homeworkWorkType = normalizeHomeworkWorkType(item?.homeworkWorkType);
  const normalizedSubmissionTemplateId = normalizeSubmissionTemplateId(item?.submissionTemplateId)
    || (homeworkWorkType === HOMEWORK_WORK_TYPE_NO_WORK
      ? NO_HOMEWORK_SUBMISSION_TEMPLATE_ID
      : STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID);
  return {
    id: item?.id || crypto.randomUUID(),
    name: String(item?.name || "").trim(),
    deadlineDate: normalizeDeadlineDate(item?.deadlineDate),
    content: String(item?.content || "").trim(),
    homeworkWorkType,
    googleSync: Boolean(item?.googleSync),
    done: Boolean(item?.done),
    submissionTemplateId: normalizedSubmissionTemplateId,
    submissionCheckedItemIds: normalizeSubmissionCheckedItemIds(item?.submissionCheckedItemIds),
    submissionChecklistCompleted: Boolean(item?.submissionChecklistCompleted),
    actionNoSuppressedDateKey: normalizeTaskDateKey(item?.actionNoSuppressedDateKey) || "",
    actionHistory: Array.isArray(item?.actionHistory)
      ? item.actionHistory.map((entry) => ({
        at: typeof entry?.at === "number" ? entry.at : 0,
        result: entry?.result === "no" ? "no" : "yes",
        reason: String(entry?.reason || "")
      }))
      : []
  };
}

function normalizeHomeworkTasks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeHomeworkTask)
    .filter((item) => item.name && item.deadlineDate);
}

function shouldShowContentAssistConfirm(content, itemName = "") {
  const text = String(content || "").trim();
  if (!text) return true;
  if (CONTENT_ASSIST_EXACT_MATCH_WORDS.has(text)) return true;
  const normalizedItemName = String(itemName || "").trim();
  if (normalizedItemName && text === normalizedItemName) return true;
  return false;
}

function showContentAssistConfirmDialog() {
  return new Promise((resolve) => {
    document.getElementById("contentAssistConfirmOverlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "contentAssistConfirmOverlay";
    overlay.className = "app-modal-overlay";
    overlay.innerHTML = `
      <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="contentAssistConfirmTitle">
        <h3 id="contentAssistConfirmTitle">内容の確認</h3>
        <p>
          この内容で保存しますか？
        </p>
        <p>
          あとで見返したときに、<br />
          何をするのか分かりますか？
        </p>
        <p>
          教材名、ページ、問題番号、やることなどを<br />
          少し足すと分かりやすくなります。
        </p>
        <p>
          例）<br />
          ・新中学問題集 p54～59<br />
          ・学校プリント No.3<br />
          ・理科レポートを先生へ提出する
        </p>
        <div class="btn-row split compact-stack app-modal-actions">
          <button id="contentAssistSaveAnywayBtn" class="btn-main" type="button">このまま保存</button>
          <button id="contentAssistReviseBtn" class="btn-quiet" type="button">修正する</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    document.getElementById("contentAssistSaveAnywayBtn")?.addEventListener("click", () => close(true));
    document.getElementById("contentAssistReviseBtn")?.addEventListener("click", () => close(false));
  });
}

async function confirmContentAssistIfNeeded(content, itemName = "") {
  if (!shouldShowContentAssistConfirm(content, itemName)) return true;
  return showContentAssistConfirmDialog();
}

function getTaskDateKeyForUnfinishedCheck(task) {
  return normalizeTaskDateKey(task?.targetDateKey) || normalizeTaskDateKey(task?.recurringDateKey);
}

function isTaskTargetOnOrBefore(task, boundaryDateKey) {
  const boundaryDayNumber = getDateKeyDayNumber(boundaryDateKey);
  const taskDateKey = getTaskDateKeyForUnfinishedCheck(task);
  const taskDayNumber = getDateKeyDayNumber(taskDateKey);
  if (boundaryDayNumber === null || taskDayNumber === null) return false;
  return taskDayNumber <= boundaryDayNumber;
}

function buildCarryoverTasks(previousState, nextDateKey) {
  if (!previousState || !Array.isArray(previousState.tasks)) return [];
  const previousDateKey = normalizeTaskDateKey(previousState.dateKey);
  return previousState.tasks
    .map((task) => normalizeTask(task, previousDateKey))
    .filter((task) => task && task.status === "deferred" && isTaskTargetOnOrBefore(task, previousDateKey))
    .map((task) => createTask(
      String(task.name || "").trim(),
      sanitizeMinutes(task.plannedMinutes),
      String(task.content || "").trim(),
      {
        targetDateKey: nextDateKey,
        submissionTemplateId: task.submissionTemplateId
      }
    ));
}

function buildNextDateTasks(previousState, nextDateKey) {
  if (!previousState || !Array.isArray(previousState.tasks)) return [];
  const previousDateKey = normalizeTaskDateKey(previousState.dateKey);
  const nextDayNumber = getDateKeyDayNumber(nextDateKey);
  const normalized = previousState.tasks.map((task) => normalizeTask(task, previousDateKey));
  const keepTargets = normalized.filter((task) => {
    const taskDayNumber = getDateKeyDayNumber(task.targetDateKey);
    if (taskDayNumber === null || nextDayNumber === null) return false;
    return taskDayNumber >= nextDayNumber;
  });
  return [...keepTargets, ...buildCarryoverTasks(previousState, nextDateKey)];
}

function loadState() {
  const todayKey = getTodayKeyJst();
  todayLabel.textContent = `本日：${getTodayDisplayJst()}`;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localBootRawExisted = Boolean(raw);
    localBootOwnerUid = String(localStorage.getItem(STORAGE_OWNER_UID_KEY) || "");
    if (!raw) return createInitialState(todayKey);

    const parsed = JSON.parse(raw);
    if (!parsed) return createInitialState(todayKey);
    localBootHasValidData = true;

    if (parsed.dateKey !== todayKey) {
      const nextState = createInitialState(todayKey, buildNextDateTasks(parsed, todayKey), parsed.historyEventsByDate);
      nextState.taskNameStats = normalizeTaskNameStats(parsed.taskNameStats);
      nextState.recurringPlans = normalizeRecurringPlans(parsed.recurringPlans);
      const summary = buildPastDaySummary(parsed);
      if (parsed.goPressedAt && !parsed.dayClosed && summary.total > 0) {
        nextState.previousDayPending = {
          dateKey: parsed.dateKey,
          summary
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
      "home", "completionHistory", "planning", "planConfirm", "planReport", "execution", "review", "result",
      "departureCheck", "returnCheck", "returnReport", "dayEnd", "previousDayEnd", "settings", "recurringList", "recurringEdit", "homeworkList", "homeworkWorkType", "homeworkEdit", "submissionTemplateList", "submissionTemplateEdit"
    ].includes(safe.phase) ? safe.phase : "planning";
    safe.navHistory = Array.isArray(safe.navHistory) ? safe.navHistory : [];
    safe.homeTaskListExpanded = Boolean(safe.homeTaskListExpanded);
    safe.executionTaskListExpanded = Boolean(safe.executionTaskListExpanded);
    safe.homeViewMode = safe.homeViewMode === "previous" ? "previous" : "current";
    safe.previousDayArchive = normalizePreviousDayArchive(safe.previousDayArchive);
    safe.homeReturnPhase = [
      "completionHistory", "planning", "planConfirm", "planReport", "execution", "review", "result", "departureCheck", "returnCheck", "returnReport", "dayEnd", "submissionTemplateList", "submissionTemplateEdit"
    ].includes(safe.homeReturnPhase) ? safe.homeReturnPhase : "planning";
    safe.planFor = safe.planFor === "today" ? "today" : "tomorrow";
    safe.planTimes = { ...createDefaultPlanTimes(), ...(safe.planTimes || {}) };
    safe.tasks = Array.isArray(safe.tasks) ? safe.tasks.map((task) => normalizeTask(task, todayKey)) : [];
    safe.planningForm = normalizePlanningForm(safe.planningForm);
    safe.submissionTemplates = normalizeSubmissionTemplates(safe.submissionTemplates);
    safe.submissionTemplateEditorForm = normalizeSubmissionTemplateEditorForm(safe.submissionTemplateEditorForm);
    safe.submissionChecklistTarget = normalizeSubmissionChecklistTarget(safe.submissionChecklistTarget);
    safe.taskNameStats = normalizeTaskNameStats(safe.taskNameStats);
    safe.recurringPlans = normalizeRecurringPlans(safe.recurringPlans);
    safe.recurringForm = normalizeRecurringForm(safe.recurringForm);
    safe.recurringPlansAppliedByDate = {
      ...normalizeRecurringPlansAppliedByDate(safe.recurringPlansAppliedByDate),
      ...collectAppliedRecurringDatesFromTasks(safe.tasks)
    };
    if (typeof safe.recurringSyncDateKey === "string" && !safe.recurringPlansAppliedByDate[safe.recurringSyncDateKey]) {
      safe.recurringPlansAppliedByDate[safe.recurringSyncDateKey] = true;
    }
    safe.recurringSyncDateKey = typeof safe.recurringSyncDateKey === "string" ? safe.recurringSyncDateKey : null;
    safe.historyEventsByDate = normalizeHistoryEventsByDate(safe.historyEventsByDate, todayKey);
    safe.dailySpecialBelongingsByDate = normalizeDailySpecialBelongingsMap(safe.dailySpecialBelongingsByDate);
    safe.planningDailyBelongingInput = String(safe.planningDailyBelongingInput || "");
    safe.homeworkTasks = normalizeHomeworkTasks(safe.homeworkTasks);
    safe.homeworkForm = normalizeHomeworkForm(safe.homeworkForm);
    safe.running = { ...createRunningState(), ...(safe.running || {}) };
    safe.review = { ...createReviewState(), ...(safe.review || {}) };
    safe.departureCheck = normalizeDepartureCheckState(safe.departureCheck);
    safe.departureNotification = normalizeDepartureNotificationSettings(safe.departureNotification);
    safe.notificationSoundSettings = normalizeNotificationSoundSettings(safe.notificationSoundSettings);
    safe.medicineReminder = normalizeMedicineReminderState(safe.medicineReminder, todayKey);
    safe.returnCheck = normalizeReturnCheckState(safe.returnCheck);
    safe.confirmedPlan = normalizeConfirmedPlan(safe.confirmedPlan);
    safe.previousDayPending = safe.previousDayPending || null;
    safe.dayClosed = Boolean(safe.dayClosed);
    safe.lastResultReportText = String(safe.lastResultReportText || "");

    return safe;
  } catch (_) {
    localBootHasValidData = false;
    return createInitialState(todayKey);
  }
}

function buildPastDaySummary(prev) {
  const prevDateKey = normalizeTaskDateKey(prev?.dateKey);
  const tasks = Array.isArray(prev?.tasks)
    ? prev.tasks
      .map((task) => normalizeTask(task, prevDateKey))
      .filter((task) => isTaskTargetOnOrBefore(task, prevDateKey))
    : [];
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
  base.taskName = String(base.taskName || "");
  if (!base.taskName.trim()) {
    base.taskName = base.taskNameChoice === TASK_NAME_NEW
      ? base.customTaskName
      : String(base.taskNameChoice || "");
  }
  base.minutesChoice = typeof base.minutesChoice === "string" ? base.minutesChoice : String(DEFAULT_MINUTES);
  base.customMinutes = String(base.customMinutes || base.minutesChoice || DEFAULT_MINUTES);
  base.content = String(base.content || "");
  base.submissionTemplateId = SUBMISSION_TEMPLATE_NONE;
  delete base.repeatType;
  delete base.repeatDays;
  delete base.deadlineType;
  delete base.deadlineDate;
  delete base.googleSync;
  return base;
}

function normalizeMedicineDoseState(raw) {
  const base = { ...createMedicineDoseState(), ...(raw || {}) };
  base.done = Boolean(base.done);
  base.doneAt = base.done ? String(base.doneAt || "") : "";
  return base;
}

function normalizeMedicineReminderState(raw, fallbackDateKey = getTodayKeyJst()) {
  const fallback = createMedicineReminderState(fallbackDateKey);
  const base = { ...fallback, ...(raw || {}) };
  const fallbackKey = normalizeTaskDateKey(fallbackDateKey) || fallback.dateKey;
  const dateKey = normalizeTaskDateKey(base.dateKey) || fallbackKey;

  // Safety reset: if persisted data belongs to another day, start fresh for today.
  if (dateKey !== fallbackKey) {
    return createMedicineReminderState(fallbackKey);
  }

  base.dateKey = dateKey;
  base.blue = normalizeMedicineDoseState(base.blue);
  base.red = normalizeMedicineDoseState(base.red);
  base.snoozeUntil = Number.isFinite(Number(base.snoozeUntil)) ? Math.max(0, Number(base.snoozeUntil)) : 0;
  base.forceOpen = Boolean(base.forceOpen);
  return base;
}

function normalizeHistoryEvent(raw, fallbackDateKey = getTodayKeyJst()) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "");
  if (!HISTORY_EVENT_TYPES.has(type)) return null;
  const dateKey = normalizeTaskDateKey(raw.dateKey) || normalizeTaskDateKey(fallbackDateKey) || getTodayKeyJst();
  const occurredAtMs = Number(raw.occurredAtMs);
  const normalizedOccurredAtMs = Number.isFinite(occurredAtMs) && occurredAtMs > 0 ? Math.floor(occurredAtMs) : Date.now();
  const timeLabelRaw = String(raw.timeLabel || "");
  const timeLabel = /^\d{2}:\d{2}$/.test(timeLabelRaw)
    ? timeLabelRaw
    : (() => {
      const dt = new Date(normalizedOccurredAtMs);
      return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    })();

  return {
    id: String(raw.id || crypto.randomUUID()),
    dateKey,
    occurredAtMs: normalizedOccurredAtMs,
    timeLabel,
    category: String(raw.category || ""),
    type,
    taskId: raw.taskId ? String(raw.taskId) : "",
    taskNameSnapshot: raw.taskNameSnapshot ? String(raw.taskNameSnapshot) : ""
  };
}

function normalizeHistoryEventsByDate(raw, fallbackDateKey = getTodayKeyJst()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([dateKey, events]) => {
    const normalizedDateKey = normalizeTaskDateKey(dateKey);
    if (!normalizedDateKey || !Array.isArray(events)) return;
    const normalizedEvents = events
      .map((event) => normalizeHistoryEvent(event, normalizedDateKey || fallbackDateKey))
      .filter(Boolean)
      .sort((a, b) => (a.occurredAtMs || 0) - (b.occurredAtMs || 0));
    out[normalizedDateKey] = normalizedEvents;
  });
  return out;
}

function normalizeReturnCheckState(raw) {
  const base = {
    ...createReturnCheckState(),
    ...(raw || {}),
    answers: {
      ...createReturnCheckState().answers,
      ...((raw && raw.answers) || {})
    }
  };
  base.done = Boolean(base.done);
  base.completedAtMs = Number.isFinite(Number(base.completedAtMs)) ? Math.max(0, Number(base.completedAtMs)) : 0;
  base.completedAtTimeLabel = base.done ? String(base.completedAtTimeLabel || "") : "";
  return base;
}

function getCurrentHistoryDateKey() {
  return normalizeTaskDateKey(state.dateKey) || getTodayKeyJst();
}

function appendHistoryEvent(eventInput) {
  const dateKey = normalizeTaskDateKey(eventInput?.dateKey) || getCurrentHistoryDateKey();
  const now = getNowInJst();
  const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const type = String(eventInput?.type || "");
  if (!HISTORY_EVENT_TYPES.has(type)) return null;

  if (!state.historyEventsByDate || typeof state.historyEventsByDate !== "object" || Array.isArray(state.historyEventsByDate)) {
    state.historyEventsByDate = {};
  }
  if (!Array.isArray(state.historyEventsByDate[dateKey])) {
    state.historyEventsByDate[dateKey] = [];
  }

  const event = {
    id: crypto.randomUUID(),
    dateKey,
    occurredAtMs: now.getTime(),
    timeLabel,
    category: String(eventInput?.category || ""),
    type,
    taskId: eventInput?.taskId ? String(eventInput.taskId) : "",
    taskNameSnapshot: eventInput?.taskNameSnapshot ? String(eventInput.taskNameSnapshot) : ""
  };
  state.historyEventsByDate[dateKey].push(event);
  return event;
}

function normalizeConfirmedPlan(raw) {
  if (!raw) return null;
  const fallbackDateKey = raw.planFor === "tomorrow"
    ? addDaysToDateKey(getTodayKeyJst(), 1)
    : getTodayKeyJst();
  return {
    planFor: raw.planFor === "today" ? "today" : "tomorrow",
    planTimes: { ...createDefaultPlanTimes(), ...(raw.planTimes || {}) },
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map((task) => normalizeTask(task, fallbackDateKey)) : [],
    totalPlanned: sanitizeMinutesOrZero(raw.totalPlanned),
    reportText: String(raw.reportText || ""),
    confirmedAt: typeof raw.confirmedAt === "number" ? raw.confirmedAt : 0
  };
}

function normalizeRecurringForm(raw) {
  const base = { ...createRecurringForm(), ...(raw || {}) };
  base.mode = base.mode === "edit" ? "edit" : "add";
  base.targetId = base.targetId || null;
  base.name = String(base.name || "");
  base.minutes = String(base.minutes || DEFAULT_MINUTES);
  base.content = String(base.content || "");
  base.belongings = normalizeBelongingsList(base.belongings);
  base.belongingInput = String(base.belongingInput || "");
  base.submissionTemplateId = normalizeSubmissionTemplateId(base.submissionTemplateId);
  base.repeatType = normalizeRecurringRepeatType(base.repeatType);
  base.days = normalizeRepeatDays(base.days);
  if (base.repeatType === "daily") base.days = [];
  base.googleSync = Boolean(base.googleSync);
  return base;
}

function normalizeHomeworkForm(raw) {
  const base = { ...createHomeworkForm(), ...(raw || {}) };
  base.mode = base.mode === "edit" ? "edit" : "add";
  base.targetId = base.targetId || null;
  base.name = String(base.name || "");
  base.deadlineDate = normalizeDeadlineDate(base.deadlineDate);
  base.content = String(base.content || "");
  base.homeworkWorkType = normalizeHomeworkWorkType(base.homeworkWorkType);
  base.googleSync = Boolean(base.googleSync);
  base.done = Boolean(base.done);
  base.submissionTemplateId = normalizeSubmissionTemplateId(base.submissionTemplateId);
  if (!base.submissionTemplateId) {
    base.submissionTemplateId = base.homeworkWorkType === HOMEWORK_WORK_TYPE_NO_WORK
      ? NO_HOMEWORK_SUBMISSION_TEMPLATE_ID
      : STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID;
  }
  return base;
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (currentUser?.uid) {
    localStorage.setItem(STORAGE_OWNER_UID_KEY, currentUser.uid);
  }

  if (options.skipRemote) return Promise.resolve({ status: "local-only" });
  return scheduleFirestoreSave({
    immediate: Boolean(options.immediateRemote),
    awaitCompletion: Boolean(options.awaitRemote)
  });
}

function ensureSyncDrainPromise() {
  if (syncDrainPromise) return syncDrainPromise;
  syncDrainPromise = new Promise((resolve) => {
    resolveSyncDrainPromise = resolve;
  });
  return syncDrainPromise;
}

function resolveSyncDrain(result) {
  if (!resolveSyncDrainPromise) return;
  resolveSyncDrainPromise(result);
  resolveSyncDrainPromise = null;
  syncDrainPromise = null;
}

function isAnySaveActionPending() {
  return Boolean(activeSaveActionKey);
}

function isSaveActionPending(key) {
  return activeSaveActionKey === key;
}

function getBusyDisabledAttr() {
  return isAnySaveActionPending() ? 'disabled aria-disabled="true"' : "";
}

function getSaveActionDisabledAttr() {
  return getBusyDisabledAttr();
}

function getSaveActionLabel(key, defaultLabel) {
  return isSaveActionPending(key) ? "保存中..." : defaultLabel;
}

function blockDeferredUiUpdates(ms = 900) {
  deferredUiBlockUntil = Math.max(deferredUiBlockUntil, Date.now() + ms);
}

function clearUiNotice(options = {}) {
  const { skipRender = false } = options;
  if (uiNoticeTimer) {
    clearTimeout(uiNoticeTimer);
    uiNoticeTimer = null;
  }
  uiNotice = { type: "", text: "" };
  if (!skipRender) requestPassiveRender();
}

function setUiNotice(type, text, options = {}) {
  const { autoHideMs = 0, skipRender = false } = options;
  if (uiNoticeTimer) {
    clearTimeout(uiNoticeTimer);
    uiNoticeTimer = null;
  }
  uiNotice = {
    type: String(type || "info"),
    text: String(text || "")
  };
  if (autoHideMs > 0 && uiNotice.text) {
    uiNoticeTimer = window.setTimeout(() => {
      uiNoticeTimer = null;
      uiNotice = { type: "", text: "" };
      requestPassiveRender();
    }, autoHideMs);
  }
  if (!skipRender) requestPassiveRender();
}

function renderUiNotice() {
  if (!uiNotice.text) return "";
  const ariaRole = uiNotice.type === "error" ? "alert" : "status";
  return `<p class="helper ui-notice ui-notice-${escapeHtml(uiNotice.type)}" role="${ariaRole}" aria-live="polite">${escapeHtml(uiNotice.text)}</p>`;
}

function isEditableTextElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const type = String(el.type || "text").toLowerCase();
  return ["text", "search", "number", "email", "password", "tel", "url", "date", "time"].includes(type);
}

function isUserEditing() {
  return isTextInputFocused || isComposingText;
}

function shouldSkipInputWhileComposing(e) {
  return Boolean(e?.isComposing) || isComposingText;
}

function getInputElementValue(id) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return null;
}

function syncPlanningFormFromDom() {
  const taskName = getInputElementValue("taskNameInput");
  const taskNameChoice = getInputElementValue("taskNameSelect");
  const customTaskName = getInputElementValue("customTaskName");
  const customMinutes = getInputElementValue("minutesInput");
  const content = getInputElementValue("taskContent");
  const submissionTemplateId = getInputElementValue("planningSubmissionTemplate");
  const dailyBelongingInput = getInputElementValue("dailyBelongingInput");
  if (taskName !== null) state.planningForm.taskName = taskName;
  if (taskNameChoice !== null) state.planningForm.taskNameChoice = taskNameChoice;
  if (customTaskName !== null) state.planningForm.customTaskName = customTaskName;
  if (customMinutes !== null) {
    state.planningForm.customMinutes = customMinutes;
    state.planningForm.minutesChoice = customMinutes;
  }
  if (content !== null) state.planningForm.content = content;
  if (submissionTemplateId !== null) state.planningForm.submissionTemplateId = normalizeSubmissionTemplateId(submissionTemplateId);
  if (dailyBelongingInput !== null) state.planningDailyBelongingInput = dailyBelongingInput;
}

function syncRecurringFormFromDom() {
  const name = getInputElementValue("recurringName");
  const minutes = getInputElementValue("recurringMinutes");
  const content = getInputElementValue("recurringContent");
  const belongingInput = getInputElementValue("recurringBelongingInput");
  const submissionTemplateId = getInputElementValue("recurringSubmissionTemplate");
  if (name !== null) state.recurringForm.name = name;
  if (minutes !== null) state.recurringForm.minutes = minutes;
  if (content !== null) state.recurringForm.content = content;
  if (belongingInput !== null) state.recurringForm.belongingInput = belongingInput;
  if (submissionTemplateId !== null) state.recurringForm.submissionTemplateId = normalizeSubmissionTemplateId(submissionTemplateId);

  const repeatType = document.querySelector("input[name='recurringRepeatType']:checked");
  if (repeatType instanceof HTMLInputElement) {
    state.recurringForm.repeatType = normalizeRecurringRepeatType(repeatType.value);
  }
  const selectedDays = Array.from(document.querySelectorAll("input[name='recurringDay']:checked"))
    .map((el) => el instanceof HTMLInputElement ? el.value : "")
    .filter(Boolean);
  state.recurringForm.days = normalizeRepeatDays(selectedDays);
  const googleSync = document.querySelector("input[name='recurringGoogleSync']:checked");
  if (googleSync instanceof HTMLInputElement) {
    state.recurringForm.googleSync = googleSync.value === "on";
  }
}

function syncHomeworkFormFromDom() {
  const name = getInputElementValue("homeworkName");
  const deadlineDate = getInputElementValue("homeworkDeadline");
  const content = getInputElementValue("homeworkContent");
  const submissionTemplateId = getInputElementValue("homeworkSubmissionTemplate");
  if (name !== null) state.homeworkForm.name = name;
  if (deadlineDate !== null) state.homeworkForm.deadlineDate = normalizeDeadlineDate(deadlineDate);
  if (content !== null) state.homeworkForm.content = content;
  if (submissionTemplateId !== null) state.homeworkForm.submissionTemplateId = normalizeSubmissionTemplateId(submissionTemplateId);

  const googleSync = document.querySelector("input[name='homeworkGoogleSync']:checked");
  if (googleSync instanceof HTMLInputElement) {
    state.homeworkForm.googleSync = googleSync.value === "on";
  }
  const done = document.querySelector("input[name='homeworkDone']:checked");
  if (done instanceof HTMLInputElement) {
    state.homeworkForm.done = done.value === "done";
  }
}

function bindProtectedActionButton(id, handler) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("pointerdown", () => {
    blockDeferredUiUpdates();
  });
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (isAnySaveActionPending()) return;
    await handler();
  });
}

async function runProtectedSaveAction(options) {
  const {
    key,
    syncFromDom,
    validate,
    captureState,
    restoreState,
    apply,
    onSuccess,
    successMessage,
    failureMessage = "保存に失敗しました。入力内容は保持しています。"
  } = options;

  if (isAnySaveActionPending()) return false;

  blockDeferredUiUpdates(1400);
  clearUiNotice({ skipRender: true });
  syncFromDom?.();

  const validationMessage = validate?.();
  if (validationMessage) {
    deferredUiBlockUntil = 0;
    flushDeferredUiUpdates();
    alert(validationMessage);
    return false;
  }

  const snapshot = captureState?.();
  activeSaveActionKey = key;
  render();

  try {
    apply();
    await saveState({ immediateRemote: true, awaitRemote: true });
    activeSaveActionKey = "";
    setUiNotice("success", successMessage, { autoHideMs: 2600, skipRender: true });
    onSuccess?.();
    return true;
  } catch (error) {
    restoreState?.(snapshot);
    activeSaveActionKey = "";
    setUiNotice("error", failureMessage, { skipRender: true });
    render();
    return false;
  } finally {
    if (activeSaveActionKey === key) {
      activeSaveActionKey = "";
    }
    deferredUiBlockUntil = 0;
    flushDeferredUiUpdates();
  }
}

function requestPassiveRender() {
  if (isUserEditing()) {
    pendingPassiveRender = true;
    return;
  }
  pendingPassiveRender = false;
  render();
}

function applyRemoteStateKeepingCurrentPhase(rawState) {
  const currentPhase = state.phase;
  const nextState = normalizeLoadedState(rawState);
  isApplyingRemoteState = true;
  replaceState(nextState);
  state.phase = currentPhase;
  saveState({ skipRemote: true });
  isApplyingRemoteState = false;
  requestMedicineReminderNotificationRefresh();
}

function flushDeferredUiUpdates() {
  if (isAnySaveActionPending()) return;
  if (Date.now() < deferredUiBlockUntil) {
    const waitMs = Math.max(deferredUiBlockUntil - Date.now(), 1);
    window.setTimeout(() => {
      flushDeferredUiUpdates();
    }, waitMs);
    return;
  }
  if (isUserEditing()) return;
  if (pendingRemoteState) {
    applyRemoteStateKeepingCurrentPhase(pendingRemoteState);
    pendingRemoteState = null;
    lastSavedStateHash = pendingRemoteHash || hashStateObject(state);
    pendingRemoteHash = "";
    requestPassiveRender();
    return;
  }
  if (pendingPassiveRender) {
    requestPassiveRender();
  }
}

function setupInputGuard() {
  document.addEventListener("focusin", (e) => {
    if (isEditableTextElement(e.target)) {
      isTextInputFocused = true;
    }
  });

  document.addEventListener("focusout", () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      isTextInputFocused = isEditableTextElement(active);
      flushDeferredUiUpdates();
    }, 0);
  });

  document.addEventListener("compositionstart", (e) => {
    if (isEditableTextElement(e.target)) {
      isComposingText = true;
    }
  });

  document.addEventListener("compositionend", (e) => {
    if (isEditableTextElement(e.target)) {
      isComposingText = false;
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        // Ensure finalized IME text is persisted even if intermediate composing input was skipped.
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
      window.setTimeout(() => {
        flushDeferredUiUpdates();
      }, 0);
    }
  });
}

function render() {
  clearTickTimer();

  if (!authReady) return renderAuthChecking();
  if (!currentUser) return renderLogin();
  if (!syncReady) return renderAuthSyncing();

  ensurePhaseRefreshTimer();
  enforcePriorityPhase();

  switch (state.phase) {
    case "previousDayEnd":
      return renderPreviousDayEnd();
    case "departureCheck":
      return renderDepartureCheck();
    case "home":
      return renderHome();
    case "completionHistory":
      return renderCompletionHistory();
    case "planning":
      return renderPlanning();
    case "planConfirm":
      return renderPlanConfirm();
    case "planReport":
      return renderPlanReport();
    case "execution":
      return renderExecution();
    case "review":
      return renderReview();
    case "returnCheck":
      return renderReturnCheck();
    case "returnReport":
      return renderReturnReport();
    case "dayEnd":
      return renderDayEnd();
    case "settings":
      return renderSettings();
    case "recurringList":
      return renderRecurringListScreen();
    case "recurringEdit":
      return renderRecurringEditScreen();
    case "homeworkList":
      return renderHomeworkListScreen();
    case "homeworkWorkType":
      return renderHomeworkWorkTypeEntryScreen();
    case "homeworkEdit":
      return renderHomeworkEditScreen();
    case "submissionTemplateList":
      return renderSubmissionTemplateListScreen();
    case "submissionTemplateEdit":
      return renderSubmissionTemplateEditScreen();
    default:
      return renderResult();
  }
}

function renderAuthSyncing() {
  app.innerHTML = `
    <div class="task-card auth-card">
      <h2>同期中</h2>
      <p class="helper">データを読み込んでいます。</p>
    </div>
  `;
  removeReturnCheckReminderOverlay();
  removeMedicineReminderOverlay();
}

function renderAuthChecking() {
  app.innerHTML = `
    <div class="task-card auth-card">
      <h2>認証を確認中...</h2>
      <p class="helper">しばらくお待ちください。</p>
    </div>
  `;
  removeReturnCheckReminderOverlay();
  removeMedicineReminderOverlay();
}

function renderLogin() {
  app.innerHTML = `
    <h2>ログイン</h2>
    <div class="task-form-box auth-card">
      <div class="form-stack">
        <div>
          <label for="loginEmail">メールアドレス</label>
          <input id="loginEmail" type="email" autocomplete="email" inputmode="email" placeholder="example@mail.com" />
        </div>
        <div>
          <label for="loginPassword">パスワード</label>
          <input id="loginPassword" type="password" autocomplete="current-password" placeholder="パスワード" />
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="loginBtn" class="btn-main" type="button" ${authLoading ? "disabled" : ""}>${authLoading ? "ログイン中..." : "ログイン"}</button>
      </div>
    </div>
    <p id="loginError" class="helper auth-error" aria-live="polite">${escapeHtml(authErrorMessage)}</p>
  `;

  removeReturnCheckReminderOverlay();
  removeMedicineReminderOverlay();

  const emailEl = document.getElementById("loginEmail");
  const passEl = document.getElementById("loginPassword");
  const loginBtn = document.getElementById("loginBtn");

  const submit = async () => {
    if (authLoading) return;
    const email = String(emailEl?.value || "").trim();
    const password = String(passEl?.value || "");
    if (!email || !password) {
      authErrorMessage = "メールアドレスとパスワードを入力してください。";
      return renderLogin();
    }

    authLoading = true;
    authErrorMessage = "";
    renderLogin();

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      authLoading = false;
      authErrorMessage = mapAuthError(error);
      renderLogin();
    }
  };

  loginBtn?.addEventListener("click", submit);
  passEl?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  });
}

function mapAuthError(error) {
  const code = String(error?.code || "");
  if (code === "auth/invalid-email") return "メールアドレスの形式が正しくありません。";
  if (code === "auth/invalid-credential") return "メールアドレスまたはパスワードが正しくありません。";
  if (code === "auth/user-disabled") return "このアカウントは無効化されています。";
  if (code === "auth/too-many-requests") return "試行回数が多すぎます。しばらくしてから再試行してください。";
  if (code === "auth/network-request-failed") return "ネットワーク接続を確認してください。";
  return "ログインに失敗しました。入力内容を確認してください。";
}

function getAppStateDocRef(uid) {
  return doc(db, "users", uid, "appState", "main");
}

function hashStateObject(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function cloneStateForSync() {
  return JSON.parse(JSON.stringify(state));
}

function replaceState(nextState) {
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, nextState);
}

function isValidSyncPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.state || typeof payload.state !== "object") return false;
  return true;
}

function hasMeaningfulState(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  if (Array.isArray(candidate.tasks) && candidate.tasks.length > 0) return true;
  if (Array.isArray(candidate.recurringPlans) && candidate.recurringPlans.length > 0) return true;
  if (Array.isArray(candidate.homeworkTasks) && candidate.homeworkTasks.length > 0) return true;
  if (candidate.historyEventsByDate && typeof candidate.historyEventsByDate === "object" && Object.keys(candidate.historyEventsByDate).length > 0) return true;
  if (candidate.confirmedPlan) return true;
  if (candidate.goPressedAt) return true;
  return false;
}

function normalizeLoadedState(rawState) {
  const todayKey = getTodayKeyJst();
  const fallback = createInitialState(todayKey);
  if (!rawState || typeof rawState !== "object") return fallback;

  const parsed = rawState;
  if (parsed.dateKey !== todayKey) {
    const nextState = createInitialState(todayKey, buildNextDateTasks(parsed, todayKey), parsed.historyEventsByDate);
    nextState.taskNameStats = normalizeTaskNameStats(parsed.taskNameStats);
    nextState.recurringPlans = normalizeRecurringPlans(parsed.recurringPlans);
    const summary = buildPastDaySummary(parsed);
    if (parsed.goPressedAt && !parsed.dayClosed && summary.total > 0) {
      nextState.previousDayPending = {
        dateKey: parsed.dateKey,
        summary
      };
      nextState.phase = "previousDayEnd";
    }
    return nextState;
  }

  const safe = {
    ...fallback,
    ...parsed,
    dateKey: todayKey
  };

  safe.phase = [
    "home", "completionHistory", "planning", "planConfirm", "planReport", "execution", "review", "result",
    "departureCheck", "returnCheck", "returnReport", "dayEnd", "previousDayEnd", "settings", "recurringList", "recurringEdit", "homeworkList", "homeworkWorkType", "homeworkEdit", "submissionTemplateList", "submissionTemplateEdit"
  ].includes(safe.phase) ? safe.phase : "planning";
  safe.navHistory = Array.isArray(safe.navHistory) ? safe.navHistory : [];
  safe.homeTaskListExpanded = Boolean(safe.homeTaskListExpanded);
  safe.executionTaskListExpanded = Boolean(safe.executionTaskListExpanded);
  safe.homeViewMode = safe.homeViewMode === "previous" ? "previous" : "current";
  safe.previousDayArchive = normalizePreviousDayArchive(safe.previousDayArchive);
  safe.homeReturnPhase = [
    "completionHistory", "planning", "planConfirm", "planReport", "execution", "review", "result", "departureCheck", "returnCheck", "returnReport", "dayEnd", "submissionTemplateList", "submissionTemplateEdit"
  ].includes(safe.homeReturnPhase) ? safe.homeReturnPhase : "planning";
  safe.planFor = safe.planFor === "today" ? "today" : "tomorrow";
  safe.planTimes = { ...createDefaultPlanTimes(), ...(safe.planTimes || {}) };
  safe.tasks = Array.isArray(safe.tasks) ? safe.tasks.map((task) => normalizeTask(task, todayKey)) : [];
  safe.planningForm = normalizePlanningForm(safe.planningForm);
  safe.submissionTemplates = normalizeSubmissionTemplates(safe.submissionTemplates);
  safe.submissionTemplateEditorForm = normalizeSubmissionTemplateEditorForm(safe.submissionTemplateEditorForm);
  safe.submissionChecklistTarget = normalizeSubmissionChecklistTarget(safe.submissionChecklistTarget);
  safe.taskNameStats = normalizeTaskNameStats(safe.taskNameStats);
  safe.recurringPlans = normalizeRecurringPlans(safe.recurringPlans);
  safe.recurringForm = normalizeRecurringForm(safe.recurringForm);
  safe.departureNotification = normalizeDepartureNotificationSettings(safe.departureNotification);
  safe.notificationSoundSettings = normalizeNotificationSoundSettings(safe.notificationSoundSettings);
  safe.medicineReminder = normalizeMedicineReminderState(safe.medicineReminder, todayKey);
  safe.recurringPlansAppliedByDate = {
    ...normalizeRecurringPlansAppliedByDate(safe.recurringPlansAppliedByDate),
    ...collectAppliedRecurringDatesFromTasks(safe.tasks)
  };
  if (typeof safe.recurringSyncDateKey === "string" && !safe.recurringPlansAppliedByDate[safe.recurringSyncDateKey]) {
    safe.recurringPlansAppliedByDate[safe.recurringSyncDateKey] = true;
  }
  safe.recurringSyncDateKey = typeof safe.recurringSyncDateKey === "string" ? safe.recurringSyncDateKey : null;
  safe.historyEventsByDate = normalizeHistoryEventsByDate(safe.historyEventsByDate, todayKey);
  safe.dailySpecialBelongingsByDate = normalizeDailySpecialBelongingsMap(safe.dailySpecialBelongingsByDate);
  safe.planningDailyBelongingInput = String(safe.planningDailyBelongingInput || "");
  safe.homeworkTasks = normalizeHomeworkTasks(safe.homeworkTasks);
  safe.homeworkForm = normalizeHomeworkForm(safe.homeworkForm);
  safe.running = { ...createRunningState(), ...(safe.running || {}) };
  safe.review = { ...createReviewState(), ...(safe.review || {}) };
  safe.departureCheck = normalizeDepartureCheckState(safe.departureCheck);
  safe.returnCheck = normalizeReturnCheckState(safe.returnCheck);
  safe.confirmedPlan = normalizeConfirmedPlan(safe.confirmedPlan);
  safe.previousDayPending = safe.previousDayPending || null;
  safe.dayClosed = Boolean(safe.dayClosed);
  safe.lastResultReportText = String(safe.lastResultReportText || "");

  return safe;
}

function teardownSyncSession() {
  if (syncUnsubscribe) {
    syncUnsubscribe();
    syncUnsubscribe = null;
  }
  if (syncSaveTimer) {
    clearTimeout(syncSaveTimer);
    syncSaveTimer = null;
  }
  syncSaveInFlight = false;
  syncReady = false;
  syncOwnerUid = null;
  isApplyingRemoteState = false;
  lastSavedStateHash = "";
  syncWritesBlocked = false;
  syncStatus = "syncing";
  pendingRemoteState = null;
  pendingRemoteHash = "";
  pendingPassiveRender = false;
  clearPhaseRefreshTimer();
}

function classifyFirestoreError(operation, error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  const detail = {
    category: "unknown",
    probableCause: "不明",
    firebaseConsoleSettingIssue: false,
    firestoreRuleIssue: false,
    writeBlockedUntilRelogin: false,
    suggestion: "コンソールログ詳細を確認してください。"
  };

  if (code === "permission-denied") {
    detail.category = "rules";
    detail.probableCause = "Firestoreルールで現在ユーザーの読み書きが拒否されている可能性";
    detail.firestoreRuleIssue = true;
    detail.writeBlockedUntilRelogin = true;
    detail.suggestion = "Firestoreルールで request.auth.uid と users/{uid} の一致条件を確認してください。";
    return detail;
  }

  if (code === "unauthenticated") {
    detail.category = "auth";
    detail.probableCause = "認証セッション未確立・期限切れ";
    detail.suggestion = "再ログインして認証状態を更新してください。";
    return detail;
  }

  if (code === "unavailable") {
    detail.category = "network";
    detail.probableCause = "ネットワーク断またはFirestore到達不可";
    detail.suggestion = "オンライン状態と接続先ネットワークを確認してください。";
    return detail;
  }

  if (code === "failed-precondition") {
    const msgLower = message.toLowerCase();
    if (msgLower.includes("firestore api") || msgLower.includes("database") || msgLower.includes("index")) {
      detail.category = "console-setting";
      detail.firebaseConsoleSettingIssue = true;
      detail.probableCause = "Firebase Console側のFirestore有効化・DB作成・設定不足の可能性";
      detail.writeBlockedUntilRelogin = true;
      detail.suggestion = "Firestore Databaseの作成状態、API有効化、必要な設定を確認してください。";
      return detail;
    }
  }

  if (code === "not-found") {
    detail.category = "console-setting";
    detail.firebaseConsoleSettingIssue = true;
    detail.probableCause = "Firestoreデータベース未作成、または参照先不整合の可能性";
    detail.writeBlockedUntilRelogin = true;
    detail.suggestion = "Firebase ConsoleでFirestore Databaseが作成済みか確認してください。";
    return detail;
  }

  if (code === "resource-exhausted") {
    detail.category = "quota";
    detail.probableCause = "クォータ超過の可能性";
    detail.suggestion = "Firebase利用量・請求設定を確認してください。";
    return detail;
  }

  return detail;
}

function reportFirestoreError(operation, error, extra = {}) {
  const info = classifyFirestoreError(operation, error);
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (!SYNC_DEBUG) {
    console.error("[Sync] Firestore error", { operation, code, message });
  } else {
    console.groupCollapsed(`[Sync][${operation}] Firestore error: ${code || "(no-code)"}`);
    console.error("error", error);
    console.log("operation", operation);
    console.log("code", code);
    console.log("message", message);
    console.log("probableCause", info.probableCause);
    console.log("firebaseConsoleSettingIssue", info.firebaseConsoleSettingIssue);
    console.log("firestoreRuleIssue", info.firestoreRuleIssue);
    console.log("category", info.category);
    console.log("suggestion", info.suggestion);
    if (Object.keys(extra).length > 0) {
      console.log("context", extra);
    }
    console.groupEnd();
  }

  if (info.writeBlockedUntilRelogin) {
    syncWritesBlocked = true;
  }
  return info;
}

async function startSyncSessionForUser(user) {
  const uid = String(user?.uid || "");
  if (!uid) return;

  teardownSyncSession();
  syncOwnerUid = uid;
  syncStatus = navigator.onLine ? "syncing" : "offline";
  requestPassiveRender();

  const appStateRef = getAppStateDocRef(uid);
  let snapshot;
  try {
    snapshot = await getDoc(appStateRef);
  } catch (error) {
    reportFirestoreError("initial-read", error, { uid });
    throw error;
  }

  if (snapshot.exists() && isValidSyncPayload(snapshot.data())) {
    const payload = snapshot.data();
    applyRemoteStateKeepingCurrentPhase(payload.state);
    lastSavedStateHash = hashStateObject(payload.state);
  } else {
    const canSeedFromLocal = localBootHasValidData && (!localBootOwnerUid || localBootOwnerUid === uid);
    const seedState = canSeedFromLocal ? cloneStateForSync() : createInitialState(getTodayKeyJst());
    try {
      await setDoc(appStateRef, {
        state: seedState,
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedBy: uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      reportFirestoreError("initial-seed-write", error, { uid });
      throw error;
    }
    lastSavedStateHash = hashStateObject(seedState);
    if (!canSeedFromLocal && !localBootRawExisted) {
      applyRemoteStateKeepingCurrentPhase(seedState);
    }
  }

  syncUnsubscribe = onSnapshot(appStateRef, (docSnap) => {
    if (!docSnap.exists()) return;
    const payload = docSnap.data();
    if (!isValidSyncPayload(payload)) return;
    const remoteHash = hashStateObject(payload.state);
    if (!remoteHash) return;

    if (payload.updatedBy === uid && remoteHash === lastSavedStateHash) {
      if (syncStatus !== "offline") syncStatus = "synced";
      return;
    }

    const currentHash = hashStateObject(state);
    if (remoteHash === currentHash) {
      lastSavedStateHash = remoteHash;
      if (syncStatus !== "offline") syncStatus = "synced";
      return;
    }

    if (isUserEditing()) {
      pendingRemoteState = payload.state;
      pendingRemoteHash = remoteHash;
      if (syncStatus !== "offline") syncStatus = "synced";
      return;
    }

    applyRemoteStateKeepingCurrentPhase(payload.state);
    lastSavedStateHash = remoteHash;
    if (syncStatus !== "offline") syncStatus = "synced";
    requestPassiveRender();
  }, (error) => {
    reportFirestoreError("snapshot-listen", error, { uid });
    syncStatus = navigator.onLine ? "error" : "offline";
    requestPassiveRender();
  });

  syncReady = true;
  syncStatus = navigator.onLine ? "synced" : "offline";
  localStorage.setItem(STORAGE_OWNER_UID_KEY, uid);
}

function shouldSyncToFirestore() {
  if (isApplyingRemoteState) return false;
  if (!currentUser?.uid) return false;
  if (!syncReady) return false;
  if (syncOwnerUid !== currentUser.uid) return false;
  if (syncWritesBlocked) return false;
  return true;
}

function scheduleFirestoreSave(options = {}) {
  if (!shouldSyncToFirestore()) return Promise.resolve({ status: "local-only" });

  const nextHash = hashStateObject(state);
  if (!nextHash || nextHash === lastSavedStateHash) {
    pendingSyncHash = "";
    return Promise.resolve({ status: "synced" });
  }

  pendingSyncHash = nextHash;
  const completionPromise = options.awaitCompletion ? ensureSyncDrainPromise() : null;

  if (syncSaveTimer) {
    clearTimeout(syncSaveTimer);
  }

  if (syncStatus !== "offline") {
    syncStatus = "saving";
  }

  if (options.immediate) {
    syncSaveTimer = null;
    void flushFirestoreSave(nextHash);
  } else {
    syncSaveTimer = setTimeout(() => {
      syncSaveTimer = null;
      void flushFirestoreSave(nextHash);
    }, SYNC_SAVE_DEBOUNCE_MS);
  }

  return completionPromise || Promise.resolve({ status: "scheduled" });
}

async function flushFirestoreSave(expectedHash) {
  if (!shouldSyncToFirestore()) {
    resolveSyncDrain({ status: "local-only" });
    return;
  }

  const targetHash = pendingSyncHash || expectedHash;
  if (syncSaveInFlight) return;
  if (!targetHash || targetHash === lastSavedStateHash) {
    if (targetHash === lastSavedStateHash) {
      pendingSyncHash = "";
    }
    if (!syncSaveTimer) {
      resolveSyncDrain({ status: "synced" });
    }
    return;
  }

  syncSaveInFlight = true;
  const uid = currentUser.uid;
  try {
    const payloadState = cloneStateForSync();
    const latestHash = hashStateObject(payloadState);
    if (!latestHash || latestHash === lastSavedStateHash) {
      pendingSyncHash = "";
      if (syncStatus !== "offline") syncStatus = "synced";
      resolveSyncDrain({ status: "synced" });
      return;
    }

    await setDoc(getAppStateDocRef(uid), {
      state: payloadState,
      schemaVersion: SYNC_SCHEMA_VERSION,
      updatedBy: uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    lastSavedStateHash = latestHash;
    if (pendingSyncHash === latestHash) {
      pendingSyncHash = "";
    }
    if (syncStatus !== "offline") syncStatus = "synced";
  } catch (error) {
    reportFirestoreError("save-write", error, {
      uid,
      expectedHashLength: String(expectedHash || "").length
    });
    syncStatus = navigator.onLine ? "error" : "offline";
    resolveSyncDrain({ status: "local-only", remoteError: error });
  } finally {
    syncSaveInFlight = false;
    requestPassiveRender();
    if (shouldSyncToFirestore() && pendingSyncHash && pendingSyncHash !== lastSavedStateHash && syncStatus !== "error" && syncStatus !== "offline") {
      void flushFirestoreSave(pendingSyncHash);
      return;
    }
    if (!syncSaveTimer) {
      resolveSyncDrain(pendingSyncHash && pendingSyncHash !== lastSavedStateHash ? { status: "local-only" } : { status: "synced" });
    }
  }
}

function getSyncStatusText() {
  if (!currentUser) return "";
  if (!syncReady) return "同期中";
  if (syncStatus === "saving") return "保存中";
  if (syncStatus === "offline") return "オフライン";
  if (syncStatus === "error") return "同期エラー";
  return "同期済み";
}

function enforcePriorityPhase() {
  const promptStateChanged = syncReturnCheckReminderState();
  if (promptStateChanged) {
    saveState();
  }

  if (state.previousDayPending) {
    state.phase = "previousDayEnd";
    return;
  }

  if (state.phase === "execution" && state.running.taskId && !state.running.isPaused) {
    return;
  }

  if (shouldAutoPromptDepartureCheck()) {
    if (state.phase !== "departureCheck") {
      state.departureCheck.activatedOnce = true;
      state.departureCheck.lastAutoPromptAt = Date.now();
      state.phase = "departureCheck";
    }
    return;
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
      const prevDateKey = state.previousDayPending?.dateKey || state.previousDayPending?.summary?.dateKey || "";
      const summary = state.previousDayPending?.summary || null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(prevDateKey)) {
        state.previousDayArchive = {
          dateKey: prevDateKey,
          planTimes: { ...createDefaultPlanTimes() },
          tasks: [],
          belongingsItems: [],
          totalPlanned: Number(summary?.planned) || 0,
          totalActual: Number(summary?.actual) || 0
        };
      }
      state.previousDayPending = null;
      state.dayClosed = true;
      state.homeViewMode = "current";
      state.homeTaskListExpanded = false;
      state.phase = "home";
      saveState();
      render();
    }
  });
}

function renderHome() {
  const runningTask = getRunningTask();
  if (runningTask && !state.running.isPaused) {
    checkOverrunNotification(getRunningElapsedSeconds());
  }
  const homeContext = getHomeDisplayContext();
  const isPreviousView = homeContext.isPreviousView;
  const homeActionAvailability = getHomeActionAvailability();
  const canExecuteDisplayedTasks = homeActionAvailability.canOpenExecution;
  const canOpenHomework = homeActionAvailability.canOpenHomework;
  const canOpenCompletionHistory = homeActionAvailability.canOpenCompletionHistory;
  const showDepartureCheckHomeButton = !isPreviousView && hasPendingDepartureCheck();
  const departureReminder = showDepartureCheckHomeButton ? getDepartureReminderForHome() : null;
  const showReturnCheckHomeButton = !isPreviousView
    && state.departureCheck.done
    && getReturnCheckReminderStatus() !== "none";
  const pendingHomework = isPreviousView ? [] : getSortedPendingHomeworkTasks();
  const homeworkPending = pendingHomework.length;
  const homeworkLabel = homeworkPending > 0 ? `宿題・課題（${homeworkPending}件）` : "宿題・課題";
  const homeworkSummaryHtml = renderHomeHomeworkSummary(pendingHomework);
  const medicineSummaryHtml = isPreviousView ? "" : renderHomeMedicineSummary();
  const syncText = getSyncStatusText();
  if (todayLabel) {
    todayLabel.textContent = `表示日：${formatHomeDateHeading(homeContext.dateKey)}`;
  }
  if (syncHeaderLabel) {
    syncHeaderLabel.textContent = "";
  }
  if (headerHomeActions) {
    headerHomeActions.innerHTML = `
      <button id="openSettingsTextBtn" class="top-text-action" type="button" ${getBusyDisabledAttr()}>⚙ 設定</button>
    `;
    document.getElementById("openSettingsTextBtn")?.addEventListener("click", () => changePhase("settings", false));
  }
  const belongingsItems = homeContext.belongingsItems;
  const belongingsHtml = belongingsItems.length === 0
    ? `<p class="home-overview-belongings-none">持ち物：なし</p>`
    : `<p class="home-overview-belongings-title">持ち物</p><ul class="home-belongings-list">${belongingsItems.map((item) => `<li>・${escapeHtml(item)}</li>`).join("")}</ul>`;
  const displayTasks = homeContext.tasks;
  const showRunningReminder = !isPreviousView && isRunningTaskReminderVisible();
  const runningReminderLabel = showRunningReminder ? buildRunningReminderTaskLabel(runningTask) : "";

  renderScreen(`
    <div class="home-title-row">
      <h2 class="home-title-item">${escapeHtml(formatHomeDateHeading(homeContext.dateKey))}</h2>
      ${isPreviousView
        ? `<p id="backToNextDayBtn" class="home-title-item home-title-link" role="button" tabindex="0" aria-label="翌日の予定へ戻る">翌日の予定へ戻る</p>`
        : `<p id="openPlanningHeadingBtn" class="home-title-item home-title-link" role="button" tabindex="0" aria-label="予定入力へ">予定入力</p>`}
    </div>
    ${!isPreviousView && state.previousDayArchive ? `<div class="home-task-more-row"><button id="openPreviousDayBtn" class="btn-quiet" type="button">＜ 前日を見る</button></div>` : ""}
    ${showRunningReminder ? `
      <div class="notice warn home-running-reminder">
        <p>⚠ まだ続いていますか？</p>
        <p>${escapeHtml(runningReminderLabel)}</p>
        <div class="btn-row triple compact-stack">
          <button id="homeReminderCompleteBtn" class="btn-ok" type="button">完了</button>
          <button id="homeReminderInterruptBtn" class="btn-quiet" type="button">中断</button>
          <button id="homeReminderContinueBtn" class="btn-sub" type="button">もう少し続ける</button>
        </div>
      </div>
    ` : ""}
    ${showDepartureCheckHomeButton ? `<div class="notice warn"><p>🟡 出発前チェック${departureReminder ? `（あと${departureReminder.minutesLeft}分）` : ""}</p><div class="btn-row compact-stack"><button id="openDepartureCheckNowBtn" class="btn-sub" type="button">今チェックする</button></div></div>` : ""}
    ${showReturnCheckHomeButton ? `<div class="notice warn return-check-notice"><p>帰宅後チェックが未完了です。</p><div class="btn-row compact-stack"><button id="openReturnCheckNowBtn" class="btn-sub" type="button">帰宅後チェックをする</button></div></div>` : ""}
    <div class="home-overview">
      <div class="home-overview-left">
        <p>起床 ${formatTimeForDisplay(homeContext.planTimes.wakeUp)}</p>
        <p>出発 ${formatTimeForDisplay(homeContext.planTimes.departure)}</p>
        <p>帰宅 ${formatTimeForDisplay(homeContext.planTimes.returnHome)}</p>
        <p>勉強 ${formatTimeForDisplay(homeContext.planTimes.studyStart)}</p>
      </div>
      <div class="home-overview-right">${belongingsHtml}</div>
    </div>
    <hr class="sep" />

    <ul class="home-task-list" id="homeTaskList"></ul>

    <div class="btn-row">
      <button id="openExecutionBtn" class="btn-main" type="button" ${canExecuteDisplayedTasks ? "" : "disabled"}>タスク実行へ</button>
    </div>

    <div class="btn-row compact-stack">
      <button id="openHomeworkBtn" class="btn-quiet" type="button" ${canOpenHomework ? "" : "disabled"}>${homeworkLabel}</button>
    </div>

    <div class="btn-row compact-stack">
      <button id="openCompletionHistoryBtn" class="btn-danger" type="button" ${canOpenCompletionHistory ? "" : "disabled"}>完了履歴を見る</button>
    </div>

    ${homeworkSummaryHtml}
    ${medicineSummaryHtml}

    <p class="home-sync-footer">同期：${escapeHtml(syncText || "-")}</p>
  `);

  const list = document.getElementById("homeTaskList");
  if (displayTasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "home-task-empty";
    empty.textContent = "予定タスクはまだありません。";
    list.appendChild(empty);
  }

  displayTasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "home-task-row";
    const status = getHomeStatusIcon(task);
    const statusClass = status === "【再開】" ? " home-task-status-resume" : "";
    if (canExecuteDisplayedTasks) {
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.dataset.taskId = task.id;
    } else {
      li.setAttribute("aria-disabled", "true");
      li.removeAttribute("tabindex");
      li.removeAttribute("role");
    }
    li.innerHTML = `
      <div class="home-task-main">
        <p class="home-task-line1"><span class="home-task-status${statusClass}" aria-hidden="true">${status}</span><span class="home-task-name">${escapeHtml(task.name)}</span><span class="home-task-meta">予定${task.plannedMinutes}分　実績${getHomeActualText(task)}</span></p>
      </div>
    `;
    list.appendChild(li);
  });

  if (canExecuteDisplayedTasks) {
    list.querySelectorAll("li[data-task-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const taskId = row.dataset.taskId;
        if (!taskId) return;
        if (state.running.taskId === taskId && state.running.isPaused) {
          resumePausedTask();
          return;
        }
        changePhase("execution", false);
      });
      row.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        row.click();
      });
    });
  }

  if (isPreviousView) {
    bindTextAction("backToNextDayBtn", () => {
      state.homeViewMode = "current";
      state.homeTaskListExpanded = false;
      saveState();
      render();
    });
  } else {
    bindTextAction("openPlanningHeadingBtn", () => changePhase("planning", false));
    document.getElementById("openPreviousDayBtn")?.addEventListener("click", () => {
      state.homeViewMode = "previous";
      state.homeTaskListExpanded = false;
      saveState();
      render();
    });

    if (canExecuteDisplayedTasks) {
      document.getElementById("openExecutionBtn")?.addEventListener("click", () => changePhase("execution", false));
    }
    if (canOpenHomework) {
      document.getElementById("openHomeworkBtn")?.addEventListener("click", () => changePhase("homeworkList", false));
    }
    document.getElementById("openMedicineReminderBtn")?.addEventListener("click", () => openMedicineReminderOverlay(true));
    bindTextAction("openMedicineReminderCard", () => openMedicineReminderOverlay(true));
    document.getElementById("openDepartureCheckNowBtn")?.addEventListener("click", () => changePhase("departureCheck", false));
    document.getElementById("openReturnCheckNowBtn")?.addEventListener("click", () => changePhase("returnCheck", false));
    document.getElementById("homeReminderCompleteBtn")?.addEventListener("click", openTaskCompleteConfirmDialog);
    document.getElementById("homeReminderInterruptBtn")?.addEventListener("click", interruptRunningTask);
    document.getElementById("homeReminderContinueBtn")?.addEventListener("click", continueRunningTaskAfterReminder);
  }

  if (canOpenCompletionHistory) {
    document.getElementById("openCompletionHistoryBtn")?.addEventListener("click", () => changePhase("completionHistory", false));
  }
}

function formatHistoryEventTime(event) {
  const rawLabel = String(event?.timeLabel || "");
  if (/^\d{2}:\d{2}$/.test(rawLabel)) return rawLabel;
  const occurredAtMs = Number(event?.occurredAtMs);
  if (Number.isFinite(occurredAtMs) && occurredAtMs > 0) {
    const dt = new Date(occurredAtMs);
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  }
  return "--:--";
}

function getCompletionHistoryEventLabel(event) {
  const type = String(event?.type || "");
  if (type === HISTORY_EVENT_TYPE_CHECK_DEPARTURE_COMPLETED) return "出発前チェック完了";
  if (type === HISTORY_EVENT_TYPE_CHECK_RETURN_COMPLETED) return "帰宅後チェック完了";
  if (type === HISTORY_EVENT_TYPE_MEDICINE_BLUE_COMPLETED) return "青の薬　完了";
  if (type === HISTORY_EVENT_TYPE_MEDICINE_RED_COMPLETED) return "赤の薬　完了";
  return "";
}

function getTaskHistoryActionLabel(type) {
  if (type === HISTORY_EVENT_TYPE_TASK_STARTED) return "開始";
  if (type === HISTORY_EVENT_TYPE_TASK_PAUSED) return "中断";
  if (type === HISTORY_EVENT_TYPE_TASK_RESUMED) return "再開";
  if (type === HISTORY_EVENT_TYPE_TASK_COMPLETED) return "完了";
  return "";
}

function isTaskHistoryEventType(type) {
  return type === HISTORY_EVENT_TYPE_TASK_STARTED
    || type === HISTORY_EVENT_TYPE_TASK_PAUSED
    || type === HISTORY_EVENT_TYPE_TASK_RESUMED
    || type === HISTORY_EVENT_TYPE_TASK_COMPLETED;
}

function getTaskHistoryGroupKey(event) {
  const taskId = String(event?.taskId || "").trim();
  if (taskId) return `task:${taskId}`;
  return "";
}

function getCompletionHistoryEventsForCurrentDate() {
  const dateKey = getCompletionHistoryTargetDateKey();
  if (!dateKey) return [];
  const raw = state.historyEventsByDate && typeof state.historyEventsByDate === "object"
    ? state.historyEventsByDate[dateKey]
    : [];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((event) => normalizeHistoryEvent(event, dateKey))
    .filter((event) => event && HISTORY_EVENT_DISPLAYABLE_TYPES.has(String(event.type || "")))
    .sort((a, b) => (a.occurredAtMs || 0) - (b.occurredAtMs || 0));
}

function resolveTaskContentForHistoryEvent(event, dateKey = getCompletionHistoryTargetDateKey()) {
  const taskId = String(event?.taskId || "").trim();
  if (taskId) {
    const task = findTask(taskId);
    const content = String(task?.content || "").trim();
    if (content) return content;
  }

  const taskName = String(event?.taskNameSnapshot || "").trim();
  if (!taskName) return "";
  const tasks = getTasksForDate(dateKey);
  const matches = tasks.filter((task) => String(task?.name || "").trim() === taskName);
  if (matches.length !== 1) return "";
  return String(matches[0]?.content || "").trim();
}

function buildCompletionHistoryDisplayEntries(events) {
  const historyDateKey = getCompletionHistoryTargetDateKey();
  const entries = [];
  const taskBlockByKey = new Map();
  let lastAnonymousTaskBlock = null;

  events.forEach((event) => {
    const type = String(event?.type || "");
    const occurredAtMs = Number(event?.occurredAtMs) || 0;
    if (!isTaskHistoryEventType(type)) {
      entries.push({
        kind: "single",
        occurredAtMs,
        timeLabel: formatHistoryEventTime(event),
        label: getCompletionHistoryEventLabel(event)
      });
      return;
    }

    const key = getTaskHistoryGroupKey(event);
    const taskName = String(event?.taskNameSnapshot || "").trim() || "（タスク）";
    const taskContent = resolveTaskContentForHistoryEvent(event, historyDateKey);
    let block = null;

    if (key) {
      block = taskBlockByKey.get(key);
      if (!block) {
        block = {
          kind: "task",
          occurredAtMs,
          firstTimeLabel: formatHistoryEventTime(event),
          taskName,
          taskContent,
          actions: []
        };
        taskBlockByKey.set(key, block);
        entries.push(block);
      }
    } else if (type === HISTORY_EVENT_TYPE_TASK_STARTED) {
      block = {
        kind: "task",
        occurredAtMs,
        firstTimeLabel: formatHistoryEventTime(event),
        taskName,
        taskContent,
        actions: []
      };
      entries.push(block);
      lastAnonymousTaskBlock = block;
    } else if (lastAnonymousTaskBlock) {
      block = lastAnonymousTaskBlock;
    } else {
      block = {
        kind: "task",
        occurredAtMs,
        firstTimeLabel: formatHistoryEventTime(event),
        taskName,
        taskContent,
        actions: []
      };
      entries.push(block);
      lastAnonymousTaskBlock = block;
    }

    const actionLabel = getTaskHistoryActionLabel(type);
    if (actionLabel) {
      block.actions.push({
        occurredAtMs,
        label: actionLabel,
        timeLabel: formatHistoryEventTime(event)
      });
    }

    if (occurredAtMs < block.occurredAtMs) {
      block.occurredAtMs = occurredAtMs;
      block.firstTimeLabel = formatHistoryEventTime(event);
    }

    const eventTaskName = String(event?.taskNameSnapshot || "").trim();
    if (eventTaskName && block.taskName === "（タスク）") {
      block.taskName = eventTaskName;
    }
    if (!block.taskContent) {
      block.taskContent = taskContent;
    }

    if (!key && type === HISTORY_EVENT_TYPE_TASK_COMPLETED) {
      lastAnonymousTaskBlock = null;
    }
  });

  entries.forEach((entry) => {
    if (entry.kind !== "task") return;
    entry.actions.sort((a, b) => (a.occurredAtMs || 0) - (b.occurredAtMs || 0));
  });

  entries.sort((a, b) => (a.occurredAtMs || 0) - (b.occurredAtMs || 0));
  return entries;
}

function renderCompletionHistory() {
  const events = getCompletionHistoryEventsForCurrentDate();
  const entries = buildCompletionHistoryDisplayEntries(events);
  const rowsHtml = entries.length === 0
    ? '<p class="helper">今日はまだ完了履歴がありません。</p>'
    : `<div class="completion-history-text-list">${entries.map((entry) => {
      if (entry.kind === "single") {
        return `<p class="completion-history-line">${escapeHtml(entry.timeLabel)}　${escapeHtml(entry.label)}</p>`;
      }
      const actionLines = entry.actions
        .map((action) => `<p class="completion-history-subline">　　　${escapeHtml(action.label)}　${escapeHtml(action.timeLabel)}</p>`)
        .join("");
      const taskHead = entry.taskContent
        ? `${entry.taskName}：${entry.taskContent}`
        : entry.taskName;
      return `<div class="completion-history-block"><p class="completion-history-line">${escapeHtml(entry.firstTimeLabel)}　${escapeHtml(taskHead)}</p>${actionLines}</div>`;
    }).join("")}</div>`;

  renderScreen(`
    <h2>完了履歴</h2>
    ${rowsHtml}
    <div class="btn-row compact-stack"><button id="finishTodayBtn" class="btn-danger" type="button">今日は終了</button></div>
  `);

  document.getElementById("finishTodayBtn")?.addEventListener("click", startTodayFinishFlow);
}

function renderSettings() {
  renderScreen(`
    <h2>設定</h2>
    <p class="helper">ログイン中: ${escapeHtml(currentUser?.email || "不明")}</p>
    <div class="task-card settings-menu-list">
      <button id="openRecurringListBtn" class="settings-menu-row" type="button">
        <span>定期予定</span>
        <span aria-hidden="true">＞</span>
      </button>
      <button id="openSubmissionTemplateListBtn" class="settings-menu-row" type="button">
        <span>提出・確認テンプレート</span>
        <span aria-hidden="true">＞</span>
      </button>
    </div>
    <div class="btn-row compact-stack">
      <button id="logoutBtn" class="btn-danger" type="button">ログアウト</button>
      <button id="backToHomeFromSettingsBtn" class="btn-quiet" type="button">戻る</button>
    </div>
    <div class="btn-row compact-stack">
      <div class="task-card">
        <h3>出発通知</h3>
        <div class="form-stack">
          <div>
            <label for="departureNotificationLeadMinutes">通知を鳴らすタイミング</label>
            <select id="departureNotificationLeadMinutes">
              ${renderDepartureNotificationLeadOptions()}
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="btn-row compact-stack">
      <div class="task-card">
        <h3>通知音の個別設定（Android）</h3>
        <p class="helper">端末内の音一覧を開き、試聴して選択できます。</p>
        <div class="form-stack">
          ${getNotificationSoundSettingRowsHtml()}
        </div>
      </div>
    </div>
    <div class="btn-row compact-stack">
      <div class="task-card">
        <h3>アラートテスト設定（開発用）</h3>
        <div class="form-stack">
          <div>
            <label for="devAlertVolume">テスト音量（1〜10）</label>
            <input id="devAlertVolume" type="range" min="1" max="10" step="1" value="${escapeHtml(String(devAlertTestConfig.volume))}" />
            <p id="devAlertVolumeLabel" class="helper">現在: ${escapeHtml(String(devAlertTestConfig.volume))}</p>
          </div>
          <div>
            <label for="devAlertToneType">テスト音の種類（1〜5）</label>
            <select id="devAlertToneType">
              <option value="type1" ${devAlertTestConfig.toneType === "type1" ? "selected" : ""}>1: 電子音（標準）</option>
              <option value="type2" ${devAlertTestConfig.toneType === "type2" ? "selected" : ""}>2: 時計のアラーム</option>
              <option value="type3" ${devAlertTestConfig.toneType === "type3" ? "selected" : ""}>3: 鳥の鳴き声</option>
              <option value="type4" ${devAlertTestConfig.toneType === "type4" ? "selected" : ""}>4: クラクション</option>
              <option value="type5" ${devAlertTestConfig.toneType === "type5" ? "selected" : ""}>5: ブザー音</option>
            </select>
          </div>
          <div>
            <label for="devAlertDuration">テスト鳴動秒数（1〜10秒）</label>
            <input id="devAlertDuration" type="range" min="1" max="10" step="1" value="${escapeHtml(String(devAlertTestConfig.durationSeconds))}" />
            <p id="devAlertDurationLabel" class="helper">現在: ${escapeHtml(String(devAlertTestConfig.durationSeconds))}秒</p>
          </div>
        </div>
      </div>
      <button id="devAlertTestBtn" class="btn-sub" type="button">🔔 アラートテスト</button>
    </div>
    <div id="devAlertFeedbackArea" class="notice warn hidden">
      <p>予定時間を超えました。</p>
    </div>
    <div class="btn-row compact-stack">
      <div class="task-card">
        <h3>Androidローカル通知試験</h3>
        <p class="helper">Capacitorアプリ上で押すと、10秒後にローカル通知を予約します。</p>
        <div class="btn-row compact-stack">
          <button id="localNotificationTestBtn" class="btn-sub" type="button">10秒後に通知</button>
        </div>
        <p id="localNotificationTestMsg" class="helper" aria-live="polite">${escapeHtml(localNotificationTestMessage)}</p>
      </div>
    </div>
    <div class="btn-row compact-stack">
      <button id="resetDailyStatusBtn" class="btn-danger" type="button">当日の状態をクリーンにする</button>
    </div>
  `);

  document.getElementById("openRecurringListBtn").addEventListener("click", () => changePhase("recurringList"));
  document.getElementById("openSubmissionTemplateListBtn")?.addEventListener("click", () => changePhase("submissionTemplateList"));
  document.getElementById("logoutBtn").addEventListener("click", performLogout);
  document.getElementById("backToHomeFromSettingsBtn").addEventListener("click", goHome);
  document.getElementById("departureNotificationLeadMinutes")?.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const nextValue = target.value === "none" ? null : Number(target.value);
    state.departureNotification = normalizeDepartureNotificationSettings({
      ...state.departureNotification,
      leadMinutes: nextValue
    });
    saveState();
    refreshDepartureNotification();
  });
  const volumeInput = document.getElementById("devAlertVolume");
  const volumeLabel = document.getElementById("devAlertVolumeLabel");
  const toneTypeInput = document.getElementById("devAlertToneType");
  const durationInput = document.getElementById("devAlertDuration");
  const durationLabel = document.getElementById("devAlertDurationLabel");
  volumeInput?.addEventListener("input", () => {
    const n = Number(volumeInput.value);
    if (Number.isFinite(n)) {
      devAlertTestConfig.volume = Math.min(10, Math.max(1, Math.round(n)));
      if (volumeLabel) volumeLabel.textContent = `現在: ${devAlertTestConfig.volume}`;
    }
  });
  toneTypeInput?.addEventListener("change", () => {
    const value = String(toneTypeInput.value || "type1");
    devAlertTestConfig.toneType = ["type1", "type2", "type3", "type4", "type5"].includes(value) ? value : "type1";
  });
  durationInput?.addEventListener("input", () => {
    const n = Number(durationInput.value);
    if (Number.isFinite(n)) {
      devAlertTestConfig.durationSeconds = Math.min(10, Math.max(1, Math.round(n)));
      if (durationLabel) durationLabel.textContent = `現在: ${devAlertTestConfig.durationSeconds}秒`;
    }
  });
  document.getElementById("devAlertTestBtn").addEventListener("click", runDevAlertTest);
  document.getElementById("localNotificationTestBtn")?.addEventListener("click", runLocalNotificationTest);
  document.getElementById("resetDailyStatusBtn").addEventListener("click", resetDailyStatus);
  document.getElementById("pickDepartureSoundBtn")?.addEventListener("click", () => {
    void pickNotificationSound(NOTIFICATION_SOUND_TARGET_DEPARTURE, "alarm");
  });
  document.getElementById("pickTaskFinishSoundBtn")?.addEventListener("click", () => {
    void pickNotificationSound(NOTIFICATION_SOUND_TARGET_TASK_FINISH, "notification");
  });
  document.getElementById("pickTaskRecheckSoundBtn")?.addEventListener("click", () => {
    void pickNotificationSound(NOTIFICATION_SOUND_TARGET_TASK_RECHECK, "notification");
  });
}

function renderDepartureNotificationLeadOptions() {
  const selected = state.departureNotification?.leadMinutes;
  const options = [
    { value: "none", label: "なし" },
    { value: 0, label: "0分前" },
    { value: 1, label: "1分前" },
    { value: 2, label: "2分前" },
    { value: 3, label: "3分前" },
    { value: 4, label: "4分前" },
    { value: 5, label: "5分前" },
    { value: 6, label: "6分前" },
    { value: 7, label: "7分前" },
    { value: 8, label: "8分前" },
    { value: 9, label: "9分前" },
    { value: 10, label: "10分前" }
  ];
  return options.map((option) => {
    const isSelected = option.value === "none"
      ? selected === null
      : Number(option.value) === Number(selected);
    return `<option value="${escapeHtml(String(option.value))}" ${isSelected ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function setLocalNotificationTestMessage(message) {
  localNotificationTestMessage = String(message || "");
  const el = document.getElementById("localNotificationTestMsg");
  if (el) el.textContent = localNotificationTestMessage;
}

function getCapacitorBridge() {
  return window.Capacitor || null;
}

function getLocalNotificationsPlugin() {
  const bridge = getCapacitorBridge();
  if (!bridge) return null;
  if (!localNotificationsPluginRef && typeof bridge.registerPlugin === "function") {
    // Prefer the modern plugin registration API over legacy Plugins object access.
    localNotificationsPluginRef = bridge.registerPlugin("LocalNotifications");
  }
  return localNotificationsPluginRef || bridge.Plugins?.LocalNotifications || null;
}

function getRingtonePickerPlugin() {
  const bridge = getCapacitorBridge();
  if (!bridge) return null;
  if (!ringtonePickerPluginRef && typeof bridge.registerPlugin === "function") {
    ringtonePickerPluginRef = bridge.registerPlugin("RingtonePicker");
  }
  return ringtonePickerPluginRef || bridge.Plugins?.RingtonePicker || null;
}

function getNotificationSoundEntry(target) {
  const settings = normalizeNotificationSoundSettings(state.notificationSoundSettings);
  if (target === NOTIFICATION_SOUND_TARGET_DEPARTURE) return settings.departure;
  if (target === NOTIFICATION_SOUND_TARGET_TASK_RECHECK) return settings.taskRecheck;
  return settings.taskFinish;
}

function getNotificationSoundSettingRowsHtml() {
  const departure = getNotificationSoundEntry(NOTIFICATION_SOUND_TARGET_DEPARTURE);
  const taskFinish = getNotificationSoundEntry(NOTIFICATION_SOUND_TARGET_TASK_FINISH);
  const taskRecheck = getNotificationSoundEntry(NOTIFICATION_SOUND_TARGET_TASK_RECHECK);
  return `
    <div class="sound-setting-row">
      <p class="helper">出発前通知（アラーム音）</p>
      <p class="helper">選択中: ${escapeHtml(departure.title || getNotificationSoundFallbackTitle("alarm"))}</p>
      <button id="pickDepartureSoundBtn" class="btn-sub" type="button">音を選択</button>
    </div>
    <div class="sound-setting-row">
      <p class="helper">タスク予定時間通知（通知音）</p>
      <p class="helper">選択中: ${escapeHtml(taskFinish.title || getNotificationSoundFallbackTitle("notification"))}</p>
      <button id="pickTaskFinishSoundBtn" class="btn-sub" type="button">音を選択</button>
    </div>
    <div class="sound-setting-row">
      <p class="helper">20分後の再確認通知（通知音）</p>
      <p class="helper">選択中: ${escapeHtml(taskRecheck.title || getNotificationSoundFallbackTitle("notification"))}</p>
      <button id="pickTaskRecheckSoundBtn" class="btn-sub" type="button">音を選択</button>
    </div>
  `;
}

async function pickNotificationSound(target, toneType) {
  const bridge = getCapacitorBridge();
  const plugin = getRingtonePickerPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.pickSound) {
    alert("Androidアプリで設定してください。");
    return;
  }

  const current = getNotificationSoundEntry(target);
  try {
    const result = await plugin.pickSound({
      toneType,
      existingUri: current.uri || ""
    });
    if (!result?.selected || !result?.uri) return;

    const nextSettings = normalizeNotificationSoundSettings(state.notificationSoundSettings);
    const nextTitle = String(result.title || "").trim() || getNotificationSoundFallbackTitle(toneType);
    const nextUri = String(result.uri || "");
    const nextEntry = {
      target,
      uri: nextUri,
      title: nextTitle,
      toneType,
      channelId: buildNotificationChannelId(target, toneType, nextUri)
    };

    if (target === NOTIFICATION_SOUND_TARGET_DEPARTURE) nextSettings.departure = nextEntry;
    if (target === NOTIFICATION_SOUND_TARGET_TASK_FINISH) nextSettings.taskFinish = nextEntry;
    if (target === NOTIFICATION_SOUND_TARGET_TASK_RECHECK) nextSettings.taskRecheck = nextEntry;

    state.notificationSoundSettings = nextSettings;
    lastAppliedNotificationSoundConfigHash = "";
    await ensureLocalNotificationChannel();
    saveState();
    renderSettings();
  } catch (error) {
    console.error("[NotificationSound] Failed to pick sound", error);
    alert("音の選択に失敗しました。もう一度お試しください。");
  }
}

function getChannelSoundConfigHash() {
  return JSON.stringify(normalizeNotificationSoundSettings(state.notificationSoundSettings));
}

function resolveChannelConfig(target) {
  const entry = getNotificationSoundEntry(target);
  const isAlarm = entry.toneType === "alarm";
  const fallbackSound = isAlarm ? DEFAULT_ALARM_SOUND_MARKER : DEFAULT_NOTIFICATION_SOUND_MARKER;
  const sound = entry.uri || fallbackSound;
  return {
    channelId: entry.channelId || buildNotificationChannelId(target, entry.toneType, entry.uri),
    sound,
    audioUsage: isAlarm ? "alarm" : "notification"
  };
}

function getNotificationChannelIdForTarget(target) {
  return resolveChannelConfig(target).channelId;
}

async function initializeLocalNotificationTrial() {
  await ensureLocalNotificationChannel();
}

function restorePendingTaskFinishNotification() {
  const task = getRunningTask();
  if (!task || state.running.isPaused) return;
  scheduleTaskFinishNotificationForRunningTask(task, state.running.nextAlertKind || "task-finish");
}

function restorePendingDepartureNotification() {
  scheduleDepartureNotificationForCurrentPlan();
}

async function ensureLocalNotificationChannel() {
  const bridge = getCapacitorBridge();
  const plugin = getLocalNotificationsPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.createChannel) return false;

  try {
    const nextHash = getChannelSoundConfigHash();

    const departureConfig = resolveChannelConfig(NOTIFICATION_SOUND_TARGET_DEPARTURE);
    const taskFinishConfig = resolveChannelConfig(NOTIFICATION_SOUND_TARGET_TASK_FINISH);
    const taskRecheckConfig = resolveChannelConfig(NOTIFICATION_SOUND_TARGET_TASK_RECHECK);

    if (plugin.deleteChannel) {
      for (const channelId of LEGACY_ALERT_NOTIFICATION_CHANNEL_IDS) {
        try {
          await plugin.deleteChannel({ id: channelId });
        } catch (error) {
          console.warn("[LocalNotificationTest] Failed to delete legacy channel", channelId, error);
        }
      }

      if (nextHash !== lastAppliedNotificationSoundConfigHash) {
        const configurableChannelIds = [
          departureConfig.channelId,
          taskFinishConfig.channelId,
          taskRecheckConfig.channelId,
          "departure-alert-sound-v1",
          "task-finish-alert-sound-v1",
          "task-recheck-alert-sound-v1",
          "task-alarm-alert-v1"
        ];
        for (const channelId of configurableChannelIds) {
          try {
            await plugin.deleteChannel({ id: channelId });
          } catch (error) {
            // Ignore delete errors when channel does not exist.
          }
        }
      }
    }

    await plugin.createChannel({
      id: UNIFIED_ALERT_NOTIFICATION_CHANNEL_ID,
      name: "General Alert",
      description: "General alert channel for medicine and local notification tests",
      importance: 5,
      visibility: 1,
      vibration: true
    });

    await plugin.createChannel({
      id: departureConfig.channelId,
      name: "Departure Alert",
      description: "Departure reminder notification channel",
      importance: 5,
      visibility: 1,
      sound: departureConfig.sound,
      audioUsage: departureConfig.audioUsage,
      vibration: true
    });

    await plugin.createChannel({
      id: taskFinishConfig.channelId,
      name: "Task Finish Alert",
      description: "Task scheduled-time notification channel",
      importance: 5,
      visibility: 1,
      sound: taskFinishConfig.sound,
      audioUsage: taskFinishConfig.audioUsage,
      vibration: true
    });

    await plugin.createChannel({
      id: taskRecheckConfig.channelId,
      name: "Task Recheck Alert",
      description: "Task recheck notification channel after continue",
      importance: 5,
      visibility: 1,
      sound: taskRecheckConfig.sound,
      audioUsage: taskRecheckConfig.audioUsage,
      vibration: true
    });
    lastAppliedNotificationSoundConfigHash = nextHash;
    return true;
  } catch (error) {
    console.error("[LocalNotificationTest] Failed to create channel", error);
    return false;
  }
}

function readNotificationPermissionState(result) {
  return String(
    result?.display
    || result?.receive
    || result?.notifications
    || result?.permission
    || "prompt"
  );
}

async function ensureLocalNotificationPermission() {
  const bridge = getCapacitorBridge();
  const plugin = getLocalNotificationsPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.checkPermissions || !plugin?.requestPermissions) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    let permission = await plugin.checkPermissions();
    let stateValue = readNotificationPermissionState(permission);
    if (stateValue === "granted") return { ok: true };

    permission = await plugin.requestPermissions();
    stateValue = readNotificationPermissionState(permission);
    return { ok: stateValue === "granted", reason: stateValue };
  } catch (error) {
    console.error("[LocalNotificationTest] Failed to check/request permissions", error);
    return { ok: false, reason: "error" };
  }
}

function hashStringToPositiveInt(text) {
  let hash = 0;
  const source = String(text || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTaskFinishNotificationId(taskId) {
  const hashed = hashStringToPositiveInt(taskId) % TASK_FINISH_NOTIFICATION_ID_RANGE;
  return TASK_FINISH_NOTIFICATION_ID_BASE + hashed;
}

function getDepartureNotificationId(dateKey = state.dateKey) {
  const hashed = hashStringToPositiveInt(`${dateKey || ""}::departure`) % DEPARTURE_NOTIFICATION_ID_RANGE;
  return DEPARTURE_NOTIFICATION_ID_BASE + hashed;
}

function getDepartureNotificationLeadMinutes() {
  if (state.departureNotification?.leadMinutes === null) return null;
  const leadMinutes = Number(state.departureNotification?.leadMinutes);
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(leadMinutes)
    ? leadMinutes
    : DEFAULT_DEPARTURE_NOTIFICATION_LEAD_MINUTES;
}

async function cancelLocalNotificationsByIds(notificationIds) {
  const bridge = getCapacitorBridge();
  const plugin = getLocalNotificationsPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.cancel) return false;

  const ids = Array.from(new Set(
    (Array.isArray(notificationIds) ? notificationIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  ));
  if (ids.length === 0) return false;

  try {
    await plugin.cancel({ notifications: ids.map((id) => ({ id })) });
    return true;
  } catch (error) {
    console.error("[LocalNotification] Failed to cancel notifications", error);
    return false;
  }
}

function getMedicineNotificationId(dateKey, slotIndex) {
  const normalizedDateKey = normalizeTaskDateKey(dateKey) || state.dateKey;
  const normalizedSlotIndex = Math.max(0, Number(slotIndex) || 0);
  const hashed = hashStringToPositiveInt(`${normalizedDateKey}::medicine::${normalizedSlotIndex}`) % MEDICINE_REMINDER_NOTIFICATION_ID_RANGE;
  return MEDICINE_REMINDER_NOTIFICATION_ID_BASE + hashed;
}

function getMedicineNotificationIdsForDate(dateKey) {
  const ids = [];
  let slotIndex = 0;
  for (let hour = MEDICINE_REMINDER_FIRST_HOUR; hour <= MEDICINE_REMINDER_LAST_HOUR; hour += 1) {
    const minStart = hour === MEDICINE_REMINDER_FIRST_HOUR ? MEDICINE_REMINDER_FIRST_MINUTE : 0;
    const minEnd = hour === MEDICINE_REMINDER_LAST_HOUR ? MEDICINE_REMINDER_LAST_MINUTE : 59;
    for (let minute = minStart; minute <= minEnd; minute += MEDICINE_REMINDER_INTERVAL_MINUTES) {
      ids.push(getMedicineNotificationId(dateKey, slotIndex));
      slotIndex += 1;
    }
  }
  return ids;
}

function getDateTimeByDateKeyAndTime(dateKey, hour, minute) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(hour), Number(minute), 0, 0);
}

function getMedicineReminderStartAt(dateKey = state.dateKey) {
  return getDateTimeByDateKeyAndTime(dateKey, MEDICINE_REMINDER_FIRST_HOUR, MEDICINE_REMINDER_FIRST_MINUTE);
}

function getMedicineReminderEndAt(dateKey = state.dateKey) {
  return getDateTimeByDateKeyAndTime(dateKey, MEDICINE_REMINDER_LAST_HOUR, MEDICINE_REMINDER_LAST_MINUTE);
}

function isMedicineDoneAll(reminder = state.medicineReminder) {
  return Boolean(reminder?.blue?.done && reminder?.red?.done);
}

function getIncompleteMedicineLabels(reminder = state.medicineReminder) {
  const labels = [];
  if (!reminder?.blue?.done) labels.push("青の薬");
  if (!reminder?.red?.done) labels.push("赤の薬");
  return labels;
}

function buildMedicineReminderNotificationBody(reminder = state.medicineReminder) {
  const labels = getIncompleteMedicineLabels(reminder);
  if (labels.length === 0) return "今日の薬は記録済みです。";
  return `${labels.join("・")}を飲んで記録してください`;
}

function getNextMedicineReminderSlotAt(baseMs, dateKey = state.dateKey) {
  const startAt = getMedicineReminderStartAt(dateKey);
  const endAt = getMedicineReminderEndAt(dateKey);
  if (!startAt || !endAt) return null;

  const base = Math.max(Number(baseMs) || 0, startAt.getTime());
  if (base > endAt.getTime()) return null;

  const intervalMs = MEDICINE_REMINDER_INTERVAL_MINUTES * 60 * 1000;
  const elapsedMs = Math.max(0, base - startAt.getTime());
  const slotOffset = Math.ceil(elapsedMs / intervalMs) * intervalMs;
  const slotAt = new Date(startAt.getTime() + slotOffset);
  if (slotAt.getTime() > endAt.getTime()) return null;
  return slotAt;
}

async function refreshMedicineReminderNotifications() {
  const reminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  state.medicineReminder = reminder;

  const notificationIds = getMedicineNotificationIdsForDate(reminder.dateKey);
  await cancelLocalNotificationsByIds(notificationIds);

  if (isMedicineDoneAll(reminder)) return { ok: true, reason: "done" };

  const nowMs = getNowInJst().getTime();
  const startAt = getMedicineReminderStartAt(reminder.dateKey);
  const endAt = getMedicineReminderEndAt(reminder.dateKey);
  if (!startAt || !endAt) return { ok: false, reason: "invalid-date" };

  let firstAt = null;
  if (reminder.snoozeUntil > nowMs) {
    firstAt = new Date(reminder.snoozeUntil);
  } else {
    firstAt = getNextMedicineReminderSlotAt(nowMs, reminder.dateKey);
  }

  if (!firstAt || firstAt.getTime() > endAt.getTime()) return { ok: true, reason: "outside-window" };

  const schedules = [];
  schedules.push(firstAt);
  const intervalMs = MEDICINE_REMINDER_INTERVAL_MINUTES * 60 * 1000;
  for (let t = firstAt.getTime() + intervalMs; t <= endAt.getTime(); t += intervalMs) {
    schedules.push(new Date(t));
  }

  const uniqueTimes = [];
  const seen = new Set();
  schedules.forEach((dt) => {
    const key = dt.getTime();
    if (seen.has(key)) return;
    seen.add(key);
    uniqueTimes.push(dt);
  });

  for (let i = 0; i < uniqueTimes.length; i += 1) {
    const notifyAt = uniqueTimes[i];
    const result = await scheduleLocalNotification({
      id: getMedicineNotificationId(reminder.dateKey, i),
      title: "薬の時間です",
      body: buildMedicineReminderNotificationBody(reminder),
      notifyAt,
      channelId: UNIFIED_ALERT_NOTIFICATION_CHANNEL_ID,
      extra: {
        source: "medicine-reminder",
        dateKey: reminder.dateKey
      }
    });
    if (!result.ok && result.reason !== "unsupported") {
      return result;
    }
  }

  return { ok: true };
}

function shouldShowMedicineReminderOverlayNow() {
  const reminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  if (isMedicineDoneAll(reminder)) return Boolean(reminder.forceOpen);

  const nowMs = getNowInJst().getTime();
  if (reminder.forceOpen) return true;
  if (reminder.snoozeUntil > nowMs) return false;

  const startAt = getMedicineReminderStartAt(reminder.dateKey);
  if (!startAt) return false;
  return nowMs >= startAt.getTime();
}

function openMedicineReminderOverlay(forceOpen = true) {
  state.medicineReminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  state.medicineReminder.forceOpen = Boolean(forceOpen);
  saveState();
  render();
}

function closeMedicineReminderOverlay() {
  state.medicineReminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  state.medicineReminder.forceOpen = false;
  saveState();
  render();
}

function setupLocalNotificationActionListener() {
  const bridge = getCapacitorBridge();
  const plugin = getLocalNotificationsPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.addListener || localNotificationListenerRegistered) return;

  localNotificationListenerRegistered = true;
  plugin.addListener("localNotificationReceived", (event) => {
    const source = String(event?.notification?.extra?.source || "");
    if (source !== "task-finish" && source !== "task-recheck" && source !== "departure-reminder" && source !== "local-notification-test") return;
    runVibrationFeedback("received");
  });
  plugin.addListener("localNotificationActionPerformed", (event) => {
    const source = String(event?.notification?.extra?.source || "");
    if (source === "medicine-reminder") {
      openMedicineReminderOverlay(true);
      return;
    }
    if (source === "task-finish" || source === "task-recheck") {
      const notifiedTaskId = String(event?.notification?.extra?.taskId || "");
      const runningTask = getRunningTask();
      if (!runningTask || state.running.isPaused || runningTask.id !== notifiedTaskId) return;
      state.running.alerting = true;
      if (Number.isFinite(Number(state.running.alertAtSeconds))) {
        state.running.lastAlertTarget = Number(state.running.alertAtSeconds);
      }
      saveState();
      render();
    }
  });
}

function requestMedicineReminderNotificationRefresh() {
  void refreshMedicineReminderNotifications().catch((error) => {
    console.error("[MedicineReminder] Failed to refresh notifications", error);
  });
}

async function scheduleLocalNotification({ id, title, body, notifyAt, channelId, extra }) {
  const bridge = getCapacitorBridge();
  const plugin = getLocalNotificationsPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.schedule) {
    return { ok: false, reason: "unsupported" };
  }

  await ensureLocalNotificationChannel();
  const permission = await ensureLocalNotificationPermission();
  if (!permission.ok) {
    return { ok: false, reason: permission.reason || "permission" };
  }

  await plugin.schedule({
    notifications: [{
      id,
      title,
      body,
      schedule: {
        at: notifyAt,
        allowWhileIdle: true
      },
      channelId,
      sound: "default",
      extra: extra || {}
    }]
  });
  return { ok: true };
}

function buildTaskFinishNotificationBody(task) {
  const content = String(task?.content || "").trim();
  return content || "予定時間が終了しました";
}

function formatDepartureNotificationTime(dateTime) {
  if (!(dateTime instanceof Date) || Number.isNaN(dateTime.getTime())) return "";
  const hour = dateTime.getHours();
  const minute = dateTime.getMinutes();
  return `${hour}時${minute}分`;
}

function getDepartureNotificationTitle() {
  const leadMinutes = getDepartureNotificationLeadMinutes();
  if (leadMinutes === null) return "";
  return leadMinutes === 0 ? "出発の時間です" : `出発${leadMinutes}分前です`;
}

function getDepartureNotificationBody(dateTime) {
  const formatted = formatDepartureNotificationTime(dateTime);
  return formatted ? `予定の出発時刻は${formatted}です` : "予定の出発時刻です";
}

async function scheduleDepartureNotificationForCurrentPlan() {
  const departureTime = String(state.planTimes?.departure || "");
  const notificationId = getDepartureNotificationId();
  await cancelLocalNotificationsByIds([notificationId]);

  if (departureTime === "none") return { ok: true, reason: "disabled" };

  const departureAt = getDateTimeToday(departureTime);
  if (!departureAt) return { ok: false, reason: "invalid-time" };

  const leadMinutes = getDepartureNotificationLeadMinutes();
  if (leadMinutes === null) return { ok: true, reason: "disabled" };
  const notifyAt = new Date(departureAt.getTime() - leadMinutes * 60 * 1000);
  if (notifyAt.getTime() <= Date.now()) return { ok: false, reason: "past" };

  try {
    const result = await scheduleLocalNotification({
      id: notificationId,
      title: getDepartureNotificationTitle(),
      body: getDepartureNotificationBody(departureAt),
      notifyAt,
      channelId: getNotificationChannelIdForTarget(NOTIFICATION_SOUND_TARGET_DEPARTURE),
      extra: {
        source: "departure-reminder",
        dateKey: state.dateKey,
        departureTime,
        leadMinutes
      }
    });
    return result;
  } catch (error) {
    console.error("[DepartureNotification] Failed to schedule notification", error);
    return { ok: false, reason: "error" };
  }
}

function cancelDepartureNotification() {
  const notificationId = getDepartureNotificationId();
  cancelLocalNotificationsByIds([notificationId]).catch((error) => {
    console.error("[DepartureNotification] Failed to cancel notification", error);
  });
}

function refreshDepartureNotification() {
  void scheduleDepartureNotificationForCurrentPlan();
}

function scheduleTaskFinishNotificationForRunningTask(task, alertKind = "task-finish") {
  const target = Number(state.running?.alertAtSeconds);
  if (!task || !Number.isFinite(target)) return;

  const normalizedAlertKind = alertKind === "task-recheck" ? "task-recheck" : "task-finish";
  state.running.nextAlertKind = normalizedAlertKind;

  const isActivelyRunning = Boolean(
    state.running?.taskId === task.id
    && state.running?.startedAt
    && !state.running?.isPaused
  );
  const elapsedSeconds = isActivelyRunning
    ? getRunningElapsedSeconds()
    : Math.max(0, Number(state.running?.baseSeconds || 0));
  const remainingSeconds = Math.max(1, Math.ceil(target - elapsedSeconds));
  const notifyAt = new Date(Date.now() + remainingSeconds * 1000);
  const notificationId = getTaskFinishNotificationId(task.id);

  (async () => {
    await cancelLocalNotificationsByIds([notificationId]);
    try {
      const result = await scheduleLocalNotification({
        id: notificationId,
        title: "時間になりました",
        body: buildTaskFinishNotificationBody(task),
        notifyAt,
        channelId: normalizedAlertKind === "task-recheck"
          ? getNotificationChannelIdForTarget(NOTIFICATION_SOUND_TARGET_TASK_RECHECK)
          : getNotificationChannelIdForTarget(NOTIFICATION_SOUND_TARGET_TASK_FINISH),
        extra: {
          source: normalizedAlertKind,
          taskId: task.id
        }
      });
      if (!result.ok && result.reason !== "unsupported") {
        console.warn("[TaskFinishNotification] Notification was not scheduled", result.reason);
      }
    } catch (error) {
      console.error("[TaskFinishNotification] Failed to schedule notification", error);
    }
  })();
}

function cancelTaskFinishNotification(taskId) {
  if (!taskId) return;
  const notificationId = getTaskFinishNotificationId(taskId);
  cancelLocalNotificationsByIds([notificationId]).catch((error) => {
    console.error("[TaskFinishNotification] Failed to cancel notification", error);
  });
}

async function runLocalNotificationTest() {
  const bridge = getCapacitorBridge();
  const plugin = getLocalNotificationsPlugin();
  if (!bridge?.isNativePlatform?.() || !plugin?.schedule) {
    setLocalNotificationTestMessage("Android実機のCapacitorアプリ上で確認してください。");
    return;
  }

  setLocalNotificationTestMessage("通知権限を確認しています...");
  await ensureLocalNotificationChannel();
  const permission = await ensureLocalNotificationPermission();
  if (!permission.ok) {
    setLocalNotificationTestMessage("通知権限が必要です。端末設定で通知を許可してください。");
    return;
  }

  const notifyAt = new Date(Date.now() + 10 * 1000);
  try {
    const result = await scheduleLocalNotification({
      id: LOCAL_NOTIFICATION_TEST_NOTIFICATION_ID,
      title: "タスク終了",
      body: "数学の終了時間です",
      notifyAt,
      channelId: UNIFIED_ALERT_NOTIFICATION_CHANNEL_ID,
      extra: {
        source: "local-notification-test"
      }
    });
    if (!result.ok) {
      throw new Error(`schedule failed: ${result.reason || "unknown"}`);
    }
    setLocalNotificationTestMessage(`10秒後の通知を予約しました（${notifyAt.toLocaleTimeString("ja-JP")})`);
  } catch (error) {
    console.error("[LocalNotificationTest] Failed to schedule notification", error);
    setLocalNotificationTestMessage("通知予約に失敗しました。ログを確認してください。");
  }
}

function runDevAlertTest() {
  const feedback = document.getElementById("devAlertFeedbackArea");
  ensureNotificationAudioReady(true).finally(() => {
    // Development-only: directly call the same production alert start function.
    triggerAlertFeedback("first", {
      overrideVolume: devAlertTestConfig.volume,
      overrideToneType: devAlertTestConfig.toneType,
      overrideDurationSeconds: devAlertTestConfig.durationSeconds
    });
    feedback?.classList.remove("hidden");
  });
}

function resetDailyStatus() {
  const ok = window.confirm("当日の状態をクリーンにします。今日の予定・完了タスクを削除し、出発前/帰宅時チェックを初期化します。宿題・課題（締切管理）は削除しません。実行しますか？");
  if (!ok) return;

  state.tasks = [];
  state.planTimes = {
    wakeUp: "",
    departure: "",
    returnHome: "",
    studyStart: ""
  };
  state.planningForm = createPlanningForm();
  state.recurringPlansAppliedByDate = {};
  state.recurringSyncDateKey = null;
  state.historyEventsByDate = normalizeHistoryEventsByDate(state.historyEventsByDate, state.dateKey);
  delete state.dailySpecialBelongingsByDate[state.dateKey];
  state.planningDailyBelongingInput = "";
  state.running = createRunningState();
  state.review = createReviewState();
  state.departureCheck = createDepartureCheckState();
  state.returnCheck = createReturnCheckState();
  state.medicineReminder = createMedicineReminderState(state.dateKey);
  state.confirmedPlan = null;
  state.goPressedAt = null;
  state.dayClosed = false;
  state.previousDayPending = null;
  state.previousDayArchive = null;
  state.homeViewMode = "current";
  state.homeTaskListExpanded = false;
  state.submissionChecklistTarget = null;
  state.lastResultReportText = "";
  state.phase = "home";
  saveState();
  requestMedicineReminderNotificationRefresh();
  render();
}

function renderRecurringListScreen() {
  renderScreen(`
    <h2>定期予定一覧</h2>
    <ul id="recurringList" class="task-list recurring-list"></ul>
    <div class="btn-row compact-stack">
      <button id="addRecurringBtn" class="btn-main" type="button">＋ 定期予定を追加</button>
      <button id="backToSettingsBtn" class="btn-quiet" type="button">戻る</button>
    </div>
  `);

  renderRecurringListRows();
  bindRecurringListEvents();
}

function renderRecurringEditScreen() {
  const editing = state.recurringForm.mode === "edit";
  renderScreen(`
    <h2>${editing ? "定期予定を編集" : "定期予定を追加"}</h2>
    <div class="task-form-box">
      <div class="form-stack">
        <div><label for="recurringName">予定名</label><input id="recurringName" type="text" value="${escapeHtml(state.recurringForm.name)}" maxlength="40" placeholder="例: 原田先生" /></div>
        <div>
          <label>予定時間（分）</label>
          <div class="btn-row" id="recurringMinutePresetRow">${renderRecurringMinutePresetButtons()}</div>
        </div>
        <div><label for="recurringMinutes">自分で入力（分）</label><input id="recurringMinutes" type="number" min="1" max="600" step="1" value="${escapeHtml(String(sanitizeMinutes(state.recurringForm.minutes) || DEFAULT_MINUTES))}" /></div>
        <div><label for="recurringContent">内容</label><input id="recurringContent" type="text" value="${escapeHtml(state.recurringForm.content)}" maxlength="120" placeholder="例: 宿題 p54" /></div>
        <div>
          <label>持ち物</label>
          <div class="btn-row split compact-stack">
            <input id="recurringBelongingInput" type="text" value="${escapeHtml(state.recurringForm.belongingInput)}" maxlength="60" placeholder="例: グローブ" />
            <button id="addRecurringBelongingBtn" class="btn-sub" type="button" ${getSaveActionDisabledAttr()}>${getSaveActionLabel("recurring-belonging-add", "追加")}</button>
          </div>
          <ul id="recurringBelongingList" class="confirm-list">${renderRecurringBelongingList()}</ul>
        </div>
        <div>
          <label>繰り返し</label>
          <div class="option-group compact-options">
            <label class="option-item"><input type="radio" name="recurringRepeatType" value="daily" ${state.recurringForm.repeatType === "daily" ? "checked" : ""} /><span>毎日</span></label>
            <label class="option-item"><input type="radio" name="recurringRepeatType" value="weekday" ${state.recurringForm.repeatType === "weekday" ? "checked" : ""} /><span>曜日指定</span></label>
          </div>
        </div>
        <div id="recurringDaysWrap" class="${state.recurringForm.repeatType === "weekday" ? "" : "hidden"}">
          <label>曜日選択</label>
          <div class="option-group compact-options recurring-day-grid">${renderRecurringDayOptions()}</div>
        </div>
        <div><label for="recurringSubmissionTemplate">提出・確認テンプレート</label><select id="recurringSubmissionTemplate">${renderSubmissionTemplateOptions(state.recurringForm.submissionTemplateId)}</select></div>
        <div>
          <label>Googleカレンダー同期</label>
          <div class="option-group compact-options">
            <label class="option-item"><input type="radio" name="recurringGoogleSync" value="on" ${state.recurringForm.googleSync ? "checked" : ""} /><span>ON</span></label>
            <label class="option-item"><input type="radio" name="recurringGoogleSync" value="off" ${!state.recurringForm.googleSync ? "checked" : ""} /><span>OFF</span></label>
          </div>
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="saveRecurringBtn" class="btn-main" type="button" ${getSaveActionDisabledAttr()}>${getSaveActionLabel("recurring-save", "保存")}</button>
        ${editing ? `<button id="deleteRecurringBtn" class="btn-danger" type="button" ${getBusyDisabledAttr()}>削除</button>` : ""}
      </div>
    </div>

    <div class="btn-row compact-stack">
      <button id="backToRecurringListBtn" class="btn-quiet" type="button" ${getBusyDisabledAttr()}>戻る</button>
    </div>
  `);

  bindRecurringEditEvents();
}

function renderRecurringMinutePresetButtons() {
  return MINUTE_OPTIONS.map((m) => `<button type="button" class="btn-mini btn-quiet" data-recurring-minute="${m}">${m}</button>`).join("");
}

function renderRecurringDayOptions() {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((key) => {
    const checked = state.recurringForm.days.includes(key) ? "checked" : "";
    return `<label class="option-item recurring-day-item"><input type="checkbox" name="recurringDay" value="${key}" ${checked} /><span>${RECURRING_DAY_LABELS[key]}</span></label>`;
  }).join("");
}

function renderRecurringBelongingList() {
  if (!Array.isArray(state.recurringForm.belongings) || state.recurringForm.belongings.length === 0) {
    return "<li>持ち物は未登録です。</li>";
  }
  return state.recurringForm.belongings
    .map((name, idx) => `<li>${escapeHtml(name)} <button type="button" class="btn-mini btn-danger" data-recurring-belonging-remove="${idx}">削除</button></li>`)
    .join("");
}

function renderRecurringListRows() {
  const list = document.getElementById("recurringList");
  if (!list) return;
  list.innerHTML = "";

  if (state.recurringPlans.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-card compact-empty";
    empty.innerHTML = "<p>定期予定はまだありません。</p>";
    list.appendChild(empty);
    return;
  }

  state.recurringPlans.forEach((plan) => {
    const li = document.createElement("li");
    li.className = "task-card recurring-list-row";
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.dataset.id = plan.id;
    li.innerHTML = `
      <div class="recurring-list-main">${escapeHtml(plan.name)}</div>
      <div class="recurring-list-days">${escapeHtml(formatRecurringRepeat(plan))}</div>
      <div class="recurring-list-minutes">${plan.plannedMinutes}分</div>
      <div class="recurring-list-arrow" aria-hidden="true">＞</div>
    `;
    li.addEventListener("click", () => {
      loadRecurringIntoForm(plan.id);
      changePhase("recurringEdit");
    });
    li.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      li.click();
    });
    list.appendChild(li);
  });
}

  function bindRecurringListEvents() {
    document.getElementById("addRecurringBtn").addEventListener("click", () => {
      state.recurringForm = createRecurringForm();
      saveState();
      changePhase("recurringEdit");
    });
    document.getElementById("backToSettingsBtn").addEventListener("click", () => changePhase("settings"));
  }

  function bindRecurringEditEvents() {
    document.getElementById("recurringName").addEventListener("input", (e) => {
      if (shouldSkipInputWhileComposing(e)) return;
      state.recurringForm.name = e.target.value;
      saveState();
    });
    document.getElementById("recurringMinutes").addEventListener("input", (e) => {
      state.recurringForm.minutes = e.target.value;
      saveState();
    });
    document.querySelectorAll("button[data-recurring-minute]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const minutes = String(btn.dataset.recurringMinute || "");
        if (!minutes) return;
        state.recurringForm.minutes = minutes;
        const input = document.getElementById("recurringMinutes");
        if (input) input.value = minutes;
        saveState();
      });
    });
    document.getElementById("recurringContent").addEventListener("input", (e) => {
      if (shouldSkipInputWhileComposing(e)) return;
      state.recurringForm.content = e.target.value;
      saveState();
    });
    document.getElementById("recurringBelongingInput")?.addEventListener("input", (e) => {
      if (shouldSkipInputWhileComposing(e)) return;
      state.recurringForm.belongingInput = e.target.value;
      saveState();
    });
    bindProtectedActionButton("addRecurringBelongingBtn", async () => {
      syncRecurringFormFromDom();
      const name = normalizeBelongingName(state.recurringForm.belongingInput);
      if (!name) {
        deferredUiBlockUntil = 0;
        flushDeferredUiUpdates();
        return;
      }
      await runProtectedSaveAction({
        key: "recurring-belonging-add",
        syncFromDom: syncRecurringFormFromDom,
        captureState: () => structuredClone({ recurringForm: state.recurringForm }),
        restoreState: (snapshot) => {
          if (!snapshot) return;
          state.recurringForm = normalizeRecurringForm(snapshot.recurringForm);
        },
        apply: () => {
          const nextName = normalizeBelongingName(state.recurringForm.belongingInput);
          if (!state.recurringForm.belongings.includes(nextName)) {
            state.recurringForm.belongings.push(nextName);
          }
          state.recurringForm.belongingInput = "";
        },
        onSuccess: () => {
          saveState();
          renderRecurringEditScreen();
        },
        successMessage: ""
      });
    });
    document.querySelectorAll("button[data-recurring-belonging-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.recurringBelongingRemove);
        if (!Number.isInteger(idx) || idx < 0) return;
        state.recurringForm.belongings = state.recurringForm.belongings.filter((_, i) => i !== idx);
        saveState();
        renderRecurringEditScreen();
      });
    });
    document.querySelectorAll("input[name='recurringRepeatType']").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        state.recurringForm.repeatType = normalizeRecurringRepeatType(e.target.value);
        if (state.recurringForm.repeatType === "daily") state.recurringForm.days = [];
        saveState();
        renderRecurringEditScreen();
      });
    });
    document.querySelectorAll("input[name='recurringDay']").forEach((cb) => {
      cb.addEventListener("change", () => {
        const selected = Array.from(document.querySelectorAll("input[name='recurringDay']:checked")).map((x) => x.value);
        state.recurringForm.days = normalizeRepeatDays(selected);
        saveState();
      });
    });
    document.querySelectorAll("input[name='recurringGoogleSync']").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        state.recurringForm.googleSync = e.target.value === "on";
        saveState();
      });
    });
    document.getElementById("recurringSubmissionTemplate")?.addEventListener("change", (e) => {
      state.recurringForm.submissionTemplateId = normalizeSubmissionTemplateId(e.target.value);
      saveState();
    });

    bindProtectedActionButton("saveRecurringBtn", saveRecurringPlan);
    document.getElementById("deleteRecurringBtn")?.addEventListener("click", deleteRecurringPlanFromEdit);
    document.getElementById("backToRecurringListBtn").addEventListener("click", () => changePhase("recurringList"));
  }

  function loadRecurringIntoForm(id) {
    const plan = state.recurringPlans.find((p) => p.id === id);
    if (!plan) return;
    state.recurringForm = {
      mode: "edit",
      targetId: plan.id,
      name: plan.name,
      minutes: String(plan.plannedMinutes),
      content: plan.content,
      belongings: [...(plan.belongings || [])],
      belongingInput: "",
      submissionTemplateId: normalizeSubmissionTemplateId(plan.submissionTemplateId),
      repeatType: normalizeRecurringRepeatType(plan.repeatType),
      days: [...plan.days],
      googleSync: Boolean(plan.googleSync)
    };
    saveState();
  }

  function deleteRecurringPlanFromEdit() {
    const id = state.recurringForm.targetId;
    const plan = state.recurringPlans.find((p) => p.id === id);
    if (!id || !plan) return;
    if (!window.confirm(`「${plan.name}」を削除しますか？`)) return;
    state.recurringPlans = state.recurringPlans.filter((p) => p.id !== id);
    state.recurringForm = createRecurringForm();
    saveState();
    changePhase("recurringList");
  }

  async function saveRecurringPlan() {
    await runProtectedSaveAction({
      key: "recurring-save",
      syncFromDom: syncRecurringFormFromDom,
      validate: () => {
        const name = state.recurringForm.name.trim();
        const minutes = sanitizeMinutes(state.recurringForm.minutes);
        const content = state.recurringForm.content.trim();
        const repeatType = normalizeRecurringRepeatType(state.recurringForm.repeatType);
        const days = normalizeRepeatDays(state.recurringForm.days);
        if (!name) return "予定名を入力してください。";
        if (!minutes) return "予定時間（分）を入力してください。";
        if (!content) return "内容を入力してください。";
        if (repeatType === "weekday" && days.length === 0) return "曜日を1つ以上選択してください。";
        if (state.recurringForm.mode === "edit" && !state.recurringPlans.find((p) => p.id === state.recurringForm.targetId)) {
          return "保存対象の定期予定が見つかりません。";
        }
        return null;
      },
      captureState: () => structuredClone({
        recurringPlans: state.recurringPlans,
        recurringForm: state.recurringForm
      }),
      restoreState: (snapshot) => {
        if (!snapshot) return;
        state.recurringPlans = snapshot.recurringPlans;
        state.recurringForm = normalizeRecurringForm(snapshot.recurringForm);
      },
      apply: () => {
        const name = state.recurringForm.name.trim();
        const minutes = sanitizeMinutes(state.recurringForm.minutes);
        const content = state.recurringForm.content.trim();
        const belongings = normalizeBelongingsList(state.recurringForm.belongings);
        const submissionTemplateId = normalizeSubmissionTemplateId(state.recurringForm.submissionTemplateId);
        const repeatType = normalizeRecurringRepeatType(state.recurringForm.repeatType);
        const days = normalizeRepeatDays(state.recurringForm.days);
        const googleSync = Boolean(state.recurringForm.googleSync);

        if (state.recurringForm.mode === "edit") {
          const plan = state.recurringPlans.find((p) => p.id === state.recurringForm.targetId);
          if (!plan) throw new Error("missing-recurring-plan");
          plan.name = name;
          plan.plannedMinutes = minutes;
          plan.content = content;
          plan.belongings = belongings;
          plan.submissionTemplateId = submissionTemplateId;
          plan.repeatType = repeatType;
          plan.days = repeatType === "daily" ? [] : days;
          plan.googleSync = googleSync;
          return;
        }

        state.recurringPlans.push(createRecurringPlan(name, minutes, content, repeatType, repeatType === "daily" ? [] : days, googleSync, belongings, submissionTemplateId));
      },
      onSuccess: () => {
        state.recurringForm = createRecurringForm();
        saveState();
        changePhase("recurringList");
      },
      successMessage: "定期予定を登録しました"
    });
  }

  function formatRecurringRepeat(plan) {
    if (plan.repeatType === "daily") return "毎日";
    const days = Array.isArray(plan.days) ? plan.days : [];
    return days.map((d) => `${RECURRING_DAY_LABELS[d] || d}曜`).join("・");
  }

function findSubmissionTemplate(templateId) {
  if (!templateId) return null;
  return state.submissionTemplates.find((template) => template.id === templateId) || null;
}

function normalizeLooseMatchText(value) {
  return String(value || "").replace(/[\s　]+/g, "").trim();
}

function findTemplateItemByLabelVariants(template, labelVariants) {
  if (!template || !Array.isArray(template.items)) return null;
  const normalizedVariants = labelVariants.map(normalizeLooseMatchText).filter(Boolean);
  if (normalizedVariants.length === 0) return null;
  return template.items.find((templateItem) => {
    const normalizedLabel = normalizeLooseMatchText(templateItem?.label);
    return normalizedVariants.includes(normalizedLabel);
  }) || null;
}

function getNoHomeworkChecklistStepsByTemplateId(templateId) {
  const template = findSubmissionTemplate(templateId);
  if (!template) return null;
  const firstStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_FIRST_STEP_LABEL, NO_HOMEWORK_FIRST_STEP_LABEL_LEGACY]);
  const secondStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_SECOND_STEP_LABEL, NO_HOMEWORK_SECOND_STEP_LABEL_LEGACY]);
  const thirdStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_THIRD_STEP_LABEL]);
  const fourthStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_FOURTH_STEP_LABEL, NO_HOMEWORK_FOURTH_STEP_LABEL_LEGACY]);
  if (!firstStep || !secondStep || !thirdStep || !fourthStep) return null;
  return {
    firstStep,
    secondStep,
    thirdStep,
    fourthStep,
    ordered: [firstStep, secondStep, thirdStep, fourthStep]
  };
}

function getStandardHomeworkManualStepsByTemplateId(templateId) {
  const template = findSubmissionTemplate(templateId);
  if (!template) return null;
  const firstStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_FIRST_STEP_LABEL, NO_HOMEWORK_FIRST_STEP_LABEL_LEGACY]);
  const secondStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_SECOND_STEP_LABEL, NO_HOMEWORK_SECOND_STEP_LABEL_LEGACY]);
  const thirdStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_THIRD_STEP_LABEL]);
  const fourthStep = findTemplateItemByLabelVariants(template, [NO_HOMEWORK_FOURTH_STEP_LABEL, NO_HOMEWORK_FOURTH_STEP_LABEL_LEGACY]);
  if (!firstStep || !secondStep || !thirdStep || !fourthStep) return null;
  return {
    firstStep,
    secondStep,
    thirdStep,
    fourthStep,
    ordered: [firstStep, secondStep, thirdStep, fourthStep]
  };
}

function buildHomeworkStandardFlowState(item, baseDateKey = getCurrentHomeDateKey()) {
  if (!item) return null;
  const workType = normalizeHomeworkWorkType(item.homeworkWorkType);
  if (![HOMEWORK_WORK_TYPE_WITH_WORK, HOMEWORK_WORK_TYPE_NO_WORK].includes(workType)) return null;

  const manualSteps = getStandardHomeworkManualStepsByTemplateId(item.submissionTemplateId);
  if (!manualSteps) return null;

  const checkedSet = new Set(normalizeSubmissionCheckedItemIds(item.submissionCheckedItemIds));
  const deadlineDayNumber = getDateKeyDayNumber(item.deadlineDate);
  const baseDayNumber = getDateKeyDayNumber(baseDateKey);
  const isFromDeadlineEve = baseDayNumber !== null && deadlineDayNumber !== null && baseDayNumber >= (deadlineDayNumber - 1);
  const isFromDeadlineDay = baseDayNumber !== null && deadlineDayNumber !== null && baseDayNumber >= deadlineDayNumber;

  const firstDone = checkedSet.has(manualSteps.firstStep.id);
  const bagDone = checkedSet.has(manualSteps.secondStep.id);
  const submitDone = checkedSet.has(manualSteps.thirdStep.id);
  const reportDone = checkedSet.has(manualSteps.fourthStep.id);

  const rows = [
    {
      key: "write",
      label: manualSteps.firstStep.label,
      kind: "manual",
      itemId: manualSteps.firstStep.id,
      confirmed: firstDone,
      actionable: !firstDone
    }
  ];

  rows.push({
    key: "bag",
    label: manualSteps.secondStep.label,
    kind: "manual",
    itemId: manualSteps.secondStep.id,
    confirmed: bagDone,
    actionable: !bagDone && isFromDeadlineEve && firstDone
  });

  rows.push({
    key: "submit",
    label: manualSteps.thirdStep.label,
    kind: "manual",
    itemId: manualSteps.thirdStep.id,
    confirmed: submitDone,
    actionable: !submitDone && isFromDeadlineDay && bagDone
  });

  rows.push({
    key: "report",
    label: manualSteps.fourthStep.label,
    kind: "manual",
    itemId: manualSteps.fourthStep.id,
    confirmed: reportDone,
    actionable: !reportDone && submitDone
  });

  const nextActionableManualRow = rows.find((row) => row.kind === "manual" && row.actionable && !row.confirmed) || null;
  return {
    workType,
    rows,
    nextActionableManualRow,
    complete: rows.every((row) => row.confirmed)
  };
}

function updateHomeworkCompletionByStandardFlow(item, baseDateKey = getCurrentHomeDateKey()) {
  const flow = buildHomeworkStandardFlowState(item, baseDateKey);
  if (!flow) return false;
  if (!flow.complete) return false;
  item.done = true;
  item.submissionChecklistCompleted = true;
  return true;
}

function createSubmissionTemplateFromName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  return {
    id: crypto.randomUUID(),
    name: trimmed,
    items: []
  };
}

function renderSubmissionTemplateOptions(selectedId) {
  const options = [`<option value="" ${!selectedId ? "selected" : ""}>なし</option>`];
  state.submissionTemplates.forEach((template) => {
    const selected = template.id === selectedId ? "selected" : "";
    options.push(`<option value="${escapeHtml(template.id)}" ${selected}>${escapeHtml(template.name)}</option>`);
  });
  return options.join("");
}

function getSubmissionChecklistSummary(target) {
  if (!target) return null;
  const template = findSubmissionTemplate(target.submissionTemplateId);
  if (!template) {
    return {
      hasTemplate: false,
      total: 0,
      checked: 0,
      completed: true,
      templateName: ""
    };
  }
  const itemIds = template.items.map((item) => item.id);
  const checkedSet = new Set(normalizeSubmissionCheckedItemIds(target.submissionCheckedItemIds));
  const checked = itemIds.filter((id) => checkedSet.has(id)).length;
  const completed = itemIds.length > 0 && checked === itemIds.length;
  return {
    hasTemplate: true,
    total: itemIds.length,
    checked,
    completed,
    templateName: template.name
  };
}

function getSubmissionChecklistRemainingEntries() {
  const entries = [];
  const executionDateKey = getCurrentHomeDateKey();

  getTasksForDate(executionDateKey).forEach((task) => {
    if (!task || task.status !== "done") return;
    const template = findSubmissionTemplate(task.submissionTemplateId);
    if (!template || template.items.length === 0) return;
    const checkedSet = new Set(normalizeSubmissionCheckedItemIds(task.submissionCheckedItemIds));
    const remainingItems = template.items.filter((item) => !checkedSet.has(item.id));
    if (remainingItems.length === 0) return;
    entries.push({
      targetType: "task",
      targetId: task.id,
      title: `${template.name}　${task.name}`,
      remainingLabels: remainingItems.map((item) => item.label)
    });
  });

  state.homeworkTasks.forEach((item) => {
    if (!item) return;
    const template = findSubmissionTemplate(item.submissionTemplateId);
    if (!template || template.items.length === 0) return;

    const standardFlow = buildHomeworkStandardFlowState(item, executionDateKey);
    if (standardFlow && !item.done) {
      const remainingLabels = standardFlow.rows
        .filter((row) => !row.confirmed)
        .map((row) => row.label);
      if (remainingLabels.length > 0) {
        entries.push({
          targetType: "homework",
          targetId: item.id,
          title: `${template.name}　${item.name}`,
          remainingLabels
        });
      }
      return;
    }

    if (!item.done) return;
    const checkedSet = new Set(normalizeSubmissionCheckedItemIds(item.submissionCheckedItemIds));
    const remainingItems = template.items.filter((templateItem) => !checkedSet.has(templateItem.id));
    if (remainingItems.length === 0) return;
    entries.push({
      targetType: "homework",
      targetId: item.id,
      title: `${template.name}　${item.name}`,
      remainingLabels: remainingItems.map((templateItem) => templateItem.label)
    });
  });

  return entries;
}

function renderExecutionSubmissionChecklistSection() {
  const entries = getSubmissionChecklistRemainingEntries();
  if (entries.length === 0) return "";

  const rows = entries.map((entry) => `
    <div class="task-card">
      <p>${escapeHtml(entry.title)}</p>
      <ul class="confirm-list">${entry.remainingLabels.map((label) => `<li>□ ${escapeHtml(label)}</li>`).join("")}</ul>
      <div class="btn-row compact-stack">
        <button type="button" class="btn-sub" data-open-submission-checklist="1" data-submission-target-type="${escapeHtml(entry.targetType)}" data-submission-target-id="${escapeHtml(entry.targetId)}">確認を続ける</button>
      </div>
    </div>
  `).join("");

  return `
    <hr class="sep" />
    <h3>未完了の確認</h3>
    ${rows}
  `;
}

function getSubmissionChecklistTargetEntity(targetType, targetId) {
  if (targetType === "task") {
    return state.tasks.find((task) => task.id === targetId) || null;
  }
  if (targetType === "homework") {
    return state.homeworkTasks.find((item) => item.id === targetId) || null;
  }
  return null;
}

function openSubmissionChecklistTarget(targetType, targetId, returnPhase = state.phase) {
  const target = getSubmissionChecklistTargetEntity(targetType, targetId);
  if (!target) return false;
  const template = findSubmissionTemplate(target.submissionTemplateId);
  if (!template || template.items.length === 0) return false;
  state.submissionChecklistTarget = {
    targetType,
    targetId,
    returnPhase
  };
  saveState();
  render();
  return true;
}

function closeSubmissionChecklistTarget() {
  state.submissionChecklistTarget = null;
  saveState();
  render();
}

function renderSubmissionChecklistOverlay() {
  removeSubmissionChecklistOverlay();
  const context = normalizeSubmissionChecklistTarget(state.submissionChecklistTarget);
  if (!context) return;
  const target = getSubmissionChecklistTargetEntity(context.targetType, context.targetId);
  if (!target) {
    state.submissionChecklistTarget = null;
    saveState();
    return;
  }
  const template = findSubmissionTemplate(target.submissionTemplateId);
  if (!template || template.items.length === 0) {
    state.submissionChecklistTarget = null;
    saveState();
    return;
  }

  const checkedSet = new Set(normalizeSubmissionCheckedItemIds(target.submissionCheckedItemIds));
  const standardHomeworkFlow = context.targetType === "homework"
    ? buildHomeworkStandardFlowState(target, getCurrentHomeDateKey())
    : null;

  const renderStandardHomeworkFlowRow = (row, actionableId) => {
    if (row.confirmed) {
      return `<div class="option-item" aria-disabled="true"><span>✓ ${escapeHtml(row.label)}</span><span>　操作不可</span></div>`;
    }
    if (row.kind === "auto") {
      return `<div class="option-item" aria-disabled="true"><span>○ ${escapeHtml(row.label)}</span><span>　自動判定</span></div>`;
    }
    if (row.itemId && row.itemId === actionableId) {
      return `<button type="button" class="btn-quiet" data-submission-manual-item-id="${escapeHtml(row.itemId)}">□ ${escapeHtml(row.label)}　操作可</button>`;
    }
    return `<div class="option-item" aria-disabled="true"><span>○ ${escapeHtml(row.label)}</span><span>　操作不可</span></div>`;
  };

  const actionableManualId = standardHomeworkFlow?.nextActionableManualRow?.itemId || "";
  const itemsHtml = standardHomeworkFlow
    ? standardHomeworkFlow.rows.map((row, index) => {
      const rowHtml = renderStandardHomeworkFlowRow(row, actionableManualId);
      if (index >= standardHomeworkFlow.rows.length - 1) return `<div class="submission-flow-step">${rowHtml}</div>`;
      return `<div class="submission-flow-step">${rowHtml}</div><div class="submission-flow-arrow" aria-hidden="true">↓</div>`;
    }).join("")
    : template.items.map((item) => {
      const checked = checkedSet.has(item.id) ? "checked" : "";
      return `<label class="option-item"><input type="checkbox" data-submission-item-id="${escapeHtml(item.id)}" ${checked} /><span>${escapeHtml(item.label)}</span></label>`;
    }).join("");
  const allDone = standardHomeworkFlow
    ? standardHomeworkFlow.complete
    : (template.items.length > 0 && template.items.every((item) => checkedSet.has(item.id)));
  const statusDoneCount = standardHomeworkFlow
    ? standardHomeworkFlow.rows.filter((row) => row.confirmed).length
    : checkedSet.size;
  const statusTotalCount = standardHomeworkFlow ? standardHomeworkFlow.rows.length : template.items.length;

  const overlay = document.createElement("div");
  overlay.id = "submissionChecklistOverlay";
  overlay.className = "app-modal-overlay";
  const checklistItemsClassName = standardHomeworkFlow
    ? "option-group submission-flow-list"
    : "option-group compact-options";
  overlay.innerHTML = `
    <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="submissionChecklistTitle">
      <h3 id="submissionChecklistTitle">${escapeHtml(template.name)}　${escapeHtml(target.name)}</h3>
      <div class="${checklistItemsClassName}" id="submissionChecklistItems">${itemsHtml}</div>
      <div class="btn-row split compact-stack app-modal-actions">
        <button id="closeSubmissionChecklistBtn" class="btn-quiet" type="button">後で</button>
        <button id="completeSubmissionChecklistBtn" class="btn-main" type="button" ${allDone ? "" : "disabled"}>完了</button>
      </div>
      <p class="helper" id="submissionChecklistStatus">${allDone ? "すべて確認済みです。" : `確認済み ${statusDoneCount}/${statusTotalCount}`}</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const refreshChecklistStatus = () => {
    const checkedIds = Array.from(overlay.querySelectorAll("input[data-submission-item-id]:checked"))
      .map((el) => String(el.getAttribute("data-submission-item-id") || ""))
      .filter(Boolean);
    target.submissionCheckedItemIds = checkedIds;
    if (context.targetType === "homework") {
      updateHomeworkCompletionByStandardFlow(target, getCurrentHomeDateKey());
    }
    target.submissionChecklistCompleted = target.submissionChecklistCompleted
      || (checkedIds.length >= template.items.length && template.items.length > 0);
    const statusEl = document.getElementById("submissionChecklistStatus");
    const completeBtn = document.getElementById("completeSubmissionChecklistBtn");
    if (completeBtn) completeBtn.disabled = !target.submissionChecklistCompleted;
    if (statusEl) statusEl.textContent = target.submissionChecklistCompleted
      ? "すべて確認済みです。"
      : `確認済み ${checkedIds.length}/${template.items.length}`;
    saveState();
  };

  const confirmAndSaveManualStep = (itemId) => {
    const currentIds = normalizeSubmissionCheckedItemIds(target.submissionCheckedItemIds);
    if (currentIds.includes(itemId)) return;
    const flow = buildHomeworkStandardFlowState(target, getCurrentHomeDateKey());
    if (!flow || !flow.nextActionableManualRow || flow.nextActionableManualRow.itemId !== itemId) return;
    const label = flow.nextActionableManualRow.label;
    if (!window.confirm(`「${label}」を完了にしますか？`)) return;
    currentIds.push(itemId);
    target.submissionCheckedItemIds = currentIds;
    updateHomeworkCompletionByStandardFlow(target, getCurrentHomeDateKey());
    saveState();
    renderSubmissionChecklistOverlay();
  };

  overlay.querySelectorAll("input[data-submission-item-id]").forEach((cb) => {
    cb.addEventListener("change", refreshChecklistStatus);
  });

  overlay.querySelectorAll("button[data-submission-manual-item-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const itemId = String(btn.getAttribute("data-submission-manual-item-id") || "");
      if (!itemId) return;
      confirmAndSaveManualStep(itemId);
    });
  });

  document.getElementById("closeSubmissionChecklistBtn")?.addEventListener("click", () => {
    saveState();
    closeSubmissionChecklistTarget();
  });

  document.getElementById("completeSubmissionChecklistBtn")?.addEventListener("click", () => {
    target.submissionChecklistCompleted = true;
    saveState();
    closeSubmissionChecklistTarget();
  });
}

function removeSubmissionChecklistOverlay() {
  document.getElementById("submissionChecklistOverlay")?.remove();
}

function renderSubmissionTemplateListScreen() {
  renderScreen(`
    <h2>提出・確認テンプレート</h2>
    <ul id="submissionTemplateList" class="task-list recurring-list"></ul>
    <div class="task-form-box">
      <div class="form-stack">
        <div>
          <label for="submissionTemplateNameInput">テンプレート名</label>
          <input id="submissionTemplateNameInput" type="text" maxlength="40" placeholder="例: 山田先生" />
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="addSubmissionTemplateBtn" class="btn-main" type="button">＋ テンプレートを追加</button>
      </div>
    </div>
    <div class="btn-row compact-stack">
      <button id="backToSettingsFromSubmissionTemplateListBtn" class="btn-quiet" type="button">戻る</button>
    </div>
  `);

  const list = document.getElementById("submissionTemplateList");
  list.innerHTML = "";
  state.submissionTemplates.forEach((template) => {
    const li = document.createElement("li");
    li.className = "task-card recurring-list-row";
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.dataset.id = template.id;
    li.innerHTML = `
      <div class="recurring-list-main">${escapeHtml(template.name)}</div>
      <div class="recurring-list-days">項目 ${template.items.length}件</div>
      <div class="recurring-list-minutes"></div>
      <div class="recurring-list-arrow" aria-hidden="true">＞</div>
    `;
    li.addEventListener("click", () => {
      state.submissionTemplateEditorForm = {
        templateId: template.id,
        itemInput: ""
      };
      saveState();
      changePhase("submissionTemplateEdit");
    });
    li.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      li.click();
    });
    list.appendChild(li);
  });

  document.getElementById("addSubmissionTemplateBtn")?.addEventListener("click", () => {
    const nameInput = document.getElementById("submissionTemplateNameInput");
    const name = String(nameInput?.value || "").trim();
    if (!name) {
      alert("テンプレート名を入力してください。");
      return;
    }
    const duplicated = state.submissionTemplates.some((template) => String(template?.name || "").trim() === name);
    if (duplicated) {
      alert("同じ名前のテンプレートが既にあります。");
      return;
    }
    const template = createSubmissionTemplateFromName(name);
    if (!template) return;
    state.submissionTemplates.push(template);
    if (nameInput) nameInput.value = "";
    saveState();
    renderSubmissionTemplateListScreen();
  });

  document.getElementById("backToSettingsFromSubmissionTemplateListBtn")?.addEventListener("click", () => changePhase("settings"));
}

function renderSubmissionTemplateEditScreen() {
  const template = findSubmissionTemplate(state.submissionTemplateEditorForm.templateId);
  if (!template) {
    changePhase("submissionTemplateList", false);
    return;
  }

  const itemRows = template.items.length === 0
    ? "<li class=\"task-card compact-empty\"><p>確認項目はまだありません。</p></li>"
    : template.items.map((item, index) => `
      <li class="task-card compact-task-row">
        <div class="task-inline-text">
          <input type="text" value="${escapeHtml(item.label)}" data-submission-template-item-label="${escapeHtml(item.id)}" maxlength="80" />
        </div>
        <div class="task-inline-actions">
          <button type="button" class="btn-mini btn-quiet" data-submission-template-item-action="up" data-submission-template-item-id="${escapeHtml(item.id)}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn-mini btn-quiet" data-submission-template-item-action="down" data-submission-template-item-id="${escapeHtml(item.id)}" ${index === template.items.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn-mini btn-danger" data-submission-template-item-action="delete" data-submission-template-item-id="${escapeHtml(item.id)}">削除</button>
        </div>
      </li>
    `).join("");

  renderScreen(`
    <h2>提出・確認テンプレート編集</h2>
    <div class="task-form-box">
      <div class="form-stack">
        <div>
          <label for="submissionTemplateNameEditInput">テンプレート名</label>
          <input id="submissionTemplateNameEditInput" type="text" value="${escapeHtml(template.name)}" maxlength="40" placeholder="例: 山田先生" />
        </div>
      </div>
    </div>
    <ul id="submissionTemplateItemList" class="task-list compact-task-list">${itemRows}</ul>
    <div class="task-form-box">
      <div class="form-stack">
        <div>
          <label for="submissionTemplateItemInput">項目を追加</label>
          <input id="submissionTemplateItemInput" type="text" value="${escapeHtml(state.submissionTemplateEditorForm.itemInput)}" maxlength="80" placeholder="例: 写真を提出した" />
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="addSubmissionTemplateItemBtn" class="btn-sub" type="button">追加</button>
      </div>
    </div>
    <div class="btn-row compact-stack">
      <button id="backToSubmissionTemplateListBtn" class="btn-quiet" type="button">戻る</button>
    </div>
  `);

  document.getElementById("submissionTemplateNameEditInput")?.addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    template.name = String(e.target.value || "");
    saveState();
  });
  document.getElementById("submissionTemplateNameEditInput")?.addEventListener("blur", (e) => {
    const nextName = String(e.target.value || "").trim();
    if (!nextName) {
      e.target.value = template.name;
      return;
    }
    const duplicated = state.submissionTemplates.some((item) => item.id !== template.id && String(item?.name || "").trim() === nextName);
    if (duplicated) {
      alert("同じ名前のテンプレートが既にあります。");
      e.target.value = template.name;
      return;
    }
    template.name = nextName;
    saveState();
    renderSubmissionTemplateEditScreen();
  });

  document.getElementById("submissionTemplateItemInput")?.addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.submissionTemplateEditorForm.itemInput = e.target.value;
    saveState();
  });

  document.querySelectorAll("input[data-submission-template-item-label]").forEach((input) => {
    input.addEventListener("input", (e) => {
      if (shouldSkipInputWhileComposing(e)) return;
      const id = String(e.target.getAttribute("data-submission-template-item-label") || "");
      const item = template.items.find((x) => x.id === id);
      if (!item) return;
      item.label = e.target.value;
      saveState();
    });
    input.addEventListener("blur", (e) => {
      const id = String(e.target.getAttribute("data-submission-template-item-label") || "");
      const item = template.items.find((x) => x.id === id);
      if (!item) return;
      item.label = String(item.label || "").trim();
      if (!item.label) item.label = "(未入力)";
      saveState();
      renderSubmissionTemplateEditScreen();
    });
  });

  document.querySelectorAll("button[data-submission-template-item-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = String(btn.dataset.submissionTemplateItemAction || "");
      const id = String(btn.dataset.submissionTemplateItemId || "");
      const idx = template.items.findIndex((item) => item.id === id);
      if (idx === -1) return;
      if (action === "delete") {
        template.items.splice(idx, 1);
      } else if (action === "up" && idx > 0) {
        const tmp = template.items[idx - 1];
        template.items[idx - 1] = template.items[idx];
        template.items[idx] = tmp;
      } else if (action === "down" && idx < template.items.length - 1) {
        const tmp = template.items[idx + 1];
        template.items[idx + 1] = template.items[idx];
        template.items[idx] = tmp;
      }
      saveState();
      renderSubmissionTemplateEditScreen();
    });
  });

  document.getElementById("addSubmissionTemplateItemBtn")?.addEventListener("click", () => {
    const label = String(state.submissionTemplateEditorForm.itemInput || "").trim();
    if (!label) return;
    template.items.push({ id: crypto.randomUUID(), label });
    state.submissionTemplateEditorForm.itemInput = "";
    saveState();
    renderSubmissionTemplateEditScreen();
  });

  document.getElementById("backToSubmissionTemplateListBtn")?.addEventListener("click", () => changePhase("submissionTemplateList"));
}

function renderHomeworkListScreen() {
  renderScreen(`
    <h2>宿題・課題一覧</h2>
    <ul id="homeworkList" class="task-list recurring-list"></ul>
    <div class="btn-row compact-stack">
      <button id="addHomeworkBtn" class="btn-main" type="button">＋ 宿題・課題を追加</button>
      <button id="backToHomeFromHomeworkBtn" class="btn-quiet" type="button">戻る</button>
    </div>
  `);

  renderHomeworkListRows();
  bindHomeworkListEvents();
}

function renderHomeworkListRows() {
  const list = document.getElementById("homeworkList");
  if (!list) return;
  list.innerHTML = "";

  const pending = getSortedPendingHomeworkTasks();
  if (pending.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-card compact-empty";
    empty.innerHTML = "<p>未完了の宿題・課題はありません。</p>";
    list.appendChild(empty);
    return;
  }

  pending.forEach((item) => {
    const li = document.createElement("li");
    li.className = "task-card recurring-list-row";
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.dataset.id = item.id;
    const deadlineInfo = getHomeworkDeadlineDisplayParts(item.deadlineDate);
    li.innerHTML = `
      <div class="recurring-list-main">${escapeHtml(item.name)}</div>
      <div class="recurring-list-days"><span>${escapeHtml(deadlineInfo.deadlineLabel)}</span>${deadlineInfo.remainingLabel ? `<span class="homework-remaining-label">${escapeHtml(deadlineInfo.remainingLabel)}</span>` : ""}</div>
      <div class="recurring-list-minutes"></div>
      <div class="recurring-list-arrow" aria-hidden="true">＞</div>
    `;
    li.addEventListener("click", () => {
      loadHomeworkIntoForm(item.id);
      changePhase("homeworkEdit");
    });
    li.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      li.click();
    });
    list.appendChild(li);
  });
}

function bindHomeworkListEvents() {
  document.getElementById("addHomeworkBtn").addEventListener("click", () => {
    state.homeworkForm = createHomeworkForm();
    saveState();
    changePhase("homeworkWorkType");
  });
  document.getElementById("backToHomeFromHomeworkBtn").addEventListener("click", goHome);
}

function renderHomeworkWorkTypeEntryScreen() {
  renderScreen(`
    <h2>宿題・課題を追加</h2>
    <div class="task-card">
      <p>この宿題・課題には、自宅で行う作業がありますか？</p>
      <div class="btn-row compact-stack">
        <button id="chooseHomeworkWithWorkBtn" class="btn-main" type="button">作業あり</button>
        <button id="chooseHomeworkNoWorkBtn" class="btn-sub" type="button">作業なし</button>
      </div>
    </div>
    <div class="btn-row compact-stack">
      <button id="backToHomeworkListFromTypeBtn" class="btn-quiet" type="button">戻る</button>
    </div>
  `);

  document.getElementById("chooseHomeworkWithWorkBtn")?.addEventListener("click", () => {
    state.homeworkForm = {
      ...createHomeworkForm(),
      homeworkWorkType: HOMEWORK_WORK_TYPE_WITH_WORK,
      submissionTemplateId: STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID
    };
    saveState();
    changePhase("homeworkEdit");
  });

  document.getElementById("chooseHomeworkNoWorkBtn")?.addEventListener("click", () => {
    state.homeworkForm = {
      ...createHomeworkForm(),
      homeworkWorkType: HOMEWORK_WORK_TYPE_NO_WORK,
      submissionTemplateId: NO_HOMEWORK_SUBMISSION_TEMPLATE_ID
    };
    saveState();
    changePhase("homeworkEdit");
  });

  document.getElementById("backToHomeworkListFromTypeBtn")?.addEventListener("click", () => {
    changePhase("homeworkList");
  });
}

function renderHomeworkEditScreen() {
  const editing = state.homeworkForm.mode === "edit";
  const isNoWorkType = normalizeHomeworkWorkType(state.homeworkForm.homeworkWorkType) === HOMEWORK_WORK_TYPE_NO_WORK;
  const expectedSubmissionTemplateId = isNoWorkType
    ? NO_HOMEWORK_SUBMISSION_TEMPLATE_ID
    : STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID;
  if (state.homeworkForm.submissionTemplateId !== expectedSubmissionTemplateId) {
    state.homeworkForm.submissionTemplateId = expectedSubmissionTemplateId;
    saveState();
  }
  const selectedHomeworkTemplate = findSubmissionTemplate(state.homeworkForm.submissionTemplateId);
  const canOpenHomeworkChecklist = editing && selectedHomeworkTemplate && selectedHomeworkTemplate.items.length > 0;
  const editingHomeworkItem = editing ? state.homeworkTasks.find((x) => x.id === state.homeworkForm.targetId) : null;
  const checklistSummary = editingHomeworkItem ? getSubmissionChecklistSummary(editingHomeworkItem) : null;
  renderScreen(`
    <h2>${editing ? "宿題・課題を編集" : "宿題・課題を追加"}</h2>
    <div class="task-form-box">
      <div class="form-stack">
        <div><label for="homeworkName">課題名</label><input id="homeworkName" type="text" value="${escapeHtml(state.homeworkForm.name)}" maxlength="60" placeholder="例: 理科レポート" /></div>
        <div><label for="homeworkDeadline">締切</label><input id="homeworkDeadline" type="date" value="${escapeHtml(state.homeworkForm.deadlineDate)}" /></div>
        <div>
          <label for="homeworkContent">内容</label>
          <input id="homeworkContent" type="text" value="${escapeHtml(state.homeworkForm.content)}" maxlength="160" placeholder="何をどうするか分かるように書こう" />
          <p class="helper">あとで見返したときに<br />「何を」「どうする」が分かるように書こう</p>
          <p class="helper">例）<br />・健康診断書類を先生へ提出する<br />・理科レポートの提出期限を先生に聞く<br />・保護者印をもらう<br />・上履きを学校へ持って行く<br />・図工の材料を持って行く<br />・委員会アンケートを提出する</p>
        </div>
        <div><label>提出・確認テンプレート</label><p class="helper">${isNoWorkType ? "書類提出・質問・確認（自宅での作業なし）" : "通常の提出"}</p></div>
        <div>
          <label>Googleカレンダー同期</label>
          <div class="option-group compact-options">
            <label class="option-item"><input type="radio" name="homeworkGoogleSync" value="on" ${state.homeworkForm.googleSync ? "checked" : ""} /><span>ON</span></label>
            <label class="option-item"><input type="radio" name="homeworkGoogleSync" value="off" ${!state.homeworkForm.googleSync ? "checked" : ""} /><span>OFF</span></label>
          </div>
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="saveHomeworkBtn" class="btn-main" type="button" ${getSaveActionDisabledAttr()}>${getSaveActionLabel("homework-save", "保存")}</button>
        ${editing ? `<button id="deleteHomeworkBtn" class="btn-danger" type="button" ${getBusyDisabledAttr()}>削除</button>` : ""}
        ${canOpenHomeworkChecklist ? `<button id="openHomeworkSubmissionChecklistBtn" class="btn-quiet" type="button" ${getBusyDisabledAttr()}>提出・確認を開く</button>` : ""}
      </div>
      ${checklistSummary?.hasTemplate ? `<p class="helper">提出・確認: ${checklistSummary.checked}/${checklistSummary.total}${checklistSummary.completed ? "（完了）" : "（未完了）"}</p>` : ""}
    </div>
    <div class="btn-row compact-stack">
      <button id="backToHomeworkListBtn" class="btn-quiet" type="button" ${getBusyDisabledAttr()}>戻る</button>
    </div>
  `);

  bindHomeworkEditEvents();
}

function bindHomeworkEditEvents() {
  document.getElementById("homeworkName").addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.homeworkForm.name = e.target.value;
    saveState();
  });
  document.getElementById("homeworkDeadline").addEventListener("change", (e) => {
    state.homeworkForm.deadlineDate = normalizeDeadlineDate(e.target.value);
    saveState();
  });
  document.getElementById("homeworkContent").addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.homeworkForm.content = e.target.value;
    saveState();
  });
  document.querySelectorAll("input[name='homeworkGoogleSync']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.homeworkForm.googleSync = e.target.value === "on";
      saveState();
    });
  });
  bindProtectedActionButton("saveHomeworkBtn", saveHomeworkItem);
  document.getElementById("deleteHomeworkBtn")?.addEventListener("click", deleteHomeworkItemFromEdit);
  document.getElementById("openHomeworkSubmissionChecklistBtn")?.addEventListener("click", () => {
    if (!state.homeworkForm.targetId) return;
    openSubmissionChecklistTarget("homework", state.homeworkForm.targetId, "homeworkEdit");
  });
  document.getElementById("backToHomeworkListBtn").addEventListener("click", () => changePhase("homeworkList"));
}

function loadHomeworkIntoForm(id) {
  const item = state.homeworkTasks.find((x) => x.id === id);
  if (!item) return;
  state.homeworkForm = {
    mode: "edit",
    targetId: item.id,
    name: item.name,
    deadlineDate: item.deadlineDate,
    content: item.content,
    homeworkWorkType: normalizeHomeworkWorkType(item.homeworkWorkType),
    googleSync: Boolean(item.googleSync),
    done: Boolean(item.done),
    submissionTemplateId: normalizeSubmissionTemplateId(item.submissionTemplateId)
  };
  saveState();
}

function deleteHomeworkItemFromEdit() {
  const id = state.homeworkForm.targetId;
  const item = state.homeworkTasks.find((x) => x.id === id);
  if (!id || !item) return;
  if (!window.confirm(`「${item.name}」を削除しますか？`)) return;
  state.homeworkTasks = state.homeworkTasks.filter((x) => x.id !== id);
  state.homeworkForm = createHomeworkForm();
  saveState();
  changePhase("homeworkList");
}

async function saveHomeworkItem() {
  syncHomeworkFormFromDom();
  if (!(await confirmContentAssistIfNeeded(state.homeworkForm.content, state.homeworkForm.name))) {
    deferredUiBlockUntil = 0;
    flushDeferredUiUpdates();
    return;
  }

  await runProtectedSaveAction({
    key: "homework-save",
    syncFromDom: syncHomeworkFormFromDom,
    validate: () => {
      const name = state.homeworkForm.name.trim();
      const deadlineDate = normalizeDeadlineDate(state.homeworkForm.deadlineDate);
      if (!name) return "課題名を入力してください。";
      if (!deadlineDate) return "締切を入力してください。";
      if (state.homeworkForm.mode === "edit" && !state.homeworkTasks.find((x) => x.id === state.homeworkForm.targetId)) {
        return "保存対象の課題が見つかりません。";
      }
      return null;
    },
    captureState: () => structuredClone({
      homeworkTasks: state.homeworkTasks,
      homeworkForm: state.homeworkForm
    }),
    restoreState: (snapshot) => {
      if (!snapshot) return;
      state.homeworkTasks = snapshot.homeworkTasks;
      state.homeworkForm = normalizeHomeworkForm(snapshot.homeworkForm);
    },
    apply: () => {
      const name = state.homeworkForm.name.trim();
      const deadlineDate = normalizeDeadlineDate(state.homeworkForm.deadlineDate);
      const content = state.homeworkForm.content.trim();
      const homeworkWorkType = normalizeHomeworkWorkType(state.homeworkForm.homeworkWorkType);
      const googleSync = Boolean(state.homeworkForm.googleSync);
      const done = Boolean(state.homeworkForm.done);
      const submissionTemplateId = homeworkWorkType === HOMEWORK_WORK_TYPE_NO_WORK
        ? NO_HOMEWORK_SUBMISSION_TEMPLATE_ID
        : STANDARD_HOMEWORK_SUBMISSION_TEMPLATE_ID;

      if (state.homeworkForm.mode === "edit") {
        const item = state.homeworkTasks.find((x) => x.id === state.homeworkForm.targetId);
        if (!item) throw new Error("missing-homework-item");
        const templateChanged = item.submissionTemplateId !== submissionTemplateId;
        item.name = name;
        item.deadlineDate = deadlineDate;
        item.content = content;
        item.homeworkWorkType = homeworkWorkType;
        item.googleSync = googleSync;
        item.done = done;
        item.submissionTemplateId = submissionTemplateId;
        if (templateChanged) {
          item.submissionCheckedItemIds = [];
          item.submissionChecklistCompleted = false;
        }
        return;
      }

      const newItem = {
        id: crypto.randomUUID(),
        name,
        deadlineDate,
        content,
        homeworkWorkType,
        googleSync,
        done,
        submissionTemplateId,
        submissionCheckedItemIds: [],
        submissionChecklistCompleted: false,
        actionNoSuppressedDateKey: "",
        actionHistory: []
      };
      state.homeworkTasks.push(newItem);

      const template = findSubmissionTemplate(newItem.submissionTemplateId);
      if (!newItem.done && template && template.items.length > 0) {
        state.submissionChecklistTarget = {
          targetType: "homework",
          targetId: newItem.id,
          returnPhase: "homeworkList"
        };
      }
    },
    onSuccess: () => {
      state.homeworkForm = createHomeworkForm();
      saveState();
      changePhase("homeworkList");
    },
    successMessage: "保存しました"
  });
}

function getHomeStatusIcon(task) {
  if (task.status === "done") return "【完了】";
  if (state.running.taskId === task.id && state.running.isPaused) return "【再開】";
  if (state.running.taskId === task.id && !state.running.isPaused) return "▶";
  return "○";
}

function getHomeTaskPriority(task, runningTaskId = state.running.taskId) {
  if (!task) return 1;
  if (runningTaskId && runningTaskId === task.id) return 0;
  return 1;
}

function getHomeTaskDisplayTasks(tasks = state.tasks, runningTaskId = state.running.taskId) {
  const tasksWithIndex = (Array.isArray(tasks) ? tasks : []).map((task, index) => ({ task, index }));
  return tasksWithIndex
    .sort((a, b) => {
      const priorityDiff = getHomeTaskPriority(a.task, runningTaskId) - getHomeTaskPriority(b.task, runningTaskId);
      if (priorityDiff !== 0) return priorityDiff;
      return a.index - b.index;
    })
    .map((item) => item.task);
}

function addDaysToDateKey(dateKey, days) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + Number(days || 0));
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function formatHomeDateHeading(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return getTodayDisplayJst();
  const weekdayKey = getWeekdayKeyByDateKey(dateKey);
  const weekdayLabel = RECURRING_DAY_LABELS[weekdayKey] || "";
  return `${Number(m[2])}月${Number(m[3])}日(${weekdayLabel})`;
}

function normalizePreviousDayArchive(rawArchive) {
  if (!rawArchive || typeof rawArchive !== "object") return null;
  const dateKey = String(rawArchive.dateKey || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return {
    dateKey,
    planTimes: {
      ...createDefaultPlanTimes(),
      ...(rawArchive.planTimes || {})
    },
    tasks: Array.isArray(rawArchive.tasks) ? rawArchive.tasks.map((task) => normalizeTask(task, dateKey)) : [],
    belongingsItems: Array.isArray(rawArchive.belongingsItems)
      ? rawArchive.belongingsItems.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    totalPlanned: Number(rawArchive.totalPlanned) || 0,
    totalActual: Number(rawArchive.totalActual) || 0
  };
}

function createPreviousDayArchive(dateKey) {
  const belongingsSummary = getBelongingsSummaryForDate(dateKey);
  const tasks = getTasksForDate(dateKey);
  return {
    dateKey,
    planTimes: { ...state.planTimes },
    tasks: tasks.map((task) => ({ ...task })),
    belongingsItems: [...belongingsSummary.mergedItems],
    totalPlanned: sumPlanned(tasks),
    totalActual: sumActualMinutes(tasks)
  };
}

function getTaskTargetDateKey(task, fallbackDateKey = state.dateKey) {
  if (!task) return "";
  return normalizeTaskDateKey(task.targetDateKey)
    || normalizeTaskDateKey(task.recurringDateKey)
    || normalizeTaskDateKey(fallbackDateKey);
}

function isTaskForDate(task, dateKey, fallbackDateKey = state.dateKey) {
  return getTaskTargetDateKey(task, fallbackDateKey) === normalizeTaskDateKey(dateKey);
}

function getTasksForDate(dateKey, tasks = state.tasks, fallbackDateKey = state.dateKey) {
  const normalizedDateKey = normalizeTaskDateKey(dateKey);
  if (!normalizedDateKey) return [];
  return (Array.isArray(tasks) ? tasks : []).filter((task) => isTaskForDate(task, normalizedDateKey, fallbackDateKey));
}

function getCurrentHomeDateKey() {
  return state.dayClosed ? addDaysToDateKey(state.dateKey, 1) : state.dateKey;
}

function getDisplayedHomeDateKey() {
  const archive = normalizePreviousDayArchive(state.previousDayArchive);
  if (state.homeViewMode === "previous" && archive) {
    return normalizeTaskDateKey(archive.dateKey);
  }
  return normalizeTaskDateKey(getCurrentHomeDateKey());
}

function isTodayTaskFlowClosed(displayDateKey) {
  const normalizedDisplayDateKey = normalizeTaskDateKey(displayDateKey);
  const todayKey = getTodayKeyJst();
  if (!normalizedDisplayDateKey || normalizedDisplayDateKey !== todayKey) return false;
  if (state.dayClosed) return true;
  const tasks = getTasksForDate(todayKey);
  if (tasks.length === 0) return false;
  return tasks.every((task) => task.status === "done");
}

function getHomeActionAvailability() {
  const displayDateKey = getDisplayedHomeDateKey();
  const todayKey = getTodayKeyJst();
  const displayDayNumber = getDateKeyDayNumber(displayDateKey);
  const todayDayNumber = getDateKeyDayNumber(todayKey);
  const isPreviousView = state.homeViewMode === "previous";
  const isTodayView = displayDateKey === todayKey;
  const isFutureView = Number.isFinite(displayDayNumber)
    && Number.isFinite(todayDayNumber)
    && displayDayNumber > todayDayNumber;
  const isPastView = Number.isFinite(displayDayNumber)
    && Number.isFinite(todayDayNumber)
    && displayDayNumber < todayDayNumber;
  const todayTaskFlowClosed = isTodayTaskFlowClosed(displayDateKey);

  if (isPreviousView || isPastView) {
    return {
      displayDateKey,
      canOpenExecution: false,
      canOpenHomework: false,
      canOpenCompletionHistory: true
    };
  }

  if (isFutureView) {
    return {
      displayDateKey,
      canOpenExecution: false,
      canOpenHomework: true,
      canOpenCompletionHistory: false
    };
  }

  if (isTodayView) {
    return {
      displayDateKey,
      canOpenExecution: !todayTaskFlowClosed,
      canOpenHomework: !todayTaskFlowClosed,
      canOpenCompletionHistory: true
    };
  }

  return {
    displayDateKey,
    canOpenExecution: false,
    canOpenHomework: false,
    canOpenCompletionHistory: false
  };
}

function getCompletionHistoryTargetDateKey() {
  const availability = getHomeActionAvailability();
  return normalizeTaskDateKey(availability.displayDateKey) || normalizeTaskDateKey(state.dateKey) || getTodayKeyJst();
}

function getPlanningVisibleTasks() {
  return getTasksForDate(getPlanningTargetDateKey());
}

function getExecutionVisibleTasks() {
  return getTasksForDate(getCurrentHomeDateKey());
}

function canExecuteTasksForDate(dateKey) {
  const normalizedDateKey = normalizeTaskDateKey(dateKey);
  if (!normalizedDateKey) return false;
  return normalizedDateKey === getTodayKeyJst();
}

function canExecuteCurrentHomeTasks() {
  return getHomeActionAvailability().canOpenExecution;
}

function getHomeDisplayContext() {
  const archive = normalizePreviousDayArchive(state.previousDayArchive);
  const showPrevious = state.homeViewMode === "previous" && Boolean(archive);
  if (showPrevious && archive) {
    return {
      isPreviousView: true,
      dateKey: archive.dateKey,
      tasks: archive.tasks,
      planTimes: archive.planTimes,
      belongingsItems: archive.belongingsItems,
      runningTaskId: null
    };
  }
  const displayDateKey = getCurrentHomeDateKey();
  const belongingsSummary = getBelongingsSummaryForDate(displayDateKey);
  return {
    isPreviousView: false,
    dateKey: displayDateKey,
    tasks: getTasksForDate(displayDateKey),
    planTimes: state.planTimes,
    belongingsItems: belongingsSummary.mergedItems,
    runningTaskId: state.running.taskId
  };
}

function getHomeActualText(task) {
  const formatMinutes = (sec) => `${Math.max(1, Math.floor(sec / 60))}分`;
  if (state.running.taskId === task.id && !state.running.isPaused) {
    return formatMinutes(getRunningElapsedSeconds());
  }
  if (typeof task.actualSeconds === "number" && task.actualSeconds > 0) {
    return formatMinutes(task.actualSeconds);
  }
  return "-";
}

function renderPlanning() {
  const targetDateKey = getPlanningTargetDateKey();
  const planningDateChoices = getPlanningDateChoices();
  const planningTasks = getPlanningVisibleTasks();
  const recurringPickerHtml = planningRecurringPickerOpen
    ? renderPlanningRecurringPicker(targetDateKey)
    : "";
  const editingTask = state.planningForm.mode === "edit"
    ? planningTasks.find((task) => task.id === state.planningForm.targetId) || null
    : null;
  const minutesValue = getPlanningFormMinutes() || DEFAULT_MINUTES;
  const wakeParts = getTimeParts(state.planTimes.wakeUp, "06:30");
  const depParts = getTimeParts(state.planTimes.departure === "none" ? "07:30" : state.planTimes.departure, "07:30");
  const returnParts = getTimeParts(state.planTimes.returnHome === "none" ? "18:30" : state.planTimes.returnHome, "18:30");
  const studyParts = getTimeParts(state.planTimes.studyStart, "19:00");
  const belongingsDateKey = getPlanningTargetDateKey();
  const belongingsSummary = getBelongingsSummaryForDate(belongingsDateKey);
  const belongingsLabel = state.planFor === "tomorrow" ? "明日" : "今日";

  renderScreen(`
    <h2>予定入力</h2>
    <div class="option-group compact-options">
      <label class="option-item"><input type="radio" name="planFor" value="today" ${state.planFor === "today" ? "checked" : ""} /><span>${escapeHtml(planningDateChoices.todayLabel)}</span></label>
      <label class="option-item"><input type="radio" name="planFor" value="tomorrow" ${state.planFor === "tomorrow" ? "checked" : ""} /><span>${escapeHtml(planningDateChoices.tomorrowLabel)}</span></label>
    </div>

    <div class="time-grid">
      <div>
        <label>起床時間</label>
        <div class="time-select-row">
          <select id="wakeUpHour">${renderHourOptions(wakeParts.hour)}</select>
          <span>:</span>
          <select id="wakeUpMinute">${renderMinute5Options(wakeParts.minute)}</select>
        </div>
      </div>
      <div>
        <label>出発時間</label>
        <div class="time-select-row">
          <select id="departureMode"><option value="time" ${state.planTimes.departure !== "none" ? "selected" : ""}>時刻設定</option><option value="none" ${state.planTimes.departure === "none" ? "selected" : ""}>外出なし</option></select>
          <select id="departureHour" ${state.planTimes.departure === "none" ? "disabled" : ""}>${renderHourOptions(depParts.hour)}</select>
          <span>:</span>
          <select id="departureMinute" ${state.planTimes.departure === "none" ? "disabled" : ""}>${renderMinute5Options(depParts.minute)}</select>
        </div>
      </div>
      <div>
        <label>帰宅時間</label>
        <div class="time-select-row">
          <select id="returnHomeMode"><option value="time" ${state.planTimes.returnHome !== "none" ? "selected" : ""}>時刻設定</option><option value="none" ${state.planTimes.returnHome === "none" ? "selected" : ""}>帰宅なし</option></select>
          <select id="returnHomeHour" ${state.planTimes.returnHome === "none" ? "disabled" : ""}>${renderHourOptions(returnParts.hour)}</select>
          <span>:</span>
          <select id="returnHomeMinute" ${state.planTimes.returnHome === "none" ? "disabled" : ""}>${renderMinute5Options(returnParts.minute)}</select>
        </div>
      </div>
      <div>
        <label>勉強開始時間</label>
        <div class="time-select-row">
          <select id="studyStartHour">${renderHourOptions(studyParts.hour)}</select>
          <span>:</span>
          <select id="studyStartMinute">${renderMinute5Options(studyParts.minute)}</select>
        </div>
      </div>
    </div>

    <h3>🎒 ${belongingsLabel}の持ち物</h3>
    <div class="task-card">
      <p class="helper">【自動】</p>
      <ul class="confirm-list">${renderPlanningAutoBelongings(belongingsSummary.autoItems)}</ul>
      <p class="helper">【今日だけ追加】</p>
      <ul class="confirm-list">${renderPlanningManualBelongings(belongingsSummary.manualItems)}</ul>
      <div class="btn-row split compact-stack">
        <input id="dailyBelongingInput" type="text" value="${escapeHtml(state.planningDailyBelongingInput || "")}" maxlength="60" placeholder="例: 絵の具セット" />
        <button id="addDailyBelongingBtn" class="btn-sub" type="button" ${getSaveActionDisabledAttr()}>${getSaveActionLabel("planning-belonging-add", "追加")}</button>
      </div>
    </div>

    <h3>登録済みタスク</h3>
    <div class="btn-row compact-stack">
      <button id="addRecurringBulkBtn" class="btn-sub" type="button" ${getBusyDisabledAttr()}>定期予定を一括追加</button>
      <button id="openRecurringPickerBtn" class="btn-quiet" type="button" ${getBusyDisabledAttr()}>定期予定を個別追加</button>
    </div>
    ${recurringPickerHtml}
    <ul id="taskList" class="task-list compact-task-list"></ul>

    <div class="task-form-box">
      <p class="helper">${editingTask ? "修正内容を入力してください。" : "次の1件を入力してください。"}</p>
      <div class="form-stack">
        <div>
          <label for="taskNameInput">タスク名</label>
          <input id="taskNameInput" type="text" list="taskNameSuggestions" value="${escapeHtml(state.planningForm.taskName)}" maxlength="40" placeholder="例: 原田先生" autocomplete="off" />
          <datalist id="taskNameSuggestions">${renderTaskNameSuggestions()}</datalist>
        </div>
        <div>
          <label>予定時間（分）</label>
          <div class="btn-row" id="minutePresetRow">${renderMinutePresetButtons()}</div>
        </div>
        <div><label for="minutesInput">自分で入力（分）</label><input id="minutesInput" type="number" min="1" max="600" step="1" value="${escapeHtml(String(minutesValue))}" /></div>
        <div>
          <label for="taskContent">内容</label>
          <input id="taskContent" type="text" value="${escapeHtml(state.planningForm.content)}" maxlength="120" placeholder="あとで見返して何をやるか分かるように書こう" />
          <p class="helper">書き方のコツ</p>
          <p class="helper">・教材名<br />・ページや問題番号<br />・単元<br />・具体的にやること</p>
          <p class="helper">例）<br />・新中学問題集 p54～59<br />・学校プリント No.3<br />・英検単語 Day12<br />・数学 新A 31～40番<br />・教科書 Unit4 リスニング<br />・理科 レンズ実験レポート</p>
        </div>
      </div>
      <div class="btn-row compact-stack">
        <button id="saveTaskBtn" class="btn-sub" type="button" ${getSaveActionDisabledAttr()}>${getSaveActionLabel("planning-task-save", editingTask ? "修正を保存" : "追加")}</button>
      </div>
    </div>

    <div class="summary" id="totalPlanned"></div>
    <div class="btn-row compact-stack"><button id="goBtn" class="btn-main" type="button" ${getBusyDisabledAttr()}>最終確認へ</button></div>
  `);

  renderTaskListForPlanning(planningTasks);
  bindPlanningEvents();
}

function renderPlanningRecurringPicker(targetDateKey) {
  const existingPlanIds = new Set(
    getTasksForDate(targetDateKey)
      .map((task) => String(task?.recurringPlanId || ""))
      .filter(Boolean)
  );
  const rows = state.recurringPlans.length === 0
    ? `<p class="helper">定期予定が登録されていません。</p>`
    : state.recurringPlans.map((plan) => {
      const disabled = existingPlanIds.has(plan.id) ? "disabled" : "";
      const badge = existingPlanIds.has(plan.id) ? "<span class=\"helper\">追加済み</span>" : "";
      return `
        <label class="option-item recurring-day-item">
          <input type="checkbox" data-recurring-picker-plan-id="${escapeHtml(plan.id)}" ${disabled} />
          <span>${escapeHtml(plan.name)} ${badge}</span>
        </label>
      `;
    }).join("");

  return `
    <div class="task-card">
      <h3>定期予定を個別追加</h3>
      <div class="option-group compact-options">
        ${rows}
      </div>
      <div class="btn-row compact-stack">
        <button id="addRecurringSelectedBtn" class="btn-sub" type="button" ${getBusyDisabledAttr()}>選択した予定を追加</button>
        <button id="closeRecurringPickerBtn" class="btn-quiet" type="button" ${getBusyDisabledAttr()}>閉じる</button>
      </div>
    </div>
  `;
}

function renderTaskListForPlanning(planningTasks = getPlanningVisibleTasks()) {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  if (planningTasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-card compact-empty";
    empty.innerHTML = "<p>登録済みタスクはまだありません。</p>";
    list.appendChild(empty);
    updateTotalPlanned(planningTasks);
    return;
  }

  planningTasks.forEach((task) => {
    const done = task.status === "done";
    const li = document.createElement("li");
    li.className = `task-card compact-task-row${state.planningForm.targetId === task.id ? " editing-row" : ""}`;
    li.innerHTML = `
      <div class="task-inline-text">${escapeHtml(task.name)} <span>${task.plannedMinutes}分</span> ${done ? '<span class="status-chip">完了</span>' : ""}</div>
      <div class="task-inline-actions">
        <button type="button" class="btn-mini btn-quiet" data-action="up" data-id="${task.id}" ${getBusyDisabledAttr()}>↑</button>
        <button type="button" class="btn-mini btn-quiet" data-action="down" data-id="${task.id}" ${getBusyDisabledAttr()}>↓</button>
        <button type="button" class="btn-mini btn-sub" data-action="edit" data-id="${task.id}" ${getBusyDisabledAttr()}>修正</button>
        <button type="button" class="btn-mini btn-danger" data-action="delete" data-id="${task.id}" ${getBusyDisabledAttr()}>削除</button>
      </div>
    `;
    list.appendChild(li);
  });

  updateTotalPlanned(planningTasks);
}

function renderTaskNameSuggestions() {
  return getSortedTaskNameOptions()
    .map((opt) => `<option value="${escapeHtml(opt.name)}"></option>`)
    .join("");
}

function renderMinutePresetButtons() {
  return MINUTE_OPTIONS.map((m) => `<button type="button" class="btn-mini btn-quiet" data-minute-preset="${m}">${m}</button>`).join("");
}

function bindPlanningEvents() {
  document.querySelectorAll("input[name='planFor']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.checked) return;
      const nextPlanFor = target.value === "today" ? "today" : "tomorrow";
      if (state.planFor === nextPlanFor) return;
      state.planFor = nextPlanFor;
      state.planningForm = createPlanningForm();
      planningRecurringPickerOpen = false;
      saveState();
      renderPlanning();
    });
  });

  bindTimeSelectInput("wakeUp");
  bindTimeSelectInput("studyStart");
  bindTimeSelectInput("departure", true, "departureMode");
  bindTimeSelectInput("returnHome", true, "returnHomeMode");

  document.getElementById("taskNameInput")?.addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.planningForm.taskName = e.target.value;
    saveState();
  });
  document.getElementById("minutesInput").addEventListener("input", (e) => {
    state.planningForm.customMinutes = e.target.value;
    state.planningForm.minutesChoice = e.target.value;
    saveState();
  });
  document.querySelectorAll("button[data-minute-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const minutes = btn.dataset.minutePreset;
      if (!minutes) return;
      state.planningForm.customMinutes = minutes;
      state.planningForm.minutesChoice = minutes;
      const input = document.getElementById("minutesInput");
      if (input) input.value = minutes;
      saveState();
    });
  });
  document.getElementById("taskContent").addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.planningForm.content = e.target.value;
    saveState();
  });

  document.getElementById("dailyBelongingInput")?.addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.planningDailyBelongingInput = e.target.value;
    saveState();
  });
  bindProtectedActionButton("addDailyBelongingBtn", async () => {
    syncPlanningFormFromDom();
    const name = normalizeBelongingName(state.planningDailyBelongingInput);
    if (!name) {
      deferredUiBlockUntil = 0;
      flushDeferredUiUpdates();
      return;
    }
    await runProtectedSaveAction({
      key: "planning-belonging-add",
      syncFromDom: syncPlanningFormFromDom,
      captureState: () => structuredClone({
        dailySpecialBelongingsByDate: state.dailySpecialBelongingsByDate,
        planningDailyBelongingInput: state.planningDailyBelongingInput
      }),
      restoreState: (snapshot) => {
        if (!snapshot) return;
        state.dailySpecialBelongingsByDate = snapshot.dailySpecialBelongingsByDate;
        state.planningDailyBelongingInput = snapshot.planningDailyBelongingInput;
      },
      apply: () => {
        const nextName = normalizeBelongingName(state.planningDailyBelongingInput);
        const dateKey = getPlanningTargetDateKey();
        addDailySpecialBelonging(dateKey, nextName);
        state.planningDailyBelongingInput = "";
      },
      onSuccess: () => {
        saveState();
        renderPlanning();
      },
      successMessage: ""
    });
  });
  document.querySelectorAll("button[data-daily-belonging-name]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const encoded = String(btn.dataset.dailyBelongingName || "");
      const name = decodeURIComponent(encoded);
      const dateKey = getPlanningTargetDateKey();
      removeDailySpecialBelonging(dateKey, name);
      saveState();
      renderPlanning();
    });
  });

  bindProtectedActionButton("saveTaskBtn", savePlanningTask);

  document.getElementById("addRecurringBulkBtn")?.addEventListener("click", () => {
    const dateKey = getPlanningTargetDateKey();
    const weekdayKey = getWeekdayKeyByDateKey(dateKey);
    const applicablePlanIds = state.recurringPlans
      .filter((plan) => isRecurringPlanForWeekday(plan, weekdayKey))
      .map((plan) => plan.id);
    const result = addRecurringPlansToDate(dateKey, applicablePlanIds);
    saveState();
    setUiNotice("success", `定期予定を追加しました（追加 ${result.added}件 / 既存 ${result.skipped}件）`, { autoHideMs: 2600 });
    renderPlanning();
  });

  document.getElementById("openRecurringPickerBtn")?.addEventListener("click", () => {
    planningRecurringPickerOpen = !planningRecurringPickerOpen;
    renderPlanning();
  });

  document.getElementById("closeRecurringPickerBtn")?.addEventListener("click", () => {
    planningRecurringPickerOpen = false;
    renderPlanning();
  });

  document.getElementById("addRecurringSelectedBtn")?.addEventListener("click", () => {
    const selectedPlanIds = Array.from(document.querySelectorAll("input[data-recurring-picker-plan-id]:checked"))
      .map((input) => String(input.getAttribute("data-recurring-picker-plan-id") || ""))
      .filter(Boolean);
    if (selectedPlanIds.length === 0) {
      setUiNotice("error", "追加する定期予定を選択してください。", { autoHideMs: 2200 });
      return;
    }
    const dateKey = getPlanningTargetDateKey();
    const result = addRecurringPlansToDate(dateKey, selectedPlanIds);
    saveState();
    setUiNotice("success", `定期予定を追加しました（追加 ${result.added}件 / 既存 ${result.skipped}件）`, { autoHideMs: 2600 });
    renderPlanning();
  });

  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const task = findTask(id);
      if (!id || !action || !task) return;

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
  const planningTasks = getPlanningVisibleTasks();
  const scopedTaskIds = planningTasks.map((task) => task.id);
  const idx = scopedTaskIds.indexOf(taskId);
  if (idx === -1) return;
  const target = idx + dir;
  if (target < 0 || target >= scopedTaskIds.length) return;
  const fromGlobalIndex = state.tasks.findIndex((task) => task.id === scopedTaskIds[idx]);
  const toGlobalIndex = state.tasks.findIndex((task) => task.id === scopedTaskIds[target]);
  if (fromGlobalIndex === -1 || toGlobalIndex === -1) return;
  const tmp = state.tasks[fromGlobalIndex];
  state.tasks[fromGlobalIndex] = state.tasks[toGlobalIndex];
  state.tasks[toGlobalIndex] = tmp;
}

function bindTimeSelectInput(key, hasNone = false, modeId = "") {
  const hourEl = document.getElementById(`${key}Hour`);
  const minuteEl = document.getElementById(`${key}Minute`);
  const update = () => {
    if (hasNone) {
      const mode = document.getElementById(modeId).value;
      if (mode === "none") {
        state.planTimes[key] = "none";
        hourEl.disabled = true;
        minuteEl.disabled = true;
        saveState();
        if (key === "departure") refreshDepartureNotification();
        return;
      }
      hourEl.disabled = false;
      minuteEl.disabled = false;
    }
    state.planTimes[key] = formatHHMM(Number(hourEl.value), Number(minuteEl.value));
    saveState();
    if (key === "departure") refreshDepartureNotification();
  };

  hourEl.addEventListener("change", update);
  minuteEl.addEventListener("change", update);
  if (hasNone) {
    document.getElementById(modeId).addEventListener("change", update);
  }
}

function loadTaskIntoForm(taskId) {
  const task = findTask(taskId);
  if (!task) return;

  state.planningForm = {
    mode: "edit",
    targetId: task.id,
    taskName: task.name,
    taskNameChoice: task.name,
    customTaskName: task.name,
    minutesChoice: String(task.plannedMinutes),
    customMinutes: String(task.plannedMinutes),
    content: task.content,
    submissionTemplateId: normalizeSubmissionTemplateId(task.submissionTemplateId)
  };
}

function renderPlanningSubmissionChecklistSummary(task) {
  const summary = getSubmissionChecklistSummary(task);
  if (!summary || !summary.hasTemplate) return "";
  return `<p class="helper">提出・確認: ${summary.checked}/${summary.total}${summary.completed ? "（完了）" : "（未完了）"}</p>`;
}

async function savePlanningTask() {
  syncPlanningFormFromDom();
  const taskNameForAssist = getPlanningFormTaskName();
  if (!(await confirmContentAssistIfNeeded(state.planningForm.content, taskNameForAssist))) {
    deferredUiBlockUntil = 0;
    flushDeferredUiUpdates();
    return;
  }

  await runProtectedSaveAction({
    key: "planning-task-save",
    syncFromDom: syncPlanningFormFromDom,
    validate: () => {
      const planningTasks = getPlanningVisibleTasks();
      const name = getPlanningFormTaskName();
      const minutes = getPlanningFormMinutes();
      if (!name) return "タスク名を入力してください。";
      if (!minutes) return "予定時間を入力してください。";
      if (state.planningForm.mode === "edit" && !planningTasks.find((task) => task.id === state.planningForm.targetId)) {
        return "保存対象の予定が見つかりません。";
      }
      return null;
    },
    captureState: () => structuredClone({
      tasks: state.tasks,
      planningForm: state.planningForm
    }),
    restoreState: (snapshot) => {
      if (!snapshot) return;
      state.tasks = snapshot.tasks;
      state.planningForm = normalizePlanningForm(snapshot.planningForm);
    },
    apply: () => {
      const targetDateKey = getPlanningTargetDateKey();
      const name = getPlanningFormTaskName();
      const minutes = getPlanningFormMinutes();
      const content = state.planningForm.content.trim();
      const submissionTemplateId = normalizeSubmissionTemplateId(state.planningForm.submissionTemplateId);

      if (state.planningForm.mode === "edit") {
        const task = findTask(state.planningForm.targetId);
        if (!task) throw new Error("missing-planning-task");
        const templateChanged = task.submissionTemplateId !== submissionTemplateId;
        task.name = name;
        task.plannedMinutes = minutes;
        task.content = content;
        task.targetDateKey = targetDateKey;
        task.submissionTemplateId = submissionTemplateId;
        if (templateChanged) {
          task.submissionCheckedItemIds = [];
          task.submissionChecklistCompleted = false;
        }
        markTaskNameAsUsed(name);
        return;
      }

      state.tasks.push(createTask(name, minutes, content, {
        targetDateKey,
        submissionTemplateId
      }));
      markTaskNameAsUsed(name);
    },
    onSuccess: () => {
      state.planningForm = createPlanningForm();
      saveState();
      renderPlanning();
    },
    successMessage: "予定を保存しました"
  });
}

function onGoToPlanConfirm() {
  const planningTasks = getPlanningVisibleTasks();
  if (planningTasks.length === 0) return alert("タスクが0件です。");

  const invalid = planningTasks.find((t) => !t.name.trim());
  if (invalid) return alert("タスク名を確認してください。");

  changePhase("planConfirm");
}

function renderPlanConfirm() {
  const planningTasks = getPlanningVisibleTasks();
  const report = buildPlanReportText();
  const targetDateKey = getPlanningTargetDateKey();
  const confirmBelongings = buildConfirmBelongingsSummary(targetDateKey);
  renderScreen(`
    <h2>${state.planFor === "today" ? "今日" : "明日"}の予定を確認してください</h2>
    <div class="summary confirm-summary">
      <p>起床　　　　${formatTimeForDisplay(state.planTimes.wakeUp)}</p>
      <p class="confirm-time-row"><span>出発　　　　${formatTimeForDisplay(state.planTimes.departure)}</span>${renderConfirmBelongingsSide(confirmBelongings)}</p>
      <p>帰宅　　　　${formatTimeForDisplay(state.planTimes.returnHome)}</p>
      <p>勉強開始　　${formatTimeForDisplay(state.planTimes.studyStart)}</p>
    </div>
    <ol class="confirm-list" id="confirmTaskList"></ol>
    <div class="summary"><p>学習予定時間の合計: ${formatStudyTotalDuration(sumPlanned(planningTasks))}</p></div>
    <div class="btn-row compact-stack">
      <button id="confirmPlanBtn" class="btn-main" type="button">この予定で決定</button>
      <button id="backToPlanningBtn" class="btn-quiet" type="button">戻って修正</button>
      <button id="copyPlanConfirmBtn" class="btn-sub" type="button">この画面をコピー</button>
    </div>
    <p id="copyPlanConfirmMsg" class="helper" aria-live="polite"></p>
  `);

  const list = document.getElementById("confirmTaskList");
  planningTasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "confirm-item";
    li.innerHTML = `
      <p class="confirm-head">${escapeHtml(task.name)}　${task.plannedMinutes}分</p>
      <div class="task-content-row confirm-body"><span class="task-content-label">内容：</span><span class="task-content-text">${escapeHtml(task.content)}</span></div>
    `;
    list.appendChild(li);
  });

  document.getElementById("confirmPlanBtn").addEventListener("click", confirmPlan);
  document.getElementById("backToPlanningBtn").addEventListener("click", () => changePhase("planning"));
  document.getElementById("copyPlanConfirmBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(report);
    document.getElementById("copyPlanConfirmMsg").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
}

function buildConfirmBelongingsSummary(dateKey) {
  const summary = getBelongingsSummaryForDate(dateKey);
  const autoText = Array.isArray(summary.autoItems)
    ? summary.autoItems
      .map((item) => (item.tagText ? `${item.name}（${item.tagText}）` : item.name))
      .join(" / ")
    : "";
  const manualText = Array.isArray(summary.manualItems) ? summary.manualItems.join(" / ") : "";
  return { autoText, manualText };
}

function renderConfirmBelongingsSide(confirmBelongings) {
  const parts = [];
  if (confirmBelongings.autoText) {
    parts.push(`<span class="confirm-side-chip">自動持ち物: ${escapeHtml(confirmBelongings.autoText)}</span>`);
  }
  if (confirmBelongings.manualText) {
    parts.push(`<span class="confirm-side-chip">今日だけ追加: ${escapeHtml(confirmBelongings.manualText)}</span>`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `<span class="confirm-time-side">${parts.join("")}</span>`;
}

function confirmPlan() {
  const targetDateKey = getPlanningTargetDateKey();
  state.tasks = state.tasks.map((t) => {
    if (!isTaskForDate(t, targetDateKey)) return t;
    return {
      ...t,
      name: t.name.trim(),
      content: t.content.trim(),
      plannedMinutes: sanitizeMinutes(t.plannedMinutes)
    };
  });

  if (state.planFor === "tomorrow") {
    // Next-day planning starts a fresh execution state for all tasks.
    state.tasks = state.tasks.map((t) => ({
      ...t,
      ...(isTaskForDate(t, targetDateKey)
        ? {
          status: "pending",
          actualSeconds: null,
          memo: "",
          closeAction: ""
        }
        : {})
    }));
  }

  updateTaskNameStats();

  const planningTasks = getTasksForDate(targetDateKey);

  state.confirmedPlan = {
    planFor: state.planFor,
    planTimes: { ...state.planTimes },
    tasks: planningTasks.map((t) => ({ ...t })),
    totalPlanned: sumPlanned(planningTasks),
    reportText: buildPlanReportText(),
    confirmedAt: Date.now()
  };

  if (!state.goPressedAt) {
    state.running = createRunningState();
    state.review = createReviewState();
  }

  state.goPressedAt = Date.now();
  if (state.planFor === "today") {
    state.dayClosed = false;
  }
  saveState();
  changePhase("planReport");
}

function updateTaskNameStats() {
  const now = Date.now();
  getPlanningVisibleTasks().forEach((task, index) => {
    markTaskNameAsUsed(task.name, now + index);
  });
}

function markTaskNameAsUsed(name, usedAt = Date.now()) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return;
  const existing = state.taskNameStats.find((item) => item.name === normalizedName);
  if (existing) {
    existing.count = Math.max(0, Number(existing.count) || 0) + 1;
    existing.lastUsedAt = Math.max(Number(existing.lastUsedAt) || 0, Number(usedAt) || 0);
    return;
  }
  state.taskNameStats.push({
    name: normalizedName,
    count: 1,
    lastUsedAt: Number(usedAt) || Date.now()
  });
}

function buildPlanReportText() {
  const planningTasks = getPlanningVisibleTasks();
  const now = getNowInJst();
  const targetDate = new Date(now);
  if (state.planFor === "tomorrow") {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  const dateFmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short"
  });
  const parts = dateFmt.formatToParts(targetDate);
  const month = parts.find((p) => p.type === "month")?.value || String(targetDate.getMonth() + 1);
  const day = parts.find((p) => p.type === "day")?.value || String(targetDate.getDate());
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";

  const lines = [];
  lines.push(`【${month}月${day}日（${weekday}）の予定】`);
  lines.push("");
  lines.push(`起床　　　　${formatTimeForDisplay(state.planTimes.wakeUp)}`);
  lines.push(`出発　　　　${formatTimeForDisplay(state.planTimes.departure)}`);
  lines.push(`帰宅　　　　${formatTimeForDisplay(state.planTimes.returnHome)}`);
  lines.push(`勉強開始　　${formatTimeForDisplay(state.planTimes.studyStart)}`);
  const belongingsLines = buildPlanReportBelongingsLines(getPlanningTargetDateKey());
  belongingsLines.forEach((line) => lines.push(line));
  lines.push("");
  lines.push(`合計時間　${formatStudyTotalDuration(sumPlanned(planningTasks))}`);
  lines.push("");
  planningTasks.forEach((task, index) => {
    lines.push(`${toCircledNumber(index + 1)} ${task.name}　予定 ${task.plannedMinutes}分`);
    lines.push(` 内容：${task.content}`);
    lines.push("");
  });
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function buildPlanReportBelongingsLines(dateKey) {
  const summary = getBelongingsSummaryForDate(dateKey);
  const autoText = Array.isArray(summary.autoItems)
    ? summary.autoItems
      .map((item) => (item.tagText ? `${item.name}（${item.tagText}）` : item.name))
      .join(" / ")
    : "";
  const manualText = Array.isArray(summary.manualItems) ? summary.manualItems.join(" / ") : "";
  const lines = [];
  if (autoText) {
    lines.push(`持ち物　${autoText}`);
  }
  if (manualText) {
    lines.push(`追加持ち物　${manualText}`);
  }
  return lines;
}

function renderPlanReport() {
  const report = buildPlanReportText();
  const canExecuteFromPlanReport = canExecuteTasksForDate(getPlanningTargetDateKey());
  renderScreen(`
    <h2>親への予定報告</h2>
    <div id="planReportText" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyPlanBtn" class="btn-main" type="button">予定をコピー</button>
      <button id="startExecutionBtn" class="btn-quiet" type="button" ${canExecuteFromPlanReport ? "" : "disabled"}>タスク実行へ進む</button>
    </div>
    <p id="copyPlanMessage" class="helper" aria-live="polite"></p>
  `);

  document.getElementById("planReportText").textContent = report;
  document.getElementById("copyPlanBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(report);
    document.getElementById("copyPlanMessage").textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
  if (canExecuteFromPlanReport) {
    document.getElementById("startExecutionBtn")?.addEventListener("click", () => changePhase("execution"));
  }
}

function getExecutionSelectableTasks() {
  // Keep existing pending-order behavior and only limit visible cards for execution selection.
  const pending = getExecutionVisibleTasks().filter((t) => t.status === "pending");
  return pending.slice(0, EXECUTION_SELECT_LIMIT);
}

function renderExecution() {
  const runningTask = getRunningTask();
  const pending = getExecutionVisibleTasks().filter((t) => t.status === "pending");
  const selectableTasks = state.executionTaskListExpanded
    ? pending
    : getExecutionSelectableTasks();

  renderScreen(`
    <h2>タスク実行</h2>
    <h2>今やることを選んでください</h2>
    <div id="runArea"></div>
    <hr class="sep" />
  `);

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
        <p class="planned-time-row">予定時間: ${runningTask.plannedMinutes}分</p>
        <div class="task-content-row helper"><span class="task-content-label">内容：</span><span class="task-content-text">${escapeHtml(runningTask.content)}</span></div>
        <div class="elapsed-status-row">
          <p class="elapsed" id="elapsedLabel">${formatElapsedSmart(elapsed)}</p>
        </div>
        ${renderExecutionCompleteControls()}
        ${renderOverrunControls(elapsed)}
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
    runArea.innerHTML = `
      <ul class="task-list" id="selectList"></ul>
      ${pending.length > EXECUTION_SELECT_LIMIT ? `<div class="home-task-more-row"><button id="toggleExecutionTaskListBtn" class="btn-quiet" type="button">${state.executionTaskListExpanded ? "折りたたむ" : `すべて見る（全${pending.length}件）`}</button></div>` : ""}
      <p class="notice info">タスクカードをタップすると計測が始まります。</p>
    `;
    const list = document.getElementById("selectList");
    selectableTasks.forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-card selectable-card";
      li.dataset.taskId = task.id;
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.innerHTML = `<h3>${escapeHtml(task.name)}</h3><p>予定時間: ${task.plannedMinutes}分</p><div class="task-content-row helper"><span class="task-content-label">内容：</span><span class="task-content-text">${escapeHtml(task.content)}</span></div>`;
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

    document.getElementById("toggleExecutionTaskListBtn")?.addEventListener("click", () => {
      state.executionTaskListExpanded = !state.executionTaskListExpanded;
      saveState();
      renderExecution();
    });
  } else {
    state.executionTaskListExpanded = false;
    runArea.innerHTML = `<p class="notice warn">未完了タスクはありません。</p>`;
  }

  const checklistSectionHtml = renderExecutionSubmissionChecklistSection();
  if (checklistSectionHtml) {
    runArea.insertAdjacentHTML("beforeend", checklistSectionHtml);
    runArea.querySelectorAll("button[data-open-submission-checklist]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetType = String(btn.getAttribute("data-submission-target-type") || "");
        const targetId = String(btn.getAttribute("data-submission-target-id") || "");
        if (!targetType || !targetId) return;
        openSubmissionChecklistTarget(targetType, targetId, "execution");
      });
    });
  }

}

function renderOverrunControls(elapsed) {
  if (!state.running.alerting) return "";
  return `
    <div class="notice warn">
      <p>予定時間になりました。</p>
      <div class="btn-row triple compact-stack overrun-choice-row">
        <button id="overrunCompleteBtn" class="btn-ok" type="button">完了</button>
        <button id="overrunInterruptBtn" class="btn-quiet" type="button">中断</button>
        <button id="overrunContinueBtn" class="btn-sub" type="button">もう少し続ける</button>
      </div>
    </div>
  `;
}

function renderExecutionCompleteControls() {
  if (state.running.alerting) return "";
  return `
    <div class="btn-row split compact-stack execution-main-actions">
      <button id="completeBtn" class="btn-ok" type="button">完了</button>
      <button id="interruptBtn" class="btn-quiet" type="button">中断</button>
    </div>
  `;
}

function clearExecutionConfirmStates() {
  state.running.confirmingComplete = false;
}

function bindExecutionButtons() {
  document.getElementById("completeBtn")?.addEventListener("click", openTaskCompleteConfirmDialog);
  document.getElementById("interruptBtn")?.addEventListener("click", interruptRunningTask);
  document.getElementById("overrunCompleteBtn")?.addEventListener("click", openTaskCompleteConfirmDialog);
  document.getElementById("overrunInterruptBtn")?.addEventListener("click", interruptRunningTask);
  document.getElementById("overrunContinueBtn")?.addEventListener("click", continueRunningTaskAfterReminder);
}

function checkOverrunNotification(elapsed) {
  const target = state.running.alertAtSeconds;
  if (target == null) return;
  if (elapsed >= target) {
    const willTrigger = state.running.lastAlertTarget !== target;
    console.log("[OverrunCheck] elapsed/target/last/willTrigger", elapsed, target, state.running.lastAlertTarget, willTrigger);
  }
  if (elapsed >= target && state.running.lastAlertTarget !== target) {
    state.running.alerting = true;
    state.running.lastAlertTarget = target;
    console.log("[OverrunNotify] triggerAlertFeedback called", { elapsed, target });
    triggerAlertFeedback();
    const task = getRunningTask();
    if (task) cancelTaskFinishNotification(task.id);
    saveState();
  }
}

async function ensureNotificationAudioReady(fromUserAction = false) {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    console.error("[Audio] AudioContext is not supported on this browser.");
    return null;
  }

  if (!notificationAudioCtx) {
    try {
      notificationAudioCtx = new AudioCtor();
      console.log("[Audio] AudioContext created", notificationAudioCtx.state);
    } catch (error) {
      console.error("[Audio] Failed to create AudioContext", error);
      return null;
    }
  }

  if (notificationAudioCtx.state === "suspended" && fromUserAction) {
    try {
      await notificationAudioCtx.resume();
      console.log("[Audio] AudioContext resumed by user action");
    } catch (error) {
      if (fromUserAction) {
        console.error("[Audio] Failed to resume AudioContext", error);
      }
    }
  }

  return notificationAudioCtx;
}

function getAlertTonePreset(toneType = "type1") {
  if (toneType === "type2") return { kind: "alarm", oscType: "square", frequencies: [900.0, 1150.0] };
  if (toneType === "type3") return { kind: "bird", oscType: "triangle", frequency: 1500.0 };
  if (toneType === "type4") return { kind: "klaxon", oscType: "sawtooth", frequencies: [440.0, 554.4] };
  if (toneType === "type5") return { kind: "buzzer", oscType: "square", frequency: 220.0 };
  return { kind: "single", oscType: "square", frequency: 1046.5 };
}

function playNotificationSound(options = {}) {
  if (!notificationAudioCtx) {
    console.error("[Audio] Notification sound skipped because AudioContext is not initialized.");
    return;
  }

  if (notificationAudioCtx.state !== "running") {
    console.error("[Audio] Notification sound skipped because AudioContext is not running.", notificationAudioCtx.state);
    return;
  }

  try {
    const volumeInput = Number(options.overrideVolume);
    const volume = Number.isFinite(volumeInput) ? Math.min(10, Math.max(1, Math.round(volumeInput))) : 5;
    const peakGain = 0.06 + volume * 0.07;
    const tone = getAlertTonePreset(String(options.overrideToneType || "type1"));
    const durationInput = Number(options.overrideDurationSeconds);
    const durationSeconds = Number.isFinite(durationInput)
      ? Math.min(10, Math.max(0.2, durationInput))
      : tone.kind === "single"
        ? 5
        : 0.25;
    const now = notificationAudioCtx.currentTime;

    if (tone.kind === "pattern") {
      const notes = Array.isArray(tone.frequencies) ? tone.frequencies : [1046.5];
      const step = Math.max(0.12, durationSeconds / notes.length);
      notes.forEach((freq, idx) => {
        const start = now + idx * step;
        const osc = notificationAudioCtx.createOscillator();
        const gain = notificationAudioCtx.createGain();
        osc.type = tone.oscType;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peakGain * 0.8, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.08, step - 0.02));
        osc.connect(gain);
        gain.connect(notificationAudioCtx.destination);
        osc.start(start);
        osc.stop(start + Math.max(0.08, step - 0.01));
      });
      return;
    }

    if (tone.kind === "alarm") {
      const notes = Array.isArray(tone.frequencies) ? tone.frequencies : [900.0, 1150.0];
      const half = Math.max(0.08, durationSeconds / Math.max(2, notes.length * 2));
      for (let t = 0; t < durationSeconds; t += half) {
        const idx = Math.floor(t / half) % notes.length;
        const start = now + t;
        const stop = Math.min(now + durationSeconds, start + half);
        const osc = notificationAudioCtx.createOscillator();
        const gain = notificationAudioCtx.createGain();
        osc.type = tone.oscType;
        osc.frequency.setValueAtTime(notes[idx], start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, stop);
        osc.connect(gain);
        gain.connect(notificationAudioCtx.destination);
        osc.start(start);
        osc.stop(stop);
      }
      return;
    }

    if (tone.kind === "bird") {
      const chirpLen = 0.14;
      for (let t = 0; t < durationSeconds; t += 0.2) {
        const start = now + t;
        const end = Math.min(now + durationSeconds, start + chirpLen);
        const osc = notificationAudioCtx.createOscillator();
        const gain = notificationAudioCtx.createGain();
        osc.type = tone.oscType;
        osc.frequency.setValueAtTime(tone.frequency * 0.75, start);
        osc.frequency.exponentialRampToValueAtTime(tone.frequency * 1.45, end);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peakGain * 0.7, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain);
        gain.connect(notificationAudioCtx.destination);
        osc.start(start);
        osc.stop(end);
      }
      return;
    }

    if (tone.kind === "klaxon") {
      const notes = Array.isArray(tone.frequencies) ? tone.frequencies : [440.0, 554.4];
      const period = 0.18;
      const osc = notificationAudioCtx.createOscillator();
      const gain = notificationAudioCtx.createGain();
      osc.type = tone.oscType;
      for (let t = 0; t < durationSeconds; t += period) {
        const idx = Math.floor(t / period) % notes.length;
        osc.frequency.setValueAtTime(notes[idx], now + t);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain * 0.85, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
      osc.connect(gain);
      gain.connect(notificationAudioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSeconds);
      return;
    }

    if (tone.kind === "buzzer") {
      const osc = notificationAudioCtx.createOscillator();
      const gain = notificationAudioCtx.createGain();
      osc.type = tone.oscType;
      osc.frequency.setValueAtTime(tone.frequency, now);
      const pulse = 0.1;
      for (let t = 0; t < durationSeconds; t += pulse) {
        const on = now + t;
        const off = Math.min(now + durationSeconds, on + pulse * 0.55);
        gain.gain.setValueAtTime(0.0001, on);
        gain.gain.exponentialRampToValueAtTime(peakGain * 0.95, on + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, off);
      }
      osc.connect(gain);
      gain.connect(notificationAudioCtx.destination);
      osc.start(now);
      osc.stop(now + durationSeconds);
      return;
    }

    if (tone.kind === "bell") {
      const baseOsc = notificationAudioCtx.createOscillator();
      const harmOsc = notificationAudioCtx.createOscillator();
      const gain = notificationAudioCtx.createGain();
      baseOsc.type = tone.oscType;
      harmOsc.type = "triangle";
      baseOsc.frequency.setValueAtTime(tone.frequency, now);
      harmOsc.frequency.setValueAtTime(tone.frequency * 2, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain * 0.75, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
      baseOsc.connect(gain);
      harmOsc.connect(gain);
      gain.connect(notificationAudioCtx.destination);
      baseOsc.start(now);
      harmOsc.start(now);
      baseOsc.stop(now + durationSeconds);
      harmOsc.stop(now + durationSeconds);
      return;
    }

    const beepInterval = 0.18;
    const beepLength = 0.06;
    for (let t = 0; t < durationSeconds; t += beepInterval) {
      const start = now + t;
      const stop = Math.min(now + durationSeconds, start + beepLength);
      const osc = notificationAudioCtx.createOscillator();
      const gain = notificationAudioCtx.createGain();
      osc.type = tone.oscType;
      osc.frequency.setValueAtTime(tone.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, stop);
      osc.connect(gain);
      gain.connect(notificationAudioCtx.destination);
      osc.start(start);
      osc.stop(stop);
    }
  } catch (error) {
    console.error("[Audio] Failed to play notification sound", error);
  }
}

function runVibrationFeedback(stage = "first") {
  try {
    if (!("vibrate" in navigator)) {
      console.log("[Vibrate] navigator.vibrate is not available.");
      return;
    }
    const pattern = [0, 500, 300, 500, 300, 500, 300, 500, 300, 500, 300, 500];
    const result = navigator.vibrate(pattern);
    console.log("[Vibrate] navigator.vibrate result:", result);
  } catch (error) {
    console.error("[Vibrate] Failed to vibrate", error);
  }
}

function triggerAlertFeedback(stage = "first", options = {}) {
  playNotificationSound(options);
  runVibrationFeedback(stage);
}

function getCurrentAlertScheduleKey() {
  const task = getRunningTask();
  if (!task) return "";
  const target = Number(state.running?.alertAtSeconds);
  if (!Number.isFinite(target)) return "";
  return `${task.id}:${target}`;
}

function clearSecondAlertReservation() {
  if (secondAlertTimeoutId != null) {
    clearTimeout(secondAlertTimeoutId);
    secondAlertTimeoutId = null;
  }
  secondAlertScheduledKey = "";
}

function stopSecondAlertSoundNow() {
  secondAlertActiveOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch (_) {
      // Oscillator may already be stopped.
    }
  });
  secondAlertActiveOscillators = [];
  secondAlertActiveGains.forEach((gain) => {
    try {
      gain.disconnect();
    } catch (_) {
      // Gain may already be disconnected.
    }
  });
  secondAlertActiveGains = [];
}

function cancelSecondAlertFollowup() {
  clearSecondAlertReservation();
  stopSecondAlertSoundNow();
}

function scheduleSecondAlertFollowup() {
  const scheduleKey = getCurrentAlertScheduleKey();
  if (!scheduleKey) return;
  if (secondAlertTimeoutId != null && secondAlertScheduledKey === scheduleKey) return;

  cancelSecondAlertFollowup();
  secondAlertScheduledKey = scheduleKey;
  secondAlertTimeoutId = setTimeout(() => {
    secondAlertTimeoutId = null;
    if (getCurrentAlertScheduleKey() !== scheduleKey) return;
    triggerSecondAlertFeedback();
  }, SECOND_ALERT_DELAY_MS);
}

function triggerSecondAlertFeedback() {
  if (!notificationAudioCtx || notificationAudioCtx.state !== "running") return;

  stopSecondAlertSoundNow();
  const now = notificationAudioCtx.currentTime;
  const interval = 0.08;
  const beepLength = 0.045;
  const cycle = 0.9;
  const gainPeak = 0.55;

  for (let t = 0; t < SECOND_ALERT_DURATION_SECONDS; t += interval) {
    const cyclePos = t % cycle;
    const inBurst = cyclePos < 0.32 || (cyclePos >= 0.45 && cyclePos < 0.77);
    if (!inBurst) continue;

    const start = now + t;
    const stop = Math.min(now + SECOND_ALERT_DURATION_SECONDS, start + beepLength);
    const osc = notificationAudioCtx.createOscillator();
    const gain = notificationAudioCtx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(Math.floor(t / interval) % 2 === 0 ? 1320 : 1760, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.connect(gain);
    gain.connect(notificationAudioCtx.destination);
    osc.start(start);
    osc.stop(stop);

    secondAlertActiveOscillators.push(osc);
    secondAlertActiveGains.push(gain);
  }

  runVibrationFeedback("second");
}

function startAudioWarmupFromUserAction() {
  ensureNotificationAudioReady(true).catch((error) => {
    console.error("[Audio] Warmup failed", error);
  });
}

function startTask(taskId) {
  if (!canExecuteCurrentHomeTasks()) return;
  const task = findTask(taskId);
  if (!task || task.status !== "pending") return;
  cancelSecondAlertFollowup();
  cancelTaskFinishNotification(task.id);
  startAudioWarmupFromUserAction();
  state.running = {
    taskId,
    startedAt: Date.now(),
    baseSeconds: typeof task.actualSeconds === "number" ? task.actualSeconds : 0,
    isPaused: false,
    confirmingComplete: false,
    alertAtSeconds: task.plannedMinutes * 60,
    nextAlertKind: "task-finish",
    alerting: false,
    lastAlertTarget: null
  };
  appendHistoryEvent({
    category: "task",
    type: HISTORY_EVENT_TYPE_TASK_STARTED,
    taskId: task.id,
    taskNameSnapshot: task.name
  });
  saveState();
  scheduleTaskFinishNotificationForRunningTask(task, "task-finish");
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

function isRunningTaskReminderVisible() {
  const runningTask = getRunningTask();
  if (!runningTask) return false;
  if (state.running.isPaused) return false;
  return Boolean(state.running.alerting);
}

function buildRunningReminderTaskLabel(task) {
  if (!task) return "";
  const name = String(task.name || "").trim();
  const content = String(task.content || "").trim();
  if (!content) return name;
  return `${name}：${content}`;
}

function continueRunningTaskAfterReminder() {
  const task = getRunningTask();
  if (!task || state.running.isPaused) return;
  cancelSecondAlertFollowup();
  state.running.alerting = false;
  state.running.lastAlertTarget = null;
  state.running.alertAtSeconds = getRunningElapsedSeconds() + (20 * 60);
  state.running.nextAlertKind = "task-recheck";
  saveState();
  scheduleTaskFinishNotificationForRunningTask(task, "task-recheck");
  changePhase("execution", false);
}

function showTaskCompleteConfirmDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "complete-confirm-overlay";
    overlay.innerHTML = `
      <div class="complete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="completeConfirmTitle">
        <h3 id="completeConfirmTitle">完了しますか？</h3>
        <div class="btn-row split compact-stack">
          <button id="confirmTaskCompleteBtn" class="btn-ok" type="button">完了する</button>
          <button id="cancelTaskCompleteBtn" class="btn-quiet" type="button">戻る</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    document.getElementById("confirmTaskCompleteBtn")?.addEventListener("click", () => close(true));
    document.getElementById("cancelTaskCompleteBtn")?.addEventListener("click", () => close(false));
  });
}

async function openTaskCompleteConfirmDialog() {
  const ok = await showTaskCompleteConfirmDialog();
  if (!ok) return;
  finalizeTaskCompletion();
}

function interruptRunningTask() {
  const task = getRunningTask();
  if (!task) return;
  cancelSecondAlertFollowup();
  cancelTaskFinishNotification(task.id);
  const elapsed = Math.max(1, getRunningElapsedSeconds());
  task.actualSeconds = elapsed;
  state.running.baseSeconds = elapsed;
  state.running.startedAt = null;
  state.running.isPaused = true;
  appendHistoryEvent({
    category: "task",
    type: HISTORY_EVENT_TYPE_TASK_PAUSED,
    taskId: task.id,
    taskNameSnapshot: task.name
  });
  clearExecutionConfirmStates();
  state.running.alerting = false;
  state.running.alertAtSeconds = null;
  state.running.lastAlertTarget = null;
  goHome();
}

function resumePausedTask() {
  const task = getRunningTask();
  if (!task || !state.running.isPaused) return;
  startAudioWarmupFromUserAction();
  state.running.startedAt = Date.now();
  state.running.baseSeconds = typeof task.actualSeconds === "number" ? task.actualSeconds : 0;
  state.running.isPaused = false;
  if (!Number.isFinite(Number(state.running.alertAtSeconds))) {
    state.running.alertAtSeconds = sanitizeMinutes(task.plannedMinutes) * 60;
  }
  if (state.running.nextAlertKind !== "task-recheck") {
    state.running.nextAlertKind = "task-finish";
  }
  appendHistoryEvent({
    category: "task",
    type: HISTORY_EVENT_TYPE_TASK_RESUMED,
    taskId: task.id,
    taskNameSnapshot: task.name
  });
  clearExecutionConfirmStates();
  scheduleTaskFinishNotificationForRunningTask(task, state.running.nextAlertKind || "task-finish");
  changePhase("execution", false);
}

function finalizeTaskCompletion() {
  const task = getRunningTask();
  if (!task) return;
  cancelSecondAlertFollowup();
  cancelTaskFinishNotification(task.id);
  task.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  task.status = "done";
  appendHistoryEvent({
    category: "task",
    type: HISTORY_EVENT_TYPE_TASK_COMPLETED,
    taskId: task.id,
    taskNameSnapshot: task.name
  });
  if (task.homeworkId) {
    const linkedHomework = state.homeworkTasks.find((item) => item.id === task.homeworkId);
    if (linkedHomework) {
      updateHomeworkCompletionByStandardFlow(linkedHomework, getCurrentHomeDateKey());
    }
  }
  if (task.submissionTemplateId && !task.submissionChecklistCompleted) {
    const template = findSubmissionTemplate(task.submissionTemplateId);
    if (template && template.items.length > 0) {
      state.submissionChecklistTarget = {
        targetType: "task",
        targetId: task.id,
        returnPhase: "execution"
      };
    }
  }
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

function formatExecutionElapsedLabel(task, elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  return formatElapsedSmart(elapsed);
}

function getActiveExtendStatusText(elapsed) {
  return "";
}

function updateActiveExtendStatusLabel(elapsed) {
  const label = document.getElementById("activeExtendStatusLabel");
  if (!label) return;
  const text = getActiveExtendStatusText(elapsed);
  label.textContent = text;
  label.classList.toggle("hidden", !text);
}

function startTodayFinishFlow() {
  cancelSecondAlertFollowup();
  const runningTask = getRunningTask();
  if (runningTask) {
    cancelTaskFinishNotification(runningTask.id);
    runningTask.actualSeconds = Math.max(1, getRunningElapsedSeconds());
  }
  state.running = createRunningState();
  const executionDateKey = getCurrentHomeDateKey();
  state.review = {
    pendingIds: getTasksForDate(executionDateKey).filter((t) => t.status === "pending").map((t) => t.id),
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
      <div class="task-content-row"><span class="task-content-label">内容：</span><span class="task-content-text">${escapeHtml(task.content)}</span></div>
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
    if (shouldSkipInputWhileComposing(e)) return;
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
  if (!hasDepartureCheckActivated()) return false;
  if (state.planTimes.returnHome === "none" || state.returnCheck.done) return false;
  const now = getNowInJst();
  const rt = getDateTimeToday(state.planTimes.returnHome);
  return rt && now >= rt;
}

function getReturnCheckReminderStatus() {
  if (!hasDepartureCheckActivated()) return "none";
  if (state.planTimes.returnHome === "none" || state.returnCheck.done) return "none";
  const returnAt = getDateTimeToday(state.planTimes.returnHome);
  if (!returnAt) return "none";

  const now = getNowInJst();
  if (now >= returnAt) return "overdue";

  const leadMs = returnAt.getTime() - now.getTime();
  if (leadMs <= 30 * 60 * 1000) return "before30";
  return "none";
}

function getReturnCheckReminderContent(status) {
  if (status === "overdue") {
    return {
      title: "帰宅時チェックが未完了です。",
      body: "帰宅が遅れそうな場合は、保護者へ連絡してください。"
    };
  }
  return {
    title: "帰宅予定時刻が近づいています。",
    body: "帰宅が遅れそうな場合は、早めに保護者へ連絡しましょう。"
  };
}

function syncReturnCheckReminderState() {
  let changed = false;
  const status = getReturnCheckReminderStatus();
  const nowMs = Date.now();
  const snoozeUntil = Number(state.returnCheck.reminderSnoozeUntil || 0);

  if (status === "none") {
    if (state.returnCheck.reminderVisible) {
      state.returnCheck.reminderVisible = false;
      changed = true;
    }
    return changed;
  }

  if (!state.returnCheck.reminderPromptTriggered) {
    state.returnCheck.reminderPromptTriggered = true;
    state.returnCheck.reminderVisible = true;
    changed = true;
  }

  if (snoozeUntil > nowMs) {
    if (state.returnCheck.reminderVisible) {
      state.returnCheck.reminderVisible = false;
      changed = true;
    }
    return changed;
  }

  if (state.returnCheck.reminderDeferred && state.phase === "home" && !state.returnCheck.reminderVisible) {
    state.returnCheck.reminderVisible = true;
    changed = true;
  }

  return changed;
}

function getCurrentJstTimeLabel() {
  const now = getNowInJst();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function removeMedicineReminderOverlay() {
  document.getElementById("medicineReminderOverlay")?.remove();
}

function applyMedicineDoseStatus(type, done) {
  const reminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  const target = type === MEDICINE_TYPE_RED ? reminder.red : reminder.blue;
  const wasDone = Boolean(target.done);
  target.done = Boolean(done);
  target.doneAt = done ? getCurrentJstTimeLabel() : "";

  if (!wasDone && done) {
    appendHistoryEvent({
      category: "check",
      type: type === MEDICINE_TYPE_RED
        ? HISTORY_EVENT_TYPE_MEDICINE_RED_COMPLETED
        : HISTORY_EVENT_TYPE_MEDICINE_BLUE_COMPLETED
    });
  }

  if (isMedicineDoneAll(reminder)) {
    reminder.snoozeUntil = 0;
    reminder.forceOpen = true;
  }

  state.medicineReminder = reminder;
  saveState();
  requestMedicineReminderNotificationRefresh();
  render();
}

function snoozeMedicineReminder() {
  const reminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  reminder.snoozeUntil = getNowInJst().getTime() + (15 * 60 * 1000);
  reminder.forceOpen = false;
  state.medicineReminder = reminder;
  saveState();
  requestMedicineReminderNotificationRefresh();
  render();
}

function renderMedicineReminderOverlay() {
  const reminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  state.medicineReminder = reminder;

  if (!shouldShowMedicineReminderOverlayNow()) {
    removeMedicineReminderOverlay();
    return;
  }

  const allDone = isMedicineDoneAll(reminder);
  const existing = document.getElementById("medicineReminderOverlay");
  const overlay = existing || document.createElement("div");
  overlay.id = "medicineReminderOverlay";
  overlay.className = "app-modal-overlay medicine-overlay";

  overlay.innerHTML = `
    <div class="app-modal medicine-modal" role="dialog" aria-modal="true" aria-labelledby="medicineReminderTitle">
      <h3 id="medicineReminderTitle">💊 薬を飲みましたか？</h3>
      <p class="medicine-modal-sub">毎日18:00から確認します。両方完了するまで15分おきにお知らせします。</p>
      <div class="medicine-dose-grid">
        <div class="medicine-dose-card medicine-dose-blue">
          <p class="medicine-dose-title">青の薬</p>
          <p class="medicine-dose-status">${reminder.blue.done ? `完了（${escapeHtml(reminder.blue.doneAt || "時刻なし")}）` : "未完了"}</p>
          <div class="btn-row compact-stack">
            ${reminder.blue.done
    ? '<button class="btn-quiet medicine-action-btn" type="button" data-medicine-undo="blue">取り消し</button>'
    : '<button class="btn-main medicine-action-btn" type="button" data-medicine-done="blue">飲んだ</button>'}
          </div>
        </div>
        <div class="medicine-dose-card medicine-dose-red">
          <p class="medicine-dose-title">赤の薬</p>
          <p class="medicine-dose-status">${reminder.red.done ? `完了（${escapeHtml(reminder.red.doneAt || "時刻なし")}）` : "未完了"}</p>
          <div class="btn-row compact-stack">
            ${reminder.red.done
    ? '<button class="btn-quiet medicine-action-btn" type="button" data-medicine-undo="red">取り消し</button>'
    : '<button class="btn-main medicine-action-btn" type="button" data-medicine-done="red">飲んだ</button>'}
          </div>
        </div>
      </div>
      <div class="btn-row split compact-stack app-modal-actions medicine-modal-actions">
        <button id="medicineSnoozeBtn" class="btn-sub" type="button" ${allDone ? "disabled" : ""}>15分後</button>
        <button id="closeMedicineReminderBtn" class="btn-main" type="button" ${allDone ? "" : "disabled"}>閉じる</button>
      </div>
      <p class="helper medicine-footer">${allDone ? "今日の薬はすべて完了しました。" : "未完了の薬があるため、この画面は閉じられません。"}</p>
    </div>
  `;

  if (!existing) {
    document.body.appendChild(overlay);
  }

  overlay.querySelectorAll("button[data-medicine-done]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = String(btn.getAttribute("data-medicine-done") || "");
      if (type !== MEDICINE_TYPE_BLUE && type !== MEDICINE_TYPE_RED) return;
      applyMedicineDoseStatus(type, true);
    });
  });

  overlay.querySelectorAll("button[data-medicine-undo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = String(btn.getAttribute("data-medicine-undo") || "");
      if (type !== MEDICINE_TYPE_BLUE && type !== MEDICINE_TYPE_RED) return;
      applyMedicineDoseStatus(type, false);
    });
  });

  document.getElementById("medicineSnoozeBtn")?.addEventListener("click", () => {
    if (allDone) return;
    snoozeMedicineReminder();
  });

  document.getElementById("closeMedicineReminderBtn")?.addEventListener("click", () => {
    if (!isMedicineDoneAll(state.medicineReminder)) return;
    closeMedicineReminderOverlay();
  });
}

function removeReturnCheckReminderOverlay() {
  document.getElementById("returnCheckReminderOverlay")?.remove();
}

function renderReturnCheckReminderOverlay() {
  const status = getReturnCheckReminderStatus();
  const shouldShow = Boolean(currentUser)
    && status !== "none"
    && !state.returnCheck.done
    && state.returnCheck.reminderVisible;

  if (!shouldShow) {
    removeReturnCheckReminderOverlay();
    return;
  }

  const existing = document.getElementById("returnCheckReminderOverlay");
  const content = getReturnCheckReminderContent(status);

  const overlay = existing || document.createElement("div");
  overlay.id = "returnCheckReminderOverlay";
  overlay.className = "app-modal-overlay";
  overlay.innerHTML = `
    <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="returnCheckReminderTitle">
      <h3 id="returnCheckReminderTitle">${escapeHtml(content.title)}</h3>
      <p>${escapeHtml(content.body)}</p>
      <div class="btn-row split compact-stack app-modal-actions">
        <button id="returnReminderLaterBtn" class="btn-quiet" type="button">あとで</button>
        <button id="goReturnCheckBtn" class="btn-main" type="button">帰宅時チェックへ</button>
      </div>
    </div>
  `;

  if (!existing) {
    document.body.appendChild(overlay);
  }

  document.getElementById("returnReminderLaterBtn")?.addEventListener("click", () => {
    state.returnCheck.reminderVisible = false;
    state.returnCheck.reminderDeferred = true;
    state.returnCheck.reminderSnoozeUntil = Date.now() + 3 * 60 * 1000;
    saveState();
    removeReturnCheckReminderOverlay();
  });

  document.getElementById("goReturnCheckBtn")?.addEventListener("click", () => {
    state.returnCheck.reminderVisible = false;
    state.returnCheck.reminderDeferred = false;
    state.returnCheck.reminderSnoozeUntil = 0;
    saveState();
    changePhase("returnCheck", false);
  });
}

function renderReturnCheck() {
  renderScreen(`
    <h2>帰宅時チェック</h2>
    <div class="task-form-box">
      <div class="form-stack">
        <div><label for="homeworkAnswer">宿題の有無</label><input id="homeworkAnswer" type="text" value="${escapeHtml(state.returnCheck.answers.homework)}" placeholder="例: あり / なし" /></div>
        <div><label for="troubleAnswer">困ったことの有無</label><input id="troubleAnswer" type="text" value="${escapeHtml(state.returnCheck.answers.trouble)}" placeholder="例: あり（内容） / なし" /></div>
        <div><label for="replyAnswer">家庭教師・親への返信</label><input id="replyAnswer" type="text" value="${escapeHtml(state.returnCheck.answers.reply)}" placeholder="例: LINEで返信した" /></div>
        <div>
          <p class="legend">帰宅が遅れそうな場合は、親へ連絡しましたか？</p>
          <div class="option-group">
            <label class="option-item"><input type="radio" name="delayedContactAnswer" value="yes" ${state.returnCheck.answers.delayedContact === "yes" ? "checked" : ""} />はい</label>
            <label class="option-item"><input type="radio" name="delayedContactAnswer" value="no" ${state.returnCheck.answers.delayedContact === "no" ? "checked" : ""} />いいえ</label>
            <label class="option-item"><input type="radio" name="delayedContactAnswer" value="na" ${state.returnCheck.answers.delayedContact === "na" ? "checked" : ""} />該当なし</label>
          </div>
        </div>
      </div>
      <div class="btn-row split compact-stack">
        <button id="copyReturnCheckBtn" class="btn-sub" type="button">チェック内容をコピー</button>
        <button id="finishReturnCheckBtn" class="btn-main" type="button">帰宅時に上記を対応し共有した</button>
      </div>
      <p id="returnCheckCopyMsg" class="helper" aria-live="polite"></p>
    </div>
  `);

  const copyMsgEl = document.getElementById("returnCheckCopyMsg");
  const refreshCopyText = () => {
    return buildReturnCheckCopyText();
  };

  document.getElementById("copyReturnCheckBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(refreshCopyText());
    if (copyMsgEl) copyMsgEl.textContent = ok ? "コピーしました" : "コピーに失敗しました";
  });
  document.getElementById("homeworkAnswer").addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.returnCheck.answers.homework = e.target.value;
    saveState();
    refreshCopyText();
  });
  document.getElementById("troubleAnswer").addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.returnCheck.answers.trouble = e.target.value;
    saveState();
    refreshCopyText();
  });
  document.getElementById("replyAnswer").addEventListener("input", (e) => {
    if (shouldSkipInputWhileComposing(e)) return;
    state.returnCheck.answers.reply = e.target.value;
    saveState();
    refreshCopyText();
  });
  document.querySelectorAll("input[name='delayedContactAnswer']").forEach((input) => {
    input.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      state.returnCheck.answers.delayedContact = target.value;
      saveState();
      refreshCopyText();
    });
  });
  document.getElementById("finishReturnCheckBtn").addEventListener("click", finishReturnCheck);
}

function buildReturnCheckCopyText() {
  const a = state.returnCheck.answers;
  const delayedContactLabel = a.delayedContact === "yes"
    ? "はい"
    : a.delayedContact === "no"
      ? "いいえ"
      : a.delayedContact === "na"
        ? "該当なし"
        : "(未選択)";
  return [
    "【帰宅時チェック】",
    `宿題の有無: ${a.homework || "(未入力)"}`,
    `困ったことの有無: ${a.trouble || "(未入力)"}`,
    `家庭教師・親への返信: ${a.reply || "(未入力)"}`,
    `帰宅が遅れそうな場合の親への連絡: ${delayedContactLabel}`
  ].join("\n");
}

function finishReturnCheck() {
  const a = state.returnCheck.answers;
  const delayedContactLabel = a.delayedContact === "yes"
    ? "はい"
    : a.delayedContact === "no"
      ? "いいえ"
      : a.delayedContact === "na"
        ? "該当なし"
        : "(未選択)";
  state.returnCheck.reportText = [
    "【帰宅後報告】",
    `宿題: ${a.homework || "(未入力)"}`,
    `困ったこと: ${a.trouble || "(未入力)"}`,
    `返信: ${a.reply || "(未入力)"}`,
    `帰宅が遅れそうな場合の親への連絡: ${delayedContactLabel}`
  ].join("\n");
  state.phase = "returnReport";
  saveState();
  cancelDepartureNotification();
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
    const returnCompletedEvent = appendHistoryEvent({
      category: "check",
      type: HISTORY_EVENT_TYPE_CHECK_RETURN_COMPLETED
    });
    state.returnCheck.completedAtMs = Number(returnCompletedEvent?.occurredAtMs || 0);
    state.returnCheck.completedAtTimeLabel = String(returnCompletedEvent?.timeLabel || "");
    state.returnCheck.reminderVisible = false;
    state.returnCheck.reminderDeferred = false;
    state.returnCheck.reminderPromptTriggered = false;
    state.returnCheck.reminderSnoozeUntil = 0;
    saveState();
    changePhase("home", false);
  });
}

function renderResult() {
  const targetTasks = getTasksForDate(state.dateKey);
  const done = targetTasks.filter((t) => t.status === "done");
  const deferred = targetTasks.filter((t) => t.status === "deferred");
  const discarded = targetTasks.filter((t) => t.status === "discarded");
  const unfinished = targetTasks.length - done.length;
  const totalPlanned = sumPlanned(targetTasks);
  const totalActual = sumActualMinutes(targetTasks);
  const report = buildResultReportText(targetTasks, done, deferred, discarded, unfinished, totalActual);
  const reportDisplayTasks = targetTasks.map((task) => ({
    ...task,
    name: getReportedTaskName(task)
  }));

  renderScreen(`
    <h3>保護者への報告文</h3>
    <div id="resultReportText" class="report-box result-report-box"></div>
    <div class="btn-row compact-stack">
      <button id="endDayBtn" class="btn-danger" type="button">1日の終了へ</button>
    </div>

    <div class="summary result-summary-compact">
      <div class="result-inline-row">
        <p>完了数 ${done.length}件</p>
        <p>未完了数 ${unfinished}件</p>
      </div>
      <div class="result-inline-row">
        <p>予定 ${formatMinutesAsHourMinute(totalPlanned)}</p>
        <p>実績 ${formatMinutesAsHourMinute(totalActual)}</p>
      </div>
    </div>
    <h3>保護者への報告事項（各タスク）</h3>
    <ul class="result-list" id="taskResultList"></ul>
  `);

  const list = document.getElementById("taskResultList");
  targetTasks.forEach((task) => {
    const reportedName = getReportedTaskName(task);
    const li = document.createElement("li");
    li.className = "result-card result-card-compact";
    li.innerHTML = `
      <p class="result-item-head">項目：${escapeHtml(reportedName)}（${getTaskStatusLabel(task.status)}）</p>
      <p class="result-item-meta">${escapeHtml(reportedName)}　予定 ${task.plannedMinutes}分　実績 ${secondsToMinutes(task.actualSeconds)}分</p>
      <div class="task-content-row result-item-content"><span class="task-content-label">内容：</span><span class="task-content-text">${escapeHtml(task.content || "(未入力)")}</span></div>
      ${(task.status === "deferred" || task.status === "discarded") ? `<p class="result-item-content">メモ：${escapeHtml(task.memo || "(未入力)")}</p>` : ""}
    `;
    list.appendChild(li);
  });

  document.getElementById("resultReportText").innerHTML = buildResultReportHtml(reportDisplayTasks, done.length, unfinished, totalActual);
  document.getElementById("endDayBtn").addEventListener("click", () => changePhase("dayEnd"));
}

function renderDayEnd() {
  const targetTasks = getTasksForDate(state.dateKey);
  const done = targetTasks.filter((t) => t.status === "done");
  const deferred = targetTasks.filter((t) => t.status === "deferred");
  const discarded = targetTasks.filter((t) => t.status === "discarded");
  const unfinished = targetTasks.filter((t) => t.status !== "done").length;
  const totalActual = sumActualMinutes(targetTasks);
  const report = buildResultReportText(targetTasks, done, deferred, discarded, unfinished, totalActual);

  renderScreen(`
    <h2>1日の終了</h2>
    <p class="helper">明日の予定作成に進む前に、報告文をコピーしてください。</p>
    <div id="dayEndReport" class="report-box"></div>
    <div class="btn-row compact-stack">
      <button id="copyDayEndBtn" class="btn-main" type="button">コピーして終了</button>
    </div>
    <p id="dayEndMsg" class="helper"></p>
  `);

  document.getElementById("dayEndReport").innerHTML = buildResultReportHtml(targetTasks, done.length, unfinished, totalActual);
  document.getElementById("copyDayEndBtn").addEventListener("click", async () => {
    if (!confirmLargeActualGapBeforeSend()) return;
    const ok = await copyToClipboard(report);
    document.getElementById("dayEndMsg").textContent = ok ? "コピーしました" : "コピーに失敗しました";
    if (ok) {
      state.previousDayArchive = createPreviousDayArchive(state.dateKey);
      state.lastResultReportText = report;
      state.dayClosed = true;
      state.homeViewMode = "current";
      state.homeTaskListExpanded = false;
      state.phase = "home";
      state.goPressedAt = null;
      state.running = createRunningState();
      state.review = createReviewState();
      saveState();
      render();
    }
  });
}

function buildResultReportText(targetTasks, done, deferred, discarded, unfinished, totalActual) {
  const dateKey = normalizeTaskDateKey(state.dateKey);
  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const title = dateMatch
    ? `${Number(dateMatch[2])}月${Number(dateMatch[3])}日結果`
    : "本日結果";
  const unfinishedNames = targetTasks
    .filter((task) => task.status !== "done")
    .map((task) => getReportedTaskName(task))
    .join("、");
  const unfinishedLine = unfinishedNames
    ? `未完了：${unfinished}件（${unfinishedNames}）`
    : `未完了：${unfinished}件`;
  const lines = [
    `【${title}】`,
    "",
    `予定：${targetTasks.length}件`,
    `完了：${done.length}件`,
    unfinishedLine,
    "",
    `予定時間：${formatMinutesAsHourMinute(sumPlanned(targetTasks))}`,
    `実績時間：${formatMinutesAsHourMinute(totalActual)}`,
    ""
  ];

  targetTasks.forEach((task, index) => {
    const contentWrapPrefix = `\t${"　".repeat(3)}`;
    lines.push(`${toCircledNumber(index + 1)}\t${getReportedTaskName(task)}　予定 ${task.plannedMinutes}分　実績 ${secondsToMinutes(task.actualSeconds)}分`);
    const contentParts = splitReportContent(task.content || "(未入力)", 30);
    lines.push(`\t内容：${contentParts[0] || "(未入力)"}`);
    for (let i = 1; i < contentParts.length; i += 1) {
      lines.push(`${contentWrapPrefix}${contentParts[i]}`);
    }
    if (task.status === "deferred" || task.status === "discarded") {
      lines.push(`メモ：${task.memo || "(未入力)"}`);
    }
    lines.push("");
  });

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function buildResultReportHtml(targetTasks, doneCount, unfinishedCount, totalActual) {
  const dateKey = normalizeTaskDateKey(state.dateKey);
  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const title = dateMatch
    ? `${Number(dateMatch[2])}月${Number(dateMatch[3])}日結果`
    : "本日結果";
  const unfinishedNames = targetTasks
    .filter((task) => task.status !== "done")
    .map((task) => task.name)
    .join("、");
  const unfinishedLine = unfinishedNames
    ? `未完了：${unfinishedCount}件（${unfinishedNames}）`
    : `未完了：${unfinishedCount}件`;

  const lines = [
    `<p>【${escapeHtml(title)}】</p>`,
    `<p>予定：${targetTasks.length}件</p>`,
    `<p>完了：${doneCount}件</p>`,
    `<p>${escapeHtml(unfinishedLine)}</p>`,
    `<p>予定時間：${formatMinutesAsHourMinute(sumPlanned(targetTasks))}</p>`,
    `<p>実績時間：${formatMinutesAsHourMinute(totalActual)}</p>`
  ];

  lines.push('<div class="result-report-gap"></div>');

  targetTasks.forEach((task, index) => {
    lines.push('<div class="result-report-task">');
    lines.push(`<p>${toCircledNumber(index + 1)} ${escapeHtml(task.name)}　予定 ${task.plannedMinutes}分　実績 ${secondsToMinutes(task.actualSeconds)}分</p>`);
    lines.push(`<div class="task-content-row result-report-content-row"><span class="task-content-label">内容：</span><span class="task-content-text">${escapeHtml(task.content || "(未入力)")}</span></div>`);
    if (task.status === "deferred" || task.status === "discarded") {
      lines.push(`<div class="task-content-row result-report-content-row"><span class="task-content-label">メモ：</span><span class="task-content-text">${escapeHtml(task.memo || "(未入力)")}</span></div>`);
    }
    lines.push('</div>');
  });

  return `<div class="result-report-lines">${lines.join("")}</div>`;
}

function hasLargeActualGap(task) {
  const plannedMinutes = sanitizeMinutes(task?.plannedMinutes);
  const actualMinutes = secondsToMinutes(task?.actualSeconds);
  if (!plannedMinutes || !actualMinutes) return false;
  return actualMinutes >= plannedMinutes * 2 && actualMinutes - plannedMinutes >= 30;
}

function getTasksWithLargeActualGap() {
  return getTasksForDate(state.dateKey).filter((task) => hasLargeActualGap(task));
}

function confirmLargeActualGapBeforeSend() {
  if (getTasksWithLargeActualGap().length === 0) return true;
  return window.confirm([
    "予定と実績の差が大きいタスクがあります。",
    "",
    "実績に誤りがないか確認してから送信してください。"
  ].join("\n"));
}

function renderDepartureCheck() {
  if (!hasPendingDepartureCheck()) {
    state.phase = "home";
    saveState();
    return renderHome();
  }

  normalizeDepartureCheckQueue();
  const departureDisplayDateKey = getCurrentHomeDateKey();
  const belongingsSummary = getBelongingsSummaryForDate(departureDisplayDateKey);
  const queue = Array.isArray(state.departureCheck.remainingIndices) ? state.departureCheck.remainingIndices : [];
  const done = recomputeDepartureCheckCompletion(belongingsSummary.mergedItems);

  if (done) {
    state.departureCheck.lastAutoPromptAt = 0;
    state.phase = "home";
    saveState();
    return renderHome();
  }

  const currentIndex = queue[0];
  const checklistCardHtml = typeof currentIndex === "number"
    ? `
    <div class="task-card checklist-card">
      <p>${currentIndex + 1}. ${DEPARTURE_CHECK_ITEMS[currentIndex]}</p>
      <div class="btn-row split compact-stack">
        <button id="confirmDepartureItemBtn" class="btn-main" type="button">確認した</button>
        <button id="stillDepartureItemBtn" class="btn-quiet" type="button">まだ</button>
      </div>
    </div>
    `
    : `
    <div class="task-card checklist-card">
      <p>固定チェック項目は完了です。持ち物チェックを完了してください。</p>
    </div>
    `;

  const progressRows = DEPARTURE_CHECK_ITEMS.map((item, itemIndex) => {
    const status = Array.isArray(state.departureCheck.completedIndices) && state.departureCheck.completedIndices.includes(itemIndex) ? "済" : "未";
    return `<li>${item} <span class="status-chip">${status}</span></li>`;
  }).join("");
  const belongingsRows = renderDepartureBelongingsChecklist([
    ...belongingsSummary.autoItems.map((item) => item.name),
    ...belongingsSummary.manualItems
  ]);
  renderScreen(`
    <h2>出発前チェック</h2>
    <div class="task-card">
      <p>📅 今日の予定</p>
      <p>出発 ${formatTimeForDisplay(state.planTimes.departure)}</p>
      <p>帰宅 ${formatTimeForDisplay(state.planTimes.returnHome)}</p>
    </div>
    <div class="task-card">
      <p>🎒 今日の持ち物</p>
      <ul class="confirm-list">${belongingsRows}</ul>
    </div>
    ${checklistCardHtml}
    <div class="task-card">
      <p class="helper">確認状況</p>
      <ul class="confirm-list">${progressRows}</ul>
    </div>
    <div class="btn-row compact-stack">
      <button id="backHomeFromDepartureBtn" class="btn-quiet" type="button">ホームへ戻る</button>
    </div>
  `);

  if (typeof currentIndex === "number") {
    document.getElementById("confirmDepartureItemBtn").addEventListener("click", () => {
      markDepartureItemDone(currentIndex);
      saveState();
      renderDepartureCheck();
    });
    document.getElementById("stillDepartureItemBtn").addEventListener("click", () => {
      rotateDepartureItem(currentIndex);
      saveState();
      renderDepartureCheck();
    });
  }
  document.querySelectorAll("input[data-belonging-check]").forEach((input) => {
    input.addEventListener("change", () => {
      const name = decodeURIComponent(String(input.dataset.belongingCheck || ""));
      if (!name) return;
      state.departureCheck.belongingChecked[name] = Boolean(input.checked);
      recomputeDepartureCheckCompletion(belongingsSummary.mergedItems);
      saveState();
      if (state.departureCheck.done) {
        renderDepartureCheck();
      }
    });
  });
  document.getElementById("backHomeFromDepartureBtn").addEventListener("click", goHome);
}

function normalizeDepartureCheckState(raw) {
  const base = { ...createDepartureCheckState(), ...(raw || {}) };
  if (Array.isArray(raw?.remainingIndices)) {
    base.remainingIndices = raw.remainingIndices
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < DEPARTURE_CHECK_ITEMS.length);

    const hasCompleted = Array.isArray(raw?.completedIndices) && raw.completedIndices.length > 0;
    const isMarkedDone = Boolean(raw?.done);
    const looksLikeFreshUninitialized = base.remainingIndices.length === 0 && !hasCompleted && !isMarkedDone;
    if (looksLikeFreshUninitialized) {
      base.remainingIndices = Array.from({ length: DEPARTURE_CHECK_ITEMS.length }, (_, i) => i);
    }
  } else if (typeof raw?.index === "number") {
    const idx = Math.max(0, Math.min(DEPARTURE_CHECK_ITEMS.length, Math.floor(base.index)));
    base.completedIndices = Array.isArray(raw?.completedIndices) && raw.completedIndices.length > 0
      ? raw.completedIndices
      : Array.from({ length: idx }, (_, i) => i);
    base.remainingIndices = Array.from({ length: DEPARTURE_CHECK_ITEMS.length - idx }, (_, i) => i + idx);
  } else {
    base.remainingIndices = Array.from({ length: DEPARTURE_CHECK_ITEMS.length }, (_, i) => i);
  }

  base.completedIndices = Array.isArray(base.completedIndices)
    ? Array.from(new Set(base.completedIndices.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < DEPARTURE_CHECK_ITEMS.length)))
    : [];

  // Keep progress status consistent: any item still in the queue must be treated as pending.
  const remainingSet = new Set(base.remainingIndices);
  base.completedIndices = base.completedIndices.filter((idx) => !remainingSet.has(idx));
  base.activatedOnce = Boolean(base.activatedOnce);
  base.belongingChecked = base.belongingChecked && typeof base.belongingChecked === "object" ? { ...base.belongingChecked } : {};
  base.lastAutoPromptAt = typeof base.lastAutoPromptAt === "number" ? base.lastAutoPromptAt : 0;
  base.done = Boolean(base.done) && base.remainingIndices.length === 0;
  base.completedAtMs = Number.isFinite(Number(base.completedAtMs)) ? Math.max(0, Number(base.completedAtMs)) : 0;
  base.completedAtTimeLabel = base.done ? String(base.completedAtTimeLabel || "") : "";
  delete base.index;
  return base;
}

function hasDepartureCheckActivated() {
  return Boolean(state?.departureCheck?.activatedOnce);
}

function renderPlanningAutoBelongings(autoItems) {
  if (!Array.isArray(autoItems) || autoItems.length === 0) {
    return "<li>自動取得はありません。</li>";
  }
  return autoItems
    .map((item) => `<li>${escapeHtml(item.name)}${item.tagText ? `（${escapeHtml(item.tagText)}）` : ""}</li>`)
    .join("");
}

function renderPlanningManualBelongings(manualItems) {
  if (!Array.isArray(manualItems) || manualItems.length === 0) {
    return "<li>追加はありません。</li>";
  }
  return manualItems
    .map((name) => `<li>${escapeHtml(name)} <button type=\"button\" class=\"btn-mini btn-danger\" data-daily-belonging-name=\"${encodeURIComponent(name)}\">削除</button></li>`)
    .join("");
}

function addDailySpecialBelonging(dateKey, name) {
  const key = String(dateKey || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
  const current = normalizeBelongingsList(state.dailySpecialBelongingsByDate[key] || []);
  if (!current.includes(name)) current.push(name);
  state.dailySpecialBelongingsByDate[key] = current;
}

function removeDailySpecialBelonging(dateKey, name) {
  const key = String(dateKey || "");
  if (!state.dailySpecialBelongingsByDate[key]) return;
  state.dailySpecialBelongingsByDate[key] = normalizeBelongingsList(state.dailySpecialBelongingsByDate[key]).filter((item) => item !== name);
  if (state.dailySpecialBelongingsByDate[key].length === 0) {
    delete state.dailySpecialBelongingsByDate[key];
  }
}

function getBelongingsSummaryForDate(dateKey) {
  const autoMap = new Map();
  const addAuto = (name, tag) => {
    const normalizedName = normalizeBelongingName(name);
    if (!normalizedName) return;
    const key = normalizedName.toLowerCase();
    const current = autoMap.get(key) || { name: normalizedName, tags: new Set() };
    if (tag) current.tags.add(tag);
    autoMap.set(key, current);
  };

  const dueHomework = state.homeworkTasks.filter((item) => item.deadlineDate === dateKey);
  dueHomework.forEach((item) => addAuto(item.name, "提出"));

  const weekdayKey = getWeekdayKeyByDateKey(dateKey);
  state.recurringPlans
    .filter((plan) => isRecurringPlanForWeekday(plan, weekdayKey))
    .forEach((plan) => {
      normalizeBelongingsList(plan.belongings).forEach((name) => addAuto(name, plan.name));
    });

  const autoItems = Array.from(autoMap.values()).map((item) => ({
    name: item.name,
    tagText: Array.from(item.tags).join("・")
  }));

  const autoNameSet = new Set(autoItems.map((item) => item.name.toLowerCase()));
  const manualRaw = normalizeBelongingsList(state.dailySpecialBelongingsByDate?.[dateKey] || []);
  const manualItems = manualRaw.filter((name) => !autoNameSet.has(name.toLowerCase()));
  const mergedItems = Array.from(new Set([...autoItems.map((item) => item.name), ...manualItems]));
  return { autoItems, manualItems, mergedItems };
}

function renderDepartureBelongingsChecklist(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "<li>持ち物はありません。</li>";
  }
  const checkedMap = state.departureCheck.belongingChecked || {};
  return items
    .map((name) => {
      const checked = checkedMap[name] ? "checked" : "";
      return `<li><label><input type=\"checkbox\" data-belonging-check=\"${encodeURIComponent(name)}\" ${checked} /> ${escapeHtml(name)}</label></li>`;
    })
    .join("");
}

function normalizeDepartureCheckQueue() {
  state.departureCheck = normalizeDepartureCheckState(state.departureCheck);
}

function areDepartureBelongingsComplete(items) {
  if (!Array.isArray(items) || items.length === 0) return true;
  const checkedMap = state.departureCheck.belongingChecked || {};
  return items.every((name) => Boolean(checkedMap[name]));
}

function recomputeDepartureCheckCompletion(belongingsItems = null) {
  const wasDone = Boolean(state.departureCheck.done);
  const queue = Array.isArray(state.departureCheck.remainingIndices) ? state.departureCheck.remainingIndices : [];
  const fixedDone = queue.length === 0;
  const resolvedBelongings = Array.isArray(belongingsItems)
    ? belongingsItems
    : getBelongingsSummaryForDate(state.dateKey).mergedItems;
  const belongingsDone = areDepartureBelongingsComplete(resolvedBelongings);
  state.departureCheck.done = fixedDone && belongingsDone;
  if (!wasDone && state.departureCheck.done) {
    const departureCompletedEvent = appendHistoryEvent({
      category: "check",
      type: HISTORY_EVENT_TYPE_CHECK_DEPARTURE_COMPLETED
    });
    state.departureCheck.completedAtMs = Number(departureCompletedEvent?.occurredAtMs || 0);
    state.departureCheck.completedAtTimeLabel = String(departureCompletedEvent?.timeLabel || "");
  }
  if (state.departureCheck.done) {
    state.departureCheck.lastAutoPromptAt = 0;
  }
  return state.departureCheck.done;
}

function markDepartureItemDone(itemIndex) {
  normalizeDepartureCheckQueue();
  const queue = state.departureCheck.remainingIndices || [];
  const current = queue[0];
  if (typeof current !== "number") {
    recomputeDepartureCheckCompletion();
    return;
  }
  if (!state.departureCheck.completedIndices.includes(current)) {
    state.departureCheck.completedIndices.push(current);
  }
  state.departureCheck.remainingIndices = queue.slice(1);
  recomputeDepartureCheckCompletion();
}

function rotateDepartureItem(itemIndex) {
  normalizeDepartureCheckQueue();
  const queue = state.departureCheck.remainingIndices || [];
  const current = queue[0];
  if (typeof current !== "number") return;
  if (queue.length <= 1) return;
  state.departureCheck.remainingIndices = [...queue.slice(1), current];
}

function isAnyDepartureCheckIncomplete() {
  return hasPendingDepartureCheck();
}

function hasPendingDepartureCheck() {
  normalizeDepartureCheckQueue();
  recomputeDepartureCheckCompletion();
  return state.planTimes.departure !== "none" && !state.departureCheck.done;
}

function getDepartureTimingInfo() {
  if (!hasPendingDepartureCheck()) return null;
  const dt = getDateTimeToday(state.planTimes.departure);
  if (!dt) return null;
  const now = getNowInJst();
  const msUntil = dt.getTime() - now.getTime();
  const minutesUntil = Math.max(0, Math.ceil(msUntil / 60000));
  return { msUntil, minutesUntil, departureAt: dt, now };
}

function getDepartureReminderForHome() {
  const info = getDepartureTimingInfo();
  if (!info) return null;
  if (info.msUntil > 60 * 60000) return null;
  if (info.msUntil <= 15 * 60000) return null;
  return { minutesLeft: info.minutesUntil };
}

function shouldAutoPromptDepartureCheck() {
  const info = getDepartureTimingInfo();
  if (!info) return false;
  if (info.msUntil > 15 * 60000) return false;

  const nowMs = info.now.getTime();
  const lastMs = Number(state.departureCheck.lastAutoPromptAt || 0);
  if (!lastMs) return true;
  return nowMs - lastMs >= 3 * 60 * 1000;
}

function getDateTimeToday(hhmm) {
  if (hhmm === "none") return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const now = getNowInJst();
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(now);
  dt.setHours(h, m, 0, 0);
  return dt;
}

function renderScreen(content) {
  if (state.phase !== "home") {
    if (todayLabel) todayLabel.textContent = `本日：${getTodayDisplayJst()}`;
    if (syncHeaderLabel) syncHeaderLabel.textContent = "";
    if (headerHomeActions) headerHomeActions.innerHTML = "";
  }
  app.innerHTML = `${renderTopNav()}${renderUiNotice()}${content}`;
  bindTopNav();
  renderReturnCheckReminderOverlay();
  renderSubmissionChecklistOverlay();
  renderMedicineReminderOverlay();
}

function renderTopNav() {
  if (state.phase === "home") return "";
  const isPlanReport = state.phase === "planReport";
  const primaryLabel = isPlanReport ? "戻る" : "ホーム";
  return `
    <div class="top-nav">
      <button id="homeBtn" class="btn-mini btn-quiet" type="button" ${getBusyDisabledAttr()}>${primaryLabel}</button>
    </div>
  `;
}

function bindTopNav() {
  const homeBtn = document.getElementById("homeBtn");
  if (state.phase === "planReport") {
    homeBtn?.addEventListener("click", goBack);
  } else {
    homeBtn?.addEventListener("click", goHome);
  }
}

function bindTextAction(id, onActivate) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", onActivate);
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onActivate();
  });
}

async function performLogout() {
  try {
    await signOut(auth);
  } catch (_) {
    alert("ログアウトに失敗しました。通信状態を確認して再試行してください。");
  }
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
  if (next === "execution" || next === "homeworkList" || next === "completionHistory") {
    const availability = getHomeActionAvailability();
    if (next === "execution" && !availability.canOpenExecution) return;
    if (next === "homeworkList" && !availability.canOpenHomework) return;
    if (next === "completionHistory" && !availability.canOpenCompletionHistory) return;
  }
  if (pushHistory && state.phase !== next) state.navHistory.push(state.phase);
  if (state.phase !== next && next === "execution") {
    state.executionTaskListExpanded = false;
  }
  if (next === "departureCheck") {
    state.departureCheck.activatedOnce = true;
  }
  if (state.phase !== next) {
    removeSubmissionChecklistOverlay();
  }
  state.phase = next;
  if (next !== "home") state.homeReturnPhase = next;
  saveState();
  render();
}

function applyRecurringPlansForSelectedDateIfNeeded() {
  const targetDateKey = getPlanningTargetDateKey();
  if (!targetDateKey) return;
  if (!state.recurringPlansAppliedByDate || typeof state.recurringPlansAppliedByDate !== "object") {
    state.recurringPlansAppliedByDate = {};
  }
  if (state.recurringPlansAppliedByDate[targetDateKey] === true) {
    // Recovery for stale synced flags: if no tasks exist at all, allow rebuilding recurring tasks once.
    if (Array.isArray(state.tasks) && state.tasks.length === 0) {
      delete state.recurringPlansAppliedByDate[targetDateKey];
    } else {
      return;
    }
  }

  const weekdayKey = getWeekdayKeyByDateKey(targetDateKey);
  const applicable = state.recurringPlans.filter((plan) => isRecurringPlanForWeekday(plan, weekdayKey));
  const existingPairs = new Set(
    state.tasks
      .map((task) => {
        const planId = String(task?.recurringPlanId || "");
        const dateKey = String(task?.recurringDateKey || "");
        if (!planId || !dateKey) return "";
        return `${dateKey}::${planId}`;
      })
      .filter(Boolean)
  );
  applicable.forEach((plan) => {
    const pairKey = `${targetDateKey}::${plan.id}`;
    if (existingPairs.has(pairKey)) return;
    state.tasks.push(createTask(plan.name, plan.plannedMinutes, plan.content, {
      recurringPlanId: plan.id,
        recurringDateKey: targetDateKey,
        submissionTemplateId: plan.submissionTemplateId
    }));
    existingPairs.add(pairKey);
  });

  state.recurringPlansAppliedByDate[targetDateKey] = true;
  state.recurringSyncDateKey = targetDateKey;
}

function isRecurringPlanForWeekday(plan, weekdayKey) {
  if (!plan) return false;
  if (plan.repeatType === "daily") return true;
  if (!Array.isArray(plan.days)) return false;
  return plan.days.includes(weekdayKey);
}

function getSortedPendingHomeworkTasks() {
  return state.homeworkTasks
    .filter((item) => !item.done)
    .slice()
    .sort((a, b) => {
      if (a.deadlineDate === b.deadlineDate) return a.name.localeCompare(b.name, "ja");
      return a.deadlineDate.localeCompare(b.deadlineDate);
    });
}

function getHomeworkPendingCount() {
  return state.homeworkTasks.filter((item) => !item.done).length;
}

function getDateKeyDayNumber(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

function getHomeworkRemainingDaysLabel(dateKey, baseDateKey = getCurrentHomeDateKey()) {
  const dueDayNumber = getDateKeyDayNumber(dateKey);
  const baseDayNumber = getDateKeyDayNumber(baseDateKey) ?? getDateKeyDayNumber(getTodayKeyJst());
  if (dueDayNumber === null || baseDayNumber === null) return "";
  const diffDays = dueDayNumber - baseDayNumber;
  if (diffDays > 0) return `提出まであと${diffDays}日`;
  if (diffDays === 0) return "今日提出";
  return "提出期限超過";
}

function formatHomeworkDeadlineLabel(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "締切未設定";
  const weekdayKey = getWeekdayKeyByDateKey(dateKey);
  const weekdayLabel = RECURRING_DAY_LABELS[weekdayKey] || "";
  return `${Number(m[2])}/${Number(m[3])}（${weekdayLabel}）締切`;
}

function getHomeworkDeadlineDisplayParts(dateKey) {
  return {
    deadlineLabel: formatHomeworkDeadlineLabel(dateKey),
    remainingLabel: getHomeworkRemainingDaysLabel(dateKey)
  };
}

function formatHomeworkDeadlineWithRemainingLabel(dateKey) {
  const { deadlineLabel, remainingLabel } = getHomeworkDeadlineDisplayParts(dateKey);
  return remainingLabel ? `${deadlineLabel}　${remainingLabel}` : deadlineLabel;
}

function renderHomeHomeworkSummary(pendingHomework) {
  if (!Array.isArray(pendingHomework) || pendingHomework.length === 0) return "";
  const itemsHtml = pendingHomework.map((item) => {
    const deadlineInfo = getHomeworkDeadlineDisplayParts(item.deadlineDate);
    return `
    <p class="homework-summary-line"><span class="homework-summary-name">${escapeHtml(item.name)}</span><span class="homework-summary-meta"><span>${escapeHtml(deadlineInfo.deadlineLabel)}</span>${deadlineInfo.remainingLabel ? `<span class="homework-remaining-label">${escapeHtml(deadlineInfo.remainingLabel)}</span>` : ""}</span></p>
  `;
  }).join("");
  return `
    <div class="summary home-homework-summary">
      <p>宿題・課題</p>
      ${itemsHtml}
    </div>
  `;
}

function formatMedicineDoseSummaryRow(label, dose) {
  if (dose?.done && dose?.doneAt) return `${label}：完了（${dose.doneAt}）`;
  if (dose?.done) return `${label}：完了`;
  return `${label}：未完了`;
}

function renderHomeMedicineSummary() {
  const reminder = normalizeMedicineReminderState(state.medicineReminder, state.dateKey);
  const allDone = isMedicineDoneAll(reminder);
  const statusLabel = allDone ? "今日は完了" : "未完了";
  const cardRoleAttr = allDone
    ? ""
    : 'role="button" tabindex="0" id="openMedicineReminderCard" aria-label="今日の薬確認を開く"';
  return `
    <div class="summary home-medicine-summary ${allDone ? "is-done" : "is-pending"}" ${cardRoleAttr}>
      <p class="home-medicine-title">💊 今日の薬（18:00開始）</p>
      <p class="home-medicine-status">${escapeHtml(statusLabel)}</p>
      <p class="home-medicine-line">${escapeHtml(formatMedicineDoseSummaryRow("青の薬", reminder.blue))}</p>
      <p class="home-medicine-line">${escapeHtml(formatMedicineDoseSummaryRow("赤の薬", reminder.red))}</p>
      ${allDone ? "" : `<div class="btn-row compact-stack"><button id="openMedicineReminderBtn" class="btn-sub" type="button">確認する</button></div>`}
    </div>
  `;
}

function buildDateKeyFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatPlanningDateChoice(dateKey, suffixText) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return suffixText;
  const weekdayKey = getWeekdayKeyByDateKey(dateKey);
  const weekdayLabel = RECURRING_DAY_LABELS[weekdayKey] || "";
  return `${Number(m[2])}/${Number(m[3])}（${weekdayLabel}） ${suffixText}`;
}

function getPlanningDateChoices() {
  const base = getNowInJst();
  const todayDate = new Date(base);
  const tomorrowDate = new Date(base);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const todayDateKey = buildDateKeyFromDate(todayDate);
  const tomorrowDateKey = buildDateKeyFromDate(tomorrowDate);
  return {
    todayDateKey,
    tomorrowDateKey,
    todayLabel: formatPlanningDateChoice(todayDateKey, "今日"),
    tomorrowLabel: formatPlanningDateChoice(tomorrowDateKey, "明日")
  };
}

function addRecurringPlansToDate(dateKey, planIds = []) {
  const selectedDateKey = normalizeTaskDateKey(dateKey);
  if (!selectedDateKey) return { added: 0, skipped: 0 };
  const targetPlans = state.recurringPlans.filter((plan) => planIds.includes(plan.id));
  const existingPairs = new Set(
    getTasksForDate(selectedDateKey)
      .map((task) => {
        const planId = String(task?.recurringPlanId || "");
        if (!planId) return "";
        return `${selectedDateKey}::${planId}`;
      })
      .filter(Boolean)
  );
  let added = 0;
  let skipped = 0;
  targetPlans.forEach((plan) => {
    const pairKey = `${selectedDateKey}::${plan.id}`;
    if (existingPairs.has(pairKey)) {
      skipped += 1;
      return;
    }
    state.tasks.push(createTask(plan.name, plan.plannedMinutes, plan.content, {
      recurringPlanId: plan.id,
      recurringDateKey: selectedDateKey,
      targetDateKey: selectedDateKey,
      submissionTemplateId: plan.submissionTemplateId
    }));
    existingPairs.add(pairKey);
    added += 1;
  });
  return { added, skipped };
}

function getPlanningTargetDateKey() {
  const choices = getPlanningDateChoices();
  return state.planFor === "tomorrow" ? choices.tomorrowDateKey : choices.todayDateKey;
}

function getWeekdayKeyByDateKey(dateKey) {
  const m = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "sun";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return keys[dt.getDay()] || "sun";
}

function findTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function getPlanningFormTaskName() {
  const direct = String(state.planningForm.taskName || "").trim();
  if (direct) return direct;
  if (state.planningForm.taskNameChoice === TASK_NAME_NEW) return String(state.planningForm.customTaskName || "").trim();
  return String(state.planningForm.taskNameChoice || "").trim();
}

function getPlanningFormMinutes() {
  return sanitizeMinutes(state.planningForm.customMinutes || state.planningForm.minutesChoice);
}

function getSortedTaskNameOptions() {
  return [...state.taskNameStats]
    .sort((a, b) => {
      if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
      return a.name.localeCompare(b.name, "ja");
    })
    .slice(0, 10);
}

function updateTotalPlanned(tasks = getPlanningVisibleTasks()) {
  const totalEl = document.getElementById("totalPlanned");
  if (!totalEl) return;
  totalEl.textContent = `学習予定時間の合計 ${formatStudyTotalDuration(sumPlanned(tasks))}`;
}

function getCounts(tasks = state.tasks) {
  const source = Array.isArray(tasks) ? tasks : [];
  const done = source.filter((t) => t.status === "done").length;
  return { total: source.length, done, unfinished: source.length - done };
}

function sumPlanned(tasks = state.tasks) {
  const source = Array.isArray(tasks) ? tasks : [];
  return source.reduce((sum, t) => sum + sanitizeMinutes(t.plannedMinutes), 0);
}

function sumActualMinutes(tasks = state.tasks) {
  const source = Array.isArray(tasks) ? tasks : [];
  return source.reduce((sum, t) => sum + secondsToMinutes(t.actualSeconds), 0);
}

function secondsToMinutes(sec) {
  if (typeof sec !== "number" || sec <= 0) return 0;
  return Math.ceil(sec / 60);
}

function formatMinutesAsHourMinute(minutes) {
  const total = sanitizeMinutesOrZero(minutes);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour}時間${minute}分`;
}

function formatStudyTotalDuration(minutes) {
  const total = sanitizeMinutesOrZero(minutes);
  if (total > 60) return formatMinutesAsHourMinute(total);
  return `${total}分`;
}

function toCircledNumber(n) {
  const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  if (n >= 1 && n <= circled.length) return circled[n - 1];
  return `${n}`;
}

function splitReportContent(text, chunkSize) {
  const source = String(text || "").trim();
  if (!source) return ["(未入力)"];
  const out = [];
  const minTail = Math.max(8, Math.floor(chunkSize * 0.4));
  for (let i = 0; i < source.length;) {
    const remaining = source.length - i;
    if (remaining <= chunkSize) {
      out.push(source.slice(i));
      break;
    }

    let take = chunkSize;
    if (remaining - chunkSize < minTail) {
      // Avoid a tiny trailing line by balancing the current/next lines.
      take = Math.ceil(remaining / 2);
    }

    out.push(source.slice(i, i + take));
    i += take;
  }
  return out;
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
  if (value === "none") return "なし";
  if (!value) return "--:--";
  const [h, m] = value.split(":");
  return `${Number(h)}:${m}`;
}

function renderHourOptions(selected) {
  const h = Number.isFinite(selected) ? selected : 7;
  return Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === h ? "selected" : ""}>${String(i).padStart(2, "0")}</option>`).join("");
}

function renderMinute5Options(selected) {
  const m = Number.isFinite(selected) ? selected : 0;
  const list = [];
  for (let i = 0; i < 60; i += 5) {
    list.push(`<option value="${i}" ${i === m ? "selected" : ""}>${String(i).padStart(2, "0")}</option>`);
  }
  return list.join("");
}

function getTimeParts(value, fallback) {
  const base = /^\d{2}:\d{2}$/.test(value) ? value : fallback;
  const [h, m] = base.split(":").map(Number);
  const minute = Math.floor(m / 5) * 5;
  return { hour: h, minute };
}

function formatHHMM(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getTaskStatusLabel(status) {
  if (status === "done") return "完了";
  if (status === "deferred") return "明日に回す";
  if (status === "discarded") return "不要になった";
  return "未完了";
}

function getReportedTaskName(task) {
  const taskName = String(task?.name || task?.taskName || "").trim();
  return task?.recurringPlanId ? `★${taskName}` : taskName;
}

function clearTickTimer() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function ensurePhaseRefreshTimer() {
  if (phaseRefreshTimer) return;
  phaseRefreshTimer = setInterval(() => {
    if (!authReady || !currentUser || !syncReady) return;
    const promptStateChanged = syncReturnCheckReminderState();
    if (promptStateChanged) {
      saveState();
    }
    renderReturnCheckReminderOverlay();
    renderMedicineReminderOverlay();
    if (state.phase === "execution" && state.running.taskId && !state.running.isPaused) return;
    requestPassiveRender();
  }, 10000);
}

function clearPhaseRefreshTimer() {
  if (!phaseRefreshTimer) return;
  clearInterval(phaseRefreshTimer);
  phaseRefreshTimer = null;
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
