// Error Handling Tests - Edge cases, network failures, and error recovery

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for error_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull } = window.TestRunner;

  category('Error Handling Tests', 'Tests for edge cases, network failures, missing elements, and error recovery scenarios');

  test('Should handle missing DOM elements gracefully', () => {
    // Test when expected elements are not found
    const safeQuerySelector = (selector, fallbackSelectors = []) => {
      let element = document.querySelector(selector);
      if (!element && fallbackSelectors.length > 0) {
        for (const fallback of fallbackSelectors) {
          element = document.querySelector(fallback);
          if (element) break;
        }
      }
      return element;
    };

    // Test with no elements present
    const missingBtn = safeQuerySelector('#non-existent-button', ['button', '.btn']);
    assertEqual(missingBtn, null, 'Should return null for missing elements');

    // Test with fallback selectors
    const testBtn = document.createElement('button');
    testBtn.className = 'btn';
    document.body.appendChild(testBtn);

    const foundBtn = safeQuerySelector('#non-existent-button', ['button', '.btn']);
    assertNotNull(foundBtn, 'Should find element using fallback selector');
    assertEqual(foundBtn, testBtn, 'Should return correct fallback element');

    document.body.removeChild(testBtn);
  });

  test('Should handle malformed time strings', () => {
    const parseTimeRobust = (timeStr) => {
      if (!timeStr || typeof timeStr !== 'string') return null;
      
      try {
        // Try various time formats
        const patterns = [
          /(\d{1,2}):(\d{2})\s*(am|pm)/i,
          /(\d{1,2})\s*(am|pm)/i,
          /(\d{1,2}):(\d{2})/
        ];

        for (const pattern of patterns) {
          const match = timeStr.match(pattern);
          if (match) {
            let hour = parseInt(match[1], 10);
            const minute = match[2] ? parseInt(match[2], 10) : 0;
            const ampm = match[3] ? match[3].toLowerCase() : '';

            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;

            // Validate hour and minute ranges
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
              return { hour, minute, valid: true };
            }
          }
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    // Test valid formats
    const validTime = parseTimeRobust('8:30pm');
    assertNotNull(validTime, 'Should parse valid time');
    assertEqual(validTime.hour, 20, 'Should convert PM hour correctly');
    assertEqual(validTime.minute, 30, 'Should parse minutes correctly');

    // Test malformed formats
    const malformedTimes = ['', null, undefined, '25:00pm', '8:70am', 'not a time', '8pm:30', '8:'];
    malformedTimes.forEach(time => {
      const result = parseTimeRobust(time);
      assert(result === null, `Malformed time "${time}" should return null`);
    });
  });

  test('Should handle date parsing edge cases', () => {
    const parseDateRobust = (dateStr) => {
      if (!dateStr || typeof dateStr !== 'string') return null;
      
      try {
        const patterns = [
          /(\d{2})\/(\d{2})\/(\d{4})/,  // MM/DD/YYYY
          /(\d{4})-(\d{2})-(\d{2})/,    // YYYY-MM-DD
          /(\d{1,2})\/(\d{1,2})\/(\d{4})/ // M/D/YYYY
        ];

        for (const pattern of patterns) {
          const match = dateStr.match(pattern);
          if (match) {
            let year, month, day;
            
            if (pattern.toString().includes('\\d{4}.*\\d{2}.*\\d{2}')) {
              // YYYY-MM-DD format
              year = parseInt(match[1], 10);
              month = parseInt(match[2], 10);
              day = parseInt(match[3], 10);
            } else {
              // MM/DD/YYYY format
              month = parseInt(match[1], 10);
              day = parseInt(match[2], 10);
              year = parseInt(match[3], 10);
            }

            // Validate date ranges
            if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
              return { year, month, day, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
            }
          }
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    // Test valid dates
    const validDate = parseDateRobust('08/14/2025');
    assertNotNull(validDate, 'Should parse valid date');
    assertEqual(validDate.iso, '2025-08-14', 'Should convert to ISO format');

    // Test invalid dates
    const invalidDates = ['', null, undefined, '13/01/2025', '01/32/2025', 'not a date', '2025/08/14'];
    invalidDates.forEach(date => {
      const result = parseDateRobust(date);
      assert(result === null, `Invalid date "${date}" should return null`);
    });
  });

  test('Should handle Chrome API failures', async () => {
    // Mock Chrome APIs that might fail
    const mockChromeAPI = {
      storage: {
        local: {
          get: () => Promise.reject(new Error('Storage quota exceeded')),
          set: () => Promise.reject(new Error('Storage not available'))
        }
      },
      alarms: {
        create: () => { throw new Error('Alarm API not available'); },
        getAll: () => Promise.resolve([])
      }
    };

    // Test storage failure handling
    const safeStorageGet = async (key) => {
      try {
        return await mockChromeAPI.storage.local.get(key);
      } catch (error) {
        console.warn('Storage get failed:', error.message);
        return {}; // Return empty object as fallback
      }
    };

    const result = await safeStorageGet('testKey');
    assertEqual(typeof result, 'object', 'Should return object even on storage failure');

    // Test alarm creation failure handling
    const safeAlarmCreate = (name, alarmInfo) => {
      try {
        mockChromeAPI.alarms.create(name, alarmInfo);
        return { ok: true };
      } catch (error) {
        console.warn('Alarm creation failed:', error.message);
        return { ok: false, error: error.message };
      }
    };

    const alarmResult = safeAlarmCreate('test-alarm', { when: Date.now() + 1000 });
    assert(!alarmResult.ok, 'Should handle alarm creation failure');
    assertNotNull(alarmResult.error, 'Should provide error message');
  });

  test('Should handle network timeouts', async () => {
    // Mock network operations with timeouts
    const mockNetworkCall = (shouldSucceed, delay = 100) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (shouldSucceed) {
            resolve({ status: 'success', data: 'test data' });
          } else {
            reject(new Error('Network timeout'));
          }
        }, delay);
      });
    };

    const callWithTimeout = (networkCall, timeoutMs = 50) => {
      return Promise.race([
        networkCall,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
        )
      ]);
    };

    // Test successful call within timeout
    try {
      const result = await callWithTimeout(mockNetworkCall(true, 30), 100);
      assertEqual(result.status, 'success', 'Should complete successful call');
    } catch (error) {
      assert(false, 'Should not timeout on fast successful call');
    }

    // Test timeout on slow call
    try {
      await callWithTimeout(mockNetworkCall(true, 200), 50);
      assert(false, 'Should have timed out');
    } catch (error) {
      assertEqual(error.message, 'Operation timed out', 'Should timeout on slow call');
    }
  });

  test('Should handle missing credentials gracefully', async () => {
    // Mock storage with missing credentials
    const mockStorageEmpty = {
      get: () => Promise.resolve({})
    };

    const getCredentialsWithFallback = async () => {
      try {
        const result = await mockStorageEmpty.get('eoCreds');
        if (!result.eoCreds) {
          return { error: 'NO_CREDENTIALS', canProceed: false };
        }
        return { credentials: result.eoCreds, canProceed: true };
      } catch (error) {
        return { error: 'STORAGE_ERROR', canProceed: false };
      }
    };

    const result = await getCredentialsWithFallback();
    assert(!result.canProceed, 'Should not proceed without credentials');
    assertEqual(result.error, 'NO_CREDENTIALS', 'Should identify missing credentials');
  });

  test('Should handle dialog parsing failures', () => {
    // Create dialogs with missing or malformed data
    const dialogsToTest = [
      { html: '', description: 'empty dialog' },
      { html: '<div>No useful content</div>', description: 'dialog without date/time' },
      { html: '<h3>Schedule for Invalid Date</h3><div>Bad Time Format</div>', description: 'malformed date/time' },
      { html: '<h3>Schedule for 13/35/2025</h3><div>25:70pm - 30:90am</div>', description: 'impossible date/time values' }
    ];

    const parseDialogSafely = (dialogHtml) => {
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = dialogHtml;
        
        // Try to parse date
        const dateMatch = dialogHtml.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const timeMatch = dialogHtml.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
        
        if (!dateMatch || !timeMatch) {
          return { error: 'MISSING_DATA', parsed: false };
        }

        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);
        const year = parseInt(dateMatch[3], 10);

        // Validate date ranges
        if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) {
          return { error: 'INVALID_DATE', parsed: false };
        }

        return { parsed: true, dateISO: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
      } catch (error) {
        return { error: 'PARSE_ERROR', parsed: false };
      }
    };

    dialogsToTest.forEach(testCase => {
      const result = parseDialogSafely(testCase.html);
      assert(!result.parsed, `Should fail to parse ${testCase.description}`);
      assert(result.error && result.error.length > 0, `Should provide error for ${testCase.description}`);
    });
  });

  test('Should handle element click failures', () => {
    // Test clicking on elements that might not be clickable
    const safeClick = (element) => {
      try {
        if (!element) {
          return { success: false, reason: 'ELEMENT_NOT_FOUND' };
        }

        if (element.style.display === 'none' || element.style.visibility === 'hidden') {
          return { success: false, reason: 'ELEMENT_NOT_VISIBLE' };
        }

        if (element.disabled) {
          return { success: false, reason: 'ELEMENT_DISABLED' };
        }

        element.click();
        return { success: true };
      } catch (error) {
        return { success: false, reason: 'CLICK_ERROR', error: error.message };
      }
    };

    // Test clicking null element
    const nullResult = safeClick(null);
    assert(!nullResult.success, 'Should fail on null element');
    assertEqual(nullResult.reason, 'ELEMENT_NOT_FOUND', 'Should identify null element');

    // Test clicking hidden element
    const hiddenBtn = document.createElement('button');
    hiddenBtn.style.display = 'none';
    document.body.appendChild(hiddenBtn);

    const hiddenResult = safeClick(hiddenBtn);
    assert(!hiddenResult.success, 'Should fail on hidden element');
    assertEqual(hiddenResult.reason, 'ELEMENT_NOT_VISIBLE', 'Should identify hidden element');

    // Test clicking disabled element
    hiddenBtn.style.display = 'block';
    hiddenBtn.disabled = true;

    const disabledResult = safeClick(hiddenBtn);
    assert(!disabledResult.success, 'Should fail on disabled element');
    assertEqual(disabledResult.reason, 'ELEMENT_DISABLED', 'Should identify disabled element');

    // Test successful click
    hiddenBtn.disabled = false;
    let clicked = false;
    hiddenBtn.addEventListener('click', () => { clicked = true; });

    const successResult = safeClick(hiddenBtn);
    assert(successResult.success, 'Should succeed on valid element');
    assert(clicked, 'Click event should fire');

    document.body.removeChild(hiddenBtn);
  });

  test('Should handle alarm scheduling conflicts', () => {
    // Mock alarm system with conflict detection
    const mockAlarmSystem = {
      alarms: [],
      create: function(name, alarmInfo) {
        // Check for conflicts
        const existing = this.alarms.find(a => a.name === name);
        if (existing) {
          throw new Error('ALARM_ALREADY_EXISTS');
        }

        const conflicting = this.alarms.find(a => Math.abs(a.when - alarmInfo.when) < 60000);
        if (conflicting) {
          throw new Error('ALARM_TIME_CONFLICT');
        }

        this.alarms.push({ name, ...alarmInfo });
        return true;
      },
      clear: function(name) {
        const index = this.alarms.findIndex(a => a.name === name);
        if (index >= 0) {
          this.alarms.splice(index, 1);
          return true;
        }
        return false;
      }
    };

    const safeScheduleAlarm = (name, alarmInfo) => {
      try {
        mockAlarmSystem.create(name, alarmInfo);
        return { success: true };
      } catch (error) {
        if (error.message === 'ALARM_ALREADY_EXISTS') {
          // Try to clear existing and reschedule
          mockAlarmSystem.clear(name);
          try {
            mockAlarmSystem.create(name, alarmInfo);
            return { success: true, replaced: true };
          } catch (retryError) {
            return { success: false, error: retryError.message };
          }
        }
        return { success: false, error: error.message };
      }
    };

    const alarmTime = Date.now() + 60000;

    // First alarm should succeed
    const result1 = safeScheduleAlarm('test-alarm', { when: alarmTime });
    assert(result1.success, 'First alarm should succeed');

    // Duplicate name should be handled
    const result2 = safeScheduleAlarm('test-alarm', { when: alarmTime + 120000 });
    assert(result2.success, 'Should handle duplicate alarm name');
    assert(result2.replaced, 'Should indicate alarm was replaced');
  });

})();