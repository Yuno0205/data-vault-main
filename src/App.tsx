import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBus } from "./messaging/messageBus";
import type { VaultRequest } from "./messaging/types";

type RecordItem = {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
};

const DATA_VAULT_ORIGIN = "http://localhost:5174";
const DATA_VAULT_URL = "http://localhost:5174";

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [bus, setBus] = useState<MessageBus | null>(null);
  const [pingResult, setPingResult] = useState<string>("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      if (!iframe.contentWindow) return;

      const nextBus = new MessageBus(iframe.contentWindow, DATA_VAULT_ORIGIN);
      setBus(nextBus);
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      setBus((currentBus) => {
        currentBus?.destroy();
        return null;
      });
    };
  }, []);

  const canSend = useMemo(() => bus !== null, [bus]);

  async function handlePing() {
    if (!bus) return;

    try {
      const request: VaultRequest = {
        id: crypto.randomUUID(),
        action: "ping",
      };

      const result = await bus.send<string>(request);
      setPingResult(result);
    } catch (error) {
      setPingResult(error instanceof Error ? error.message : "Ping failed");
    }
  }

  async function handleLoadRecords() {
    if (!bus) return;

    setLoading(true);

    try {
      const request: VaultRequest = {
        id: crypto.randomUUID(),
        action: "records.query",
      };

      const result = await bus.send<{ items: RecordItem[]; total: number }>(
        request,
      );
      setRecords(result.items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Main App</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={handlePing} disabled={!canSend}>
          Ping Data Vault
        </button>

        <button onClick={handleLoadRecords} disabled={!canSend || loading}>
          {loading ? "Loading..." : "Load Records"}
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <strong>Ping Result:</strong> {pingResult || "No response yet"}
      </div>

      <div style={{ marginBottom: 24 }}>
        <strong>Records:</strong>
        <ul>
          {records.map((record) => (
            <li key={record.id}>
              {record.name} - {record.email} - {record.status}
            </li>
          ))}
        </ul>
      </div>

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
  );
}
