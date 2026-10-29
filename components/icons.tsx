// Line icons for the menus (24 × 24, stroke = currentColor). Drawn for TAKATAK; no icon library to load.
import type { IconName } from '@/lib/nav';

type Shape = string | [number, number, number]; // path, or circle [cx, cy, r]

const ICONS: Record<IconName, Shape[]> = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  chart: ['M4 20h16', 'M7 16v-5', 'M12 16V6', 'M17 16v-8'],
  register: ['M3 10h18v10H3z', 'M7 10V5h10v5', 'M7 14h3', 'M14 14h3', 'M7 17h10'],
  drawer: ['M3 6h18v13H3z', 'M3 11h18', 'M10 15h4'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', [12, 13, 3.5]],
  device: ['M7 3h10v18H7z', 'M11 18h2'],
  kiosk: ['M6 3h12v12H6z', 'M9 21h6', 'M12 15v6'],
  screen: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.5', 'M3.5 12h.5', 'M3.5 18h.5'],
  book: ['M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z', 'M5 17a3 3 0 013-3h11', 'M9 8h6'],
  tax: ['M19 5L5 19', [7, 7, 2.5], [17, 17, 2.5]],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
  truck: ['M2 6h11v10H2z', 'M13 10h4l4 4v2h-8', [6, 18, 2], [17, 18, 2]],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  users: [[9, 8, 3.5], 'M2 20c0-3.5 3-6 7-6s7 2.5 7 6', 'M16 4.6a3.5 3.5 0 010 6.8', 'M18 14.2c2.4.7 4 2.9 4 5.8'],
  clock: [[12, 12, 9], 'M12 7v5l3 2'],
  calendar: ['M4 5h16v16H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  money: ['M3 6h18v12H3z', [12, 12, 3], 'M6.5 9.5h.01', 'M17.5 14.5h.01'],
  megaphone: ['M3 10v4h4l8 5V5l-8 5z', 'M18.5 9a4 4 0 010 6'],
  tag: ['M3 3h8l10 10-8 8L3 11z', [7.5, 7.5, 1.5]],
  target: [[12, 12, 9], [12, 12, 5], [12, 12, 1]],
  gift: ['M3 8h18v4H3z', 'M5 12h14v9H5z', 'M12 8v13', 'M12 8C10 4 6 4 6 6.5S12 8 12 8', 'M12 8c2-4 6-4 6-1.5S12 8 12 8'],
  card: ['M3 5h18v14H3z', 'M3 10h18', 'M7 15h4'],
  repeat: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 014-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 01-4 4H4'],
  search: [[11, 11, 7], 'M20 20l-4-4'],
  chat: ['M4 4h16v12H9l-5 4z', 'M8 9h8', 'M8 12h5'],
  plus: ['M12 5v14', 'M5 12h14'],
  archive: ['M3 4h18v4H3z', 'M5 8v12h14V8', 'M10 12h4'],
  template: ['M4 4h16v6H4z', 'M4 14h7v6H4z', 'M15 14h5', 'M15 18h5'],
  user: [[12, 8, 4], 'M4 21c0-4 3.6-7 8-7s8 3 8 7'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  bank: ['M3 10l9-6 9 6', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8', 'M3 21h18'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 018 0v4'],
  log: ['M5 3h11l3 3v15H5z', 'M9 9h6', 'M9 13h6', 'M9 17h4'],
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  help: [[12, 12, 9], 'M9.5 9a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4', 'M12 17h.01'],
  store: ['M3 9l2-5h14l2 5z', 'M5 9v11h14V9', 'M10 20v-5h4v5'],
  link: ['M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1', 'M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'],
  out: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  chevron: ['M9 6l6 6-6 6'],
  check: ['M5 12l5 5 9-10'],
  spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6 6l2.5 2.5', 'M15.5 15.5L18 18', 'M6 18l2.5-2.5', 'M15.5 8.5L18 6'],
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name].map((s, i) => (typeof s === 'string' ? <path key={i} d={s} /> : <circle key={i} cx={s[0]} cy={s[1]} r={s[2]} />))}
    </svg>
  );
}
