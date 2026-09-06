import React from "react";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className = "",
  variant = "rectangular",
  width,
  height,
}: SkeletonProps) {
  const base =
    "animate-pulse-soft bg-gray-200 dark:bg-gray-700 rounded-md";

  const variantClasses = {
    text: "h-4 rounded",
    circular: "rounded-full",
    rectangular: "rounded-lg",
  };

  const style: React.CSSProperties = {
    width: width ?? "100%",
    height: height ?? (variant === "text" ? "1rem" : undefined),
  };

  if (variant === "text" && height) {
    style.height = height;
  }

  return (
    <div
      className={`${base} ${variantClasses[variant]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
