// Injected runner that attempts to click EO List → Submit if available.

(async () => {
  const log = (...a) => console.log('[EO Runner]', ...a);

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // DOM Structure Caching System for Maximum Speed
  const DOM_CACHE = {
    version: '2.0',
    timestamp: 0,
    pageHash: '',
    elements: {
      shiftDialogs: [],
      eoButtons: [],
      submitButtons: [],
      modals: []
    },
    selectors: {
      working: new Map(), // selector -> {lastSuccess, useCount, avgTime}
      failed: new Set()   // selectors that consistently fail
    },
    performance: {
      cacheHits: 0,
      cacheMisses: 0,
      avgCacheTime: 0,
      avgSearchTime: 0
    }
  };

  // Generate DOM structure hash for cache validation
  function generatePageHash() {
    try {
      // Create hash based on key DOM structure elements
      const keyElements = [
        document.title,
        document.querySelector('body')?.className || '',
        document.querySelectorAll('script').length,
        document.querySelectorAll('div').length
      ];
      const structure = keyElements.join('|');
      return btoa(structure).substring(0, 16);
    } catch (e) {
      return 'fallback_hash';
    }
  }

  // Check if DOM cache is still valid
  function isDOMCacheValid() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes max cache age
    const currentHash = generatePageHash();
    
    const isValid = (
      DOM_CACHE.timestamp > 0 &&
      now - DOM_CACHE.timestamp < maxAge &&
      DOM_CACHE.pageHash === currentHash
    );
    
    if (!isValid && DOM_CACHE.timestamp > 0) {
      log('🔄 DOM cache invalidated - page structure changed');
    }
    
    return isValid;
  }

  // Cache element with metadata for learning
  function cacheElementStructure(key, element, selector, searchTime = 0) {
    if (!element || !selector) return;
    
    try {
      const elementData = {
        selector: selector,
        tagName: element.tagName,
        className: element.className,
        textContent: (element.textContent || '').substring(0, 50),
        position: {
          x: element.offsetLeft,
          y: element.offsetTop,
          width: element.offsetWidth,
          height: element.offsetHeight
        },
        parent: element.parentElement?.tagName || '',
        cached: Date.now(),
        searchTime: searchTime
      };
      
      // Store in elements cache
      if (!DOM_CACHE.elements[key]) {
        DOM_CACHE.elements[key] = [];
      }
      
      // Remove old entries for this key (keep only latest)
      DOM_CACHE.elements[key] = [elementData];
      
      // Update selector performance tracking
      const existing = DOM_CACHE.selectors.working.get(selector);
      if (existing) {
        existing.useCount++;
        existing.lastSuccess = Date.now();
        existing.avgTime = (existing.avgTime + searchTime) / 2;
      } else {
        DOM_CACHE.selectors.working.set(selector, {
          lastSuccess: Date.now(),
          useCount: 1,
          avgTime: searchTime
        });
      }
      
      DOM_CACHE.selectors.failed.delete(selector);
      log(`📦 Cached ${key}:`, selector, `(${searchTime}ms search)`);
      
    } catch (error) {
      log('⚠️ Cache storage error:', error.message);
    }
  }

  // Try to use cached element for instant access
  function tryUseCachedElement(key, expectedText = '') {
    if (!isDOMCacheValid()) {
      return null;
    }
    
    const cached = DOM_CACHE.elements[key];
    if (!cached || cached.length === 0) {
      return null;
    }
    
    const startTime = performance.now();
    
    for (const elementData of cached) {
      try {
        const element = document.querySelector(elementData.selector);
        
        if (element && element.offsetParent !== null) {
          // Verify element still matches cached properties
          const textMatches = !expectedText || 
            (element.textContent || '').toLowerCase().includes(expectedText.toLowerCase());
          
          const structureMatches = 
            element.tagName === elementData.tagName &&
            element.textContent?.substring(0, 20) === elementData.textContent?.substring(0, 20);
          
          if (textMatches && structureMatches) {
            const cacheTime = performance.now() - startTime;
            DOM_CACHE.performance.cacheHits++;
            DOM_CACHE.performance.avgCacheTime = 
              (DOM_CACHE.performance.avgCacheTime + cacheTime) / 2;
              
            log(`⚡ Cache hit for ${key}: ${elementData.selector} (${cacheTime.toFixed(1)}ms)`);
            return element;
          }
        }
      } catch (error) {
        log(`⚠️ Cached element failed for ${key}:`, error.message);
      }
    }
    
    // Cache miss - remove invalid entries
    DOM_CACHE.elements[key] = [];
    DOM_CACHE.performance.cacheMisses++;
    return null;
  }

  // Generate optimized selector for caching
  function generateOptimizedSelector(element) {
    try {
      const selectors = [];
      
      // Strategy 1: ID selector (most reliable)
      if (element.id) {
        selectors.push(`#${element.id}`);
      }
      
      // Strategy 2: Class-based selector (reliable for consistent UI)
      if (element.className) {
        const classes = Array.from(element.classList).filter(c => 
          !c.includes('hover') && 
          !c.includes('active') && 
          !c.includes('focus') &&
          !c.includes('selected') &&
          c.length > 2
        );
        
        if (classes.length > 0 && classes.length <= 3) {
          selectors.push(`${element.tagName.toLowerCase()}.${classes.join('.')}`);
        }
      }
      
      // Strategy 3: Attribute-based selector
      const role = element.getAttribute('role');
      const type = element.getAttribute('type');
      if (role) {
        selectors.push(`${element.tagName.toLowerCase()}[role="${role}"]`);
      }
      if (type) {
        selectors.push(`${element.tagName.toLowerCase()}[type="${type}"]`);
      }
      
      // Strategy 4: Position-based selector (last resort)
      const parent = element.parentElement;
      if (parent && parent.children.length <= 10) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element);
        if (index >= 0) {
          selectors.push(`${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-child(${index + 1})`);
        }
      }
      
      // Return the most specific selector that's not overly complex
      return selectors[0] || element.tagName.toLowerCase();
      
    } catch (error) {
      log('⚠️ Selector generation error:', error.message);
      return element.tagName?.toLowerCase() || 'unknown';
    }
  }

  // Initialize DOM cache system
  function initDOMCache() {
    try {
      const stored = localStorage.getItem('eo_dom_cache');
      if (stored) {
        const parsedCache = JSON.parse(stored);
        if (parsedCache.version === DOM_CACHE.version) {
          // Restore performance metrics and working selectors
          Object.assign(DOM_CACHE.performance, parsedCache.performance || {});
          
          if (parsedCache.selectors?.working) {
            for (const [selector, data] of Object.entries(parsedCache.selectors.working)) {
              DOM_CACHE.selectors.working.set(selector, data);
            }
          }
          
          log('📦 Loaded DOM cache from storage');
        } else {
          log('🔄 Cache version mismatch, starting fresh');
        }
      }
    } catch (error) {
      log('⚠️ Failed to load DOM cache:', error.message);
    }
    
    // Update cache state
    DOM_CACHE.timestamp = Date.now();
    DOM_CACHE.pageHash = generatePageHash();
  }

  // Save DOM cache to storage
  function saveDOMCache() {
    try {
      DOM_CACHE.timestamp = Date.now();
      DOM_CACHE.pageHash = generatePageHash();
      
      // Convert Map to object for storage
      const cacheToStore = {
        ...DOM_CACHE,
        selectors: {
          working: Object.fromEntries(DOM_CACHE.selectors.working),
          failed: Array.from(DOM_CACHE.selectors.failed)
        }
      };
      
      localStorage.setItem('eo_dom_cache', JSON.stringify(cacheToStore));
      log(`💾 Saved DOM cache (${DOM_CACHE.performance.cacheHits} hits, ${DOM_CACHE.performance.cacheMisses} misses)`);
    } catch (error) {
      log('⚠️ Failed to save DOM cache:', error.message);
    }
  }

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
    const searchStartTime = performance.now();
    log('Looking for button with text:', text);
    
    // Debug: Log the search context
    const searchRoot = root || document;
    log('Search context:', searchRoot === document ? 'entire document' : 'dialog/root element');
    
    // Enhanced fast path: Try DOM cache first (new system)
    const domCacheKey = `button_${text.toLowerCase().replace(/\s+/g, '_')}`;
    const cachedElement = tryUseCachedElement(domCacheKey, text);
    if (cachedElement) {
      try {
        cachedElement.click();
        log(`⚡ DOM cache hit - clicked in ${(performance.now() - searchStartTime).toFixed(1)}ms`);
        return true;
      } catch (error) {
        log('⚠️ Cached element click failed:', error.message);
      }
    }
    
    // Legacy cache fallback
    const legacyCacheKey = `button_cache_${text.toLowerCase().replace(/\s+/g, '_')}`;
    if (tryFastClick(searchRoot, text, legacyCacheKey)) {
      return true;
    }
    
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
          const searchTime = performance.now() - searchStartTime;
          log('Found button with XPath:', xpath, 'element:', el.tagName, el.textContent?.trim(), `(${searchTime.toFixed(1)}ms)`);
          
          // Cache with both systems for learning and fallback
          setCachedSelector(legacyCacheKey, el, searchRoot);
          
          // Enhanced DOM cache with performance tracking
          const optimizedSelector = generateOptimizedSelector(el);
          cacheElementStructure(domCacheKey, el, optimizedSelector, searchTime);
          
          DOM_CACHE.performance.avgSearchTime = 
            (DOM_CACHE.performance.avgSearchTime + searchTime) / 2;
          
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
          const searchTime = performance.now() - searchStartTime;
          log('Found button with CSS selector:', selector, 'element:', el.tagName, el.textContent?.trim(), `(${searchTime.toFixed(1)}ms)`);
          
          // Cache with both systems for learning and fallback
          setCachedSelector(legacyCacheKey, el, searchRoot);
          
          // Enhanced DOM cache with performance tracking
          const optimizedSelector = generateOptimizedSelector(el);
          cacheElementStructure(domCacheKey, el, optimizedSelector, searchTime);
          
          DOM_CACHE.performance.avgSearchTime = 
            (DOM_CACHE.performance.avgSearchTime + searchTime) / 2;
          
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

  // Test mode configuration for retry logic testing
  function getTestConfig() {
    const testConfig = localStorage.getItem('eo_test_config');
    if (testConfig) {
      try {
        return JSON.parse(testConfig);
      } catch (e) {
        log('⚠️ Invalid test config, using defaults');
      }
    }
    return {
      failEOButtonAttempts: 0,    // How many EO button clicks should fail
      failSubmitAttempts: 0,      // How many submit attempts should fail
      successRate: 0.7,           // Success rate for verification (0.0 to 1.0)
      simulateTimeout: false      // Simulate extremely slow responses
    };
  }

  // Success verification with comprehensive logging and test mode
  async function verifySubmissionSuccess(testMode = false) {
    log('🔍 Starting EO submission verification...');
    
    if (testMode) {
      log('🧪 TEST MODE: Simulating success verification');
      const config = getTestConfig();
      
      if (config.simulateTimeout) {
        log('🐌 TEST: Simulating slow verification...');
        await sleep(2500); // Longer than normal verification window
      }
      
      // Simulate success/failure based on config
      const simulatedSuccess = Math.random() < config.successRate;
      await sleep(config.simulateTimeout ? 100 : 500); // Simulate verification time
      log(simulatedSuccess ? '✅ TEST: Simulated successful submission' : '❌ TEST: Simulated failed submission');
      return simulatedSuccess;
    }
    
    const successIndicators = [
      // Check if already on EO list (highest priority)
      {
        name: 'Already on EO list confirmation',
        check: () => {
          return checkAlreadyOnEOList();
        }
      },
      
      // Text-based confirmation patterns
      {
        name: 'Success text confirmation',
        check: () => {
          const bodyText = document.body.textContent || '';
          const patterns = [
            /successfully added to.*early out/i,
            /you are now on.*eo list/i,
            /added to.*eo.*list/i,
            /early out.*request.*submitted/i,
            /you\s+are\s+on\s+the\s+list\s+for\s+eo/i  // Add the exact pattern from screenshot
          ];
          return patterns.some(pattern => pattern.test(bodyText));
        }
      },
      
      // Modal/dialog state changes
      {
        name: 'EO modal disappeared',
        check: () => {
          const eoModals = document.querySelectorAll('div[role="dialog"], .modal, .k-window-content');
          const visibleModals = Array.from(eoModals).filter(modal => 
            modal.offsetParent !== null && 
            (modal.textContent || '').includes('EO')
          );
          return visibleModals.length === 0;
        }
      },
      
      // Button state changes
      {
        name: 'EO button text changed',
        check: () => {
          const buttons = document.querySelectorAll('button, a, [role="button"]');
          return Array.from(buttons).some(btn => {
            const text = (btn.textContent || '').toLowerCase();
            return text.includes('remove') && text.includes('eo') ||
                   text.includes('cancel') && text.includes('eo');
          });
        }
      },
      
      // Success/confirmation elements
      {
        name: 'Confirmation elements',
        check: () => {
          const confirmSelectors = [
            '.success-message', '.confirmation', '.alert-success',
            '.notification-success', '[class*="success"]'
          ];
          return confirmSelectors.some(selector => {
            const elements = document.querySelectorAll(selector);
            return Array.from(elements).some(el => 
              el.offsetParent !== null && 
              /eo|early.*out/i.test(el.textContent || '')
            );
          });
        }
      }
    ];
    
    // Check indicators over 2-second window
    for (let i = 0; i < 20; i++) {
      for (const indicator of successIndicators) {
        try {
          if (indicator.check()) {
            log(`✅ EO submission success verified: ${indicator.name}`);
            return true;
          }
        } catch (error) {
          log(`⚠️ Error checking ${indicator.name}:`, error.message);
        }
      }
      
      if (i % 5 === 0) { // Log every 500ms
        log(`🔄 Verification attempt ${i + 1}/20...`);
      }
      
      await sleep(100);
    }
    
    log('❌ Could not verify EO submission success after 2 seconds');
    log('📊 Final state check:');
    
    // Log final state for debugging
    successIndicators.forEach(indicator => {
      try {
        const result = indicator.check();
        log(`  ${indicator.name}: ${result ? '✅' : '❌'}`);
      } catch (error) {
        log(`  ${indicator.name}: ⚠️ Error - ${error.message}`);
      }
    });
    
    return false;
  }

  // Retry logic with comprehensive infinite loop protection
  async function submitEOWithRetry(maxAttempts = 3, retryDelay = 1000) {
    log('🔄 Starting EO submission with retry logic...');
    
    // Infinite loop prevention - multiple safety mechanisms
    const startTime = Date.now();
    const maxTotalTime = 30000; // 30 second absolute hard limit
    let totalSleepTime = 0;
    const maxSleepTime = 10000; // Limit total sleep time to 10 seconds
    
    // Validate inputs to prevent infinite loops
    if (maxAttempts > 10) {
      log('⚠️ Limiting maxAttempts to 10 for safety');
      maxAttempts = 10;
    }
    if (retryDelay > 5000) {
      log('⚠️ Limiting retryDelay to 5000ms for safety');
      retryDelay = 5000;
    }
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Time-based circuit breaker - hard stop
      const elapsed = Date.now() - startTime;
      if (elapsed > maxTotalTime) {
        log(`🚨 Retry timeout reached (${elapsed}ms) - aborting to prevent infinite loop`);
        return { 
          success: false, 
          error: 'Timeout exceeded', 
          attempts: attempt - 1,
          elapsed: elapsed
        };
      }
      
      log(`🔄 EO submission attempt ${attempt}/${maxAttempts} (elapsed: ${elapsed}ms)`);
      
      // Step 1: Click EO List button (with test mode simulation)
      let clickedEO = false;
      const isTestMode = window.location.href.includes('test') || 
                        localStorage.getItem('eo_test_mode') === 'true';
      
      if (isTestMode) {
        const config = getTestConfig();
        
        // Simulate EO button failures for testing retry logic
        if (attempt <= config.failEOButtonAttempts) {
          log(`🧪 TEST: Simulating EO button failure on attempt ${attempt}`);
          clickedEO = false;
        } else {
          log(`🧪 TEST: Simulating EO button success on attempt ${attempt}`);
          clickedEO = true;
        }
      } else {
        // Real EO button clicking logic
        const dialog = await ensureShiftDialog();
        
        if (dialog) {
          clickedEO = clickButtonByText(dialog, 'EO List');
        }
        if (!clickedEO) {
          clickedEO = clickButtonByText(document.body, 'EO List');
        }
      }
      
      if (!clickedEO) {
        log(`❌ Attempt ${attempt}: EO List button not found`);
        if (attempt < maxAttempts && totalSleepTime < maxSleepTime) {
          const sleepTime = Math.min(retryDelay, maxSleepTime - totalSleepTime);
          totalSleepTime += sleepTime;
          log(`💤 Waiting ${sleepTime}ms before retry (total sleep: ${totalSleepTime}ms)`);
          await sleep(sleepTime);
        }
        continue;
      }
      
      log(`✅ Successfully clicked EO List button on attempt ${attempt}`);
      
      // Step 2: Submit with verification
      const submitResult = await waitForEOModalAndSubmit();
      
      // Handle successful submission with verification
      if (submitResult?.clicked && submitResult?.verified) {
        log(`✅ EO submission successful and verified on attempt ${attempt}!`);
        return { 
          success: true, 
          attempts: attempt, 
          verified: true,
          elapsed: Date.now() - startTime
        };
      }
      
      // Handle successful submission but unverified
      if (submitResult?.clicked && !submitResult?.verified) {
        log(`⚠️ Attempt ${attempt}: Submitted but verification failed - assuming success`);
        return { 
          success: true, 
          attempts: attempt, 
          verified: false,
          elapsed: Date.now() - startTime
        };
      }
      
      // Handle submission failure
      log(`❌ Attempt ${attempt}: Submit failed - ${submitResult?.error || 'unknown error'}`);
      
      // Don't delay after last attempt, and respect sleep limits
      if (attempt < maxAttempts && totalSleepTime < maxSleepTime) {
        const sleepTime = Math.min(retryDelay, maxSleepTime - totalSleepTime);
        totalSleepTime += sleepTime;
        log(`💤 Waiting ${sleepTime}ms before retry (total sleep: ${totalSleepTime}ms)`);
        await sleep(sleepTime);
      }
    }
    
    const finalElapsed = Date.now() - startTime;
    log(`❌ All EO submission attempts failed after ${finalElapsed}ms`);
    return { 
      success: false, 
      error: 'Max attempts reached', 
      attempts: maxAttempts,
      elapsed: finalElapsed
    };
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
          
          // Verify submission success
          const isTestMode = window.location.href.includes('test') || 
                           localStorage.getItem('eo_test_mode') === 'true';
          const verified = await verifySubmissionSuccess(isTestMode);
          
          return {
            clicked: true,
            verified: verified,
            timestamp: Date.now()
          };
        }
      }
      
      // Wait a bit before trying again (optimized)
      await sleep(25);
    }
    
    log('Timeout waiting for Submit button to appear');
    return {
      clicked: false,
      verified: false,
      error: 'Submit button timeout'
    };
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

  // Check if already on EO list to prevent unnecessary submissions
  function checkAlreadyOnEOList() {
    log('Checking if already on EO list...');
    
    // Multiple strategies to detect "already on EO list" status
    const strategies = [
      // Strategy 1: Look for explicit "You are on the list for EO" text
      () => {
        const bodyText = document.body.textContent || '';
        return /you\s+are\s+on\s+the\s+list\s+for\s+eo/i.test(bodyText);
      },
      
      // Strategy 2: Look for modal/dialog with EO confirmation
      () => {
        const modals = document.querySelectorAll('div[role="dialog"], .modal, .k-window-content, .ui-dialog-content');
        return Array.from(modals).some(modal => {
          const text = modal.textContent || '';
          return modal.offsetParent !== null && /you\s+are\s+on\s+the\s+list\s+for\s+eo/i.test(text);
        });
      },
      
      // Strategy 3: Look for status indicators or checkmarks near EO
      () => {
        const statusElements = document.querySelectorAll('.status, .confirmation, [class*="success"], [class*="confirm"]');
        return Array.from(statusElements).some(el => {
          const text = el.textContent || '';
          return el.offsetParent !== null && 
                 (/eo/i.test(text) && (/list/i.test(text) || /confirmed/i.test(text) || /added/i.test(text)));
        });
      },
      
      // Strategy 4: Look for any container with both "EO" and "list" confirmation text
      () => {
        const allContainers = document.querySelectorAll('div, span, p, section');
        return Array.from(allContainers).some(container => {
          const text = container.textContent || '';
          const isVisible = container.offsetParent !== null;
          return isVisible && 
                 /eo/i.test(text) && 
                 (/on.*list/i.test(text) || /list.*for/i.test(text) || /added.*to.*list/i.test(text));
        });
      }
    ];
    
    for (const strategy of strategies) {
      try {
        if (strategy()) {
          log('✅ Already on EO list detected!');
          return true;
        }
      } catch (error) {
        log('⚠️ Error in EO list detection strategy:', error.message);
      }
    }
    
    log('❌ Not currently on EO list');
    return false;
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

    // CRITICAL: Check if already on EO list before attempting submission
    if (checkAlreadyOnEOList()) {
      log('🎉 Already on EO list - no submission needed!');
      
      // Send success result to background script
      try {
        const successMessage = {
          type: 'EO_SUBMISSION_RESULT',
          payload: {
            success: true,
            verified: true,
            attempts: 0,
            elapsed: 0,
            error: null,
            timestamp: Date.now(),
            url: window.location.href,
            alreadyOnList: true
          }
        };
        chrome.runtime.sendMessage(successMessage);
        log('📤 Sent "already on list" status to background script');
      } catch (error) {
        log('⚠️ Failed to send already-on-list status:', error.message);
      }
      
      return; // Exit early - no need to attempt submission
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

    // Use retry logic for enhanced reliability (handles entire EO submission flow)
    const retryResult = await submitEOWithRetry(3, 1500); // 3 attempts, 1.5s delay
    
    // Handle comprehensive retry results
    if (retryResult.success) {
      if (retryResult.verified) {
        log(`🎉 EO submission successful and verified after ${retryResult.attempts} attempt(s) in ${retryResult.elapsed}ms!`);
      } else {
        log(`⚠️ EO submission completed after ${retryResult.attempts} attempt(s) but verification failed`);
        log('🔍 Manual verification recommended - check portal for EO status');
      }
    } else {
      log(`❌ EO submission failed after ${retryResult.attempts} attempt(s): ${retryResult.error}`);
      log(`⏱️ Total time elapsed: ${retryResult.elapsed}ms`);
      log('Final state - available dialogs and buttons:');
      debugLogAvailableButtons(document);
    }
    
    // Send result to background script for notifications and persistence
    try {
      const resultMessage = {
        type: 'EO_SUBMISSION_RESULT',
        payload: {
          success: retryResult.success,
          verified: retryResult.verified || false,
          attempts: retryResult.attempts || 0,
          elapsed: retryResult.elapsed || 0,
          error: retryResult.error || null,
          timestamp: Date.now(),
          url: window.location.href
        }
      };
      chrome.runtime.sendMessage(resultMessage);
      log('📤 Sent submission result to background script');
    } catch (error) {
      log('⚠️ Failed to send result to background script:', error.message);
    }
  }

  // Initialize DOM cache system
  initDOMCache();
  
  // Auto-save cache periodically and on page unload
  const saveInterval = setInterval(saveDOMCache, 30000); // Every 30 seconds
  
  window.addEventListener('beforeunload', () => {
    clearInterval(saveInterval);
    saveDOMCache();
  });
  
  try { 
    await run(); 
    
    // Save cache after successful run
    saveDOMCache();
    
    // Log performance statistics
    const { cacheHits, cacheMisses, avgCacheTime, avgSearchTime } = DOM_CACHE.performance;
    if (cacheHits + cacheMisses > 0) {
      const hitRate = ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1);
      log(`📊 DOM Cache Performance: ${hitRate}% hit rate, avg cache: ${avgCacheTime.toFixed(1)}ms, avg search: ${avgSearchTime.toFixed(1)}ms`);
    }
  } catch (e) { 
    console.error(e); 
    saveDOMCache(); // Save cache even on error
  }
})();


