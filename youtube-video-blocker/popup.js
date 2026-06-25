document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('block-toggle');

  // Load the saved toggle state
  chrome.storage.local.get('videoBlockEnabled', (data) => {
    toggle.checked = !!data.videoBlockEnabled;
  });

  // Save the state when clicked
  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ videoBlockEnabled: toggle.checked });
  });
});