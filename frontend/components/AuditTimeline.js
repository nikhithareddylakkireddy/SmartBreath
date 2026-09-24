export function AuditTimeline({ alerts }) {
  const events = alerts.flatMap((alert) => [
    { label: 'Alert created', timestamp: alert.createdAt, simulated: alert.simulated },
    alert.acknowledgedAt && { label: 'Acknowledged', timestamp: alert.acknowledgedAt, simulated: alert.simulated }
  ]).filter(Boolean);
  return (
    <section className="panel" aria-labelledby="audit-heading">
      <div className="panel-heading"><div><p className="eyebrow">Traceable event history</p><h2 id="audit-heading">Audit timeline</h2></div></div>
      {events.length === 0 ? <p className="empty-state">Reading → prediction → risk → alert events will appear here.</p> : <ol className="timeline">{events.map((event, index) => <li key={`${event.label}-${event.timestamp}-${index}`}><span className="timeline-dot" /><div><strong>{event.label}</strong><time>{new Date(event.timestamp).toLocaleString()}</time>{event.simulated && <span className="simulated-label">SIMULATED</span>}</div></li>)}</ol>}
    </section>
  );
}
