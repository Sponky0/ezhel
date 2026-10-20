// Correlation/idempotency identifier, never an authentication secret.
export function requestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, key => {
    const n = Math.floor(Math.random() * 16); return (key === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
