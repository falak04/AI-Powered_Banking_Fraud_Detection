import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import {
  MOCK_ALERTS, MOCK_GRAPH_NODES, MOCK_GRAPH_EDGES,
  MOCK_MODEL_INFO,
} from './MockData.js';
import './App.css';

// ─── constants ────────────────────────────────────────────────────────────────
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PANELS = ['ALERT FEED', 'RISK TIMELINE', 'FRAUD GRAPH', 'AI EXPLANATION', 'LOGIN HEATMAP', 'SIMULATE'];

// ─── helpers ──────────────────────────────────────────────────────────────────
const riskColor = (score) => {
  if (score >= 0.9)  return '#ff2d55';
  if (score >= 0.7)  return '#ff6b35';
  if (score >= 0.4)  return '#ffd60a';
  return '#30d158';
};
const riskLabel = (score) => {
  if (score >= 0.9)  return 'CRITICAL';
  if (score >= 0.7)  return 'HIGH';
  if (score >= 0.4)  return 'MEDIUM';
  return 'LOW';
};
const actionColor = (code) => ({
  BLOCK_ALERT_SOC: '#ff2d55',
  LOCK_ACCOUNT:    '#ff6b35',
  OTP_MFA:         '#ffd60a',
  ALLOW:           '#30d158',
}[code] || '#8e8e93');

const timeAgo = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const fmt = (n, d = 3) => typeof n === 'number' ? n.toFixed(d) : '—';

// ─── sub-components ───────────────────────────────────────────────────────────

const fmtUpdate = (iso) => iso ? `Updated ${timeAgo(iso)}` : 'Waiting for data';
const formatSource = (source) => source === 'stored_session_events' ? 'Stored Session Events' : source || 'Generated Live';

const buildTimeline = (alerts) => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, events: 0, fraud: 0, risk: 0 }));

  alerts.forEach((alert) => {
    const date = new Date(alert.timestamp);
    const hour = Number.isNaN(date.getTime()) ? 0 : date.getHours();
    const bucket = buckets[hour];
    bucket.events += 1;
    if ((alert.transaction_result?.ml_fraud_score ?? 0) >= 0.5 || alert.alert_soc) {
      bucket.fraud += 1;
    }
    bucket.risk += Number(alert.combined_risk_score || 0);
  });

  return buckets.map((bucket) => ({
    ...bucket,
    risk: bucket.events ? bucket.risk / bucket.events : 0,
  }));
};

const buildHeatmap = (events) => {
  const cells = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => ({ day, hour, count: 0, anomaly: 0 }))
  ).flat();

  events.forEach((event) => {
    const date = new Date(event.timestamp);
    if (Number.isNaN(date.getTime())) return;
    const day = date.getDay();
    const hour = date.getHours();
    const cell = cells[day * 24 + hour];
    cell.count += 1;
    const anomalySignal = event.anomaly_score ?? 0;
    cell.anomaly = Math.max(cell.anomaly, Number(anomalySignal));
  });

  return cells;
};

const mergeGraphNodes = (baseNodes, scoreMap) => {
  const seen = new Set();
  const merged = baseNodes.map((node) => {
    if (node.type !== 'customer') return node;
    const direct = scoreMap[node.id];
    const prefixed = scoreMap[`user_${node.id}`];
    const risk = direct ?? prefixed ?? node.risk;
    seen.add(node.id);
    seen.add(`user_${node.id}`);
    return { ...node, risk };
  });

  const extraCustomers = Object.entries(scoreMap)
    .filter(([key]) => !seen.has(key))
    .slice(0, 6)
    .map(([key, risk], index) => ({
      id: key.replace(/^user_/, ''),
      type: 'customer',
      risk,
      x: 120 + (index % 3) * 180,
      y: 120 + Math.floor(index / 3) * 150,
    }));

  return [...merged, ...extraCustomers];
};

function StatusBar({ online, alertCount, modelInfo }) {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`dot ${online ? 'dot-green' : 'dot-red'}`} />
        <span className="status-text">ML SERVICE {online ? 'ONLINE' : 'OFFLINE'}</span>
        <span className="sep">|</span>
        <span className="status-text">SPRING BOOT :8080</span>
        <span className="sep">|</span>
        <span className="status-text">PYTHON ML :8000</span>
      </div>
      <div className="status-right">
        {modelInfo && (
          <>
            <span className="badge badge-blue">XGBoost ROC {modelInfo.xgboost?.roc_auc?.toFixed(4)}</span>
            <span className="badge badge-purple">PR-AUC {modelInfo.xgboost?.pr_auc?.toFixed(4)}</span>
          </>
        )}
        <span className="badge badge-red">{alertCount} ACTIVE ALERTS</span>
        <span className="clock">{new Date().toLocaleTimeString('en-IN', { hour12: false })}</span>
      </div>
    </div>
  );
}

// ── Alert Feed ────────────────────────────────────────────────────────────────
function AlertFeed({ alerts, onSelect, selected }) {
  return (
    <div className="panel-scroll">
      {alerts.length === 0 && <div className="empty">No alerts yet. Run a simulation.</div>}
      {alerts.map((a) => (
        <div
          key={a.event_id}
          className={`alert-row ${selected?.event_id === a.event_id ? 'alert-row-active' : ''}`}
          onClick={() => onSelect(a)}
        >
          <div className="alert-left">
            <span className="alert-dot" style={{ background: actionColor(a.security_action?.code) }} />
            <div>
              <div className="alert-user">{a.user_id}</div>
              <div className="alert-id">{a.event_id}</div>
            </div>
          </div>
          <div className="alert-right">
            <div className="alert-score" style={{ color: riskColor(a.combined_risk_score) }}>
              {fmt(a.combined_risk_score)}
            </div>
            <div className="alert-action" style={{ color: actionColor(a.security_action?.code) }}>
              {a.security_action?.code?.replace('_', ' ')}
            </div>
            <div className="alert-time">{timeAgo(a.timestamp)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Risk Timeline ─────────────────────────────────────────────────────────────
function RiskTimeline({ data }) {
  const totalEvents = data.reduce((s, d) => s + d.events, 0);
  const totalFraud = data.reduce((s, d) => s + d.fraud, 0);
  const avgRisk = data.reduce((s, d) => s + d.risk, 0) / Math.max(data.length, 1);
  const peak = data.reduce((best, row) => row.risk > best.risk ? row : best, data[0] || { hour: 0, risk: 0, events: 0 });
  return (
    <div className="timeline-simple">
      <div className="timeline-summary">
        <div className="timeline-card">
          <span className="timeline-card-label">Total Events</span>
          <span className="timeline-card-value">{totalEvents}</span>
        </div>
        <div className="timeline-card">
          <span className="timeline-card-label">Fraud Flags</span>
          <span className="timeline-card-value" style={{ color: '#ff2d55' }}>{totalFraud}</span>
        </div>
        <div className="timeline-card">
          <span className="timeline-card-label">Avg Risk</span>
          <span className="timeline-card-value" style={{ color: riskColor(avgRisk) }}>{fmt(avgRisk)}</span>
        </div>
        <div className="timeline-card">
          <span className="timeline-card-label">Highest Hour</span>
          <span className="timeline-card-value">{String(peak.hour).padStart(2, '0')}:00</span>
        </div>
      </div>
      <div className="timeline-list">
        {data.map((d) => (
          <div key={d.hour} className="timeline-row">
            <div className="timeline-hour">{String(d.hour).padStart(2, '0')}:00</div>
            <div className="timeline-bar-track">
              <div
                className="timeline-bar-fill"
                style={{ width: `${Math.max(6, d.risk * 100)}%`, background: riskColor(d.risk) }}
              />
            </div>
            <div className="timeline-meta">{d.events} events</div>
            <div className="timeline-meta">{d.fraud} flagged</div>
            <div className="timeline-score" style={{ color: riskColor(d.risk) }}>{fmt(d.risk)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fraud Graph ───────────────────────────────────────────────────────────────
function FraudGraph({ nodes, edges, onNodeClick, selected }) {
  const W = 700, H = 460;
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <div className="graph-wrap">
      <div className="graph-legend">
        <span><span className="tl-dot" style={{background:'#0a84ff'}} /> Customer</span>
        <span><span className="tl-dot" style={{background:'#bf5af2'}} /> Device</span>
        <span><span className="tl-dot" style={{background:'#ffd60a'}} /> Employee</span>
        <span style={{marginLeft:'auto', fontSize:'11px', color:'#636366'}}>
          Node color = risk level
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="graph-svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {edges.map((e, i) => {
          const from = nodeById[e.from], to = nodeById[e.to];
          if (!from || !to) return null;
          return (
            <line key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={`rgba(255,255,255,${e.weight * 0.25})`}
              strokeWidth={e.weight * 2.5}
            />
          );
        })}
        {nodes.map((n) => {
          const isSelected = selected === n.id;
          const typeColor = n.type === 'device' ? '#bf5af2' : n.type === 'employee' ? '#ffd60a' : '#0a84ff';
          const r = n.type === 'device' ? 14 : n.type === 'employee' ? 16 : 18;
          return (
            <g key={n.id} onClick={() => onNodeClick(n.id)} className="graph-node-g">
              {isSelected && (
                <circle cx={n.x} cy={n.y} r={r + 10}
                  fill="none" stroke={riskColor(n.risk)} strokeWidth={2} opacity={0.5}
                  style={{ filter: 'url(#glow)' }} />
              )}
              <circle cx={n.x} cy={n.y} r={r}
                fill={`${riskColor(n.risk)}33`}
                stroke={riskColor(n.risk)}
                strokeWidth={isSelected ? 3 : 1.5}
                style={{ filter: isSelected ? 'url(#glow)' : undefined }}
              />
              <circle cx={n.x} cy={n.y} r={r * 0.4} fill={typeColor} />
              <text x={n.x} y={n.y + r + 14} textAnchor="middle"
                fill="#aeaeb2" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {n.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── AI Explanation (SHAP) ─────────────────────────────────────────────────────
function AiExplanation({ alert, modelInfo }) {
  if (!alert) return (
    <div className="empty">Select an alert from the feed to see AI explanation.</div>
  );
  const txn = alert.transaction_result;
  const shap = txn?.shap_explanation || [];
  const maxAbs = Math.max(...shap.map(s => Math.abs(s.shap_value)), 0.001);

  return (
    <div className="shap-wrap">
      <div className="shap-header">
        <div>
          <div className="shap-title">Event {alert.event_id}</div>
          <div className="shap-sub">User {alert.user_id} · {new Date(alert.timestamp).toLocaleString('en-IN')}</div>
        </div>
        <div className="shap-scores">
          <div className="shap-score-box" style={{ borderColor: riskColor(alert.combined_risk_score) }}>
            <div className="shap-score-val" style={{ color: riskColor(alert.combined_risk_score) }}>
              {fmt(alert.combined_risk_score)}
            </div>
            <div className="shap-score-lbl">COMBINED RISK</div>
          </div>
          <div className="shap-score-box" style={{ borderColor: '#0a84ff' }}>
            <div className="shap-score-val" style={{ color: '#0a84ff' }}>
              {fmt(txn?.ml_fraud_score)}
            </div>
            <div className="shap-score-lbl">ML SCORE</div>
          </div>
          <div className="shap-score-box" style={{ borderColor: '#bf5af2' }}>
            <div className="shap-score-val" style={{ color: '#bf5af2' }}>
              {fmt(alert.graph_result?.graph_risk_score)}
            </div>
            <div className="shap-score-lbl">GRAPH RISK</div>
          </div>
        </div>
      </div>

      <div className="shap-action" style={{ background: `${actionColor(alert.security_action?.code)}22`, borderColor: actionColor(alert.security_action?.code) }}>
        <span className="shap-action-code" style={{ color: actionColor(alert.security_action?.code) }}>
          ⚡ {alert.security_action?.code?.replace(/_/g, ' ')}
        </span>
        <span className="shap-action-desc">{alert.security_action?.description}</span>
      </div>

      <div className="shap-section-title">SHAP Feature Impact</div>
      <div className="shap-bars">
        {shap.map((s) => (
          <div key={s.feature} className="shap-row">
            <div className="shap-feat">{s.feature}</div>
            <div className="shap-bar-wrap">
              <div className="shap-bar-track">
                <div className="shap-bar-fill"
                  style={{
                    width: `${(Math.abs(s.shap_value) / maxAbs) * 100}%`,
                    background: s.direction === 'increases risk' ? '#ff2d55' : '#30d158',
                    marginLeft: s.direction === 'increases risk' ? '50%' : undefined,
                    marginRight: s.direction === 'reduces risk'  ? '50%' : undefined,
                    float:       s.direction === 'reduces risk'  ? 'right' : 'left',
                  }}
                />
              </div>
            </div>
            <div className="shap-val" style={{ color: s.direction === 'increases risk' ? '#ff2d55' : '#30d158' }}>
              {s.shap_value > 0 ? '+' : ''}{fmt(s.shap_value, 4)}
            </div>
          </div>
        ))}
      </div>

      {modelInfo && (
        <div className="shap-model-info">
          <span>Model: {modelInfo.xgboost?.model_type}</span>
          <span>ROC-AUC: {modelInfo.xgboost?.roc_auc?.toFixed(4)}</span>
          <span>Threshold: {modelInfo.xgboost?.threshold?.toFixed(4)}</span>
          <span>SHAP: {modelInfo.shap?.feature_perturbation}</span>
        </div>
      )}
    </div>
  );
}

// ── Login Heatmap ─────────────────────────────────────────────────────────────
function LoginHeatmap({ data }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-row heatmap-header">
        <div className="heatmap-day-label" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="heatmap-hour-label">{String(h).padStart(2, '0')}</div>
        ))}
      </div>
      {DAYS.map((day, d) => (
        <div key={day} className="heatmap-row">
          <div className="heatmap-day-label">{day}</div>
          {Array.from({ length: 24 }, (_, h) => {
            const cell = data.find(x => x.day === d && x.hour === h);
            const intensity = cell ? cell.count / maxCount : 0;
            const anomaly   = cell?.anomaly || 0;
            const bg = anomaly > 0.6
              ? `rgba(255,45,85,${0.3 + intensity * 0.7})`
              : `rgba(10,132,255,${0.1 + intensity * 0.7})`;
            return (
              <div key={h} className="heatmap-cell" style={{ background: bg }}
                title={`${day} ${h}:00 — ${cell?.count || 0} logins, anomaly: ${fmt(anomaly)}`}>
                {anomaly > 0.6 && <span className="heatmap-alert-dot" />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="heatmap-legend">
        <span style={{color:'#0a84ff'}}>■ Normal Activity</span>
        <span style={{color:'#ff2d55'}}>■ Anomalous Login</span>
        <span style={{color:'#636366'}}>Darker = Higher Volume</span>
      </div>
    </div>
  );
}

// ── Attack Simulation ─────────────────────────────────────────────────────────
function Simulation({ onResult }) {
  const [form, setForm] = useState({
    userId: 'C1013', amount: 322, hour: 10, dayOfWeek: 4, month: 5,
    isWeekend: 0, isNight: 0, amountDiff: -200, timeDiff: 22,
    amountVelocity: 14.68, rollingAvg: 522, rollingStd: 34.94,
    deviation: -200, zScore: -5.72, userTxnCount: 140,
    deviceId: 'D014', employeeId: 'E039',
    timestamp: new Date().toISOString().slice(0, 19),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const derived = {
    userId: form.userId,
    amount: form.amount,
    logAmount: parseFloat(Math.log(form.amount + 1).toFixed(6)),
    hour: form.hour,
    dayOfWeek: form.dayOfWeek,
    month: form.month,
    isWeekend: form.isWeekend,
    isNight: form.isNight,
    amountDiff: form.amountDiff,
    timeDiff: form.timeDiff,
    amountVelocity: form.amountVelocity,
    rollingAvg: form.rollingAvg,
    rollingStd: form.rollingStd,
    deviation: form.deviation,
    zScore: form.zScore,
    userTxnCount: form.userTxnCount,
    timestamp: form.timestamp,
  };

  const handleSubmit = async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.predictEvent({
        transaction: derived,
        deviceId: form.deviceId,
        employeeId: form.employeeId,
      });
      onResult(result);
    } catch (e) {
      // fall back to mock
      const mock = MOCK_ALERTS.find(a => a.combined_risk_score > 0.9) || MOCK_ALERTS[0];
      onResult({ ...mock, user_id: form.userId, timestamp: form.timestamp });
      setError('ML service offline — showing mock result');
    } finally {
      setLoading(false);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="sim-wrap">
      <div className="sim-title">⚡ Attack Simulation</div>
      <div className="sim-desc">Submit a synthetic transaction to test the fraud detection pipeline end-to-end.</div>
      <div className="sim-grid">
        {[
          ['User ID',          'userId',         'text'],
          ['Amount (₹)',       'amount',          'number'],
          ['Hour (0–23)',      'hour',             'number'],
          ['Day of Week',      'dayOfWeek',        'number'],
          ['Month',            'month',            'number'],
          ['Is Night (0/1)',   'isNight',          'number'],
          ['Amount Diff',      'amountDiff',       'number'],
          ['Time Diff (min)',  'timeDiff',         'number'],
          ['Velocity',         'amountVelocity',   'number'],
          ['Rolling Avg',      'rollingAvg',       'number'],
          ['Rolling Std',      'rollingStd',       'number'],
          ['Deviation',        'deviation',        'number'],
          ['Z-Score',          'zScore',           'number'],
          ['Txn Count',        'userTxnCount',     'number'],
          ['Device ID',        'deviceId',         'text'],
          ['Employee ID',      'employeeId',       'text'],
        ].map(([label, key, type]) => (
          <div key={key} className="sim-field">
            <label className="sim-label">{label}</label>
            <input className="sim-input" type={type}
              value={form[key]}
              onChange={e => set(key, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
            />
          </div>
        ))}
      </div>
      {error && <div className="sim-error">{error}</div>}
      <button className="sim-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? 'ANALYSING...' : '▶ RUN FRAUD ANALYSIS'}
      </button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const nowIso = () => new Date().toISOString();
  const [panel,      setPanel]      = useState(0);
  const [alerts,     setAlerts]     = useState(MOCK_ALERTS);
  const alertsRef = useRef(MOCK_ALERTS);
  const [selected,   setSelected]   = useState(MOCK_ALERTS[0]);
  const loginEventsRef = useRef([]);
  const [graphNode,  setGraphNode]  = useState(null);
  const [online,     setOnline]     = useState(false);
  const [modelInfo,  setModelInfo]  = useState(MOCK_MODEL_INFO);
  const [graphNodes, setGraphNodes] = useState(MOCK_GRAPH_NODES);
  const [graphEdges, setGraphEdges] = useState(MOCK_GRAPH_EDGES);
  const [timelineData, setTimelineData] = useState(buildTimeline(MOCK_ALERTS));
  const [heatmapData, setHeatmapData] = useState(buildHeatmap([]));
  const [dataSource, setDataSource] = useState('Generated Live');
  const tickRef = useRef(null);
  const loginTickRef = useRef(null);
  const [panelUpdated, setPanelUpdated] = useState({
    alerts: nowIso(),
    detail: nowIso(),
    timeline: nowIso(),
    graph: nowIso(),
    ai: nowIso(),
    heatmap: null,
    simulate: null,
  });
  const touchPanels = useCallback((keys) => {
    const stamp = nowIso();
    setPanelUpdated((prev) => {
      const next = { ...prev };
      keys.forEach((key) => { next[key] = stamp; });
      return next;
    });
  }, []);

  const refreshDashboardSnapshot = useCallback(async () => {
    const snapshot = await api.dashboardSnapshot();
    const summary = snapshot?.summary || {};
    const hasStoredData = (summary.alerts_stored || 0) + (summary.logins_stored || 0) > 0;
    setDataSource(hasStoredData ? formatSource(snapshot?.source) : 'Warming Up Stored Events');
    if (!hasStoredData) {
      return;
    }

    if (Array.isArray(snapshot.alerts)) {
      setAlerts(snapshot.alerts);
      setSelected((prev) => snapshot.alerts.find((alert) => alert.event_id === prev?.event_id) || snapshot.alerts[0] || prev);
    }
    if (Array.isArray(snapshot.timeline) && snapshot.timeline.length) {
      setTimelineData(snapshot.timeline);
    }
    if (Array.isArray(snapshot.heatmap) && snapshot.heatmap.length) {
      setHeatmapData(snapshot.heatmap);
    }
    if (Array.isArray(snapshot?.graph?.nodes) && snapshot.graph.nodes.length) {
      setGraphNodes(snapshot.graph.nodes);
      setGraphNode((prev) => snapshot.graph.nodes.some((node) => node.id === prev) ? prev : snapshot.graph.nodes[0]?.id || null);
    }
    if (Array.isArray(snapshot?.graph?.edges)) {
      setGraphEdges(snapshot.graph.edges);
    }
    touchPanels(['alerts', 'detail', 'timeline', 'graph', 'heatmap']);
  }, [touchPanels]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // Check ML service health
  const checkHealth = useCallback(async () => {
    try {
      await api.health();
      setOnline(true);
      const [info, graph] = await Promise.all([
        api.modelInfo(),
        api.allGraphRisks(),
      ]);
      setModelInfo(info);
      setGraphNodes((prev) => mergeGraphNodes(prev, graph?.scores || {}));
      await refreshDashboardSnapshot();
      touchPanels(['graph', 'ai']);
    } catch {
      setOnline(false);
    }
  }, [refreshDashboardSnapshot, touchPanels]);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 30000);
    return () => clearInterval(id);
  }, [checkHealth]);

  useEffect(() => {
    const USERS = ['C1013', 'C10005', 'C10014', 'C10019', 'C10033', 'C10037', 'C10191'];

    const pick = (min, max, digits = 2) =>
      parseFloat((Math.random() * (max - min) + min).toFixed(digits));

    const randomLogin = () => {
      const suspicious = Math.random() < 0.35;
      const timestamp = new Date(
        Date.now() - Math.floor(Math.random() * 6 * 24 * 60 * 60 * 1000)
      ).toISOString().slice(0, 19);
      const date = new Date(timestamp);

      return {
        userId: USERS[Math.floor(Math.random() * USERS.length)],
        timestamp,
        hour: date.getHours(),
        dayOfWeek: date.getDay(),
        hourDeviation: suspicious ? pick(4, 10) : pick(0, 2.5),
        timeDiff: suspicious ? pick(1, 45) : pick(120, 4000),
        dormantLogin: suspicious ? (Math.random() < 0.4 ? 1 : 0) : 0,
        loginFreq7d: suspicious ? Math.floor(Math.random() * 4) : Math.floor(Math.random() * 18) + 4,
        distFromHome: suspicious ? pick(80, 1800) : pick(0, 30),
        distance: suspicious ? pick(120, 2200) : pick(0, 40),
        speed: suspicious ? pick(500, 980) : pick(0, 60),
        impossibleTravel: suspicious ? (Math.random() < 0.65 ? 1 : 0) : 0,
        vpn: suspicious ? (Math.random() < 0.6 ? 1 : 0) : 0,
        isNewDevice: suspicious ? (Math.random() < 0.55 ? 1 : 0) : 0,
        cityCode: Math.floor(Math.random() * 40) + 1,
        deviceCode: Math.floor(Math.random() * 25) + 1,
      };
    };

    const pushLogin = async (refreshSnapshot = false) => {
      const login = randomLogin();
      try {
        await api.predictLogin(login);
        if (refreshSnapshot) {
          await refreshDashboardSnapshot();
          touchPanels(['heatmap', 'graph']);
        }
      } catch {
        const next = [
          {
            ...login,
            anomaly_score: login.impossibleTravel || login.vpn || login.isNewDevice
              ? pick(0.62, 0.95, 3)
              : pick(0.05, 0.35, 3),
            is_anomaly: Boolean(login.impossibleTravel || login.vpn || login.isNewDevice),
          },
          ...loginEventsRef.current,
        ].slice(0, 300);
        loginEventsRef.current = next;
        setHeatmapData(buildHeatmap(next));
        touchPanels(['heatmap']);
      }
    };

    Promise.all(Array.from({ length: 24 }, () => pushLogin()))
      .then(() => refreshDashboardSnapshot().catch(() => {}));
    loginTickRef.current = setInterval(() => { pushLogin(true); }, 12000);
    return () => clearInterval(loginTickRef.current);
  }, [refreshDashboardSnapshot, touchPanels]);

  // Live ticker — calls real ML model every 20s with randomised realistic features
  useEffect(() => {
    const USERS = ['C1013', 'C10005', 'C10014', 'C10019', 'C10033', 'C10037', 'C10191'];
    const DEVICES = ['D001', 'D002', 'D006', 'D010', 'D014', 'D021'];
    const EMPLOYEES = ['E011', 'E024', 'E039', 'E052'];

    const pick = (min, max, digits = 2) =>
      parseFloat((Math.random() * (max - min) + min).toFixed(digits));

    const randomTxn = () => {
      const bucket = Math.random();
      const profile = bucket < 0.33 ? 'low' : bucket < 0.66 ? 'mid' : 'high';
      const month = Math.floor(Math.random() * 12) + 1;

      const base = profile === 'low'
        ? {
            amount: pick(260, 365),
            hour: [8, 13, 19, 20, 23][Math.floor(Math.random() * 5)],
            dayOfWeek: [0, 3, 4, 6][Math.floor(Math.random() * 4)],
            rollingStd: pick(34, 78),
            deviation: pick(-650, -220),
            timeDiff: pick(20, 130),
            userTxnCount: Math.floor(Math.random() * 170) + 70,
          }
        : profile === 'mid'
          ? {
              amount: pick(255, 332),
              hour: [1, 10, 16, 22, 23][Math.floor(Math.random() * 5)],
              dayOfWeek: [1, 4, 5, 6][Math.floor(Math.random() * 4)],
              rollingStd: pick(22, 86),
              deviation: pick(-810, -180),
              timeDiff: pick(15, 180),
              userTxnCount: Math.floor(Math.random() * 240) + 20,
            }
          : {
              amount: pick(255, 370),
              hour: [4, 19, 21, 22][Math.floor(Math.random() * 4)],
              dayOfWeek: [1, 3, 5, 6][Math.floor(Math.random() * 4)],
              rollingStd: pick(24, 70),
              deviation: pick(240, 380),
              timeDiff: pick(75, 195),
              userTxnCount: Math.floor(Math.random() * 190) + 40,
            };

      const rollingAvg = parseFloat(Math.max(1, base.amount - base.deviation).toFixed(2));
      const amountVelocity = parseFloat((base.amount / base.timeDiff).toFixed(4));
      const zScore = parseFloat((base.deviation / base.rollingStd).toFixed(4));

      return {
        userId:         USERS[Math.floor(Math.random() * USERS.length)],
        deviceId:       DEVICES[Math.floor(Math.random() * DEVICES.length)],
        employeeId:     Math.random() < 0.55 ? EMPLOYEES[Math.floor(Math.random() * EMPLOYEES.length)] : null,
        timestamp:      new Date().toISOString().slice(0, 19),
        amount:         base.amount,
        logAmount:      parseFloat(Math.log(base.amount + 1).toFixed(6)),
        hour:           base.hour,
        dayOfWeek:      base.dayOfWeek,
        month,
        isWeekend:      (base.dayOfWeek === 0 || base.dayOfWeek === 6) ? 1 : 0,
        isNight:        (base.hour < 6 || base.hour >= 22) ? 1 : 0,
        amountDiff:     base.deviation,
        timeDiff:       base.timeDiff,
        amountVelocity,
        rollingAvg,
        rollingStd:     base.rollingStd,
        deviation:      base.deviation,
        zScore,
        userTxnCount:   base.userTxnCount,
      };
    };

    tickRef.current = setInterval(async () => {
      const txn = randomTxn();
      const { deviceId, employeeId, ...transaction } = txn;
      try {
        // Call real Spring Boot → Python ML pipeline
        const result = await api.predictEvent({ transaction, deviceId, employeeId });
        setAlerts(prev => [result, ...prev].slice(0, 50));
        setSelected(result);
        touchPanels(['alerts', 'detail', 'timeline', 'ai']);
        await refreshDashboardSnapshot();
      } catch {
        // ML offline — generate a locally consistent mock alert
        const mlScore    = parseFloat((Math.random() * 0.9 + 0.05).toFixed(3));
        const graphScore = parseFloat((Math.random() * 0.6 + 0.2).toFixed(3));
        const combined   = parseFloat((0.65 * mlScore + 0.35 * graphScore).toFixed(3));
        const code       = combined >= 0.9 ? 'BLOCK_ALERT_SOC'
                         : combined >= 0.7 ? 'LOCK_ACCOUNT'
                         : combined >= 0.4 ? 'OTP_MFA' : 'ALLOW';
        const base = MOCK_ALERTS[Math.floor(Math.random() * MOCK_ALERTS.length)];
        const fallback = {
          ...base,
          event_id:            'EVT-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
          user_id:             txn.userId,
          timestamp:           new Date().toISOString(),
          combined_risk_score: combined,
          alert_soc:           code === 'BLOCK_ALERT_SOC',
          security_action: {
            code,
            severity: combined >= 0.9 ? 'critical' : combined >= 0.7 ? 'high' : combined >= 0.4 ? 'medium' : 'low',
            description: '',
          },
          transaction_result: {
            ...base.transaction_result,
            ml_fraud_score: mlScore,
            is_fraud: mlScore >= 0.9807,
          },
          graph_result: { graph_risk_score: graphScore, user_in_graph: true },
        };
        setAlerts(prev => [fallback, ...prev].slice(0, 50));
        setTimelineData(buildTimeline([fallback, ...alertsRef.current].slice(0, 50)));
        touchPanels(['alerts', 'detail', 'timeline', 'ai', 'graph']);
      }
    }, 20000);
    return () => clearInterval(tickRef.current);
  }, [refreshDashboardSnapshot, touchPanels]);

  const handleSimResult = (result) => {
    setAlerts(prev => [result, ...prev]);
    touchPanels(['alerts', 'detail', 'timeline', 'ai', 'simulate']);
    setSelected(result);
    setGraphNode(result?.user_id || null);
    refreshDashboardSnapshot().catch(() => {});
    setPanel(2);
  };

  const socAlerts = alerts.filter(a => a.alert_soc);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⬡</span>
            <div>
              <div className="logo-title">SENTINEL</div>
              <div className="logo-sub">AI Banking Security Operations Center</div>
            </div>
          </div>
        </div>
        <div className="header-right">
          {socAlerts.length > 0 && (
            <div className="soc-alert-badge">
              🔴 {socAlerts.length} SOC ALERT{socAlerts.length > 1 ? 'S' : ''}
            </div>
          )}
        </div>
      </header>

      {/* Status bar */}
      <StatusBar online={online} alertCount={alerts.filter(a => a.security_action?.severity !== 'low').length} modelInfo={modelInfo} />

      {/* Nav tabs */}
      <nav className="nav">
        {PANELS.map((p, i) => (
          <button key={p} className={`nav-tab ${panel === i ? 'nav-tab-active' : ''}`}
            onClick={() => setPanel(i)}>
            {p}
            {i === 0 && alerts.length > 0 &&
              <span className="nav-badge">{alerts.length}</span>}
            {i === 5 &&
              <span className="nav-badge nav-badge-red">LIVE</span>}
          </button>
        ))}
      </nav>

      {/* Main grid */}
      <main className="main">
        {/* Left column: always show alert feed summary */}
        <div className="col-left">
          <div className="panel-header">
            <span className="panel-title">LIVE ALERTS</span>
            <span className="panel-sub">{fmtUpdate(panelUpdated.alerts)}</span>
            <span className="panel-count">{alerts.length}</span>
          </div>
          <AlertFeed alerts={alerts.slice(0, 20)} onSelect={(a) => { setSelected(a); touchPanels(['detail', 'ai']); setPanel(0); }} selected={selected} />
        </div>

        {/* Right column: active panel */}
        <div className="col-right">
          {panel === 0 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">ALERT DETAIL</span>
                <span className="panel-sub">{fmtUpdate(panelUpdated.detail)}</span>
              </div>
              <AiExplanation alert={selected} modelInfo={modelInfo} />
            </div>
          )}

          {panel === 1 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">RISK TIMELINE — 24H</span>
              </div>
              <span className="panel-sub">{dataSource}</span>
              <span className="panel-sub">{fmtUpdate(panelUpdated.timeline)}</span>
              <RiskTimeline data={timelineData} />
            </div>
          )}

          {panel === 2 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">FRAUD NETWORK GRAPH</span>
                <span className="panel-sub">{fmtUpdate(panelUpdated.graph)}</span>
                <span className="panel-sub">{dataSource}</span>
                {graphNode && <span className="panel-sub">Selected: {graphNode}</span>}
              </div>
              <FraudGraph
                nodes={graphNodes} edges={graphEdges}
                onNodeClick={setGraphNode} selected={graphNode}
              />
              {graphNode && (
                <div className="graph-detail">
                  <span className="gd-label">NODE</span> {graphNode}
                  <span className="gd-risk" style={{ color: riskColor(graphNodes.find(n => n.id === graphNode)?.risk || 0) }}>
                    RISK {fmt(graphNodes.find(n => n.id === graphNode)?.risk || 0)}
                    {' '}· {riskLabel(graphNodes.find(n => n.id === graphNode)?.risk || 0)}
                  </span>
                </div>
              )}
            </div>
          )}

          {panel === 3 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">AI EXPLANATION (SHAP)</span>
                <span className="panel-sub">{fmtUpdate(panelUpdated.ai)}</span>
              </div>
              <AiExplanation alert={selected} modelInfo={modelInfo} />
            </div>
          )}

          {panel === 4 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">LOGIN ANOMALY HEATMAP</span>
                <span className="panel-sub">{fmtUpdate(panelUpdated.heatmap)}</span>
                <span className="panel-sub">{dataSource}</span>
              </div>
              <LoginHeatmap data={heatmapData} />
            </div>
          )}

          {panel === 5 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">ATTACK SIMULATION</span>
                <span className="panel-sub">{fmtUpdate(panelUpdated.simulate)}</span>
              </div>
              <Simulation onResult={handleSimResult} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
