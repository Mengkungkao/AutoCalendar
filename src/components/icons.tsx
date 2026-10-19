type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4M8.5 14.5l2.5 2.5 4.5-4.5" />
    </svg>
  );
}

export function PhotoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function CarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M5 17h14M5 17v2M19 17v2M3.5 13.5l2-5.2A2 2 0 0 1 7.4 7h9.2a2 2 0 0 1 1.9 1.3l2 5.2M3.5 13.5h17v3.5h-17z" />
      <circle cx="7.5" cy="15.2" r=".6" />
      <circle cx="16.5" cy="15.2" r=".6" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}

export function BriefcaseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3.5v11.5M7 10.5l5 5 5-5M4.5 19.5h15" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4.5M12 17h.01" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`ac-spinner ${className ?? ""}`} {...base}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
