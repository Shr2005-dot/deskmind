"use client";

import Image from "next/image";

interface LogoProps {
  className?: string;
  priority?: boolean;
}

export function Logo({ className = "", priority = false }: LogoProps) {
  return (
    <Image
      src="/Besidelogo-removebg-preview-bg-removed.png"
      alt="DeskMind"
      width={200}
      height={60}
      className={`object-contain ${className}`}
      priority={priority}
    />
  );
}
