const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body) opts.body = JSON.stringify(body);
  if (body) opts.headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health:           ()       => request('GET',  '/fraud/health'),
  modelInfo:        ()       => request('GET',  '/fraud/model/info'),
  predictEvent:     (body)   => request('POST', '/fraud/event', body),
  predictTxn:       (body)   => request('POST', '/fraud/predict/transaction', body),
  predictLogin:     (body)   => request('POST', '/fraud/predict/login', body),
  graphRisk:        (uid)    => request('GET',  `/fraud/graph/risk/${uid}`),
  allGraphRisks:    ()       => request('GET',  '/fraud/graph/risk'),
  dashboardSnapshot:()       => request('GET',  '/fraud/dashboard/snapshot'),
  batchPredict:     (list)   => request('POST', '/fraud/batch', list),
};
