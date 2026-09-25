const labels = {
  'risk.alert.created': 'Risk alert created',
  'alert.queued': 'Alert queued',
  'alert.delivered': 'Alert delivered',
  'alert.acknowledged': 'Alert acknowledged'
};

export function EventFeed({ events }) {
  return (
    <section className="panel event-panel" aria-labelledby="event-feed-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">Live event stream</p><h2 id="event-feed-heading">Recent activity</h2></div>
        <span className="live-dot">LIVE</span>
      </div>
      {events.length === 0 ? <p className="empty-state">Live risk and notification events will appear here.</p> : (
        <ol className="event-feed">
          {events.map((event, index) => (
            <li key={`${event.type}-${event.timestamp || index}`}>
              <span className="event-marker" />
              <div>
                <strong>{labels[event.type] || event.type}</strong>
                <span>{event.type === 'alert.delivered' ? 'Local notification simulated' : 'School-scoped event'}</span>
                <time>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Just now'}</time>
              </div>
              {event.simulated && <span className="simulated-label">SIMULATED</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
