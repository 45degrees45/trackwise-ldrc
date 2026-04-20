/**
 * Alert delivery — Telegram messages + CallMeBot WhatsApp calls.
 * Called by rules_engine.gs.
 * Relies on SHEET_ID constant declared in ingest.gs (same Apps Script project scope).
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
