"""
SHAP Explainer — Generate & Save shap_explainer.pkl
=====================================================
Run this AFTER your main fraud detection code has already created:
  - xgboost_fraud_model.pkl
  - fraud_scaler.pkl
  - fraud_model_config.pkl

Install:
    pip install shap xgboost scikit-learn pandas numpy joblib
"""

import pandas as pd
import numpy as np
import joblib
import shap
import warnings
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")


# ============================================================
# 1. LOAD EXISTING ARTIFACTS
# ============================================================
print("📦 Loading saved artifacts...")

xgb_model = joblib.load("xgboost_fraud_model.pkl")
scaler    = joblib.load("fraud_scaler.pkl")
config    = joblib.load("fraud_model_config.pkl")

FEATURES  = config["features"]
THRESHOLD = config["threshold"]

print(f"✅ Model     : {config['model']}")
print(f"✅ Features  : {FEATURES}")
print(f"✅ Threshold : {THRESHOLD:.4f}")
print(f"✅ ROC-AUC   : {config['roc_auc']}")
print(f"✅ PR-AUC    : {config['pr_auc']}")


# ============================================================
# 2. LOAD & PREPARE DATA
#    We need the test set to validate the explainer
# ============================================================
print("\n📂 Loading dataset...")

df = pd.read_csv("/content/transactions (1).csv")
df["timestamp"] = pd.to_datetime(df["timestamp"], format='mixed')
df = df.sort_values(["user_id", "timestamp"]).reset_index(drop=True)

# ── Recreate all features (must match training exactly) ──────
g = df.groupby("user_id", sort=False)

df["hour"]        = df["timestamp"].dt.hour
df["day_of_week"] = df["timestamp"].dt.dayofweek
df["month"]       = df["timestamp"].dt.month
df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)
df["is_night"]    = ((df["hour"] >= 22) | (df["hour"] <= 5)).astype(int)

df["prev_amount"] = g["amount"].shift(1).fillna(df["amount"])
df["prev_time"]   = g["timestamp"].shift(1).fillna(df["timestamp"])

df["time_diff"] = (
    (df["timestamp"] - df["prev_time"]).dt.total_seconds() / 60
).clip(lower=0.1)

df["amount_diff"]     = df["amount"] - df["prev_amount"]
df["amount_velocity"] = df["amount"] / df["time_diff"]
df["log_amount"]      = np.log1p(df["amount"])

df["rolling_avg"] = g["amount"].transform(
    lambda x: x.shift(1).rolling(5, min_periods=1).mean()
).fillna(df["amount"])

df["rolling_std"] = g["amount"].transform(
    lambda x: x.shift(1).rolling(5, min_periods=1).std().fillna(0)
)

df["deviation"] = df["amount"] - df["rolling_avg"]
df["z_score"]   = np.where(
    df["rolling_std"] > 0,
    df["deviation"] / df["rolling_std"],
    0,
)

df["user_txn_count"] = g.cumcount()
df = df.replace([np.inf, -np.inf], 0).fillna(0)

# ── Time-based split (same split as training) ────────────────
split_ts = df["timestamp"].quantile(0.8)
test     = df[df["timestamp"] > split_ts]

X_test    = test[FEATURES].replace([np.inf, -np.inf], 0).fillna(0)
y_test    = test["is_fraud"]
X_test_sc = pd.DataFrame(scaler.transform(X_test), columns=FEATURES)

print(f"✅ Test set  : {len(X_test):,} rows | Fraud: {y_test.sum():,}")


# ============================================================
# 3. BUILD & VALIDATE SHAP EXPLAINER
# ============================================================
print("\n⏳ Building SHAP TreeExplainer...")

explainer = shap.TreeExplainer(
    xgb_model,
    feature_perturbation="tree_path_dependent",  # fastest + most accurate for XGBoost
)

print("⏳ Computing SHAP values on test set (validation check)...")
shap_values = explainer.shap_values(X_test_sc)

# Sanity checks
assert shap_values.shape == X_test_sc.shape, \
    f"Shape mismatch: shap {shap_values.shape} vs features {X_test_sc.shape}"

assert len(FEATURES) == shap_values.shape[1], \
    f"Feature count mismatch: {len(FEATURES)} vs {shap_values.shape[1]}"

print(f"✅ SHAP values shape : {shap_values.shape}")
print(f"✅ Expected value    : {explainer.expected_value:.4f}")
print(f"✅ All sanity checks passed")


# ============================================================
# 4. SAVE SHAP EXPLAINER
# ============================================================
joblib.dump(explainer, "shap_explainer.pkl")
print("\n💾 Saved → shap_explainer.pkl")

# Also save SHAP metadata for the dashboard
shap_meta = {
    "expected_value" : float(explainer.expected_value),
    "features"       : FEATURES,
    "shap_version"   : shap.__version__,
    "model_type"     : "XGBoost",
    "feature_perturbation": "tree_path_dependent",
}
joblib.dump(shap_meta, "shap_explainer_config.pkl")
print("💾 Saved → shap_explainer_config.pkl")


# ============================================================
# 5. VERIFY — RELOAD AND TEST
# ============================================================
print("\n🔍 Verifying saved explainer by reloading...")

explainer_loaded = joblib.load("shap_explainer.pkl")
shap_meta_loaded = joblib.load("shap_explainer_config.pkl")

# Score one fraud transaction end-to-end
fraud_idx   = np.where(y_test.values == 1)[0][0]
sample_row  = X_test_sc.iloc[[fraud_idx]]
sample_shap = explainer_loaded.shap_values(sample_row)

feature_impact = dict(zip(FEATURES, sample_shap[0]))
top_reasons    = sorted(feature_impact.items(), key=lambda x: abs(x[1]), reverse=True)[:3]

print(f"\n✅ Reload successful")
print(f"   Expected value : {shap_meta_loaded['expected_value']:.4f}")
print(f"   Sample fraud transaction — top 3 reasons flagged:")
for rank, (feat, val) in enumerate(top_reasons, 1):
    direction = "↑ FRAUD" if val > 0 else "↓ LEGIT"
    print(f"   {rank}. {feat:<20} SHAP = {val:+.4f}  {direction}")


# ============================================================
# 6. PRODUCTION INFERENCE FUNCTION
#    Copy this into your SOC dashboard / API
# ============================================================
def explain_transaction(raw_features: dict) -> dict:
    """
    Explain a single transaction for the SOC dashboard.

    Parameters
    ----------
    raw_features : dict
        All engineered features (same keys as FEATURES list).

    Returns
    -------
    dict with:
        - fraud_probability  : model score 0–1
        - is_fraud           : 0 or 1 based on threshold
        - risk_tier          : Allow / OTP / Lock / Block
        - top_reasons        : top 5 features driving the decision
        - all_shap_values    : full feature → shap mapping
        - expected_value     : model baseline
    """
    # Load artifacts
    _xgb       = joblib.load("xgboost_fraud_model.pkl")
    _scaler    = joblib.load("fraud_scaler.pkl")
    _config    = joblib.load("fraud_model_config.pkl")
    _explainer = joblib.load("shap_explainer.pkl")

    # Prepare input
    row    = pd.DataFrame([raw_features])[_config["features"]]
    row    = row.replace([np.inf, -np.inf], 0).fillna(0)
    row_sc = pd.DataFrame(_scaler.transform(row), columns=_config["features"])

    # Score
    prob   = float(_xgb.predict_proba(row_sc)[0][1])

    # Risk tier (matches your architecture diagram)
    if prob < 0.4:
        risk_tier = "Allow"
    elif prob < 0.7:
        risk_tier = "OTP/MFA"
    elif prob < 0.9:
        risk_tier = "Lock Account"
    else:
        risk_tier = "Block & Alert SOC"

    # SHAP explanation
    shap_vals      = _explainer.shap_values(row_sc)
    feature_impact = dict(zip(_config["features"], shap_vals[0]))
    top_reasons    = sorted(
        feature_impact.items(), key=lambda x: abs(x[1]), reverse=True
    )[:5]

    return {
        "fraud_probability" : round(prob, 6),
        "is_fraud"          : int(prob >= _config["threshold"]),
        "risk_tier"         : risk_tier,
        "threshold_used"    : _config["threshold"],
        "top_reasons"       : [
            {
                "feature"   : feat,
                "shap_value": round(val, 4),
                "direction" : "FRAUD" if val > 0 else "LEGIT",
            }
            for feat, val in top_reasons
        ],
        "all_shap_values"   : {k: round(v, 4) for k, v in feature_impact.items()},
        "expected_value"    : float(_explainer.expected_value),
    }


# ============================================================
# 7. QUICK DEMO
# ============================================================
print("\n🧪 Running explain_transaction() demo...")

sample_input = X_test.iloc[fraud_idx].to_dict()
result       = explain_transaction(sample_input)

print(f"\n{'='*50}")
print(f"  Fraud Probability : {result['fraud_probability']:.4f}")
print(f"  Is Fraud          : {result['is_fraud']}")
print(f"  Risk Tier         : {result['risk_tier']}")
print(f"  Threshold Used    : {result['threshold_used']:.4f}")
print(f"\n  Top 5 Reasons Flagged:")
for i, r in enumerate(result["top_reasons"], 1):
    print(f"  {i}. {r['feature']:<20} {r['shap_value']:+.4f}  → {r['direction']}")
print(f"{'='*50}")


# ============================================================
# 8. VALIDATION PLOTS
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(16, 5))
fig.suptitle("SHAP Explainer Validation", fontsize=14, fontweight="bold")

# Bar plot
plt.sca(axes[0])
shap.summary_plot(shap_values, X_test_sc, plot_type="bar", show=False)
axes[0].set_title("Mean |SHAP| — Feature Importance")

# Beeswarm
plt.sca(axes[1])
shap.summary_plot(shap_values, X_test_sc, show=False)
axes[1].set_title("SHAP Beeswarm")

plt.tight_layout()
plt.savefig("shap_explainer_validation.png", dpi=150, bbox_inches="tight")
plt.show()
print("\n📊 Saved → shap_explainer_validation.png")

print("\n✅ All done! Your pkl inventory:")
print("   xgboost_fraud_model.pkl")
print("   fraud_scaler.pkl")
print("   fraud_model_config.pkl")
print("   shap_explainer.pkl          ← NEW")
print("   shap_explainer_config.pkl   ← NEW")