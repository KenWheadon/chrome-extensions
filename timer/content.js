// Create the timer UI element
const timerDiv = document.createElement('div');
Object.assign(timerDiv.style, {
  position: 'fixed',
  top: '15px',
  right: '15px',
  zIndex: '2147483647', // Maximum z-index to stay on top of everything
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  color: '#ffffff',
  padding: '6px 12px',
  borderRadius: '6px',
  fontFamily: 'monospace, sans-serif',
  fontSize: '16px',
  fontWeight: 'bold',
  cursor: 'pointer',
  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
  backdropFilter: 'blur(4px)'
});
timerDiv.title = "Click to reset timer";

// Wait for the body to be available, then attach the timer
if (document.body) {
  document.body.appendChild(timerDiv);
} else {
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(timerDiv));
}

// Function to format and update the time
function updateDisplay(startTime) {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  
  // Only show hours if it's been running for more than an hour
  if (hours !== "00") {
    timerDiv.textContent = `${hours}:${minutes}:${seconds}`;
  } else {
    timerDiv.textContent = `${minutes}:${seconds}`;
  }
}

// Initialize the timer
function initTimer() {
  chrome.storage.local.get(['timerStartTime'], (result) => {
    let startTime = result.timerStartTime;
    
    // If no start time exists, set it to right now
    if (!startTime) {
      startTime = Date.now();
      chrome.storage.local.set({ timerStartTime: startTime });
    }
    
    updateDisplay(startTime);
    setInterval(() => updateDisplay(startTime), 1000);

    // Listen for resets from other tabs to keep everything perfectly synced
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.timerStartTime) {
        startTime = changes.timerStartTime.newValue;
        updateDisplay(startTime);
      }
    });
  });
}

// Allow resetting the timer by clicking on it
timerDiv.addEventListener('click', () => {
  const newStartTime = Date.now();
  chrome.storage.local.set({ timerStartTime: newStartTime });
});

initTimer();