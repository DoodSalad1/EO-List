// Authentication Tests - Login functionality and credential management

(() => {
  // Wait for TestRunner to be available
  if (!window.TestRunner) {
    console.error('TestRunner not available for auth_tests.js');
    return;
  }
  
  const { category, test, assert, assertEqual, assertNotNull } = window.TestRunner;

  category('Authentication Tests', 'Tests for login detection, credential storage, and authentication workflows');

  // Test login page detection
  test('Should detect login page by form fields', () => {
    // Create mock login page elements
    const userField = document.createElement('input');
    userField.id = 'txtUserName';
    userField.type = 'text';
    
    const passField = document.createElement('input');
    passField.id = 'txtPassword';
    passField.type = 'password';
    
    const loginBtn = document.createElement('button');
    loginBtn.id = 'cmdLogin';
    loginBtn.textContent = 'Sign In';
    
    document.body.appendChild(userField);
    document.body.appendChild(passField);
    document.body.appendChild(loginBtn);
    
    // Test login detection logic from test_login.js
    const isLoginPage = () => {
      const pass = document.getElementById('txtPassword') || document.querySelector('input[type="password"]');
      const user = document.getElementById('txtUserName') || document.querySelector('input[type="text"], input[type="email"]');
      const signInBtn = document.getElementById('cmdLogin') || document.querySelector('button');
      return (pass && user) || /Sign\s*in/i.test(document.body.innerText) || Boolean(signInBtn);
    };
    
    assert(isLoginPage(), 'Should detect login page with form fields');
    
    // Cleanup
    document.body.removeChild(userField);
    document.body.removeChild(passField);
    document.body.removeChild(loginBtn);
  });

  test('Should detect login page by "Sign in" text', () => {
    const signInDiv = document.createElement('div');
    signInDiv.textContent = 'Please Sign In to continue';
    document.body.appendChild(signInDiv);
    
    const isLoginPage = () => /Sign\s*in/i.test(document.body.innerText);
    assert(isLoginPage(), 'Should detect login page by Sign In text');
    
    document.body.removeChild(signInDiv);
  });

  test('Should handle missing login fields gracefully', () => {
    // Test with no login fields present
    const isLoginPage = () => {
      const pass = document.getElementById('txtPassword') || document.querySelector('input[type="password"]');
      const user = document.getElementById('txtUserName') || document.querySelector('input[type="text"]');
      return Boolean(pass && user);
    };
    
    assert(!isLoginPage(), 'Should return false when no login fields present');
  });

  test('Should validate credential structure', () => {
    const validCreds = {
      username: 'testuser',
      password: 'testpass123'
    };
    
    const invalidCreds1 = { username: 'testuser' }; // missing password
    const invalidCreds2 = { password: 'testpass123' }; // missing username
    const invalidCreds3 = { username: '', password: 'test' }; // empty username
    
    const isValidCreds = (creds) => {
      return creds && 
             typeof creds.username === 'string' && 
             typeof creds.password === 'string' &&
             creds.username.length > 0 && 
             creds.password.length > 0;
    };
    
    assert(isValidCreds(validCreds), 'Valid credentials should pass validation');
    assert(!isValidCreds(invalidCreds1), 'Should reject credentials missing password');
    assert(!isValidCreds(invalidCreds2), 'Should reject credentials missing username');
    assert(!isValidCreds(invalidCreds3), 'Should reject credentials with empty username');
  });

  test('Should handle form field selection fallbacks', () => {
    // Test fallback selectors from clicker.js
    const userField = document.createElement('input');
    userField.name = 'Username';
    userField.type = 'email';
    
    const passField = document.createElement('input');
    passField.type = 'password';
    
    document.body.appendChild(userField);
    document.body.appendChild(passField);
    
    // Test selector logic
    const findUserField = () => {
      return document.getElementById('txtUserName') || 
             document.querySelector('input[name*="user" i], input[id*="user" i], input[type="email"], input[type="text"]');
    };
    
    const findPassField = () => {
      return document.getElementById('txtPassword') || 
             document.querySelector('input[type="password"]');
    };
    
    assertNotNull(findUserField(), 'Should find user field with fallback selectors');
    assertNotNull(findPassField(), 'Should find password field with fallback selectors');
    assertEqual(findUserField().type, 'email', 'Should select email input as user field');
    
    document.body.removeChild(userField);
    document.body.removeChild(passField);
  });

  test('Should simulate login form submission', () => {
    // Create login form
    const form = document.createElement('form');
    const userField = document.createElement('input');
    userField.id = 'txtUserName';
    userField.type = 'text';
    
    const passField = document.createElement('input');
    passField.id = 'txtPassword';
    passField.type = 'password';
    
    const submitBtn = document.createElement('button');
    submitBtn.id = 'cmdLogin';
    submitBtn.type = 'submit';
    
    form.appendChild(userField);
    form.appendChild(passField);
    form.appendChild(submitBtn);
    document.body.appendChild(form);
    
    // Mock credentials
    const mockCreds = { username: 'testuser', password: 'testpass' };
    
    // Simulate form filling
    userField.value = mockCreds.username;
    passField.value = mockCreds.password;
    userField.dispatchEvent(new Event('input', { bubbles: true }));
    passField.dispatchEvent(new Event('input', { bubbles: true }));
    
    assertEqual(userField.value, mockCreds.username, 'Username field should be filled');
    assertEqual(passField.value, mockCreds.password, 'Password field should be filled');
    
    document.body.removeChild(form);
  });

  test('Should test Chrome storage credential operations', async () => {
    // Mock Chrome storage for testing
    const mockStorage = {
      local: {
        data: {},
        get: function(keys) {
          return new Promise(resolve => {
            if (typeof keys === 'string') {
              resolve({ [keys]: this.data[keys] });
            } else if (Array.isArray(keys)) {
              const result = {};
              keys.forEach(key => result[key] = this.data[key]);
              resolve(result);
            }
          });
        },
        set: function(items) {
          return new Promise(resolve => {
            Object.assign(this.data, items);
            resolve();
          });
        }
      }
    };
    
    // Test storing credentials
    const testCreds = { username: 'testuser', password: 'testpass123' };
    await mockStorage.local.set({ eoCreds: testCreds });
    
    // Test retrieving credentials
    const result = await mockStorage.local.get('eoCreds');
    assertNotNull(result.eoCreds, 'Should retrieve stored credentials');
    assertEqual(result.eoCreds.username, testCreds.username, 'Username should match');
    assertEqual(result.eoCreds.password, testCreds.password, 'Password should match');
  });

  test('Should handle authentication timeout scenarios', async () => {
    // Simulate login timeout check from test_login.js
    let loginAttempts = 0;
    const maxAttempts = 3;
    
    const simulateLoginCheck = () => {
      loginAttempts++;
      // Simulate still being on login page
      return loginAttempts < maxAttempts; // Still on login page
    };
    
    // Test timeout logic
    let stillOnLogin = true;
    let attempts = 0;
    while (stillOnLogin && attempts < maxAttempts) {
      stillOnLogin = simulateLoginCheck();
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10)); // Short delay
    }
    
    assertEqual(attempts, maxAttempts, 'Should attempt login specified number of times');
    assert(attempts <= maxAttempts, 'Should not exceed maximum attempts');
  });

})();