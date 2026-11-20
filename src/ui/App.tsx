import { strings } from '../strings';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>{strings.appName}</h1>
        <p>{strings.appTagline}</p>
      </header>
      <main className="app-main" />
      <footer className="app-footer">{strings.privacyNotice}</footer>
    </div>
  );
}
