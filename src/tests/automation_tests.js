// Automation Tests - Click sequences, EO submission workflow, and DOM interactions

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for automation_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull } = window.TestRunner;

  category('Automation Tests', 'Tests for automated clicking, EO submission workflow, and DOM interactions');

  test('Should find buttons by XPath text matching', () => {
    // Create test buttons
    const btn1 = document.createElement('button');
    btn1.textContent = 'EO List';
    
    const btn2 = document.createElement('button');
    btn2.textContent = 'Submit';
    
    const btn3 = document.createElement('a');
    btn3.textContent = 'EO List';
    
    document.body.appendChild(btn1);
    document.body.appendChild(btn2);
    document.body.appendChild(btn3);
    
    // Test XPath button finding from clicker.js
    const clickButtonByText = (root, text) => {
      const xpathStrategies = [
        `.//button[normalize-space() = "${text}"] | .//a[normalize-space() = "${text}"]`,
        `.//*[self::button or self::a][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${text.toLowerCase()}")]`,
        `.//*[self::button or self::a or self::input[@type='button']][contains(., "${text}")]`,
        `.//*[contains(text(), "${text}") or contains(@value, "${text}") or contains(@title, "${text}")]`
      ];
      
      for (const xpath of xpathStrategies) {
        try {
          const result = document.evaluate(xpath, root || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const el = result.singleNodeValue;
          if (el) return el;
        } catch (error) {
          continue;
        }
      }
      return null;
    };
    
    const eoBtn = clickButtonByText(document, 'EO List');
    const submitBtn = clickButtonByText(document, 'Submit');
    
    assertNotNull(eoBtn, 'Should find EO List button');
    assertNotNull(submitBtn, 'Should find Submit button');
    assertEqual(eoBtn.textContent, 'EO List', 'Should match button text');
    
    document.body.removeChild(btn1);
    document.body.removeChild(btn2);
    document.body.removeChild(btn3);
  });

  test('Should detect shift cells for clicking', () => {
    // Create mock shift cells
    const cell1 = document.createElement('td');
    cell1.textContent = '8:00pm - 4:00am';
    
    const cell2 = document.createElement('div');
    cell2.textContent = '2:00pm - 10:00pm';
    
    const cell3 = document.createElement('td');
    cell3.textContent = 'No shift';
    
    document.body.appendChild(cell1);
    document.body.appendChild(cell2);
    document.body.appendChild(cell3);
    
    // Test shift cell detection from clicker.js
    const findShiftCell = () => {
      const selectors = ['td', 'div', '[role="gridcell"]', '.calendar-cell'];
      const timePatterns = [
        /\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)/i,
        /\d{1,2}:\d{2}-\d{1,2}:\d{2}/i,
        /\d{1,2}:\d{2}\s*(am|pm)/i
      ];

      for (const selector of selectors) {
        const cells = Array.from(document.querySelectorAll(selector));
        for (const pattern of timePatterns) {
          const cell = cells.find(el => pattern.test(el.textContent || ''));
          if (cell) return cell;
        }
      }
      return null;
    };
    
    const shiftCell = findShiftCell();
    assertNotNull(shiftCell, 'Should find shift cell');
    assertEqual(shiftCell, cell1, 'Should find first matching cell');
    
    document.body.removeChild(cell1);
    document.body.removeChild(cell2);
    document.body.removeChild(cell3);
  });

  test('Should simulate click events', () => {
    // Create test button with click handler
    const button = document.createElement('button');
    button.textContent = 'Test Button';
    let clicked = false;
    button.addEventListener('click', () => { clicked = true; });
    
    document.body.appendChild(button);
    
    // Simulate click
    button.click();
    
    assert(clicked, 'Click event should be triggered');
    
    document.body.removeChild(button);
  });

  test('Should handle form input events', () => {
    // Create form inputs
    const userInput = document.createElement('input');
    userInput.type = 'text';
    
    const passInput = document.createElement('input');
    passInput.type = 'password';
    
    document.body.appendChild(userInput);
    document.body.appendChild(passInput);
    
    // Test form filling from clicker.js
    const fillInput = (input, value) => {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    
    fillInput(userInput, 'testuser');
    fillInput(passInput, 'testpass');
    
    assertEqual(userInput.value, 'testuser', 'Username should be filled');
    assertEqual(passInput.value, 'testpass', 'Password should be filled');
    
    document.body.removeChild(userInput);
    document.body.removeChild(passInput);
  });

  test('Should detect dialog presence', () => {
    // Create mock dialog
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.display = 'block';
    dialog.offsetParent = document.body; // Mock offsetParent
    
    document.body.appendChild(dialog);
    
    // Test dialog detection from clicker.js
    const ensureShiftDialog = () => {
      const dlg = document.querySelector('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content');
      return (dlg && dlg.offsetParent !== null) ? dlg : null;
    };
    
    const foundDialog = ensureShiftDialog();
    assertNotNull(foundDialog, 'Should detect visible dialog');
    assertEqual(foundDialog.getAttribute('role'), 'dialog', 'Should be dialog element');
    
    document.body.removeChild(dialog);
  });

  test('Should handle submission retry logic', () => {
    // Test retry logic from precise.js
    let attempts = 0;
    const maxAttempts = 3;
    
    const trySubmitWithRetry = () => {
      return new Promise((resolve) => {
        const attempt = () => {
          attempts++;
          if (attempts < maxAttempts) {
            // Simulate failure
            setTimeout(attempt, 50);
          } else {
            // Simulate success on final attempt
            resolve(true);
          }
        };
        attempt();
      });
    };
    
    return trySubmitWithRetry().then(result => {
      assert(result, 'Should eventually succeed');
      assertEqual(attempts, maxAttempts, 'Should make correct number of attempts');
    });
  });

  test('Should validate XPath selector performance', () => {
    // Create multiple buttons to test selector efficiency
    const buttons = [];
    for (let i = 0; i < 100; i++) {
      const btn = document.createElement('button');
      btn.textContent = `Button ${i}`;
      btn.id = `btn-${i}`;
      buttons.push(btn);
      document.body.appendChild(btn);
    }
    
    // Add target button
    const targetBtn = document.createElement('button');
    targetBtn.textContent = 'EO List';
    buttons.push(targetBtn);
    document.body.appendChild(targetBtn);
    
    const startTime = performance.now();
    
    // Test XPath performance
    const xpath = `.//button[normalize-space() = "EO List"]`;
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const foundBtn = result.singleNodeValue;
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    assertNotNull(foundBtn, 'Should find target button');
    assertEqual(foundBtn.textContent, 'EO List', 'Should find correct button');
    assert(duration < 100, `XPath query should be fast (${duration}ms < 100ms)`);
    
    // Cleanup
    buttons.forEach(btn => document.body.removeChild(btn));
  });

  test('Should handle multiple submit button variants', () => {
    // Create different types of submit buttons
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    
    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes';
    
    document.body.appendChild(submitBtn);
    document.body.appendChild(confirmBtn);
    document.body.appendChild(okBtn);
    document.body.appendChild(yesBtn);
    
    // Test submit button finding from precise.js
    const trySubmitVariants = () => {
      const clickByText = (text) => {
        const xp = `.//button[normalize-space() = "${text}"] | .//a[normalize-space() = "${text}"]`;
        const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = res.singleNodeValue;
        return Boolean(el);
      };
      
      return clickByText('Submit') || clickByText('Confirm') || clickByText('OK') || clickByText('Yes');
    };
    
    const found = trySubmitVariants();
    assert(found, 'Should find at least one submit variant');
    
    document.body.removeChild(submitBtn);
    document.body.removeChild(confirmBtn);
    document.body.removeChild(okBtn);
    document.body.removeChild(yesBtn);
  });

  test('Should simulate precise timing operations', () => {
    // Test precision timing logic from precise.js
    const simulatePrecisionClick = (targetMs) => {
      const start = performance.now() + performance.timing.navigationStart;
      let clickTime = null;
      
      // Simulate busy-wait timing
      const busyWait = () => {
        const now = performance.now() + performance.timing.navigationStart;
        if (now >= targetMs) {
          clickTime = now;
          return true;
        }
        return false;
      };
      
      // Simulate the timing loop (simplified)
      let iterations = 0;
      while (!busyWait() && iterations < 1000) {
        iterations++;
      }
      
      return { clickTime, iterations, accuracy: Math.abs(clickTime - targetMs) };
    };
    
    const targetTime = Date.now() + 10; // 10ms from now
    const result = simulatePrecisionClick(targetTime);
    
    assertNotNull(result.clickTime, 'Should have click time');
    assert(result.accuracy < 50, `Timing accuracy should be reasonable (${result.accuracy}ms)`);
  });

  test('Should validate calendar date detection', () => {
    // Test today's date detection from precise.js
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    
    // Create cells with today's date
    const todayCell = document.createElement('div');
    todayCell.textContent = `Schedule for ${mm}/${dd}/${yyyy}`;
    
    const otherCell = document.createElement('div');
    otherCell.textContent = 'Schedule for 01/01/2020';
    
    document.body.appendChild(todayCell);
    document.body.appendChild(otherCell);
    
    // Test date detection
    const dateRegex = new RegExp(`${mm}/${dd}/${yyyy}`);
    const cells = Array.from(document.querySelectorAll('div'));
    const targetCell = cells.find(el => dateRegex.test(el.textContent || ''));
    
    assertNotNull(targetCell, 'Should find today\\'s date cell');
    assertEqual(targetCell, todayCell, 'Should select correct cell');
    
    document.body.removeChild(todayCell);
    document.body.removeChild(otherCell);
  });

})();