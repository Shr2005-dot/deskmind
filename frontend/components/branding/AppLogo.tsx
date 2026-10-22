"use client";

import Image from "next/image";

interface AppLogoProps {
  className?: string;
  priority?: boolean;
}

export function AppLogo({ className = "", priority = false }: AppLogoProps) {
  return (
    <Image
      src="/deskmind-logo.png"
      alt="DeskMind"
      width={439}
      height={101}
      sizes="300px"
      className={`object-contain ${className}`}
      priority={priority}
    />
  );
}
