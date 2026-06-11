'use client';

import type { ReactNode } from 'react';
import { getOverlayController } from './overlayStore';
import type {
  AlertOptions,
  BottomSheetOptions,
  ConfirmOptions,
  ModalOptions,
  OverlayController,
  ToastOptions,
} from './types';

let idCounter = 0;

function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function requireController(): OverlayController {
  const controller = getOverlayController();
  if (!controller) {
    throw new Error('OverlayProvider가 마운트되지 않았습니다.');
  }
  return controller;
}

export const overlay = {
  open(content: ReactNode, options: ModalOptions = {}): string {
    const id = nextId('modal');
    requireController().push({
      id,
      kind: 'modal',
      content,
      closeOnBackdrop: options.closeOnBackdrop ?? true,
      closeOnEsc: options.closeOnEsc ?? true,
      className: options.className,
    });
    return id;
  },

  bottomSheet(content: ReactNode, options: BottomSheetOptions = {}): string {
    const id = nextId('sheet');
    requireController().push({
      id,
      kind: 'bottomSheet',
      content,
      title: options.title,
      closeOnBackdrop: options.closeOnBackdrop ?? true,
      closeOnEsc: options.closeOnEsc ?? true,
    });
    return id;
  },

  toast(message: string, options: ToastOptions = {}): string {
    const id = nextId('toast');
    requireController().pushToast({
      id,
      message,
      variant: options.variant ?? 'default',
      duration: options.duration,
    });
    return id;
  },

  confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      const id = nextId('confirm');
      requireController().push({
        id,
        kind: 'confirm',
        message,
        title: options.title ?? '확인',
        confirmText: options.confirmText ?? '확인',
        cancelText: options.cancelText ?? '취소',
        destructive: options.destructive,
        resolve: (value) => {
          resolve(value);
        },
      });
    });
  },

  alert(message: string, options: AlertOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      const id = nextId('alert');
      requireController().push({
        id,
        kind: 'alert',
        message,
        title: options.title ?? '알림',
        confirmText: options.confirmText ?? '확인',
        resolve: () => {
          resolve();
        },
      });
    });
  },

  close(id?: string) {
    const controller = getOverlayController();
    if (!controller) return;
    if (id) controller.close(id);
    else controller.closeTop();
  },
};
