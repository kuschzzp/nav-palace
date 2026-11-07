"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

// 由 Radix 管理焦点、Esc 关闭和可访问性关联，Portal 避免弹窗被页面容器裁剪。
export function DialogContent({ children, onPointerDownOutside, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="ui-dialog-overlay" /><DialogPrimitive.Content className="ui-dialog-content" {...props} onPointerDownOutside={(event) => {
    onPointerDownOutside?.(event);
    // 误点遮罩不能丢失填写中的表单；仍可使用关闭、取消或 Escape 明确退出。
    event.preventDefault();
  }}>{children}<DialogPrimitive.Close className="ui-dialog-close" aria-label="关闭"><X size={20} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
