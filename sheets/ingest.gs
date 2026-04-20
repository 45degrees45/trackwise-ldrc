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
