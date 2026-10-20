export async function withTimeout<T>(work: PromiseLike<T>, milliseconds = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Bağlantı zaman aşımına uğradı. Tekrar deneyin.')), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
