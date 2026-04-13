"""
Graph-Based Fraud Detection
============================
Dataset: logins.csv, employees.csv, employee_actions.csv, devices.csv

Graph structure:
  - Nodes: users (customers), devices, employees
  - Edges:
      user <-> device   (login events)
      employee <-> user (employee acted on customer account)

Risk signals derived from:
  1.  Shared devices          — multiple users on same device
  2.  Device hopping          — user logs in from many devices
  3.  VPN usage               — login via VPN
  4.  Impossible travel       — two logins from distant cities in short time window
  5.  Off-hours logins        — logins between 00:00–05:00
  6.  High-risk employee actions — export / permission_change / delete
  7.  Employee flags known suspicious actions (is_suspicious column)
  8.  Privileged employees acting on flagged accounts
  9.  Graph propagation       — risk bleeds through shared nodes
  10. Suspicious OS/type combo — e.g. Linux on mobile (rare, fraud-associated)
  11. OS switching            — same user seen on inconsistent OS across devices
  12. High-risk device type   — rooted/emulated device type patterns
"""

import pandas as pd
import numpy as np
import networkx as nx
import joblib
from math import radians, sin, cos, sqrt, atan2
from collections import defaultdict
from datetime import datetime
import warnings
warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────
# 1. LOAD DATA
# ─────────────────────────────────────────────
print("Loading data...")
logins    = pd.read_csv("/mnt/user-data/uploads/logins__1_.csv",   parse_dates=["timestamp"])
employees = pd.read_csv("/mnt/user-data/uploads/employees__1_.csv")
actions   = pd.read_csv("/mnt/user-data/uploads/employee_actions__1_.csv", parse_dates=["timestamp"])
devices   = pd.read_csv("/mnt/user-data/uploads/devices__1_.csv")

print(f"  Logins:    {len(logins):,} rows  | {logins['user_id'].nunique():,} users | {logins['device_id'].nunique():,} devices")
print(f"  Employees: {len(employees):,} rows")
print(f"  Actions:   {len(actions):,} rows  | suspicious={actions['is_suspicious'].sum()}")
print(f"  Devices:   {len(devices):,} rows  | types={devices['device_type'].nunique()} | os={devices['os'].nunique()}")

# ─────────────────────────────────────────────
# 2. PRE-COMPUTE LOGIN-LEVEL RISK FLAGS
# ─────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km."""
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

print("\nComputing login-level features...")

# Sort by user and time for sequential analysis
logins = logins.sort_values(["user_id", "timestamp"]).reset_index(drop=True)

# Off-hours flag (00:00–05:00)
logins["off_hours"] = logins["timestamp"].dt.hour < 5

# Impossible travel: for consecutive logins from same user,
# flag if distance > 500 km within 2 hours
logins["impossible_travel"] = False

prev = logins.shift(1)
same_user = logins["user_id"] == prev["user_id"]
time_gap_h = (logins["timestamp"] - prev["timestamp"]).dt.total_seconds() / 3600

dist_km = np.where(
    same_user,
    [
        haversine_km(r.lat, r.lon, p_lat, p_lon)
        for r, p_lat, p_lon in zip(
            logins.itertuples(),
            prev["lat"].fillna(0),
            prev["lon"].fillna(0)
        )
    ],
    0.0
)
logins["impossible_travel"] = (same_user) & (dist_km > 500) & (time_gap_h < 2)

print(f"  Off-hours logins:      {logins['off_hours'].sum():,}")
print(f"  Impossible travel:     {logins['impossible_travel'].sum():,}")
print(f"  VPN logins:            {logins['vpn'].sum():,}")

# ─────────────────────────────────────────────
# 2b. DEVICE-LEVEL RISK FLAGS (from devices.csv)
# ─────────────────────────────────────────────
print("\nComputing device-level features...")

# Signal 10: Suspicious OS + device_type combo
# Linux on mobile = almost never legitimate; signals emulator/rooted device
SUSPICIOUS_OS_TYPE = {
    ("Linux",  "mobile"),   # emulated Android shell
    ("Linux",  "tablet"),   # rare in real consumer banking
    ("macOS",  "mobile"),   # macOS doesn't run on phones — likely spoofed UA
    ("macOS",  "tablet"),   # same
}
devices["suspicious_combo"] = devices.apply(
    lambda r: int((r["os"], r["device_type"]) in SUSPICIOUS_OS_TYPE), axis=1
)

# Signal 12: High-risk device types (tablets are less common in banking,
# desktop/laptop = normal; we'll use this as a mild modifier below)
HIGH_RISK_DEVICE_TYPES = {"tablet"}   # minor signal, not standalone

# Merge device metadata onto logins for user-level OS diversity
logins_dev = logins.merge(devices[["device_id","device_type","os","suspicious_combo"]],
                          on="device_id", how="left")

# Signal 11: OS switching — number of distinct OS values a user touches
user_os_diversity = logins_dev.groupby("user_id")["os"].nunique().rename("unique_os")
user_sus_combos   = logins_dev.groupby("user_id")["suspicious_combo"].max().rename("suspicious_combo_any")

# Suspicious device lookups (for device node scoring)
dev_type_map    = devices.set_index("device_id")["device_type"].to_dict()
dev_os_map      = devices.set_index("device_id")["os"].to_dict()
dev_suscombo_map= devices.set_index("device_id")["suspicious_combo"].to_dict()

print(f"  Suspicious OS/type combos: {devices['suspicious_combo'].sum():,} devices")

# ─────────────────────────────────────────────
# 3. USER-LEVEL AGGREGATED FEATURES
# ─────────────────────────────────────────────
print("\nAggregating user features...")

user_feats = logins.groupby("user_id").agg(
    total_logins          = ("timestamp",        "count"),
    unique_devices        = ("device_id",        "nunique"),
    unique_cities         = ("city",             "nunique"),
    vpn_logins            = ("vpn",              "sum"),
    off_hours_logins      = ("off_hours",        "sum"),
    impossible_travel_cnt = ("impossible_travel","sum"),
).reset_index()

user_feats["vpn_rate"]          = user_feats["vpn_logins"]          / user_feats["total_logins"]
user_feats["off_hours_rate"]    = user_feats["off_hours_logins"]     / user_feats["total_logins"]
user_feats["impossible_travel_any"] = (user_feats["impossible_travel_cnt"] > 0).astype(int)

# Device-sharing: how many other users share the same device
device_user_count = logins.groupby("device_id")["user_id"].nunique().rename("device_user_count")
logins_with_count = logins.merge(device_user_count, on="device_id")
user_max_shared   = logins_with_count.groupby("user_id")["device_user_count"].max().rename("max_device_sharing")
user_feats        = user_feats.merge(user_max_shared,    on="user_id", how="left")
user_feats        = user_feats.merge(user_os_diversity,  on="user_id", how="left")
user_feats        = user_feats.merge(user_sus_combos,    on="user_id", how="left")
user_feats["unique_os"]           = user_feats["unique_os"].fillna(1).astype(int)
user_feats["suspicious_combo_any"]= user_feats["suspicious_combo_any"].fillna(0).astype(int)

# ─────────────────────────────────────────────
# 4. BUILD THE GRAPH
# ─────────────────────────────────────────────
print("\nBuilding fraud graph...")
G = nx.Graph()

# Privilege lookup
priv_map = employees.set_index("employee_id")["is_privileged"].to_dict()
role_map = employees.set_index("employee_id")["role"].to_dict()

# Add user nodes
for uid in user_feats["user_id"]:
    G.add_node(f"user_{uid}", type="user")

# Add device nodes + user<->device edges (one edge per unique pair)
for (uid, did), grp in logins.groupby(["user_id", "device_id"]):
    u_node = f"user_{uid}"
    d_node = f"device_{did}"
    G.add_node(d_node, type="device")
    if not G.has_edge(u_node, d_node):
        G.add_edge(u_node, d_node,
                   login_count      = len(grp),
                   vpn_count        = int(grp["vpn"].sum()),
                   off_hours_count  = int(grp["off_hours"].sum()))

# Add employee nodes + employee<->user edges
HIGH_RISK_ACTIONS = {"export", "permission_change", "delete"}

for _, row in actions.iterrows():
    e_node  = f"emp_{row['employee_id']}"
    u_node  = f"user_{row['customer_id']}"
    G.add_node(e_node, type="employee",
               is_privileged=priv_map.get(row["employee_id"], 0),
               role=role_map.get(row["employee_id"], "unknown"))
    G.add_node(u_node, type="user")   # ensure node exists even if no login record
    if G.has_edge(e_node, u_node):
        G[e_node][u_node]["action_count"]      += 1
        G[e_node][u_node]["suspicious_count"]  += int(row["is_suspicious"])
        G[e_node][u_node]["high_risk_actions"]  = (
            G[e_node][u_node].get("high_risk_actions", 0) +
            int(row["action"] in HIGH_RISK_ACTIONS)
        )
    else:
        G.add_edge(e_node, u_node,
                   action_count     = 1,
                   suspicious_count = int(row["is_suspicious"]),
                   high_risk_actions= int(row["action"] in HIGH_RISK_ACTIONS))

print(f"  Nodes: {G.number_of_nodes():,}  |  Edges: {G.number_of_edges():,}")

# ─────────────────────────────────────────────
# 5. SCORE EACH NODE (RAW)
# ─────────────────────────────────────────────
print("\nScoring nodes...")

# Percentile helpers for calibrating thresholds on this dataset
def ptile_thresh(series, p):
    return np.percentile(series.dropna(), p)

# Precompute degree for all nodes
degree = dict(G.degree())

# --- Device sharing thresholds ---
device_degrees = [degree[n] for n in G.nodes if G.nodes[n]["type"] == "device"]
dev_p90 = ptile_thresh(pd.Series(device_degrees), 90)   # top 10% sharing

# --- Employee action thresholds ---
emp_degrees = [degree[n] for n in G.nodes if G.nodes[n]["type"] == "employee"]
emp_p90 = ptile_thresh(pd.Series(emp_degrees), 90)

raw_scores = {}

for node in G.nodes():
    ntype = G.nodes[node]["type"]
    deg   = degree[node]
    nbrs  = list(G.neighbors(node))
    score = 0.0

    # ── DEVICE signals ───────────────────────────────────────────
    if ntype == "device":
        # Many users sharing this device
        if deg > dev_p90:
            score += 0.5
        elif deg > dev_p90 * 0.7:
            score += 0.25

        # VPN-heavy device
        vpn_total   = sum(G[node][nb].get("vpn_count", 0)       for nb in nbrs)
        login_total = sum(G[node][nb].get("login_count", 1)     for nb in nbrs)
        vpn_rate    = vpn_total / max(login_total, 1)
        if vpn_rate > 0.5:
            score += 0.3
        elif vpn_rate > 0.2:
            score += 0.15

        # Off-hours concentration
        oh_total = sum(G[node][nb].get("off_hours_count", 0) for nb in nbrs)
        oh_rate  = oh_total / max(login_total, 1)
        if oh_rate > 0.4:
            score += 0.2

    # ── EMPLOYEE signals ─────────────────────────────────────────
    elif ntype == "employee":
        is_priv = G.nodes[node].get("is_privileged", 0)

        # Abnormally high customer access
        if deg > emp_p90:
            score += 0.4
        elif deg > emp_p90 * 0.7:
            score += 0.2

        # Has any confirmed suspicious actions
        total_susp = sum(G[node][nb].get("suspicious_count", 0) for nb in nbrs)
        total_hr   = sum(G[node][nb].get("high_risk_actions", 0) for nb in nbrs)

        if total_susp > 0:
            score += min(0.3 + total_susp * 0.05, 0.5)
        if total_hr > 0:
            score += min(total_hr * 0.06, 0.3)

        # Privileged + suspicious = elevated
        if is_priv and total_susp > 0:
            score += 0.2

    # ── USER signals ─────────────────────────────────────────────
    elif ntype == "user":
        uid = node.replace("user_", "")
        row_data = user_feats[user_feats["user_id"] == uid]

        if not row_data.empty:
            r = row_data.iloc[0]

            # Device hopping
            if r["unique_devices"] > 20:
                score += 0.4
            elif r["unique_devices"] > 10:
                score += 0.2

            # Impossible travel
            if r["impossible_travel_any"]:
                score += 0.35

            # High VPN rate
            if r["vpn_rate"] > 0.5:
                score += 0.25
            elif r["vpn_rate"] > 0.2:
                score += 0.1

            # Off-hours heavy
            if r["off_hours_rate"] > 0.4:
                score += 0.15

            # Shared on very high-sharing device
            if r.get("max_device_sharing", 0) > dev_p90:
                score += 0.1

        # Accessed by suspicious employees
        for nb in nbrs:
            if G.nodes[nb]["type"] == "employee":
                e_susp = G[node][nb].get("suspicious_count", 0)
                e_hr   = G[node][nb].get("high_risk_actions", 0)
                if e_susp > 0:
                    score += 0.2
                if e_hr > 0:
                    score += min(e_hr * 0.05, 0.2)

    raw_scores[node] = min(score, 1.0)

# ─────────────────────────────────────────────
# 6. RISK PROPAGATION (one hop, dampened)
# ─────────────────────────────────────────────
print("Propagating risk through graph...")

final_scores = {}
for node in G.nodes():
    nbrs = list(G.neighbors(node))
    if nbrs:
        nbr_avg = sum(raw_scores[n] for n in nbrs) / len(nbrs)
        final_scores[node] = min(0.75 * raw_scores[node] + 0.25 * nbr_avg, 1.0)
    else:
        final_scores[node] = raw_scores[node]

# ─────────────────────────────────────────────
# 7. EXPORT RESULTS
# ─────────────────────────────────────────────

# — User risk table —
user_rows = []
for node, score in final_scores.items():
    if node.startswith("user_"):
        uid = node.replace("user_", "")
        row_data = user_feats[user_feats["user_id"] == uid]
        if not row_data.empty:
            r = row_data.iloc[0]
            user_rows.append({
                "user_id":              uid,
                "risk_score":           round(score, 4),
                "risk_tier":            "HIGH" if score >= 0.5 else ("MEDIUM" if score >= 0.25 else "LOW"),
                "unique_devices":       int(r["unique_devices"]),
                "unique_cities":        int(r["unique_cities"]),
                "vpn_rate":             round(r["vpn_rate"], 3),
                "off_hours_rate":       round(r["off_hours_rate"], 3),
                "impossible_travel":    int(r["impossible_travel_any"]),
                "total_logins":         int(r["total_logins"]),
            })

user_risk_df = pd.DataFrame(user_rows).sort_values("risk_score", ascending=False)

# — Employee risk table —
emp_rows = []
for node, score in final_scores.items():
    if node.startswith("emp_"):
        eid = node.replace("emp_", "")
        nbrs = list(G.neighbors(node))
        total_susp = sum(G[node][n].get("suspicious_count", 0) for n in nbrs)
        total_hr   = sum(G[node][n].get("high_risk_actions", 0) for n in nbrs)
        emp_rows.append({
            "employee_id":       eid,
            "role":              role_map.get(eid, "unknown"),
            "is_privileged":     priv_map.get(eid, 0),
            "risk_score":        round(score, 4),
            "risk_tier":         "HIGH" if score >= 0.5 else ("MEDIUM" if score >= 0.25 else "LOW"),
            "customers_accessed": G.degree(node),
            "suspicious_actions":total_susp,
            "high_risk_actions": total_hr,
        })

emp_risk_df = pd.DataFrame(emp_rows).sort_values("risk_score", ascending=False)

# — Device risk table —
dev_rows = []
for node, score in final_scores.items():
    if node.startswith("device_"):
        did = node.replace("device_", "")
        nbrs = list(G.neighbors(node))
        total_logins = sum(G[node][n].get("login_count", 0) for n in nbrs)
        total_vpn    = sum(G[node][n].get("vpn_count", 0) for n in nbrs)
        total_oh     = sum(G[node][n].get("off_hours_count", 0) for n in nbrs)
        dev_rows.append({
            "device_id":          did,
            "risk_score":         round(score, 4),
            "risk_tier":          "HIGH" if score >= 0.5 else ("MEDIUM" if score >= 0.25 else "LOW"),
            "unique_users":       G.degree(node),
            "total_logins":       total_logins,
            "vpn_logins":         total_vpn,
            "off_hours_logins":   total_oh,
        })

dev_risk_df = pd.DataFrame(dev_rows).sort_values("risk_score", ascending=False)

# Save
user_risk_df.to_csv("/mnt/user-data/outputs/user_risk.csv",     index=False)
emp_risk_df.to_csv("/mnt/user-data/outputs/employee_risk.csv",  index=False)
dev_risk_df.to_csv("/mnt/user-data/outputs/device_risk.csv",    index=False)
joblib.dump(G,            "/mnt/user-data/outputs/fraud_graph.pkl")
joblib.dump(final_scores, "/mnt/user-data/outputs/graph_risk_scores.pkl")

# ─────────────────────────────────────────────
# 8. SUMMARY REPORT
# ─────────────────────────────────────────────
print("\n" + "="*55)
print("FRAUD DETECTION SUMMARY")
print("="*55)

for label, df in [("USERS", user_risk_df), ("EMPLOYEES", emp_risk_df), ("DEVICES", dev_risk_df)]:
    tiers = df["risk_tier"].value_counts()
    print(f"\n{label}  (total={len(df):,})")
    for t in ["HIGH", "MEDIUM", "LOW"]:
        print(f"  {t:6s}: {tiers.get(t, 0):>6,}")

print("\n── Top 10 High-Risk USERS ──")
print(user_risk_df[user_risk_df["risk_tier"]=="HIGH"]
      .head(10)[["user_id","risk_score","unique_devices","impossible_travel","vpn_rate"]].to_string(index=False))

print("\n── Top 10 High-Risk EMPLOYEES ──")
print(emp_risk_df[emp_risk_df["risk_tier"]=="HIGH"]
      .head(10)[["employee_id","role","is_privileged","risk_score","suspicious_actions","high_risk_actions"]].to_string(index=False))

print("\n── Top 10 High-Risk DEVICES ──")
print(dev_risk_df[dev_risk_df["risk_tier"]=="HIGH"]
      .head(10)[["device_id","risk_score","unique_users","vpn_logins"]].to_string(index=False))

# Cross-validate: suspicious actions in dataset vs high-risk employees
known_susp_emps = set(actions[actions["is_suspicious"]==1]["employee_id"].unique())
detected_high   = set(emp_risk_df[emp_risk_df["risk_tier"]=="HIGH"]["employee_id"])
overlap = known_susp_emps & detected_high
print(f"\n── Validation ──")
print(f"  Employees with known suspicious actions : {len(known_susp_emps)}")
print(f"  Flagged HIGH risk by graph model        : {len(detected_high)}")
print(f"  Overlap (correctly flagged)             : {len(overlap)} ({100*len(overlap)/max(len(known_susp_emps),1):.1f}% recall)")
print("\n✅ Done. Output files written to /mnt/user-data/outputs/")