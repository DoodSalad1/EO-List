// UI Component Tests - Button injection, dialogs, status panels, and visual elements

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for ui_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull, assertMatches } = window.TestRunner;

  category('UI Component Tests', 'Tests for button injection, dialog detection, status panels, and UI interactions');

  test('Should detect shift dialog modal', () => {
    // Create mock shift dialog
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.display = 'block';
    dialog.innerHTML = `
      <h3>Schedule for Sun 08/10/2025</h3>
      <div>8:00pm - 4:00am</div>
      <button>Close</button>
    `;
    document.body.appendChild(dialog);
    
    // Test dialog detection from content.js
    const queryShiftDialog = () => {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], .modal, .k-window, .k-window-content, .ui-dialog-content, .modal-dialog'));
      return dialogs.find(d => d.offsetParent !== null);
    };
    
    const foundDialog = queryShiftDialog();
    assertNotNull(foundDialog, 'Should find shift dialog');
    assertEqual(foundDialog.getAttribute('role'), 'dialog', 'Should be a dialog element');
    
    document.body.removeChild(dialog);
  });

  test('Should inject EO ASAP button in dialog', () => {
    // Create mock dialog
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.display = 'block';
    dialog.innerHTML = '<div class="modal-content"><div class="modal-footer"></div></div>';
    document.body.appendChild(dialog);
    
    // Test button injection logic from content.js
    const ensureButton = (dialogEl) => {
      if (dialogEl && !dialogEl.querySelector('#eo-asap-btn')) {
        const btn = document.createElement('button');
        btn.id = 'eo-asap-btn';
        btn.textContent = 'EO ASAP';
        btn.className = 'eo-asap-btn';
        const actionsArea = dialogEl.querySelector('.modal-footer, .k-window-content, .actions, .btn-toolbar, .modal-content') || dialogEl;
        actionsArea.appendChild(btn);
      }
    };
    
    ensureButton(dialog);
    
    const injectedBtn = dialog.querySelector('#eo-asap-btn');
    assertNotNull(injectedBtn, 'Should inject EO ASAP button');
    assertEqual(injectedBtn.textContent, 'EO ASAP', 'Button should have correct text');
    assert(injectedBtn.classList.contains('eo-asap-btn'), 'Button should have correct class');
    
    document.body.removeChild(dialog);
  });

  test('Should create floating EO button', () => {
    // Test floating button creation from content.js
    const createFloatingButton = () => {
      if (!document.getElementById('eo-asap-float')) {
        const floatBtn = document.createElement('button');
        floatBtn.id = 'eo-asap-float';
        floatBtn.className = 'eo-asap-btn eo-asap-float';
        floatBtn.textContent = 'EO ASAP';
        floatBtn.title = 'Schedule EO for the selected shift or attempt now';
        document.body.appendChild(floatBtn);
      }
    };
    
    createFloatingButton();
    
    const floatBtn = document.getElementById('eo-asap-float');
    assertNotNull(floatBtn, 'Should create floating button');
    assertEqual(floatBtn.textContent, 'EO ASAP', 'Floating button should have correct text');
    assert(floatBtn.classList.contains('eo-asap-float'), 'Should have floating class');
    assertEqual(floatBtn.title, 'Schedule EO for the selected shift or attempt now', 'Should have tooltip');
    
    document.body.removeChild(floatBtn);
  });

  test('Should find native EO List button with improved detection', () => {
    // Test various button formats that might exist on the real site
    const testButtons = [
      { text: 'EO List', className: 'k-button' },
      { text: 'Early Out List', className: 'btn' },
      { text: 'EO', title: 'Early Out List' },
      { text: 'Submit EO', className: 'submit-btn' }
    ];

    testButtons.forEach((buttonConfig, index) => {
      // Create mock button
      const nativeBtn = document.createElement('button');
      nativeBtn.textContent = buttonConfig.text;
      nativeBtn.className = buttonConfig.className || '';
      if (buttonConfig.title) nativeBtn.title = buttonConfig.title;
      nativeBtn.id = `test-btn-${index}`;
      document.body.appendChild(nativeBtn);

      // Test improved finding logic from content.js
      const findEOListButton = () => {
        const selectors = [
          'button, a, .k-button, .btn',
          '[role="button"]',
          'input[type="button"], input[type="submit"]',
          '*[onclick*="EO"], *[onclick*="eo"]'
        ];

        const textPatterns = [
          /\bEO\s*List\b/i,
          /EO.*List/i,
          /Early.*Out.*List/i,
          /^EO\s*$|^EO List$/i,
          /EO/i
        ];

        for (const selector of selectors) {
          const candidates = Array.from(document.querySelectorAll(selector));
          for (const pattern of textPatterns) {
            const button = candidates.find(el => {
              const text = (el.textContent || '').trim();
              const value = (el.value || '').trim();
              const title = (el.title || '').trim();
              const ariaLabel = (el.getAttribute('aria-label') || '').trim();
              
              return pattern.test(text) || pattern.test(value) || 
                     pattern.test(title) || pattern.test(ariaLabel);
            });
            
            if (button) return button;
          }
        }
        return null;
      };

      const foundBtn = findEOListButton();
      assertNotNull(foundBtn, `Should find EO List button variant: "${buttonConfig.text}"`);
      assertEqual(foundBtn.id, `test-btn-${index}`, 'Should find correct button');

      document.body.removeChild(nativeBtn);
    });
  });

  test('Should create status panel', () => {
    // Test status panel creation from content.js
    const initStatusPanel = () => {
      if (document.getElementById('eo-status')) return;
      const panel = document.createElement('div');
      panel.id = 'eo-status';
      panel.className = 'eo-status';
      panel.innerHTML = `
        <div class="eo-status-row">
          <span id="eo-status-text">No EO scheduled.</span>
          <button id="eo-cancel-btn" class="eo-asap-btn eo-cancel-btn" title="Cancel scheduled EO">Cancel</button>
        </div>`;
      document.body.appendChild(panel);
    };
    
    initStatusPanel();
    
    const panel = document.getElementById('eo-status');
    assertNotNull(panel, 'Should create status panel');
    
    const statusText = panel.querySelector('#eo-status-text');
    const cancelBtn = panel.querySelector('#eo-cancel-btn');
    
    assertNotNull(statusText, 'Should have status text element');
    assertNotNull(cancelBtn, 'Should have cancel button');
    assertEqual(statusText.textContent, 'No EO scheduled.', 'Should show default status');
    assertEqual(cancelBtn.title, 'Cancel scheduled EO', 'Cancel button should have tooltip');
    
    document.body.removeChild(panel);
  });

  test('Should update status panel with schedule info', () => {
    // Create status panel
    const panel = document.createElement('div');
    panel.id = 'eo-status';
    panel.innerHTML = `
      <div class="eo-status-row">
        <span id="eo-status-text">No EO scheduled.</span>
        <button id="eo-cancel-btn" class="eo-asap-btn eo-cancel-btn">Cancel</button>
      </div>`;
    document.body.appendChild(panel);
    
    // Test status update logic
    const updateStatusPanel = (status) => {
      const text = panel.querySelector('#eo-status-text');
      if (!status || (!status.next && !status.nextPre)) {
        panel._current = null;
        text.textContent = 'No EO scheduled.';
        return;
      }
      const when = status.next ? new Date(status.next.fireTime) : null;
      panel._current = status.next || null;
      if (when) {
        text.textContent = `Next EO: ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${status.next.dateISO})`;
      }
    };
    
    // Test with mock status
    const mockStatus = {
      next: {
        dateISO: '2025-08-14',
        start: '8:00pm',
        fireTime: Date.now() + 7200000 // 2 hours from now
      }
    };
    
    updateStatusPanel(mockStatus);
    
    const statusText = panel.querySelector('#eo-status-text');
    assertMatches(statusText.textContent, /Next EO:.*2025-08-14/, 'Should display scheduled EO info');
    
    document.body.removeChild(panel);
  });

  test('Should create toast notifications', () => {
    // Test toast creation from content.js
    const showToast = (message, actions = []) => {
      let toast = document.getElementById('eo-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'eo-toast';
        toast.className = 'eo-toast';
        const msgEl = document.createElement('span');
        msgEl.id = 'eo-toast-msg';
        const actionsEl = document.createElement('span');
        actionsEl.id = 'eo-toast-actions';
        toast.append(msgEl, actionsEl);
        document.body.appendChild(toast);
      }
      const msgEl = toast.querySelector('#eo-toast-msg');
      if (msgEl) msgEl.textContent = message;
      toast.classList.add('visible');
    };
    
    showToast('Test toast message');
    
    const toast = document.getElementById('eo-toast');
    const msgEl = toast.querySelector('#eo-toast-msg');
    
    assertNotNull(toast, 'Should create toast element');
    assert(toast.classList.contains('visible'), 'Toast should be visible');
    assertEqual(msgEl.textContent, 'Test toast message', 'Should display correct message');
    
    document.body.removeChild(toast);
  });

  test('Should handle toast with action buttons', () => {
    const showToast = (message, actions = []) => {
      let toast = document.getElementById('eo-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'eo-toast';
        toast.className = 'eo-toast';
        const msgEl = document.createElement('span');
        msgEl.id = 'eo-toast-msg';
        const actionsEl = document.createElement('span');
        actionsEl.id = 'eo-toast-actions';
        toast.append(msgEl, actionsEl);
        document.body.appendChild(toast);
      }
      const msgEl = toast.querySelector('#eo-toast-msg');
      const actionsEl = toast.querySelector('#eo-toast-actions');
      if (msgEl) msgEl.textContent = message;
      if (actionsEl) {
        actionsEl.innerHTML = '';
        for (const a of actions) {
          const btn = document.createElement('button');
          btn.className = 'eo-toast-btn';
          btn.textContent = a.text;
          btn.addEventListener('click', a.onClick);
          actionsEl.appendChild(btn);
        }
      }
      toast.classList.add('visible');
    };
    
    let actionClicked = false;
    showToast('EO scheduled for 8:00 PM', [
      {
        text: 'Cancel',
        onClick: () => { actionClicked = true; }
      }
    ]);
    
    const toast = document.getElementById('eo-toast');
    const actionsEl = toast.querySelector('#eo-toast-actions');
    const cancelBtn = actionsEl.querySelector('button');
    
    assertNotNull(cancelBtn, 'Should create action button');
    assertEqual(cancelBtn.textContent, 'Cancel', 'Button should have correct text');
    
    // Test button click
    cancelBtn.click();
    assert(actionClicked, 'Action button click should be handled');
    
    document.body.removeChild(toast);
  });

  test('Should detect shift cells with improved patterns', () => {
    // Create various shift cell formats that might exist on the real site
    const testCells = [
      { tag: 'td', text: '8:00pm - 4:00am', shouldFind: true },
      { tag: 'div', text: '2:00pm - 10:00pm', shouldFind: true },
      { tag: 'td', text: '8pm', shouldFind: true },
      { tag: 'div', text: 'Morning Shift', shouldFind: true },
      { tag: 'td', text: '20:00-04:00', shouldFind: true },
      { tag: 'div', text: 'Regular text content', shouldFind: false },
      { tag: 'td', text: '08/14/2025 8:00pm', shouldFind: true }
    ];

    const createdElements = [];
    
    testCells.forEach((cellConfig, index) => {
      const cell = document.createElement(cellConfig.tag);
      cell.textContent = cellConfig.text;
      cell.id = `test-cell-${index}`;
      // Make clickable
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {});
      
      document.body.appendChild(cell);
      createdElements.push(cell);
    });

    // Test improved shift cell detection from content.js
    const findShiftCells = () => {
      const selectors = [
        'td, div',
        '.calendar-cell, .day-cell',
        '[role="gridcell"]',
        '.shift, .schedule-item',
        '*[data-time], *[data-shift]'
      ];

      const timePatterns = [
        /\b\d{1,2}:\d{2}\s*(am|pm)\b/i,
        /\b\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)\b/i,
        /\b\d{1,2}:\d{2}-\d{1,2}:\d{2}/i,
        /\b\d{1,2}(:\d{2})?\s*(am|pm)/i,
        /\b(morning|afternoon|evening|night|am|pm)\b/i,
        /\d{1,2}\/\d{1,2}\/\d{4}.*\d{1,2}:\d{2}/i,
        /shift|schedule|work/i
      ];

      const foundCells = [];
      
      for (const selector of selectors) {
        const cells = Array.from(document.querySelectorAll(selector));
        
        for (const pattern of timePatterns) {
          const matchingCells = cells.filter(el => {
            const text = (el.textContent || '').trim();
            const title = (el.title || '').trim();
            const dataTime = (el.getAttribute('data-time') || '').trim();
            
            const isClickable = el.tagName === 'TD' || el.tagName === 'DIV' || 
                               el.onclick || el.style.cursor === 'pointer';
                               
            const isVisible = el.offsetParent !== null && 
                             el.style.display !== 'none';
            
            const hasTimePattern = pattern.test(text) || pattern.test(title) || pattern.test(dataTime);
            
            return hasTimePattern && isClickable && isVisible && !foundCells.includes(el);
          });
          
          foundCells.push(...matchingCells);
        }
      }
      
      return [...new Set(foundCells)]; // Remove duplicates
    };

    const foundCells = findShiftCells();
    const expectedCount = testCells.filter(c => c.shouldFind).length;
    
    assert(foundCells.length >= expectedCount - 1, `Should find most shift cells (found: ${foundCells.length}, expected: ${expectedCount})`);
    
    // Test specific patterns work
    const cell1 = document.getElementById('test-cell-0'); // "8:00pm - 4:00am"
    const cell6 = document.getElementById('test-cell-6'); // "08/14/2025 8:00pm"
    
    assert(foundCells.includes(cell1), 'Should find time range cell');
    assert(foundCells.includes(cell6), 'Should find date with time cell');

    // Cleanup
    createdElements.forEach(el => document.body.removeChild(el));
  });

})();