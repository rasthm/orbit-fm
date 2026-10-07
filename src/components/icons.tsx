type P = { size?: number };

const svg = (d: preact.ComponentChildren) =>
  ({ size = 22 }: P) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {d}
    </svg>
  );

export const IconPlay = svg(<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />);
export const IconPause = svg(<><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>);
export const IconNext = svg(<><path d="M5 5v14l10-7z" fill="currentColor" stroke="none" /><line x1="19" y1="5" x2="19" y2="19" /></>);
export const IconPrev = svg(<><path d="M19 5v14L9 12z" fill="currentColor" stroke="none" /><line x1="5" y1="5" x2="5" y2="19" /></>);
export const IconSearch = svg(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></>);
export const IconClose = svg(<><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>);
export const IconHeart = svg(<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />);
export const IconHeartFill = svg(<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" />);
export const IconShuffle = svg(<><path d="M3 7h3.5c2 0 3 1 4.5 3.5l2 3.5c1.5 2.5 2.5 3 4.5 3H21" /><path d="M3 17h3.5c1.4 0 2.3-.5 3.2-1.6" /><path d="M14.3 8.6C15.2 7.5 16 7 17.5 7H21" /><path d="M18 4l3 3-3 3" /><path d="M18 14l3 3-3 3" /></>);
export const IconLibrary = svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IconTarget = svg(<><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><line x1="12" y1="1" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="23" /><line x1="1" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="23" y2="12" /></>);
export const IconChevronDown = svg(<path d="M6 9l6 6 6-6" />);
export const IconMoon = svg(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />);
export const IconPin = svg(<><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>);
