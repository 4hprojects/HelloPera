type ProxyRequestLog = {
  requestId: string;
  method: string;
  route: string;
};

export function serializeProxyRequestLog(fields: ProxyRequestLog): string {
  return JSON.stringify({
    level: 'info',
    message: 'request accepted',
    timestamp: new Date().toISOString(),
    request_id: fields.requestId,
    method: fields.method,
    route: fields.route,
  });
}

/** Proxy-safe logger kept separate from the Node-side application logger. */
export function logProxyRequest(fields: ProxyRequestLog): void {
  console.log(serializeProxyRequestLog(fields));
}
