#!/usr/bin/env node

// Test script to simulate Chrome extension communication

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Chrome Extension <-> Native Host Integration...\n');

class NativeHostTester {
  constructor() {
    this.hostPath = path.join(__dirname, 'eo-scheduler.js');
    this.testResults = [];
  }

  async runTest(testName, messageData) {
    console.log(`\n📋 Test: ${testName}`);
    console.log(`📤 Sending:`, JSON.stringify(messageData, null, 2));

    return new Promise((resolve) => {
      const host = spawn('node', [this.hostPath]);
      let responseReceived = false;

      // Prepare message
      const messageString = JSON.stringify(messageData);
      const messageBuffer = Buffer.from(messageString, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

      host.stdout.on('data', (data) => {
        try {
          const responseLength = data.readUInt32LE(0);
          const responseData = data.slice(4, 4 + responseLength);
          const response = JSON.parse(responseData.toString());
          
          console.log(`📥 Response:`, JSON.stringify(response, null, 2));
          
          this.testResults.push({
            test: testName,
            success: response.success || false,
            response: response,
            passed: response.success !== undefined
          });
          
          responseReceived = true;
          host.kill();
          resolve(response);
        } catch (error) {
          console.log(`❌ Failed to parse response:`, error.message);
          this.testResults.push({
            test: testName,
            success: false,
            error: error.message,
            passed: false
          });
          host.kill();
          resolve({ success: false, error: error.message });
        }
      });

      host.stderr.on('data', (data) => {
        console.log(`❌ Host stderr:`, data.toString());
      });

      host.on('close', (code) => {
        if (!responseReceived) {
          console.log(`❌ Host closed without response (code: ${code})`);
          this.testResults.push({
            test: testName,
            success: false,
            error: `Host exited with code ${code}`,
            passed: false
          });
          resolve({ success: false, error: `Host exited with code ${code}` });
        }
      });

      // Send message
      setTimeout(() => {
        host.stdin.write(Buffer.concat([lengthBuffer, messageBuffer]));
      }, 100);
    });
  }

  async testScheduling() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateISO = tomorrow.toISOString().split('T')[0];

    const scheduleResult = await this.runTest('Schedule EO', {
      type: 'SCHEDULE_EO',
      payload: {
        dateISO: dateISO,
        start: '2:00pm',
        url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
      }
    });

    return { scheduleResult, dateISO };
  }

  async testCancellation(dateISO) {
    return await this.runTest('Cancel EO', {
      type: 'CANCEL_EO',
      payload: {
        dateISO: dateISO,
        start: '2:00pm'
      }
    });
  }

  async testGetScheduled() {
    return await this.runTest('Get Scheduled', {
      type: 'GET_SCHEDULED',
      payload: {}
    });
  }

  async testInvalidMessage() {
    return await this.runTest('Invalid Message Type', {
      type: 'INVALID_TYPE',
      payload: {}
    });
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));

    let passed = 0;
    let total = this.testResults.length;

    this.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.test}: ${result.passed ? 'PASSED' : 'FAILED'}`);
      if (result.passed) passed++;
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log(`\n📈 Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Native host integration is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the errors above.');
    }
  }

  async checkLaunchdJobs() {
    console.log('\n🔍 Checking for launchd jobs...');
    
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
      exec('ls ~/Library/LaunchAgents/com.eolist.schedule.*.plist 2>/dev/null || echo "No jobs found"', (error, stdout) => {
        console.log(stdout.trim());
        resolve(stdout.trim());
      });
    });
  }

  async run() {
    console.log('Starting comprehensive native host integration tests...\n');

    // Test 1: Basic scheduling
    const { scheduleResult, dateISO } = await this.testScheduling();
    
    // Check if job was created
    await this.checkLaunchdJobs();

    // Test 2: Get scheduled jobs
    await this.testGetScheduled();

    // Test 3: Cancellation
    if (scheduleResult.success) {
      await this.testCancellation(dateISO);
      
      // Check if job was removed
      console.log('\n🔍 Checking jobs after cancellation...');
      await this.checkLaunchdJobs();
    }

    // Test 4: Error handling
    await this.testInvalidMessage();

    // Test 5: Get scheduled after cleanup
    await this.testGetScheduled();

    this.printSummary();
  }
}

// Run the tests
const tester = new NativeHostTester();
tester.run().catch(console.error);