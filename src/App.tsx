import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBus } from "./messaging/messageBus";
import type { VaultRequest } from "./messaging/types";

type RecordItem = {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
};

type QueryResponse = {
  items: RecordItem[];
  total: number;
};

const DATA_VAULT_ORIGIN = "http://localhost:5174";
const DATA_VAULT_URL = "http://localhost:5174";

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [bus, setBus] = useState<MessageBus | null>(null);
  const [pingResult, setPingResult] = useState<string>("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let currentBus: MessageBus | null = null;

    const handleLoad = () => {
      if (!iframe.contentWindow) return;

      currentBus?.destroy();
      currentBus = new MessageBus(iframe.contentWindow, DATA_VAULT_ORIGIN);
      setBus(currentBus);
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      currentBus?.destroy();
      setBus(null);
    };
  }, []);

  const canSend = useMemo(() => bus !== null, [bus]);

  async function handlePing() {
    if (!bus) return;

    setError("");

    try {
      const request: VaultRequest = {
        id: crypto.randomUUID(),
        action: "ping",
      };

      const result = await bus.send<string>(request);
      setPingResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ping failed";
      setPingResult("");
      setError(message);
    }
  }

  async function handleLoadRecords() {
    if (!bus) return;

    setLoading(true);
    setError("");

    try {
      const request: VaultRequest = {
        id: crypto.randomUUID(),
        action: "records.query",
        payload: {
          search: "",
        },
      };

      const result = await bus.send<QueryResponse>(request);

      setRecords(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Load records failed";
      setRecords([]);
      setTotal(0);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "Arial, sans-serif",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 16 }}>Main App</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={handlePing} disabled={!canSend}>
          Ping Data Vault
        </button>

        <button onClick={handleLoadRecords} disabled={!canSend || loading}>
          {loading ? "Loading..." : "Load Records"}
        </button>
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 16,
          background: "#fafafa",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <strong>Vault connection:</strong>{" "}
          {canSend ? "Ready" : "Waiting for iframe..."}
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Ping Result:</strong> {pingResult || "No response yet"}
        </div>

        <div>
          <strong>Total Records:</strong> {total}
        </div>

        {error && (
          <div style={{ marginTop: 8, color: "red" }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Records</h2>

        {records.length === 0 ? (
          <p style={{ margin: 0 }}>No records loaded.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {records.map((record) => (
              <li key={record.id} style={{ marginBottom: 6 }}>
                <strong>{record.name}</strong> — {record.email} —{" "}
                {record.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2>Data Vault Iframe</h2>
        <iframe
          ref={iframeRef}
          src={DATA_VAULT_URL}
          title="Data Vault"
          style={{
            width: "100%",
            height: 220,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />
      </div>
    </div>
  );
}
