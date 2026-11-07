import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: { default: "ui-button-primary", secondary: "ui-button-secondary", ghost: "ui-button-ghost", destructive: "ui-button-destructive" },
    size: { default: "", sm: "ui-button-sm", icon: "ui-button-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

// 默认不提交表单；asChild 可复用链接等元素，同时避免把 button 专属的 type 传给它。
export function Button({ className, variant, size, asChild = false, type = "button", ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={asChild ? undefined : type} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
