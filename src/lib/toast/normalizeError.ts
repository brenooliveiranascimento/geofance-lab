export function normalizeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  if (msg.includes('Network request failed') || msg.toLowerCase().includes('network'))
    return 'No connection. Check your network and try again.';
  if (msg.includes('401'))
    return 'Connecting to your account. Please try again in a moment.';
  if (msg.includes('timeout') || msg.includes('timed out'))
    return 'The request took too long. Please try again.';
  return msg || fallback;
}
