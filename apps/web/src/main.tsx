import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import Workspace from "./app/workspace";
import { initializeIdentity, signIn } from "./auth";
import "./app/globals.css";
import "./app/product-design.css";
function App() {
  const [ready, setReady] = useState(false),
    [authenticated, setAuthenticated] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void initializeIdentity()
      .then(setAuthenticated)
      .catch(() => setError("Sign-in could not be completed."))
      .finally(() => setReady(true));
  }, []);
  if (!ready) return <main className="empty">Opening your workspace…</main>;
  if (authenticated) return <Workspace />;
  return (
    <main className="entry">
      <div className="entry-content">
        <span className="brand">MAYRAVIQ</span>
        <h1>
          Your team.
          <br />
          Ideas in motion.
        </h1>
        <p>
          Call your team, design together and turn discussions into clear next
          steps.
        </p>
        <button
          className="button primary"
          onClick={() => void signIn().catch((e: Error) => setError(e.message))}
        >
          Sign in with your team
        </button>
        {error && <p role="alert">{error}</p>}
        <small>Private team workspace · Recording off by default</small>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
