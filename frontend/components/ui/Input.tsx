import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  icon,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
            {icon}
          </div>
        )}
        <input
          className={`
            w-full rounded-lg border border-border bg-white px-3 py-2 text-sm
            text-gray-900 placeholder:text-gray-400
            outline-none transition-all duration-150 ease-out
            focus:border-primary-500 focus:ring-2 focus:ring-primary-100
            disabled:bg-gray-50 disabled:text-gray-500
            ${icon ? "pl-10" : ""}
            ${error ? "border-error focus:border-error focus:ring-error-light" : ""}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-error">{error}</p>
      )}
    </div>
  );
}
