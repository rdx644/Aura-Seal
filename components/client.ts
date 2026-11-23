export async function api<T>(path: string, input?: object | FormData): Promise<T> {
  const response = await fetch('/api/' + path, input === undefined ? {} : {
    method: 'POST',
    ...(input instanceof FormData ? { body: input } : { body: JSON.stringify(input), headers: { 'content-type': 'application/json' } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'The request could not be completed');
  return data as T;
}
