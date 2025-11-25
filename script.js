// ---- Global State ----
let testRunning = false;
let startTime = null;
let endTime = null;
let lastKeyTime = null;
let hesitations = [];
let keyStats = {};      // { 'a': { presses: n, mistakes: m } }
let expectedText = "";
let typedText = "";

// DOM Elements
const targetTextEl = document.getElementById("targetText");
const typingAreaEl = document.getElementById("typingArea");
const testStatusEl = document.getElementById("testStatus");
const startBtn = document.getElementById("startTestBtn");
const finishBtn = document.getElementById("finishTestBtn");
const resetBtn = document.getElementById("resetTestBtn");

const wpmEl = document.getElementById("wpm");
const accuracyEl = document.getElementById("accuracy");
const avgHesitationEl = document.getElementById("avgHesitation");
const timeTakenEl = document.getElementById("timeTaken");
const issuesListEl = document.getElementById("issuesList");

const practiceTextEl = document.getElementById("practiceText");
const loadPracticeBtn = document.getElementById("loadPracticeBtn");
const historyTableBody = document.getElementById("historyTableBody");

// ---- Utility ----
function setStatus(text, cls) {
  testStatusEl.textContent = "Status: " + text;
  testStatusEl.className = "status " + cls;
}

function resetState() {
  testRunning = false;
  startTime = null;
  endTime = null;
  lastKeyTime = null;
  hesitations = [];
  keyStats = {};
  typedText = "";

  typingAreaEl.value = "";
  typingAreaEl.disabled = true;
  finishBtn.disabled = true;

  setStatus("Not started", "status-idle");

  wpmEl.textContent = "0";
  accuracyEl.textContent = "0%";
  avgHesitationEl.textContent = "0 ms";
  timeTakenEl.textContent = "0 s";
  issuesListEl.innerHTML = "<li>No data yet. Run a test.</li>";
}

function loadHistoryFromStorage() {
  const raw = localStorage.getItem("stm_history");
  if (!raw) {
    historyTableBody.innerHTML = "<tr><td colspan='6'>No sessions yet.</td></tr>";
    return;
  }
  const history = JSON.parse(raw);
  if (history.length === 0) {
    historyTableBody.innerHTML = "<tr><td colspan='6'>No sessions yet.</td></tr>";
    return;
  }

  historyTableBody.innerHTML = "";
  history.forEach((session, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${session.wpm}</td>
      <td>${session.accuracy}%</td>
      <td>${session.avgHesitation}</td>
      <td>${session.timeTaken}</td>
      <td>${session.date}</td>
    `;
    historyTableBody.appendChild(tr);
  });
}

function saveSessionToHistory(session) {
  const raw = localStorage.getItem("stm_history");
  let history = raw ? JSON.parse(raw) : [];
  history.unshift(session); // latest first
  // keep only last 20 sessions
  if (history.length > 20) history = history.slice(0, 20);
  localStorage.setItem("stm_history", JSON.stringify(history));
}

// Simple character-based accuracy
function calculateAccuracy(expected, typed) {
  const len = Math.max(expected.length, typed.length);
  if (len === 0) return 0;
  let correct = 0;
  for (let i = 0; i < len; i++) {
    if (expected[i] === typed[i]) correct++;
  }
  return Math.round((correct / len) * 100);
}

function calculateWPM(chars, timeSeconds) {
  if (timeSeconds <= 0) return 0;
  const words = chars / 5;
  const minutes = timeSeconds / 60;
  return Math.round(words / minutes);
}

// Generate practice text using weak keys
function generatePracticeTextFromWeakKeys() {
  // Determine keys with highest mistake rate
  let keyArray = Object.entries(keyStats).map(([key, stats]) => {
    const mistakeRate = stats.mistakes / Math.max(stats.presses, 1);
    return { key, presses: stats.presses, mistakes: stats.mistakes, mistakeRate };
  });

  if (keyArray.length === 0) {
    practiceTextEl.value = "No weak keys identified yet. Run a typing test first.";
    return;
  }

  // Sort by mistakeRate & mistakes
  keyArray.sort((a, b) => b.mistakeRate - a.mistakeRate || b.mistakes - a.mistakes);

  const topKeys = keyArray.slice(0, 5).map(k => k.key).join(" ").replace(/ /g, "");
  const uniqueKeys = [...new Set(topKeys)].join("");

  // Simple practice sentence generator
  const practiceSentences = [];

  if (uniqueKeys.length > 0) {
    practiceSentences.push(`Focus on these keys: ${uniqueKeys.split("").join(" ")}`);
  }

  practiceSentences.push(
    "Type this sentence slowly and carefully using your weak keys."
  );

  // Try mixing them into a fun sentence
  const constructed = uniqueKeys
    .split("")
    .map(ch => `${ch}${ch}${ch}`)
    .join(" ");

  practiceSentences.push(`Triple-key drill: ${constructed}`);

  practiceTextEl.value = practiceSentences.join(" • ");
}

// ---- Event Handlers ----

// Preset text buttons
document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const text = btn.getAttribute("data-text");
    targetTextEl.value = text;
  });
});

// Start Test
startBtn.addEventListener("click", () => {
  expectedText = targetTextEl.value.trim();
  if (!expectedText) {
    alert("Please enter or select some target text first.");
    return;
  }
  resetState();
  expectedText = targetTextEl.value; // keep original formatting

  typingAreaEl.disabled = false;
  typingAreaEl.focus();
  testRunning = true;
  setStatus("Running...", "status-running");
  startTime = null;
  lastKeyTime = null;
  finishBtn.disabled = false;
});

// Typing input
typingAreaEl.addEventListener("input", (e) => {
  if (!testRunning) return;

  const now = Date.now();

  // first character -> start timer
  if (!startTime) {
    startTime = now;
    lastKeyTime = now;
  }

  typedText = typingAreaEl.value;

  // hesitation
  const delta = now - lastKeyTime;
  if (lastKeyTime && delta < 2000) { // ignore very long pauses
    hesitations.push(delta);
  }
  lastKeyTime = now;

  // update keyStats (roughly)
  const idx = typedText.length - 1;
  const currentChar = typedText[idx];
  if (currentChar) {
    const key = currentChar.toLowerCase();
    if (!keyStats[key]) {
      keyStats[key] = { presses: 0, mistakes: 0 };
    }
    keyStats[key].presses++;

    // if mismatch with expected char at same position -> mistake
    const expectedChar = expectedText[idx];
    if (expectedChar !== currentChar) {
      keyStats[key].mistakes++;
    }
  }

  // Auto-finish when length reached or exceeded
  if (typedText.length >= expectedText.length) {
    finishTest();
  }
});

// Finish button
finishBtn.addEventListener("click", () => {
  if (!testRunning) return;
  finishTest();
});

// Reset button
resetBtn.addEventListener("click", () => {
  resetState();
});

// Load practice text as new target
loadPracticeBtn.addEventListener("click", () => {
  const text = practiceTextEl.value.trim();
  if (!text || text.startsWith("No weak keys")) {
    alert("No generated practice yet. Run a test first.");
    return;
  }
  targetTextEl.value = text;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---- Finish Test Logic ----
function finishTest() {
  endTime = Date.now();
  testRunning = false;
  typingAreaEl.disabled = true;
  finishBtn.disabled = true;
  setStatus("Finished", "status-finished");

  const timeSeconds = (endTime - startTime) / 1000;
  const totalChars = typedText.length;
  const wpm = calculateWPM(totalChars, timeSeconds);
  const accuracy = calculateAccuracy(expectedText, typedText);

  const avgHesitation =
    hesitations.length > 0
      ? Math.round(hesitations.reduce((a, b) => a + b, 0) / hesitations.length)
      : 0;

  // Update UI
  wpmEl.textContent = wpm;
  accuracyEl.textContent = accuracy + "%";
  avgHesitationEl.textContent = avgHesitation + " ms";
  timeTakenEl.textContent = Math.round(timeSeconds) + " s";

  // Issues list
  const issues = [];
  if (accuracy < 90) {
    issues.push("Your accuracy is below 90%. Slow down and focus on correctness.");
  }
  if (wpm < 35) {
    issues.push("Your WPM is below 35. Practice daily small sessions to build speed.");
  }
  if (avgHesitation > 400) {
    issues.push(
      "Your average hesitation is high. You're pausing a lot between keys. Try to keep a steady rhythm."
    );
  }

  // Weak keys
  const weakKeysArray = Object.entries(keyStats)
    .filter(([k, stats]) => stats.mistakes > 0)
    .sort(
      (a, b) =>
        b[1].mistakes / Math.max(b[1].presses, 1) -
        a[1].mistakes / Math.max(a[1].presses, 1)
    )
    .slice(0, 5);

  if (weakKeysArray.length > 0) {
    const weakKeysStr = weakKeysArray
      .map(
        ([k, stats]) =>
          `${k.toUpperCase()} (mistakes: ${stats.mistakes}/${stats.presses})`
      )
      .join(", ");
    issues.push("You often struggle with keys: " + weakKeysStr);
  }

  issuesListEl.innerHTML = "";
  if (issues.length === 0) {
    issuesListEl.innerHTML = "<li>Great job! No major issues detected.</li>";
  } else {
    issues.forEach(issue => {
      const li = document.createElement("li");
      li.textContent = issue;
      issuesListEl.appendChild(li);
    });
  }

  // Generate practice
  generatePracticeTextFromWeakKeys();

  // Save session
  const session = {
    wpm,
    accuracy,
    avgHesitation,
    timeTaken: Math.round(timeSeconds),
    date: new Date().toLocaleString()
  };
  saveSessionToHistory(session);
  loadHistoryFromStorage();
}

// Initial load
resetState();
loadHistoryFromStorage();
