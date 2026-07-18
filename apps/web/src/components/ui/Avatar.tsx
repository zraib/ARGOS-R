import { initials } from "@/lib/data/users";

/** Avatar : photo de profil si disponible, sinon initiales sur pastille dorée. */
export function Avatar({ nom, photo, size = 36, className = "" }: { nom: string; photo?: string; size?: number; className?: string }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={nom}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-or-500 font-bold text-rdia-600 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials(nom)}
    </span>
  );
}
