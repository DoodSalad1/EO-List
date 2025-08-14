// Prepares page ~10s early and then clicks exactly at targetMs

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[EO Precise]', ...a);

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
    for (let i=0;i<20;i++){ await sleep(300); if (!isLogin()) return true; }
    return !isLogin();
  }

  function openFirstShiftCell() {
    // Prefer a shift cell with today’s date if visible
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateRegex = new RegExp(`${mm}/${dd}/${yyyy}`);
    const cells = Array.from(document.querySelectorAll('td, div'));
    let target = cells.find(el => dateRegex.test(el.textContent || ''));
    if (!target) target = cells.find(el => /\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}/i.test(el.textContent || ''));
    target?.click();
  }

  function clickByText(text) {
    const xp = `.//button[normalize-space() = "${text}"] | .//a[normalize-space() = "${text}"] | .//*[self::button or self::a][contains(., "${text}")]`;
    const res = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const el = res.singleNodeValue; if (el) el.click(); return !!el;
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
    const loop = () => {
      if (Date.now() - start > 2000) return;
      if (!trySubmitVariants()) setTimeout(loop, 50);
    };
    setTimeout(loop, 10);
  });
})();


