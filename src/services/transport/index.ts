import { BroadcastTransport } from './broadcastTransport';
import { FirebaseTransport } from './firebaseTransport';
import type { IRoomTransport } from './types';

// Default transport is BroadcastTransport for zero-config instant multi-tab & multi-window sync,
// with Firebase available when credentials are provided.
export const broadcastTransport = new BroadcastTransport();
export const firebaseTransport = new FirebaseTransport();

export let activeTransport: IRoomTransport = firebaseTransport.getIsConfigured()
  ? firebaseTransport
  : broadcastTransport;

export function setActiveTransport(type: 'broadcast' | 'firebase'): IRoomTransport {
  activeTransport = type === 'firebase' ? firebaseTransport : broadcastTransport;
  return activeTransport;
}

export * from './types';
export * from './broadcastTransport';
export * from './firebaseTransport';
