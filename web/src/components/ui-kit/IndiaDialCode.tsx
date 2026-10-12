// "+91" prefix for Indian mobile-number fields. The flag is a tiny inline SVG, not the 🇮🇳 emoji: Windows and
// many Android phones have no flag emojis and show the letters "IN" instead, which also wrapped "+91" onto a
// second line and pushed it out of line with the number being typed.
export function IndiaDialCode({ className = "" }: { className?: string }) {
  return (
    <span className={"flex shrink-0 items-center gap-2 self-stretch whitespace-nowrap border-r border-border pr-3 text-sm leading-none font-semibold text-foreground/80 " + className}>
      <svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true" className="shrink-0 rounded-[2px] ring-1 ring-black/10">
        <rect width="18" height="4" fill="#FF9933" />
        <rect y="4" width="18" height="4" fill="#FFFFFF" />
        <rect y="8" width="18" height="4" fill="#138808" />
        <circle cx="9" cy="6" r="1.4" fill="none" stroke="#000080" strokeWidth="0.5" />
      </svg>
      +91
    </span>
  );
}
