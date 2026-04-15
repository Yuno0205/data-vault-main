export type VaultAction =
  | "ping"
  | "records.query"
  | "records.getByIds"
  | "records.bulkInsert"
  | "records.bulkUpdateStatus";

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

export type VaultProgressEvent = {
  type: "records.bulkInsert.progress" | "records.bulkUpdateStatus.progress";
  data: {
    processed: number;
    total: number;
    percent: number;
  };
};
