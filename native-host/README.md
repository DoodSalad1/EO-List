# EO List System-Level Scheduler

This native messaging host enables the EO List Chrome extension to schedule EO submissions that work even when Chrome is closed or your Mac was asleep.

## How It Works

- **Chrome Extension**: Handles UI and portal interaction (unchanged)
- **Native Host**: Manages system-level scheduling via macOS launchd
- **launchd Jobs**: Execute at scheduled times even when Chrome is closed
- **Dual Scheduling**: Chrome alarms (when open) + system-level (when closed)

## Installation

### Prerequisites
- Node.js installed and accessible via `node` command
- Chrome with the EO List extension loaded

### Steps

1. **Run the installation script:**
   ```bash
   cd /Users/rileyhays/EO-List/native-host
   ./install.sh
   ```

2. **Get your extension ID:**
   - Open Chrome: `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Find "EO List" extension
   - Copy the ID (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

3. **Enter the extension ID when prompted**

4. **Reload the extension in Chrome**

## Testing

### Test Native Messaging Connection
1. Open Chrome DevTools on any VR portal page
2. Go to Console and run:
   ```javascript
   chrome.runtime.sendMessage({
     type: 'EO_SCHEDULE_OR_RUN',
     payload: {
       dateISO: '2025-08-18',
       start: '2:00pm',
       url: 'https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster'
     }
   }, response => console.log('Response:', response));
   ```

### Test System-Level Scheduling
1. Schedule an EO for 2-3 minutes in the future
2. **Close Chrome completely** (Cmd+Q, not just minimize)
3. Wait for the scheduled time
4. Chrome should automatically open and submit the EO

### Verify launchd Jobs
```bash
# List all EO jobs
ls ~/Library/LaunchAgents/com.eolist.schedule.*.plist

# Check if a job is loaded
launchctl list | grep com.eolist.schedule

# View job details
launchctl list com.eolist.schedule.2025-08-18_200pm
```

## File Structure

```
native-host/
├── eo-scheduler.js          # Main native host application
├── com.eolist.scheduler.json # Native messaging manifest
├── install.sh               # Installation script
└── README.md               # This file
```

## How Scheduling Works

### Dual Scheduling System
1. **Chrome Alarms**: Traditional Chrome extension alarms (when Chrome is open)
2. **launchd Jobs**: System-level macOS scheduling (when Chrome is closed)

### Execution Flow
1. User schedules EO via extension UI
2. Extension creates Chrome alarm AND sends request to native host
3. Native host creates launchd job with precise timing
4. At scheduled time:
   - If Chrome is open: Chrome alarm fires
   - If Chrome is closed: launchd job opens Chrome and triggers extension

### Job Management
- Jobs are automatically cleaned up after execution
- Multiple EOs can be scheduled simultaneously
- Jobs persist across system reboots and user logouts

## Troubleshooting

### Native Host Not Found
```
Error: Native host disconnected: Specified native messaging host not found.
```
**Solution**: Run the installation script and ensure the extension ID is correct.

### Permission Denied
```
Error: /Users/.../eo-scheduler.js: Permission denied
```
**Solution**: Make sure the script is executable:
```bash
chmod +x /Users/rileyhays/EO-List/native-host/eo-scheduler.js
```

### Node.js Not Found
```
Error: node: command not found
```
**Solution**: Install Node.js or update your PATH in the launchd job.

### Jobs Not Firing
1. Check if job is loaded: `launchctl list | grep com.eolist.schedule`
2. Check job plist syntax: `plutil -lint ~/Library/LaunchAgents/com.eolist.schedule.*.plist`
3. Verify system date/time settings

### Debug Logging
Native host logs are available in Console.app:
1. Open Console.app
2. Search for "eolist" or "EO List"
3. Look for Node.js process logs

## Technical Details

### Native Messaging Protocol
- Communication via stdin/stdout with 4-byte length headers
- JSON message format
- Chrome manages native host process lifecycle

### launchd Integration
- Jobs stored in `~/Library/LaunchAgents/`
- Uses `StartCalendarInterval` for precise timing
- Automatic cleanup after job execution
- Survives system sleep/wake cycles

### Security
- Native host only accepts connections from the EO List extension
- launchd jobs run with user privileges (no admin access needed)
- All scheduled jobs are user-visible and manageable

## Advanced Usage

### Manual Job Management
```bash
# Manually load a job
launchctl load ~/Library/LaunchAgents/com.eolist.schedule.YYYY-MM-DD_Hhmpm.plist

# Manually unload a job
launchctl unload ~/Library/LaunchAgents/com.eolist.schedule.YYYY-MM-DD_Hhmpm.plist

# Remove job file
rm ~/Library/LaunchAgents/com.eolist.schedule.YYYY-MM-DD_Hhmpm.plist
```

### Custom Chrome Path
If Chrome is installed in a non-standard location, edit `eo-scheduler.js` and update the `chromePaths` array.

## Version History

- **v0.2.0**: Added system-level scheduling with native messaging
- **v0.1.5**: Chrome extension only (alarms require Chrome to be open)