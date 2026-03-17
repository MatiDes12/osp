export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: PaginationMeta | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface TimeRangeParams {
  from?: string;
  to?: string;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function createSuccessResponse<T>(
  data: T,
  meta?: PaginationMeta,
): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    meta: meta ?? null,
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): ApiResponse<never> {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      details,
      requestId,
      timestamp: new Date().toISOString(),
    },
    meta: null,
  };
}
