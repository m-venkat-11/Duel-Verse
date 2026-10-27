import { BroadcastTransport } from './broadcastTransport';
import { FirebaseTransport } from './firebaseTransport';
import { WebRTCTransport } from './webrtcTransport';
import type { IRoomTransport } from './types';

// WebRTC transport provides true peer-to-peer cross-device multiplayer across mobile & desktop with zero config
export const webrtcTransport = new WebRTCTransport();
export const broadcastTransport = new BroadcastTransport();
export const firebaseTransport = new FirebaseTransport();

export let activeTransport: IRoomTransport = webrtcTransport;

export function setActiveTransport(type: 'webrtc' | 'broadcast' | 'firebase'): IRoomTransport {
  if (type === 'firebase') {
    activeTransport = firebaseTransport;
  } else if (type === 'broadcast') {
    activeTransport = broadcastTransport;
  } else {
    activeTransport = webrtcTransport;
  }
  return activeTransport;
}

export * from './types';
export * from './broadcastTransport';
export * from './webrtcTransport';
export * from './firebaseTransport';
