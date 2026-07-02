import { cn } from "@/lib/utils";

interface UserAvatarProps {
  photoURL?: string;
  name?: string;
  isPresent?: boolean;
  isTraveling?: boolean;
  size?: number;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  showPresence?: boolean;
}

export function UserAvatar({
  photoURL,
  name = "",
  isPresent = true,
  isTraveling = false,
  size = 40,
  className,
  imgClassName,
  fallbackClassName,
  showPresence = true,
}: UserAvatarProps) {
  const sizeStyle = { width: size, height: size };
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Indicador maior quando em viagem para ficar visível
  const dotSize = isTraveling
    ? Math.max(14, Math.round(size * 0.4))
    : Math.max(10, Math.round(size * 0.3));
  const dotOffset = Math.round(size * 0.08);

  return (
    <div className={cn("relative inline-flex", className)} style={sizeStyle}>
      <div
        className="w-full h-full rounded-full overflow-hidden flex items-center justify-center shrink-0"
        style={sizeStyle}
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt={name}
            className={cn("w-full h-full object-cover", imgClassName)}
          />
        ) : (
          <div
            className={cn(
              "w-full h-full bg-primary-container flex items-center justify-center text-on-primary font-bold",
              fallbackClassName
            )}
            style={{ fontSize: Math.max(12, size * 0.4) }}
          >
            {initials || (
              <span className="material-symbols-outlined" style={{ fontSize: size * 0.5 }}>
                person
              </span>
            )}
          </div>
        )}
      </div>
      {showPresence && (
        <span
          className={cn(
            "absolute rounded-full border-2 border-surface z-10 flex items-center justify-center",
            isTraveling ? "bg-red-500" : isPresent ? "bg-emerald-500" : "bg-amber-500"
          )}
          style={{
            width: dotSize,
            height: dotSize,
            bottom: -dotOffset,
            right: -dotOffset,
          }}
          title={isTraveling ? "Em viagem" : isPresent ? "Presente" : "Ausente"}
        >
          {isTraveling && dotSize >= 14 && (
            <span className="material-symbols-outlined text-white" style={{ fontSize: Math.max(8, dotSize * 0.6) }}>
              flight
            </span>
          )}
        </span>
      )}
    </div>
  );
}
