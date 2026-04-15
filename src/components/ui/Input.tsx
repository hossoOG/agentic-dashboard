import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  size?: "sm" | "md";
}

// ============================================================================
// Styles
// ============================================================================

const sizeClasses = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-2 text-sm",
};

// ============================================================================
// Component
// ============================================================================

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, size = "md", className = "", id, ...rest }, ref) => {
    const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs text-neutral-400 tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-surface-base border text-neutral-300 font-mono placeholder:text-neutral-500 focus:outline-none transition-colors ${
              error
                ? "border-red-500 focus:border-red-400"
                : "border-neutral-700 focus:border-accent"
            } ${icon ? "pl-7" : ""} ${sizeClasses[size]} ${className}`}
            {...rest}
          />
        </div>
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
