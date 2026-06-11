import type { OverlayController } from './types';

let controller: OverlayController | null = null;

export function registerOverlayController(next: OverlayController | null) {
  controller = next;
}

export function getOverlayController(): OverlayController | null {
  return controller;
}
