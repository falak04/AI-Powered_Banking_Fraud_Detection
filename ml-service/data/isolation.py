"""
Isolation Forest — Login Anomaly Detection  (Final)
====================================================
Run this from inside real_data_output/ after running build_real_dataset_v2.py

Expected healthy output:
  impossible_travel  anomaly > normal   GOOD
  is_new_device      anomaly > normal   GOOD   (target ~10% new-device rate)
  vpn                anomaly > normal   GOOD
  hour_deviation     anomaly > normal   GOOD
  dormant_login      anomaly > normal   GOOD
  dist_from_home     anomaly > normal   GOOD
  time_diff          anomaly > normal   GOOD
"""

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

print("=" * 60)
print("  Isolation Forest — Login Anomaly Detection")
print("=" * 60)

# =============================================================================
# 1. LOAD
# =============================================================================
print("\n[1/6] Loading data...")
logins = pd.read_csv("/content/real_data_output/logins.csv")
logins["timestamp"] = pd.to_datetime(logins["timestamp"])
logins = logins.sort_values(["user_id", "timestamp"]).reset_index(drop=True)
print(f"  Loaded {len(logins):,} logins for {logins['user_id'].nunique():,} users")

# =============================================================================
# 2. VPN already correlated in v2 data generator — no re-assignment needed
# =============================================================================
print("\n[2/6] VPN signal check...")
print(f"  Overall VPN rate: {logins['vpn'].mean():.2%}  (target ~8-9%)")

# Cross-check with transactions if available
try:
    txns        = pd.read_csv("/content/real_data_output/transactions.csv")
    fraud_users = set(txns[txns["is_fraud"] == 1]["user_id"])
    vpn_fraud   = logins[logins["user_id"].isin(fraud_users)]["vpn"].mean()
    vpn_normal  = logins[~logins["user_id"].isin(fraud_users)]["vpn"].mean()
    print(f"  VPN rate fraud users  : {vpn_fraud:.2%}  (target ~40%)")
    print(f"  VPN rate normal users : {vpn_normal:.2%}  (target ~5%)")
except FileNotFoundError:
    print("  transactions.csv not found — skipping VPN cross-check.")

# =============================================================================
# 3. FEATURE ENGINEERING
# =============================================================================
print("\n[3/6] Engineering features...")

# ── Home city ─────────────────────────────────────────────────────────────────
home = (
    logins.groupby("user_id")["city"]
    .agg(lambda x: x.value_counts().index[0])
    .rename("home_city")
)
home_coords = (
    logins.groupby(["user_id", "city"])[["lat", "lon"]]
    .first()
    .reset_index()
    .merge(home.reset_index(), on="user_id")
    .query("city == home_city")[["user_id", "lat", "lon"]]
    .rename(columns={"lat": "home_lat", "lon": "home_lon"})
)
logins = logins.merge(home_coords, on="user_id", how="left")

def haversine(lat1, lon1, lat2, lon2):
    R    = 6371
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a    = (np.sin(dlat / 2)**2
            + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2)**2)
    return R * 2 * np.arcsin(np.sqrt(a.clip(0, 1)))

logins["dist_from_home"] = haversine(
    logins["lat"], logins["lon"],
    logins["home_lat"], logins["home_lon"]
)

# ── Sequential features ───────────────────────────────────────────────────────
logins["prev_lat"]  = logins.groupby("user_id")["lat"].shift(1).fillna(logins["lat"])
logins["prev_lon"]  = logins.groupby("user_id")["lon"].shift(1).fillna(logins["lon"])
logins["prev_time"] = logins.groupby("user_id")["timestamp"].shift(1).fillna(logins["timestamp"])

logins["time_diff"] = (
    (logins["timestamp"] - logins["prev_time"]).dt.total_seconds() / 3600
).clip(lower=0.01)

logins["distance"] = haversine(
    logins["lat"], logins["lon"],
    logins["prev_lat"], logins["prev_lon"]
)

# Speed: only meaningful within 24-hr windows
logins["speed"] = np.where(
    logins["time_diff"] < 24,
    (logins["distance"] / logins["time_diff"].clip(lower=0.01)).clip(upper=2000),
    0.0
)

# Impossible travel: >900 km/h AND within 24 hrs
logins["impossible_travel"] = (
    (logins["speed"] > 900) & (logins["time_diff"] < 24)
).astype(int)

# Dormant login: >7-day gap
logins["dormant_login"] = (logins["time_diff"] > 168).astype(int)

# ── Trusted devices: top-5 per user ──────────────────────────────────────────
trusted = (
    logins.groupby("user_id")["device_id"]
    .apply(lambda x: set(x.value_counts().head(5).index))
    .rename("trusted_devices")
)
logins = logins.merge(trusted.reset_index(), on="user_id", how="left")
logins["is_new_device"] = logins.apply(
    lambda r: int(r["device_id"] not in r["trusted_devices"]), axis=1
)

# ── Rolling login frequency ───────────────────────────────────────────────────
logins = logins.set_index("timestamp")
logins["login_freq_7d"] = (
    logins.groupby("user_id")["user_id"]
    .transform(lambda x: x.rolling("7D").count())
)
logins = logins.reset_index()

# ── Time features ─────────────────────────────────────────────────────────────
logins["hour"]           = logins["timestamp"].dt.hour
logins["day_of_week"]    = logins["timestamp"].dt.dayofweek
user_median_hour         = logins.groupby("user_id")["hour"].transform("median")
logins["hour_deviation"] = np.abs(logins["hour"] - user_median_hour)

# ── Encodings ─────────────────────────────────────────────────────────────────
logins["city_code"]   = logins["city"].astype("category").cat.codes
logins["device_code"] = logins["device_id"].astype("category").cat.codes

logins.replace([np.inf, -np.inf], 0, inplace=True)
logins.fillna(0, inplace=True)

print(f"  impossible_travel rate : {logins['impossible_travel'].mean():.2%}  (target <15%)")
print(f"  dormant_login rate     : {logins['dormant_login'].mean():.2%}")
print(f"  is_new_device rate     : {logins['is_new_device'].mean():.2%}  (target ~10%)")

# =============================================================================
# 4. SCALE
# =============================================================================
print("\n[4/6] Scaling features...")

FEATURES = [
    "hour",
    "day_of_week",
    "hour_deviation",
    "time_diff",
    "dormant_login",
    "login_freq_7d",
    "dist_from_home",
    "distance",
    "speed",
    "impossible_travel",
    "vpn",
    "is_new_device",
    "city_code",
    "device_code",
]

X        = logins[FEATURES]
scaler   = StandardScaler()
X_scaled = scaler.fit_transform(X)
print(f"  Feature matrix: {X_scaled.shape[0]:,} × {X_scaled.shape[1]}")

# =============================================================================
# 5. TRAIN
# =============================================================================
print("\n[5/6] Training Isolation Forest...")

model = IsolationForest(
    n_estimators=200,
    contamination=0.02,
    max_samples="auto",
    random_state=42,
    n_jobs=-1,
)
model.fit(X_scaled)

joblib.dump(model,    "isolation_forest_model.pkl")
joblib.dump(scaler,   "scaler.pkl")
joblib.dump(FEATURES, "feature_list.pkl")
print("  Model, scaler, and feature list saved.")

# =============================================================================
# 6. PREDICT + REPORT
# =============================================================================
print("\n[6/6] Predicting and reporting...")

logins["anomaly_score"] = model.decision_function(X_scaled)
logins["anomaly"]       = model.predict(X_scaled)

anomalies = logins[logins["anomaly"] == -1]
normal    = logins[logins["anomaly"] ==  1]

print(f"\n  Total logins      : {len(logins):,}")
print(f"  Flagged anomalies : {len(anomalies):,} ({len(anomalies)/len(logins):.2%})")

expected_higher_in_anomaly = {
    "hour_deviation", "dist_from_home", "dormant_login",
    "impossible_travel", "vpn", "is_new_device", "time_diff"
}

print(f"\n  {'Feature':<22}  {'Anomaly':>10}  {'Normal':>10}  {'Dir':>5}  {'Diff':>8}  Verdict")
print("  " + "-" * 75)
all_good = True
for f in FEATURES:
    a_mean  = anomalies[f].mean()
    n_mean  = normal[f].mean()
    diff    = a_mean - n_mean
    arrow   = "▲" if diff > 0 else "▼"
    if f in expected_higher_in_anomaly:
        verdict = "GOOD     " if diff > 0 else "INVERTED <-- fix"
        if diff <= 0:
            all_good = False
    else:
        verdict = ""
    print(f"  {f:<22}  {a_mean:>10.2f}  {n_mean:>10.2f}  {arrow:>5}  {abs(diff):>8.2f}  {verdict}")

if all_good:
    print("\n  All directional signals correct.")
else:
    print("\n  Some signals still inverted — check data generation.")

# ── Top anomalous users ───────────────────────────────────────────────────────
print("\n  Top 10 users by anomaly count:")
top_users = (
    anomalies.groupby("user_id")
    .agg(
        anomaly_count      =("anomaly",          "count"),
        avg_score          =("anomaly_score",     "mean"),
        vpn_rate           =("vpn",               "mean"),
        avg_dist_home_km   =("dist_from_home",    "mean"),
        impossible_travel  =("impossible_travel", "sum"),
        new_device_logins  =("is_new_device",     "sum"),
        dormant_logins     =("dormant_login",      "sum"),
    )
    .sort_values("anomaly_count", ascending=False)
    .head(10)
)
print(top_users.to_string())

# ── Save ──────────────────────────────────────────────────────────────────────
drop_cols = ["home_lat", "home_lon", "prev_lat", "prev_lon", "prev_time", "trusted_devices"]
logins.drop(columns=drop_cols, errors="ignore").to_csv("logins_with_anomalies.csv", index=False)
print("\n  Saved: logins_with_anomalies.csv")
print("\nDone.")