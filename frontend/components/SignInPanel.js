export function SignInPanel({ onSignIn }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">AI air-safety early warning</p>
        <h1>SmartBreath</h1>
        <p className="subtle">Sign in to view your school&apos;s environmental risk and protective-action guidance.</p>
        <button className="button primary wide" onClick={onSignIn}>Sign in with local demo</button>
        <p className="fine-print">Production authentication uses Cognito. No credentials are stored in this frontend.</p>
      </section>
    </main>
  );
}
