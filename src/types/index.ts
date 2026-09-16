export type ID = string;
export type Nullable<T> = T | null;
export type AsyncState = 'idle' | 'loading' | 'success' | 'error';

export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  total: number;
  hasMore: boolean;
}
