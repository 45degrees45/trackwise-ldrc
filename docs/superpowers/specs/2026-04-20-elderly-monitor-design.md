# Elderly Monitor — Design Spec

**Date:** 2026-04-20
**Status:** Approved
**Phase:** 1 (rule-based) — Phase 2 (pattern learning) planned later

## Problem

Monitor an elderly person's wellbeing passively using devices already in the home. Detect abnormal inactivity patterns and alert family members without being intrusive or requiring expensive hardware.

## Solution

Collect activity signals from 3 sources into a central Google Sheets hub. An Apps Script rules engine checks every 10 minutes for anomalies and fires alerts via Telegram (normal) or CallMeBot WhatsApp call (emergency).

## Architecture

```
Android Phone (Termux)  ──→  Google Sheets API
Alexa (IFTTT webhook)   ──→  Google Sheets API
CCTV (kensho-local)     ──→  Google Sheets API
                                     │
                         Apps Script Rules Engine
                         (every 10 min)
                                     │
                    ┌────────────────┼─────────────────┐
                    ↓                ↓                  ↓
             Telegram bot      Sheets DASHBOARD    CallMeBot
           (all alerts)        (family view)    (anomaly only)
```

Zero cost — Google Apps Script + Sheets (free), Termux (free/open source), CallMeBot (free), kensho-local (existing).

## Data Sources

### 1. Android Phone (Termux + Termux:API)

A shell script runs every 5 minutes via Termux cron. Collects:

| Signal | Command | Event Type |
|--------|---------|------------|
| Accelerometer | `termux-sensor -s acceleration -n 1` | `movement` / `still` |
| Recent calls | `termux-call-log -l 1` | `call_made` / `call_received` |
| Notifications | `termux-notification-list` (count delta) | `phone_active` |

Script POSTs to Google Sheets API (append row to EVENTS sheet).

Active hours for mom: **4:00 AM – 10:00 PM IST**

### 2. Alexa (IFTTT)

IFTTT applet: "If Alexa timer set → Webhook → append row to EVENTS via Google Sheets API"

Event type: `timer_set`

### 3. CCTV (kensho-local — existing)

Modify kensho-local to additionally POST a row to EVENTS sheet on motion detection.
Event type: `cctv_motion` (outside)

## Google Sheets Schema

### EVENTS Sheet (append-only log)

| Col | Header | Example |
|-----|--------|---------|
| A | Timestamp | 2026-04-20 04:15:00 |
| B | Source | `phone` / `alexa` / `cctv` |
| C | Event Type | `movement` / `still` / `call_made` / `call_received` / `phone_active` / `timer_set` / `cctv_motion` |
| D | Value | `1` (active) / `0` (inactive) |
| E | Notes | optional detail |

### RULES Sheet (editable config — no code change needed)

| Rule ID | Description | Threshold Hours | Start Hour | End Hour | Enabled |
|---------|-------------|-----------------|------------|----------|---------|
| no_movement | No phone movement | 3 | 4 | 22 | TRUE |
| no_phone_usage | No calls or notifications | 2 | 4 | 22 | TRUE |
| no_morning_activity | No any signal by 6am | — | 4 | 6 | TRUE |
| combined_silence | No phone + no CCTV + no Alexa | 2 | 4 | 22 | TRUE |

### ALERTS_LOG Sheet

| Timestamp | Rule ID | Message | Channel | Acknowledged |
|-----------|---------|---------|---------|--------------|

### DASHBOARD Sheet (formula-driven)

| Metric | Formula source |
|--------|---------------|
| Last phone movement | MAX(EVENTS where source=phone, type=movement) |
| Last Alexa activity | MAX(EVENTS where source=alexa) |
| Last CCTV motion | MAX(EVENTS where source=cctv) |
| Status | 🟢 OK / 🟡 Warning / 🔴 Alert |
| Today's events count | COUNTIFS on today |
| Recent 10 events | SORT+FILTER |

## Rules Engine (Apps Script)

Runs every 10 minutes via time trigger.

**Logic per rule:**
1. Read RULES sheet for enabled rules
2. For each rule, query EVENTS for last matching event
3. If gap > threshold AND current time is within active hours → fire alert
4. Log to ALERTS_LOG
5. Don't re-fire same rule within 1 hour (cooldown via PropertiesService)

**Alert routing:**
- WARNING level → Telegram message only
- ALERT level (combined_silence or 2+ rules firing) → Telegram + CallMeBot WhatsApp call

## Termux Script (`monitor.sh`)

```bash
#!/data/data/com.termux/files/usr/bin/bash
# Runs every 5 min via cron: */5 * * * * ~/monitor.sh

SHEET_ID="YOUR_SHEET_ID"
API_KEY="YOUR_SHEETS_API_KEY"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 1. Check accelerometer (3 readings, average magnitude)
ACCEL=$(termux-sensor -s "TYPE_ACCELEROMETER" -n 3 -d 500 2>/dev/null)
MAG=$(echo "$ACCEL" | python3 -c "
import sys, json, math
data = json.load(sys.stdin)
vals = [math.sqrt(sum(x**2 for x in r['values'])) for r in data.get('TYPE_ACCELEROMETER',[])]
avg = sum(vals)/len(vals) if vals else 9.8
print('movement' if abs(avg-9.8)>0.5 else 'still')
" 2>/dev/null || echo 'still')

# 2. Check recent calls (last 1 min)
CALL=$(termux-call-log -l 5 2>/dev/null | python3 -c "
import sys, json
from datetime import datetime, timedelta
logs = json.load(sys.stdin)
cutoff = datetime.now() - timedelta(minutes=6)
recent = [l for l in logs if datetime.fromtimestamp(l.get('date',0)/1000) > cutoff]
print('call_made' if any(l.get('type')=='OUTGOING' for l in recent) else
      'call_received' if recent else 'none')
" 2>/dev/null || echo 'none')

# 3. Post movement to Sheets
curl -s -X POST \
  "https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/EVENTS!A:E:append?valueInputOption=USER_ENTERED&key=${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"values\":[[\"${TIMESTAMP}\",\"phone\",\"${MAG}\",\"1\",\"\"]]}" > /dev/null

# 4. Post call event if any
if [ "$CALL" != "none" ]; then
  curl -s -X POST \
    "https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/EVENTS!A:E:append?valueInputOption=USER_ENTERED&key=${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"values\":[[\"${TIMESTAMP}\",\"phone\",\"${CALL}\",\"1\",\"\"]]}" > /dev/null
fi
```

## Alert Delivery

**Telegram:** Uses existing bot infrastructure (same pattern as kensho-local / pingpong).

**CallMeBot:** Free WhatsApp call service.
- Register: Send `I allow callmebot to send me messages` to +34 644 33 45 04 on WhatsApp
- API: `https://api.callmebot.com/whatsapp.php?phone=PHONE&apikey=KEY&text=MESSAGE`
- Called only when ALERT level fires, not WARNING

## Files to Create

```
elderly-monitor/
├── termux/
│   └── monitor.sh          — runs on Android via Termux cron
├── sheets/
│   ├── rules_engine.gs     — Apps Script rules engine
│   ├── alert_sender.gs     — Telegram + CallMeBot dispatch
│   └── SETUP.md            — sheet structure setup guide
├── kensho-patch/
│   └── cctv_sheet_hook.py  — patch for kensho-local to also write to EVENTS
└── DEPLOY.md               — full deployment guide
```

## Deployment Order

1. Create Google Sheet with 4 tabs (EVENTS, RULES, ALERTS_LOG, DASHBOARD)
2. Set up Google Sheets API key
3. Install Termux + Termux:API on elderly person's Android phone
4. Set up `monitor.sh` + cron on Termux
5. Set up IFTTT → Alexa → Sheets webhook
6. Patch kensho-local to write to EVENTS sheet
7. Paste rules_engine.gs + alert_sender.gs into Apps Script
8. Register CallMeBot WhatsApp API key
9. Run test — verify all 3 sources appear in EVENTS

## Success Criteria

- Phone activity (movement, calls) appears in EVENTS within 5 minutes
- Alexa timer events appear within 1 minute
- CCTV motion events appear within 1 minute
- DASHBOARD shows correct last-seen times for all 3 sources
- Warning fires on Telegram when no activity for configured threshold
- CallMeBot call fires when combined_silence rule triggers
- No duplicate alerts within 1-hour cooldown window
- Works entirely on Google free tier — zero ongoing cost
