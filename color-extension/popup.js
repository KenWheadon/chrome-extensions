document.addEventListener("DOMContentLoaded", () => {
  const colorPicker = document.getElementById("colorPicker");
  const hexInput = document.getElementById("hexInput");
  const saveBtn = document.getElementById("saveBtn");
  const pasteBtn = document.getElementById("pasteBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const paletteList = document.getElementById("paletteList");
  const emptyState = document.getElementById("emptyState");
  const colorCount = document.getElementById("colorCount");
  const toast = document.getElementById("toast");

  let colors = [];

  // Normalize 3-digit or 6-digit hex input to standard #RRGGBB
  function formatHex(val) {
    let clean = val.trim().replace(/^#/, "");
    if (clean.length === 3) {
      clean = clean.split("").map((c) => c + c).join("");
    }
    if (/^[0-9A-Fa-f]{6}$/.test(clean)) {
      return `#${clean.toUpperCase()}`;
    }
    return null;
  }

  // Load colors from storage
  chrome.storage.local.get(["savedColors"], (result) => {
    colors = result.savedColors || [];
    renderPalette();
  });

  function saveColorsToStorage() {
    chrome.storage.local.set({ savedColors: colors });
  }

  function showToast(text) {
    toast.textContent = text;
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 1200);
  }

  function copyToClipboard(hex) {
    navigator.clipboard.writeText(hex).then(() => {
      showToast(`Copied ${hex}!`);
    });
  }

  function renderPalette() {
    paletteList.innerHTML = "";
    colorCount.textContent = colors.length;

    if (colors.length === 0) {
      emptyState.style.display = "block";
      clearAllBtn.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    clearAllBtn.style.display = "inline";

    colors.forEach((hex, index) => {
      const card = document.createElement("div");
      card.className = "color-card";

      card.innerHTML = `
        <div class="swatch" style="background-color: ${hex};"></div>
        <span class="hex-label">${hex}</span>
        <div class="card-actions">
          <span class="copy-badge">Copy</span>
          <button class="delete-btn" title="Delete" data-index="${index}">&times;</button>
        </div>
      `;

      // Click card to copy
      card.addEventListener("click", (e) => {
        if (!e.target.classList.contains("delete-btn")) {
          copyToClipboard(hex);
        }
      });

      // Delete specific color
      card.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        colors.splice(index, 1);
        saveColorsToStorage();
        renderPalette();
      });

      paletteList.appendChild(card);
    });
  }

  function addColor(rawHex) {
    const validHex = formatHex(rawHex);
    if (!validHex) {
      showToast("Invalid Hex Code");
      return;
    }

    // Move duplicate to front or insert new
    colors = [validHex, ...colors.filter((c) => c !== validHex)];
    saveColorsToStorage();
    renderPalette();
    hexInput.value = validHex;
    colorPicker.value = validHex;
  }

  // Sync color wheel picker with hex input
  colorPicker.addEventListener("input", (e) => {
    hexInput.value = e.target.value.toUpperCase();
  });

  saveBtn.addEventListener("click", () => {
    addColor(hexInput.value || colorPicker.value);
  });

  hexInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addColor(hexInput.value);
    }
  });

  // Read hex code straight from the user's clipboard
  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      const validHex = formatHex(text);
      if (validHex) {
        hexInput.value = validHex;
        colorPicker.value = validHex;
        addColor(validHex);
      } else {
        showToast("Clipboard does not contain a valid hex");
      }
    } catch {
      showToast("Clipboard access denied");
    }
  });

  clearAllBtn.addEventListener("click", () => {
    colors = [];
    saveColorsToStorage();
    renderPalette();
  });
});