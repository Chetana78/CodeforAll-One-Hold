const UNDO_MS = 30000;

const LOW_ID = "evening";
const FIRST_ID = "morning";

const defaultMeds = () => [
  {
    id: "morning",
    name: "Morning tablet",
    dose: "1 tablet",
    time: "08:00",
    reason: "morning dose",
    status: "due",
    remaining: 18,
  },
  {
    id: "afternoon",
    name: "Afternoon tablet",
    dose: "1 tablet",
    time: "13:00",
    reason: "afternoon dose",
    status: "upcoming",
    remaining: 24,
  },
  {
    id: "evening",
    name: "Evening tablet",
    dose: "1 tablet",
    time: "21:00",
    reason: "evening dose",
    status: "low",
    remaining: 4,
  },
];

const els = {
  clock: document.getElementById("clock"),
  nextStatus: document.getElementById("nextStatus"),
  nextHeading: document.getElementById("nextHeading"),
  nextMeta: document.getElementById("nextMeta"),
  holdBtn: document.getElementById("holdBtn"),
  holdLabel: document.getElementById("holdLabel"),
  laterBtn: document.getElementById("laterBtn"),
  medList: document.getElementById("medList"),
  toast: document.getElementById("toast"),
  toastText: document.getElementById("toastText"),
  undoBtn: document.getElementById("undoBtn"),
  live: document.getElementById("live"),
  reminder: document.getElementById("reminder"),
  remindTitle: document.getElementById("remindTitle"),
  remindMeta: document.getElementById("remindMeta"),
  remindHold: document.getElementById("remindHold"),
  remindDismiss: document.getElementById("remindDismiss"),
  refillSheet: document.getElementById("refillSheet"),
  refillCopy: document.getElementById("refillCopy"),
  refillHold: document.getElementById("refillHold"),
  refillCancel: document.getElementById("refillCancel"),
  settings: document.getElementById("settings"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsClose: document.getElementById("settingsClose"),
  optLarge: document.getElementById("optLarge"),
  optContrast: document.getElementById("optContrast"),
  optReduced: document.getElementById("optReduced"),
  demoReminder: document.getElementById("demoReminder"),
  enableReminders: document.getElementById("enableReminders"),
  reminderStatus: document.getElementById("reminderStatus"),
  resetDemo: document.getElementById("resetDemo"),
  missedCount: document.getElementById("missedCount"),
};

let meds = loadMeds();
let activeId = meds.find((m) => m.status === "due")?.id || meds[0].id;
let lastAction = null;
let undoTimer = null;
let reminderTimers = [];
const notifiedKeys = new Set(JSON.parse(sessionStorage.getItem("onetap-notified") || "[]"));

function loadMeds() {
  try {
    const raw = localStorage.getItem("onetap-meds-v1");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultMeds();
}

function saveMeds() {
  localStorage.setItem("onetap-meds-v1", JSON.stringify(meds));
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

function defaultMissed() {
  return [
    {
      key: `morning-${dayKey(daysAgo(2))}`,
      id: "morning",
      name: "Morning tablet",
      time: "08:00",
      day: dayKey(daysAgo(2)),
      reason: "not taken",
    },
    {
      key: `afternoon-${dayKey(daysAgo(1))}`,
      id: "afternoon",
      name: "Afternoon tablet",
      time: "13:00",
      day: dayKey(daysAgo(1)),
      reason: "skipped",
    },
  ];
}

function loadMissed() {
  try {
    const raw = localStorage.getItem("onetap-missed-v1");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultMissed();
}

function saveMissed() {
  localStorage.setItem("onetap-missed-v1", JSON.stringify(missed));
}

let missed = loadMissed();

function addMissed(med, reason, day = dayKey()) {
  const key = `${med.id}-${day}`;
  if (missed.some((item) => item.key === key)) return key;
  missed.unshift({
    key,
    id: med.id,
    name: med.name,
    time: med.time,
    day,
    reason,
  });
  saveMissed();
  return key;
}

function removeMissedKey(key) {
  missed = missed.filter((item) => item.key !== key);
  saveMissed();
}

function checkOverdueMisses() {
  const now = Date.now();
  meds.forEach((med) => {
    if (med.status === "taken" || med.status === "skipped") return;
    const dueAt = doseTimeToday(med.time).getTime();
    if (now > dueAt + 60 * 60 * 1000) {
      addMissed(med, "not taken");
    }
  });
}

function announce(text) {
  els.live.textContent = "";
  requestAnimationFrame(() => {
    els.live.textContent = text;
  });
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function activeMed() {
  return meds.find((m) => m.id === activeId) || meds[0];
}

function statusLabel(status) {
  if (status === "due") return "Due now";
  if (status === "taken") return "Taken";
  if (status === "skipped") return "Skipped";
  if (status === "low") return "Tonight · running low";
  return "Upcoming";
}

function renderClock() {
  const now = new Date();
  els.clock.textContent = now.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderNext() {
  const med = activeMed();
  els.nextStatus.textContent = statusLabel(med.status);
  els.nextHeading.textContent = med.name;
  els.nextMeta.textContent = `${med.dose} · ${med.time} · ${med.reason}`;
  const canTake = med.status === "due" || med.status === "upcoming" || med.status === "low";
  els.holdBtn.disabled = !canTake;
  els.holdLabel.textContent = canTake ? "Take dose" : med.status === "taken" ? "Already taken" : "Already skipped";
}

function renderList() {
  els.medList.innerHTML = "";
  meds.forEach((med) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "med-row";
    if (med.id === activeId) btn.setAttribute("aria-current", "true");
    const left = document.createElement("div");
    left.innerHTML = `<strong>${med.name}</strong><span>${med.dose} · ${med.time}</span>`;
    const badge = document.createElement("span");
    badge.className = `badge ${med.status === "taken" ? "done" : med.status === "low" ? "low" : med.status === "due" ? "due" : ""}`;
    badge.textContent =
      med.status === "taken"
        ? "Taken"
        : med.status === "skipped"
          ? "Skipped"
          : med.status === "low"
            ? "Low · refill"
            : med.status === "due"
              ? "Due"
              : "Later";
    btn.append(left, badge);
    btn.addEventListener("click", () => {
      if (med.status === "low" && med.id === LOW_ID) {
        activeId = med.id;
        renderNext();
        if (els.refillCopy) {
          els.refillCopy.textContent = `${med.name} is running low. One control sends a simulated refill request.`;
        }
        openOverlay(els.refillSheet);
        announce(`Refill sheet opened for ${med.name}.`);
        return;
      }
      activeId = med.id;
      renderNext();
      announce(`${med.name} selected.`);
    });
    li.append(btn);
    els.medList.append(li);
  });
}

function renderMissed() {
  if (!els.missedCount) return;
  const n = missed.length;
  els.missedCount.textContent = n === 1 ? "Missed 1 time" : `Missed ${n} times`;
}

function render() {
  renderClock();
  renderNext();
  renderList();
  renderMissed();
}

function showToast(text) {
  els.toast.hidden = false;
  els.toastText.textContent = text;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    els.toast.hidden = true;
    lastAction = null;
  }, UNDO_MS);
}

function takeDose(source) {
  const med = activeMed();
  if (med.status === "taken" || med.status === "skipped") return;
  lastAction = { type: "take", id: med.id, prev: med.status };
  med.status = "taken";
  markNotified(med);
  removeMissedKey(`${med.id}-${dayKey()}`);
  saveMeds();
  render();
  scheduleReminders();
  const msg = `${med.name} marked as taken. Undo available for 30 seconds.`;
  showToast(`${med.name} taken.`);
  announce(msg);
  speak(`${med.name} taken.`);
  vibrate(40);
  closeOverlay(els.reminder);
}

function takeLater() {
  const med = activeMed();
  if (med.status === "taken" || med.status === "skipped") return;
  markNotified(med);
  closeOverlay(els.reminder);
  reminderTimers.push(
    setTimeout(() => {
      notifiedKeys.delete(reminderKey(med));
      fireScheduledReminder(med);
    }, 15 * 60 * 1000)
  );
  showToast("We'll remind you later.");
  announce(`${med.name} saved for later. One Tap will remind you again.`);
  speak("Okay. We'll remind you later.");
}

function requestRefill() {
  const med = meds.find((m) => m.id === LOW_ID);
  lastAction = { type: "refill", remaining: med.remaining };
  med.remaining = 30;
  med.status = med.status === "low" ? "upcoming" : med.status;
  saveMeds();
  render();
  closeOverlay(els.refillSheet);
  showToast("Refill requested.");
  announce("Refill requested from the pharmacy. Undo available.");
  speak("Refill requested.");
  vibrate([30, 40, 30]);
}

function undo() {
  if (!lastAction) return;
  if (lastAction.type === "take" || lastAction.type === "skip") {
    const med = meds.find((m) => m.id === lastAction.id);
    if (med) med.status = lastAction.prev;
    activeId = lastAction.id;
    if (lastAction.type === "skip" && lastAction.missKey) removeMissedKey(lastAction.missKey);
  }
  if (lastAction.type === "refill") {
    const med = meds.find((m) => m.id === LOW_ID);
    med.remaining = lastAction.remaining;
    med.status = "low";
  }
  lastAction = null;
  els.toast.hidden = true;
  saveMeds();
  render();
  announce("Undone.");
  speak("Undone.");
}

function bindPress(button, onComplete) {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    onComplete();
  });
}

function openOverlay(el) {
  el.hidden = false;
  const first = el.querySelector("button");
  if (first) first.focus();
}

function closeOverlay(el) {
  el.hidden = true;
}

function applySettings() {
  document.documentElement.classList.toggle("large-targets", els.optLarge.checked);
  document.documentElement.classList.toggle("max-contrast", els.optContrast.checked);
  document.documentElement.classList.toggle("reduce-motion", els.optReduced.checked);
  localStorage.setItem(
    "onetap-settings",
    JSON.stringify({
      large: els.optLarge.checked,
      contrast: els.optContrast.checked,
      reduced: els.optReduced.checked,
    })
  );
}

function restoreSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("onetap-settings") || "{}");
    els.optLarge.checked = s.large !== false;
    els.optContrast.checked = !!s.contrast;
    els.optReduced.checked = !!s.reduced;
    applySettings();
  } catch {
    /* ignore */
  }
}

els.laterBtn.addEventListener("click", takeLater);
els.remindDismiss.addEventListener("click", takeLater);
els.refillCancel.addEventListener("click", () => closeOverlay(els.refillSheet));
els.undoBtn.addEventListener("click", undo);
els.settingsBtn.addEventListener("click", () => openOverlay(els.settings));
els.settingsClose.addEventListener("click", () => {
  closeOverlay(els.settings);
  els.settingsBtn.focus();
});
els.enableReminders.addEventListener("click", () => {
  enablePhoneReminders();
});
els.demoReminder.addEventListener("click", () => {
  closeOverlay(els.settings);
  const med = meds.find((item) => item.id === FIRST_ID);
  if (med.status === "taken") med.status = "due";
  saveMeds();
  render();
  sendPhoneNotification(med);
  openDoseReminder(med);
});
els.resetDemo.addEventListener("click", () => {
  meds = defaultMeds();
  missed = defaultMissed();
  activeId = FIRST_ID;
  lastAction = null;
  els.toast.hidden = true;
  saveMeds();
  saveMissed();
  render();
  announce("Demo reset. Morning tablet is due now.");
});
[els.optLarge, els.optContrast, els.optReduced].forEach((el) => {
  el.addEventListener("change", applySettings);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    [els.reminder, els.refillSheet, els.settings].forEach(closeOverlay);
  }
});

function reminderKey(med) {
  return `${med.id}-${new Date().toDateString()}-${med.time}`;
}

function markNotified(med) {
  notifiedKeys.add(reminderKey(med));
  sessionStorage.setItem("onetap-notified", JSON.stringify([...notifiedKeys]));
}

function doseTimeToday(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const when = new Date();
  when.setHours(hours, minutes, 0, 0);
  return when;
}

function updateReminderStatus() {
  if (!els.reminderStatus) return;
  if (!("Notification" in window)) {
    els.reminderStatus.textContent = "This browser cannot show phone notifications. Keep the page open for on-screen reminders.";
    return;
  }
  if (Notification.permission === "granted") {
    els.reminderStatus.textContent = "Phone reminders are on. One Tap will alert at each dose time (08:00, 13:00, 21:00).";
  } else if (Notification.permission === "denied") {
    els.reminderStatus.textContent = "Notifications are blocked. Allow them in the browser settings for this site.";
  } else {
    els.reminderStatus.textContent = "Tap Turn on phone reminders, then Allow, so a due dose can ping this device.";
  }
}

function openDoseReminder(med) {
  activeId = med.id;
  if (med.status === "taken" || med.status === "skipped") return;
  render();
  els.remindTitle.textContent = `Time for ${med.name}`;
  if (els.remindMeta) els.remindMeta.textContent = `${med.dose} · ${med.reason}`;
  openOverlay(els.reminder);
  announce(`Reminder. Time for ${med.name}. Tap take dose.`);
  speak(`Time for ${med.name}. Tap take dose.`);
  vibrate([40, 80, 40]);
}

function sendPhoneNotification(med) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const note = new Notification(`Time for ${med.name}`, {
      body: `${med.dose} at ${med.time}. One large tap to take it. No hold.`,
      tag: reminderKey(med),
      requireInteraction: true,
    });
    note.onclick = () => {
      window.focus();
      openDoseReminder(med);
      note.close();
    };
  } catch {
    /* ignore */
  }
}

function fireScheduledReminder(med) {
  if (med.status === "taken" || med.status === "skipped") return;
  const key = reminderKey(med);
  if (notifiedKeys.has(key)) return;
  markNotified(med);
  sendPhoneNotification(med);
  openDoseReminder(med);
}

function scheduleReminders() {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
  if (!("Notification" in window) || Notification.permission !== "granted") {
    updateReminderStatus();
    return;
  }
  const now = Date.now();
  meds.forEach((med) => {
    if (med.status === "taken" || med.status === "skipped") return;
    const dueAt = doseTimeToday(med.time).getTime();
    const delay = dueAt - now;
    if (delay > 0) {
      reminderTimers.push(setTimeout(() => fireScheduledReminder(med), delay));
    }
  });
  updateReminderStatus();
}

async function enablePhoneReminders() {
  if (!("Notification" in window)) {
    announce("Phone notifications are not available in this browser.");
    updateReminderStatus();
    return;
  }
  const permission = await Notification.requestPermission();
  updateReminderStatus();
  if (permission === "granted") {
    scheduleReminders();
    const dueNow = meds.find((item) => item.status === "due");
    if (dueNow) fireScheduledReminder(dueNow);
    announce("Phone reminders are on. You will get an alert at each dose time.");
    speak("Reminders are on.");
    showToast("Reminders on.");
  } else {
    announce("Reminders were not allowed. You can still use the on-screen Take dose button.");
  }
}

bindPress(els.holdBtn, () => takeDose("press"));
bindPress(els.remindHold, () => takeDose("press"));
bindPress(els.refillHold, requestRefill);

restoreSettings();
checkOverdueMisses();
render();
updateReminderStatus();
scheduleReminders();
setInterval(renderClock, 30000);
setInterval(scheduleReminders, 60000);
