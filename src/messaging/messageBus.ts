import type { VaultRequest, VaultResponse } from "./types";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

export class MessageBus {
  private iframeWindow: Window;
  private targetOrigin: string;
  private pending = new Map<string, PendingRequest>();

  constructor(iframeWindow: Window, targetOrigin: string) {
    this.iframeWindow = iframeWindow;
    this.targetOrigin = targetOrigin;
    window.addEventListener("message", this.handleMessage);
  }

  send<TResponse>(request: VaultRequest, timeoutMs = 5000): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request timed out: ${request.action}`));
      }, timeoutMs);

      this.pending.set(request.id, { resolve, reject, timeoutId });
      this.iframeWindow.postMessage(request, this.targetOrigin);
    });
  }

  private handleMessage = (event: MessageEvent<VaultResponse>) => {
    if (event.origin !== this.targetOrigin) return;

    const response = event.data;
    if (!response?.id) return;

    const pendingRequest = this.pending.get(response.id);
    if (!pendingRequest) return;

    window.clearTimeout(pendingRequest.timeoutId);
    this.pending.delete(response.id);

    if (response.status === "success") {
      pendingRequest.resolve(response.data);
      return;
    }

    pendingRequest.reject(new Error(response.error || "Unknown vault error"));
  };

  destroy() {
    window.removeEventListener("message", this.handleMessage);

    for (const entry of this.pending.values()) {
      window.clearTimeout(entry.timeoutId);
    }

    this.pending.clear();
  }
}
