const HOLD_DEFAULT = 1500;
const HOLD_TREMOR = 2500;
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
  holdFill: document.getElementById("holdFill"),
  holdLabel: document.getElementById("holdLabel"),
  skipBtn: document.getElementById("skipBtn"),
  voiceBtn: document.getElementById("voiceBtn"),
  medList: document.getElementById("medList"),
  toast: document.getElementById("toast"),
  toastText: document.getElementById("toastText"),
  undoBtn: document.getElementById("undoBtn"),
  live: document.getElementById("live"),
  skipSheet: document.getElementById("skipSheet"),
  reminder: document.getElementById("reminder"),
  remindTitle: document.getElementById("remindTitle"),
  remindMeta: document.getElementById("remindMeta"),
  remindHold: document.getElementById("remindHold"),
  remindFill: document.getElementById("remindFill"),
  remindDismiss: document.getElementById("remindDismiss"),
  refillSheet: document.getElementById("refillSheet"),
  refillCopy: document.getElementById("refillCopy"),
  refillHold: document.getElementById("refillHold"),
  refillFill: document.getElementById("refillFill"),
  refillCancel: document.getElementById("refillCancel"),
  settings: document.getElementById("settings"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsClose: document.getElementById("settingsClose"),
  optLarge: document.getElementById("optLarge"),
  optContrast: document.getElementById("optContrast"),
  optTremor: document.getElementById("optTremor"),
  optReduced: document.getElementById("optReduced"),
  demoReminder: document.getElementById("demoReminder"),
  resetDemo: document.getElementById("resetDemo"),
};

let meds = loadMeds();
let activeId = meds.find((m) => m.status === "due")?.id || meds[0].id;
let lastAction = null;
let undoTimer = null;
let holdTimer = null;
let holding = false;
let listening = false;
let recognition = null;

function loadMeds() {
  try {
    const raw = localStorage.getItem("onehold-meds-v2");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultMeds();
}

function saveMeds() {
  localStorage.setItem("onehold-meds-v2", JSON.stringify(meds));
}

function holdMs() {
  return document.documentElement.classList.contains("tremor")
    ? HOLD_TREMOR
    : HOLD_DEFAULT;
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
  els.holdLabel.textContent = canTake ? "Hold to take" : med.status === "taken" ? "Already taken" : "Already skipped";
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

function render() {
  renderClock();
  renderNext();
  renderList();
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
  saveMeds();
  render();
  const msg = `${med.name} marked as taken. Undo available for 30 seconds.`;
  showToast(`${med.name} taken.`);
  announce(msg);
  speak(`${med.name} taken.`);
  vibrate(40);
  closeOverlay(els.reminder);
  closeOverlay(els.skipSheet);
}

function skipDose(reason) {
  const med = activeMed();
  if (med.status === "taken") return;
  lastAction = { type: "skip", id: med.id, prev: med.status, reason };
  med.status = "skipped";
  saveMeds();
  render();
  const label = reason === "unwell" ? "felt unwell" : "not now";
  showToast(`${med.name} skipped.`);
  announce(`${med.name} skipped, ${label}. Undo available.`);
  speak(`${med.name} skipped.`);
  closeOverlay(els.skipSheet);
  closeOverlay(els.reminder);
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

function bindHold(button, fill, onComplete) {
  const start = (event) => {
    if (button.disabled) return;
    if (event.type === "keydown" && event.repeat) return;
    if (event.type === "keydown" && event.key !== " " && event.key !== "Enter") return;
    if (event.type === "keydown") event.preventDefault();
    if (event.pointerId != null && button.setPointerCapture) {
      button.setPointerCapture(event.pointerId);
    }
    holding = true;
    fill.style.width = "0%";
    fill.classList.remove("filling");
    void fill.offsetWidth;
    document.documentElement.style.setProperty("--hold", `${holdMs()}ms`);
    fill.classList.add("filling");
    fill.style.width = "100%";
    announce("Keep holding to confirm.");
    vibrate(15);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (!holding) return;
      holding = false;
      fill.classList.remove("filling");
      fill.style.width = "0%";
      onComplete();
    }, holdMs());
  };

  const stop = () => {
    if (!holding) return;
    holding = false;
    clearTimeout(holdTimer);
    fill.classList.remove("filling");
    fill.style.width = "0%";
    announce("Cancelled. Hold until the bar fills to confirm.");
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
  button.addEventListener("keydown", start);
  button.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stop();
  });
  button.addEventListener("blur", stop);
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
  document.documentElement.classList.toggle("tremor", els.optTremor.checked);
  document.documentElement.classList.toggle("reduce-motion", els.optReduced.checked);
  localStorage.setItem(
    "onehold-settings",
    JSON.stringify({
      large: els.optLarge.checked,
      contrast: els.optContrast.checked,
      tremor: els.optTremor.checked,
      reduced: els.optReduced.checked,
    })
  );
}

function restoreSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("onehold-settings") || "{}");
    els.optLarge.checked = !!s.large;
    els.optContrast.checked = !!s.contrast;
    els.optTremor.checked = !!s.tremor;
    els.optReduced.checked = !!s.reduced;
    applySettings();
  } catch {
    /* ignore */
  }
}

function startVoice() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    announce("Voice is not available in this browser. Use hold to take, or skip.");
    speak("Voice is not available. Use hold to take.");
    return;
  }
  if (listening && recognition) {
    recognition.stop();
    return;
  }
  recognition = new Speech();
  recognition.lang = "en-GB";
  recognition.interimResults = false;
  recognition.onstart = () => {
    listening = true;
    els.voiceBtn.textContent = "Listening…";
    announce("Listening. Say take, skip, or refill.");
  };
  recognition.onend = () => {
    listening = false;
    els.voiceBtn.textContent = "Voice";
  };
  recognition.onerror = () => {
    listening = false;
    els.voiceBtn.textContent = "Voice";
    announce("Voice did not catch that. You can still hold to take.");
  };
  recognition.onresult = (event) => {
    const said = event.results[0][0].transcript.toLowerCase();
    if (said.includes("take") || said.includes("taken") || said.includes("yes")) takeDose("voice");
    else if (said.includes("skip") || said.includes("later")) openOverlay(els.skipSheet);
    else if (said.includes("refill")) openOverlay(els.refillSheet);
    else if (said.includes("undo")) undo();
    else announce(`Heard “${said}”. Try saying take, skip, or refill.`);
  };
  recognition.start();
}

els.skipBtn.addEventListener("click", () => openOverlay(els.skipSheet));
els.skipSheet.querySelectorAll("[data-skip]").forEach((btn) => {
  btn.addEventListener("click", () => skipDose(btn.dataset.skip));
});
document.getElementById("skipCancel").addEventListener("click", () => closeOverlay(els.skipSheet));
els.remindDismiss.addEventListener("click", () => closeOverlay(els.reminder));
els.refillCancel.addEventListener("click", () => closeOverlay(els.refillSheet));
els.undoBtn.addEventListener("click", undo);
els.voiceBtn.addEventListener("click", startVoice);
els.settingsBtn.addEventListener("click", () => openOverlay(els.settings));
els.settingsClose.addEventListener("click", () => {
  closeOverlay(els.settings);
  els.settingsBtn.focus();
});
els.demoReminder.addEventListener("click", () => {
  closeOverlay(els.settings);
  activeId = FIRST_ID;
  const med = activeMed();
  if (med.status === "taken") med.status = "due";
  saveMeds();
  render();
  els.remindTitle.textContent = `Time for ${med.name}`;
  if (els.remindMeta) els.remindMeta.textContent = `${med.dose} · ${med.reason}`;
  openOverlay(els.reminder);
  announce(`Reminder. Time for ${med.name}. Hold to take.`);
  speak(`Time for ${med.name}. Hold to take.`);
});
els.resetDemo.addEventListener("click", () => {
  meds = defaultMeds();
  activeId = FIRST_ID;
  lastAction = null;
  els.toast.hidden = true;
  saveMeds();
  render();
  announce("Demo reset. Morning tablet is due now.");
});
[els.optLarge, els.optContrast, els.optTremor, els.optReduced].forEach((el) => {
  el.addEventListener("change", applySettings);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    [els.skipSheet, els.reminder, els.refillSheet, els.settings].forEach(closeOverlay);
  }
});

bindHold(els.holdBtn, els.holdFill, () => takeDose("hold"));
bindHold(els.remindHold, els.remindFill, () => takeDose("hold"));
bindHold(els.refillHold, els.refillFill, requestRefill);

restoreSettings();
render();
setInterval(renderClock, 30000);
