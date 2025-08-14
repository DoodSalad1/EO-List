(() => {
  const $ = id => document.getElementById(id);

  async function getCreds() {
    const local = await chrome.storage.local.get('eoCreds');
    if (local && local.eoCreds) return local.eoCreds;
    const sync = await chrome.storage.sync.get('eoCreds');
    return sync.eoCreds || null;
  }

  async function setCreds(creds) {
    await chrome.storage.local.set({ eoCreds: creds });
    try { await chrome.storage.sync.set({ eoCreds: creds }); } catch {}
  }

  async function load() {
    const creds = await getCreds();
    if (creds) {
      $('u').value = creds.username || '';
      $('p').value = creds.password || '';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await load();

    $('save').addEventListener('click', async () => {
      const creds = { username: $('u').value.trim(), password: $('p').value };
      await setCreds(creds);
      const status = document.getElementById('status');
      if (status) status.textContent = 'Saved.';
    });

    $('u').addEventListener('input', async () => {
      const creds = { username: $('u').value.trim(), password: $('p').value };
      await setCreds(creds);
    });

    $('p').addEventListener('input', async () => {
      const creds = { username: $('u').value.trim(), password: $('p').value };
      await setCreds(creds);
    });

    $('test').addEventListener('click', () => {
      const status = document.getElementById('status');
      if (status) status.textContent = 'Attempting login…';
      chrome.runtime.sendMessage({ type: 'EO_TEST_LOGIN', payload: { url: 'https://vr.hollywoodcasinocolumbus.com/ess/login.aspx' } });
      // Fallback: poll tabs in case the result message is missed
      let ticks = 0;
      const tid = setInterval(async () => {
        try {
          const tabs = await chrome.tabs.query({});
          const vr = tabs.find(t => typeof t.url === 'string' && t.url.includes('vr.hollywoodcasinocolumbus.com'));
          if (vr && !/\/ess\/login\.aspx/i.test(vr.url || '')) {
            clearInterval(tid);
            if (status) status.textContent = 'Login test OK.';
          }
        } catch {}
        if (++ticks > 20) { // ~10s
          clearInterval(tid);
        }
      }, 500);
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'EO_TEST_LOGIN_RESULT') {
        const r = msg.payload;
        const status = document.getElementById('status');
        if (status) status.textContent = r.ok ? 'Login test OK.' : ('Login test failed: ' + (r.reason || 'Unknown'));
      }
    });
  });
})();


