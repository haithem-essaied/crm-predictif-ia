"""
train_model.py — Train scoring and conversion models from leads + interactions data.

Models trained:
  - RandomForestRegressor  → score 0-100   → models/scoring_model.pkl
  - LogisticRegression     → conversion p  → models/conversion_model.pkl

Run: python train_model.py
"""

import os
import pandas as pd
import numpy as np
from io import StringIO
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error,
    classification_report, roc_auc_score
)
import joblib

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, '..')
MODELS_DIR  = os.path.join(BASE_DIR, 'models')

NUMERIC_FEATURES = [
    'web_visits', 'form_submits', 'email_opens', 'meetings',
    'total_interactions', 'avg_duration', 'total_duration',
    'web_channel', 'email_channel', 'phone_channel', 'physical_channel',
    'days_since_last_interaction', 'days_since_creation',
]
CATEGORICAL_FEATURES = ['source']
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _read_table(path):
    """Read a data file whether it's a plain CSV or an .xlsx disguised as .csv."""
    with open(path, 'rb') as fh:
        is_xlsx = fh.read(2) == b'PK'          # signature ZIP/xlsx
    if is_xlsx:
        raw = pd.read_excel(path, engine='openpyxl', header=None)
        csv_text = '\n'.join(str(r) for r in raw[0].tolist())
        return pd.read_csv(StringIO(csv_text))
    return pd.read_csv(path)                     # plain CSV


def load_data():
    leads        = _read_table(os.path.join(DATA_DIR, 'leads_train.csv'))
    interactions = _read_table(os.path.join(DATA_DIR, 'interactions_train.csv'))
    return leads, interactions


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def build_features(leads: pd.DataFrame, interactions: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate per-lead interaction statistics and merge with lead metadata.
    Returns one row per lead with ALL_FEATURES plus 'email' and 'status'.
    """

    # --- interaction type counts ---
    type_counts = (
        interactions
        .groupby(['lead_email', 'type'])
        .size()
        .unstack(fill_value=0)
    )
    for col in ['website_visit', 'form_submit', 'email_opened', 'meeting']:
        if col not in type_counts.columns:
            type_counts[col] = 0
    type_counts = type_counts.rename(columns={
        'website_visit': 'web_visits',
        'form_submit':   'form_submits',
        'email_opened':  'email_opens',
        'meeting':       'meetings',
    })
    type_counts['total_interactions'] = type_counts[
        ['web_visits', 'form_submits', 'email_opens', 'meetings']
    ].sum(axis=1)

    # --- duration aggregates ---
    duration_stats = (
        interactions
        .groupby('lead_email')['duration']
        .agg(avg_duration='mean', total_duration='sum')
        .fillna(0)
    )

    # --- channel counts ---
    channel_counts = (
        interactions
        .groupby(['lead_email', 'channel'])
        .size()
        .unstack(fill_value=0)
    )
    for ch in ['web', 'email', 'phone', 'physical']:
        if ch not in channel_counts.columns:
            channel_counts[ch] = 0
    channel_counts = channel_counts.rename(columns={
        'web':      'web_channel',
        'email':    'email_channel',
        'phone':    'phone_channel',
        'physical': 'physical_channel',
    })

    # --- temporal features ---
    ref_date = pd.Timestamp.now()

    # days_since_last_interaction
    if 'timestamp' in interactions.columns:
        interactions['timestamp'] = pd.to_datetime(
            interactions['timestamp'], errors='coerce', utc=True
        )
        last_ts = (
            interactions.groupby('lead_email')['timestamp']
            .max()
            .reset_index()
            .rename(columns={'lead_email': 'email', 'timestamp': 'last_ts'})
        )
    else:
        # no timestamp column — default to 0
        last_ts = pd.DataFrame({'email': [], 'last_ts': []})

    # days_since_creation
    if 'created_at' in leads.columns:
        leads['created_at'] = pd.to_datetime(
            leads['created_at'], errors='coerce', utc=True
        )
        creation_df = leads[['email', 'created_at']].copy()
    else:
        creation_df = pd.DataFrame({'email': [], 'created_at': []})

    # --- merge ---
    df = leads[['email', 'source', 'status']].copy()

    for frame in [type_counts, duration_stats, channel_counts]:
        df = df.merge(
            frame.reset_index().rename(columns={'lead_email': 'email'}),
            on='email', how='left'
        )

    df = df.merge(last_ts,     on='email', how='left')
    df = df.merge(creation_df, on='email', how='left')

    ref_utc = pd.Timestamp.now(tz='UTC')

    def _days_col(series, default):
        """Convert a series of datetimes to days-since-now. Returns float series."""
        s = pd.to_datetime(series, errors='coerce', utc=True)
        if s.isna().all():
            return pd.Series([default] * len(s), dtype=float)
        return ((ref_utc - s).dt.total_seconds() / 86400).fillna(default).clip(0)

    if 'last_ts' in df.columns:
        df['days_since_last_interaction'] = _days_col(df['last_ts'], 999)
        df.drop(columns=['last_ts'], inplace=True)
    else:
        df['days_since_last_interaction'] = 0.0

    if 'created_at' in df.columns:
        df['days_since_creation'] = _days_col(df['created_at'], 0)
        df.drop(columns=['created_at'], inplace=True)
    else:
        df['days_since_creation'] = 0.0

    df[NUMERIC_FEATURES] = df[NUMERIC_FEATURES].fillna(0)

    return df


# ---------------------------------------------------------------------------
# Target variable construction
# ---------------------------------------------------------------------------

def create_score_target(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build a realistic continuous score target (0–100).

    Formula:
      base   = status-driven baseline (converted→75, active→50, new→30, lost→15)
      bonus  = interaction quality bonus, capped at 25 pts
      noise  = N(0, 3) to prevent perfectly deterministic labels
    """
    status_base = {'converted': 75, 'active': 50, 'new': 30, 'lost': 15}
    df = df.copy()
    df['score_base'] = df['status'].map(status_base)

    df['interaction_bonus'] = (
        df['meetings']      * 4.0 +
        df['form_submits']  * 3.0 +
        df['email_opens']   * 1.5 +
        df['web_visits']    * 1.0 +
        df['avg_duration'].clip(0, 600) / 60.0
    ).clip(0, 25)

    np.random.seed(42)
    noise = np.random.normal(0, 3, len(df))
    df['score'] = (df['score_base'] + df['interaction_bonus'] + noise).clip(0, 100)

    return df


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------

def _make_preprocessor():
    return ColumnTransformer([
        ('num', StandardScaler(),                              NUMERIC_FEATURES),
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), CATEGORICAL_FEATURES),
    ])


def train_scoring_model(df: pd.DataFrame) -> Pipeline:
    """Random Forest regression — predicts lead score 0–100."""
    X = df[ALL_FEATURES]
    y = df['score']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    pipeline = Pipeline([
        ('preprocessor', _make_preprocessor()),
        ('model', RandomForestRegressor(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=2,
            random_state=42,
        )),
    ])

    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    mae  = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    print(f'  [Scoring]    MAE={mae:.2f}  RMSE={rmse:.2f}')

    return pipeline


def train_conversion_model(df: pd.DataFrame) -> Pipeline:
    """Logistic Regression — predicts probability of conversion (0–1)."""
    X = df[ALL_FEATURES]
    y = (df['status'] == 'converted').astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = Pipeline([
        ('preprocessor', _make_preprocessor()),
        ('model', LogisticRegression(
            C=0.5,
            max_iter=1000,
            random_state=42,
            class_weight='balanced',
        )),
    ])

    pipeline.fit(X_train, y_train)

    y_pred  = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    print('  [Conversion] Classification report:')
    print(classification_report(y_test, y_pred,
                                target_names=['not_converted', 'converted'],
                                zero_division=0))
    print(f'  [Conversion] AUC-ROC={roc_auc_score(y_test, y_proba):.3f}')

    return pipeline


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    os.makedirs(MODELS_DIR, exist_ok=True)

    print('Loading data ...')
    leads, interactions = load_data()
    print(f'  {len(leads)} leads, {len(interactions)} interactions')

    print('Engineering features ...')
    df = build_features(leads, interactions)
    df = create_score_target(df)

    print('Training scoring model (Random Forest) ...')
    scoring_pipeline = train_scoring_model(df)
    scoring_path = os.path.join(MODELS_DIR, 'scoring_model.pkl')
    joblib.dump(scoring_pipeline, scoring_path)
    print(f'  Saved -> {scoring_path}')

    print('Training conversion model (Logistic Regression) ...')
    conversion_pipeline = train_conversion_model(df)
    conversion_path = os.path.join(MODELS_DIR, 'conversion_model.pkl')
    joblib.dump(conversion_pipeline, conversion_path)
    print(f'  Saved -> {conversion_path}')

    print('\nAll models saved successfully.')


if __name__ == '__main__':
    main()
