# British to American Spelling Highlighter (Chrome Extension)

An automated Chrome extension built with Manifest V3 that detects, counts, and highlights British English spellings across any webpage, giving you instant American English replacements.

## Features
- **1,300+ Verified Words**: Covers `-our`/`-or`, `-ise`/`-ize`, `-re`/`-er`, `-ce`/`-se`, double consonants (`travelled` ➔ `traveled`), irregular verbs (`learnt` ➔ `learned`), and vocabulary (`aeroplane` ➔ `airplane`, `draught` ➔ `draft`, `tyre` ➔ `tire`).
- **Context & Case Aware**: Preserves lower, upper, and TitleCase (`Colour` ➔ `Color`, `COLOUR` ➔ `COLOR`).
- **Click-to-Copy**: Click any highlighted word to copy its American counterpart to your clipboard.
- **Floating HUD**: A bottom-right overlay showing the count and `▲` / `▼` navigation buttons to cycle through each highlighted occurrence.
- **Custom Dictionary**: Add your own custom UK ➔ US word pairs directly in the popup menu.

## Installation Instructions
1. Unzip this downloaded archive into a folder on your computer.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the unzipped folder (the folder that directly contains `manifest.json`).
6. Browse to any site (e.g. [BBC News](https://www.bbc.com)) to see it highlight British spellings automatically!
