// Integration Tests - End-to-end workflows and system integration

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for integration_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull } = window.TestRunner;

  category('Integration Tests', 'Tests for complete end-to-end workflows and system integration scenarios');

  test('Should complete full EO scheduling workflow', async () => {
    // Mock the complete workflow from content.js to background.js
    const mockWorkflow = {
      // Step 1: Parse shift dialog
      parseShiftDateTime: (mockDialog) => {
        const dateMatch = mockDialog.innerHTML.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const timeMatch = mockDialog.innerHTML.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
        
        if (dateMatch && timeMatch) {
          return {
            dateISO: `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`,
            start: timeMatch[1].toLowerCase().replace(/\s+/g, '')
          };
        }
        return null;
      },

      // Step 2: Schedule alarm
      scheduleAlarm: async (dateISO, start, url) => {
        const computeTargetTime = (dateISO, start) => {
          try {
            const [hPart, mPartAmPm] = start.split(':');
            const [mPart, ampmRaw] = mPartAmPm.match(/(\d{2})(am|pm)/i).slice(1);
            let hour = parseInt(hPart, 10);
            const minute = parseInt(mPart, 10);
            const ampm = ampmRaw.toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return new Date(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
          } catch (e) {
            return null;
          }
        };

        const target = computeTargetTime(dateISO, start);
        if (!target) return { ok: false, reason: 'INVALID_TIME' };

        const whenMs = target.getTime() - 2 * 60 * 60 * 1000;
        const now = Date.now();
        const fireTime = Math.max(whenMs, now + 1000);

        return {
          ok: true,
          scheduledFor: new Date(fireTime).toISOString(),
          dateISO,
          start,
          fireTime
        };
      },

      // Step 3: Handle response and show UI
      showScheduleResponse: (response) => {
        if (response.ok) {
          const when = new Date(response.scheduledFor);
          const diff = when.getTime() - Date.now();
          
          if (diff < 12000) {
            return { message: 'EO: Attempting now…', immediate: true };
          } else {
            const timeStr = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return { 
              message: `EO scheduled for ${timeStr}`,
              scheduled: true,
              time: timeStr,
              canCancel: true
            };
          }
        } else {
          return { message: 'EO: could not schedule (invalid time).', error: true };
        }
      }
    };

    // Test the complete workflow
    const mockDialog = document.createElement('div');
    mockDialog.innerHTML = `
      <h3>Schedule for Mon 08/14/2025</h3>
      <div>8:00pm - 4:00am</div>
    `;

    // Step 1: Parse dialog
    const shiftInfo = mockWorkflow.parseShiftDateTime(mockDialog);
    assertNotNull(shiftInfo, 'Should parse shift information');
    assertEqual(shiftInfo.dateISO, '2025-08-14', 'Should parse correct date');
    assertEqual(shiftInfo.start, '8:00pm', 'Should parse correct start time');

    // Step 2: Schedule alarm
    const scheduleResult = await mockWorkflow.scheduleAlarm(
      shiftInfo.dateISO, 
      shiftInfo.start, 
      'https://test.com'
    );
    assert(scheduleResult.ok, 'Should successfully schedule alarm');
    assertNotNull(scheduleResult.scheduledFor, 'Should have scheduled time');

    // Step 3: Handle UI response
    const uiResponse = mockWorkflow.showScheduleResponse(scheduleResult);
    assert(uiResponse.scheduled || uiResponse.immediate, 'Should show appropriate UI response');
    assertNotNull(uiResponse.message, 'Should have user message');
  });

  test('Should handle login-to-EO-submission workflow', async () => {
    // Mock the complete login and submission workflow
    const mockLoginWorkflow = {
      // Check if on login page
      isLoginPage: () => {
        return document.querySelector('#test-login-page') !== null;
      },

      // Simulate login
      doLogin: async (credentials) => {
        if (!credentials || !credentials.username || !credentials.password) {
          return { ok: false, reason: 'NO_CREDS' };
        }

        // Simulate login process
        return new Promise(resolve => {
          setTimeout(() => {
            // Remove login page marker
            const loginPage = document.getElementById('test-login-page');
            if (loginPage) loginPage.remove();
            resolve({ ok: true });
          }, 100);
        });
      },

      // Find and click shift
      openShift: () => {
        const shiftCell = document.querySelector('.test-shift-cell');
        if (shiftCell) {
          shiftCell.click();
          return true;
        }
        return false;
      },

      // Click EO List and Submit
      submitEO: () => {
        const eoBtn = document.querySelector('#test-eo-btn');
        const submitBtn = document.querySelector('#test-submit-btn');
        
        if (eoBtn) eoBtn.click();
        if (submitBtn) submitBtn.click();
        
        return Boolean(eoBtn && submitBtn);
      }
    };

    // Set up test environment
    const loginPage = document.createElement('div');
    loginPage.id = 'test-login-page';
    document.body.appendChild(loginPage);

    const shiftCell = document.createElement('div');
    shiftCell.className = 'test-shift-cell';
    shiftCell.textContent = '8:00pm - 4:00am';
    document.body.appendChild(shiftCell);

    const eoBtn = document.createElement('button');
    eoBtn.id = 'test-eo-btn';
    eoBtn.textContent = 'EO List';
    document.body.appendChild(eoBtn);

    const submitBtn = document.createElement('button');
    submitBtn.id = 'test-submit-btn';
    submitBtn.textContent = 'Submit';
    document.body.appendChild(submitBtn);

    // Test workflow
    assert(mockLoginWorkflow.isLoginPage(), 'Should detect login page');

    const loginResult = await mockLoginWorkflow.doLogin({ 
      username: 'testuser', 
      password: 'testpass' 
    });
    assert(loginResult.ok, 'Should complete login');
    assert(!mockLoginWorkflow.isLoginPage(), 'Should no longer be on login page');

    const shiftOpened = mockLoginWorkflow.openShift();
    assert(shiftOpened, 'Should open shift');

    const eoSubmitted = mockLoginWorkflow.submitEO();
    assert(eoSubmitted, 'Should submit EO');

    // Cleanup
    document.body.removeChild(shiftCell);
    document.body.removeChild(eoBtn);
    document.body.removeChild(submitBtn);
  });

  test('Should handle status panel updates throughout workflow', () => {
    // Create mock status panel
    const statusPanel = document.createElement('div');
    statusPanel.id = 'test-status-panel';
    statusPanel.innerHTML = `
      <span id="status-text">No EO scheduled.</span>
      <button id="cancel-btn">Cancel</button>
    `;
    document.body.appendChild(statusPanel);

    // Mock status update system
    const statusUpdater = {
      updateStatus: (status) => {
        const textEl = statusPanel.querySelector('#status-text');
        const cancelBtn = statusPanel.querySelector('#cancel-btn');

        if (!status || (!status.next && !status.nextPre)) {
          textEl.textContent = 'No EO scheduled.';
          cancelBtn.style.display = 'none';
        } else {
          const when = status.next ? new Date(status.next.fireTime) : null;
          if (when) {
            const timeStr = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            textEl.textContent = `Next EO: ${timeStr} (${status.next.dateISO})`;
            cancelBtn.style.display = 'block';
          }
        }
      }
    };

    // Test status progression
    let statusText = statusPanel.querySelector('#status-text');
    
    // Initial state
    assertEqual(statusText.textContent, 'No EO scheduled.', 'Should show no schedule initially');

    // Schedule EO
    const mockStatus = {
      next: {
        dateISO: '2025-08-14',
        start: '8:00pm',
        fireTime: Date.now() + 7200000
      }
    };
    
    statusUpdater.updateStatus(mockStatus);
    statusText = statusPanel.querySelector('#status-text');
    assert(statusText.textContent.includes('Next EO:'), 'Should show scheduled EO');
    assert(statusText.textContent.includes('2025-08-14'), 'Should show correct date');

    // Cancel EO
    statusUpdater.updateStatus(null);
    statusText = statusPanel.querySelector('#status-text');
    assertEqual(statusText.textContent, 'No EO scheduled.', 'Should show no schedule after cancel');

    document.body.removeChild(statusPanel);
  });

  test('Should validate end-to-end timing accuracy', async () => {
    // Test the complete timing workflow from parse to execution
    const timingWorkflow = {
      parseTime: (timeStr) => {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (!match) return null;
        
        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const ampm = match[3].toLowerCase();
        
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        return { hour, minute };
      },

      calculateEOTime: (dateISO, timeStr) => {
        const parsedTime = timingWorkflow.parseTime(timeStr);
        if (!parsedTime) return null;

        const shiftTime = new Date(`${dateISO}T${String(parsedTime.hour).padStart(2, '0')}:${String(parsedTime.minute).padStart(2, '0')}:00`);
        const eoTime = new Date(shiftTime.getTime() - 2 * 60 * 60 * 1000);
        
        return { shiftTime, eoTime };
      },

      validateTiming: (eoTime, expectedHour) => {
        return eoTime.getHours() === expectedHour;
      }
    };

    // Test various time scenarios
    const testCases = [
      { date: '2025-08-14', time: '8:00pm', expectedEOHour: 18 }, // 6:00 PM
      { date: '2025-08-14', time: '2:00pm', expectedEOHour: 12 }, // 12:00 PM
      { date: '2025-08-14', time: '12:00pm', expectedEOHour: 10 }, // 10:00 AM
      { date: '2025-08-14', time: '2:00am', expectedEOHour: 0 }    // 12:00 AM (prev day)
    ];

    testCases.forEach(testCase => {
      const timing = timingWorkflow.calculateEOTime(testCase.date, testCase.time);
      assertNotNull(timing, `Should calculate timing for ${testCase.time}`);
      
      const isValid = timingWorkflow.validateTiming(timing.eoTime, testCase.expectedEOHour);
      assert(isValid, `EO time for ${testCase.time} should be ${testCase.expectedEOHour}:00`);
    });
  });

  test('Should handle message passing between components', () => {
    // Mock Chrome message passing system
    const mockMessageSystem = {
      listeners: [],
      onMessage: {
        addListener: function(listener) {
          mockMessageSystem.listeners.push(listener);
        }
      },
      sendMessage: function(message, callback) {
        // Simulate message processing
        setTimeout(() => {
          mockMessageSystem.listeners.forEach(listener => {
            const response = listener(message, {}, callback);
            if (response === true && callback) {
              // Simulate async response
              setTimeout(() => callback({ success: true }), 10);
            }
          });
        }, 0);
      }
    };

    let messageReceived = null;
    let responseReceived = null;

    // Add message listener
    mockMessageSystem.onMessage.addListener((message, sender, sendResponse) => {
      messageReceived = message;
      if (message.type === 'EO_SCHEDULE_OR_RUN') {
        sendResponse({ ok: true, scheduledFor: new Date().toISOString() });
        return true; // Will respond asynchronously
      }
    });

    // Send message
    return new Promise(resolve => {
      mockMessageSystem.sendMessage(
        {
          type: 'EO_SCHEDULE_OR_RUN',
          payload: { dateISO: '2025-08-14', start: '8:00pm', url: 'https://test.com' }
        },
        (response) => {
          responseReceived = response;
          resolve();
        }
      );
    }).then(() => {
      assertNotNull(messageReceived, 'Should receive message');
      assertEqual(messageReceived.type, 'EO_SCHEDULE_OR_RUN', 'Should receive correct message type');
      assertNotNull(responseReceived, 'Should receive response');
      assert(responseReceived.success || responseReceived.ok, 'Should receive successful response');
    });
  });

})();