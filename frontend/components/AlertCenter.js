export function AlertCenter({ alerts, canAcknowledge, onAcknowledge }) {
  return (
    <aside className="panel" aria-labelledby="alert-heading">
      <div className="panel-heading"><div><p className="eyebrow">Operational alert center</p><h2 id="alert-heading">Alerts</h2></div><span className="count-badge">{alerts.length}</span></div>
      {alerts.length === 0 ? <p className="empty-state">No school alerts are currently available.</p> : (
        <div className="alert-list">{alerts.map((alert) => (
          <article className={`alert-card ${alert.severity}`} key={alert.alertId}>
            <div className="alert-title"><span className={`severity-label ${alert.severity}`}>{alert.severity}</span>{alert.simulated && <span className="simulated-label">SIMULATED DEMO</span>}</div>
            <h3>{alert.pollutant}: {alert.currentValue} µg/m³</h3>
            <p>{alert.message}</p>
            <dl className="alert-details"><div><dt>Threshold</dt><dd>{alert.threshold} µg/m³</dd></div><div><dt>Status</dt><dd>{alert.status}</dd></div></dl>
            {canAcknowledge && alert.status !== 'ACKNOWLEDGED' && alert.status !== 'RESOLVED' && <button className="button small" onClick={() => onAcknowledge(alert.alertId)}>Acknowledge alert</button>}
          </article>
        ))}</div>
      )}
    </aside>
  );
}
