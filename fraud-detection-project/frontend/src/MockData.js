// Realistic mock data derived from actual model configs and CSV samples
// Used as fallback when Spring Boot is not reachable

export const MOCK_ALERTS = [
  {
    event_id: 'EVT-A1B2C3D4E5F6',
    user_id: 'C1013',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    combined_risk_score: 0.961,
    security_action: { code: 'BLOCK_ALERT_SOC', severity: 'critical', description: 'Critical fraud risk. Transaction blocked.' },
    transaction_result: {
      ml_fraud_score: 0.978,
      is_fraud: true,
      anomaly_score: 0.81,
      shap_explanation: [
        { feature: 'z_score',         shap_value:  0.421, direction: 'increases risk', rank: 1 },
        { feature: 'deviation',       shap_value:  0.318, direction: 'increases risk', rank: 2 },
        { feature: 'amount_velocity', shap_value:  0.204, direction: 'increases risk', rank: 3 },
        { feature: 'is_night',        shap_value:  0.187, direction: 'increases risk', rank: 4 },
        { feature: 'rolling_avg',     shap_value: -0.093, direction: 'reduces risk',   rank: 5 },
        { feature: 'time_diff',       shap_value:  0.071, direction: 'increases risk', rank: 6 },
        { feature: 'amount',          shap_value:  0.065, direction: 'increases risk', rank: 7 },
        { feature: 'log_amount',      shap_value:  0.044, direction: 'increases risk', rank: 8 },
      ],
    },
    graph_result: { graph_risk_score: 0.696, user_in_graph: true },
    alert_soc: true,
  },
  {
    event_id: 'EVT-B2C3D4E5F6A1',
    user_id: 'C10191',
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    combined_risk_score: 0.742,
    security_action: { code: 'LOCK_ACCOUNT', severity: 'high', description: 'High risk detected. Account temporarily locked.' },
    transaction_result: {
      ml_fraud_score: 0.831,
      is_fraud: false,
      anomaly_score: 0.67,
      shap_explanation: [
        { feature: 'amount',          shap_value:  0.312, direction: 'increases risk', rank: 1 },
        { feature: 'time_diff',       shap_value:  0.241, direction: 'increases risk', rank: 2 },
        { feature: 'deviation',       shap_value:  0.198, direction: 'increases risk', rank: 3 },
        { feature: 'rolling_std',     shap_value:  0.143, direction: 'increases risk', rank: 4 },
        { feature: 'is_weekend',      shap_value: -0.087, direction: 'reduces risk',   rank: 5 },
        { feature: 'day_of_week',     shap_value: -0.054, direction: 'reduces risk',   rank: 6 },
        { feature: 'month',           shap_value:  0.038, direction: 'increases risk', rank: 7 },
        { feature: 'user_txn_count',  shap_value: -0.029, direction: 'reduces risk',   rank: 8 },
      ],
    },
    graph_result: { graph_risk_score: 0.546, user_in_graph: true },
    alert_soc: false,
  },
  {
    event_id: 'EVT-C3D4E5F6A1B2',
    user_id: 'C10005',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    combined_risk_score: 0.521,
    security_action: { code: 'OTP_MFA', severity: 'medium', description: 'Elevated risk detected. Step-up authentication required.' },
    transaction_result: {
      ml_fraud_score: 0.589,
      is_fraud: false,
      anomaly_score: 0.44,
      shap_explanation: [
        { feature: 'vpn',             shap_value:  0.267, direction: 'increases risk', rank: 1 },
        { feature: 'is_new_device',   shap_value:  0.198, direction: 'increases risk', rank: 2 },
        { feature: 'amount_diff',     shap_value:  0.154, direction: 'increases risk', rank: 3 },
        { feature: 'rolling_avg',     shap_value: -0.121, direction: 'reduces risk',   rank: 4 },
        { feature: 'hour',            shap_value:  0.089, direction: 'increases risk', rank: 5 },
        { feature: 'z_score',         shap_value:  0.063, direction: 'increases risk', rank: 6 },
        { feature: 'amount',          shap_value: -0.041, direction: 'reduces risk',   rank: 7 },
        { feature: 'user_txn_count',  shap_value: -0.028, direction: 'reduces risk',   rank: 8 },
      ],
    },
    graph_result: { graph_risk_score: 0.403, user_in_graph: true },
    alert_soc: false,
  },
  {
    event_id: 'EVT-D4E5F6A1B2C3',
    user_id: 'C10033',
    timestamp: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
    combined_risk_score: 0.198,
    security_action: { code: 'ALLOW', severity: 'low', description: 'Transaction within normal parameters.' },
    transaction_result: {
      ml_fraud_score: 0.142,
      is_fraud: false,
      anomaly_score: 0.21,
      shap_explanation: [
        { feature: 'rolling_avg',     shap_value: -0.312, direction: 'reduces risk',   rank: 1 },
        { feature: 'user_txn_count',  shap_value: -0.241, direction: 'reduces risk',   rank: 2 },
        { feature: 'z_score',         shap_value: -0.187, direction: 'reduces risk',   rank: 3 },
        { feature: 'time_diff',       shap_value: -0.143, direction: 'reduces risk',   rank: 4 },
        { feature: 'amount',          shap_value:  0.067, direction: 'increases risk', rank: 5 },
        { feature: 'deviation',       shap_value:  0.045, direction: 'increases risk', rank: 6 },
        { feature: 'is_night',        shap_value: -0.031, direction: 'reduces risk',   rank: 7 },
        { feature: 'month',           shap_value: -0.018, direction: 'reduces risk',   rank: 8 },
      ],
    },
    graph_result: { graph_risk_score: 0.408, user_in_graph: true },
    alert_soc: false,
  },
];

export const MOCK_GRAPH_NODES = [
  { id: 'C1013',   type: 'customer', risk: 0.696, x: 320, y: 180 },
  { id: 'C10005',  type: 'customer', risk: 0.403, x: 180, y: 300 },
  { id: 'C10014',  type: 'customer', risk: 0.413, x: 460, y: 290 },
  { id: 'C10019',  type: 'customer', risk: 0.413, x: 560, y: 160 },
  { id: 'C10033',  type: 'customer', risk: 0.408, x: 100, y: 160 },
  { id: 'C10037',  type: 'customer', risk: 0.360, x: 260, y: 420 },
  { id: 'C10163',  type: 'customer', risk: 0.358, x: 420, y: 420 },
  { id: 'C10191',  type: 'customer', risk: 0.546, x: 600, y: 340 },
  { id: 'D001',    type: 'device',   risk: 0.72,  x: 380, y: 80  },
  { id: 'D002',    type: 'device',   risk: 0.31,  x: 640, y: 240 },
  { id: 'E039',    type: 'employee', risk: 0.58,  x: 160, y: 80  },
];

export const MOCK_GRAPH_EDGES = [
  { from: 'C1013',  to: 'D001',   weight: 0.9 },
  { from: 'C10019', to: 'D001',   weight: 0.7 },
  { from: 'C10191', to: 'D002',   weight: 0.6 },
  { from: 'C10014', to: 'D002',   weight: 0.4 },
  { from: 'E039',   to: 'C10005', weight: 0.5 },
  { from: 'E039',   to: 'C1013',  weight: 0.8 },
  { from: 'C10005', to: 'C10033', weight: 0.3 },
  { from: 'C1013',  to: 'C10191', weight: 0.6 },
];

export const MOCK_TIMELINE = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  events: Math.floor(Math.random() * 40 + 5),
  fraud:  Math.floor(Math.random() * 8),
  risk:   parseFloat((Math.random() * 0.6 + 0.1).toFixed(3)),
}));

export const MOCK_LOGIN_HEATMAP = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => ({
    day, hour,
    count:   Math.floor(Math.random() * 50),
    anomaly: Math.random() > 0.85 ? Math.random() * 0.4 + 0.6 : Math.random() * 0.3,
  }))
).flat();

export const MOCK_MODEL_INFO = {
  xgboost: { model_type: 'XGBoost', roc_auc: 1.0, pr_auc: 0.9935, threshold: 0.9807 },
  shap:    { version: '0.51.0', model_type: 'XGBoost', feature_perturbation: 'tree_path_dependent' },
  isolation_forest: { n_estimators: 100 },
  risk_scoring: {
    ml_weight: 0.65, graph_weight: 0.35,
    thresholds: { allow: 0.4, otp_mfa: 0.7, lock_account: 0.9, block_soc: 1.0 },
  },
};