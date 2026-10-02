(function () {
  'use strict';

  function attachToggles() {
    // Select Gemini code block headers
    const headers = document.querySelectorAll('.code-block-decoration, [class*="code-block-header"]');

    headers.forEach((header) => {
      // Prevent adding multiple buttons to the same header
      if (header.dataset.hasCollapseToggle) return;

      // Locate sibling <pre> block
      let codeBlock = header.nextElementSibling;
      if (!codeBlock || codeBlock.tagName !== 'PRE') {
        codeBlock = header.parentElement ? header.parentElement.querySelector('pre') : null;
      }

      if (!codeBlock) return;

      // Mark this header as processed
      header.dataset.hasCollapseToggle = 'true';

      // --- NEW LOGIC: CLOSE BY DEFAULT ---
      codeBlock.style.display = 'none';
      let isCollapsed = true; 

      // Create collapse/expand button
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      // Add 'is-collapsed' class immediately since it starts closed
      toggleBtn.className = 'gemini-collapse-toggle is-collapsed'; 
      toggleBtn.setAttribute('aria-label', 'Toggle code block visibility');
      
      // Initial HTML shows "Expand" and a pointing-right icon
      toggleBtn.innerHTML = `
        <svg class="collapse-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
        </svg>
        <span class="toggle-text">Expand</span>
      `;

      // Handle user clicks
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        isCollapsed = !isCollapsed;

        if (isCollapsed) {
          codeBlock.style.display = 'none';
          toggleBtn.classList.add('is-collapsed');
          toggleBtn.querySelector('.toggle-text').textContent = 'Expand';
        } else {
          codeBlock.style.display = '';
          toggleBtn.classList.remove('is-collapsed');
          toggleBtn.querySelector('.toggle-text').textContent = 'Collapse';
        }
      });

      // Insert button into the header's button group or at the start of the header
      const buttonGroup = header.querySelector('.buttons-wrapper, [class*="action"], [class*="buttons"]') || header;
      if (buttonGroup !== header && buttonGroup.firstChild) {
        buttonGroup.insertBefore(toggleBtn, buttonGroup.firstChild);
      } else {
        header.insertBefore(toggleBtn, header.firstChild);
      }
    });
  }

  // Initial execution when script first loads
  attachToggles();

  // Observer handles streaming AI responses and newly generated responses in the chat
  const observer = new MutationObserver(() => {
    attachToggles();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();