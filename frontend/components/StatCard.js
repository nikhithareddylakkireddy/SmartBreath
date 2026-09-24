export function StatCard({ label, value, suffix, tone = 'default' }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong>{suffix && <small>{suffix}</small>}</article>;
}
