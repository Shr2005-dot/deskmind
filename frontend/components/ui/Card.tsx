import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className = "",
  hoverable,
  onClick,
  ...props
}: CardProps) {
  const base = "bg-surface border border-border rounded-xl transition-all duration-150 ease-out";
  const hover = hoverable
    ? "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
    : "shadow-sm";

  return (
    <div
      className={`${base} ${hover} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      {...props}
    >
      {children}
    </div>
  );
}
