"use client";

interface AuthLogoProps {
  className?: string;
  priority?: boolean;
}

export function AuthLogo({ className = "", priority = false }: AuthLogoProps) {
  return (
    <img
      src="/deskmind-logo-cropped.png"
      alt="DeskMind"
      className={`object-contain ${className}`}
    />
  );
}
