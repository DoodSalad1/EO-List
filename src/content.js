// Content script: injects an "EO ASAP" button into the shift dialog and communicates
// with the background worker to schedule or trigger the EO action.

(() => {
  const VR_URL = 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster';

  function log(...args) {
    console.log('[EO List]', ...args);
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
    const candidates = Array.from(document.querySelectorAll('button, a, .k-button, .btn'));
    return candidates.find(el => /\bEO\s*List\b/i.test(el.textContent || '')) || null;
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
    const cells = Array.from(document.querySelectorAll('td, div'));
    const target = cells.find(el => /\b\d{1,2}:\d{2}\s*(am|pm)\b/i.test(el.textContent || ''));
    if (target) {
      target.click();
      await new Promise(r => setTimeout(r, 400));
      const dlg = queryShiftDialog();
      if (dlg) ensureButton(dlg);
      return true;
    }
    return false;
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
    const dialog = queryShiftDialog();
    if (!dialog) return;
    ensureButton(dialog);
  }

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
        <button id="eo-cancel-btn" class="eo-asap-btn eo-cancel-btn" title="Cancel scheduled EO">Cancel</button>
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
    if (!status || (!status.next && !status.nextPre)) {
      panel._current = null;
      text.textContent = 'No EO scheduled.';
      return;
    }
    const when = status.next ? new Date(status.next.fireTime) : null;
    const pre = status.nextPre ? new Date(status.nextPre.preTime) : null;
    panel._current = status.next || null;
    if (pre && when) {
      text.textContent = `Precision: ${pre.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} → EO ${when.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} (${status.next.dateISO})`;
    } else if (when) {
      text.textContent = `Next EO: ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${status.next.dateISO})`;
    } else {
      text.textContent = 'Preparing…';
    }
  }
})();


