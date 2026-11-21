/** Canonical property order keeps equivalent validated input identities stable. */
export async function rankingInputHash(input: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function requestDeadline(parent: AbortSignal, milliseconds: number) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.reason);
  if (parent.aborted) cancel();
  else parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Research timed out. Your arguments are preserved.')), milliseconds);
  return { signal: controller.signal, abort: () => controller.abort(), dispose: () => {
    clearTimeout(timer); parent.removeEventListener('abort', cancel);
  } };
}
