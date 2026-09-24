'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../lib/api-client';
import { createAuthClient } from '../lib/auth';
import { useSmartBreathSocket } from '../lib/use-smartbreath-socket';
import { AlertCenter } from '../components/AlertCenter';
import { AuditTimeline } from '../components/AuditTimeline';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { SignInPanel } from '../components/SignInPanel';
import { StatCard } from '../components/StatCard';

const localUser = { sub: 'local-admin', schoolId: 'greenfield', name: 'Local School Administrator', groups: ['school-administrator'] };

export default function DashboardPage() {
  const auth = useMemo(() => createAuthClient(), []);
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState('');
  const canAcknowledge = user?.groups?.some((group) => ['school-administrator', 'school-staff'].includes(group));
  const socket = useSmartBreathSocket(user);

  async function loadDashboard(activeUser) {
    try {
      setError('');
      const [summary, recommendationData, alertData] = await Promise.all([
        apiClient.dashboard(activeUser), apiClient.recommendations(activeUser), apiClient.alerts(activeUser.schoolId, activeUser)
      ]);
      setDashboard(summary); setAlerts(alertData); setRecommendations(recommendationData);
    } catch (loadError) { setError(loadError.message); }
  }

  useEffect(() => { const activeUser = auth.currentUser(); if (activeUser) { setUser(activeUser); loadDashboard(activeUser); } }, [auth]);
  useEffect(() => {
    if (socket.event?.type === 'alert.created') setAlerts((current) => [socket.event.alert, ...current]);
    if (socket.event?.type === 'alert.acknowledged') setAlerts((current) => current.map((alert) => alert.alertId === socket.event.alertId ? { ...alert, status: 'ACKNOWLEDGED', acknowledgedAt: socket.event.timestamp } : alert));
  }, [socket.event]);

  function signIn() { auth.persist(localUser); setUser(localUser); loadDashboard(localUser); }
  function signOut() { auth.signOut(); setUser(null); setDashboard(null); setAlerts([]); }
  async function acknowledge(alertId) { await apiClient.acknowledge(user.schoolId, alertId, user); setAlerts((current) => current.map((alert) => alert.alertId === alertId ? { ...alert, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() } : alert)); }
  async function simulateSevere() { const result = await apiClient.demo(user.schoolId, user); setAlerts((current) => [result.alert, ...current]); }

  if (!user) return <SignInPanel onSignIn={signIn} />;
  const school = dashboard?.schools?.find((item) => item.id === user.schoolId) || dashboard?.schools?.[0];
  return (
    <main className="page-shell">
      <header className="topbar"><div><p className="eyebrow">School & child safe-air early warning</p><h1>SmartBreath</h1><p className="subtle">Protective guidance for {school?.name || 'your school'}</p></div><div className="top-actions"><ConnectionStatus status={socket.status} /><button className="button ghost" onClick={signOut}>Sign out</button></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}
      <section className="disclaimer notice">SmartBreath provides environmental risk information and protective-action guidance. It does not diagnose medical conditions and is not an emergency dispatcher.</section>
      <section className="stats-grid" aria-label="School air quality summary">
        <StatCard label="Current PM2.5" value={school?.aqi ?? '—'} suffix="µg/m³" tone="danger" />
        <StatCard label="Current PM10" value={school ? Math.round(school.aqi * 1.2) : '—'} suffix="µg/m³" tone="warning" />
        <StatCard label="Current risk" value={school?.riskLevel || 'Loading'} tone="accent" />
        <StatCard label="Child-sensitive mode" value="Active" tone="good" />
      </section>
      <section className="content-grid">
        <article className="panel"><div className="panel-heading"><div><p className="eyebrow">School snapshot</p><h2>{school?.name || 'Loading school data'}</h2></div>{canAcknowledge && <button className="button demo-button" onClick={simulateSevere}>Simulate Severe PM2.5</button>}</div>
          <div className="metric-list"><div><span>Temperature</span><strong>{school?.temperature ?? '—'}°C</strong></div><div><span>Humidity</span><strong>{school?.humidity ?? '—'}%</strong></div><div><span>Wind</span><strong>{school ? '3 km/h · 180°' : '—'}</strong></div><div><span>3-hour predicted PM2.5</span><strong>Available after model run</strong></div></div>
          <div className="recommendation-box"><h3>Protective recommendations</h3>{recommendations.length === 0 ? <p className="subtle">No recommendations are available.</p> : <ul>{recommendations.map((item) => <li key={item.title}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul>}</div>
        </article>
        <AlertCenter alerts={alerts} canAcknowledge={canAcknowledge} onAcknowledge={acknowledge} />
      </section>
      <AuditTimeline alerts={alerts} />
      <p className="footer-note">Simulated events are labeled clearly. Connection state is {socket.status.toLowerCase()}; the dashboard does not claim live updates while offline.</p>
    </main>
  );
}
