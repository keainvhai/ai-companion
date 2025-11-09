import { useState } from "react";
import axios from "axios";

export default function IntentTestPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:3001/test-intent", {
        text: input,
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setResult({ error: "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2>🧠 AI Companion – Intent & Perception Test</h2>
      <textarea
        rows="4"
        cols="60"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type something (e.g. I'm so angry!!)"
      />
      <br />
      <button onClick={handleTest} disabled={loading || !input}>
        {loading ? "Testing..." : "Run Test"}
      </button>

      {result && (
        <pre
          style={{ background: "#f4f4f4", padding: "1rem", marginTop: "1rem" }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
