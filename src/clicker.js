// Injected runner that attempts to click EO List → Submit if available.

(async () => {
  const log = (...a) => console.log('[EO Runner]', ...a);

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function isLoginPage() {
    const text = document.body ? document.body.innerText || '' : '';
    const hasUser = document.getElementById('txtUserName') || document.querySelector('input[name*="user" i], input[id*="user" i], input[type="email"]');
    const hasPass = document.getElementById('txtPassword') || document.querySelector('input[type="password"]');
    return /sign\s*in/i.test(text) || (hasUser && hasPass);
  }

  async function trySubmitLogin() {
    // Use credentials stored via extension Options
    let { eoCreds } = await chrome.storage.local.get('eoCreds');
    if (!eoCreds) ({ eoCreds } = await chrome.storage.sync.get('eoCreds'));
    if (!eoCreds || !eoCreds.username || !eoCreds.password) {
      log('No stored credentials; cannot login automatically.');
      return false;
    }
    const user = document.getElementById('txtUserName') || document.querySelector('input[name*="user" i], input[id*="user" i], input[type="email"], input[type="text"]');
    const pass = document.getElementById('txtPassword') || document.querySelector('input[type="password"]');
    const submit = document.getElementById('cmdLogin') || document.querySelector('button[type="submit"], input[type="submit"], button');

    if (user) { user.focus(); user.value = eoCreds.username; user.dispatchEvent(new Event('input', { bubbles: true })); }
    if (pass) { pass.focus(); pass.value = eoCreds.password; pass.dispatchEvent(new Event('input', { bubbles: true })); }

    if (submit) submit.click();
    else if (pass && pass.form) pass.form.requestSubmit();
    else document.forms[0]?.requestSubmit?.();

    for (let i = 0; i < 30; i += 1) {
      await sleep(150);
      if (!isLoginPage()) return true;
    }
    return false;
  }

  function clickButtonByText(root, text) {
    log('Looking for button with text:', text);
    
    // Debug: Log the search context
    const searchRoot = root || document;
    log('Search context:', searchRoot === document ? 'entire document' : 'dialog/root element');
    
    // Optimized XPath strategies ordered by performance (fastest first)
    const lowerText = text.toLowerCase();
    const xpathStrategies = [
      // Fast: Exact text match on common elements
      `.//button[normalize-space() = "${text}"]`,
      `.//a[normalize-space() = "${text}"]`,
      
      // Fast: Attribute-based matching (no text processing)
      `.//button[@value = "${text}"]`,
      `.//input[@type='button'][@value = "${text}"]`,
      
      // Medium: Contains matching without case conversion
      `.//button[contains(., "${text}")]`,
      `.//a[contains(., "${text}")]`,
      
      // Medium: Role-based matching
      `.//*[@role="button"][contains(., "${text}")]`,
      
      // Slower: Multi-attribute search (split from expensive union)
      `.//*[contains(@value, "${text}") or contains(@title, "${text}") or contains(@aria-label, "${text}")]`
    ];
    
    for (const xpath of xpathStrategies) {
      try {
        const result = document.evaluate(xpath, searchRoot, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue;
        if (el) {
          log('Found button with XPath:', xpath, 'element:', el.tagName, el.textContent?.trim());
          el.click();
          return true;
        }
      } catch (error) {
        log('XPath error:', xpath, error.message);
      }
    }
    
    // Fallback: CSS selector approach
    const selectors = ['button', 'a', '[role="button"]', 'input[type="button"]', '.k-button', '.btn'];
    for (const selector of selectors) {
      try {
        const elements = Array.from(searchRoot.querySelectorAll(selector));
        log(`Found ${elements.length} elements with selector: ${selector}`);
        
        const el = elements.find(elem => {
          const content = (elem.textContent || '').trim();
          const value = (elem.value || '').trim();
          const title = (elem.title || '').trim();
          return content.toLowerCase().includes(text.toLowerCase()) ||
                 value.toLowerCase().includes(text.toLowerCase()) ||
                 title.toLowerCase().includes(text.toLowerCase());
        });
        
        if (el) {
          log('Found button with CSS selector:', selector, 'element:', el.tagName, el.textContent?.trim());
          el.click();
          return true;
        }
      } catch (error) {
        log('CSS selector error:', selector, error.message);
      }
    }
    
    // Enhanced debugging: Log all available buttons when search fails
    log('Button not found:', text);
    debugLogAvailableButtons(searchRoot);
    return false;
  }

  function debugLogAvailableButtons(root) {
    try {
      const allButtons = Array.from((root || document).querySelectorAll('button, a, [role="button"], input[type="button"], .btn, .k-button'));
      log('Available buttons for debugging:');
      allButtons.forEach((btn, index) => {
        const text = (btn.textContent || btn.value || 'no text').trim();
        const classes = btn.className || 'no classes';
        const id = btn.id || 'no id';
        log(`  ${index + 1}. "${text}" (${btn.tagName}, classes: ${classes}, id: ${id})`);
      });
      
      // Also log modal dialogs that might contain buttons
      const modals = Array.from(document.querySelectorAll('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content'));
      log('Available modals/dialogs:');
      modals.forEach((modal, index) => {
        const isVisible = modal.offsetParent !== null;
        const text = modal.textContent?.substring(0, 100) + '...';
        log(`  ${index + 1}. Modal visible: ${isVisible}, content preview: "${text}"`);
      });
      
      // Enhanced modal detection - look for any containers with EO-related content
      const allContainers = Array.from(document.querySelectorAll('div, section, article, [class*="modal"], [class*="dialog"], [class*="popup"]'));
      const eoContainers = allContainers.filter(container => {
        const text = container.textContent || '';
        const isVisible = container.offsetParent !== null;
        return isVisible && (text.includes('EO List') || text.includes('Early Out') || text.includes('Submit'));
      });
      
      log('EO-related containers found:');
      eoContainers.forEach((container, index) => {
        const classes = container.className || 'no classes';
        const id = container.id || 'no id';
        const text = container.textContent?.substring(0, 80) + '...';
        log(`  ${index + 1}. ${container.tagName} (classes: ${classes}, id: ${id}) content: "${text}"`);
      });
    } catch (error) {
      log('Error in debug logging:', error.message);
    }
  }

  async function tryOpenAnyShift() {
    log('Trying to open shift cell...');
    const target = findBestShiftCell();
    if (target) {
      log('Clicking shift cell:', target.textContent?.trim());
      target.click();
      await sleep(400);
      return true;
    }
    log('No shift cell found to click');
    return false;
  }

  function findBestShiftCell() {
    // Multiple strategies to find the best shift cell to click
    const strategies = [
      // Strategy 1: Look for today's shift specifically
      () => findTodaysShift(),
      
      // Strategy 2: Look for any shift with time range
      () => findShiftWithTimeRange(),
      
      // Strategy 3: Look for any clickable time element
      () => findAnyTimeElement(),
      
      // Strategy 4: Look for schedule-related elements
      () => findScheduleElement()
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result) {
          log('Found shift cell using strategy:', strategy.name);
          return result;
        }
      } catch (error) {
        log('Strategy failed:', strategy.name, error.message);
      }
    }

    return null;
  }

  function findTodaysShift() {
    const today = new Date();
    const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
    
    const selectors = ['td', 'div', '[role="gridcell"]', '.calendar-cell'];
    for (const selector of selectors) {
      const cells = Array.from(document.querySelectorAll(selector));
      const todayCell = cells.find(el => {
        const text = el.textContent || '';
        return text.includes(todayStr) && /\d{1,2}:\d{2}\s*(am|pm)/i.test(text);
      });
      
      if (todayCell && isElementClickable(todayCell)) {
        return todayCell;
      }
    }
    
    return null;
  }

  function findShiftWithTimeRange() {
    const timeRangePatterns = [
      /\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)/i,
      /\d{1,2}:\d{2}-\d{1,2}:\d{2}/i,
      /\d{1,2}(am|pm)\s*-\s*\d{1,2}(am|pm)/i
    ];

    const selectors = ['td', 'div', '.shift', '.schedule-item'];
    for (const selector of selectors) {
      const cells = Array.from(document.querySelectorAll(selector));
      for (const pattern of timeRangePatterns) {
        const cell = cells.find(el => {
          const text = el.textContent || '';
          return pattern.test(text) && isElementClickable(el);
        });
        
        if (cell) return cell;
      }
    }
    
    return null;
  }

  function findAnyTimeElement() {
    const timePatterns = [
      /\b\d{1,2}:\d{2}\s*(am|pm)\b/i,
      /\b\d{1,2}(am|pm)\b/i,
      /\b(morning|afternoon|evening|night)\b/i
    ];

    const selectors = ['td', 'div', 'button', 'a', '[role="gridcell"]'];
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const pattern of timePatterns) {
        const element = elements.find(el => {
          const text = el.textContent || '';
          return pattern.test(text) && isElementClickable(el);
        });
        
        if (element) return element;
      }
    }
    
    return null;
  }

  function findScheduleElement() {
    const scheduleKeywords = ['shift', 'schedule', 'work', 'roster', 'calendar'];
    const selectors = ['*[class*="shift"]', '*[class*="schedule"]', '*[id*="calendar"]', 'td', 'div'];
    
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      const element = elements.find(el => {
        const text = (el.textContent || '').toLowerCase();
        const className = (el.className || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        
        return scheduleKeywords.some(keyword => 
          text.includes(keyword) || className.includes(keyword) || id.includes(keyword)
        ) && isElementClickable(el);
      });
      
      if (element) return element;
    }
    
    return null;
  }

  function isElementClickable(el) {
    return el && 
           el.offsetParent !== null && 
           el.style.display !== 'none' &&
           el.style.visibility !== 'hidden' &&
           (el.tagName === 'TD' || el.tagName === 'DIV' || el.tagName === 'BUTTON' || 
            el.tagName === 'A' || el.onclick || el.getAttribute('onclick') ||
            el.style.cursor === 'pointer' || el.getAttribute('role') === 'button');
  }

  async function retrySubmitWithTimeout(timeoutMs) {
    const startTime = Date.now();
    const maxAttempts = Math.ceil(timeoutMs / 100); // One attempt per 100ms
    let attempts = 0;
    log('Starting Submit retry logic with timeout:', timeoutMs + 'ms');
    
    while (Date.now() - startTime < timeoutMs && attempts < maxAttempts) {
      attempts++;
      // Try multiple Submit button variations
      const submitVariants = ['Submit', 'Confirm', 'OK', 'Yes', 'Apply'];
      
      for (const variant of submitVariants) {
        const clicked = clickButtonByText(document.body, variant);
        if (clicked) {
          log('Successfully clicked Submit variant:', variant);
          await sleep(100); // Brief wait to let the action complete (optimized)
          return true;
        }
      }
      
      // Wait a bit before trying again (optimized)
      await sleep(25);
    }
    
    log('Submit retry timeout reached, no Submit button found');
    return false;
  }

  async function ensureShiftDialog() {
    log('Attempting to find shift dialog with improved selectors...');
    
    for (let i = 0; i < 5; i += 1) {
      // Try multiple strategies to find the dialog
      const strategies = [
        // Standard modal selectors
        () => document.querySelector('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content'),
        
        // Look for containers with shift-related buttons
        () => {
          const eoButton = document.querySelector('.di_eo_list');
          return eoButton ? eoButton.closest('div, section, article, .container, .dialog') : null;
        },
        
        // Look for containers with multiple shift action buttons
        () => {
          const shiftButtons = document.querySelectorAll('.di_swap_shift, .di_give_shift, .di_eo_list, .di_work_list');
          if (shiftButtons.length >= 2) {
            // Find common parent container
            const button = shiftButtons[0];
            return button.closest('div, section, article, .container, .dialog, .panel, .card');
          }
          return null;
        },
        
        // Look for any visible container with "EO List" text
        () => {
          const allDivs = Array.from(document.querySelectorAll('div, section, article'));
          return allDivs.find(div => {
            const text = div.textContent || '';
            const isVisible = div.offsetParent !== null;
            return isVisible && text.includes('EO List') && text.includes('Swap Shift');
          });
        }
      ];
      
      for (const strategy of strategies) {
        try {
          const dlg = strategy();
          if (dlg && dlg.offsetParent !== null) {
            log('Found dialog using strategy:', strategy.name || 'unnamed strategy', 'element:', dlg.tagName, dlg.className);
            return dlg;
          }
        } catch (error) {
          log('Strategy failed:', error.message);
        }
      }
      
      await sleep(75);
    }
    
    log('No shift dialog found with any strategy');
    return null;
  }

  async function waitForEOModalAndSubmit() {
    log('Waiting for EO modal to appear and attempting Submit...');
    const maxWaitTime = 5000; // 5 seconds max wait
    const startTime = Date.now();
    let attempts = 0;
    
    // Minimal wait for EO modal to load (optimized for speed)
    await sleep(200);
    
    while (Date.now() - startTime < maxWaitTime && attempts < 25) {
      attempts++;
      // Log current modal state with enhanced detection
      const modals = Array.from(document.querySelectorAll('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content'));
      const visibleModals = modals.filter(m => m.offsetParent !== null);
      
      // Also check for any new containers that might have appeared with EO content
      const eoModalCandidates = Array.from(document.querySelectorAll('div, section, article')).filter(container => {
        const text = container.textContent || '';
        const isVisible = container.offsetParent !== null;
        return isVisible && text.includes('I want to be on the list for EO');
      });
      
      log(`Modal check: ${visibleModals.length} standard modals, ${eoModalCandidates.length} EO modal candidates found`);
      
      if (eoModalCandidates.length > 0) {
        log('EO modal detected:', eoModalCandidates[0].textContent?.substring(0, 100) + '...');
      }
      
      // Try multiple Submit detection strategies
      const submitStrategies = [
        // Strategy 1: Look in EO modal candidates first
        () => {
          for (const modal of eoModalCandidates) {
            const found = tryFindSubmitInContainer(modal);
            if (found) {
              log('Found Submit in EO modal candidate');
              return found;
            }
          }
          return null;
        },
        
        // Strategy 2: Look in any visible modal
        () => {
          for (const modal of visibleModals) {
            const found = tryFindSubmitInContainer(modal);
            if (found) {
              log('Found Submit in visible modal');
              return found;
            }
          }
          return null;
        },
        
        // Strategy 3: Look for Submit in entire document
        () => {
          const found = tryFindSubmitInContainer(document);
          if (found) {
            log('Found Submit in document');
            return found;
          }
          return null;
        },
        
        // Strategy 4: Look for any new buttons that appeared
        () => {
          const submitButtons = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]'));
          const submitButton = submitButtons.find(btn => {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            const isVisible = btn.offsetParent !== null;
            return isVisible && (text.includes('submit') || text.includes('confirm') || text.includes('ok'));
          });
          
          if (submitButton) {
            log('Found Submit button in document scan');
            return submitButton;
          }
          return null;
        }
      ];
      
      for (const strategy of submitStrategies) {
        const submitButton = strategy();
        if (submitButton) {
          log('Clicking Submit button:', submitButton.textContent?.trim());
          submitButton.click();
          await sleep(100); // Wait for submission to process (optimized)
          return true;
        }
      }
      
      // Wait a bit before trying again (optimized)
      await sleep(25);
    }
    
    log('Timeout waiting for Submit button to appear');
    return false;
  }

  function tryFindSubmitInContainer(container) {
    const selectors = ['button', 'a', '[role="button"]', 'input[type="button"]', '.btn'];
    const submitTexts = ['submit', 'confirm', 'ok', 'yes', 'apply'];
    
    for (const selector of selectors) {
      try {
        const elements = Array.from(container.querySelectorAll(selector));
        for (const submitText of submitTexts) {
          const button = elements.find(elem => {
            const content = (elem.textContent || '').trim().toLowerCase();
            const value = (elem.value || '').trim().toLowerCase();
            const title = (elem.title || '').trim().toLowerCase();
            const isVisible = elem.offsetParent !== null;
            
            return isVisible && (content.includes(submitText) || value.includes(submitText) || title.includes(submitText));
          });
          
          if (button) {
            return button;
          }
        }
      } catch (error) {
        log('Error in tryFindSubmitInContainer:', error.message);
      }
    }
    
    return null;
  }

  async function run() {
    log('Starting EO automation run...');
    log('Current URL:', window.location.href);
    log('Page title:', document.title);
    
    // If on login page, attempt to login using Chrome's saved credentials
    if (isLoginPage()) {
      log('Detected login page, trying to submit.');
      const ok = await trySubmitLogin();
      if (!ok) {
        log('Login failed, cannot proceed');
        return;
      }
      log('Login successful, proceeding to roster');
      // Give time to reach roster after login (optimized)
      await sleep(300);
    }

    // Strategy 1: Look for existing open dialog first
    let dialog = await ensureShiftDialog();
    log('Initial dialog check:', dialog ? 'found dialog' : 'no dialog found');
    
    // Strategy 2: If no dialog found, try to open shift cell
    if (!dialog) {
      log('No visible dialog found, attempting to open shift cell...');
      const shiftOpened = await tryOpenAnyShift();
      if (shiftOpened) {
        log('Shift cell clicked, waiting for dialog...');
        await sleep(150); // Give dialog time to appear (optimized)
        dialog = await ensureShiftDialog();
      }
    }
    
    // Strategy 3: If we still don't have a dialog but can see EO List button, proceed anyway
    const eoListButton = document.querySelector('.di_eo_list');
    if (!dialog && !eoListButton) {
      log('❌ No shift dialog found and no EO List button visible. Available dialogs:');
      debugLogAvailableButtons(document);
      return;
    }
    
    if (dialog) {
      log('✅ Found shift dialog, proceeding with EO List click...');
    } else {
      log('⚠️ No dialog detected but EO List button found, proceeding with direct approach...');
    }

    // Click EO List - try both dialog context and document context
    let clickedEO = false;
    if (dialog) {
      clickedEO = clickButtonByText(dialog, 'EO List');
    }
    if (!clickedEO) {
      clickedEO = clickButtonByText(document.body, 'EO List');
    }
    
    if (!clickedEO) {
      log('❌ EO List button not found in dialog or document body');
      return;
    }
    
    log('✅ Successfully clicked EO List button, monitoring for EO modal...');
    
    // Enhanced Submit detection with modal monitoring
    const submitSuccess = await waitForEOModalAndSubmit();
    if (submitSuccess) {
      log('✅ Successfully submitted EO request!');
    } else {
      log('❌ Failed to submit EO - Submit button not found or not clickable.');
      log('Final state - available dialogs and buttons:');
      debugLogAvailableButtons(document);
    }
  }

  try { await run(); } catch (e) { console.error(e); }
})();


