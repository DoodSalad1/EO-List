// EO List Extension Test Suite
// Comprehensive testing framework for all extension functionality

(() => {
  const TEST_RESULTS = {
    categories: [],
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    startTime: Date.now()
  };

  class TestRunner {
    constructor() {
      this.currentCategory = null;
      this.tests = [];
    }

    // Test framework methods
    category(name, description) {
      this.currentCategory = {
        name,
        description,
        tests: [],
        passed: 0,
        failed: 0
      };
      TEST_RESULTS.categories.push(this.currentCategory);
      console.log(`\n🧪 ${name}: ${description}`);
    }

    test(name, testFn) {
      const test = { name, passed: false, error: null };
      this.currentCategory.tests.push(test);
      TEST_RESULTS.totalTests++;

      try {
        const result = testFn();
        if (result instanceof Promise) {
          // Handle async tests properly
          return result.then(() => {
            test.passed = true;
            this.currentCategory.passed++;
            TEST_RESULTS.passedTests++;
            console.log(`  ✅ ${name}`);
            return Promise.resolve();
          }).catch(err => {
            test.passed = false;
            test.error = err.message || err.toString();
            this.currentCategory.failed++;
            TEST_RESULTS.failedTests++;
            console.log(`  ❌ ${name}: ${err.message || err.toString()}`);
            return Promise.resolve(); // Don't let async errors break the test chain
          });
        } else {
          test.passed = true;
          this.currentCategory.passed++;
          TEST_RESULTS.passedTests++;
          console.log(`  ✅ ${name}`);
          return Promise.resolve();
        }
      } catch (err) {
        test.passed = false;
        test.error = err.message || err.toString();
        this.currentCategory.failed++;
        TEST_RESULTS.failedTests++;
        console.log(`  ❌ ${name}: ${err.message || err.toString()}`);
        return Promise.resolve();
      }
    }

    // Assertion methods
    assert(condition, message = 'Assertion failed') {
      if (!condition) {
        throw new Error(message);
      }
    }

    assertEqual(actual, expected, message = `Expected ${expected}, got ${actual}`) {
      if (actual !== expected) {
        throw new Error(message);
      }
    }

    assertNotNull(value, message = 'Expected non-null value') {
      if (value === null || value === undefined) {
        throw new Error(message);
      }
    }

    assertMatches(value, pattern, message = `Value ${value} does not match pattern ${pattern}`) {
      if (!pattern.test(value)) {
        throw new Error(message);
      }
    }

    // Mock utilities
    mockStorage() {
      const mockData = {};
      return {
        get: jest.fn((keys) => {
          if (typeof keys === 'string') return { [keys]: mockData[keys] };
          const result = {};
          keys.forEach(key => result[key] = mockData[key]);
          return result;
        }),
        set: jest.fn((items) => {
          Object.assign(mockData, items);
        }),
        remove: jest.fn((keys) => {
          if (typeof keys === 'string') delete mockData[keys];
          else keys.forEach(key => delete mockData[key]);
        })
      };
    }

    // Utility methods
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    createMockElement(tag, attributes = {}, textContent = '') {
      const element = document.createElement(tag);
      Object.assign(element, attributes);
      element.textContent = textContent;
      return element;
    }

    // Results display
    showResults() {
      const duration = Date.now() - TEST_RESULTS.startTime;
      console.log(`\n📊 Test Results (${duration}ms)`);
      console.log(`Total: ${TEST_RESULTS.totalTests} | Passed: ${TEST_RESULTS.passedTests} | Failed: ${TEST_RESULTS.failedTests}`);
      
      TEST_RESULTS.categories.forEach(cat => {
        const status = cat.failed === 0 ? '✅' : '❌';
        console.log(`${status} ${cat.name}: ${cat.passed}/${cat.tests.length} passed`);
      });

      this.displayResultsUI();
    }

    displayResultsUI() {
      // Create visual test results display
      const resultsDiv = document.createElement('div');
      resultsDiv.id = 'test-results';
      resultsDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 400px; max-height: 600px;
        background: white; border: 2px solid #333; border-radius: 8px; padding: 16px;
        font-family: monospace; font-size: 12px; overflow-y: auto; z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;

      const duration = Date.now() - TEST_RESULTS.startTime;
      const passRate = Math.round((TEST_RESULTS.passedTests / TEST_RESULTS.totalTests) * 100);

      resultsDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #333;">EO List Test Results</h3>
          <button onclick="this.parentElement.parentElement.remove()" style="background: #ff4444; color: white; border: none; border-radius: 4px; padding: 4px 8px;">×</button>
        </div>
        <div style="margin-bottom: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
          <div><strong>Duration:</strong> ${duration}ms</div>
          <div><strong>Pass Rate:</strong> ${passRate}%</div>
          <div style="color: green;"><strong>Passed:</strong> ${TEST_RESULTS.passedTests}</div>
          <div style="color: red;"><strong>Failed:</strong> ${TEST_RESULTS.failedTests}</div>
        </div>
        ${TEST_RESULTS.categories.map(cat => `
          <div style="margin-bottom: 12px; border: 1px solid #ddd; border-radius: 4px; padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px; color: ${cat.failed === 0 ? 'green' : 'red'};">
              ${cat.failed === 0 ? '✅' : '❌'} ${cat.name} (${cat.passed}/${cat.tests.length})
            </div>
            <div style="font-size: 10px; color: #666; margin-bottom: 6px;">${cat.description}</div>
            ${cat.tests.map(test => `
              <div style="margin-left: 12px; color: ${test.passed ? 'green' : 'red'};">
                ${test.passed ? '✅' : '❌'} ${test.name}
                ${test.error ? `<div style="margin-left: 16px; font-size: 10px; color: #666;">${test.error}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      `;

      document.body.appendChild(resultsDiv);
    }
  }

  // Global test runner instance
  window.TestRunner = new TestRunner();
  
  // Make test methods globally available
  window.TestRunner.category = window.TestRunner.category.bind(window.TestRunner);
  window.TestRunner.test = window.TestRunner.test.bind(window.TestRunner);
  window.TestRunner.assert = window.TestRunner.assert.bind(window.TestRunner);
  window.TestRunner.assertEqual = window.TestRunner.assertEqual.bind(window.TestRunner);
  window.TestRunner.assertNotNull = window.TestRunner.assertNotNull.bind(window.TestRunner);
  window.TestRunner.assertMatches = window.TestRunner.assertMatches.bind(window.TestRunner);

  // Expose results for UI layer
  window.TEST_RESULTS = TEST_RESULTS;

  console.log('🚀 EO List Extension Test Suite Started');
})();