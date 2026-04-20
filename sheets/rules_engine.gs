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
