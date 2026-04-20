# Elderly Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-cost elderly monitoring system that collects activity signals from an Android phone (Termux), Alexa, and CCTV into Google Sheets, then fires Telegram warnings and CallMeBot WhatsApp calls when inactivity rules are violated.

**Architecture:** A Google Apps Script Web App (`doPost` endpoint) acts as the central ingestion point — Termux, IFTTT, and kensho-local all POST JSON events to it. A separate Apps Script rules engine runs every 10 minutes, reads the RULES config sheet, checks EVENTS for gaps, and dispatches alerts via Telegram and CallMeBot with a 1-hour per-rule cooldown.

**Tech Stack:** Google Apps Script (Web App + time trigger), Bash (Termux on Android), Python (kensho-local patch), IFTTT (Alexa webhook), Telegram Bot API, CallMeBot WhatsApp API

---

## File Structure

```
elderly-monitor/
├── sheets/
│   ├── ingest.gs           — doPost web app: receives events, appends to EVENTS sheet
│   ├── rules_engine.gs     — time trigger: reads RULES, checks EVENTS, fires alerts
│   ├── alert_sender.gs     — sends Telegram messages + CallMeBot WhatsApp calls
│   └── SHEETS_SETUP.md     — manual steps to create sheet tabs + deploy web app
├── termux/
│   └── monitor.sh          — cron script on Android (every 5 min)
├── kensho-patch/
│   └── cctv_sheet_hook.py  — adds EVENTS posting to kensho-local motion handler
└── DEPLOY.md               — end-to-end deployment guide
```

**Key design choice:** Using an Apps Script Web App URL as the POST endpoint avoids OAuth from Termux. The URL itself is the secret — no API keys to manage on Android.

---

## Task 1: Create Google Sheet Structure

**Files:**
- Create: `sheets/SHEETS_SETUP.md`

- [ ] **Step 1: Create the Google Sheet manually**

1. Go to sheets.google.com → New blank spreadsheet
2. Rename it: `Elderly Monitor`
3. Create these 4 tabs (rename Sheet1, add 3 more):
   - `EVENTS`
   - `RULES`
   - `ALERTS_LOG`
   - `DASHBOARD`

- [ ] **Step 2: Set up EVENTS tab headers (row 1)**

Click EVENTS tab. In row 1, type these headers in columns A–E:
```
Timestamp | Source | Event Type | Value | Notes
```
Freeze row 1: View → Freeze → 1 row.

- [ ] **Step 3: Set up RULES tab**

Click RULES tab. In row 1, type headers:
```
Rule ID | Description | Threshold Hours | Start Hour | End Hour | Enabled
```
In rows 2–5, enter the default rules:
```
no_movement      | No phone movement          | 3 | 4 | 22 | TRUE
no_phone_usage   | No calls or notifications  | 2 | 4 | 22 | TRUE
no_morning       | No activity by 6am         | 0 | 4 | 6  | TRUE
combined_silence | No signal from all sources | 2 | 4 | 22 | TRUE
```

- [ ] **Step 4: Set up ALERTS_LOG tab headers**

```
Timestamp | Rule ID | Message | Channel | Acknowledged
```

- [ ] **Step 5: Note the Sheet ID**

From the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
Save this — needed in every subsequent task.

- [ ] **Step 6: Write SHEETS_SETUP.md**

Create `sheets/SHEETS_SETUP.md`:

```markdown
# Sheets Setup

## Sheet ID
YOUR_SHEET_ID_HERE  ← paste your actual ID here

## Tabs Required
- EVENTS: Timestamp, Source, Event Type, Value, Notes
- RULES: Rule ID, Description, Threshold Hours, Start Hour, End Hour, Enabled
- ALERTS_LOG: Timestamp, Rule ID, Message, Channel, Acknowledged
- DASHBOARD: formula-driven (added in Task 6)

## Default Rules
| Rule ID         | Threshold | Hours   |
|-----------------|-----------|---------|
| no_movement     | 3 hrs     | 4–22    |
| no_phone_usage  | 2 hrs     | 4–22    |
| no_morning      | check     | 4–6     |
| combined_silence| 2 hrs     | 4–22    |
```

- [ ] **Step 7: Commit**

```bash
cd /home/jo/claude_projects/elderly-monitor
git add sheets/SHEETS_SETUP.md
git commit -m "docs: add sheets setup guide and structure"
```

---

## Task 2: Build the Ingest Web App (doPost endpoint)

**Files:**
- Create: `sheets/ingest.gs`

This is the central POST endpoint. All data sources send here.

- [ ] **Step 1: Create ingest.gs**

Create `sheets/ingest.gs`:

```javascript
/**
 * Elderly Monitor — Event ingestion web app.
 * Deploy as Web App (Execute as: Me, Access: Anyone).
 * POST JSON: { source, eventType, value, notes }
 */

const SHEET_ID = 'YOUR_SHEET_ID_HERE'; // ← replace with your Sheet ID
const EVENTS_SHEET = 'EVENTS';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(EVENTS_SHEET);

    const timestamp = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'
    );

    sheet.appendRow([
      timestamp,
      data.source    || 'unknown',
      data.eventType || 'unknown',
      data.value     || '1',
      data.notes     || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', timestamp }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function — run manually to verify sheet write works
function testDoPost() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        source: 'test',
        eventType: 'test_event',
        value: '1',
        notes: 'manual test'
      })
    }
  };
  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}
```

- [ ] **Step 2: Paste into Apps Script**

1. Open your Elderly Monitor Google Sheet
2. Extensions → Apps Script
3. Delete default Code.gs content
4. Paste `ingest.gs` content
5. Replace `YOUR_SHEET_ID_HERE` with your actual Sheet ID
6. Save (Ctrl+S), name the project `ElderlyMonitor`

- [ ] **Step 3: Run testDoPost to verify**

Select function `testDoPost` → Run → approve permissions.
Open EVENTS sheet — should see a test row with `source=test`.

- [ ] **Step 4: Deploy as Web App**

In Apps Script:
1. Click Deploy → New deployment
2. Type: Web App
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click Deploy → Copy the Web App URL

Save the Web App URL — this is your POST endpoint for all data sources.

- [ ] **Step 5: Test the endpoint with curl**

```bash
curl -s -L -X POST "YOUR_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{"source":"curl_test","eventType":"test","value":"1","notes":"curl test"}'
```
Expected: `{"status":"ok","timestamp":"2026-04-20 10:00:00"}`
Check EVENTS sheet — new row should appear.

- [ ] **Step 6: Commit**

```bash
git add sheets/ingest.gs
git commit -m "feat: add doPost ingest web app"
```

---

## Task 3: Build Alert Sender

**Files:**
- Create: `sheets/alert_sender.gs`

- [ ] **Step 1: Create alert_sender.gs**

Create `sheets/alert_sender.gs`:

```javascript
/**
 * Alert delivery — Telegram messages + CallMeBot WhatsApp calls.
 * Called by rules_engine.gs.
 */

const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN';   // ← replace
const TELEGRAM_CHAT_ID   = 'YOUR_CHAT_ID';     // ← replace
const CALLMEBOT_PHONE    = 'YOUR_WHATSAPP_NUMBER'; // international format: 919876543210
const CALLMEBOT_API_KEY  = 'YOUR_CALLMEBOT_KEY';   // ← from CallMeBot registration

function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  };
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('Telegram sent: ' + message);
  } catch (e) {
    Logger.log('Telegram error: ' + e.message);
  }
}

function sendCallMeBot(message) {
  const encoded = encodeURIComponent(message);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&apikey=${CALLMEBOT_API_KEY}&text=${encoded}`;
  try {
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    Logger.log('CallMeBot sent: ' + message);
  } catch (e) {
    Logger.log('CallMeBot error: ' + e.message);
  }
}

function sendAlert(ruleId, message, level) {
  // level: 'warning' → Telegram only | 'alert' → Telegram + CallMeBot
  const icon = level === 'alert' ? '🔴' : '⚠️';
  const fullMsg = `${icon} <b>Elderly Monitor</b>\n${message}\n<i>${new Date().toLocaleString('en-IN')}</i>`;

  sendTelegram(fullMsg);

  if (level === 'alert') {
    sendCallMeBot(`ALERT: ${message}`);
  }

  // Log to ALERTS_LOG sheet
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const log = ss.getSheetByName('ALERTS_LOG');
  log.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    ruleId,
    message,
    level === 'alert' ? 'telegram+callmebot' : 'telegram',
    'no'
  ]);
}

// Test — run manually to verify Telegram works
function testSendTelegram() {
  sendTelegram('✅ Elderly Monitor test message — Telegram working!');
}

// Test — run manually to verify CallMeBot works
function testSendCallMeBot() {
  sendCallMeBot('Elderly Monitor test — CallMeBot working!');
}
```

- [ ] **Step 2: Register CallMeBot**

On WhatsApp, send this exact message to **+34 644 33 45 04**:
```
I allow callmebot to send me messages
```
You will receive an API key back. Paste it into `CALLMEBOT_API_KEY` in alert_sender.gs.

- [ ] **Step 3: Add alert_sender.gs to Apps Script**

In Apps Script editor:
1. Click `+` → New script file → name it `alert_sender`
2. Paste content of alert_sender.gs
3. Replace all 4 config values (bot token, chat ID, phone, callmebot key)
4. Save

- [ ] **Step 4: Test Telegram**

Select function `testSendTelegram` → Run.
Expected: Telegram message appears in your chat.

- [ ] **Step 5: Test CallMeBot**

Select function `testSendCallMeBot` → Run.
Expected: WhatsApp message arrives on your phone.

- [ ] **Step 6: Commit**

```bash
git add sheets/alert_sender.gs
git commit -m "feat: add alert_sender with Telegram + CallMeBot"
```

---

## Task 4: Build Rules Engine

**Files:**
- Create: `sheets/rules_engine.gs`

- [ ] **Step 1: Create rules_engine.gs**

Create `sheets/rules_engine.gs`:

```javascript
/**
 * Rules engine — runs every 10 min via time trigger.
 * Reads RULES sheet, checks EVENTS for gaps, fires alerts via alert_sender.gs.
 */

const COOLDOWN_MINUTES = 60; // don't re-fire same rule within this window

function runRulesEngine() {
  const ss       = SpreadsheetApp.openById(SHEET_ID);
  const rulesSheet  = ss.getSheetByName('RULES');
  const eventsSheet = ss.getSheetByName(EVENTS_SHEET);
  const props    = PropertiesService.getScriptProperties();
  const now      = new Date();
  const nowHour  = now.getHours();

  // Load all events into memory once
  const eventsData = eventsSheet.getDataRange().getValues().slice(1); // skip header

  // Load rules
  const rulesData = rulesSheet.getDataRange().getValues().slice(1);

  let alertCount = 0;

  for (const rule of rulesData) {
    const [ruleId, description, thresholdHours, startHour, endHour, enabled] = rule;
    if (!enabled || enabled === 'FALSE' || enabled === false) continue;

    // Check active hours
    if (nowHour < Number(startHour) || nowHour >= Number(endHour)) continue;

    // Check cooldown
    const cooldownKey = `cooldown_${ruleId}`;
    const lastFired = props.getProperty(cooldownKey);
    if (lastFired) {
      const minutesSince = (now - new Date(lastFired)) / 60000;
      if (minutesSince < COOLDOWN_MINUTES) continue;
    }

    // Check rule
    let shouldFire = false;
    let message = '';

    if (ruleId === 'no_movement') {
      const lastEvent = getLastEventTime(eventsData, 'phone', 'movement');
      const hoursAgo = lastEvent ? (now - lastEvent) / 3600000 : 999;
      if (hoursAgo >= Number(thresholdHours)) {
        shouldFire = true;
        message = `No phone movement for ${Math.floor(hoursAgo)}h. Last seen: ${lastEvent ? lastEvent.toLocaleTimeString('en-IN') : 'never'}`;
      }
    }

    else if (ruleId === 'no_phone_usage') {
      const lastCall  = getLastEventTime(eventsData, 'phone', 'call_made');
      const lastNotif = getLastEventTime(eventsData, 'phone', 'phone_active');
      const lastRecv  = getLastEventTime(eventsData, 'phone', 'call_received');
      const candidates = [lastCall, lastNotif, lastRecv].filter(Boolean);
      const lastUsage  = candidates.length ? new Date(Math.max(...candidates)) : null;
      const hoursAgo   = lastUsage ? (now - lastUsage) / 3600000 : 999;
      if (hoursAgo >= Number(thresholdHours)) {
        shouldFire = true;
        message = `No phone activity (calls/notifications) for ${Math.floor(hoursAgo)}h.`;
      }
    }

    else if (ruleId === 'no_morning') {
      // Fires if it's past 6am and no event from any source today
      if (nowHour >= 6) {
        const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        const todayEvents = eventsData.filter(r => r[0] && r[0].toString().startsWith(todayStr));
        if (todayEvents.length === 0) {
          shouldFire = true;
          message = `No activity detected today (${todayStr}) — expected wake-up by 6am.`;
        }
      }
    }

    else if (ruleId === 'combined_silence') {
      const lastPhone  = getLastEventTime(eventsData, 'phone', null);
      const lastAlexa  = getLastEventTime(eventsData, 'alexa', null);
      const lastCctv   = getLastEventTime(eventsData, 'cctv', null);
      const allSources = [lastPhone, lastAlexa, lastCctv].filter(Boolean);
      const mostRecent = allSources.length ? new Date(Math.max(...allSources)) : null;
      const hoursAgo   = mostRecent ? (now - mostRecent) / 3600000 : 999;
      if (hoursAgo >= Number(thresholdHours)) {
        shouldFire = true;
        message = `⚠️ COMBINED SILENCE: No signal from phone, Alexa, or CCTV for ${Math.floor(hoursAgo)}h.`;
        alertCount++;
      }
    }

    if (shouldFire) {
      const level = (ruleId === 'combined_silence' || alertCount >= 2) ? 'alert' : 'warning';
      sendAlert(ruleId, message, level);
      props.setProperty(cooldownKey, now.toISOString());
      Logger.log(`Rule fired: ${ruleId} → ${level}`);
    }
  }
}

function getLastEventTime(eventsData, source, eventType) {
  // Returns the most recent Date for matching source+eventType (eventType null = any)
  let latest = null;
  for (const row of eventsData) {
    const ts  = row[0];
    const src = row[1];
    const typ = row[2];
    if (!ts) continue;
    if (src !== source) continue;
    if (eventType && typ !== eventType) continue;
    const d = new Date(ts);
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

function setupRulesTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runRulesEngine')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runRulesEngine')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('10-minute trigger registered for runRulesEngine');
}

// Test — run manually with mock data to verify rule logic
function testRulesEngine() {
  Logger.log('Running rules engine manually...');
  runRulesEngine();
  Logger.log('Done. Check ALERTS_LOG sheet and Telegram.');
}
```

- [ ] **Step 2: Add to Apps Script**

In Apps Script editor:
1. `+` → New script file → `rules_engine`
2. Paste content
3. Save

- [ ] **Step 3: Run testRulesEngine manually**

Select `testRulesEngine` → Run.
Expected: Logger shows rules checked. If EVENTS has old/no data, warnings should fire to Telegram.

- [ ] **Step 4: Register 10-minute trigger**

Select `setupRulesTrigger` → Run.
Verify: Apps Script → Triggers → `runRulesEngine` every 10 minutes.

- [ ] **Step 5: Commit**

```bash
git add sheets/rules_engine.gs
git commit -m "feat: add rules engine with 4 rules + cooldown"
```

---

## Task 5: Termux Monitor Script (Android)

**Files:**
- Create: `termux/monitor.sh`

- [ ] **Step 1: Create monitor.sh**

Create `termux/monitor.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/bash
# Elderly Monitor — runs every 5 min via Termux cron
# Setup: crontab -e → add: */5 * * * * ~/monitor.sh >> ~/monitor.log 2>&1

WEB_APP_URL="YOUR_WEB_APP_URL_HERE"  # ← paste your Apps Script Web App URL
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

post_event() {
  local source="$1"
  local event_type="$2"
  local value="$3"
  local notes="$4"
  curl -s -L -X POST "$WEB_APP_URL" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"${source}\",\"eventType\":\"${event_type}\",\"value\":\"${value}\",\"notes\":\"${notes}\"}" \
    > /dev/null 2>&1
}

# 1. ACCELEROMETER — detect movement vs still
ACCEL_JSON=$(termux-sensor -s "TYPE_ACCELEROMETER" -n 3 -d 500 2>/dev/null)
EVENT_TYPE="still"
if [ -n "$ACCEL_JSON" ]; then
  MAG=$(echo "$ACCEL_JSON" | python3 -c "
import sys, json, math
try:
    data = json.load(sys.stdin)
    readings = data.get('TYPE_ACCELEROMETER', [])
    if readings:
        avg = sum(math.sqrt(sum(v**2 for v in r.get('values',[0,0,9.8]))) for r in readings) / len(readings)
        # Gravity is ~9.8. Deviation > 0.8 m/s² = movement
        print('movement' if abs(avg - 9.8) > 0.8 else 'still')
    else:
        print('still')
except:
    print('still')
" 2>/dev/null)
  EVENT_TYPE="${MAG:-still}"
fi
post_event "phone" "$EVENT_TYPE" "1" "accel:$TIMESTAMP"

# 2. CALL LOG — detect recent calls (last 6 min window)
CALL_JSON=$(termux-call-log -l 10 2>/dev/null)
if [ -n "$CALL_JSON" ]; then
  CALL_EVENT=$(echo "$CALL_JSON" | python3 -c "
import sys, json
from datetime import datetime, timedelta
try:
    logs = json.load(sys.stdin)
    cutoff = datetime.now() - timedelta(minutes=6)
    recent = [l for l in logs if datetime.fromtimestamp(l.get('date',0)/1000) > cutoff]
    if any(l.get('type') == 'OUTGOING' for l in recent):
        print('call_made')
    elif recent:
        print('call_received')
    else:
        print('none')
except:
    print('none')
" 2>/dev/null)
  if [ "$CALL_EVENT" != "none" ]; then
    post_event "phone" "$CALL_EVENT" "1" ""
  fi
fi

# 3. NOTIFICATIONS — detect phone active via notification count change
NOTIF_COUNT=$(termux-notification-list 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(len(data) if isinstance(data, list) else 0)
except:
    print(0)
" 2>/dev/null || echo "0")

LAST_NOTIF_FILE="$HOME/.last_notif_count"
LAST_COUNT=$(cat "$LAST_NOTIF_FILE" 2>/dev/null || echo "0")

if [ "$NOTIF_COUNT" != "$LAST_COUNT" ]; then
  post_event "phone" "phone_active" "1" "notif_count:$NOTIF_COUNT"
  echo "$NOTIF_COUNT" > "$LAST_NOTIF_FILE"
fi

echo "[$TIMESTAMP] Done: accel=$EVENT_TYPE notif=$NOTIF_COUNT"
```

- [ ] **Step 2: Install on Android (Termux)**

On the elderly person's Android phone:

1. Install **Termux** from F-Droid (not Play Store — Play Store version is outdated)
   - F-Droid: https://f-droid.org → search Termux
2. Install **Termux:API** from F-Droid (same search)
3. Open Termux, run:
```bash
pkg update -y && pkg install termux-api python curl cronie -y
```

- [ ] **Step 3: Copy monitor.sh to phone**

Option A — type it manually in Termux:
```bash
nano ~/monitor.sh
# paste content, save with Ctrl+X → Y → Enter
```

Option B — copy via SSH (if on same WiFi):
```bash
# On Ubuntu:
scp termux/monitor.sh USER@PHONE_IP:/data/data/com.termux/files/home/monitor.sh
```

- [ ] **Step 4: Edit the Web App URL in monitor.sh**

```bash
nano ~/monitor.sh
# Replace YOUR_WEB_APP_URL_HERE with your actual URL
```

- [ ] **Step 5: Make executable and test**

```bash
chmod +x ~/monitor.sh
~/monitor.sh
```
Expected output: `[2026-04-20 10:00:00] Done: accel=still notif=3`
Check EVENTS sheet — new rows should appear.

- [ ] **Step 6: Set up cron**

```bash
# Start crond service
crond

# Edit crontab
crontab -e
# Add this line:
*/5 * * * * ~/monitor.sh >> ~/monitor.log 2>&1

# Make crond start on Termux launch
echo "crond" >> ~/.bashrc
```

- [ ] **Step 7: Enable Termux wake lock (prevents Android killing the script)**

In Termux, swipe from left → hold the notification → tap the lock icon to enable wake lock.
Or run: `termux-wake-lock`

- [ ] **Step 8: Commit**

```bash
# On Ubuntu:
git add termux/monitor.sh
git commit -m "feat: add Termux monitor script for Android"
```

---

## Task 6: kensho-local CCTV Patch

**Files:**
- Create: `kensho-patch/cctv_sheet_hook.py`
- Modify: existing kensho-local motion handler (identify the file first)

- [ ] **Step 1: Find the motion handler in kensho-local**

```bash
grep -rn "motion\|alert\|send" /home/jo/claude_projects/kensho-local/ --include="*.py" -l
```
Note the file that handles motion detection alerts.

- [ ] **Step 2: Create the hook module**

Create `kensho-patch/cctv_sheet_hook.py`:

```python
"""
Posts CCTV motion events to the Elderly Monitor EVENTS sheet via Apps Script Web App.
Import this in kensho-local's motion handler and call post_cctv_event() on detection.
"""

import requests
import logging
from datetime import datetime

WEB_APP_URL = "YOUR_WEB_APP_URL_HERE"  # ← same URL as monitor.sh

logger = logging.getLogger(__name__)

def post_cctv_event(notes: str = "") -> bool:
    """Post a CCTV motion event to Elderly Monitor sheet. Returns True on success."""
    payload = {
        "source": "cctv",
        "eventType": "cctv_motion",
        "value": "1",
        "notes": notes or f"motion at {datetime.now().strftime('%H:%M:%S')}"
    }
    try:
        resp = requests.post(WEB_APP_URL, json=payload, timeout=5)
        resp.raise_for_status()
        logger.info(f"CCTV event posted: {resp.json()}")
        return True
    except Exception as e:
        logger.warning(f"Failed to post CCTV event: {e}")
        return False
```

- [ ] **Step 3: Add hook call to kensho-local motion handler**

In kensho-local's motion handler file (found in Step 1), add after the existing Telegram alert:

```python
# Import at top of file:
import sys
sys.path.insert(0, '/home/jo/claude_projects/elderly-monitor/kensho-patch')
from cctv_sheet_hook import post_cctv_event

# In the motion detection callback, after existing alert:
post_cctv_event(notes=f"camera: {camera_name}")
```

- [ ] **Step 4: Edit WEB_APP_URL in cctv_sheet_hook.py**

```bash
nano /home/jo/claude_projects/elderly-monitor/kensho-patch/cctv_sheet_hook.py
# Replace YOUR_WEB_APP_URL_HERE with actual URL
```

- [ ] **Step 5: Test the hook manually**

```bash
cd /home/jo/claude_projects/elderly-monitor
python3 -c "
from kensho-patch.cctv_sheet_hook import post_cctv_event
result = post_cctv_event('manual test')
print('Success:', result)
"
```
Expected: `Success: True` and a new row in EVENTS sheet with `source=cctv`.

- [ ] **Step 6: Restart kensho-local**

```bash
cd /home/jo/claude_projects/kensho-local
# restart however kensho is normally run (check its README)
```

- [ ] **Step 7: Commit**

```bash
git add kensho-patch/cctv_sheet_hook.py
git commit -m "feat: add kensho-local CCTV hook to post events to sheet"
```

---

## Task 7: Alexa IFTTT Integration

**Files:**
- No code — IFTTT configuration + documentation in DEPLOY.md

- [ ] **Step 1: Create IFTTT applet**

1. Go to ifttt.com → Create
2. **If This:** Amazon Alexa → "Any new timer created"
3. **Then That:** Webhooks → Make a web request
   - URL: `YOUR_WEB_APP_URL`
   - Method: POST
   - Content Type: `application/json`
   - Body:
   ```json
   {"source":"alexa","eventType":"timer_set","value":"1","notes":"timer set at {{CreatedAt}}"}
   ```
4. Connect your Amazon account
5. Save applet

- [ ] **Step 2: Test**

Ask Alexa: "Alexa, set a timer for 1 minute."
Check EVENTS sheet — should see a new row with `source=alexa, eventType=timer_set` within 1 minute.

- [ ] **Step 3: Commit DEPLOY.md with Alexa steps**

(Documented in Task 8 below)

---

## Task 8: DASHBOARD Sheet + DEPLOY.md

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: Set up DASHBOARD tab formulas**

In the DASHBOARD sheet tab, paste these formulas:

| Cell | Formula |
|------|---------|
| A1 | `Status` |
| B1 | `=IF(COUNTIFS(ALERTS_LOG!B:B,"combined_silence",ALERTS_LOG!A:A,">="&TEXT(NOW()-1/24,"yyyy-mm-dd hh:mm:ss"))>0,"🔴 ALERT",IF(COUNTIFS(ALERTS_LOG!A:A,">="&TEXT(NOW()-3/24,"yyyy-mm-dd hh:mm:ss"))>0,"🟡 Warning","🟢 OK"))` |
| A2 | `Last Phone Movement` |
| B2 | `=IFERROR(TEXT(MAX(IF((EVENTS!B:B="phone")*(EVENTS!C:C="movement"),EVENTS!A:A)),"yyyy-mm-dd hh:mm:ss"),"never")` — enter with Ctrl+Shift+Enter (array formula) |
| A3 | `Last Alexa Activity` |
| B3 | `=IFERROR(TEXT(MAX(IF(EVENTS!B:B="alexa",EVENTS!A:A)),"yyyy-mm-dd hh:mm:ss"),"never")` — Ctrl+Shift+Enter |
| A4 | `Last CCTV Motion` |
| B4 | `=IFERROR(TEXT(MAX(IF(EVENTS!B:B="cctv",EVENTS!A:A)),"yyyy-mm-dd hh:mm:ss"),"never")` — Ctrl+Shift+Enter |
| A5 | `Today's Events` |
| B5 | `=COUNTIFS(EVENTS!A:A,">="&TEXT(TODAY(),"yyyy-mm-dd"))` |
| A7 | `Recent Events` |
| A8 | `=IFERROR(SORT(FILTER(EVENTS!A:E,EVENTS!A:A<>""),1,FALSE),"No events yet")` |

- [ ] **Step 2: Create DEPLOY.md**

Create `/home/jo/claude_projects/elderly-monitor/DEPLOY.md`:

```markdown
# Elderly Monitor — Deployment Guide

## Prerequisites
- Google account
- Android phone (elderly person's) with internet access
- Alexa device
- kensho-local running on Ubuntu

## Step 1 — Google Sheet
Follow `sheets/SHEETS_SETUP.md` to create the sheet with 4 tabs.
Note your Sheet ID from the URL.

## Step 2 — Apps Script
1. Extensions → Apps Script in your sheet
2. Create 3 script files: `ingest`, `alert_sender`, `rules_engine`
3. Paste content from `sheets/ingest.gs`, `sheets/alert_sender.gs`, `sheets/rules_engine.gs`
4. In `ingest.gs`: replace `YOUR_SHEET_ID_HERE`
5. In `alert_sender.gs`: replace bot token, chat ID, phone, CallMeBot key
6. Run `testDoPost` — verify EVENTS row appears
7. Deploy as Web App (Execute as Me, Anyone access) — copy URL
8. Run `testSendTelegram` — verify Telegram message arrives
9. Run `testSendCallMeBot` — verify WhatsApp message arrives
10. Run `setupRulesTrigger` — register 10-min auto-check

## Step 3 — Termux on Android Phone
1. Install Termux + Termux:API from F-Droid
2. `pkg update && pkg install termux-api python curl cronie -y`
3. Copy `termux/monitor.sh` to `~/monitor.sh`
4. Replace `YOUR_WEB_APP_URL_HERE` with your Web App URL
5. `chmod +x ~/monitor.sh && ~/monitor.sh` — verify EVENTS rows appear
6. `crontab -e` → add `*/5 * * * * ~/monitor.sh >> ~/monitor.log 2>&1`
7. Enable wake lock (swipe from left in Termux → lock icon)

## Step 4 — Alexa IFTTT
1. Create IFTTT applet: Alexa timer → Webhooks POST to Web App URL
2. Body: `{"source":"alexa","eventType":"timer_set","value":"1","notes":"{{CreatedAt}}"}`
3. Test: "Alexa, set a 1-minute timer" → check EVENTS sheet

## Step 5 — CCTV (kensho-local)
1. Edit `kensho-patch/cctv_sheet_hook.py` → replace Web App URL
2. Add import + `post_cctv_event()` call to kensho-local motion handler
3. Restart kensho-local — test with motion in front of camera

## Step 6 — DASHBOARD
Set up formulas in DASHBOARD tab per Task 8 in the plan.

## Step 7 — Verify Everything
- [ ] Phone row in EVENTS within 5 min of monitor.sh running
- [ ] Alexa row in EVENTS after setting timer
- [ ] CCTV row in EVENTS after motion detected
- [ ] DASHBOARD shows correct last-seen times
- [ ] Warning fires on Telegram (disable a rule temporarily to test)
- [ ] CallMeBot fires on combined_silence (set threshold to 0 hours, restore after)

## Troubleshooting
| Symptom | Fix |
|---------|-----|
| monitor.sh fails silently | Run manually, check `~/monitor.log` |
| No EVENTS rows from phone | Check Web App URL in monitor.sh, verify doPost deployed |
| termux-sensor returns empty | Grant Termux:API permissions in Android Settings → Apps |
| Rules engine not firing | Check RULES sheet — Enabled column must be TRUE (not text) |
| CallMeBot not working | Re-register: send message to +34 644 33 45 04 on WhatsApp |
| kensho patch import error | Check sys.path insert uses correct absolute path |
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: add DEPLOY.md end-to-end deployment guide"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Android phone (Termux) — Task 5: movement, calls, notifications
- ✅ Alexa IFTTT — Task 7
- ✅ CCTV kensho-local — Task 6
- ✅ Google Sheets schema (EVENTS, RULES, ALERTS_LOG, DASHBOARD) — Tasks 1, 8
- ✅ Rules engine with 4 rules — Task 4
- ✅ 1-hour cooldown — Task 4 (COOLDOWN_MINUTES)
- ✅ Active hours 4am–10pm — Task 4 (startHour/endHour from RULES sheet)
- ✅ Telegram alerts — Task 3
- ✅ CallMeBot WhatsApp call — Task 3
- ✅ Warning vs Alert levels — Task 3 (sendAlert level param)
- ✅ DASHBOARD live status — Task 8
- ✅ DEPLOY.md — Task 8

**Placeholder scan:** No TBDs. All `YOUR_*_HERE` placeholders are real config values the user must fill in — these are correct.

**Type consistency:**
- `SHEET_ID` constant defined in `ingest.gs` (Task 2) — used in `rules_engine.gs` (Task 4) and `alert_sender.gs` (Task 3). All 3 files share the same Apps Script project scope. ✅
- `EVENTS_SHEET` constant defined in `ingest.gs` — used in `rules_engine.gs`. ✅
- `sendAlert(ruleId, message, level)` defined in Task 3, called in Task 4. ✅
- `getLastEventTime(eventsData, source, eventType)` defined and used in Task 4. ✅
