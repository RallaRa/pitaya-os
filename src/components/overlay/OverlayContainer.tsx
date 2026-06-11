'use client';

import type { OverlayItem, ToastItem } from './types';
import ModalLayer from './layers/ModalLayer';
import BottomSheetLayer from './layers/BottomSheetLayer';
import ConfirmLayer from './layers/ConfirmLayer';
import AlertLayer from './layers/AlertLayer';
import ToastStack from './layers/ToastStack';

interface OverlayContainerProps {
  stack: OverlayItem[];
  toasts: ToastItem[];
  onClose: (id: string) => void;
  onConfirm: (id: string, value: boolean) => void;
  onAlert: (id: string) => void;
  onDismissToast: (id: string) => void;
}

export default function OverlayContainer({
  stack,
  toasts,
  onClose,
  onConfirm,
  onAlert,
  onDismissToast,
}: OverlayContainerProps) {
  return (
    <>
      {stack.map((item, index) => {
        const zIndex = 1000 + index * 10;

        switch (item.kind) {
          case 'modal':
            return (
              <ModalLayer
                key={item.id}
                item={item}
                zIndex={zIndex}
                onClose={() => onClose(item.id)}
              />
            );
          case 'bottomSheet':
            return (
              <BottomSheetLayer
                key={item.id}
                item={item}
                zIndex={zIndex}
                onClose={() => onClose(item.id)}
              />
            );
          case 'confirm':
            return (
              <ConfirmLayer
                key={item.id}
                item={item}
                zIndex={zIndex}
                onConfirm={(value) => onConfirm(item.id, value)}
                onCancel={() => onConfirm(item.id, false)}
              />
            );
          case 'alert':
            return (
              <AlertLayer
                key={item.id}
                item={item}
                zIndex={zIndex}
                onConfirm={() => onAlert(item.id)}
              />
            );
          default:
            return null;
        }
      })}
      <ToastStack toasts={toasts} onDismiss={onDismissToast} />
    </>
  );
}
