import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import {
  MOCK_ALERTS,
  MOCK_GRAPH_NODES,
  MOCK_GRAPH_EDGES,
  MOCK_MODEL_INFO,
} from './MockData.js';
import './App.css';

const graphEdgeColor = (edge) => {
  if (edge?.kind === 'customer_employee') return 'rgba(255,214,10,0.5)';
  if (edge?.kind === 'customer_device' || edge?.kind === 'login_device')
    return 'rgba(191,90,242,0.5)';
  return 'rgba(255,255,255,0.28)';
};

const graphSegmentLabel = (node, edge) => {
  if (edge?.kind === 'customer_employee')
    return 'Customer linked to employee path';
  if (edge?.kind === 'customer_device' || edge?.kind === 'login_device')
    return 'Customer linked to device path';
  if (!node) return 'Unknown path';
  if (node.type === 'employee') return 'Internal employee fraud path';
  if (node.type === 'device') return 'External device fraud path';
  if (node.segment === 'internal') return 'Customer linked to employee path';
  return 'Customer linked to device path';
};

const loginSignals = (login) => {
  const signals = [];
  if (Number(login.isNewDevice)) signals.push('New device detected');
  if (Number(login.vpn)) signals.push('VPN or masked network');
  if (Number(login.impossibleTravel)) signals.push('Impossible travel pattern');
  if (Number(login.dormantLogin)) signals.push('Dormant account reactivated');
  if (Number(login.distFromHome) >= 75) signals.push('Far from home location');
  if (Number(login.hourDeviation) >= 4) signals.push('Odd login hour');
  if (Number(login.speed) >= 500) signals.push('Travel speed unrealistic');
  if (Number(login.timeDiff) <= 0.5) signals.push('Rapid login sequence');
  return signals;
};

const graphNodeLabel = (node) => {
  if (!node) return 'No graph node selected';
  return node.label || graphSegmentLabel(node, null);
};

const graphRelationLabel = (edge) => edge?.label || 'Observed relationship';

const graphPriorityLabel = (edge, index) => {
  if (index === 0) return 'Primary';
  if (index === 1) return 'High relevance';
  return 'Supporting';
};

const graphRelationPriority = (edge) => {
  if (!edge) return 0;
  if (edge.kind === 'customer_employee') return 4;
  if (edge.kind === 'customer_device') return 3;
  if (edge.kind === 'login_device') return 2;
  return 1;
};

const sortGraphEdges = (edges) =>
  [...edges].sort((a, b) => {
    const priorityGap = graphRelationPriority(b) - graphRelationPriority(a);
    if (priorityGap !== 0) return priorityGap;
    return Number(b.weight || 0) - Number(a.weight || 0);
  });

const primaryGraphReason = (node, edges) => {
  if (!node) return 'No node selected';
  const topEdge = sortGraphEdges(edges)[0];
  const nodeRisk = Number(node?.risk || 0);
  if (topEdge?.kind === 'customer_employee') {
    return nodeRisk >= 0.7
      ? 'Primary reason: the customer sits in a high-risk employee-linked network path'
      : 'Primary reason: employee-linked activity is the clearest visible risk signal';
  }
  if (topEdge?.kind === 'customer_device' || topEdge?.kind === 'login_device') {
    return nodeRisk >= 0.7
      ? 'Primary reason: repeated device-linked exposure keeps this node in a high-risk network zone'
      : 'Primary reason: risky device activity is the clearest visible risk signal';
  }
  if (node.type === 'employee')
    return 'Primary reason: employee node is directly implicated';
  if (node.type === 'device')
    return 'Primary reason: device reuse / device risk is elevated';
  return nodeRisk >= 0.7
    ? 'Primary reason: this customer remains high-risk because of cumulative network connections'
    : 'Primary reason: customer risk is elevated in the network';
};

const transactionSignals = (form) => {
  const signals = [];
  if ((form.employeeId || '').trim())
    signals.push('Employee touched this customer');
  if ((form.deviceId || '').trim())
    signals.push(`Device ${form.deviceId} present in graph path`);
  if (Number(form.isNight)) signals.push('After-hours activity');
  if (Math.abs(Number(form.zScore)) >= 3)
    signals.push('Transaction far from normal baseline');
  if (Number(form.amountVelocity) >= 15)
    signals.push('High value movement over short interval');
  if (Number(form.timeDiff) <= 20)
    signals.push('Compressed transaction timing');
  return signals;
};

const formatActionCode = (code) =>
  code ? code.replace(/_/g, ' ') : 'No action';

const loginRiskBand = (score) => {
  if (score >= 0.7) return 'high';
  if (score >= 0.55) return 'suspicious';
  if (score >= 0.4) return 'elevated';
  return 'low';
};

const buildTransactionExplanation = ({ request, response }) => {
  const reasons = [];
  const shap = response?.transaction_result?.shap_explanation || [];
  const topShap = shap
    .filter(
      (item) =>
        item.direction === 'increases risk' && Number(item.shap_value) > 0,
    )
    .slice(0, 3)
    .map(
      (item) => `${item.feature} increased risk (${fmt(item.shap_value, 4)})`,
    );
  const combinedRisk = Number(response?.combined_risk_score || 0);
  const graphRisk = Number(response?.graph_result?.graph_risk_score || 0);
  const internal = Boolean(request?.employeeId);

  if (request?.employeeId && combinedRisk >= 0.4) {
    reasons.push(
      `Employee ${request.employeeId} is linked to customer ${request.userId} in this event path.`,
    );
  }
  if (request?.deviceId && graphRisk >= 0.4) {
    reasons.push(
      `Device ${request.deviceId} was part of the scored graph path for this event.`,
    );
  }
  if (Number(request?.isNight)) {
    reasons.push(
      `The activity happened during an after-hours window at ${String(request?.hour ?? 0).padStart(2, '0')}:00.`,
    );
  }
  if (Math.abs(Number(request?.zScore || 0)) >= 3) {
    reasons.push(
      `The transaction deviated sharply from baseline with z-score ${fmt(request?.zScore || 0, 2)}.`,
    );
  }
  if (Number(request?.amountVelocity || 0) >= 15) {
    reasons.push(
      `Funds moved quickly relative to the prior gap, with velocity ${fmt(request?.amountVelocity || 0, 2)}.`,
    );
  }
  if (topShap.length) {
    reasons.push(`Top model drivers: ${topShap.join('; ')}.`);
  }
  if (combinedRisk >= 0.7) {
    reasons.push(
      `Combined risk reached ${fmt(combinedRisk)} with graph risk ${fmt(graphRisk)}.`,
    );
  }
  if (combinedRisk < 0.4 || reasons.length === 0) {
    return null;
  }
  return {
    severity: response?.security_action?.severity || 'medium',
    title: internal
      ? 'Internal Fraud Explanation'
      : 'Customer Fraud Explanation',
    summary: internal
      ? `Manager escalation created for customer ${request?.userId} because the employee-linked transaction path looks suspicious.`
      : `Customer protection response created for ${request?.userId} because the device-linked transaction path looks suspicious.`,
    target: internal
      ? `Manager for ${request?.employeeId}`
      : `Customer ${request?.userId}`,
    notification: internal
      ? `Manager and SOC notified about employee-linked risk on ${request?.userId}.`
      : `Customer notified about unusual activity on account ${request?.userId}.`,
    action: formatActionCode(response?.security_action?.code),
    reasons,
  };
};

const buildLoginExplanation = ({ request, response }) => {
  const reasons = [];
  const score = Number(response?.anomaly_score || 0);
  const band = loginRiskBand(score);
  if (Number(request?.isNewDevice)) {
    reasons.push(
      `New device detected: D${String(request?.deviceCode ?? 0).padStart(3, '0')}.`,
    );
  }
  if (Number(request?.vpn)) {
    reasons.push('The login came through a VPN or masked network.');
  }
  if (Number(request?.impossibleTravel)) {
    reasons.push(
      `Travel pattern is impossible: ${fmt(request?.distance || 0, 1)} km with implied speed ${fmt(request?.speed || 0, 1)} km/h.`,
    );
  }
  if (Number(request?.distFromHome || 0) >= 75) {
    reasons.push(
      `Login location is ${fmt(request?.distFromHome || 0, 1)} km away from the customer home area.`,
    );
  }
  if (Number(request?.hourDeviation || 0) >= 4) {
    reasons.push(
      `Login hour deviates by ${fmt(request?.hourDeviation || 0, 1)} hours from the user pattern.`,
    );
  }
  if (Number(request?.timeDiff || 0) <= 0.5) {
    reasons.push(
      `The event followed the last login after only ${fmt(request?.timeDiff || 0, 2)} hours.`,
    );
  }
  if (Number(request?.dormantLogin)) {
    reasons.push('The account resumed activity after a dormant period.');
  }
  if (score >= 0.55) {
    reasons.push(`Isolation Forest anomaly score reached ${fmt(score)}.`);
  }
  if (score < 0.4 || reasons.length === 0) {
    return null;
  }
  return {
    severity: band === 'high' ? 'high' : 'medium',
    title:
      band === 'high'
        ? 'Login Anomaly Explanation'
        : 'Suspicious Login Explanation',
    summary: `Customer ${request?.userId} triggered a ${band === 'high' ? 'high-risk' : 'suspicious'} login review because the pattern contains unusual signals.`,
    target: `Customer ${request?.userId}`,
    notification: `Customer ${request?.userId} notified to verify this login attempt.`,
    action:
      band === 'high'
        ? 'Customer verification requested'
        : 'Step-up review recommended',
    reasons,
  };
};

function ExplanationPopup({ popup, onClose }) {
  if (!popup) return null;
  return (
    <div className="explain-overlay" onClick={onClose}>
      <div
        className={`explain-modal explain-modal-${popup.severity || 'medium'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="explain-head">
          <div>
            <div className="explain-kicker">Explainable Response</div>
            <div className="explain-title">{popup.title}</div>
          </div>
          <button className="explain-close" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <div className="explain-summary">{popup.summary}</div>
        <div className="explain-meta-row">
          <span className="explain-pill">Target: {popup.target}</span>
          <span className="explain-pill">Action: {popup.action}</span>
          <span className="explain-pill">
            Notification: {popup.notification}
          </span>
        </div>
        <div className="explain-section-title">Why this happened</div>
        <div className="explain-list">
          {popup.reasons.map((reason) => (
            <div key={reason} className="explain-row">
              {reason}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PANELS = [
  'ALERT FEED',
  'RISK TIMELINE',
  'FRAUD GRAPH',
  'AI EXPLANATION',
  'LOGIN HEATMAP',
  'SIMULATE',
];

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const riskColor = (score) => {
  if (score >= 0.9) return '#ff2d55';
  if (score >= 0.7) return '#ff6b35';
  if (score >= 0.4) return '#ffd60a';
  return '#30d158';
};
const riskLabel = (score) => {
  if (score >= 0.9) return 'CRITICAL';
  if (score >= 0.7) return 'HIGH';
  if (score >= 0.4) return 'MEDIUM';
  return 'LOW';
};
const actionColor = (code) =>
  ({
    BLOCK_ALERT_SOC: '#ff2d55',
    LOCK_ACCOUNT: '#ff6b35',
    OTP_MFA: '#ffd60a',
    ALLOW: '#30d158',
  })[code] || '#8e8e93';

const timeAgo = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const fmt = (n, d = 3) => (typeof n === 'number' ? n.toFixed(d) : '-');

// â”€â”€â”€ sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmtUpdate = (iso) =>
  iso ? `Updated ${timeAgo(iso)}` : 'Waiting for data';
const formatSource = (source) =>
  source === 'stored_session_events'
    ? 'Stored Session Events'
    : source || 'Generated Live';

const buildTimeline = (alerts) => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    events: 0,
    fraud: 0,
    risk: 0,
  }));

  alerts.forEach((alert) => {
    const date = new Date(alert.timestamp);
    const hour = Number.isNaN(date.getTime()) ? 0 : date.getHours();
    const bucket = buckets[hour];
    bucket.events += 1;
    if (
      (alert.transaction_result?.ml_fraud_score ?? 0) >= 0.5 ||
      alert.alert_soc
    ) {
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
    Array.from({ length: 24 }, (_, hour) => ({
      day,
      hour,
      count: 0,
      anomaly: 0,
    })),
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
        <span className="status-text">
          ML SERVICE {online ? 'ONLINE' : 'OFFLINE'}
        </span>
        <span className="sep">|</span>
        <span className="status-text">SPRING API</span>
        <span className="sep">|</span>
        <span className="status-text">PYTHON API VIA SPRING</span>
      </div>
      <div className="status-right">
        {modelInfo && (
          <>
            <span className="badge badge-blue">
              XGBoost ROC {modelInfo.xgboost?.roc_auc?.toFixed(4)}
            </span>
            <span className="badge badge-purple">
              PR-AUC {modelInfo.xgboost?.pr_auc?.toFixed(4)}
            </span>
          </>
        )}
        <span className="badge badge-red">{alertCount} ACTIVE ALERTS</span>
        <span className="clock">
          {new Date().toLocaleTimeString('en-IN', { hour12: false })}
        </span>
      </div>
    </div>
  );
}

// â”€â”€ Alert Feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ServiceFlash({ online }) {
  if (online) return null;
  return (
    <div className="service-flash" role="alert" aria-live="assertive">
      ML SERVICE DOWN: live Python fraud scoring is unavailable. Dashboard
      activity may be degraded until the service is restored.
    </div>
  );
}

function AlertFeed({ alerts, onSelect, selected }) {
  return (
    <div className="panel-scroll">
      {alerts.length === 0 && (
        <div className="empty">No alerts yet. Run a simulation.</div>
      )}
      {alerts.map((a) => (
        <div
          key={a.event_id}
          className={`alert-row ${selected?.event_id === a.event_id ? 'alert-row-active' : ''}`}
          onClick={() => onSelect(a)}
        >
          <div className="alert-left">
            <span
              className="alert-dot"
              style={{ background: actionColor(a.security_action?.code) }}
            />
            <div>
              <div className="alert-user">{a.user_id}</div>
              <div className="alert-id">{a.event_id}</div>
            </div>
          </div>
          <div className="alert-right">
            <div
              className="alert-score"
              style={{ color: riskColor(a.combined_risk_score) }}
            >
              {fmt(a.combined_risk_score)}
            </div>
            <div
              className="alert-action"
              style={{ color: actionColor(a.security_action?.code) }}
            >
              {a.security_action?.code?.replace('_', ' ')}
            </div>
            <div className="alert-time">{timeAgo(a.timestamp)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// â”€â”€ Risk Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RiskTimeline({ data }) {
  const totalEvents = data.reduce((s, d) => s + d.events, 0);
  const totalFraud = data.reduce((s, d) => s + d.fraud, 0);
  const avgRisk =
    data.reduce((s, d) => s + d.risk, 0) / Math.max(data.length, 1);
  const peak = data.reduce(
    (best, row) => (row.risk > best.risk ? row : best),
    data[0] || { hour: 0, risk: 0, events: 0 },
  );
  return (
    <div className="timeline-simple">
      <div className="timeline-summary">
        <div className="timeline-card">
          <span className="timeline-card-label">Total Events</span>
          <span className="timeline-card-value">{totalEvents}</span>
        </div>
        <div className="timeline-card">
          <span className="timeline-card-label">Fraud Flags</span>
          <span className="timeline-card-value" style={{ color: '#ff2d55' }}>
            {totalFraud}
          </span>
        </div>
        <div className="timeline-card">
          <span className="timeline-card-label">Avg Risk</span>
          <span
            className="timeline-card-value"
            style={{ color: riskColor(avgRisk) }}
          >
            {fmt(avgRisk)}
          </span>
        </div>
        <div className="timeline-card">
          <span className="timeline-card-label">Highest Hour</span>
          <span className="timeline-card-value">
            {String(peak.hour).padStart(2, '0')}:00
          </span>
        </div>
      </div>
      <div className="timeline-list">
        {data.map((d) => (
          <div key={d.hour} className="timeline-row">
            <div className="timeline-hour">
              {String(d.hour).padStart(2, '0')}:00
            </div>
            <div className="timeline-bar-track">
              <div
                className="timeline-bar-fill"
                style={{
                  width: `${Math.max(6, d.risk * 100)}%`,
                  background: riskColor(d.risk),
                }}
              />
            </div>
            <div className="timeline-meta">{d.events} events</div>
            <div className="timeline-meta">{d.fraud} flagged</div>
            <div
              className="timeline-score"
              style={{ color: riskColor(d.risk) }}
            >
              {fmt(d.risk)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€ Fraud Graph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FraudGraph({ nodes, edges, onNodeClick, selected }) {
  const coords = nodes.length ? nodes : [{ x: 0, y: 0 }];
  const minX = Math.min(...coords.map((n) => n.x));
  const maxX = Math.max(...coords.map((n) => n.x));
  const minY = Math.min(...coords.map((n) => n.y));
  const maxY = Math.max(...coords.map((n) => n.y));
  const padX = 90;
  const padY = 80;
  const viewBoxX = minX - padX;
  const viewBoxY = minY - padY;
  const W = Math.max(520, maxX - minX + padX * 2);
  const H = Math.max(360, maxY - minY + padY * 2);
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="graph-wrap">
      <div className="graph-legend">
        <span>
          <span className="tl-dot" style={{ background: '#0a84ff' }} /> Customer
        </span>
        <span>
          <span className="tl-dot" style={{ background: '#bf5af2' }} /> Device
        </span>
        <span>
          <span className="tl-dot" style={{ background: '#ffd60a' }} /> Employee
        </span>
        <span
          style={{ marginLeft: 'auto', fontSize: '11px', color: '#636366' }}
        >
          Node color = risk level
        </span>
      </div>
      <svg viewBox={`${viewBoxX} ${viewBoxY} ${W} ${H}`} className="graph-svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {edges.map((e, i) => {
          const from = nodeById[e.from],
            to = nodeById[e.to];
          if (!from || !to) return null;
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={graphEdgeColor(e)}
              strokeWidth={e.weight * 2.5}
              strokeDasharray={e.kind === 'customer_employee' ? '0' : '6 4'}
              opacity={Math.max(0.4, e.weight)}
            />
          );
        })}
        {nodes.map((n) => {
          const isSelected = selected === n.id;
          const typeColor =
            n.type === 'device'
              ? '#bf5af2'
              : n.type === 'employee'
                ? '#ffd60a'
                : '#0a84ff';
          const r = n.type === 'device' ? 18 : n.type === 'employee' ? 20 : 22;
          return (
            <g
              key={n.id}
              onClick={() => onNodeClick(n.id)}
              className="graph-node-g"
            >
              {isSelected && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 10}
                  fill="none"
                  stroke={riskColor(n.risk)}
                  strokeWidth={2}
                  opacity={0.5}
                  style={{ filter: 'url(#glow)' }}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={`${riskColor(n.risk)}33`}
                stroke={riskColor(n.risk)}
                strokeWidth={isSelected ? 3 : 1.5}
                style={{ filter: isSelected ? 'url(#glow)' : undefined }}
              />
              <circle cx={n.x} cy={n.y} r={r * 0.4} fill={typeColor} />
              <text
                x={n.x}
                y={n.y + r + 14}
                textAnchor="middle"
                fill="#e5e5ea"
                fontSize="13"
                fontWeight="700"
                fontFamily="'JetBrains Mono', monospace"
              >
                {n.id}
              </text>
              <text
                x={n.x}
                y={n.y - r - 10}
                textAnchor="middle"
                fill={
                  n.type === 'employee'
                    ? '#ffd60a'
                    : n.type === 'device'
                      ? '#bf5af2'
                      : '#636366'
                }
                fontSize="10"
                fontWeight="700"
                fontFamily="'JetBrains Mono', monospace"
              >
                {n.type === 'employee'
                  ? 'INTERNAL'
                  : n.type === 'device'
                    ? 'EXTERNAL'
                    : n.segment === 'internal'
                      ? 'EMP-LINKED'
                      : 'CUSTOMER'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// â”€â”€ AI Explanation (SHAP) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AiExplanation({ alert, modelInfo }) {
  if (!alert)
    return (
      <div className="empty">
        Select an alert from the feed to see AI explanation.
      </div>
    );
  const txn = alert.transaction_result;
  const shap = txn?.shap_explanation || [];
  const maxAbs = Math.max(...shap.map((s) => Math.abs(s.shap_value)), 0.001);

  return (
    <div className="shap-wrap">
      <div className="shap-header">
        <div>
          <div className="shap-title">Event {alert.event_id}</div>
          <div className="shap-sub">
            User {alert.user_id} |{' '}
            {new Date(alert.timestamp).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="shap-scores">
          <div
            className="shap-score-box"
            style={{ borderColor: riskColor(alert.combined_risk_score) }}
          >
            <div
              className="shap-score-val"
              style={{ color: riskColor(alert.combined_risk_score) }}
            >
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

      <div
        className="shap-action"
        style={{
          background: `${actionColor(alert.security_action?.code)}22`,
          borderColor: actionColor(alert.security_action?.code),
        }}
      >
        <span
          className="shap-action-code"
          style={{ color: actionColor(alert.security_action?.code) }}
        >
          ACTION: {alert.security_action?.code?.replace(/_/g, ' ')}
        </span>
        <span className="shap-action-desc">
          {alert.security_action?.description}
        </span>
      </div>

      <div className="shap-section-title">SHAP Feature Impact</div>
      <div className="shap-bars">
        {shap.map((s) => (
          <div key={s.feature} className="shap-row">
            <div className="shap-feat">{s.feature}</div>
            <div className="shap-bar-wrap">
              <div className="shap-bar-track">
                <div
                  className="shap-bar-fill"
                  style={{
                    width: `${(Math.abs(s.shap_value) / maxAbs) * 100}%`,
                    background:
                      s.direction === 'increases risk' ? '#ff2d55' : '#30d158',
                    marginLeft:
                      s.direction === 'increases risk' ? '50%' : undefined,
                    marginRight:
                      s.direction === 'reduces risk' ? '50%' : undefined,
                    float: s.direction === 'reduces risk' ? 'right' : 'left',
                  }}
                />
              </div>
            </div>
            <div
              className="shap-val"
              style={{
                color: s.direction === 'increases risk' ? '#ff2d55' : '#30d158',
              }}
            >
              {s.shap_value > 0 ? '+' : ''}
              {fmt(s.shap_value, 4)}
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

// â”€â”€ Login Heatmap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LoginHeatmap({ data }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-row heatmap-header">
        <div className="heatmap-day-label" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="heatmap-hour-label">
            {String(h).padStart(2, '0')}
          </div>
        ))}
      </div>
      {DAYS.map((day, d) => (
        <div key={day} className="heatmap-row">
          <div className="heatmap-day-label">{day}</div>
          {Array.from({ length: 24 }, (_, h) => {
            const cell = data.find((x) => x.day === d && x.hour === h);
            const intensity = cell ? cell.count / maxCount : 0;
            const anomaly = cell?.anomaly || 0;
            const bg =
              anomaly > 0.6
                ? `rgba(255,45,85,${0.3 + intensity * 0.7})`
                : `rgba(10,132,255,${0.1 + intensity * 0.7})`;
            return (
              <div
                key={h}
                className="heatmap-cell"
                style={{ background: bg }}
                title={`${day} ${h}:00 - ${cell?.count || 0} logins, anomaly: ${fmt(anomaly)}`}
              >
                {anomaly > 0.6 && <span className="heatmap-alert-dot" />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="heatmap-legend">
        <span style={{ color: '#0a84ff' }}>Normal Activity</span>
        <span style={{ color: '#ff2d55' }}>Anomalous Login</span>
        <span style={{ color: '#636366' }}>Darker = Higher Volume</span>
      </div>
    </div>
  );
}

// â”€â”€ Attack Simulation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// eslint-disable-next-line no-unused-vars
function Simulation({ onResult }) {
  const [form, setForm] = useState({
    userId: 'C1013',
    amount: 322,
    hour: 10,
    dayOfWeek: 4,
    month: 5,
    isWeekend: 0,
    isNight: 0,
    amountDiff: -200,
    timeDiff: 22,
    amountVelocity: 14.68,
    rollingAvg: 522,
    rollingStd: 34.94,
    deviation: -200,
    zScore: -5.72,
    userTxnCount: 140,
    deviceId: 'D014',
    employeeId: 'E039',
    timestamp: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    setLoading(true);
    setError(null);
    try {
      const result = await api.predictEvent({
        transaction: derived,
        deviceId: form.deviceId,
        employeeId: form.employeeId,
      });
      onResult(result);
    } catch (e) {
      // fall back to mock
      const mock =
        MOCK_ALERTS.find((a) => a.combined_risk_score > 0.9) || MOCK_ALERTS[0];
      onResult({ ...mock, user_id: form.userId, timestamp: form.timestamp });
      setError('ML service offline - showing mock result');
    } finally {
      setLoading(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="sim-wrap">
      <div className="sim-title">Attack Simulation</div>
      <div className="sim-desc">
        Submit a synthetic transaction to test the fraud detection pipeline
        end-to-end.
      </div>
      <div className="sim-grid">
        {[
          ['User ID', 'userId', 'text'],
          ['Amount (INR)', 'amount', 'number'],
          ['Hour (0-23)', 'hour', 'number'],
          ['Day of Week', 'dayOfWeek', 'number'],
          ['Month', 'month', 'number'],
          ['Is Night (0/1)', 'isNight', 'number'],
          ['Amount Diff', 'amountDiff', 'number'],
          ['Time Diff (min)', 'timeDiff', 'number'],
          ['Velocity', 'amountVelocity', 'number'],
          ['Rolling Avg', 'rollingAvg', 'number'],
          ['Rolling Std', 'rollingStd', 'number'],
          ['Deviation', 'deviation', 'number'],
          ['Z-Score', 'zScore', 'number'],
          ['Txn Count', 'userTxnCount', 'number'],
          ['Device ID', 'deviceId', 'text'],
          ['Employee ID', 'employeeId', 'text'],
        ].map(([label, key, type]) => (
          <div key={key} className="sim-field">
            <label className="sim-label">{label}</label>
            <input
              className="sim-input"
              type={type}
              value={form[key]}
              onChange={(e) =>
                set(
                  key,
                  type === 'number'
                    ? parseFloat(e.target.value) || 0
                    : e.target.value,
                )
              }
            />
          </div>
        ))}
      </div>
      {error && <div className="sim-error">{error}</div>}
      <button className="sim-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? 'ANALYSING...' : 'RUN FRAUD ANALYSIS'}
      </button>
    </div>
  );
}

// â”€â”€â”€ Main App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ScenarioSimulation({ onTxnResult, onLoginResult }) {
  const txnPresets = {
    clean_allow_customer: {
      userId: 'C10715',
      amount: 88,
      hour: 11,
      dayOfWeek: 2,
      month: 4,
      isWeekend: 0,
      isNight: 0,
      amountDiff: -8,
      timeDiff: 420,
      amountVelocity: 0.21,
      rollingAvg: 96,
      rollingStd: 16,
      deviation: -8,
      zScore: -0.5,
      userTxnCount: 280,
      deviceId: '',
      employeeId: '',
      timestamp: new Date().toISOString(),
    },
    graph_watch_customer: {
      userId: 'C10033',
      amount: 92,
      hour: 11,
      dayOfWeek: 2,
      month: 4,
      isWeekend: 0,
      isNight: 0,
      amountDiff: -12,
      timeDiff: 360,
      amountVelocity: 0.26,
      rollingAvg: 104,
      rollingStd: 18,
      deviation: -12,
      zScore: -0.67,
      userTxnCount: 260,
      deviceId: '',
      employeeId: '',
      timestamp: new Date().toISOString(),
    },
    external_device_ring: {
      userId: 'C1013',
      amount: 322,
      hour: 10,
      dayOfWeek: 4,
      month: 5,
      isWeekend: 0,
      isNight: 0,
      amountDiff: -200,
      timeDiff: 22,
      amountVelocity: 14.68,
      rollingAvg: 522,
      rollingStd: 34.94,
      deviation: -200,
      zScore: -5.72,
      userTxnCount: 140,
      deviceId: 'D014',
      employeeId: '',
      timestamp: new Date().toISOString(),
    },
    internal_employee_abuse: {
      userId: 'C10014',
      amount: 348,
      hour: 23,
      dayOfWeek: 5,
      month: 6,
      isWeekend: 1,
      isNight: 1,
      amountDiff: 275,
      timeDiff: 12,
      amountVelocity: 29.0,
      rollingAvg: 73,
      rollingStd: 41.5,
      deviation: 275,
      zScore: 6.62,
      userTxnCount: 26,
      deviceId: 'D001',
      employeeId: 'E049',
      timestamp: new Date().toISOString(),
    },
  };
  const loginPresets = {
    trusted_office_login: {
      userId: 'C1013',
      timestamp: new Date().toISOString(),
      hour: 10,
      dayOfWeek: 2,
      hourDeviation: 0.8,
      timeDiff: 7,
      dormantLogin: 0,
      loginFreq7d: 11,
      distFromHome: 6,
      distance: 8,
      speed: 12,
      impossibleTravel: 0,
      vpn: 0,
      isNewDevice: 0,
      cityCode: 12,
      deviceCode: 6,
    },
    vpn_new_device: {
      userId: 'C1013',
      timestamp: new Date().toISOString(),
      hour: 2,
      dayOfWeek: 6,
      hourDeviation: 7.2,
      timeDiff: 0.47,
      dormantLogin: 0,
      loginFreq7d: 2,
      distFromHome: 920,
      distance: 1180,
      speed: 640,
      impossibleTravel: 1,
      vpn: 1,
      isNewDevice: 1,
      cityCode: 31,
      deviceCode: 18,
    },
    impossible_travel: {
      userId: 'C10005',
      timestamp: new Date().toISOString(),
      hour: 1,
      dayOfWeek: 0,
      hourDeviation: 8.4,
      timeDiff: 0.27,
      dormantLogin: 1,
      loginFreq7d: 1,
      distFromHome: 1450,
      distance: 1820,
      speed: 910,
      impossibleTravel: 1,
      vpn: 0,
      isNewDevice: 1,
      cityCode: 36,
      deviceCode: 21,
    },
    far_from_home: {
      userId: 'C10037',
      timestamp: new Date().toISOString(),
      hour: 22,
      dayOfWeek: 4,
      hourDeviation: 5.1,
      timeDiff: 1.42,
      dormantLogin: 0,
      loginFreq7d: 3,
      distFromHome: 620,
      distance: 140,
      speed: 92,
      impossibleTravel: 0,
      vpn: 0,
      isNewDevice: 1,
      cityCode: 29,
      deviceCode: 17,
    },
  };

  const [mode, setMode] = useState('transaction');
  const [txnForm, setTxnForm] = useState(txnPresets.external_device_ring);
  const [loginForm, setLoginForm] = useState(loginPresets.vpn_new_device);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txnResult, setTxnResult] = useState(null);
  const [loginResult, setLoginResult] = useState(null);
  const currentTxnSignals = transactionSignals(txnForm);

  const derivedTxn = {
    userId: txnForm.userId,
    amount: txnForm.amount,
    logAmount: parseFloat(Math.log(txnForm.amount + 1).toFixed(6)),
    hour: txnForm.hour,
    dayOfWeek: txnForm.dayOfWeek,
    month: txnForm.month,
    isWeekend: txnForm.isWeekend,
    isNight: txnForm.isNight,
    amountDiff: txnForm.amountDiff,
    timeDiff: txnForm.timeDiff,
    amountVelocity: txnForm.amountVelocity,
    rollingAvg: txnForm.rollingAvg,
    rollingStd: txnForm.rollingStd,
    deviation: txnForm.deviation,
    zScore: txnForm.zScore,
    userTxnCount: txnForm.userTxnCount,
    timestamp: txnForm.timestamp,
  };

  const setTxn = (k, v) => setTxnForm((f) => ({ ...f, [k]: v }));
  const setLogin = (k, v) => setLoginForm((f) => ({ ...f, [k]: v }));
  const applyTxnPreset = (name) =>
    setTxnForm({ ...txnPresets[name], timestamp: new Date().toISOString() });
  const applyLoginPreset = (name) =>
    setLoginForm({
      ...loginPresets[name],
      timestamp: new Date().toISOString(),
    });

  const submitTransaction = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.predictEvent({
        transaction: derivedTxn,
        deviceId: txnForm.deviceId || null,
        employeeId: txnForm.employeeId || null,
      });
      setTxnResult(result);
      onTxnResult({ request: txnForm, response: result });
    } catch {
      const mock =
        MOCK_ALERTS.find((a) => a.combined_risk_score > 0.9) || MOCK_ALERTS[0];
      const fallback = {
        ...mock,
        user_id: txnForm.userId,
        timestamp: txnForm.timestamp,
      };
      setTxnResult(fallback);
      onTxnResult({ request: txnForm, response: fallback });
      setError('ML service offline - showing mock transaction result');
    } finally {
      setLoading(false);
    }
  };

  const submitLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.predictLogin(loginForm);
      const payload = { request: loginForm, response: result };
      setLoginResult(payload);
      onLoginResult(payload);
    } catch {
      const score = Number(
        loginForm.impossibleTravel || loginForm.vpn || loginForm.isNewDevice,
      )
        ? 0.84
        : 0.18;
      const payload = {
        request: loginForm,
        response: { anomaly_score: score, is_anomaly: score >= 0.6 },
      };
      setLoginResult(payload);
      onLoginResult(payload);
      setError('ML service offline - showing mock login anomaly result');
    } finally {
      setLoading(false);
    }
  };

  const currentLoginSignals = loginSignals(loginForm);

  return (
    <div className="sim-wrap">
      <div className="sim-title">Scenario Simulator</div>
      <div className="sim-desc">
        Run a manual transaction fraud case or a manual login anomaly case while
        the background stream keeps the dashboard moving.
      </div>
      <div className="sim-mode-tabs">
        <button
          className={`sim-mode-tab ${mode === 'transaction' ? 'sim-mode-tab-active' : ''}`}
          onClick={() => setMode('transaction')}
        >
          Transaction Fraud
        </button>
        <button
          className={`sim-mode-tab ${mode === 'login' ? 'sim-mode-tab-active' : ''}`}
          onClick={() => setMode('login')}
        >
          Login Anomaly
        </button>
      </div>

      {mode === 'transaction' && (
        <>
          <div className="sim-preset-row">
            <button
              className="sim-chip"
              onClick={() => applyTxnPreset('clean_allow_customer')}
            >
              Clean allow customer
            </button>
            <button
              className="sim-chip"
              onClick={() => applyTxnPreset('graph_watch_customer')}
            >
              Graph-watch customer
            </button>
            <button
              className="sim-chip"
              onClick={() => applyTxnPreset('external_device_ring')}
            >
              External device ring
            </button>
            <button
              className="sim-chip"
              onClick={() => applyTxnPreset('internal_employee_abuse')}
            >
              Internal employee abuse
            </button>
          </div>
          <div className="sim-desc">
            Use this for the XGBoost transaction model plus the graph path. The
            graph score comes from the selected customer user ID, so changing
            the customer changes the precomputed graph risk profile too.
          </div>
          <div className="sim-grid">
            {[
              ['User ID', 'userId', 'text'],
              ['Amount (INR)', 'amount', 'number'],
              ['Hour (0-23)', 'hour', 'number'],
              ['Day of Week', 'dayOfWeek', 'number'],
              ['Month', 'month', 'number'],
              ['Is Night (0/1)', 'isNight', 'number'],
              ['Amount Diff', 'amountDiff', 'number'],
              ['Time Diff (hours)', 'timeDiff', 'number'],
              ['Velocity', 'amountVelocity', 'number'],
              ['Rolling Avg', 'rollingAvg', 'number'],
              ['Rolling Std', 'rollingStd', 'number'],
              ['Deviation', 'deviation', 'number'],
              ['Z-Score', 'zScore', 'number'],
              ['Txn Count', 'userTxnCount', 'number'],
              ['Device ID', 'deviceId', 'text'],
              ['Employee ID', 'employeeId', 'text'],
            ].map(([label, key, type]) => (
              <div key={key} className="sim-field">
                <label className="sim-label">{label}</label>
                <input
                  className="sim-input"
                  type={type}
                  value={txnForm[key]}
                  onChange={(e) =>
                    setTxn(
                      key,
                      type === 'number'
                        ? parseFloat(e.target.value) || 0
                        : e.target.value,
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="sim-signal-box">
            <div className="sim-signal-title">
              Current Graph / Transaction Signals
            </div>
            <div className="sim-signal-list">
              {(currentTxnSignals.length
                ? currentTxnSignals
                : ['Low-friction customer payment path']
              ).map((signal) => (
                <span key={signal} className="sim-chip sim-chip-ghost">
                  {signal}
                </span>
              ))}
              <span className="sim-chip sim-chip-ghost">
                Graph profile seeded by customer {txnForm.userId}
              </span>
            </div>
          </div>
          {txnResult && (
            <div className="sim-result-card">
              <div className="sim-result-head">
                <span>Latest Transaction Result</span>
                <span
                  style={{
                    color: riskColor(txnResult.combined_risk_score || 0),
                  }}
                >
                  {fmt(txnResult.combined_risk_score || 0)}
                </span>
              </div>
              <div className="sim-result-meta">
                <span>
                  {txnResult.security_action?.code?.replace(/_/g, ' ') ||
                    'No action'}
                </span>
                <span>
                  ML {fmt(txnResult.transaction_result?.ml_fraud_score || 0)}
                </span>
                <span>
                  Graph {fmt(txnResult.graph_result?.graph_risk_score || 0)}
                </span>
                <span>
                  {txnForm.employeeId
                    ? 'Internal employee path'
                    : 'External customer/device path'}
                </span>
              </div>
            </div>
          )}
          {error && <div className="sim-error">{error}</div>}
          <button
            className="sim-btn"
            onClick={submitTransaction}
            disabled={loading}
          >
            {loading ? 'ANALYSING...' : 'RUN TRANSACTION FRAUD'}
          </button>
        </>
      )}

      {mode === 'login' && (
        <>
          <div className="sim-preset-row">
            <button
              className="sim-chip"
              onClick={() => applyLoginPreset('trusted_office_login')}
            >
              Trusted office
            </button>
            <button
              className="sim-chip"
              onClick={() => applyLoginPreset('vpn_new_device')}
            >
              VPN + new device
            </button>
            <button
              className="sim-chip"
              onClick={() => applyLoginPreset('impossible_travel')}
            >
              Impossible travel
            </button>
            <button
              className="sim-chip"
              onClick={() => applyLoginPreset('far_from_home')}
            >
              Far from home
            </button>
          </div>
          <div className="sim-desc">
            Use this visible login form for the Isolation Forest model so you
            can show exactly which login inputs create an anomaly.
          </div>
          <div className="sim-grid">
            {[
              ['User ID', 'userId', 'text'],
              ['Hour (0-23)', 'hour', 'number'],
              ['Day of Week', 'dayOfWeek', 'number'],
              ['Hour Deviation', 'hourDeviation', 'number'],
              ['Time Diff (hours)', 'timeDiff', 'number'],
              ['Dormant Login (0/1)', 'dormantLogin', 'number'],
              ['Login Freq 7d', 'loginFreq7d', 'number'],
              ['Dist From Home', 'distFromHome', 'number'],
              ['Distance', 'distance', 'number'],
              ['Speed', 'speed', 'number'],
              ['Impossible Travel (0/1)', 'impossibleTravel', 'number'],
              ['VPN (0/1)', 'vpn', 'number'],
              ['New Device (0/1)', 'isNewDevice', 'number'],
              ['City Code', 'cityCode', 'number'],
              ['Device Code', 'deviceCode', 'number'],
            ].map(([label, key, type]) => (
              <div key={key} className="sim-field">
                <label className="sim-label">{label}</label>
                <input
                  className="sim-input"
                  type={type}
                  value={loginForm[key]}
                  onChange={(e) =>
                    setLogin(
                      key,
                      type === 'number'
                        ? parseFloat(e.target.value) || 0
                        : e.target.value,
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="sim-signal-box">
            <div className="sim-signal-title">Current Login Signals</div>
            <div className="sim-signal-list">
              {(currentLoginSignals.length
                ? currentLoginSignals
                : ['No obvious rule-based red flags']
              ).map((signal) => (
                <span key={signal} className="sim-chip sim-chip-ghost">
                  {signal}
                </span>
              ))}
            </div>
          </div>
          {loginResult && (
            <div className="sim-result-card">
              <div className="sim-result-head">
                <span>Latest Login Result</span>
                <span
                  style={{
                    color: riskColor(loginResult.response?.anomaly_score || 0),
                  }}
                >
                  {fmt(loginResult.response?.anomaly_score || 0)}
                </span>
              </div>
              <div className="sim-result-meta">
                <span>
                  {loginResult.response?.is_anomaly
                    ? 'Anomalous login'
                    : 'Looks normal'}
                </span>
                <span>User {loginResult.request?.userId}</span>
                <span>
                  Device D
                  {String(loginResult.request?.deviceCode ?? 0).padStart(
                    3,
                    '0',
                  )}
                </span>
                <span>
                  {loginResult.response?.is_anomaly
                    ? 'Model flagged anomaly'
                    : currentLoginSignals.length
                      ? currentLoginSignals[0]
                      : 'Model sees low-risk behavior'}
                </span>
              </div>
            </div>
          )}
          {error && <div className="sim-error">{error}</div>}
          <button className="sim-btn" onClick={submitLogin} disabled={loading}>
            {loading ? 'ANALYSING...' : 'RUN LOGIN ANOMALY'}
          </button>
        </>
      )}
    </div>
  );
}

export default function App() {
  const nowIso = () => new Date().toISOString();
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('safenet-theme') || 'light';
  });
  const [panel, setPanel] = useState(0);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const alertsRef = useRef(MOCK_ALERTS);
  const [selected, setSelected] = useState(MOCK_ALERTS[0]);
  const loginEventsRef = useRef([]);
  const [graphNode, setGraphNode] = useState(null);
  const [online, setOnline] = useState(false);
  const [modelInfo, setModelInfo] = useState(MOCK_MODEL_INFO);
  const [graphNodes, setGraphNodes] = useState(MOCK_GRAPH_NODES);
  const [graphEdges, setGraphEdges] = useState(MOCK_GRAPH_EDGES);
  const [graphMeta, setGraphMeta] = useState({
    segments: null,
    generated_from: null,
  });
  const [timelineData, setTimelineData] = useState(buildTimeline(MOCK_ALERTS));
  const [heatmapData, setHeatmapData] = useState(buildHeatmap([]));
  const [dataSource, setDataSource] = useState('Generated Live');
  const [explanationPopup, setExplanationPopup] = useState(null);
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
      keys.forEach((key) => {
        next[key] = stamp;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('safenet-theme', theme);
  }, [theme]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const refreshDashboardSnapshot = useCallback(async () => {
    const snapshot = await api.dashboardSnapshot();
    const summary = snapshot?.summary || {};
    const hasStoredData =
      (summary.alerts_stored || 0) + (summary.logins_stored || 0) > 0;
    setDataSource(
      hasStoredData
        ? formatSource(snapshot?.source)
        : 'Warming Up Stored Events',
    );
    if (!hasStoredData) {
      return;
    }

    if (Array.isArray(snapshot.alerts)) {
      setAlerts(snapshot.alerts);
      setSelected(
        (prev) =>
          snapshot.alerts.find((alert) => alert.event_id === prev?.event_id) ||
          snapshot.alerts[0] ||
          prev,
      );
    }
    if (Array.isArray(snapshot.timeline) && snapshot.timeline.length) {
      setTimelineData(snapshot.timeline);
    }
    if (Array.isArray(snapshot.heatmap) && snapshot.heatmap.length) {
      setHeatmapData(snapshot.heatmap);
    }
    if (Array.isArray(snapshot?.graph?.nodes) && snapshot.graph.nodes.length) {
      setGraphNodes(snapshot.graph.nodes);
      setGraphNode((prev) =>
        snapshot.graph.nodes.some((node) => node.id === prev)
          ? prev
          : snapshot.graph.nodes[0]?.id || null,
      );
    }
    if (Array.isArray(snapshot?.graph?.edges)) {
      setGraphEdges(snapshot.graph.edges);
    }
    setGraphMeta({
      segments: snapshot?.graph?.segments || null,
      generated_from: snapshot?.graph?.generated_from || null,
    });
    touchPanels(['alerts', 'detail', 'timeline', 'graph', 'heatmap']);
  }, [touchPanels]);

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
    const USERS = [
      'C1013',
      'C10005',
      'C10014',
      'C10019',
      'C10033',
      'C10037',
      'C10191',
    ];

    const pick = (min, max, digits = 2) =>
      parseFloat((Math.random() * (max - min) + min).toFixed(digits));

    const randomLogin = () => {
      const suspicious = Math.random() < 0.35;
      const timestamp = new Date(
        Date.now() - Math.floor(Math.random() * 6 * 24 * 60 * 60 * 1000),
      ).toISOString();
      const date = new Date(timestamp);

      return {
        userId: USERS[Math.floor(Math.random() * USERS.length)],
        timestamp,
        hour: date.getHours(),
        dayOfWeek: date.getDay(),
        hourDeviation: suspicious ? pick(4, 10) : pick(0, 2.5),
        timeDiff: suspicious ? pick(1, 45) : pick(120, 4000),
        dormantLogin: suspicious ? (Math.random() < 0.4 ? 1 : 0) : 0,
        loginFreq7d: suspicious
          ? Math.floor(Math.random() * 4)
          : Math.floor(Math.random() * 18) + 4,
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
            anomaly_score:
              login.impossibleTravel || login.vpn || login.isNewDevice
                ? pick(0.62, 0.95, 3)
                : pick(0.05, 0.35, 3),
            is_anomaly: Boolean(
              login.impossibleTravel || login.vpn || login.isNewDevice,
            ),
          },
          ...loginEventsRef.current,
        ].slice(0, 300);
        loginEventsRef.current = next;
        setHeatmapData(buildHeatmap(next));
        touchPanels(['heatmap']);
      }
    };

    Promise.all(Array.from({ length: 24 }, () => pushLogin())).then(() =>
      refreshDashboardSnapshot().catch(() => {}),
    );
    loginTickRef.current = setInterval(() => {
      pushLogin(true);
    }, 12000);
    return () => clearInterval(loginTickRef.current);
  }, [refreshDashboardSnapshot, touchPanels]);

  // Live ticker â€” calls real ML model every 20s with randomised realistic features
  useEffect(() => {
    const USERS = [
      'C1013',
      'C10005',
      'C10014',
      'C10019',
      'C10033',
      'C10037',
      'C10191',
    ];
    const DEVICES = ['D001', 'D002', 'D006', 'D010', 'D014', 'D021'];
    const EMPLOYEES = ['E011', 'E024', 'E039', 'E052'];

    const pick = (min, max, digits = 2) =>
      parseFloat((Math.random() * (max - min) + min).toFixed(digits));

    const randomTxn = () => {
      const bucket = Math.random();
      const profile = bucket < 0.33 ? 'low' : bucket < 0.66 ? 'mid' : 'high';
      const month = Math.floor(Math.random() * 12) + 1;

      const base =
        profile === 'low'
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

      const rollingAvg = parseFloat(
        Math.max(1, base.amount - base.deviation).toFixed(2),
      );
      const amountVelocity = parseFloat(
        (base.amount / base.timeDiff).toFixed(4),
      );
      const zScore = parseFloat((base.deviation / base.rollingStd).toFixed(4));

      return {
        userId: USERS[Math.floor(Math.random() * USERS.length)],
        deviceId: DEVICES[Math.floor(Math.random() * DEVICES.length)],
        employeeId:
          Math.random() < 0.55
            ? EMPLOYEES[Math.floor(Math.random() * EMPLOYEES.length)]
            : null,
        timestamp: new Date().toISOString(),
        amount: base.amount,
        logAmount: parseFloat(Math.log(base.amount + 1).toFixed(6)),
        hour: base.hour,
        dayOfWeek: base.dayOfWeek,
        month,
        isWeekend: base.dayOfWeek === 0 || base.dayOfWeek === 6 ? 1 : 0,
        isNight: base.hour < 6 || base.hour >= 22 ? 1 : 0,
        amountDiff: base.deviation,
        timeDiff: base.timeDiff,
        amountVelocity,
        rollingAvg,
        rollingStd: base.rollingStd,
        deviation: base.deviation,
        zScore,
        userTxnCount: base.userTxnCount,
      };
    };

    tickRef.current = setInterval(async () => {
      const txn = randomTxn();
      const { deviceId, employeeId, ...transaction } = txn;
      try {
        // Call real Spring Boot â†’ Python ML pipeline
        const result = await api.predictEvent({
          transaction,
          deviceId,
          employeeId,
        });
        setAlerts((prev) => [result, ...prev].slice(0, 50));
        setSelected(result);
        touchPanels(['alerts', 'detail', 'timeline', 'ai']);
        await refreshDashboardSnapshot();
      } catch {
        // ML offline â€” generate a locally consistent mock alert
        const mlScore = parseFloat((Math.random() * 0.9 + 0.05).toFixed(3));
        const graphScore = parseFloat((Math.random() * 0.6 + 0.2).toFixed(3));
        const combined = parseFloat(
          (0.65 * mlScore + 0.35 * graphScore).toFixed(3),
        );
        const code =
          combined >= 0.9
            ? 'BLOCK_ALERT_SOC'
            : combined >= 0.7
              ? 'LOCK_ACCOUNT'
              : combined >= 0.4
                ? 'OTP_MFA'
                : 'ALLOW';
        const base =
          MOCK_ALERTS[Math.floor(Math.random() * MOCK_ALERTS.length)];
        const fallback = {
          ...base,
          event_id:
            'EVT-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
          user_id: txn.userId,
          timestamp: new Date().toISOString(),
          combined_risk_score: combined,
          alert_soc: code === 'BLOCK_ALERT_SOC',
          security_action: {
            code,
            severity:
              combined >= 0.9
                ? 'critical'
                : combined >= 0.7
                  ? 'high'
                  : combined >= 0.4
                    ? 'medium'
                    : 'low',
            description: '',
          },
          transaction_result: {
            ...base.transaction_result,
            ml_fraud_score: mlScore,
            is_fraud: mlScore >= 0.9807,
          },
          graph_result: { graph_risk_score: graphScore, user_in_graph: true },
        };
        setAlerts((prev) => [fallback, ...prev].slice(0, 50));
        setTimelineData(
          buildTimeline([fallback, ...alertsRef.current].slice(0, 50)),
        );
        touchPanels(['alerts', 'detail', 'timeline', 'ai', 'graph']);
      }
    }, 20000);
    return () => clearInterval(tickRef.current);
  }, [refreshDashboardSnapshot, touchPanels]);

  const handleTxnSimResult = ({ request, response }) => {
    setAlerts((prev) => [response, ...prev]);
    touchPanels(['alerts', 'detail', 'timeline', 'ai', 'simulate']);
    setSelected(response);
    const isLowRisk = Number(response?.combined_risk_score || 0) < 0.4;
    setGraphNode(isLowRisk ? null : response?.user_id || null);
    setExplanationPopup(buildTransactionExplanation({ request, response }));
    refreshDashboardSnapshot().catch(() => {});
    setPanel(isLowRisk ? 0 : 2);
  };

  const handleLoginSimResult = ({ request, response }) => {
    const event = {
      ...request,
      anomaly_score: Number(response?.anomaly_score || 0),
      is_anomaly: Boolean(response?.is_anomaly),
    };
    loginEventsRef.current = [event, ...loginEventsRef.current].slice(0, 300);
    setHeatmapData(buildHeatmap(loginEventsRef.current));
    touchPanels(['heatmap', 'graph', 'simulate']);
    setGraphNode(
      Number(response?.anomaly_score || 0) < 0.4
        ? null
        : request?.userId || null,
    );
    setExplanationPopup(buildLoginExplanation({ request, response }));
    refreshDashboardSnapshot().catch(() => {});
  };

  const socAlerts = alerts.filter((a) => a.alert_soc);

  return (
    <div className={`app theme-${theme}`}>
      <ExplanationPopup
        popup={explanationPopup}
        onClose={() => setExplanationPopup(null)}
      />
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">SN</span>
            <div>
              <div className="logo-title">SAFENET</div>
              <div className="logo-sub">
                AI Banking Security Operations Center
              </div>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button
            className="theme-toggle"
            type="button"
            onClick={() =>
              setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
            }
          >
            {theme === 'light' ? 'DARK MODE' : 'LIGHT MODE'}
          </button>
          {socAlerts.length > 0 && (
            <div className="soc-alert-badge">
              {socAlerts.length} SOC ALERT{socAlerts.length > 1 ? 'S' : ''}
            </div>
          )}
        </div>
      </header>

      {/* Status bar */}
      <StatusBar
        online={online}
        alertCount={
          alerts.filter((a) => a.security_action?.severity !== 'low').length
        }
        modelInfo={modelInfo}
      />
      <ServiceFlash online={online} />

      {/* Nav tabs */}
      <nav className="nav">
        {PANELS.map((p, i) => (
          <button
            key={p}
            className={`nav-tab ${panel === i ? 'nav-tab-active' : ''}`}
            onClick={() => setPanel(i)}
          >
            {p}
            {i === 0 && alerts.length > 0 && (
              <span className="nav-badge">{alerts.length}</span>
            )}
            {i === 5 && <span className="nav-badge nav-badge-red">LIVE</span>}
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
          <AlertFeed
            alerts={alerts.slice(0, 20)}
            onSelect={(a) => {
              setSelected(a);
              touchPanels(['detail', 'ai']);
              setPanel(0);
            }}
            selected={selected}
          />
        </div>

        {/* Right column: active panel */}
        <div className="col-right">
          {panel === 0 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">ALERT DETAIL</span>
                <span className="panel-sub">
                  {fmtUpdate(panelUpdated.detail)}
                </span>
              </div>
              <AiExplanation alert={selected} modelInfo={modelInfo} />
            </div>
          )}

          {panel === 1 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">RISK TIMELINE - 24H</span>
              </div>
              <span className="panel-sub">{dataSource}</span>
              <span className="panel-sub">
                {fmtUpdate(panelUpdated.timeline)}
              </span>
              <RiskTimeline data={timelineData} />
            </div>
          )}

          {panel === 2 && (
            <div className="panel-full panel-full-scroll">
              <div className="panel-header">
                <span className="panel-title">FRAUD NETWORK GRAPH</span>
                <span className="panel-sub">
                  {fmtUpdate(panelUpdated.graph)}
                </span>
                <span className="panel-sub">{dataSource}</span>
                {graphNode && (
                  <span className="panel-sub">Selected: {graphNode}</span>
                )}
              </div>
              <div className="graph-summary">
                <div className="graph-summary-card">
                  <span className="graph-summary-label">
                    Internal Employee Links
                  </span>
                  <span
                    className="graph-summary-value"
                    style={{ color: '#ffd60a' }}
                  >
                    {graphMeta.segments?.internal_employee_links ?? 0}
                  </span>
                </div>
                <div className="graph-summary-card">
                  <span className="graph-summary-label">
                    External Device Links
                  </span>
                  <span
                    className="graph-summary-value"
                    style={{ color: '#bf5af2' }}
                  >
                    {graphMeta.segments?.external_device_links ?? 0}
                  </span>
                </div>
                <div className="graph-summary-card">
                  <span className="graph-summary-label">
                    Graph Nodes Rendered
                  </span>
                  <span className="graph-summary-value">
                    {graphNodes.length}
                  </span>
                </div>
                <div className="graph-summary-card">
                  <span className="graph-summary-label">Graph Events Used</span>
                  <span className="graph-summary-value">
                    {(graphMeta.generated_from?.alerts ?? 0) +
                      (graphMeta.generated_from?.logins ?? 0)}
                  </span>
                </div>
              </div>
              <FraudGraph
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={setGraphNode}
                selected={graphNode}
              />
              {graphNode &&
                (() => {
                  const activeNode = graphNodes.find((n) => n.id === graphNode);
                  const connectedEdges = sortGraphEdges(
                    graphEdges.filter(
                      (edge) =>
                        edge.from === graphNode || edge.to === graphNode,
                    ),
                  );
                  const topEdge = connectedEdges[0] || null;
                  return (
                    <>
                      <div className="graph-detail">
                        <span className="gd-label">NODE</span> {graphNode}
                        <span className="gd-meta">
                          {graphNodeLabel(activeNode)}
                        </span>
                        <span
                          className="gd-risk"
                          style={{ color: riskColor(activeNode?.risk || 0) }}
                        >
                          RISK {fmt(activeNode?.risk || 0)} ·{' '}
                          {riskLabel(activeNode?.risk || 0)}
                        </span>
                      </div>
                      <div className="graph-detail graph-detail-secondary">
                        <span className="gd-label">PATH</span>
                        <span className="gd-badge">
                          {graphSegmentLabel(activeNode, topEdge)}
                        </span>
                        <span className="gd-meta">
                          {connectedEdges.length} active links
                        </span>
                      </div>
                      <div className="graph-detail graph-detail-secondary">
                        <span className="gd-label">PRIMARY</span>
                        <span className="gd-primary">
                          {primaryGraphReason(activeNode, connectedEdges)}
                        </span>
                      </div>
                      <div className="graph-rel-list">
                        {connectedEdges.length === 0 && (
                          <div className="empty">
                            No active relationships for this node yet.
                          </div>
                        )}
                        {connectedEdges.slice(0, 4).map((edge, index) => (
                          <div
                            key={`${edge.from}-${edge.to}-${index}`}
                            className="graph-rel-row"
                          >
                            <span className="graph-rel-path">
                              {edge.from} → {edge.to}
                            </span>
                            <span className="graph-rel-kind">
                              {graphRelationLabel(edge)}
                            </span>
                            <span
                              className="graph-rel-score"
                              style={{ color: riskColor(edge.weight || 0) }}
                            >
                              {graphPriorityLabel(edge, index)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
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
                <span className="panel-sub">
                  {fmtUpdate(panelUpdated.heatmap)}
                </span>
                <span className="panel-sub">{dataSource}</span>
              </div>
              <LoginHeatmap data={heatmapData} />
            </div>
          )}

          {panel === 5 && (
            <div className="panel-full">
              <div className="panel-header">
                <span className="panel-title">ATTACK SIMULATION</span>
                <span className="panel-sub">
                  {fmtUpdate(panelUpdated.simulate)}
                </span>
              </div>
              <ScenarioSimulation
                onTxnResult={handleTxnSimResult}
                onLoginResult={handleLoginSimResult}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
