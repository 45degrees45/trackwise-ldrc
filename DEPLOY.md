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
Set up formulas in DASHBOARD tab:

| Cell | Formula |
|------|---------|
| A1 | `Status` |
| B1 | `=IF(COUNTIFS(ALERTS_LOG!B:B,"combined_silence",ALERTS_LOG!A:A,">="&TEXT(NOW()-1/24,"yyyy-mm-dd hh:mm:ss"))>0,"🔴 ALERT",IF(COUNTIFS(ALERTS_LOG!A:A,">="&TEXT(NOW()-3/24,"yyyy-mm-dd hh:mm:ss"))>0,"🟡 Warning","🟢 OK"))` |
| A2 | `Last Phone Movement` |
| B2 | `=IFERROR(TEXT(MAX(IF((EVENTS!B:B="phone")*(EVENTS!C:C="movement"),EVENTS!A:A)),"yyyy-mm-dd hh:mm:ss"),"never")` ← Ctrl+Shift+Enter |
| A3 | `Last Alexa Activity` |
| B3 | `=IFERROR(TEXT(MAX(IF(EVENTS!B:B="alexa",EVENTS!A:A)),"yyyy-mm-dd hh:mm:ss"),"never")` ← Ctrl+Shift+Enter |
| A4 | `Last CCTV Motion` |
| B4 | `=IFERROR(TEXT(MAX(IF(EVENTS!B:B="cctv",EVENTS!A:A)),"yyyy-mm-dd hh:mm:ss"),"never")` ← Ctrl+Shift+Enter |
| A5 | `Today's Events` |
| B5 | `=COUNTIFS(EVENTS!A:A,">="&TEXT(TODAY(),"yyyy-mm-dd"))` |
| A7 | `Recent Events` |
| A8 | `=IFERROR(SORT(FILTER(EVENTS!A:E,EVENTS!A:A<>""),1,FALSE),"No events yet")` |

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
