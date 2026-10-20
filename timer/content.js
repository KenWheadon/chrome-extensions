// Create the timer interface
const timerDiv = document.createElement('div');
timerDiv.style.position = 'fixed';
timerDiv.style.top = '15px';
timerDiv.style.right = '15px';
timerDiv.style.zIndex = '2147483647'; // Maximum z-index to stay on top
timerDiv.style.padding = '8px 12px';
timerDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
timerDiv.style.color = '#fff';
timerDiv.style.fontFamily = 'monospace';
timerDiv.style.fontSize = '18px';
timerDiv.style.borderRadius = '5px';
timerDiv.style.cursor = 'pointer';
timerDiv.style.userSelect = 'none';
timerDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
timerDiv.innerText = '00:00:00';

// Wait for the body to exist before appending
window.onload = () => document.body.appendChild(timerDiv);

let seconds = 0;
let interval = null;
let isRunning = false;

function updateDisplay() {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    timerDiv.innerText = `${h}:${m}:${s}`;
}

// Click to start/pause
timerDiv.addEventListener('click', () => {
    if (isRunning) {
        clearInterval(interval);
        timerDiv.style.backgroundColor = 'rgba(200, 50, 50, 0.9)'; // Red when paused
    } else {
        interval = setInterval(() => {
            seconds++;
            updateDisplay();
        }, 1000);
        timerDiv.style.backgroundColor = 'rgba(50, 200, 50, 0.9)'; // Green when running
    }
    isRunning = !isRunning;
});

// Double click to reset
timerDiv.addEventListener('dblclick', () => {
    clearInterval(interval);
    seconds = 0;
    isRunning = false;
    updateDisplay();
    timerDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.75)'; // Black when reset
});