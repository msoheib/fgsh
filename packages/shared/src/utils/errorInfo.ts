export interface ErrorInfo {
  message: string;
  name?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  statusText?: string;
  context?: string;
  stack?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getErrorInfo(error: unknown, fallback: string = 'Unknown error'): ErrorInfo {
  if (error instanceof Error) {
    return {
      message: error.message || fallback,
      name: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error || fallback };
  }

  if (!isRecord(error)) {
    return { message: fallback };
  }

  return {
    message: typeof error.message === 'string' && error.message ? error.message : fallback,
    name: typeof error.name === 'string' ? error.name : undefined,
    code: typeof error.code === 'string' ? error.code : undefined,
    details: typeof error.details === 'string' ? error.details : undefined,
    hint: typeof error.hint === 'string' ? error.hint : undefined,
    status: typeof error.status === 'number' ? error.status : undefined,
    statusText: typeof error.statusText === 'string' ? error.statusText : undefined,
    context: typeof error.context === 'string' ? error.context : undefined,
    stack: typeof error.stack === 'string' ? error.stack : undefined,
  };
}
