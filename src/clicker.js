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
      await sleep(500);
      if (!isLoginPage()) return true;
    }
    return false;
  }

  function clickButtonByText(root, text) {
    log('Looking for button with text:', text);
    
    // Try multiple XPath strategies
    const xpathStrategies = [
      `.//button[normalize-space() = "${text}"] | .//a[normalize-space() = "${text}"]`,
      `.//*[self::button or self::a][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${text.toLowerCase()}")]`,
      `.//*[self::button or self::a or self::input[@type='button']][contains(., "${text}")]`,
      `.//button[contains(@class, "btn")] | .//a[contains(@class, "btn")] | .//*[@role="button"]`,
      `.//*[contains(text(), "${text}") or contains(@value, "${text}") or contains(@title, "${text}") or contains(@aria-label, "${text}")]`
    ];
    
    for (const xpath of xpathStrategies) {
      try {
        const result = document.evaluate(xpath, root || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
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
        const elements = Array.from((root || document).querySelectorAll(selector));
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
    
    log('Button not found:', text);
    return false;
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

  async function ensureShiftDialog() {
    for (let i = 0; i < 5; i += 1) {
      const dlg = document.querySelector('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content');
      if (dlg && dlg.offsetParent !== null) return dlg;
      await sleep(300);
    }
    return null;
  }

  async function run() {
    // If on login page, attempt to login using Chrome's saved credentials
    if (isLoginPage()) {
      log('Detected login page, trying to submit.');
      const ok = await trySubmitLogin();
      if (!ok) return; // cannot proceed until logged in
      // Give time to reach roster after login
      await sleep(1000);
    }

    // If a dialog is not open, try to open a shift cell.
    let dialog = document.querySelector('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content');
    if (!dialog || dialog.offsetParent === null) {
      await tryOpenAnyShift();
      dialog = await ensureShiftDialog();
    }
    if (!dialog) {
      log('No shift dialog found.');
      return;
    }

    // Click EO List
    const clickedEO = clickButtonByText(dialog, 'EO List') || clickButtonByText(document.body, 'EO List');
    if (!clickedEO) {
      log('EO List button not found');
      return;
    }
    await sleep(500);

    // Click Submit on the EO modal (if available)
    const clickedSubmit = clickButtonByText(document.body, 'Submit') || clickButtonByText(document.body, 'Confirm');
    if (!clickedSubmit) {
      log('Submit not available yet.');
      return;
    }
    log('Submitted EO.');
  }

  try { await run(); } catch (e) { console.error(e); }
})();


