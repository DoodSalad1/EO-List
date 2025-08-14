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
    const xpath = `.//button[normalize-space() = "${text}"] | .//a[normalize-space() = "${text}"] | .//*[self::button or self::a][contains(., "${text}")]`;
    const result = document.evaluate(xpath, root || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const el = result.singleNodeValue;
    if (el) el.click();
    return Boolean(el);
  }

  async function tryOpenAnyShift() {
    // Click the first visible shift cell for today or the targeted date.
    // Heuristics: cells with a time range like "8:00pm - 4:00am".
    const cells = Array.from(document.querySelectorAll('td, div'));
    const target = cells.find(el => /\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}/i.test(el.textContent || ''));
    if (target) {
      target.click();
      await sleep(400);
      return true;
    }
    return false;
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


