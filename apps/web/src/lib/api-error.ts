type JsonErrorShape = {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
};

export function jsonError(message: string, status: number, details?: unknown, code?: string): Response {
  const body: JsonErrorShape = {
    error: {
      message,
      ...(code ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };

  return Response.json(body, { status });
}
