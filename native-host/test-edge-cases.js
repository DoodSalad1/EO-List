#!/usr/bin/env node

// Test edge cases and error handling

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Edge Cases and Error Handling...\n');

class EdgeCaseTester {
  constructor() {
    this.hostPath = path.join(__dirname, 'eo-scheduler.js');
    this.testResults = [];
  }

  async runTest(testName, messageData, expectSuccess = true) {
    console.log(`\n📋 Test: ${testName}`);
    
    return new Promise((resolve) => {
      const host = spawn('node', [this.hostPath]);
      let responseReceived = false;

      const messageString = JSON.stringify(messageData);
      const messageBuffer = Buffer.from(messageString, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

      host.stdout.on('data', (data) => {
        try {
          const responseLength = data.readUInt32LE(0);
          const responseData = data.slice(4, 4 + responseLength);
          const response = JSON.parse(responseData.toString());
          
          const passed = expectSuccess ? response.success : !response.success;
          const status = passed ? '✅' : '❌';
          
          console.log(`${status} Response: ${JSON.stringify(response, null, 2)}`);
          
          this.testResults.push({
            test: testName,
            passed: passed,
            expected: expectSuccess ? 'success' : 'failure',
            actual: response.success ? 'success' : 'failure',
            response: response
          });
          
          responseReceived = true;
          host.kill();
          resolve(response);
        } catch (error) {
          console.log(`❌ Parse error: ${error.message}`);
          this.testResults.push({
            test: testName,
            passed: false,
            error: error.message
          });
          host.kill();
          resolve({ success: false, error: error.message });
        }
      });

      host.stderr.on('data', (data) => {
        console.log(`⚠️ stderr: ${data.toString()}`);
      });

      host.on('close', (code) => {
        if (!responseReceived) {
          console.log(`❌ No response (exit code: ${code})`);
          this.testResults.push({
            test: testName,
            passed: false,
            error: `No response, exit code ${code}`
          });
          resolve({ success: false, error: `Exit code ${code}` });
        }
      });

      setTimeout(() => {
        host.stdin.write(Buffer.concat([lengthBuffer, messageBuffer]));
      }, 100);
    });
  }

  async testInvalidTime() {
    return await this.runTest('Invalid Time Format', {
      type: 'SCHEDULE_EO',
      payload: {
        dateISO: '2025-08-18',
        start: 'invalid-time',
        url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
      }
    }, false); // Expect failure
  }

  async testInvalidDate() {
    return await this.runTest('Invalid Date Format', {
      type: 'SCHEDULE_EO',
      payload: {
        dateISO: 'not-a-date',
        start: '2:00pm',
        url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
      }
    }, false); // Expect failure
  }

  async testMissingPayload() {
    return await this.runTest('Missing Payload', {
      type: 'SCHEDULE_EO'
      // No payload
    }, false); // Expect failure
  }

  async testCancelNonExistent() {
    return await this.runTest('Cancel Non-Existent EO', {
      type: 'CANCEL_EO',
      payload: {
        dateISO: '2099-12-31',
        start: '11:59pm'
      }
    }, true); // Should succeed (graceful handling)
  }

  async testEmptyPayload() {
    return await this.runTest('Empty Payload', {
      type: 'SCHEDULE_EO',
      payload: {}
    }, false); // Expect failure
  }

  async testPastDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateISO = yesterday.toISOString().split('T')[0];

    return await this.runTest('Past Date Schedule', {
      type: 'SCHEDULE_EO',
      payload: {
        dateISO: dateISO,
        start: '2:00pm',
        url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
      }
    }, true); // Should succeed (might schedule for immediate execution)
  }

  async testValidScheduleAndCancel() {
    // Test a valid schedule followed by cancel to ensure cleanup
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateISO = tomorrow.toISOString().split('T')[0];

    console.log('\n🔄 Testing valid schedule → cancel cleanup...');

    const scheduleResult = await this.runTest('Valid Schedule for Cleanup Test', {
      type: 'SCHEDULE_EO',
      payload: {
        dateISO: dateISO,
        start: '3:00pm',
        url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
      }
    }, true);

    if (scheduleResult.success) {
      const cancelResult = await this.runTest('Cancel for Cleanup Test', {
        type: 'CANCEL_EO',
        payload: {
          dateISO: dateISO,
          start: '3:00pm'
        }
      }, true);

      return cancelResult;
    }

    return scheduleResult;
  }

  async testLaunchdPermissions() {
    console.log('\n🔐 Testing launchd directory permissions...');
    
    const launchAgentsDir = path.join(require('os').homedir(), 'Library', 'LaunchAgents');
    
    try {
      // Check if directory exists and is writable
      if (!fs.existsSync(launchAgentsDir)) {
        console.log('❌ LaunchAgents directory does not exist');
        return false;
      }

      // Try to write a test file
      const testFile = path.join(launchAgentsDir, 'test-permissions.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      console.log('✅ LaunchAgents directory is writable');
      return true;
    } catch (error) {
      console.log(`❌ LaunchAgents permission error: ${error.message}`);
      return false;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 EDGE CASE TEST SUMMARY');
    console.log('='.repeat(60));

    let passed = 0;
    let total = this.testResults.length;

    this.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.test}`);
      
      if (result.passed) {
        passed++;
      } else {
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        } else if (result.expected !== result.actual) {
          console.log(`   Expected: ${result.expected}, Got: ${result.actual}`);
        }
      }
    });

    console.log(`\n📈 Results: ${passed}/${total} edge case tests passed`);
    
    if (passed === total) {
      console.log('🎉 All edge case tests passed! Error handling is robust.');
    } else {
      console.log('⚠️  Some edge case tests failed. Review error handling.');
    }
  }

  async run() {
    console.log('Starting edge case and error handling tests...\n');

    // Test permission requirements
    await this.testLaunchdPermissions();

    // Test invalid inputs
    await this.testInvalidTime();
    await this.testInvalidDate();
    await this.testMissingPayload();
    await this.testEmptyPayload();

    // Test edge cases
    await this.testPastDate();
    await this.testCancelNonExistent();

    // Test cleanup
    await this.testValidScheduleAndCancel();

    this.printSummary();

    // Final system cleanup check
    console.log('\n🧹 Final cleanup verification...');
    const { exec } = require('child_process');
    
    exec('ls ~/Library/LaunchAgents/com.eolist.schedule.*.plist 2>/dev/null || echo "No jobs found"', (error, stdout) => {
      console.log(`System state: ${stdout.trim()}`);
      
      if (stdout.includes('No jobs found')) {
        console.log('✅ System is clean - all test jobs cleaned up properly');
      } else {
        console.log('⚠️  Some test jobs may still exist - manual cleanup might be needed');
      }
    });
  }
}

// Run the tests
const tester = new EdgeCaseTester();
tester.run().catch(console.error);