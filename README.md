## EO List (Chrome Extension)

Adds an "EO ASAP" button on the VR roster page and automatically joins the Early Out list at the earliest possible moment (2 hours before the shift start).

Portal: `https://vr.hollywoodcasinocolumbus.com/ess/Default.aspx?#/roster`

### Load the extension
- Open Chrome → `chrome://extensions` → enable Developer Mode → Load Unpacked → select this folder.
- Navigate to the roster page and open any shift. In the modal, click the injected "EO ASAP" button.

### How it works
- The content script parses the selected shift's date and start time from the modal.
- If EO is already available, it immediately clicks "EO List" → "Submit".
- If EO opens in the future, it schedules a browser alarm for exactly 2 hours before the shift.
- When the alarm fires, a tab is opened on the roster and the automation locates the shift, opens it, and clicks "EO List" → "Submit".

### Notes
- If your session is signed out at alarm time, a notification will ask you to log in, then the extension will retry on the next minute.
- You can adjust text selectors in `src/clicker.js` and `src/content.js` if the portal markup differs.


