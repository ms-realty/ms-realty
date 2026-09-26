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

export const HomeIcon = icon(
  <path d="M4 11l8-6.5 8 6.5M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5" />,
  "HomeIcon",
);
export const InboxIcon = icon(
  <path d="M4 13.5l2.5-8h11l2.5 8M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />,
  "InboxIcon",
);
export const CaseIcon = icon(
  <>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
    <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17" />
  </>,
  "CaseIcon",
);
export const BuildingIcon = icon(
  <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V20M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V20M3.5 20h17M8.5 8h3M8.5 11.5h3M8.5 15h3" />,
  "BuildingIcon",
);
/** Marks interpreted criteria and AI drafts: content a person still has to review. */
export const AssistIcon = icon(
  <>
    <path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z" />
    <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </>,
  "AssistIcon",
);
export const MapIcon = icon(
  <path d="M9 5L3.5 7v12L9 17l6 2 5.5-2V5L15 7 9 5zM9 5v12M15 7v12" />,
  "MapIcon",
);
export const FiltersIcon = icon(
  <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" />,
  "FiltersIcon",
);
export const PhoneIcon = icon(
  <path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 6a2 2 0 0 1 2-2z" />,
  "PhoneIcon",
);
export const MessageIcon = icon(
  <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5z" />,
  "MessageIcon",
);
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </>,
  "UserIcon",
);
export const BedIcon = icon(
  <path d="M3.5 18.5v-12M3.5 14h17v4.5M20.5 14v-2.5A2.5 2.5 0 0 0 18 9h-7v5M7.5 11.5h.01" />,
  "BedIcon",
);
export const AreaIcon = icon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 9h3M4 14h3M9 4v3M14 4v3" />
  </>,
  "AreaIcon",
);
export const PinIcon = icon(
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </>,
  "PinIcon",
);
export const PhotoIcon = icon(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-5 4 4 2.5-2.5L20 18" />
  </>,
  "PhotoIcon",
);
/** Points to the inline end; pass `directional` so it mirrors in RTL. */
export const ArrowEndIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />, "ArrowEndIcon");

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
