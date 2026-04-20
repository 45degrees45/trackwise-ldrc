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
