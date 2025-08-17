// Background service worker: schedules alarms and coordinates automation.

const ALARM_PREFIX = 'EO_ALARM_';
// Precision pre-stage to prepare the page just before exact time
const PRE_ALARM_PREFIX = 'EO_PRE_';
const PRE_LEAD_MS = 10 * 1000; // 10 seconds lead
let lastTestTabId = null;
const LOGIN_URL = 'https://vr.hollywoodcasinocolumbus.com/ess/login.aspx';

// Native messaging host name
const NATIVE_HOST = 'com.eolist.scheduler';

// Native messaging functions
async function sendToNativeHost(message) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    
    port.onMessage.addListener((response) => {
      resolve(response);
    });
    
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Native host disconnected: ${chrome.runtime.lastError.message}`));
      } else {
        reject(new Error('Native host disconnected unexpectedly'));
      }
    });
    
    port.postMessage(message);
  });
}

async function scheduleWithNativeHost(dateISO, start, url) {
  try {
    const response = await sendToNativeHost({
      type: 'SCHEDULE_EO',
      payload: { dateISO, start, url }
    });
    return response;
  } catch (error) {
    console.error('[EO Native] Failed to schedule with native host:', error);
    return { success: false, error: error.message, native: false };
  }
}

async function cancelWithNativeHost(dateISO, start) {
  try {
    const response = await sendToNativeHost({
      type: 'CANCEL_EO',
      payload: { dateISO, start }
    });
    return response;
  } catch (error) {
    console.error('[EO Native] Failed to cancel with native host:', error);
    return { success: false, error: error.message };
  }
}

async function getScheduledFromNativeHost() {
  try {
    const response = await sendToNativeHost({
      type: 'GET_SCHEDULED',
      payload: {}
    });
    return response;
  } catch (error) {
    console.error('[EO Native] Failed to get scheduled from native host:', error);
    return { success: false, scheduled: [] };
  }
}

function alarmName(dateISO, start) {
  return `${ALARM_PREFIX}${dateISO}_${start}`;
}

async function scheduleForTwoHoursBefore(dateISO, start, url) {
  const target = computeTargetTime(dateISO, start);
  if (!target) return { ok: false, reason: 'INVALID_TIME' };

  const whenMs = target.getTime() - 2 * 60 * 60 * 1000;
  const now = Date.now();
  const fireTime = Math.max(whenMs, now + 1000); // if already within 2h, fire asap
  const preTime = Math.max(fireTime - PRE_LEAD_MS, now + 1000);

  // Schedule with both Chrome alarms (fallback) and native host (reliable)
  const name = alarmName(dateISO, start);
  await chrome.alarms.create(name, { when: fireTime });
  await chrome.storage.local.set({ [name]: { dateISO, start, url, fireTime } });
  
  // Precision pre-stage alarm
  const preName = `${PRE_ALARM_PREFIX}${dateISO}_${start}`;
  if (preTime <= fireTime - 1000) {
    await chrome.alarms.create(preName, { when: preTime });
    await chrome.storage.local.set({ [preName]: { dateISO, start, url, fireTime, preTime } });
  }

  // Schedule with native host for system-level reliability
  const nativeResult = await scheduleWithNativeHost(dateISO, start, url);
  
  await broadcastStatus();
  
  return { 
    ok: true, 
    scheduledFor: new Date(fireTime).toISOString(), 
    dateISO, 
    start, 
    preTimeISO: preTime ? new Date(preTime).toISOString() : null,
    nativeScheduled: nativeResult.success || false,
    nativeError: nativeResult.error || null
  };
}

function computeTargetTime(dateISO, start) {
  // dateISO: YYYY-MM-DD, start like '8:00pm'
  try {
    const [hPart, mPartAmPm] = start.split(':');
    const [mPart, ampmRaw] = mPartAmPm.match(/(\d{2})(am|pm)/i).slice(1);
    let hour = parseInt(hPart, 10);
    const minute = parseInt(mPart, 10);
    const ampm = ampmRaw.toLowerCase();
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const dt = new Date(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
    return dt;
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'EO_SCHEDULE_OR_RUN') {
    const { dateISO, start, url } = msg.payload;
    scheduleForTwoHoursBefore(dateISO, start, url).then(r => {
      sendResponse(r);
      if (r.ok && Date.now() >= new Date(r.scheduledFor).getTime() - 1500) {
        // If firing soon/asap, also trigger a run attempt now
        triggerRun(dateISO, start, url);
      }
    });
    return true; // async
  }
  if (msg?.type === 'EO_NOTIFY') {
    const { title, message } = msg.payload || {};
    try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon48.png', title: title || 'EO List', message: message || '' }); } catch {}
  }
  if (msg?.type === 'EO_TEST_LOGIN') {
    const url = msg?.payload?.url || LOGIN_URL;
    (async () => {
      // Prefer an existing login tab, else any VR tab, else open new
      const tabs = await chrome.tabs.query({});
      const vrTabs = tabs.filter(t => typeof t.url === 'string' && t.url.includes('vr.hollywoodcasinocolumbus.com'));
      let tab = vrTabs.find(t => /\/ess\/login\.aspx/i.test(t.url));
      if (!tab) tab = vrTabs[0];
      if (!tab) tab = await chrome.tabs.create({ url });
      lastTestTabId = tab.openerTabId ? null : tab.id;
      // Bring tab to foreground
      try { await chrome.tabs.update(tab.id, { active: true }); } catch {}

      // Navigate explicitly to the login page to avoid post-login route
      try { await chrome.tabs.update(tab.id, { url: LOGIN_URL }); } catch {}

      // If already complete, inject immediately; otherwise inject after complete
      const current = await chrome.tabs.get(tab.id);
      const inject = async () => {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['src/test_login.js'] });
        } catch (e) {
          // As a fallback, try once more after a short delay
          setTimeout(async () => {
            try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['src/test_login.js'] }); } catch {}
          }, 500);
        }
      };
      if (current.status === 'complete') {
        await inject();
      } else {
        const listener = async (updatedTabId, info) => {
          if (updatedTabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            await inject();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      }
    })();
  }
  if (msg?.type === 'EO_TEST_LOGIN_RESULT') {
    chrome.runtime.sendMessage(msg); // forward to options page
    if (lastTestTabId != null) {
      try { chrome.tabs.remove(lastTestTabId); } catch {}
      lastTestTabId = null;
    }
  }
  if (msg?.type === 'EO_CANCEL') {
    const { dateISO, start } = msg.payload || {};
    cancelSchedule(dateISO, start).then(result => {
      sendResponse(result);
      if (result.ok) {
        try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon48.png', title: 'EO List', message: 'Scheduled EO canceled.' }); } catch {}
      }
    });
    return true;
  }
  if (msg?.type === 'EO_GET_STATUS') {
    getStatus().then(status => sendResponse(status));
    return true;
  }
  if (msg?.type === 'EO_SUBMISSION_RESULT') {
    handleSubmissionResult(msg.payload).then(() => {
      // Response not needed for submission results
    });
    return false; // No async response needed
  }
});

async function handleSubmissionResult(result) {
  try {
    // Store submission result with today's date as key
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const resultKey = `eo_result_${today}`;
    
    const submissionData = {
      ...result,
      dateISO: today,
      storedAt: Date.now()
    };
    
    await chrome.storage.local.set({ [resultKey]: submissionData });
    
    // Send appropriate notification based on result
    let notificationTitle = 'EO List';
    let notificationMessage = '';
    
    if (result.success) {
      if (result.alreadyOnList) {
        notificationTitle = '✅ EO Already Submitted';
        notificationMessage = 'You are already on the EO list - no further action needed!';
      } else if (result.verified) {
        notificationTitle = '✅ EO Success';
        notificationMessage = `Successfully added to EO list! (${result.attempts} attempt${result.attempts > 1 ? 's' : ''}, ${result.elapsed}ms)`;
      } else {
        notificationTitle = '⚠️ EO Submitted';
        notificationMessage = `EO submitted but verification failed. Please check portal to confirm. (${result.attempts} attempt${result.attempts > 1 ? 's' : ''})`;
      }
    } else {
      notificationTitle = '❌ EO Failed';
      notificationMessage = `EO submission failed after ${result.attempts} attempt${result.attempts > 1 ? 's' : ''}. ${result.error || 'Unknown error'}`;
    }
    
    // Send notification
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: notificationTitle,
        message: notificationMessage
      });
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
    }
    
    // Update badge to reflect submission status
    await updateBadge();
    
    // Broadcast updated status to all VR tabs
    await broadcastStatus();
    
    console.log('Handled submission result:', result.success ? 'SUCCESS' : 'FAILED');
    
  } catch (error) {
    console.error('Error handling submission result:', error);
  }
}

async function findOrCreateVRTab(url) {
  // Look for existing VR tabs
  const tabs = await chrome.tabs.query({});
  const vrTabs = tabs.filter(t => typeof t.url === 'string' && t.url.includes('vr.hollywoodcasinocolumbus.com'));
  
  // Prefer the active tab if it's a VR tab
  const activeTab = vrTabs.find(t => t.active);
  if (activeTab) {
    // Navigate to the target URL if needed
    if (!activeTab.url.includes('#/roster')) {
      await chrome.tabs.update(activeTab.id, { url });
    }
    // Bring tab to foreground
    await chrome.tabs.update(activeTab.id, { active: true });
    return await chrome.tabs.get(activeTab.id);
  }
  
  // Use any existing VR tab
  if (vrTabs.length > 0) {
    const existingTab = vrTabs[0];
    // Navigate to the target URL
    await chrome.tabs.update(existingTab.id, { url, active: true });
    return await chrome.tabs.get(existingTab.id);
  }
  
  // Only create new tab if no VR tabs exist
  return await chrome.tabs.create({ url, active: true });
}

async function triggerRun(dateISO, start, url) {
  // Try to find an existing VR tab instead of always creating new ones
  let tab = await findOrCreateVRTab(url);
  const tabId = tab.id;
  
  // Wait for the page to load before injecting runner
  const done = new Promise(resolve => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Add timeout to prevent infinite waiting
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
  
  // If tab was just created or navigated, wait for complete status
  if (tab.status !== 'complete') {
    await done;
  }
  
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/clicker.js']
  });
}

async function triggerPrewarm(dateISO, start, url) {
  // Use the same logic to find or create VR tab
  let tab = await findOrCreateVRTab(url);
  const tabId = tab.id;
  
  const done = new Promise(resolve => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Add timeout to prevent infinite waiting
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
  
  // If tab was just created or navigated, wait for complete status
  if (tab.status !== 'complete') {
    await done;
  }
  
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/prewarm.js']
  });
}

async function triggerPrecision(dateISO, start, url, fireTime) {
  // Use the same logic to find or create VR tab for precision timing
  let tab = await findOrCreateVRTab(url);
  const tabId = tab.id;
  
  const done = new Promise(resolve => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Add timeout to prevent infinite waiting
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
  
  // If tab was just created or navigated, wait for complete status
  if (tab.status !== 'complete') {
    await done;
  }
  
  // Send message to precise.js with target time
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/precise.js']
  });
  
  // Send precision timing message
  await chrome.tabs.sendMessage(tabId, {
    type: 'EO_PREP',
    payload: { targetMs: fireTime }
  });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name.startsWith(PRE_ALARM_PREFIX)) {
    const data = (await chrome.storage.local.get(alarm.name))[alarm.name];
    if (!data) return;
    await triggerPrecision(data.dateISO, data.start, data.url, data.fireTime);
    await updateBadge();
    return;
  }
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    const data = (await chrome.storage.local.get(alarm.name))[alarm.name];
    if (!data) return;
    await triggerRun(data.dateISO, data.start, data.url);
    try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon48.png', title: 'EO List', message: 'Attempting EO submission…' }); } catch {}
    await broadcastStatus();
  }
});

async function cancelSchedule(dateISO, start) {
  if (!dateISO || !start) return { ok: false };
  const name = alarmName(dateISO, start);
  const cleared = await chrome.alarms.clear(name);
  await chrome.storage.local.remove(name);
  // Remove pre-alarm as well if present
  const preName = `${PRE_ALARM_PREFIX}${dateISO}_${start}`;
  await chrome.alarms.clear(preName);
  await chrome.storage.local.remove(preName);
  
  // Cancel with native host as well
  const nativeResult = await cancelWithNativeHost(dateISO, start);
  
  await broadcastStatus();
  return { 
    ok: cleared, 
    nativeCanceled: nativeResult.success || false,
    nativeError: nativeResult.error || null
  };
}

async function getStatus() {
  const all = await chrome.alarms.getAll();
  const mainKeys = all.filter(a => a.name.startsWith(ALARM_PREFIX)).map(a => a.name);
  const preKeys = all.filter(a => a.name.startsWith(PRE_ALARM_PREFIX)).map(a => a.name);
  const store = await chrome.storage.local.get([...mainKeys, ...preKeys]);
  const entries = mainKeys.map(k => store[k]).filter(Boolean);
  const preEntries = preKeys.map(k => store[k]).filter(Boolean);
  const now = Date.now();
  
  // Debug logging for alarm investigation
  console.log('[EO Status Debug] Total alarms found:', all.length);
  console.log('[EO Status Debug] EO main alarms:', mainKeys);
  console.log('[EO Status Debug] EO pre-alarms:', preKeys);
  console.log('[EO Status Debug] Stored entries:', entries.map(e => ({ 
    dateISO: e.dateISO, 
    start: e.start, 
    fireTime: e.fireTime,
    fireDate: new Date(e.fireTime).toLocaleString()
  })));
  
  entries.sort((a, b) => (a.fireTime || 0) - (b.fireTime || 0));
  preEntries.sort((a, b) => (a.preTime || 0) - (b.preTime || 0));
  
  // Get next alarm (existing logic)
  const next = entries.find(e => (e.fireTime || 0) >= now) || null;
  const nextPre = preEntries.find(e => (e.preTime || 0) >= now) || null;
  
  // Get ALL future alarms for enhanced display
  const futureAlarms = entries.filter(e => (e.fireTime || 0) >= now);
  const futurePre = preEntries.filter(e => (e.preTime || 0) >= now);
  
  console.log('[EO Status Debug] Future alarms count:', futureAlarms.length);
  console.log('[EO Status Debug] Next alarm:', next ? `${next.dateISO} ${next.start}` : 'none');
  
  // Get today's submission result
  const today = new Date().toISOString().split('T')[0];
  const resultKey = `eo_result_${today}`;
  let todayResult = null;
  try {
    const resultData = await chrome.storage.local.get(resultKey);
    todayResult = resultData[resultKey] || null;
    console.log('[EO Status Debug] Today result:', todayResult ? 'found' : 'none');
  } catch (error) {
    console.error('Error fetching today\'s submission result:', error);
  }
  
  return { next, nextPre, todayResult, futureAlarms, futurePre };
}

async function broadcastStatus() {
  const status = await getStatus();
  const tabs = await chrome.tabs.query({ url: ['https://vr.hollywoodcasinocolumbus.com/*'] });
  for (const t of tabs) {
    try { await chrome.tabs.sendMessage(t.id, { type: 'EO_STATUS_UPDATED', payload: status }); } catch {}
  }
  await updateBadge(status);
}

async function updateBadge(status) {
  const s = status || await getStatus();
  
  // Check for today's submission result first (highest priority)
  const today = new Date().toISOString().split('T')[0];
  const resultKey = `eo_result_${today}`;
  try {
    const resultData = await chrome.storage.local.get(resultKey);
    if (resultData[resultKey]) {
      const result = resultData[resultKey];
      if (result.success) {
        // Green checkmark for successful submission
        await chrome.action.setBadgeText({ text: '✓' });
        await chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
        return;
      } else {
        // Red X for failed submission
        await chrome.action.setBadgeText({ text: '✗' });
        await chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
        return;
      }
    }
  } catch (error) {
    console.error('Error checking submission results for badge:', error);
  }
  
  // Fall back to existing alarm-based logic
  if (s?.nextPre) {
    try { await chrome.action.setBadgeText({ text: 'P' }); await chrome.action.setBadgeBackgroundColor({ color: '#0b74de' }); } catch {}
    return;
  }
  if (s?.next) {
    try { await chrome.action.setBadgeText({ text: 'S' }); await chrome.action.setBadgeBackgroundColor({ color: '#888' }); } catch {}
    return;
  }
  try { await chrome.action.setBadgeText({ text: '' }); } catch {}
}


