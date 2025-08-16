// Prepares page ~10s early and then clicks exactly at targetMs

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[EO Precise]', ...a);

  // Button location caching utilities for speed optimization
  function getCachedSelector(key) {
    try {
      const cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  }

  function setCachedSelector(key, element, context) {
    try {
      if (!element || !context) return;
      
      // Generate relative selector options
      let selector = null;
      
      // Try class-based selector first (most reliable)
      if (element.className) {
        const classes = element.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
          selector = `.${classes.join('.')}`;
        }
      }
      
      // Fallback to tag + attribute selector
      if (!selector && element.tagName) {
        if (element.id) {
          selector = `#${element.id}`;
        } else if (element.getAttribute('role')) {
          selector = `${element.tagName.toLowerCase()}[role="${element.getAttribute('role')}"]`;
        } else {
          selector = element.tagName.toLowerCase();
        }
      }
      
      if (selector) {
        localStorage.setItem(key, JSON.stringify({
          selector: selector,
          verified: Date.now(),
          fallback: false
        }));
        log('Cached button selector:', key, selector);
      }
    } catch (e) {
      log('Failed to cache selector:', e.message);
    }
  }

  function tryFastClick(context, text, cacheKey) {
    const cached = getCachedSelector(cacheKey);
    if (!cached || !cached.selector) return false;
    
    try {
      const element = context.querySelector(cached.selector);
      if (element && element.offsetParent !== null) {
        // Verify text content matches (basic validation)
        const elementText = (element.textContent || '').toLowerCase();
        if (elementText.includes(text.toLowerCase())) {
          log('Fast click using cached selector:', cached.selector);
          element.click();
          return true;
        }
      }
    } catch (e) {
      log('Cached selector failed:', e.message);
    }
    
    return false;
  }

  function isLogin() {
    return document.getElementById('txtPassword') && document.getElementById('txtUserName');
  }

  async function ensureLoggedIn() {
    if (!isLogin()) return true;
    const { eoCreds } = await chrome.storage.local.get('eoCreds');
    const creds = eoCreds || (await chrome.storage.sync.get('eoCreds')).eoCreds;
    if (!creds) return false;
    const u = document.getElementById('txtUserName');
    const p = document.getElementById('txtPassword');
    u.value = creds.username; u.dispatchEvent(new Event('input', { bubbles: true }));
    p.value = creds.password; p.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.getElementById('cmdLogin') || document.querySelector('button[type="submit"], input[type="submit"], button');
    btn?.click();
    for (let i=0;i<20;i++){ await sleep(100); if (!isLogin()) return true; }
    return !isLogin();
  }

  function openFirstShiftCell() {
    log('Opening first shift cell...');
    
    // Prefer a shift cell with today's date if visible
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    const todayStr = `${mm}/${dd}/${yyyy}`;
    
    log('Looking for today\\'s date:', todayStr);
    
    const selectors = ['td', 'div', '[role="gridcell"]', '.calendar-cell', '.day-cell'];
    let target = null;
    
    // Strategy 1: Look for today's date
    for (const selector of selectors) {
      const cells = Array.from(document.querySelectorAll(selector));
      log(`Checking ${cells.length} cells with selector: ${selector}`);
      
      target = cells.find(el => {
        const text = el.textContent || '';
        return text.includes(todayStr) && /\d{1,2}:\d{2}\s*(am|pm)/i.test(text);
      });
      
      if (target) {
        log('Found today\\'s shift cell:', target.textContent?.trim());
        break;
      }
    }
    
    // Strategy 2: Look for any shift with time range
    if (!target) {
      log('No today cell found, looking for any time range...');
      const timePatterns = [
        /\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)/i,
        /\d{1,2}:\d{2}-\d{1,2}:\d{2}/i,
        /\d{1,2}:\d{2}\s*(am|pm)/i
      ];
      
      for (const selector of selectors) {
        const cells = Array.from(document.querySelectorAll(selector));
        for (const pattern of timePatterns) {
          target = cells.find(el => pattern.test(el.textContent || ''));
          if (target) {
            log('Found shift cell with pattern:', pattern, 'text:', target.textContent?.trim());
            break;
          }
        }
        if (target) break;
      }
    }
    
    if (target) {
      log('Clicking shift cell:', target.textContent?.trim());
      target.click();
    } else {
      log('No shift cell found to click');
      
      // Debug: show available cells
      const allCells = Array.from(document.querySelectorAll('td, div'));
      const cellsWithText = allCells.filter(c => (c.textContent || '').trim().length > 0);
      log('Available cells with text:', cellsWithText.slice(0, 10).map(c => `"${c.textContent?.trim()}"`));
    }
  }

  function clickByText(text) {
    log('Searching for button with text:', text);
    
    // Fast path: Try cached selector first
    const cacheKey = `button_cache_${text.toLowerCase().replace(/\s+/g, '_')}`;
    if (tryFastClick(document, text, cacheKey)) {
      return true;
    }
    
    // Optimized XPath strategies with performance logging
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
      
      // Slower: Multi-attribute search (optimized from union)
      `.//*[contains(@value, "${text}") or contains(@title, "${text}")]`
    ];
    
    for (const xpath of xpathStrategies) {
      try {
        const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = res.singleNodeValue;
        if (el) {
          log('Found element with XPath:', xpath, 'text content:', el.textContent?.trim());
          // Cache this successful find for future use
          setCachedSelector(cacheKey, el, document);
          el.click();
          return true;
        }
      } catch (error) {
        log('XPath error:', xpath, error.message);
      }
    }
    
    // Fallback: CSS selector approach with logging
    log('XPath failed, trying CSS selectors for:', text);
    const selectors = ['button', 'a', '[role="button"]', 'input[type="button"]', '.btn', '.k-button'];
    for (const selector of selectors) {
      try {
        const elements = Array.from(document.querySelectorAll(selector));
        log(`Found ${elements.length} elements with selector: ${selector}`);
        
        const el = elements.find(elem => {
          const content = (elem.textContent || '').trim().toLowerCase();
          const value = (elem.value || '').trim().toLowerCase();
          const title = (elem.title || '').trim().toLowerCase();
          const searchText = text.toLowerCase();
          
          return content.includes(searchText) || value.includes(searchText) || title.includes(searchText);
        });
        
        if (el) {
          log('Found element with CSS selector:', selector, 'text content:', el.textContent?.trim());
          // Cache this successful find for future use
          setCachedSelector(cacheKey, el, document);
          el.click();
          return true;
        }
      } catch (error) {
        log('CSS selector error:', selector, error.message);
      }
    }
    
    log('Button not found with any method:', text);
    
    // Debug: log all available buttons
    const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]'));
    log('Available buttons on page:', allButtons.map(b => `"${(b.textContent || b.value || 'no text').trim()}"`));
    
    return false;
  }

  function trySubmitVariants() {
    return clickByText('Submit') || clickByText('Confirm') || clickByText('OK') || clickByText('Yes');
  }

  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'EO_PREP') return;
    const targetMs = msg.payload?.targetMs;
    if (!targetMs) return;

    await ensureLoggedIn();
    openFirstShiftCell();

    // Busy-wait last 120ms for precision (limit CPU)
    const now = () => performance.now() + performance.timing.navigationStart;
    let remaining = targetMs - Date.now();
    if (remaining > 300) await sleep(remaining - 300);
    while (now() < targetMs - 20) { /* spin lightly */ }
    while (now() < targetMs) { /* tight spin */ }

    // Click EO List and then Submit immediately with retries for 2s
    clickByText('EO List');
    const start = Date.now();
    let attempts = 0;
    const loop = () => {
      if (Date.now() - start > 2000 || attempts >= 40) return;
      attempts++;
      if (!trySubmitVariants()) setTimeout(loop, 10);
    };
    setTimeout(loop, 2);
  });
})();


