export type VaultAction = "ping" | "records.query";

export type VaultRequest<TPayload = unknown> = {
  id: string;
  action: VaultAction;
  payload?: TPayload;
};

export type VaultResponse<TData = unknown> = {
  id: string;
  status: "success" | "error";
  data?: TData;
  error?: string;
};
