import type { ReactNode, SVGProps } from "react";
import { cx } from "./cx";

// One stroke icon set (24px grid, 1.75 stroke, round joins). Icons are always decorative:
// the text next to them carries the meaning, so they are hidden from assistive technology.
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Mirror in right-to-left layouts (directional arrows and chevrons only). */
  directional?: boolean;
};

function icon(paths: ReactNode, name: string) {
  function Icon({ className, directional, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={cx("size-5 shrink-0", directional && "rtl:-scale-x-100", className)}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, "CheckIcon");
export const MinusIcon = icon(<path d="M5 12h14" />, "MinusIcon");
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, "PlusIcon");
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />, "CloseIcon");
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />, "ChevronDownIcon");
export const ChevronUpIcon = icon(<path d="M6 15l6-6 6 6" />, "ChevronUpIcon");
/** Points to the inline start; pass `directional` so it mirrors in RTL. */
export const ChevronStartIcon = icon(<path d="M15 6l-6 6 6 6" />, "ChevronStartIcon");
/** Points to the inline end; pass `directional` so it mirrors in RTL. */
export const ChevronEndIcon = icon(<path d="M9 6l6 6-6 6" />, "ChevronEndIcon");
export const ArrowUpIcon = icon(<path d="M12 19V5M6 11l6-6 6 6" />, "ArrowUpIcon");
export const ArrowDownIcon = icon(<path d="M12 5v14M6 13l6 6 6-6" />, "ArrowDownIcon");
export const SortIcon = icon(<path d="M8 9l4-4 4 4M8 15l4 4 4-4" />, "SortIcon");
export const CalendarIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </>,
  "CalendarIcon",
);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 2.5" />
  </>,
  "ClockIcon",
);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>,
  "InfoIcon",
);
export const SuccessIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
  </>,
  "SuccessIcon",
);
export const WarningIcon = icon(
  <>
    <path d="M10.3 4.6L3.6 16.5A2 2 0 0 0 5.3 19.5h13.4a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z" />
    <path d="M12 10v3.5M12 16.5h.01" />
  </>,
  "WarningIcon",
);
export const ErrorIcon = icon(
  <>
    <path d="M8.3 3.5h7.4l5.3 5.3v7.4l-5.3 5.3H8.3L3 16.2V8.8z" />
    <path d="M12 8v5M12 16h.01" />
  </>,
  "ErrorIcon",
);
export const PendingIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" />
    <path d="M12 8v4" />
  </>,
  "PendingIcon",
);
export const NeutralIcon = icon(<circle cx="12" cy="12" r="4" />, "NeutralIcon");
export const ExternalIcon = icon(
  <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  "ExternalIcon",
);
export const SaveIcon = icon(
  <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z" />,
  "SaveIcon",
);
export const CompareIcon = icon(
  <>
    <rect x="3.5" y="5" width="7" height="14" rx="1.5" />
    <rect x="13.5" y="5" width="7" height="14" rx="1.5" />
  </>,
  "CompareIcon",
);
export const NoPhotoIcon = icon(
  <>
    <path d="M3 3l18 18" />
    <path d="M9.5 5H18a2 2 0 0 1 2 2v8.5M17 19H6a2 2 0 0 1-2-2V8" />
    <path d="M4 16l4.5-4.5 3 3M14 12l1.5-1.5L20 15" />
  </>,
  "NoPhotoIcon",
);
export const LockIcon = icon(
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
  "LockIcon",
);
export const SearchIcon = icon(
  <>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </>,
  "SearchIcon",
);
export const FolderIcon = icon(
  <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  "FolderIcon",
);
export const LanguageIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5z" />
  </>,
  "LanguageIcon",
);
export const StampIcon = icon(
  <>
    <path d="M9 13V9.5a3 3 0 1 1 6 0V13" />
    <path d="M5 13h14v3.5H5zM6.5 19.5h11" />
  </>,
  "StampIcon",
);
export const SendIcon = icon(<path d="M4 12l16-7-6 16-2.5-6.5z" />, "SendIcon");
export const HistoryIcon = icon(
  <>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4l3 2" />
  </>,
  "HistoryIcon",
);

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cx("size-5 shrink-0 animate-spin motion-reduce:animate-none", className)}
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
      <path
        d="M20.5 12A8.5 8.5 0 0 0 12 3.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
