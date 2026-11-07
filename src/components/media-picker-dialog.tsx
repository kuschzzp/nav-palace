"use client";

import type { ReactNode, RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import "./media-picker-dialog.css";

type MediaPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLInputElement | null>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

/** 素材选择独立于网站草稿；只有明确确认才把选择交给调用方。 */
export function MediaPickerDialog({ open, onOpenChange, title, description, onConfirm, confirmDisabled = false, busy = false, initialFocusRef, returnFocusRef, children }: MediaPickerDialogProps) {
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="media-picker-overlay" />
      <Dialog.Content className="media-picker-dialog" onOpenAutoFocus={(event) => {
        if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus(); }
      }} onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocusRef.current?.focus({ preventScroll: true });
      }} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <header className="media-picker-heading"><Dialog.Title className="media-picker-title">{title}</Dialog.Title><Dialog.Description className="media-picker-description">{description}</Dialog.Description></header>
        <div className="media-picker-body">{children}</div>
        <footer className="media-picker-footer"><Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={busy || confirmDisabled} onClick={onConfirm}>确认选择</Button></footer>
        <Dialog.Close className="media-picker-close" aria-label="关闭选择框" disabled={busy}><X size={20} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
