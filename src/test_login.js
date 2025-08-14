(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function isLoginPage(){
    const pass = document.getElementById('txtPassword') || document.querySelector('input#Password, input[name="Password"], input[type="password"]');
    const user = document.getElementById('txtUserName') || document.querySelector('input#Username, input[name="Username"], input[name*="user" i], input[id*="user" i], input[type="email"], input[type="text"]');
    const signInBtn = document.getElementById('cmdLogin') || document.querySelector('button, input[type="submit"]');
    return (pass && user) || /Sign\s*in/i.test(document.body.innerText) || Boolean(signInBtn);
  }

  async function doLogin(){
    let { eoCreds } = await chrome.storage.local.get('eoCreds');
    if (!eoCreds) ({ eoCreds } = await chrome.storage.sync.get('eoCreds'));
    if (!eoCreds) return { ok:false, reason:'NO_CREDS' };
    const user = document.getElementById('txtUserName') || document.querySelector('input#Username, input[name="Username"], input[name*="user" i], input[id*="user" i], input[type="email"], input[type="text"]');
    const pass = document.getElementById('txtPassword') || document.querySelector('input#Password, input[name="Password"], input[type="password"]');
    if (!user || !pass) return { ok:false, reason:'NO_FIELDS' };
    user.focus(); user.value = eoCreds.username; user.dispatchEvent(new Event('input', { bubbles: true }));
    pass.focus(); pass.value = eoCreds.password; pass.dispatchEvent(new Event('input', { bubbles: true }));
    const submit = document.getElementById('cmdLogin') || document.querySelector('button[type="submit"], input[type="submit"], button');
    if (submit) submit.click(); else if (pass.form) pass.form.requestSubmit();
    for (let i=0;i<20;i++){ await sleep(500); if (!isLoginPage()) return { ok:true }; }
    return { ok:false, reason:'STILL_LOGIN' };
  }

  let result = { ok:true, reason:'ALREADY_LOGGED_IN' };
  try {
    if (isLoginPage()) result = await doLogin();
  } catch (e) {
    result = { ok:false, reason: 'ERR:' + (e && e.message ? e.message : String(e)) };
  }
  chrome.runtime.sendMessage({ type: 'EO_TEST_LOGIN_RESULT', payload: result });
})();


