"""
AI-Powered Banking Fraud Detection Service
==========================================
Integrates:
  - XGBoost transaction fraud classifier (15 features)
  - Isolation Forest anomaly detector (login/behavioral)
  - SHAP explainability (tree_path_dependent, XGBoost)
  - Graph risk scores (pre-computed node scores from NetworkX)

Architecture (from diagram):
  Layer 1  →  Data ingested via CSV / Spring Boot REST → this service
  Layer 2  →  Feature engineering + IF anomaly + XGBoost score + SHAP
  Layer 3  →  Graph risk lookup (pre-computed)
  Layer 4  →  Combined risk score → action (allow / OTP / lock / block)
  Layer 5  →  SOC dashboard payloads for React frontend
"""

from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import networkx as nx
import numpy as np
import xgboost as xgb
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent / "models"

# Thresholds that mirror the architecture diagram
ALLOW_THRESHOLD    = 0.40   # score < 0.4  → Allow
OTP_THRESHOLD      = 0.70   # score < 0.7  → OTP / MFA
LOCK_THRESHOLD     = 0.90   # score < 0.9  → Lock Account
# score >= 0.9 → Block & Alert SOC

# Weight split between ML score and Graph score (Layer 4)
ML_WEIGHT    = 0.65
GRAPH_WEIGHT = 0.35

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _load(name: str) -> Any:
    path = BASE_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}")
    return joblib.load(path)


# XGBoost classifier
xgb_model: xgb.XGBClassifier = _load("xgboost_fraud_model.pkl")

# StandardScaler (fitted on 15 transaction features)
scaler = _load("fraud_scaler.pkl")

# SHAP TreeExplainer
shap_explainer = _load("shap_explainer (1).pkl")

# Isolation Forest (login / behavioral anomaly)
iso_forest = _load("isolation_forest_model (1).pkl")

# Graph risk scores {user_id -> float}
graph_risk_scores: Dict[str, float] = _load("graph_risk_scores (1).pkl")

# Feature lists (from pkl configs)
model_config: Dict[str, Any]    = _load("fraud_model_config.pkl")
shap_config:  Dict[str, Any]    = _load("shap_explainer_config.pkl")
login_feature_list: List[str]   = _load("feature_list.pkl")

# 15 transaction features the XGBoost + scaler expect
TXN_FEATURES: List[str] = model_config["features"]

# 14 login/behavioral features Isolation Forest expects
LOGIN_FEATURES: List[str] = login_feature_list

# Classification threshold baked into the model config
MODEL_THRESHOLD: float = float(model_config["threshold"])

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AI Banking Fraud Detection Service",
    version="2.0.0",
    description=(
        "Multi-layer fraud detection: XGBoost + Isolation Forest + "
        "SHAP Explainability + Graph Risk Scoring"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

# camelCase → snake_case mapping for Spring Boot compatibility
# --- Layer 2: Transaction prediction request ---
# Accepts camelCase (Spring Boot) and snake_case (direct calls)
class TransactionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    # snake_case fields (direct Python/Postman to :8000)
    amount:         float         = Field(default=None)
    timestamp:      str           = Field(default=None)
    user_id:        Optional[str] = Field(default=None)
    log_amount:     Optional[float] = Field(default=None)
    hour:           Optional[int]   = Field(default=None)
    day_of_week:    Optional[int]   = Field(default=None)
    month:          Optional[int]   = Field(default=None)
    is_weekend:     Optional[int]   = Field(default=0)
    is_night:       Optional[int]   = Field(default=0)
    amount_diff:    Optional[float] = Field(default=0.0)
    time_diff:      Optional[float] = Field(default=0.0)
    amount_velocity:Optional[float] = Field(default=0.0)
    rolling_avg:    Optional[float] = Field(default=0.0)
    rolling_std:    Optional[float] = Field(default=1.0)
    deviation:      Optional[float] = Field(default=0.0)
    z_score:        Optional[float] = Field(default=0.0)
    user_txn_count: Optional[int]   = Field(default=1)

    # camelCase aliases (Spring Boot → Python)
    userId:         Optional[str]   = Field(default=None)
    logAmount:      Optional[float] = Field(default=None)
    dayOfWeek:      Optional[int]   = Field(default=None)
    isWeekend:      Optional[int]   = Field(default=None)
    isNight:        Optional[int]   = Field(default=None)
    amountDiff:     Optional[float] = Field(default=None)
    timeDiff:       Optional[float] = Field(default=None)
    amountVelocity: Optional[float] = Field(default=None)
    rollingAvg:     Optional[float] = Field(default=None)
    rollingStd:     Optional[float] = Field(default=None)
    zScore:         Optional[float] = Field(default=None)
    userTxnCount:   Optional[int]   = Field(default=None)

    @model_validator(mode="after")
    def merge_camel(self) -> "TransactionRequest":
        """Copy camelCase values into snake_case fields if snake_case is missing."""
        if not self.user_id:        self.user_id        = self.userId
        if not self.log_amount:     self.log_amount      = self.logAmount
        if self.day_of_week is None: self.day_of_week   = self.dayOfWeek
        if self.is_weekend  is None: self.is_weekend    = self.isWeekend   or 0
        if self.is_night    is None: self.is_night      = self.isNight     or 0
        if not self.amount_diff:    self.amount_diff    = self.amountDiff  or 0.0
        if not self.time_diff:      self.time_diff      = self.timeDiff    or 0.0
        if not self.amount_velocity:self.amount_velocity= self.amountVelocity or 0.0
        if not self.rolling_avg:    self.rolling_avg    = self.rollingAvg  or 0.0
        if not self.rolling_std:    self.rolling_std    = self.rollingStd  or 1.0
        if not self.z_score:        self.z_score        = self.zScore      or 0.0
        if not self.user_txn_count: self.user_txn_count = self.userTxnCount or 1
        if self.hour       is None: self.hour           = getattr(self, 'hour', None)
        if self.month      is None: self.month          = getattr(self, 'month', None)
        return self


# --- Layer 2: Login / behavioral anomaly request ---
class LoginRequest(BaseModel):
    """
    14 behavioral features used by Isolation Forest.
    Spring Boot passes these after computing geo/device signals.
    """
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    user_id:           str   = Field(validation_alias=AliasChoices("user_id", "userId"))
    timestamp:         str

    hour:              int   = Field(..., ge=0, le=23)
    day_of_week:       int   = Field(..., ge=0, le=6, validation_alias=AliasChoices("day_of_week", "dayOfWeek"))
    hour_deviation:    float = Field(..., description="Abs deviation from user's usual login hour", validation_alias=AliasChoices("hour_deviation", "hourDeviation"))
    time_diff:         float = Field(..., description="Minutes since last login", validation_alias=AliasChoices("time_diff", "timeDiff"))
    dormant_login:     int   = Field(..., ge=0, le=1, description="1 if >30d since last login", validation_alias=AliasChoices("dormant_login", "dormantLogin"))
    login_freq_7d:     int   = Field(..., description="Number of logins in last 7 days", validation_alias=AliasChoices("login_freq_7d", "loginFreq7d"))
    dist_from_home:    float = Field(..., description="km from home city centroid", validation_alias=AliasChoices("dist_from_home", "distFromHome"))
    distance:          float = Field(..., description="km from last login location")
    speed:             float = Field(..., description="km/h implied by last two logins")
    impossible_travel: int   = Field(..., ge=0, le=1, validation_alias=AliasChoices("impossible_travel", "impossibleTravel"))
    vpn:               int   = Field(..., ge=0, le=1)
    is_new_device:     int   = Field(..., ge=0, le=1, validation_alias=AliasChoices("is_new_device", "isNewDevice"))
    city_code:         int   = Field(..., description="Label-encoded city", validation_alias=AliasChoices("city_code", "cityCode"))
    device_code:       int   = Field(..., description="Label-encoded device_id", validation_alias=AliasChoices("device_code", "deviceCode"))


# --- Combined / full event (Layer 4 unified endpoint) ---
class FraudEventRequest(BaseModel):
    transaction: Optional[TransactionRequest] = None
    login:        Optional[LoginRequest]      = None

    model_config = ConfigDict(extra="allow", populate_by_name=True)


# --- Response schemas ---
class SHAPExplanation(BaseModel):
    feature:    str
    shap_value: float
    direction:  str   # "increases risk" | "reduces risk"
    rank:       int   # 1 = most impactful


class SecurityAction(BaseModel):
    code:        str   # ALLOW | OTP_MFA | LOCK_ACCOUNT | BLOCK_ALERT_SOC
    description: str
    severity:    str   # low | medium | high | critical


class TransactionResult(BaseModel):
    ml_fraud_score:  float
    is_fraud:        bool
    anomaly_score:   Optional[float] = None  # from Isolation Forest if login provided
    shap_explanation: List[SHAPExplanation]


class GraphResult(BaseModel):
    graph_risk_score: float
    user_in_graph:    bool


class FraudEventResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_id:           str
    user_id:            str
    timestamp:          str
    combined_risk_score: float
    security_action:    SecurityAction
    transaction_result: Optional[TransactionResult] = None
    graph_result:       GraphResult
    alert_soc:          bool
    log_to_db:          bool   # always True – Spring Boot should persist this


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_hour(ts: str) -> int:
    try:
        return datetime.fromisoformat(ts).hour
    except Exception:
        return 0


def _derive_datetime_parts(ts: str) -> tuple[int, int, int]:
    try:
        dt = datetime.fromisoformat(ts)
        return dt.hour, dt.weekday(), dt.month
    except Exception:
        return 0, 0, 1


def _training_mean(feature: str) -> float:
    idx = TXN_FEATURES.index(feature)
    return float(scaler.mean_[idx])


def _coerce_transaction_features(req: TransactionRequest) -> TransactionRequest:
    """
    Keep transaction features in the same ballpark as the training data.
    The frontend demo was sending extreme synthetic values (for example z_score > 100),
    which makes the classifier saturate at ~1.0 almost every time.
    """
    hour, day_of_week, month = _derive_datetime_parts(req.timestamp or "")

    req.hour = req.hour if req.hour is not None else hour
    req.day_of_week = req.day_of_week if req.day_of_week is not None else day_of_week
    req.month = req.month if req.month is not None else month
    req.is_weekend = req.is_weekend if req.is_weekend is not None else int(req.day_of_week in (5, 6))
    req.is_night = req.is_night if req.is_night is not None else int(req.hour < 6 or req.hour >= 22)
    req.log_amount = req.log_amount if req.log_amount is not None else math.log(max(req.amount, 0.0) + 1.0)

    if req.rolling_avg is None or req.rolling_avg <= 0:
        req.rolling_avg = req.amount

    if req.rolling_std is None or req.rolling_std <= 0:
        req.rolling_std = max(abs(req.amount) * 0.15, 10.0)

    baseline_delta = req.amount - req.rolling_avg
    if req.amount_diff is None:
        req.amount_diff = baseline_delta
    if req.deviation is None:
        req.deviation = baseline_delta

    if req.time_diff is None or req.time_diff <= 0:
        req.time_diff = _training_mean("time_diff")

    if req.amount_velocity is None or req.amount_velocity <= 0:
        req.amount_velocity = round(req.amount / max(req.time_diff, 1.0), 6)

    if req.user_txn_count is None or req.user_txn_count <= 0:
        req.user_txn_count = max(1, int(round(_training_mean("user_txn_count"))))

    derived_z = req.deviation / max(req.rolling_std, 1e-6)
    if req.z_score is None or abs(req.z_score) > 10:
        req.z_score = derived_z

    if abs(req.amount_velocity) > 5000:
        req.amount_velocity = round(req.amount / max(req.time_diff, 1.0), 6)

    return req


def _get_graph_risk(user_id: str) -> float:
    """
    Look up pre-computed graph risk score.
    The graph was built with nodes = customers/employees/devices
    and edges = shared devices / linked accounts / employee access.
    Returns 0.5 (neutral) when user is not in graph.
    """
    key = f"user_{user_id}"
    return graph_risk_scores.get(key, graph_risk_scores.get(user_id, 0.5))


def _isolation_forest_score(features: np.ndarray) -> float:
    """
    Returns a 0-1 anomaly score.
    Isolation Forest decision_function returns negative = more anomalous.
    We flip and normalise to [0, 1].
    """
    raw = iso_forest.decision_function(features)[0]
    # Raw is roughly in [-0.5, 0.5]; clip & normalise to [0, 1]
    normalised = float(np.clip(0.5 - raw, 0.0, 1.0))
    return normalised


def _shap_explain(scaled_features: np.ndarray) -> List[SHAPExplanation]:
    """
    Run TreeExplainer and return ranked SHAP explanations.
    Handles both single-output and multi-output (list) SHAP values.
    """
    shap_vals = shap_explainer.shap_values(scaled_features)

    # XGBoost binary: shap_values is a 2-D array directly
    if isinstance(shap_vals, list):
        # Older SHAP: [class_0_array, class_1_array]
        vals = shap_vals[1][0]
    else:
        if len(shap_vals.shape) == 3:
            vals = shap_vals[0, :, 1]
        else:
            vals = shap_vals[0]

    ranked = sorted(
        enumerate(vals),
        key=lambda x: abs(x[1]),
        reverse=True,
    )

    explanations: List[SHAPExplanation] = []
    for rank, (idx, sv) in enumerate(ranked, start=1):
        feature_name = TXN_FEATURES[idx] if idx < len(TXN_FEATURES) else f"feature_{idx}"
        explanations.append(
            SHAPExplanation(
                feature=feature_name,
                shap_value=round(float(sv), 6),
                direction="increases risk" if sv > 0 else "reduces risk",
                rank=rank,
            )
        )
    return explanations


def _security_action(score: float) -> SecurityAction:
    if score < ALLOW_THRESHOLD:
        return SecurityAction(
            code="ALLOW",
            description="Transaction / login is within normal parameters. No friction applied.",
            severity="low",
        )
    elif score < OTP_THRESHOLD:
        return SecurityAction(
            code="OTP_MFA",
            description="Elevated risk detected. Step-up authentication (OTP / MFA) required.",
            severity="medium",
        )
    elif score < LOCK_THRESHOLD:
        return SecurityAction(
            code="LOCK_ACCOUNT",
            description="High risk detected. Account temporarily locked. Customer notified.",
            severity="high",
        )
    else:
        return SecurityAction(
            code="BLOCK_ALERT_SOC",
            description="Critical fraud risk. Transaction blocked. SOC alert raised immediately.",
            severity="critical",
        )


def _combined_risk(ml_score: float, graph_score: float) -> float:
    return round(ML_WEIGHT * ml_score + GRAPH_WEIGHT * graph_score, 6)


def _event_id(user_id: str, ts: str) -> str:
    import hashlib
    raw = f"{user_id}:{ts}:{np.random.randint(1e9)}"
    return "EVT-" + hashlib.md5(raw.encode()).hexdigest()[:12].upper()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "models": {
            "xgboost": "loaded",
            "isolation_forest": "loaded",
            "shap_explainer": "loaded",
            "graph_risk_scores": f"loaded ({len(graph_risk_scores)} nodes)",
        },
        "model_metrics": {
            "roc_auc": float(model_config["roc_auc"]),
            "pr_auc":  float(model_config["pr_auc"]),
            "threshold": float(model_config["threshold"]),
        },
    }


# ---------------------------------------------------------------------------
# Layer 2: Transaction fraud prediction (XGBoost + SHAP)
# ---------------------------------------------------------------------------

@app.post("/predict/transaction", response_model=TransactionResult)
def predict_transaction(req: TransactionRequest) -> TransactionResult:
    """
    Predict fraud probability for a single transaction.
    Returns XGBoost fraud score + SHAP explanation.
    Spring Boot calls this for every incoming payment event.
    """
    try:
        req = _coerce_transaction_features(req)
        values = [getattr(req, f) for f in TXN_FEATURES]
        X = np.array([values], dtype=float)
        X_scaled = scaler.transform(X)

        prob    = float(xgb_model.predict_proba(X_scaled)[0][1])
        is_fraud = prob >= MODEL_THRESHOLD

        explanation = _shap_explain(X_scaled)

        return TransactionResult(
            ml_fraud_score=round(prob, 6),
            is_fraud=is_fraud,
            shap_explanation=explanation,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transaction prediction failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Layer 2: Login anomaly detection (Isolation Forest)
# ---------------------------------------------------------------------------

@app.post("/predict/login")
def predict_login(req: LoginRequest) -> dict:
    """
    Detect anomalous login events using Isolation Forest.
    Returns anomaly_score (0–1) and is_anomaly flag.
    Spring Boot calls this on each login event.
    """
    try:
        values = [getattr(req, f) for f in LOGIN_FEATURES]
        X = np.array([values], dtype=float)

        anomaly_score = _isolation_forest_score(X)
        is_anomaly    = anomaly_score > 0.6  # IF anomaly threshold

        return {
            "user_id":       req.user_id,
            "timestamp":     req.timestamp,
            "anomaly_score": round(anomaly_score, 6),
            "is_anomaly":    is_anomaly,
            "action":        _security_action(anomaly_score).dict(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Login anomaly detection failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Layer 3 + 4: Unified fraud event (all models combined)
# Recommended endpoint for React dashboard + Spring Boot integration
# ---------------------------------------------------------------------------

@app.post("/predict/event", response_model=FraudEventResponse)
def predict_event(req: FraudEventRequest) -> FraudEventResponse:
    """
    Full fraud evaluation pipeline (Layers 2–4):
      1. XGBoost transaction score (if transaction payload provided)
      2. Isolation Forest login anomaly (if login payload provided)
      3. Graph risk score lookup
      4. Combined risk score = 0.65 * ml_score + 0.35 * graph_score
      5. Security action determination
      6. SOC alert flag

    This is the primary endpoint for the React SOC Dashboard.
    Spring Boot passes the assembled event after collecting signals
    from Layer 1 (CSVs / DB).
    """
    if req.transaction is None and req.login is None:
        raise HTTPException(status_code=422, detail="Provide at least one of: transaction, login")

    try:
        user_id   = (req.transaction or req.login).user_id
        timestamp = (req.transaction or req.login).timestamp

        # ── Layer 2a: XGBoost transaction prediction ──
        txn_result: Optional[TransactionResult] = None
        ml_score = 0.5  # neutral default when no transaction provided

        if req.transaction:
            req.transaction = _coerce_transaction_features(req.transaction)
            values  = [getattr(req.transaction, f) for f in TXN_FEATURES]
            X       = np.array([values], dtype=float)
            X_scaled = scaler.transform(X)

            prob     = float(xgb_model.predict_proba(X_scaled)[0][1])
            is_fraud = prob >= MODEL_THRESHOLD
            ml_score = prob

            explanation = _shap_explain(X_scaled)

            # IF expects 14 login features, NOT 15 transaction features.
            # Only run Isolation Forest when a login payload is also provided.
            anomaly_score: Optional[float] = None
            if req.login:
                login_vals = [getattr(req.login, f) for f in LOGIN_FEATURES]
                login_X    = np.array([login_vals], dtype=float)
                anomaly_score = round(_isolation_forest_score(login_X), 6)

            txn_result = TransactionResult(
                ml_fraud_score=round(prob, 6),
                is_fraud=is_fraud,
                anomaly_score=anomaly_score,
                shap_explanation=explanation,
            )

        elif req.login:
            # ── Login-only path: use IF for risk signal ──
            values = [getattr(req.login, f) for f in LOGIN_FEATURES]
            X      = np.array([values], dtype=float)
            ml_score = _isolation_forest_score(X)

        # ── Layer 3: Graph risk score ──
        graph_score = _get_graph_risk(user_id)
        user_in_graph = (f"user_{user_id}" in graph_risk_scores or user_id in graph_risk_scores)

        graph_result = GraphResult(
            graph_risk_score=round(graph_score, 6),
            user_in_graph=user_in_graph,
        )

        # ── Layer 4: Combined risk score + action ──
        combined = _combined_risk(ml_score, graph_score)
        action   = _security_action(combined)
        alert_soc = action.code == "BLOCK_ALERT_SOC"

        return FraudEventResponse(
            event_id=_event_id(user_id, timestamp),
            user_id=user_id,
            timestamp=timestamp,
            combined_risk_score=combined,
            security_action=action,
            transaction_result=txn_result,
            graph_result=graph_result,
            alert_soc=alert_soc,
            log_to_db=True,
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Event evaluation failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Layer 5 (SOC Dashboard helpers): batch + graph endpoints
# ---------------------------------------------------------------------------

@app.get("/graph/risk/{user_id}")
def get_graph_risk(user_id: str) -> dict:
    """
    Return pre-computed graph risk score for a user.
    React Fraud Network Graph panel calls this to colour nodes.
    """
    score = _get_graph_risk(user_id)
    return {
        "user_id":    user_id,
        "graph_risk": round(score, 6),
        "risk_band":  (
            "low"      if score < 0.4 else
            "medium"   if score < 0.7 else
            "high"     if score < 0.9 else
            "critical"
        ),
    }


@app.get("/graph/risk/all")
def get_all_graph_risks() -> dict:
    """
    Return all graph risk scores.
    Used by React Fraud Network Graph to render full risk heatmap.
    """
    return {
        "count": len(graph_risk_scores),
        "scores": {k: round(v, 6) for k, v in graph_risk_scores.items()},
    }


@app.post("/batch/transactions")
def batch_predict(transactions: List[TransactionRequest]) -> List[dict]:
    """
    Batch prediction for multiple transactions.
    Spring Boot calls this for bulk processing / nightly sweeps.
    """
    if len(transactions) > 500:
        raise HTTPException(status_code=400, detail="Batch size cannot exceed 500")

    results = []
    for txn in transactions:
        try:
            txn = _coerce_transaction_features(txn)
            values   = [getattr(txn, f) for f in TXN_FEATURES]
            X        = np.array([values], dtype=float)
            X_scaled = scaler.transform(X)

            prob     = float(xgb_model.predict_proba(X_scaled)[0][1])
            is_fraud = prob >= MODEL_THRESHOLD
            graph_sc = _get_graph_risk(txn.user_id)
            combined = _combined_risk(prob, graph_sc)

            results.append({
                "user_id":            txn.user_id,
                "amount":             txn.amount,
                "timestamp":          txn.timestamp,
                "ml_fraud_score":     round(prob, 6),
                "graph_risk_score":   round(graph_sc, 6),
                "combined_risk_score": combined,
                "is_fraud":           is_fraud,
                "action":             _security_action(combined).code,
            })
        except Exception as exc:
            results.append({
                "user_id":  txn.user_id,
                "timestamp": txn.timestamp,
                "error":    str(exc),
            })

    return results


@app.get("/model/info")
def model_info() -> dict:
    """Return model metadata for the React AI Explanation panel."""
    return {
        "xgboost": {
            "model_type":  model_config["model"],
            "features":    TXN_FEATURES,
            "threshold":   float(model_config["threshold"]),
            "roc_auc":     float(model_config["roc_auc"]),
            "pr_auc":      float(model_config["pr_auc"]),
            "split_date":  model_config["split_date"],
        },
        "shap": {
            "version":              shap_config["shap_version"],
            "model_type":           shap_config["model_type"],
            "feature_perturbation": shap_config["feature_perturbation"],
            "expected_value":       shap_config["expected_value"],
        },
        "isolation_forest": {
            "n_estimators":         iso_forest.n_estimators,
            "features":             LOGIN_FEATURES,
        },
        "risk_scoring": {
            "ml_weight":    ML_WEIGHT,
            "graph_weight": GRAPH_WEIGHT,
            "thresholds": {
                "allow":       ALLOW_THRESHOLD,
                "otp_mfa":     OTP_THRESHOLD,
                "lock_account": LOCK_THRESHOLD,
                "block_soc":   1.0,
            },
        },
    }


# ---------------------------------------------------------------------------
# Dev entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fraud_ml_service:app", host="0.0.0.0", port=8000, reload=True)
