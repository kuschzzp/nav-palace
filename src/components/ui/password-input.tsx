"use client";

import { useId, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import "./password-input.css";

type PasswordInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "children"> & {
  label: string;
  children?: ReactNode;
};

export function PasswordInput({ label, id, disabled, children, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);

  return <div className="field">
    <label htmlFor={inputId}>{label}</label>
    <div className="password-input">
      {/* 保留同一个输入框，切换可见性时保留已输入的内容。 */}
      <input {...props} id={inputId} disabled={disabled} type={revealed ? "text" : "password"} spellCheck={false} autoCapitalize="none" />
      <button
        type="button"
        aria-label={`${revealed ? "隐藏" : "显示"}${label}`}
        aria-controls={inputId}
        disabled={disabled}
        onClick={() => setRevealed((value) => !value)}
      >
        {revealed ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
    {children}
  </div>;
}
