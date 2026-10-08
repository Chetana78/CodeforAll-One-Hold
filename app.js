const HOLD_DEFAULT = 1500;
const HOLD_TREMOR = 2500;
const UNDO_MS = 30000;
const VOICE_RECORD_SECONDS = 3;
const WAKE_RECORD_SECONDS = 3;
const AUTO_WAKE_LISTEN = true;
const WAKE_WORDS = ["onetap", "one tap", "one tab", "1 tap", "1 tab", "want tap"];
const VOICE_COMMANDS = ["take", "taken", "yes", "skip", "later", "refill", "undo"];

const defaultMeds = () => [
  {
    id: "amlodipine",
    name: "Amlodipine",
    dose: "5 mg",
    time: "08:00",
    reason: "blood pressure",
    status: "due",
    remaining: 18,
  },
  {
    id: "metformin",
    name: "Metformin",
    dose: "500 mg",
    time: "13:00",
    reason: "diabetes",
    status: "upcoming",
    remaining: 24,
  },
  {
    id: "atorvastatin",
    name: "Atorvastatin",
    dose: "20 mg",
    time: "21:00",
    reason: "cholesterol",
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
let pythonVoiceAvailable = true;
let wakeListening = false;
let waitingForWakeCommand = false;

function loadMeds() {
  try {
    const raw = localStorage.getItem("onehold-meds");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultMeds();
}

function saveMeds() {
  localStorage.setItem("onehold-meds", JSON.stringify(meds));
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
      if (med.status === "low" && med.id === "atorvastatin") {
        activeId = med.id;
        renderNext();
        openOverlay(els.refillSheet);
        announce("Refill sheet opened for Atorvastatin.");
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
  const med = meds.find((m) => m.id === "atorvastatin");
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
    const med = meds.find((m) => m.id === "atorvastatin");
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

function handleVoiceCommand(transcript, source) {
  const said = transcript.toLowerCase();
  if (said.includes("take") || said.includes("taken") || said.includes("yes")) takeDose(source);
  else if (said.includes("skip") || said.includes("later")) openOverlay(els.skipSheet);
  else if (said.includes("refill")) openOverlay(els.refillSheet);
  else if (said.includes("undo")) undo();
  else announce(`Heard "${transcript}". Try saying take, skip, or refill.`);
}

function hasVoiceCommand(transcript) {
  const said = transcript.toLowerCase();
  return VOICE_COMMANDS.some((command) => said.includes(command));
}

function parseWakeTranscript(transcript) {
  const said = transcript.toLowerCase();
  const wakeWord = WAKE_WORDS.find((word) => said.includes(word));
  if (!wakeWord) return { woke: false, command: "" };
  return {
    woke: true,
    command: said.slice(said.indexOf(wakeWord) + wakeWord.length).trim(),
  };
}

function setVoiceListening(isListening) {
  listening = isListening;
  els.voiceBtn.textContent = isListening ? "Listening..." : "Voice";
}

async function requestPythonVoice(duration) {
  const response = await fetch("/api/voice-command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration }),
  });
  const data = await response.json();
  return { response, data };
}

async function startPythonVoice() {
  setVoiceListening(true);
  announce("Listening. Say take, skip, or refill.");
  try {
    const { response, data } = await requestPythonVoice(VOICE_RECORD_SECONDS);
    if (!response.ok || !data.ok) {
      announce(data.error || "Python voice did not catch that. You can still hold to take.");
      return;
    }
    handleVoiceCommand(data.transcript, "voice");
  } catch {
    pythonVoiceAvailable = false;
    startBrowserVoice();
  } finally {
    if (pythonVoiceAvailable) setVoiceListening(false);
  }
}

function startBrowserVoice() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    announce("Python voice server is not running. Start it with python main.py, then reopen this page.");
    speak("Voice server is not running. Use hold to take.");
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
    setVoiceListening(true);
    announce("Listening. Say take, skip, or refill.");
  };
  recognition.onend = () => {
    setVoiceListening(false);
  };
  recognition.onerror = () => {
    setVoiceListening(false);
    announce("Voice did not catch that. You can still hold to take.");
  };
  recognition.onresult = (event) => {
    handleVoiceCommand(event.results[0][0].transcript, "voice");
  };
  recognition.start();
}

function startVoice() {
  if (listening && recognition) {
    recognition.stop();
    return;
  }
  if (listening) return;
  if (pythonVoiceAvailable) startPythonVoice();
  else startBrowserVoice();
}

async function startWakeListening() {
  if (wakeListening || !pythonVoiceAvailable) return;
  wakeListening = true;
  announce('Wake listening started. Say "OneTap" then a command.');

  while (wakeListening && pythonVoiceAvailable) {
    try {
      const duration = waitingForWakeCommand ? VOICE_RECORD_SECONDS : WAKE_RECORD_SECONDS;
      const { response, data } = await requestPythonVoice(duration);
      if (!response.ok || !data.ok) {
        if (response.status === 422) continue;
        wakeListening = false;
        announce(data.error || "Wake listening stopped. Use the Voice button to try again.");
        break;
      }

      if (waitingForWakeCommand) {
        waitingForWakeCommand = false;
        handleVoiceCommand(data.transcript, "voice");
        continue;
      }

      const wake = parseWakeTranscript(data.transcript);
      if (!wake.woke) {
        if (hasVoiceCommand(data.transcript)) {
          handleVoiceCommand(data.transcript, "voice");
        }
        continue;
      }

      vibrate(20);
      if (wake.command) {
        handleVoiceCommand(wake.command, "voice");
      } else {
        waitingForWakeCommand = true;
        announce("OneTap heard. Say take, skip, refill, or undo.");
      }
    } catch {
      pythonVoiceAvailable = false;
      wakeListening = false;
      announce("Python voice server is not running. Start it with python main.py, then reopen this page.");
    }
  }
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
  activeId = "amlodipine";
  const med = activeMed();
  if (med.status === "taken") med.status = "due";
  saveMeds();
  render();
  openOverlay(els.reminder);
  announce("Reminder. Time for Amlodipine. Hold to take.");
  speak("Time for Amlodipine. Hold to take.");
});
els.resetDemo.addEventListener("click", () => {
  meds = defaultMeds();
  activeId = "amlodipine";
  lastAction = null;
  els.toast.hidden = true;
  saveMeds();
  render();
  announce("Demo reset. Amlodipine is due now.");
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

if (AUTO_WAKE_LISTEN) {
  setTimeout(startWakeListening, 600);
}
