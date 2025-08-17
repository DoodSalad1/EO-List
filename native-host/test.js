#!/usr/bin/env node

// Quick test script for the native messaging host

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing EO List Native Host...\n');

const hostPath = path.join(__dirname, 'eo-scheduler.js');

// Test 1: Basic functionality
console.log('Test 1: Basic host startup');
const host = spawn('node', [hostPath]);

// Test message
const testMessage = {
  type: 'SCHEDULE_EO',
  payload: {
    dateISO: '2025-08-18',
    start: '2:00pm',
    url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
  }
};

const messageString = JSON.stringify(testMessage);
const messageBuffer = Buffer.from(messageString, 'utf8');
const lengthBuffer = Buffer.alloc(4);
lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

host.stdout.on('data', (data) => {
  try {
    // Parse native messaging response
    const responseLength = data.readUInt32LE(0);
    const responseData = data.slice(4, 4 + responseLength);
    const response = JSON.parse(responseData.toString());
    
    console.log('✅ Native host response:', response);
    
    if (response.success) {
      console.log(`✅ Scheduled for: ${response.scheduledFor}`);
      console.log(`✅ Job name: ${response.jobName}`);
    } else {
      console.log(`❌ Error: ${response.error}`);
    }
  } catch (error) {
    console.log('❌ Failed to parse response:', error.message);
  }
  
  host.kill();
});

host.stderr.on('data', (data) => {
  console.log('❌ Host stderr:', data.toString());
});

host.on('close', (code) => {
  console.log(`\n🏁 Test completed with exit code ${code}`);
  
  // Test 2: Check if any jobs were created
  console.log('\nTest 2: Checking for created launchd jobs...');
  const { exec } = require('child_process');
  
  exec('ls ~/Library/LaunchAgents/com.eolist.schedule.*.plist 2>/dev/null', (error, stdout) => {
    if (stdout.trim()) {
      console.log('✅ Found launchd jobs:');
      console.log(stdout.trim());
      
      // Clean up test jobs
      exec('rm ~/Library/LaunchAgents/com.eolist.schedule.*.plist 2>/dev/null', (error) => {
        if (!error) console.log('🧹 Cleaned up test jobs');
      });
    } else {
      console.log('ℹ️  No launchd jobs found (this might be expected for testing)');
    }
  });
});

// Send test message
setTimeout(() => {
  host.stdin.write(Buffer.concat([lengthBuffer, messageBuffer]));
}, 100);

console.log('📤 Sent test message to native host...');