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
