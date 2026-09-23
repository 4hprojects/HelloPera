export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=\/|$)/gi;
const NUMERIC_SEGMENT = /\/\d+(?=\/|$)/g;

/** Keep a valid upstream correlation ID, otherwise create one locally. */
export function resolveRequestId(headers: Headers): string {
  const supplied = headers.get(REQUEST_ID_HEADER);
  return supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
}

/** Attach Proxy's correlation ID to a downstream structured log record. */
export function requestLogFields(headers: Headers): { request_id?: string } {
  const requestId = headers.get(REQUEST_ID_HEADER);
  return requestId && SAFE_REQUEST_ID.test(requestId) ? { request_id: requestId } : {};
}

/** Remove record identifiers before a route label reaches the logs. */
export function safeRouteLabel(pathname: string): string {
  return pathname.replace(UUID_SEGMENT, '/:id').replace(NUMERIC_SEGMENT, '/:id');
}
