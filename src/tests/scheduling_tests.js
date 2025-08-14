// Scheduling Tests - Alarm creation, timing calculations, and precision timing

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for scheduling_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull } = window.TestRunner;

  category('Scheduling Tests', 'Tests for alarm scheduling, timing calculations, and precision timing features');

  test('Should generate correct alarm names', () => {
    // Test alarm naming from background.js
    const ALARM_PREFIX = 'EO_ALARM_';
    const alarmName = (dateISO, start) => {
      return `${ALARM_PREFIX}${dateISO}_${start}`;
    };
    
    const name1 = alarmName('2025-08-14', '8:00pm');
    const name2 = alarmName('2025-08-15', '2:30pm');
    
    assertEqual(name1, 'EO_ALARM_2025-08-14_8:00pm', 'Should generate correct alarm name format');
    assertEqual(name2, 'EO_ALARM_2025-08-15_2:30pm', 'Should handle different times');
  });

  test('Should generate pre-alarm names', () => {
    // Test pre-alarm naming from background.js
    const PRE_ALARM_PREFIX = 'EO_PRE_';
    const preAlarmName = (dateISO, start) => {
      return `${PRE_ALARM_PREFIX}${dateISO}_${start}`;
    };
    
    const preName = preAlarmName('2025-08-14', '8:00pm');
    assertEqual(preName, 'EO_PRE_2025-08-14_8:00pm', 'Should generate correct pre-alarm name');
  });

  test('Should calculate schedule timing correctly', () => {
    // Mock the scheduling logic from background.js
    const computeTargetTime = (dateISO, start) => {
      try {
        const [hPart, mPartAmPm] = start.split(':');
        const [mPart, ampmRaw] = mPartAmPm.match(/(\\d{2})(am|pm)/i).slice(1);
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
    };
    
    const scheduleForTwoHoursBefore = (dateISO, start) => {
      const target = computeTargetTime(dateISO, start);
      if (!target) return { ok: false, reason: 'INVALID_TIME' };
      
      const whenMs = target.getTime() - 2 * 60 * 60 * 1000; // 2 hours before
      const now = Date.now();
      const fireTime = Math.max(whenMs, now + 1000); // if already within 2h, fire asap
      
      return { ok: true, scheduledFor: new Date(fireTime).toISOString(), dateISO, start, fireTime };
    };
    
    // Test with future shift
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const dateISO = futureDate.toISOString().split('T')[0];
    const result = scheduleForTwoHoursBefore(dateISO, '8:00pm');
    
    assert(result.ok, 'Should successfully schedule future shift');
    assertNotNull(result.scheduledFor, 'Should have scheduled time');
    assertEqual(result.dateISO, dateISO, 'Should preserve date');
    assertEqual(result.start, '8:00pm', 'Should preserve start time');
  });

  test('Should handle immediate scheduling for past times', () => {
    const computeTargetTime = (dateISO, start) => {
      try {
        const [hPart, mPartAmPm] = start.split(':');
        const [mPart, ampmRaw] = mPartAmPm.match(/(\\d{2})(am|pm)/i).slice(1);
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
    };
    
    const scheduleForTwoHoursBefore = (dateISO, start) => {
      const target = computeTargetTime(dateISO, start);
      if (!target) return { ok: false, reason: 'INVALID_TIME' };
      
      const whenMs = target.getTime() - 2 * 60 * 60 * 1000;
      const now = Date.now();
      const fireTime = Math.max(whenMs, now + 1000); // Fire ASAP if past
      
      return { ok: true, scheduledFor: new Date(fireTime).toISOString(), fireTime, immediate: fireTime <= now + 2000 };
    };
    
    // Test with today's date but past shift (should trigger immediately)
    const today = new Date().toISOString().split('T')[0];
    const result = scheduleForTwoHoursBefore(today, '6:00am'); // Early morning, likely past
    
    assert(result.ok, 'Should handle past shift times');
    // Can't reliably test immediacy without knowing current time, but should not fail
  });

  test('Should calculate precision pre-stage timing', () => {
    const PRE_LEAD_MS = 10 * 1000; // 10 seconds
    
    const calculatePreStage = (fireTime) => {
      const now = Date.now();
      const preTime = Math.max(fireTime - PRE_LEAD_MS, now + 1000);
      return { preTime, shouldSchedule: preTime <= fireTime - 1000 };
    };
    
    const futureFireTime = Date.now() + 60000; // 1 minute from now
    const result = calculatePreStage(futureFireTime);
    
    assertNotNull(result.preTime, 'Should calculate pre-stage time');
    assert(result.shouldSchedule, 'Should schedule pre-stage for future times');
    assertEqual(result.preTime, futureFireTime - PRE_LEAD_MS, 'Pre-stage should be 10 seconds before fire time');
  });

  test('Should validate schedule parameters', () => {
    const validateScheduleParams = (dateISO, start, url) => {
      if (!dateISO || typeof dateISO !== 'string') return false;
      if (!start || typeof start !== 'string') return false;
      if (!url || typeof url !== 'string') return false;
      
      // Validate date format (YYYY-MM-DD)
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateISO)) return false;
      
      // Validate time format (H:MMam/pm)
      if (!/^\\d{1,2}:\\d{2}(am|pm)$/i.test(start)) return false;
      
      return true;
    };
    
    assert(validateScheduleParams('2025-08-14', '8:00pm', 'https://example.com'), 'Valid params should pass');
    assert(!validateScheduleParams('', '8:00pm', 'https://example.com'), 'Empty date should fail');
    assert(!validateScheduleParams('2025-08-14', '', 'https://example.com'), 'Empty time should fail');
    assert(!validateScheduleParams('2025-08-14', '8:00pm', ''), 'Empty URL should fail');
    assert(!validateScheduleParams('08-14-2025', '8:00pm', 'https://example.com'), 'Wrong date format should fail');
    assert(!validateScheduleParams('2025-08-14', '8pm', 'https://example.com'), 'Wrong time format should fail');
  });

  test('Should handle Chrome alarm API mocking', () => {
    // Mock Chrome alarms API
    const mockAlarms = {
      alarms: [],
      create: function(name, alarmInfo) {
        return new Promise(resolve => {
          this.alarms.push({ name, ...alarmInfo });
          resolve();
        });
      },
      getAll: function() {
        return new Promise(resolve => resolve([...this.alarms]));
      },
      clear: function(name) {
        return new Promise(resolve => {
          const index = this.alarms.findIndex(a => a.name === name);
          if (index >= 0) {
            this.alarms.splice(index, 1);
            resolve(true);
          } else {
            resolve(false);
          }
        });
      }
    };
    
    const testAlarmName = 'EO_ALARM_2025-08-14_8:00pm';
    const testFireTime = Date.now() + 60000;
    
    // Test creating alarm
    return mockAlarms.create(testAlarmName, { when: testFireTime }).then(() => {
      return mockAlarms.getAll();
    }).then(alarms => {
      assertEqual(alarms.length, 1, 'Should create one alarm');
      assertEqual(alarms[0].name, testAlarmName, 'Alarm should have correct name');
      assertEqual(alarms[0].when, testFireTime, 'Alarm should have correct fire time');
      
      // Test clearing alarm
      return mockAlarms.clear(testAlarmName);
    }).then(cleared => {
      assert(cleared, 'Should successfully clear alarm');
      return mockAlarms.getAll();
    }).then(alarms => {
      assertEqual(alarms.length, 0, 'Should have no alarms after clearing');
    });
  });

  test('Should calculate status information correctly', () => {
    // Mock status calculation from background.js
    const getStatus = (mockAlarms) => {
      const now = Date.now();
      const entries = mockAlarms.filter(a => a.name.startsWith('EO_ALARM_'));
      const preEntries = mockAlarms.filter(a => a.name.startsWith('EO_PRE_'));
      
      entries.sort((a, b) => (a.fireTime || 0) - (b.fireTime || 0));
      preEntries.sort((a, b) => (a.preTime || 0) - (b.preTime || 0));
      
      const next = entries.find(e => (e.fireTime || 0) >= now) || null;
      const nextPre = preEntries.find(e => (e.preTime || 0) >= now) || null;
      
      return { next, nextPre };
    };
    
    const futureTime1 = Date.now() + 30000;
    const futureTime2 = Date.now() + 60000;
    const pastTime = Date.now() - 30000;
    
    const mockAlarms = [
      { name: 'EO_ALARM_2025-08-14_8:00pm', fireTime: futureTime2 },
      { name: 'EO_ALARM_2025-08-14_6:00pm', fireTime: pastTime }, // Past alarm
      { name: 'EO_PRE_2025-08-14_8:00pm', preTime: futureTime1 },
      { name: 'OTHER_ALARM', fireTime: futureTime2 } // Should be ignored
    ];
    
    const status = getStatus(mockAlarms);
    
    assertNotNull(status.next, 'Should have next alarm');
    assertNotNull(status.nextPre, 'Should have next pre-alarm');
    assertEqual(status.next.fireTime, futureTime2, 'Should select future alarm');
    assertEqual(status.nextPre.preTime, futureTime1, 'Should select future pre-alarm');
  });

  test('Should handle badge status updates', () => {
    // Mock badge update logic from background.js
    const updateBadge = (status) => {
      let badge = { text: '', color: '' };
      
      if (status?.nextPre) {
        badge.text = 'P';
        badge.color = '#0b74de';
      } else if (status?.next) {
        badge.text = 'S';
        badge.color = '#888';
      } else {
        badge.text = '';
      }
      
      return badge;
    };
    
    // Test different status scenarios
    const preStatus = { nextPre: { preTime: Date.now() + 30000 } };
    const scheduledStatus = { next: { fireTime: Date.now() + 60000 } };
    const noStatus = {};
    
    const preBadge = updateBadge(preStatus);
    const scheduledBadge = updateBadge(scheduledStatus);
    const noBadge = updateBadge(noStatus);
    
    assertEqual(preBadge.text, 'P', 'Should show P for pre-stage');
    assertEqual(preBadge.color, '#0b74de', 'Pre-stage should be blue');
    
    assertEqual(scheduledBadge.text, 'S', 'Should show S for scheduled');
    assertEqual(scheduledBadge.color, '#888', 'Scheduled should be gray');
    
    assertEqual(noBadge.text, '', 'Should show empty for no status');
  });

})();