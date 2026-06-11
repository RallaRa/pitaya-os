import type { ReactNode } from 'react';

export type OverlayKind = 'modal' | 'bottomSheet' | 'confirm' | 'alert';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

export interface OverlayBaseOptions {
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
}

export interface ModalOptions extends OverlayBaseOptions {
  className?: string;
}

export interface BottomSheetOptions extends OverlayBaseOptions {
  title?: string;
}

export interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface AlertOptions {
  title?: string;
  confirmText?: string;
}

export interface ToastOptions {
  duration?: number;
  variant?: ToastVariant;
}

export interface ModalOverlayItem {
  id: string;
  kind: 'modal';
  content: ReactNode;
  closeOnBackdrop: boolean;
  closeOnEsc: boolean;
  className?: string;
  exiting?: boolean;
}

export interface BottomSheetOverlayItem {
  id: string;
  kind: 'bottomSheet';
  content: ReactNode;
  title?: string;
  closeOnBackdrop: boolean;
  closeOnEsc: boolean;
  exiting?: boolean;
}

export interface ConfirmOverlayItem {
  id: string;
  kind: 'confirm';
  message: string;
  title?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
  resolve: (value: boolean) => void;
  exiting?: boolean;
}

export interface AlertOverlayItem {
  id: string;
  kind: 'alert';
  message: string;
  title?: string;
  confirmText: string;
  resolve: () => void;
  exiting?: boolean;
}

export type OverlayItem =
  | ModalOverlayItem
  | BottomSheetOverlayItem
  | ConfirmOverlayItem
  | AlertOverlayItem;

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
  exiting?: boolean;
}

export interface OverlayController {
  push: (item: OverlayItem) => void;
  pushToast: (item: ToastItem) => void;
  close: (id: string) => void;
  closeTop: () => void;
}
