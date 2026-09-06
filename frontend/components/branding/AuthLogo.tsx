"use client";

interface AuthLogoProps {
  className?: string;
  priority?: boolean;
}

export function AuthLogo({ className = "", priority = false }: AuthLogoProps) {
  return (
    <img
      src="/auth_logo.png"
      alt="DeskMind"
      className={`object-contain ${className}`}
    />
  );
}
