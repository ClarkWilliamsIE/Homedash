// components/home/icons.tsx
import React from 'react';

type P = { className?: string };
const S: React.FC<P & { children: React.ReactNode; fill?: boolean }> = ({ className = 'w-5 h-5', children, fill }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const HomeIcons = {
  Home: (p: P) => <S {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></S>,
  Bulb: (p: P) => <S {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></S>,
  Music: (p: P) => <S {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></S>,
  Play: (p: P) => <S {...p} fill><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14Z" /></S>,
  Pause: (p: P) => <S {...p} fill><rect x="6" y="4" width="4" height="16" rx="1.2" /><rect x="14" y="4" width="4" height="16" rx="1.2" /></S>,
  Next: (p: P) => <S {...p} fill><path d="M5 5.5v13a1 1 0 0 0 1.55.83l9-6.5a1 1 0 0 0 0-1.66l-9-6.5A1 1 0 0 0 5 5.5Z" /><rect x="17" y="5" width="2.5" height="14" rx="1" /></S>,
  Prev: (p: P) => <S {...p} fill><path d="M19 5.5v13a1 1 0 0 1-1.55.83l-9-6.5a1 1 0 0 1 0-1.66l9-6.5A1 1 0 0 1 19 5.5Z" /><rect x="4.5" y="5" width="2.5" height="14" rx="1" /></S>,
  Volume: (p: P) => <S {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></S>,
  Mute: (p: P) => <S {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></S>,
  Chef: (p: P) => <S {...p}><path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6.1Z" /><path d="M6 17h12" /></S>,
  Power: (p: P) => <S {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></S>,
  Plus: (p: P) => <S {...p}><path d="M12 5v14" /><path d="M5 12h14" /></S>,
  Chevron: (p: P) => <S {...p}><path d="m9 18 6-6-6-6" /></S>,
  Sparkle: (p: P) => <S {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></S>,
  Cart: (p: P) => <S {...p}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></S>,
  Moon: (p: P) => <S {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></S>,
  Radio: (p: P) => <S {...p}><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" /></S>,
  Speaker: (p: P) => <S {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><path d="M12 6h.01" /></S>,
  Gear: (p: P) => <S {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></S>,
  Trash: (p: P) => <S {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></S>,
  Up: (p: P) => <S {...p}><path d="m18 15-6-6-6 6" /></S>,
  Down: (p: P) => <S {...p}><path d="m6 9 6 6 6-6" /></S>,
  Edit: (p: P) => <S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></S>,
  Timer: (p: P) => <S {...p}><path d="M10 2h4" /><path d="M12 14l3-3" /><circle cx="12" cy="14" r="8" /></S>,
  Bell: (p: P) => <S {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></S>,
  Calendar: (p: P) => <S {...p}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></S>,
  Expand: (p: P) => <S {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></S>,
  Party: (p: P) => <S {...p}><path d="M5.8 11.3 2 22l10.7-3.8" /><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01" /><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" /><path d="M11 13a8 8 0 0 0-5.2-1.7" /><path d="M11 13c-.6-2.4-1.8-4.1-3.8-5" /></S>,
};
