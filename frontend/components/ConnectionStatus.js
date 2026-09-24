export function ConnectionStatus({ status }) {
  return <span className={`connection ${status.toLowerCase()}`} aria-label={`WebSocket connection ${status}`}>{status}</span>;
}
