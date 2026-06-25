// Function to check and click the confirm button
function checkAndClickPopup() {
    const dialogs = document.querySelectorAll('yt-confirm-dialog-renderer.style-scope');
    
    for (const dialog of dialogs) {
        const confirmButton = dialog.querySelector('#confirm-button');
        if (confirmButton && dialog.offsetParent !== null) { // Ensure it is visible
            confirmButton.click();
            console.log("YouTube Auto-Clicker: Clicked 'Continue watching?' button.");
            return true; // Indicates we found and clicked it
        }
    }
    return false;
}

function startChecking() {
    // Only run on YouTube
    if (!window.location.hostname.includes('youtube.com')) {
        return;
    }

    // Clear any existing interval
    if (window.ytAutoClickerInterval) {
        clearInterval(window.ytAutoClickerInterval);
    }

    // Check continuously for the popup every second
    window.ytAutoClickerInterval = setInterval(() => {
        const clicked = checkAndClickPopup();
        if (clicked) {
            console.log("YouTube Auto-Clicker: Going to sleep until next navigation.");
            clearInterval(window.ytAutoClickerInterval);
            window.ytAutoClickerInterval = null;
        }
    }, 1000);
}

// Start checking when the script initially loads
startChecking();

// Listen for YouTube's SPA navigation event which fires when moving to a new video
// This ensures it wakes up again when you navigate around YouTube.
window.addEventListener('yt-navigate-finish', startChecking);

// Also listen for page data updates which covers playlist auto-advances 
// where the next video loads without a full page navigation.
window.addEventListener('yt-page-data-updated', startChecking);
