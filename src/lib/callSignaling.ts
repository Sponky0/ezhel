import { createRemoteIceQueue } from './callConnection';

// Realtime broadcast is not a mailbox: a peer may subscribe after our first
// ready/SDP packet. Retry cached SDP, never generate another offer on every join.
export function createCallSignaling({ pc, channel, caller, description, candidate, onConnecting, onError, onOffer, offerData = {}, retryMs = 1000 }: {
  pc: any; channel: any; caller: boolean; description: (data: any) => any; candidate: (data: any) => any;
  onConnecting: () => void; onError: (error: Error) => void;
  onOffer?: (data: any) => void; offerData?: Record<string, unknown>; retryMs?: number;
}) {
  let established = false; let closed = false; let subscribed = false; let timer: ReturnType<typeof setInterval> | undefined;
  let offer: any; let answer: any; let remoteSdp = ''; let serial = Promise.resolve();
  const localCandidates: any[] = []; const receivedCandidates = new Set<string>();
  const remoteIce = createRemoteIceQueue(async data => { await pc.addIceCandidate(candidate(data)); });
  const send = (event: string, payload: any = {}) => {
    if (closed || !subscribed) return;
    Promise.resolve(channel.send({ type: 'broadcast', event, payload })).catch(() => { /* next heartbeat retries SDP */ });
  };
  const enqueue = (task: () => Promise<void>) => {
    serial = serial.then(async () => { if (!closed) await task(); }).catch(error => { if (!closed) onError(error instanceof Error ? error : new Error('Arama sinyali işlenemedi.')); });
  };
  const replayIce = () => localCandidates.forEach(data => send('candidate', data));
  channel.on('broadcast', { event: 'join' }, () => {
    if (!caller) return;
    enqueue(async () => {
      onConnecting();
      if (!offer) { offer = await pc.createOffer(); if (closed) return; await pc.setLocalDescription(offer); }
      send('offer', { ...offer, ...offerData }); replayIce();
    });
  });
  channel.on('broadcast', { event: 'offer' }, ({ payload }: any) => {
    if (caller || !payload?.sdp || payload.type !== 'offer') return;
    enqueue(async () => {
      onConnecting(); onOffer?.(payload);
      if (remoteSdp !== payload.sdp) {
        await pc.setRemoteDescription(description({ type: 'offer', sdp: payload.sdp })); remoteSdp = payload.sdp;
        await remoteIce.remoteDescriptionSet();
        answer = await pc.createAnswer(); if (closed) return; await pc.setLocalDescription(answer);
      }
      send('answer', answer); replayIce();
    });
  });
  channel.on('broadcast', { event: 'answer' }, ({ payload }: any) => {
    if (!caller || !payload?.sdp || payload.type !== 'answer') return;
    enqueue(async () => {
      if (remoteSdp !== payload.sdp) {
        await pc.setRemoteDescription(description({ type: 'answer', sdp: payload.sdp })); remoteSdp = payload.sdp;
        await remoteIce.remoteDescriptionSet();
      }
      replayIce();
    });
  });
  channel.on('broadcast', { event: 'candidate' }, ({ payload }: any) => {
    if (closed || !payload?.candidate) return;
    const key = JSON.stringify(payload);
    if (receivedCandidates.has(key)) return;
    receivedCandidates.add(key);
    void remoteIce.add(payload).catch(() => { receivedCandidates.delete(key); });
  });
  pc.onicecandidate = ({ candidate: ice }: any) => {
    if (!ice || closed) return;
    const data = typeof ice.toJSON === 'function' ? ice.toJSON() : ice;
    localCandidates.push(data); send('candidate', data);
  };
  const heartbeat = () => {
    if (closed || established) return;
    // Ready is retried even after remote SDP: a missed answer can then be resent.
    if (!caller) send('join');
  };
  return {
    subscribed() { if (closed) return; subscribed = true; heartbeat(); if (!timer && !established) timer = setInterval(heartbeat, retryMs); },
    connected() { established = true; if (timer) { clearInterval(timer); timer = undefined; } },
    disconnected() { subscribed = false; },
    close() { closed = true; subscribed = false; if (timer) clearInterval(timer); remoteIce.close(); pc.onicecandidate = null; localCandidates.length = 0; receivedCandidates.clear(); },
  };
}
