import Image from "next/image";

interface BotAvatarProps {
  avatar: string | null | undefined;
  name: string;
  className?: string;
}

export function BotAvatar({ avatar, name, className = "" }: BotAvatarProps) {
  if (avatar) {
    return (
      <Image
        src={avatar}
        alt={name}
        width={40}
        height={40}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }

  const initial = name?.[0]?.toUpperCase() || "B";
  return (
    <div
      className={`rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
}
