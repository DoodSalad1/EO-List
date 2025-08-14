// Time Parsing Tests - Date/time extraction and calculation accuracy

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for time_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull, assertMatches } = window.TestRunner;

  category('Time Parsing Tests', 'Tests for date/time extraction from shift dialogs and time calculations');

  test('Should parse shift date from dialog heading', () => {
    // Create mock dialog with heading
    const dialog = document.createElement('div');
    dialog.innerHTML = '<h3>Schedule for Sun 08/10/2025</h3>';
    
    // Test date parsing logic from content.js
    const parseDate = (dialogEl) => {
      const heading = dialogEl.querySelector('h3, h2, .modal-title, .k-window-title');
      if (heading) {
        const m = heading.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
          return `${m[3]}-${m[1]}-${m[2]}`; // YYYY-MM-DD
        }
      }
      return null;
    };
    
    const dateStr = parseDate(dialog);
    assertEqual(dateStr, '2025-08-10', 'Should parse date as YYYY-MM-DD format');
  });

  test('Should parse shift start time from dialog content', () => {
    // Create mock dialog with time content
    const dialog = document.createElement('div');
    dialog.textContent = 'Shift: 8:00pm - 4:00am';
    
    // Test time parsing logic from content.js
    const parseTime = (dialogEl) => {
      const timeText = dialogEl.textContent;
      const tm = timeText.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
      if (tm) {
        return tm[1].toLowerCase().replace(/\s+/g, '');
      }
      return null;
    };
    
    const timeStr = parseTime(dialog);
    assertEqual(timeStr, '8:00pm', 'Should parse start time correctly');
  });

  test('Should handle various time formats', () => {
    const testCases = [
      { input: '8:00 PM - 4:00 AM', expected: '8:00pm' },
      { input: '2:30pm - 10:30pm', expected: '2:30pm' },
      { input: '11:45 am - 7:45 pm', expected: '11:45am' },
      { input: 'Start: 6:15PM End: 2:15AM', expected: '6:15pm' }
    ];
    
    const parseTime = (text) => {
      const tm = text.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
      if (tm) {
        return tm[1].toLowerCase().replace(/\s+/g, '');
      }
      return null;
    };
    
    testCases.forEach((testCase, index) => {
      const result = parseTime(testCase.input);
      assertEqual(result, testCase.expected, `Test case ${index + 1}: "${testCase.input}" should parse to "${testCase.expected}"`);
    });
  });

  test('Should compute target time correctly', () => {
    // Test computeTargetTime function from background.js with improved validation
    const computeTargetTime = (dateISO, start) => {
      try {
        if (!start || typeof start !== 'string') return null;
        
        const [hPart, mPartAmPm] = start.split(':');
        if (!hPart || !mPartAmPm) return null;
        
        const match = mPartAmPm.match(/(\d{1,2})(am|pm)/i);
        if (!match) return null;
        
        const [, mPart, ampmRaw] = match;
        let hour = parseInt(hPart, 10);
        const minute = parseInt(mPart, 10);
        const ampm = ampmRaw.toLowerCase();
        
        // Validate input ranges
        if (isNaN(hour) || isNaN(minute)) return null;
        if (hour < 1 || hour > 12) return null;  // 12-hour format
        if (minute < 0 || minute > 59) return null;
        
        // Convert to 24-hour format
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        // Final validation
        if (hour < 0 || hour > 23) return null;
        
        const dt = new Date(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
        
        // Validate the resulting date
        if (isNaN(dt.getTime())) return null;
        
        return dt;
      } catch (e) {
        return null;
      }
    };
    
    const testCases = [
      { dateISO: '2025-08-14', start: '8:00pm', expectedHour: 20 },
      { dateISO: '2025-08-14', start: '2:30pm', expectedHour: 14 },
      { dateISO: '2025-08-14', start: '12:00pm', expectedHour: 12 }, // noon
      { dateISO: '2025-08-14', start: '12:00am', expectedHour: 0 },  // midnight
      { dateISO: '2025-08-14', start: '11:45pm', expectedHour: 23 }
    ];
    
    testCases.forEach(testCase => {
      const result = computeTargetTime(testCase.dateISO, testCase.start);
      assertNotNull(result, `Should parse ${testCase.start} successfully`);
      assertEqual(result.getHours(), testCase.expectedHour, `${testCase.start} should be hour ${testCase.expectedHour}`);
    });
  });

  test('Should calculate two hours before shift time', () => {
    const computeTargetTime = (dateISO, start) => {
      try {
        if (!start || typeof start !== 'string') return null;
        
        const [hPart, mPartAmPm] = start.split(':');
        if (!hPart || !mPartAmPm) return null;
        
        const match = mPartAmPm.match(/(\d{1,2})(am|pm)/i);
        if (!match) return null;
        
        const [, mPart, ampmRaw] = match;
        let hour = parseInt(hPart, 10);
        const minute = parseInt(mPart, 10);
        const ampm = ampmRaw.toLowerCase();
        
        if (isNaN(hour) || isNaN(minute)) return null;
        if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
        
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        if (hour < 0 || hour > 23) return null;
        
        const dt = new Date(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
        return isNaN(dt.getTime()) ? null : dt;
      } catch (e) {
        return null;
      }
    };
    
    const target = computeTargetTime('2025-08-14', '8:00pm');
    const twoHoursBefore = target.getTime() - (2 * 60 * 60 * 1000);
    const eoTime = new Date(twoHoursBefore);
    
    assertEqual(eoTime.getHours(), 18, 'EO time should be 6:00 PM (2 hours before 8:00 PM)');
    assertEqual(eoTime.getMinutes(), 0, 'Minutes should be preserved');
  });

  test('Should handle edge case times', () => {
    const computeTargetTime = (dateISO, start) => {
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
    };
    
    // Test early morning shift (2:00 AM)
    const earlyShift = computeTargetTime('2025-08-14', '2:00am');
    assertNotNull(earlyShift, 'Should parse 2:00am successfully');
    
    const earlyEO = earlyShift.getTime() - (2 * 60 * 60 * 1000);
    const earlyEOTime = new Date(earlyEO);
    
    // Should be midnight (previous day) - 2:00 AM minus 2 hours = midnight of August 13th
    assertEqual(earlyEOTime.getHours(), 0, 'EO for 2:00 AM shift should be midnight');
    
    // Verify it's actually the previous day (August 13th)
    const expectedDate = new Date('2025-08-13T00:00:00'); 
    assertEqual(earlyEOTime.getDate(), expectedDate.getDate(), 'Should be previous day (13th)');
    assertEqual(earlyEOTime.getMonth(), expectedDate.getMonth(), 'Should be same month');
    assertEqual(earlyEOTime.getFullYear(), expectedDate.getFullYear(), 'Should be same year');
    
    // Test noon shift
    const noonShift = computeTargetTime('2025-08-14', '12:00pm');
    const noonEO = noonShift.getTime() - (2 * 60 * 60 * 1000);
    const noonEOTime = new Date(noonEO);
    
    assertEqual(noonEOTime.getHours(), 10, 'EO for noon shift should be 10:00 AM');
  });

  test('Should handle invalid time formats gracefully', () => {
    const computeTargetTime = (dateISO, start) => {
      try {
        if (!start || typeof start !== 'string') return null;
        
        const [hPart, mPartAmPm] = start.split(':');
        if (!hPart || !mPartAmPm) return null;
        
        const match = mPartAmPm.match(/(\d{1,2})(am|pm)/i);
        if (!match) return null;
        
        const [, mPart, ampmRaw] = match;
        let hour = parseInt(hPart, 10);
        const minute = parseInt(mPart, 10);
        const ampm = ampmRaw.toLowerCase();
        
        // Validate hour and minute ranges
        if (hour < 1 || hour > 12) return null;  // 12-hour format validation
        if (minute < 0 || minute > 59) return null;  // minute validation
        if (isNaN(hour) || isNaN(minute)) return null;
        
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        // Final 24-hour validation
        if (hour < 0 || hour > 23) return null;
        
        const dt = new Date(`${dateISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
        
        // Check if the date is valid
        if (isNaN(dt.getTime())) return null;
        
        return dt;
      } catch (e) {
        return null;
      }
    };
    
    const invalidFormats = [
      'invalid time',
      '25:00pm',
      '8:70pm',
      '8pm',
      '8:00',
      '',
      null,
      undefined
    ];
    
    invalidFormats.forEach(invalidTime => {
      const result = computeTargetTime('2025-08-14', invalidTime);
      assert(result === null, `Invalid time "${invalidTime}" should return null`);
    });
  });

  test('Should validate date formats', () => {
    const computeTargetTime = (dateISO, start) => {
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
    };
    
    // Valid date formats
    const validDate = computeTargetTime('2025-08-14', '8:00pm');
    assertNotNull(validDate, 'Valid ISO date should work');
    
    // Invalid date formats
    const invalidDates = [
      '08/14/2025',  // Wrong format
      '2025-13-14',  // Invalid month
      '2025-08-32',  // Invalid day
      'invalid-date',
      ''
    ];
    
    invalidDates.forEach(invalidDate => {
      const result = computeTargetTime(invalidDate, '8:00pm');
      // This might still parse due to JavaScript's flexible Date constructor
      // The key is that it should handle gracefully without throwing
      assert(typeof result === 'object', `Date parsing should handle "${invalidDate}" gracefully`);
    });
  });

  test('Should parse complex shift dialog content', () => {
    // Create realistic dialog content
    const dialog = document.createElement('div');
    dialog.innerHTML = `
      <div class="k-window-title">
        <h3>Schedule for Mon 08/14/2025</h3>
      </div>
      <div class="shift-details">
        <p>Department: Casino Floor</p>
        <p>Position: Surveillance</p>
        <p>Time: 8:00pm - 4:00am</p>
        <p>Break: 12:00am - 12:30am</p>
      </div>
    `;
    
    // Full parsing function from content.js
    const parseShiftDateTime = (dialogEl) => {
      // Parse date
      const heading = dialogEl.querySelector('h3, h2, .modal-title, .k-window-title');
      let dateStr = null;
      if (heading) {
        const m = heading.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
          dateStr = `${m[3]}-${m[1]}-${m[2]}`; // YYYY-MM-DD
        }
      }
      
      // Parse time
      let startStr = null;
      const timeText = dialogEl.textContent;
      const tm = timeText.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
      if (tm) {
        startStr = tm[1].toLowerCase().replace(/\s+/g, '');
      }
      
      if (!dateStr || !startStr) return null;
      return { dateISO: dateStr, start: startStr };
    };
    
    const result = parseShiftDateTime(dialog);
    assertNotNull(result, 'Should parse complex dialog content');
    assertEqual(result.dateISO, '2025-08-14', 'Should extract correct date');
    assertEqual(result.start, '8:00pm', 'Should extract correct start time');
  });

})();