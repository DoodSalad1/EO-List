// Storage Tests - Chrome storage operations, credential sync, and data persistence

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for storage_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull } = window.TestRunner;

  category('Storage Tests', 'Tests for Chrome storage operations, credential management, and data synchronization');

  test('Should mock Chrome local storage operations', async () => {
    // Mock Chrome storage local API
    const mockLocalStorage = {
      data: {},
      get: function(keys) {
        return new Promise(resolve => {
          if (typeof keys === 'string') {
            resolve({ [keys]: this.data[keys] });
          } else if (Array.isArray(keys)) {
            const result = {};
            keys.forEach(key => result[key] = this.data[key]);
            resolve(result);
          } else {
            resolve({ ...this.data });
          }
        });
      },
      set: function(items) {
        return new Promise(resolve => {
          Object.assign(this.data, items);
          resolve();
        });
      },
      remove: function(keys) {
        return new Promise(resolve => {
          if (typeof keys === 'string') {
            delete this.data[keys];
          } else if (Array.isArray(keys)) {
            keys.forEach(key => delete this.data[key]);
          }
          resolve();
        });
      }
    };

    // Test storing data
    await mockLocalStorage.set({ testKey: 'testValue', anotherKey: 123 });
    
    // Test retrieving single key
    const singleResult = await mockLocalStorage.get('testKey');
    assertEqual(singleResult.testKey, 'testValue', 'Should retrieve single key');
    
    // Test retrieving multiple keys
    const multiResult = await mockLocalStorage.get(['testKey', 'anotherKey']);
    assertEqual(multiResult.testKey, 'testValue', 'Should retrieve first key');
    assertEqual(multiResult.anotherKey, 123, 'Should retrieve second key');
    
    // Test removing key
    await mockLocalStorage.remove('testKey');
    const afterRemove = await mockLocalStorage.get('testKey');
    assertEqual(afterRemove.testKey, undefined, 'Should remove key');
  });

  test('Should handle credential storage format', async () => {
    const mockStorage = {
      data: {},
      get: k => Promise.resolve({ [k]: mockStorage.data[k] }),
      set: items => Promise.resolve(Object.assign(mockStorage.data, items))
    };
    
    // Test storing credentials in expected format
    const testCreds = {
      username: 'testuser',
      password: 'securepass123'
    };
    
    await mockStorage.set({ eoCreds: testCreds });
    
    const retrieved = await mockStorage.get('eoCreds');
    assertNotNull(retrieved.eoCreds, 'Should store credentials');
    assertEqual(retrieved.eoCreds.username, 'testuser', 'Username should be stored');
    assertEqual(retrieved.eoCreds.password, 'securepass123', 'Password should be stored');
    
    // Validate credential structure
    const creds = retrieved.eoCreds;
    assert(typeof creds === 'object', 'Credentials should be object');
    assert(typeof creds.username === 'string', 'Username should be string');
    assert(typeof creds.password === 'string', 'Password should be string');
    assert(creds.username.length > 0, 'Username should not be empty');
    assert(creds.password.length > 0, 'Password should not be empty');
  });

  test('Should handle alarm data storage', async () => {
    const mockStorage = {
      data: {},
      get: keys => {
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => result[key] = mockStorage.data[key]);
          return Promise.resolve(result);
        }
        return Promise.resolve({ [keys]: mockStorage.data[keys] });
      },
      set: items => Promise.resolve(Object.assign(mockStorage.data, items)),
      remove: keys => {
        if (Array.isArray(keys)) {
          keys.forEach(key => delete mockStorage.data[key]);
        } else {
          delete mockStorage.data[keys];
        }
        return Promise.resolve();
      }
    };
    
    // Test storing alarm data
    const alarmName = 'EO_ALARM_2025-08-14_8:00pm';
    const alarmData = {
      dateISO: '2025-08-14',
      start: '8:00pm',
      url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster',
      fireTime: Date.now() + 7200000 // 2 hours from now
    };
    
    await mockStorage.set({ [alarmName]: alarmData });
    
    // Test retrieving alarm data
    const retrieved = await mockStorage.get(alarmName);
    assertNotNull(retrieved[alarmName], 'Should store alarm data');
    assertEqual(retrieved[alarmName].dateISO, '2025-08-14', 'Date should be stored');
    assertEqual(retrieved[alarmName].start, '8:00pm', 'Start time should be stored');
    assertNotNull(retrieved[alarmName].fireTime, 'Fire time should be stored');
    
    // Test removing alarm data
    await mockStorage.remove(alarmName);
    const afterRemove = await mockStorage.get(alarmName);
    assertEqual(afterRemove[alarmName], undefined, 'Should remove alarm data');
  });

  test('Should handle storage sync fallback', async () => {
    // Mock both local and sync storage
    const mockLocalStorage = { data: {}, get: k => Promise.resolve({ [k]: mockLocalStorage.data[k] }) };
    const mockSyncStorage = { data: { eoCreds: { username: 'syncuser', password: 'syncpass' } }, get: k => Promise.resolve({ [k]: mockSyncStorage.data[k] }) };
    
    // Simulate fallback logic from clicker.js
    const getCredentials = async () => {
      let { eoCreds } = await mockLocalStorage.get('eoCreds');
      if (!eoCreds) {
        ({ eoCreds } = await mockSyncStorage.get('eoCreds'));
      }
      return eoCreds;
    };
    
    const creds = await getCredentials();
    assertNotNull(creds, 'Should get credentials from sync when local is empty');
    assertEqual(creds.username, 'syncuser', 'Should get sync username');
    assertEqual(creds.password, 'syncpass', 'Should get sync password');
  });

  test('Should validate storage key formats', () => {
    // Test alarm key validation
    const validateAlarmKey = (key) => {
      return /^EO_(ALARM|PRE)_\d{4}-\d{2}-\d{2}_\d{1,2}:\d{2}(am|pm)$/.test(key);
    };
    
    const validKeys = [
      'EO_ALARM_2025-08-14_8:00pm',
      'EO_PRE_2025-12-31_11:59pm',
      'EO_ALARM_2025-01-01_12:00am'
    ];
    
    const invalidKeys = [
      'INVALID_KEY',
      'EO_ALARM_2025-08-14',
      'EO_ALARM_2025-08-14_8pm',
      'EO_ALARM_08-14-2025_8:00pm',
      'EO_ALARM_2025-08-14_25:00pm'
    ];
    
    validKeys.forEach(key => {
      assert(validateAlarmKey(key), `"${key}" should be valid alarm key`);
    });
    
    invalidKeys.forEach(key => {
      assert(!validateAlarmKey(key), `"${key}" should be invalid alarm key`);
    });
  });

  test('Should handle storage quota limits', async () => {
    const mockStorage = {
      data: {},
      quota: 1024, // 1KB limit for testing
      used: 0,
      get: k => Promise.resolve({ [k]: mockStorage.data[k] }),
      set: function(items) {
        return new Promise((resolve, reject) => {
          const dataSize = JSON.stringify(items).length;
          if (this.used + dataSize > this.quota) {
            reject(new Error('QUOTA_EXCEEDED'));
          } else {
            Object.assign(this.data, items);
            this.used += dataSize;
            resolve();
          }
        });
      }
    };
    
    // Test normal storage
    try {
      await mockStorage.set({ smallData: 'test' });
      assert(true, 'Should store small data');
    } catch (error) {
      assert(false, 'Small data should not exceed quota');
    }
    
    // Test quota exceeded
    const largeData = 'x'.repeat(2000); // 2KB of data
    try {
      await mockStorage.set({ largeData });
      assert(false, 'Should not store data exceeding quota');
    } catch (error) {
      assertEqual(error.message, 'QUOTA_EXCEEDED', 'Should throw quota exceeded error');
    }
  });

  test('Should handle corrupted storage data', async () => {
    const mockStorage = {
      data: {
        'eoCreds': 'invalid_json_string',
        'EO_ALARM_2025-08-14_8:00pm': { incomplete: 'data' },
        'validAlarm': { dateISO: '2025-08-14', start: '8:00pm', fireTime: Date.now() }
      },
      get: k => Promise.resolve({ [k]: mockStorage.data[k] })
    };
    
    // Test handling corrupted credentials
    const validateCredentials = (creds) => {
      return creds && 
             typeof creds === 'object' && 
             typeof creds.username === 'string' && 
             typeof creds.password === 'string';
    };
    
    const result = await mockStorage.get('eoCreds');
    const isValid = validateCredentials(result.eoCreds);
    assert(!isValid, 'Should detect invalid credentials');
    
    // Test handling incomplete alarm data
    const validateAlarmData = (data) => {
      return data && 
             typeof data === 'object' &&
             typeof data.dateISO === 'string' &&
             typeof data.start === 'string' &&
             typeof data.fireTime === 'number';
    };
    
    const incompleteAlarm = await mockStorage.get('EO_ALARM_2025-08-14_8:00pm');
    const validAlarm = await mockStorage.get('validAlarm');
    
    assert(!validateAlarmData(incompleteAlarm['EO_ALARM_2025-08-14_8:00pm']), 'Should detect incomplete alarm data');
    assert(validateAlarmData(validAlarm.validAlarm), 'Should accept valid alarm data');
  });

  test('Should handle concurrent storage operations', async () => {
    const mockStorage = {
      data: {},
      pending: 0,
      get: function(k) {
        this.pending++;
        return new Promise(resolve => {
          setTimeout(() => {
            this.pending--;
            resolve({ [k]: this.data[k] });
          }, Math.random() * 10);
        });
      },
      set: function(items) {
        this.pending++;
        return new Promise(resolve => {
          setTimeout(() => {
            Object.assign(this.data, items);
            this.pending--;
            resolve();
          }, Math.random() * 10);
        });
      }
    };
    
    // Test concurrent operations
    const operations = [
      mockStorage.set({ key1: 'value1' }),
      mockStorage.set({ key2: 'value2' }),
      mockStorage.set({ key3: 'value3' })
    ];
    
    await Promise.all(operations);
    
    // Verify all operations completed
    assertEqual(mockStorage.pending, 0, 'All operations should complete');
    
    const results = await Promise.all([
      mockStorage.get('key1'),
      mockStorage.get('key2'),
      mockStorage.get('key3')
    ]);
    
    assertEqual(results[0].key1, 'value1', 'First concurrent write should succeed');
    assertEqual(results[1].key2, 'value2', 'Second concurrent write should succeed');
    assertEqual(results[2].key3, 'value3', 'Third concurrent write should succeed');
  });

})();