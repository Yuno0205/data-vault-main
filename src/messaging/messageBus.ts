import type { VaultProgressEvent, VaultRequest, VaultResponse } from "./types";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

type ProgressListener = (event: VaultProgressEvent) => void;

export class MessageBus {
  private iframeWindow: Window;
  private targetOrigin: string;
  private pending = new Map<string, PendingRequest>();
  private progressListeners = new Set<ProgressListener>();

  constructor(iframeWindow: Window, targetOrigin: string) {
    this.iframeWindow = iframeWindow;
    this.targetOrigin = targetOrigin;
    window.addEventListener("message", this.handleMessage);
  }

  send<TResponse>(
    request: VaultRequest,
    timeoutMs = 30000,
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request timed out: ${request.action}`));
      }, timeoutMs);

      this.pending.set(request.id, {
        resolve: (value: unknown) => resolve(value as TResponse),
        reject,
        timeoutId,
      });
      this.iframeWindow.postMessage(request, this.targetOrigin);
    });
  }

  onProgress(listener: ProgressListener) {
    this.progressListeners.add(listener);

    return () => {
      this.progressListeners.delete(listener);
    };
  }

  private handleMessage = (
    event: MessageEvent<VaultResponse | VaultProgressEvent>,
  ) => {
    if (event.origin !== this.targetOrigin) return;

    const payload = event.data;
    if (!payload) return;

    if ("type" in payload && payload.type === "records.bulkInsert.progress") {
      this.progressListeners.forEach((listener) => listener(payload));
      return;
    }

    if (
      "type" in payload &&
      (payload.type === "records.bulkInsert.progress" ||
        payload.type === "records.bulkUpdateStatus.progress")
    ) {
      this.progressListeners.forEach((listener) => listener(payload));
      return;
    }

    if (!("id" in payload) || !payload.id) return;

    const pendingRequest = this.pending.get(payload.id);
    if (!pendingRequest) return;

    window.clearTimeout(pendingRequest.timeoutId);
    this.pending.delete(payload.id);

    if (payload.status === "success") {
      pendingRequest.resolve(payload.data);
      return;
    }

    pendingRequest.reject(new Error(payload.error || "Unknown vault error"));
  };

  destroy() {
    window.removeEventListener("message", this.handleMessage);

    for (const entry of this.pending.values()) {
      window.clearTimeout(entry.timeoutId);
    }

    this.pending.clear();
    this.progressListeners.clear();
  }
}
