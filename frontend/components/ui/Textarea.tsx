import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({
  label,
  error,
  helperText,
  className = "",
  ...props
}: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full rounded-lg border border-border bg-white px-3 py-2 text-sm
          text-gray-900 placeholder:text-gray-400
          outline-none transition-all duration-150 ease-out
          focus:border-primary-500 focus:ring-2 focus:ring-primary-100
          disabled:bg-gray-50 disabled:text-gray-500 resize-y
          ${error ? "border-error focus:border-error focus:ring-error-light" : ""}
          ${className}
        `}
        {...props}
      />
      {(error || helperText) && (
        <p className={`mt-1.5 text-xs ${error ? "text-error" : "text-gray-500"}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
}
