import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBus } from "./messaging/messageBus";
import type { VaultRequest } from "./messaging/types";
import { useDebouncedValue } from "./hooks/useDebouncedValue";

const DATA_VAULT_ORIGIN = "http://localhost:5174";
const DATA_VAULT_URL = "http://localhost:5174";

type RecordItem = {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
};

type QueryResponse = {
  items: RecordItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

//Bulk insert

type BulkInsertResponse = {
  inserted: number;
  totalRecords: number;
};

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [bus, setBus] = useState<MessageBus | null>(null);
  const [pingResult, setPingResult] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkProcessed, setBulkProcessed] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [isBulkInserting, setIsBulkInserting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const debouncedSearch = useDebouncedValue(searchTerm, 200);

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

  // Reset page khi search đổi
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!bus) return;

    const unsubscribe = bus.onProgress((event) => {
      setBulkProcessed(event.data.processed);
      setBulkTotal(event.data.total);
      setBulkProgress(event.data.percent);
    });

    return unsubscribe;
  }, [bus]);

  //Bulk insert function
  async function handleBulkInsert() {
    if (!bus) return;

    setIsBulkInserting(true);
    setError("");
    setBulkProcessed(0);
    setBulkTotal(50000);
    setBulkProgress(0);

    try {
      const request: VaultRequest = {
        id: crypto.randomUUID(),
        action: "records.bulkInsert",
        payload: {
          count: 50000,
        },
      };

      const result = await bus.send<BulkInsertResponse>(request, 120000);

      // optional: update ngay total từ response
      setTotal(result.totalRecords);

      // reset về page 1
      setPage(1);

      // ép query chạy lại
      setReloadKey((value) => value + 1);
      setTimeout(() => {
        setBulkProgress(0);
        setBulkProcessed(0);
        setBulkTotal(0);
      }, 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk insert failed";
      setError(message);
    } finally {
      setIsBulkInserting(false);
    }
  }

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

  useEffect(() => {
    let cancelled = false;

    async function fetchRecords() {
      if (!bus) return;
      setLoading(true);
      setError("");

      try {
        const request: VaultRequest = {
          id: crypto.randomUUID(),
          action: "records.query",
          payload: {
            search: debouncedSearch,
            page,
            pageSize,
          },
        };

        const result = await bus.send<QueryResponse>(request);

        if (cancelled) return;

        setRecords(result.items ?? []);
        setTotal(result.total ?? 0);
        setTotalPages(result.totalPages ?? 0);

        // Đồng bộ page nếu Data Vault clamp lại
        if (typeof result.page === "number" && result.page !== page) {
          setPage(result.page);
        }
      } catch (err) {
        if (cancelled) return;

        const message =
          err instanceof Error ? err.message : "Load records failed";
        setRecords([]);
        setTotal(0);
        setTotalPages(0);
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRecords();

    return () => {
      cancelled = true;
    };
  }, [bus, debouncedSearch, page, pageSize, reloadKey]);

  function handlePrevPage() {
    setPage((current) => Math.max(1, current - 1));
  }

  function handleNextPage() {
    setPage((current) => {
      if (totalPages === 0) return 1;
      return Math.min(totalPages, current + 1);
    });
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
        <button
          onClick={handleBulkInsert}
          disabled={!canSend || isBulkInserting}
        >
          {isBulkInserting ? "Bulk Inserting..." : "Bulk Insert 50,000"}
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

        <div style={{ marginBottom: 8 }}>
          <strong>Total Records:</strong> {total}
        </div>

        <div>
          <strong>Page:</strong> {totalPages === 0 ? 0 : page} / {totalPages}
        </div>

        {error && (
          <div style={{ marginTop: 8, color: "red" }}>
            <strong>Error:</strong> {error}
          </div>
        )}
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
          <strong>Bulk Insert:</strong>{" "}
          {isBulkInserting ? "Running..." : "Idle"}
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Progress:</strong> {bulkProgress}%
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Processed:</strong> {bulkProcessed} / {bulkTotal}
        </div>

        <div
          style={{
            width: "100%",
            height: 12,
            background: "#e5e7eb",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${bulkProgress}%`,
              height: "100%",
              background: "#2563eb",
              transition: "width 120ms linear",
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Search</h2>

        <input
          type="text"
          placeholder="Search name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: 10,
            width: "100%",
            marginBottom: 12,
            borderRadius: 6,
            border: "1px solid #ccc",
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={handlePrevPage} disabled={loading || page <= 1}>
            Prev
          </button>

          <button
            onClick={handleNextPage}
            disabled={loading || totalPages === 0 || page >= totalPages}
          >
            Next
          </button>
        </div>

        <h2 style={{ marginTop: 0 }}>Records</h2>

        {loading ? (
          <p style={{ margin: 0 }}>Searching...</p>
        ) : records.length === 0 ? (
          <p style={{ margin: 0 }}>No matching data.</p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Showing {records.length} records on page {page} / {totalPages}{" "}
              (total matched: {total})
            </p>

            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {records.map((record) => (
                <li key={record.id} style={{ marginBottom: 6 }}>
                  <strong>{record.name}</strong> — {record.email} —{" "}
                  {record.status}
                </li>
              ))}
            </ul>
          </>
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
