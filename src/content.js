// Content script: injects an "EO ASAP" button into the shift dialog and communicates
// with the background worker to schedule or trigger the EO action.

(() => {
  const VR_URL = 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster';

  function log(...args) {
    console.log('[EO List]', ...args);
  }

  function isOnRosterPage() {
    const currentUrl = window.location.href;
    
    // Check if we're on a login page (should not show buttons)
    if (/\/ess\/login\.aspx/i.test(currentUrl)) {
      return false;
    }
    
    // Check if we're on the roster page (target page for buttons)
    if (/#\/roster/i.test(currentUrl)) {
      return true;
    }
    
    // Also allow if we're on the main VR page (could navigate to roster)
    if (/\/ess\/Default\.aspx/i.test(currentUrl)) {
      return true;
    }
    
    // Default to false for other pages
    return false;
  }

  function queryShiftDialog() {
    // Look for a dialog that shows the shift details (based on screenshots)
    // It appears as a modal with a Close button and actions on the right.
    // We will search for any visible modal container.
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], .modal, .k-window, .k-window-content, .ui-dialog-content, .modal-dialog'));
    const visible = dialogs.find(d => d.offsetParent !== null);
    return visible || null;
  }

  function parseShiftDateTime(dialogEl) {
    // Attempt to parse the heading like: "Schedule for Sun 08/10/2025"
    const heading = dialogEl.querySelector('h3, h2, .modal-title, .k-window-title');
    let dateStr = null;
    if (heading) {
      const m = heading.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        dateStr = `${m[3]}-${m[1]}-${m[2]}`; // YYYY-MM-DD
      }
    }

    // Parse shift start time text like "8:00pm - 4:00am"
    const timeBlock = dialogEl.querySelector('[class*="time"], .shift-time, .k-window-content');
    let startStr = null;
    const timeText = dialogEl.textContent;
    const tm = timeText.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
    if (tm) {
      startStr = tm[1].toLowerCase().replace(/\s+/g, '');
    }

    if (!dateStr || !startStr) return null;

    return { dateISO: dateStr, start: startStr };
  }

  function findEOListButton() {
    // Multiple strategies to find EO List button with fallbacks
    const selectors = [
      'button, a, .k-button, .btn',
      '[role="button"]',
      'input[type="button"], input[type="submit"]',
      '*[onclick*="EO"], *[onclick*="eo"]'
    ];

    // Multiple text patterns to match various button formats
    const textPatterns = [
      /\bEO\s*List\b/i,           // "EO List" with word boundaries
      /EO.*List/i,                // "EO" followed by "List" 
      /Early.*Out.*List/i,        // "Early Out List"
      /^EO\s*$|^EO List$/i,       // Exact matches
      /EO/i                       // Just "EO" as last resort
    ];

    for (const selector of selectors) {
      try {
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
          
          if (button) {
            log('Found EO List button with pattern:', pattern, 'element:', button);
            return button;
          }
        }
      } catch (error) {
        log('Error searching with selector:', selector, error);
      }
    }
    
    log('No EO List button found with any pattern');
    return null;
  }

  function ensureButton(dialogEl) {
    // Place a button inside the dialog
    if (dialogEl && !dialogEl.querySelector('#eo-asap-btn')) {
      const btn = document.createElement('button');
      btn.id = 'eo-asap-btn';
      btn.textContent = 'EO ASAP';
      btn.className = 'eo-asap-btn';
      btn.addEventListener('click', () => handleAction(dialogEl));
      const actionsArea = dialogEl.querySelector('.modal-footer, .k-window-content, .actions, .btn-toolbar, .modal-content') || dialogEl;
      actionsArea.appendChild(btn);
    }

    // If we can find the native EO List button, place our EO ASAP right after it
    const eoNative = findEOListButton();
    if (eoNative && !document.getElementById('eo-asap-inline')) {
      const inline = document.createElement('button');
      inline.id = 'eo-asap-inline';
      inline.className = 'eo-asap-btn';
      inline.style.marginLeft = '8px';
      inline.textContent = 'EO ASAP';
      inline.addEventListener('click', () => handleAction(dialogEl || queryShiftDialog()));
      eoNative.parentElement?.insertBefore(inline, eoNative.nextSibling);
    }

    // Also add a floating button on the page to use when modal detection fails
    if (!document.getElementById('eo-asap-float')) {
      const floatBtn = document.createElement('button');
      floatBtn.id = 'eo-asap-float';
      floatBtn.className = 'eo-asap-btn eo-asap-float';
      floatBtn.textContent = 'EO ASAP';
      floatBtn.title = 'Schedule EO for the selected shift or attempt now';
      floatBtn.addEventListener('click', () => {
        const dialog = queryShiftDialog();
        if (!dialog) {
          // Try to open a shift cell automatically before prompting
          tryOpenCellThenInject();
          setTimeout(() => handleAction(queryShiftDialog()), 600);
        } else {
          handleAction(dialog);
        }
      });
      document.body.appendChild(floatBtn);
    }
  }

  async function tryOpenCellThenInject() {
    const target = findShiftCell();
    if (target) {
      log('Clicking shift cell:', target.textContent?.trim());
      target.click();
      await new Promise(r => setTimeout(r, 400));
      const dlg = queryShiftDialog();
      if (dlg) ensureButton(dlg);
      return true;
    }
    log('No shift cell found to open');
    return false;
  }

  function findShiftCell() {
    // Multiple strategies to find shift cells with various time formats
    const selectors = [
      'td, div',                    // Standard table cells and divs
      '.calendar-cell, .day-cell',  // Common calendar cell classes
      '[role="gridcell"]',          // Semantic calendar cells
      '.shift, .schedule-item',     // Schedule-specific classes
      '*[data-time], *[data-shift]' // Data attributes
    ];

    // Various time patterns the site might use
    const timePatterns = [
      /\b\d{1,2}:\d{2}\s*(am|pm)\b/i,                    // "8:00pm"
      /\b\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)\b/i, // "8:00pm - 4:00am"
      /\b\d{1,2}:\d{2}-\d{1,2}:\d{2}/i,                  // "20:00-04:00" (24hr)
      /\b\d{1,2}(:\d{2})?\s*(am|pm)/i,                   // "8pm" or "8:00pm"
      /\b(morning|afternoon|evening|night|am|pm)\b/i,    // Text-based times
      /\d{1,2}\/\d{1,2}\/\d{4}.*\d{1,2}:\d{2}/i,        // Date with time
      /shift|schedule|work/i                             // Schedule keywords
    ];

    for (const selector of selectors) {
      try {
        const cells = Array.from(document.querySelectorAll(selector));
        log(`Checking ${cells.length} cells with selector: ${selector}`);
        
        for (const pattern of timePatterns) {
          const target = cells.find(el => {
            const text = (el.textContent || '').trim();
            const title = (el.title || '').trim();
            const dataTime = (el.getAttribute('data-time') || '').trim();
            
            // Also check if element is clickable and visible
            const isClickable = el.tagName === 'TD' || el.tagName === 'DIV' || 
                               el.tagName === 'BUTTON' || el.tagName === 'A' ||
                               el.onclick || el.getAttribute('onclick') ||
                               el.style.cursor === 'pointer';
                               
            const isVisible = el.offsetParent !== null && 
                             el.style.display !== 'none' &&
                             el.style.visibility !== 'hidden';
            
            const hasTimePattern = pattern.test(text) || pattern.test(title) || pattern.test(dataTime);
            
            return hasTimePattern && isClickable && isVisible;
          });
          
          if (target) {
            log('Found shift cell with pattern:', pattern, 'text:', target.textContent?.trim());
            return target;
          }
        }
      } catch (error) {
        log('Error searching cells with selector:', selector, error);
      }
    }
    
    log('No shift cell found with any pattern');
    return null;
  }

  function handleAction(dialogEl) {
    const info = dialogEl ? parseShiftDateTime(dialogEl) : null;
    if (!info) {
      // Fallback: prompt for time if parsing fails
      const dateISO = prompt('EO List: Enter shift date (YYYY-MM-DD)');
      const start = prompt('EO List: Enter start time (e.g., 8:00pm)');
      if (!dateISO || !start) return;
      chrome.runtime.sendMessage(
        { type: 'EO_SCHEDULE_OR_RUN', payload: { url: VR_URL, dateISO, start: start.toLowerCase().replace(/\s+/g,'') } },
        resp => handleScheduleResponse(resp)
      );
      return;
    }
    log('Parsed', info);
    chrome.runtime.sendMessage(
      { type: 'EO_SCHEDULE_OR_RUN', payload: { url: VR_URL, dateISO: info.dateISO, start: info.start } },
      resp => handleScheduleResponse(resp)
    );
  }

  function scan() {
    // Only scan and inject buttons if we're on the roster page
    if (!isOnRosterPage()) {
      log('Not on roster page, skipping button injection');
      return;
    }
    
    const dialog = queryShiftDialog();
    if (!dialog) return;
    ensureButton(dialog);
  }

  // Only start observing and initialize if we're on the correct page
  if (isOnRosterPage()) {
    // Observe for modal openings
    const mo = new MutationObserver(() => scan());
    mo.observe(document.documentElement, { subtree: true, childList: true });
    scan();

    // ---- UI helpers ----
    initStatusPanel();
    chrome.runtime.sendMessage({ type: 'EO_GET_STATUS' }, (s) => updateStatusPanel(s));
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'EO_STATUS_UPDATED') {
        updateStatusPanel(msg.payload);
      }
    });
  } else {
    log('Not on roster page, extension functionality disabled');
  }

  function showToast(message, actions = []) {
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
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('visible'), 4500);
  }

  function handleScheduleResponse(resp) {
    if (!resp) {
      showToast('EO: schedule request sent.');
      return;
    }
    if (resp.ok) {
      const when = new Date(resp.scheduledFor);
      const diff = when.getTime() - Date.now();
      if (diff < 12000) {
        showToast('EO: Attempting now…');
        chrome.runtime.sendMessage({ type: 'EO_NOTIFY', payload: { title: 'EO List', message: 'Attempting EO now…' } });
      } else {
        const timeStr = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateISO = resp.dateISO;
        const start = resp.start;
        showToast(`EO scheduled for ${timeStr}`, [
          {
            text: 'Cancel',
            onClick: () => {
              chrome.runtime.sendMessage({ type: 'EO_CANCEL', payload: { dateISO, start } }, (r) => {
                showToast(r?.ok ? 'EO schedule canceled.' : 'Nothing to cancel.');
              });
            }
          }
        ]);
        chrome.runtime.sendMessage({ type: 'EO_NOTIFY', payload: { title: 'EO List', message: `Scheduled for ${timeStr}` } });
      }
    } else {
      showToast('EO: could not schedule (invalid time).');
    }
  }

  // ---- Status panel ----
  function initStatusPanel() {
    if (document.getElementById('eo-status')) return;
    const panel = document.createElement('div');
    panel.id = 'eo-status';
    panel.className = 'eo-status';
    panel.innerHTML = `
      <div class="eo-status-row">
        <span id="eo-status-text">No EO scheduled.</span>
        <button id="eo-cancel-btn" class="eo-asap-btn eo-cancel-btn" title="Cancel scheduled EO" style="display: none;">Cancel</button>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('#eo-cancel-btn').addEventListener('click', () => {
      const data = panel._current;
      if (!data) {
        showToast('Nothing to cancel.');
        return;
      }
      chrome.runtime.sendMessage({ type: 'EO_CANCEL', payload: { dateISO: data.dateISO, start: data.start } }, (r) => {
        showToast(r?.ok ? 'EO schedule canceled.' : 'Nothing to cancel.');
      });
    });
  }

  function updateStatusPanel(status) {
    const panel = document.getElementById('eo-status');
    if (!panel) return;
    const text = panel.querySelector('#eo-status-text');
    const cancelBtn = panel.querySelector('#eo-cancel-btn');
    
    if (!status || (!status.next && !status.nextPre)) {
      panel._current = null;
      text.textContent = 'No EO scheduled.';
      // Hide cancel button when no EO is scheduled
      if (cancelBtn) cancelBtn.style.display = 'none';
      return;
    }
    
    const when = status.next ? new Date(status.next.fireTime) : null;
    const pre = status.nextPre ? new Date(status.nextPre.preTime) : null;
    panel._current = status.next || null;
    
    // Show cancel button when EO is scheduled
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    
    if (pre && when) {
      text.textContent = `Precision: ${pre.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → EO ${when.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} (${status.next.dateISO})`;
    } else if (when) {
      text.textContent = `Next EO: ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${status.next.dateISO})`;
    } else {
      text.textContent = 'Preparing…';
    }
  }
})();


