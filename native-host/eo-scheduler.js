#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const os = require('os');

class EOScheduler {
  constructor() {
    this.launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    this.setupMessageHandling();
  }

  setupMessageHandling() {
    // Handle Chrome extension messages
    process.stdin.on('readable', () => {
      let input = process.stdin.read();
      if (input) {
        try {
          // Native messaging protocol: 4-byte length header + JSON message
          let messageLength = input.readUInt32LE(0);
          let messageData = input.slice(4, 4 + messageLength);
          let message = JSON.parse(messageData.toString());
          
          this.handleMessage(message);
        } catch (error) {
          this.sendMessage({ error: 'Failed to parse message', details: error.message });
        }
      }
    });

    // Handle direct command line calls (from launchd)
    if (process.argv.length > 2) {
      const command = process.argv[2];
      if (command === 'trigger') {
        this.triggerEO();
      }
    }
  }

  async handleMessage(message) {
    try {
      switch (message.type) {
        case 'SCHEDULE_EO':
          await this.scheduleEO(message.payload);
          break;
        case 'CANCEL_EO':
          await this.cancelEO(message.payload);
          break;
        case 'GET_SCHEDULED':
          await this.getScheduled();
          break;
        default:
          this.sendMessage({ error: 'Unknown message type', type: message.type });
      }
    } catch (error) {
      this.sendMessage({ error: 'Handler error', details: error.message });
    }
  }

  sendMessage(message) {
    let messageString = JSON.stringify(message);
    let messageBuffer = Buffer.from(messageString, 'utf8');
    let lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);
    
    process.stdout.write(Buffer.concat([lengthBuffer, messageBuffer]));
  }

  async scheduleEO(payload) {
    const { dateISO, start, url } = payload;
    
    try {
      // Calculate target time (2 hours before shift start)
      const targetTime = this.computeTargetTime(dateISO, start);
      if (!targetTime) {
        this.sendMessage({ 
          success: false, 
          error: 'Invalid time format',
          dateISO,
          start 
        });
        return;
      }

      const scheduleTime = new Date(targetTime.getTime() - 2 * 60 * 60 * 1000);
      const jobName = `com.eolist.schedule.${dateISO}_${start.replace(':', '')}`;
      
      // Create launchd plist
      await this.createLaunchdJob(jobName, scheduleTime, { dateISO, start, url });
      
      this.sendMessage({ 
        success: true, 
        jobName,
        scheduledFor: scheduleTime.toISOString(),
        dateISO,
        start
      });
      
    } catch (error) {
      this.sendMessage({ 
        success: false, 
        error: error.message,
        dateISO,
        start 
      });
    }
  }

  async cancelEO(payload) {
    const { dateISO, start } = payload;
    const jobName = `com.eolist.schedule.${dateISO}_${start.replace(':', '')}`;
    
    try {
      await this.removeLaunchdJob(jobName);
      this.sendMessage({ 
        success: true, 
        jobName,
        dateISO,
        start
      });
    } catch (error) {
      this.sendMessage({ 
        success: false, 
        error: error.message,
        jobName,
        dateISO,
        start 
      });
    }
  }

  async getScheduled() {
    try {
      const files = fs.readdirSync(this.launchAgentsDir);
      const eoJobs = files.filter(f => f.startsWith('com.eolist.schedule.'));
      
      const scheduled = [];
      for (const jobFile of eoJobs) {
        try {
          const plistPath = path.join(this.launchAgentsDir, jobFile);
          const plistContent = fs.readFileSync(plistPath, 'utf8');
          // Basic parsing to extract schedule info
          const jobInfo = this.parsePlistSchedule(plistContent, jobFile);
          if (jobInfo) scheduled.push(jobInfo);
        } catch (error) {
          // Skip invalid plist files
        }
      }
      
      this.sendMessage({ 
        success: true, 
        scheduled 
      });
    } catch (error) {
      this.sendMessage({ 
        success: false, 
        error: error.message 
      });
    }
  }

  computeTargetTime(dateISO, start) {
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
  }

  async createLaunchdJob(jobName, scheduleTime, metadata) {
    const plistContent = this.generatePlist(jobName, scheduleTime, metadata);
    const plistPath = path.join(this.launchAgentsDir, `${jobName}.plist`);
    
    // Ensure LaunchAgents directory exists
    if (!fs.existsSync(this.launchAgentsDir)) {
      fs.mkdirSync(this.launchAgentsDir, { recursive: true });
    }
    
    // Write plist file
    fs.writeFileSync(plistPath, plistContent);
    
    // Validate plist
    await this.validatePlist(plistPath);
    
    // Load the job
    await this.runCommand(`launchctl load "${plistPath}"`);
    
    return jobName;
  }

  async removeLaunchdJob(jobName) {
    const plistPath = path.join(this.launchAgentsDir, `${jobName}.plist`);
    
    // Unload the job (ignore errors if not loaded)
    try {
      await this.runCommand(`launchctl unload "${plistPath}"`);
    } catch (error) {
      // Job might not be loaded, continue with removal
    }
    
    // Remove plist file
    if (fs.existsSync(plistPath)) {
      fs.unlinkSync(plistPath);
    }
    
    return jobName;
  }

  generatePlist(jobName, scheduleTime, metadata) {
    const hostPath = path.resolve(__filename);
    const nodePath = process.execPath; // Get actual Node.js path
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${jobName}</string>
    <key>Program</key>
    <string>${nodePath}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${hostPath}</string>
        <string>trigger</string>
        <string>${JSON.stringify(metadata).replace(/"/g, '&quot;')}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Year</key>
        <integer>${scheduleTime.getFullYear()}</integer>
        <key>Month</key>
        <integer>${scheduleTime.getMonth() + 1}</integer>
        <key>Day</key>
        <integer>${scheduleTime.getDate()}</integer>
        <key>Hour</key>
        <integer>${scheduleTime.getHours()}</integer>
        <key>Minute</key>
        <integer>${scheduleTime.getMinutes()}</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>`;
  }

  async validatePlist(plistPath) {
    try {
      await this.runCommand(`plutil -lint "${plistPath}"`);
    } catch (error) {
      throw new Error(`Invalid plist file: ${error.message}`);
    }
  }

  parsePlistSchedule(plistContent, filename) {
    try {
      // Extract job name and basic info from filename
      const match = filename.match(/com\.eolist\.schedule\.(.+)\.plist$/);
      if (!match) return null;
      
      const [dateISO, startTime] = match[1].split('_');
      const start = startTime.replace(/(\d{2})/, '$1:');
      
      // Extract schedule time from plist (basic regex parsing)
      const yearMatch = plistContent.match(/<key>Year<\/key>\s*<integer>(\d+)<\/integer>/);
      const monthMatch = plistContent.match(/<key>Month<\/key>\s*<integer>(\d+)<\/integer>/);
      const dayMatch = plistContent.match(/<key>Day<\/key>\s*<integer>(\d+)<\/integer>/);
      const hourMatch = plistContent.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
      const minuteMatch = plistContent.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
      
      if (yearMatch && monthMatch && dayMatch && hourMatch && minuteMatch) {
        const scheduleTime = new Date(
          parseInt(yearMatch[1]),
          parseInt(monthMatch[1]) - 1,
          parseInt(dayMatch[1]),
          parseInt(hourMatch[1]),
          parseInt(minuteMatch[1])
        );
        
        return {
          dateISO,
          start,
          scheduledFor: scheduleTime.toISOString(),
          jobName: filename.replace('.plist', '')
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async triggerEO() {
    try {
      // Parse metadata from command line argument
      const metadataStr = process.argv[3];
      const metadata = JSON.parse(metadataStr.replace(/&quot;/g, '"'));
      
      // Open Chrome with the VR portal
      const chromeUrl = metadata.url || 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster';
      
      // Try different Chrome paths
      const chromePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ];
      
      let chromePath = null;
      for (const path of chromePaths) {
        if (fs.existsSync(path)) {
          chromePath = path;
          break;
        }
      }
      
      if (!chromePath) {
        throw new Error('Chrome not found');
      }
      
      // Launch Chrome with the extension
      const chromeArgs = [
        '--app=' + chromeUrl,
        '--new-window'
      ];
      
      spawn(chromePath, chromeArgs, { 
        detached: true,
        stdio: 'ignore'
      });
      
      // Clean up the job after execution
      setTimeout(async () => {
        const jobName = `com.eolist.schedule.${metadata.dateISO}_${metadata.start.replace(':', '')}`;
        try {
          await this.removeLaunchdJob(jobName);
        } catch (error) {
          // Ignore cleanup errors
        }
      }, 5000);
      
    } catch (error) {
      console.error('Failed to trigger EO:', error.message);
    }
  }

  runCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${error.message}\nStderr: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

// Start the scheduler
new EOScheduler();