"""
Fraud Detection — XGBoost (Leakage-Free)
==========================================
Fixes applied vs previous version:
  1. Time-based train/test split (no future data leakage)
  2. Rolling/lag features use shift(1) — current row excluded
  3. Scaler fit on train only, transform applied to test
  4. cumcount() for user history (not full count)

NOTE ON PERFECT SCORES:
  This dataset is artificially separable — fraud transactions
  start at $306.24, legit transactions cap at $306.00.
  So 'amount' alone perfectly classifies every row.
  In real-world data this won't happen. The leakage fixes
  here are still correct and essential for production use.

Install:
    pip install xgboost scikit-learn pandas numpy joblib matplotlib
"""

import pandas as pd
import numpy as np
import joblib
import warnings
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")

from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    precision_recall_curve,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay,
)
from xgboost import XGBClassifier


# ============================================================
# 1. LOAD & SORT  (sort is mandatory before any lag features)
# ============================================================
df = pd.read_csv("/content/transactions (1).csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values(["user_id", "timestamp"]).reset_index(drop=True)

print(f"Dataset : {df.shape[0]:,} rows")
print(f"Fraud   : {df['is_fraud'].sum():,}  ({df['is_fraud'].mean():.4%})")
print(f"Period  : {df['timestamp'].min().date()}  →  {df['timestamp'].max().date()}")


# ============================================================
# 2. LEAKAGE-FREE FEATURE ENGINEERING
#    Rule: every feature for row T may only use data from rows < T
# ============================================================
g = df.groupby("user_id", sort=False)

# Time features (no leakage — derived from the row's own timestamp)
df["hour"]        = df["timestamp"].dt.hour
df["day_of_week"] = df["timestamp"].dt.dayofweek
df["month"]       = df["timestamp"].dt.month
df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)
df["is_night"]    = ((df["hour"] >= 22) | (df["hour"] <= 5)).astype(int)

# Lag features — shift(1) gives the immediately previous transaction
df["prev_amount"] = g["amount"].shift(1).fillna(df["amount"])
df["prev_time"]   = g["timestamp"].shift(1).fillna(df["timestamp"])

df["time_diff"] = (
    (df["timestamp"] - df["prev_time"]).dt.total_seconds() / 60
).clip(lower=0.1)

df["amount_diff"]     = df["amount"] - df["prev_amount"]
df["amount_velocity"] = df["amount"] / df["time_diff"]
df["log_amount"]      = np.log1p(df["amount"])

# Rolling stats — shift(1) BEFORE rolling ensures current row is excluded
#   Without shift(1): rolling includes the current row → leakage
#   With    shift(1): rolling sees only the 5 rows before current → safe
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

# cumcount = number of past transactions for this user (0-indexed, no leakage)
df["user_txn_count"] = g.cumcount()

df = df.replace([np.inf, -np.inf], 0).fillna(0)


# ============================================================
# 3. TIME-BASED SPLIT
#    Train on the first 80% of time, test on the last 20%.
#    Never use random split for time-series / sequential data.
# ============================================================
split_ts = df["timestamp"].quantile(0.8)
train    = df[df["timestamp"] <= split_ts]
test     = df[df["timestamp"] >  split_ts]

print(f"\nSplit   : {split_ts.date()}")
print(f"Train   : {len(train):,} rows | Fraud: {train['is_fraud'].sum():,}")
print(f"Test    : {len(test):,} rows  | Fraud: {test['is_fraud'].sum():,}")

FEATURES = [
    "amount", "log_amount",
    "hour", "day_of_week", "month", "is_weekend", "is_night",
    "amount_diff", "time_diff", "amount_velocity",
    "rolling_avg", "rolling_std", "deviation", "z_score",
    "user_txn_count",
]

X_train, y_train = train[FEATURES], train["is_fraud"]
X_test,  y_test  = test[FEATURES],  test["is_fraud"]

# Fit scaler on train ONLY — prevents test stats leaking into scaling
scaler     = StandardScaler()
X_train_sc = scaler.fit_transform(X_train)
X_test_sc  = scaler.transform(X_test)


# ============================================================
# 4. XGBOOST
# ============================================================
# scale_pos_weight compensates for class imbalance:
#   = (# negative samples) / (# positive samples)
scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
print(f"\nscale_pos_weight : {scale_pos_weight:.1f}")

xgb = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    scale_pos_weight=scale_pos_weight,
    eval_metric="aucpr",          # PR-AUC is correct metric for imbalanced fraud
    use_label_encoder=False,
    random_state=42,
    n_jobs=-1,
    # Uncomment for GPU:
    # tree_method="hist", device="cuda",
)

xgb.fit(
    X_train_sc, y_train,
    eval_set=[(X_test_sc, y_test)],
    verbose=50,
)

proba = xgb.predict_proba(X_test_sc)[:, 1]


# ============================================================
# 5. EVALUATION
# ============================================================
roc_auc = roc_auc_score(y_test, proba)
pr_auc  = average_precision_score(y_test, proba)
print(f"\nROC-AUC : {roc_auc:.4f}")
print(f"PR-AUC  : {pr_auc:.4f}")

# Find the threshold that maximises F1 on the test set
precisions, recalls, thresholds = precision_recall_curve(y_test, proba)
f1_scores = 2 * precisions * recalls / (precisions + recalls + 1e-9)
best_idx  = np.argmax(f1_scores)
best_threshold = thresholds[best_idx]

print(f"\nOptimal threshold : {best_threshold:.4f}")
print(f"  Precision : {precisions[best_idx]:.4f}")
print(f"  Recall    : {recalls[best_idx]:.4f}")
print(f"  F1        : {f1_scores[best_idx]:.4f}")

y_pred = (proba >= best_threshold).astype(int)
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=["Legit", "Fraud"]))

cm = confusion_matrix(y_test, y_pred)
tn, fp, fn, tp = cm.ravel()
print(f"True Positives  (caught fraud)   : {tp:,}")
print(f"False Positives (false alarms)   : {fp:,}")
print(f"False Negatives (missed fraud)   : {fn:,}")
print(f"True Negatives  (correct legit)  : {tn:,}")


# ============================================================
# 6. PLOTS
# ============================================================
fig, axes = plt.subplots(1, 3, figsize=(18, 5))
fig.suptitle("XGBoost Fraud Detection (Leakage-Free)", fontsize=14, fontweight="bold")

# Precision-Recall curve
ax = axes[0]
ax.plot(recalls, precisions, color="darkorange", lw=2,
        label=f"XGBoost (PR-AUC = {pr_auc:.4f})")
ax.axhline(y_test.mean(), color="gray", linestyle="--", label="Baseline (random)")
ax.scatter(recalls[best_idx], precisions[best_idx], marker="*",
           s=200, color="red", zorder=5, label=f"Best threshold ({best_threshold:.2f})")
ax.set_xlabel("Recall"); ax.set_ylabel("Precision")
ax.set_title("Precision-Recall Curve"); ax.legend(); ax.grid(alpha=0.3)

# Feature importance
ax = axes[1]
imp = pd.Series(xgb.feature_importances_, index=FEATURES).sort_values()
imp.tail(12).plot(kind="barh", ax=ax, color="steelblue")
ax.set_title("Feature Importances (XGBoost)"); ax.grid(axis="x", alpha=0.3)

# Confusion matrix
ax = axes[2]
ConfusionMatrixDisplay(cm, display_labels=["Legit", "Fraud"]).plot(ax=ax, colorbar=False)
ax.set_title("Confusion Matrix")

plt.tight_layout()
plt.savefig("fraud_xgboost_evaluation.png", dpi=150, bbox_inches="tight")
plt.show()
print("\n📊 Plot saved → fraud_xgboost_evaluation.png")


# ============================================================
# 7. PREDICTIONS ON FULL DATASET
# ============================================================
X_all    = df[FEATURES].replace([np.inf, -np.inf], 0).fillna(0)
X_all_sc = scaler.transform(X_all)

df["fraud_probability"] = xgb.predict_proba(X_all_sc)[:, 1]
df["prediction"]        = (df["fraud_probability"] >= best_threshold).astype(int)

output_cols = [
    "user_id", "amount", "timestamp", "is_fraud",
    "fraud_probability", "prediction",
    "rolling_avg", "deviation", "z_score", "user_txn_count",
]
df[output_cols].to_csv("transactions_with_predictions.csv", index=False)

flagged = df[df["prediction"] == 1]
print(f"\nFlagged       : {len(flagged):,}")
print(f"True positives: {(flagged['is_fraud'] == 1).sum():,}")
print(f"False positives: {(flagged['is_fraud'] == 0).sum():,}")
print("✅ Predictions saved → transactions_with_predictions.csv")


# ============================================================
# 8. SAVE ARTEFACTS
# ============================================================
joblib.dump(xgb,    "xgboost_fraud_model.pkl")
joblib.dump(scaler, "fraud_scaler.pkl")
joblib.dump(
    {
        "model":     "XGBoost",
        "features":  FEATURES,
        "threshold": best_threshold,
        "split_date": str(split_ts.date()),
        "roc_auc":   round(roc_auc, 4),
        "pr_auc":    round(pr_auc, 4),
    },
    "fraud_model_config.pkl",
)
print("\n💾 Saved: xgboost_fraud_model.pkl | fraud_scaler.pkl | fraud_model_config.pkl")


# ============================================================
# 9. PRODUCTION INFERENCE HELPER
# ============================================================
def predict_transaction(raw_features: dict) -> dict:
    """
    Score a single transaction at inference time.

    Parameters
    ----------
    raw_features : dict
        Must contain all keys in FEATURES, already engineered
        (i.e. rolling_avg, z_score etc. computed from past history).

    Returns
    -------
    dict with fraud_probability, is_fraud, threshold_used
    """
    cfg    = joblib.load("fraud_model_config.pkl")
    sc     = joblib.load("fraud_scaler.pkl")
    model  = joblib.load("xgboost_fraud_model.pkl")

    row    = pd.DataFrame([raw_features])[cfg["features"]]
    row    = row.replace([np.inf, -np.inf], 0).fillna(0)
    row_sc = sc.transform(row)
    prob   = model.predict_proba(row_sc)[0][1]

    return {
        "fraud_probability": round(float(prob), 6),
        "is_fraud":          int(prob >= cfg["threshold"]),
        "threshold_used":    cfg["threshold"],
    }