"""
app.py — FastAPI microservice exposing the trained ML models.

Endpoints:
  GET  /health               — liveness check
  POST /predict/score        — returns lead score 0-100
  POST /predict/conversion   — returns conversion probability 0-1

Input format (raw interactions list — sent by Node.js):
  {
    "lead_id":      "uuid-...",
    "source":       "LinkedIn",
    "created_at":   "2025-01-15T10:00:00Z",   (optional)
    "interactions": [
      { "type": "website_visit", "channel": "web",   "duration": 300,
        "timestamp": "2025-03-01T09:00:00Z" },
      { "type": "meeting",       "channel": "physical", "duration": 3600 }
    ]
  }

Run:  python app.py
      ML_PORT=5001 python app.py  (default port is 5001)
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')

NUMERIC_FEATURES = [
    'web_visits', 'form_submits', 'email_opens', 'meetings',
    'total_interactions', 'avg_duration', 'total_duration',
    'web_channel', 'email_channel', 'phone_channel', 'physical_channel',
    'days_since_last_interaction', 'days_since_creation',
]
CATEGORICAL_FEATURES = ['source']
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

VALID_SOURCES = {'Web', 'LinkedIn', 'Referral', 'Cold Call', 'Event'}

# ---------------------------------------------------------------------------
# Load models once at startup
# ---------------------------------------------------------------------------

scoring_model    = joblib.load(os.path.join(MODELS_DIR, 'scoring_model.pkl'))
conversion_model = joblib.load(os.path.join(MODELS_DIR, 'conversion_model.pkl'))

# ---------------------------------------------------------------------------
# Pydantic schemas (input validation)
# ---------------------------------------------------------------------------

class InteractionItem(BaseModel):
    type:      Optional[str]   = ""
    channel:   Optional[str]   = ""
    duration:  Optional[float] = 0.0
    timestamp: Optional[str]   = None   # ISO-8601 datetime string


class PredictRequest(BaseModel):
    lead_id:      Optional[str] = None
    source:       Optional[str] = "Web"
    created_at:   Optional[str] = None        # ISO-8601 — used for days_since_creation
    interactions: Optional[List[InteractionItem]] = None   # raw list sent by Node.js


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CRM IA — ML Microservice",
    description="Scoring prédictif des leads et prédiction de conversion",
    version="2.0.0",
)

# ---------------------------------------------------------------------------
# Feature extraction helpers
# ---------------------------------------------------------------------------

_TYPE_MAP = {
    'website_visit': 'web_visits',
    'form_submit':   'form_submits',
    'email_opened':  'email_opens',
    'meeting':       'meetings',
}
_CHANNEL_MAP = {
    'web':      'web_channel',
    'email':    'email_channel',
    'phone':    'phone_channel',
    'physical': 'physical_channel',
}


def _parse_dt(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 string to a UTC-aware datetime, or return None."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, AttributeError):
        return None


def _days_since(dt: Optional[datetime]) -> float:
    """Return float days between dt and now (UTC). Returns 0 if dt is None."""
    if dt is None:
        return 0.0
    now = datetime.now(timezone.utc)
    delta = now - dt
    return max(0.0, delta.total_seconds() / 86400.0)


def _extract_features(data: PredictRequest) -> pd.DataFrame:
    """Aggregate raw interactions into a single-row feature DataFrame."""

    source = data.source if data.source in VALID_SOURCES else 'Web'
    counts = {k: 0.0 for k in NUMERIC_FEATURES}
    durations:  list[float]    = []
    timestamps: list[datetime] = []

    for intr in (data.interactions or []):
        feat = _TYPE_MAP.get(intr.type or '', '')
        if feat:
            counts[feat] += 1.0

        ch = _CHANNEL_MAP.get(intr.channel or '', '')
        if ch:
            counts[ch] += 1.0

        if intr.duration is not None:
            durations.append(float(intr.duration))

        dt = _parse_dt(intr.timestamp)
        if dt:
            timestamps.append(dt)

    counts['total_interactions'] = (
        counts['web_visits'] + counts['form_submits'] +
        counts['email_opens'] + counts['meetings']
    )
    counts['avg_duration']   = float(np.mean(durations)) if durations else 0.0
    counts['total_duration'] = float(np.sum(durations))  if durations else 0.0

    last_ts = max(timestamps) if timestamps else None
    counts['days_since_last_interaction'] = _days_since(last_ts)
    counts['days_since_creation']         = _days_since(_parse_dt(data.created_at))

    counts['source'] = source
    return pd.DataFrame([counts])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get('/health')
def health():
    return {'status': 'ok', 'models_loaded': True, 'framework': 'FastAPI'}


@app.post('/predict/score')
def predict_score(body: PredictRequest):
    """Return lead qualification score between 0 and 100."""
    try:
        features  = _extract_features(body)
        raw_score = float(scoring_model.predict(features[ALL_FEATURES])[0])
        score     = round(max(0.0, min(100.0, raw_score)), 2)
    except Exception as exc:
        return JSONResponse(status_code=500, content={'error': str(exc)})

    return {
        'lead_id': body.lead_id,
        'score':   score,
    }


@app.post('/predict/conversion')
def predict_conversion(body: PredictRequest):
    """Return conversion probability between 0 and 1."""
    try:
        features    = _extract_features(body)
        probability = float(
            conversion_model.predict_proba(features[ALL_FEATURES])[0][1]
        )
        probability = round(probability, 4)
    except Exception as exc:
        return JSONResponse(status_code=500, content={'error': str(exc)})

    return {
        'lead_id':                body.lead_id,
        'conversion_probability': probability,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port = int(os.environ.get('ML_PORT', 5001))
    print(f'ML microservice (FastAPI) starting on port {port}')
    print(f'OpenAPI docs: http://localhost:{port}/docs')
    uvicorn.run('app:app', host='127.0.0.1', port=port, reload=False)
