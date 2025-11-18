/**
 * EigenBench Judge Interface - One Criterion at a Time
 * Beautiful UI with animations
 */

// State management
let state = {
  totalScenarios: 0,
  currentScenarioNumber: 0,
  criteria: [],
  currentCriterionIdx: 0,
  currentScenario: null,
  votes: [], // Store votes for current scenario
  initialized: false,
};

// DOM elements
const elements = {
  loadingState: null,
  judgeInterface: null,
  completionState: null,
  scenarioText: null,
  responseAText: null,
  responseBText: null,
  assistantA: null,
  assistantB: null,
  tagA: null,
  tagB: null,
  criterionText: null,
  progressInfo: null,
  statusMessage: null,
  progressBar: null,
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initElements();
  initializeSession();
});

/**
 * Initialize DOM element references
 */
function initElements() {
  elements.loadingState = document.getElementById("loadingState");
  elements.judgeInterface = document.getElementById("judgeInterface");
  elements.completionState = document.getElementById("completionState");
  elements.scenarioText = document.getElementById("scenarioText");
  elements.responseAText = document.getElementById("responseAText");
  elements.responseBText = document.getElementById("responseBText");
  elements.assistantA = document.getElementById("assistantA");
  elements.assistantB = document.getElementById("assistantB");
  elements.tagA = document.getElementById("tagA");
  elements.tagB = document.getElementById("tagB");
  elements.criterionText = document.getElementById("criterionText");
  elements.progressInfo = document.getElementById("progressInfo");
  elements.statusMessage = document.getElementById("statusMessage");
  elements.progressBar = document.getElementById("progressBar");
}

/**
 * Initialize the judging session
 */
async function initializeSession() {
  try {
    showLoading();

    const response = await fetch("/api/init");
    const data = await response.json();

    if (!data.success) {
      showError(
        "Failed to initialize session: " + (data.error || "Unknown error")
      );
      return;
    }

    state.totalScenarios = data.total_scenarios;
    state.initialized = true;

    console.log(`[DEBUG] Initialized with ${state.totalScenarios} scenarios`);

    if (state.totalScenarios === 0) {
      showCompletion();
      return;
    }

    // Load first scenario
    await loadNextScenario();
  } catch (error) {
    console.error("Initialization error:", error);
    showError("Network error. Please refresh the page.");
  }
}

/**
 * Load the next scenario
 */
async function loadNextScenario() {
  try {
    showLoading();

    const response = await fetch("/api/next_scenario");
    const data = await response.json();

    if (!data.success) {
      showError("Failed to load scenario: " + (data.error || "Unknown error"));
      return;
    }

    if (data.complete) {
      showCompletion();
      return;
    }

    // Store scenario data
    state.currentScenario = data;
    state.criteria = data.criteria || [];
    state.currentCriterionIdx = 0;
    state.votes = [];
    state.currentScenarioNumber = data.scenario_number;

    // Update UI
    elements.scenarioText.textContent = data.scenario;
    elements.responseAText.textContent = data.response1;
    elements.responseBText.textContent = data.response2;

    // Show model names in tags (you could customize these)
    elements.tagA.textContent = "Model A";
    elements.tagB.textContent = "Model B";

    // Reset assistant cards
    elements.assistantA.classList.remove("selected", "show-checkmark");
    elements.assistantB.classList.remove("selected", "show-checkmark");

    // Show first criterion
    showCriterion(0);

    updateProgressBar(data.scenario_number, data.scenario_total);

    hideLoading();
    showJudgeInterface();
  } catch (error) {
    console.error("Load scenario error:", error);
    showError("Network error. Please refresh the page.");
  }
}

/**
 * Show a specific criterion
 */
function showCriterion(index) {
  if (index >= state.criteria.length) {
    // All criteria judged, submit and move to next scenario
    submitScenarioVotes();
    return;
  }

  state.currentCriterionIdx = index;
  elements.criterionText.textContent = state.criteria[index];

  updateProgressInfo(
    state.currentScenarioNumber,
    state.totalScenarios,
    index + 1,
    state.criteria.length
  );

  // Reset assistant cards
  elements.assistantA.classList.remove("selected", "show-checkmark");
  elements.assistantB.classList.remove("selected", "show-checkmark");
}

/**
 * Handle vote selection
 */
async function vote(choice) {
  // Disable voting during animation
  disableVoting();

  // Map choice to vote values
  let voteValue;
  let selectedCard = null;

  switch (choice) {
    case "left":
      voteValue = "1"; // Assistant A wins
      selectedCard = elements.assistantA;
      break;
    case "right":
      voteValue = "2"; // Assistant B wins
      selectedCard = elements.assistantB;
      break;
    case "tie":
      voteValue = "t"; // Tie
      break;
    case "both-missed":
      voteValue = "b"; // Both missed (we'll treat as special tie)
      break;
    default:
      console.error("Invalid choice:", choice);
      enableVoting();
      return;
  }

  console.log(
    `[DEBUG] Voted ${choice} for criterion ${state.currentCriterionIdx + 1}`
  );

  // Store vote
  state.votes.push(voteValue);

  // Show checkmark animation if a card was selected
  if (selectedCard) {
    selectedCard.classList.add("show-checkmark");
    await sleep(800); // Show checkmark for 800ms
    selectedCard.classList.remove("show-checkmark");
  } else {
    await sleep(400); // Brief pause for tie/both-missed
  }

  // Move to next criterion
  showCriterion(state.currentCriterionIdx + 1);

  enableVoting();
}

/**
 * Submit all votes for current scenario
 */
async function submitScenarioVotes() {
  if (state.votes.length !== state.criteria.length) {
    showError(
      `Error: Expected ${state.criteria.length} votes, got ${state.votes.length}`
    );
    return;
  }

  console.log("[DEBUG] Submitting votes:", state.votes);

  try {
    const response = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ votes: state.votes }),
    });

    const data = await response.json();

    if (!data.success) {
      showError("Failed to save votes: " + (data.error || "Unknown error"));
      return;
    }

    // Show brief success message
    showSuccess("All votes recorded!");
    await sleep(600);

    // Load next scenario
    await loadNextScenario();
  } catch (error) {
    console.error("Submit error:", error);
    showError("Network error. Please try again.");
  }
}

/**
 * UI State Management
 */
function showLoading() {
  elements.loadingState.style.display = "flex";
  elements.judgeInterface.style.display = "none";
  elements.completionState.style.display = "none";
}

function hideLoading() {
  elements.loadingState.style.display = "none";
}

function showJudgeInterface() {
  elements.judgeInterface.style.display = "block";
  elements.completionState.style.display = "none";
}

function showCompletion() {
  elements.loadingState.style.display = "none";
  elements.judgeInterface.style.display = "none";
  elements.completionState.style.display = "flex";
  elements.progressBar.style.width = "100%";
}

function disableVoting() {
  document.querySelectorAll(".vote-option").forEach((btn) => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  });
}

function enableVoting() {
  document.querySelectorAll(".vote-option").forEach((btn) => {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  });
}

function updateProgressInfo(
  scenarioNum,
  scenarioTotal,
  criterionNum,
  criterionTotal
) {
  elements.progressInfo.textContent = `Scenario ${scenarioNum} of ${scenarioTotal} • Criterion ${criterionNum} of ${criterionTotal}`;
}

function updateProgressBar(scenarioNum, scenarioTotal) {
  const progress = (scenarioNum / scenarioTotal) * 100;
  elements.progressBar.style.width = `${Math.min(progress, 100)}%`;
}

function showSuccess(message) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = "status-message show success";
  setTimeout(() => hideStatus(), 2000);
}

function showError(message) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = "status-message show error";
}

function hideStatus() {
  elements.statusMessage.className = "status-message";
  setTimeout(() => {
    elements.statusMessage.textContent = "";
  }, 300);
}

/**
 * Utility functions
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Expose vote function to global scope for onclick handlers
window.vote = vote;
