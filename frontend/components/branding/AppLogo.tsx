"use client";

import Image from "next/image";

interface AppLogoProps {
  className?: string;
  priority?: boolean;
}

export function AppLogo({ className = "", priority = false }: AppLogoProps) {
  return (
    <Image
      // Trimmed variant of appp_logo.png (transparent padding removed) so the
      // rendered box matches the visible mark exactly.
      src="/appp_logo_trimmed.png"
      alt="DeskMind"
      width={439}
      height={101}
      sizes="300px"
      className={`object-contain ${className}`}
      priority={priority}
    />
  );
}
