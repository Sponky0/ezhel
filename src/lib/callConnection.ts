// ICE candidates may arrive before the remote SDP over the broadcast channel.
export function createRemoteIceQueue(
  addCandidate: (candidate: unknown) => Promise<void>,
) {
  let ready = false;
  let closed = false;
  let pending: unknown[] = [];
  let chain = Promise.resolve();
  const deliver = (candidate: unknown) => {
    const result = chain.then(() => closed ? undefined : addCandidate(candidate));
    chain = result.catch(() => undefined);
    return result;
  };
  return {
    add(candidate: unknown) {
      if (closed) return Promise.resolve();
      if (!ready) {
        pending.push(candidate);
        return Promise.resolve();
      }
      return deliver(candidate);
    },
    async remoteDescriptionSet() {
      if (closed) return;
      ready = true;
      const candidates = pending;
      pending = [];
      // Queue the whole batch before awaiting so new candidates cannot overtake it.
      await Promise.all(candidates.map(deliver));
    },
    close() {
      closed = true;
      pending = [];
    },
  };
}

export function isPeerConnected(connectionState: string, iceState: string) {
  return connectionState === 'connected' ||
    (connectionState !== 'failed' && connectionState !== 'closed' &&
      (iceState === 'connected' || iceState === 'completed'));
}
