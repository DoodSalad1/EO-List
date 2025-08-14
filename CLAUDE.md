# EO List Extension - Claude Development Guidelines

## Project Overview
This Chrome extension automates joining the Early Out (EO) list on the Hollywood Casino Columbus VR portal exactly 2 hours before shift start time.

**Target Site**: `https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster`

## Architecture
- **Background Worker**: `src/background.js` - Alarm scheduling and coordination
- **Content Script**: `src/content.js` - UI injection and user interaction
- **Automation**: `src/clicker.js` - Main EO submission automation
- **Precision**: `src/precise.js` - High-accuracy timing for submissions
- **Testing**: `src/test_login.js` - Credential validation
- **UI**: `popup.html` + `options.html` - User configuration

## Development Rules

### Code Standards
- Follow existing patterns and naming conventions
- Use async/await for Chrome extension APIs
- Maintain error handling with try/catch blocks
- Keep selectors flexible with multiple fallback options
- Use XPath for reliable text-based element selection

### Testing Commands
Before committing changes, always run:
```bash
# Load extension in Chrome
# Navigate to chrome://extensions/
# Enable Developer Mode
# Click "Load unpacked" and select project folder
```

### Key Implementation Details

#### Time Parsing
- Date format: `YYYY-MM-DD` (ISO)
- Time format: `8:00pm` (12-hour with am/pm)
- Target calculation: shift start time minus 2 hours

#### Element Selection Strategy
1. Try specific IDs first (`txtUserName`, `txtPassword`, `cmdLogin`)
2. Fall back to generic selectors (`input[type="password"]`)
3. Use XPath for text-based matching (`EO List`, `Submit`)
4. Handle dynamic content with MutationObserver

#### Chrome Extension Best Practices
- Store credentials in `chrome.storage.local` with sync backup
- Use `chrome.alarms` for scheduled tasks
- Implement proper message passing between scripts
- Handle tab lifecycle events properly

### File-Specific Guidelines

#### `src/background.js`
- Alarm names format: `EO_ALARM_${dateISO}_${start}`
- Pre-alarm names: `EO_PRE_${dateISO}_${start}` 
- Always clean up storage when canceling alarms
- Update badge status after alarm changes

#### `src/content.js`
- Query shift dialogs with multiple selector strategies
- Parse date from headings like "Schedule for Sun 08/10/2025"
- Parse time from first occurrence in dialog text
- Maintain floating button and status panel

#### `src/clicker.js`
- Handle login page detection and auto-login
- Click sequence: Find shift → Open dialog → EO List → Submit
- Use sleep delays between actions (400-500ms typical)
- Log all major actions for debugging

### Security Considerations
- Only access `vr.hollywoodcasinocolumbus.com` domain
- Store credentials securely in Chrome storage
- Never log sensitive information to console
- Validate all user inputs before processing

### UI Guidelines
- Use existing CSS classes (`eo-asap-btn`)
- Maintain consistent blue color scheme (`#0b74de`)
- Position floating elements with high z-index (`2147483647`)
- Provide user feedback via toasts and notifications

### Debugging Tips
- Check browser console for `[EO List]`, `[EO Runner]`, `[EO Precise]` logs
- Use Chrome DevTools to inspect injected elements
- Test with Chrome extension reload during development
- Verify alarm scheduling in Chrome DevTools > Application > Storage

### Common Issues & Solutions
- **Modal not detected**: Add more selector fallbacks to `queryShiftDialog()`
- **Time parsing fails**: Update regex patterns in `parseShiftDateTime()`
- **Login issues**: Verify credential storage and field selectors
- **Timing precision**: Adjust `PRE_LEAD_MS` constant if needed

### Maintenance Notes
- Portal UI changes may require selector updates
- Test login functionality after any Chrome updates
- Monitor alarm reliability across browser sessions
- Verify cross-platform compatibility (Windows focus)

## Extension Management
- Version format: `0.1.x` for patches, `0.x.0` for features
- Update `manifest.json` version before publishing
- Test thoroughly on target portal before deployment
- Keep credentials secure during development/testing