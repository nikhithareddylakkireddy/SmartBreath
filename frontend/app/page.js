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
import { EventFeed } from '../components/EventFeed';

const localUser = { sub: 'local-admin', schoolId: 'greenfield', name: 'Local School Administrator', groups: ['school-administrator'] };

export default function DashboardPage() {
  const auth = useMemo(() => createAuthClient(), []);
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [error, setError] = useState('');
  const canAcknowledge = user?.groups?.some((group) => ['school-administrator', 'school-staff'].includes(group));
  const socket = useSmartBreathSocket(user);

  async function loadDashboard(activeUser) {
    try {
      setLoading(true);
      setError('');
      const [summary, recommendationData, alertData, auditData] = await Promise.all([
        apiClient.dashboard(activeUser), apiClient.recommendations(activeUser), apiClient.alerts(activeUser.schoolId, activeUser), apiClient.audit(activeUser.schoolId, activeUser)
      ]);
      setDashboard(summary); setAlerts(alertData); setRecommendations(recommendationData); setAuditEvents(auditData);
    } catch (loadError) { setError(`Backend unavailable: ${loadError.message}`); }
    finally { setLoading(false); }
  }

  useEffect(() => { const activeUser = auth.currentUser(); if (activeUser) { setUser(activeUser); loadDashboard(activeUser); } }, [auth]);
  useEffect(() => {
    const liveEvent = socket.event;
    if (!liveEvent) return;
    setLiveEvents((current) => [liveEvent, ...current].slice(0, 8));
    if (!liveEvent.alert) return;
    setAlerts((current) => {
      const existing = current.some((alert) => alert.alertId === liveEvent.alert.alertId);
      return existing
        ? current.map((alert) => alert.alertId === liveEvent.alert.alertId ? liveEvent.alert : alert)
        : [liveEvent.alert, ...current];
    });
    if (liveEvent.audit) setAuditEvents((current) => [liveEvent.audit, ...current]);
  }, [socket.event]);

  function signIn() { auth.persist(localUser); setUser(localUser); loadDashboard(localUser); }
  function signOut() { auth.signOut(); setUser(null); setDashboard(null); setAlerts([]); setAuditEvents([]); setLiveEvents([]); }
  function resetDemo() { setAlerts([]); setAuditEvents([]); setLiveEvents([]); setRequestError(''); }
  async function acknowledge(alertId) {
    try {
      setRequestError('');
      await apiClient.acknowledge(user.schoolId, alertId, user);
      setAlerts((current) => current.map((alert) => alert.alertId === alertId ? { ...alert, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() } : alert));
    } catch (ackError) { setRequestError(`Request failed: ${ackError.message}`); }
  }
  async function simulateSevere() {
    try {
      setDemoLoading(true); setRequestError('');
      const result = await apiClient.demo(user.schoolId, user);
      setAlerts((current) => [result.alert, ...current.filter((alert) => alert.alertId !== result.alert.alertId)]);
    } catch (demoError) { setRequestError(`Demo failed: ${demoError.message}`); }
    finally { setDemoLoading(false); }
  }

  if (!user) return <SignInPanel onSignIn={signIn} />;
  const school = dashboard?.schools?.find((item) => item.id === user.schoolId) || dashboard?.schools?.[0];
  const activeAlert = alerts[0];
  const pm25 = activeAlert?.currentValue ?? school?.aqi;
  const pm10 = activeAlert ? 340 : (school ? Math.round(school.aqi * 1.2) : null);
  const risk = activeAlert?.severity || (school?.riskLevel || 'NORMAL').toUpperCase();
  const riskClass = risk.toLowerCase();
  return (
    <main className="page-shell">
      <header className="topbar hero">
        <div><div className="brand-mark">SB</div><div><p className="eyebrow">School & Child Safe Air Early-Warning System</p><h1>SmartBreath</h1><p className="subtle">{school?.name || 'Greenfield Academy'} <span className="context-chip">LOCAL DEMO</span></p></div></div>
        <div className="top-actions"><ConnectionStatus status={socket.status} /><button className="button ghost" onClick={signOut}>Sign out</button></div>
      </header>
      {error && <div className="notice error" role="alert">{error}</div>}
      {requestError && <div className="notice error" role="alert">{requestError}</div>}
      <section className="disclaimer notice">Protective-action guidance for environmental risk. SmartBreath does not diagnose medical conditions, is not a medical diagnostic system, and does not autonomously dispatch emergency services. All demo notifications are simulated.</section>
      {loading && <div className="loading-bar" role="status">Loading school data…</div>}
      <section className={`air-hero ${riskClass}`} aria-label="Live air quality">
        <div><p className="eyebrow">Live air quality</p><div className="risk-heading"><h2>{risk.toUpperCase()}</h2><span className={`severity-label ${riskClass}`}>{activeAlert ? 'ACTION NEEDED' : 'MONITORING'}</span></div><p className="subtle">Prediction horizon: 3 hours · child-sensitive policy active</p></div>
        <div className="risk-score"><strong>{pm25 ?? '—'}</strong><span>PM2.5 µg/m³</span></div>
      </section>
      <section className="stats-grid" aria-label="Live air quality metrics">
        <StatCard label="PM2.5" value={pm25 ?? '—'} suffix="µg/m³" tone={riskClass} />
        <StatCard label="PM10" value={pm10 ?? '—'} suffix="µg/m³" tone="warning" />
        <StatCard label="Temperature" value={school?.temperature ?? '—'} suffix="°C" tone="accent" />
        <StatCard label="Humidity" value={school?.humidity ?? '—'} suffix="%" tone="good" />
      </section>
      <section className="content-grid">
        <article className="panel"><div className="panel-heading"><div><p className="eyebrow">School controls</p><h2>Protective action plan</h2></div>{canAcknowledge && <div className="button-row"><button className="button demo-button" aria-label="Simulate Severe PM2.5" onClick={simulateSevere} disabled={demoLoading}>{demoLoading ? 'Running demo…' : 'Run Severe Air Quality Demo'}</button><button className="button ghost" onClick={resetDemo}>Reset Demo</button></div>}</div>
          <div className="metric-list"><div><span>Wind</span><strong>{school ? '3 km/h · 180°' : '—'}</strong></div><div><span>Prediction horizon</span><strong>3 hours</strong></div></div>
          <div className="recommendation-box"><h3>Protective recommendations</h3>{recommendations.length === 0 ? <p className="subtle">Recommendations appear when a risk is evaluated.</p> : <ul>{recommendations.map((item) => <li key={item.title}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul>}</div>
        </article>
        <AlertCenter alerts={alerts} canAcknowledge={canAcknowledge} onAcknowledge={acknowledge} />
      </section>
      <EventFeed events={liveEvents} />
      <AuditTimeline events={auditEvents} />
      <p className="footer-note">Connection: {socket.status.toLowerCase()}. Simulated events are labeled clearly; no real contacts or emergency services are contacted.</p>
    </main>
  );
}
