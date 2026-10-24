import {
  AssistIcon,
  BuildingIcon,
  CalendarIcon,
  CaseIcon,
  DocumentIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  InboxIcon,
  LockIcon,
  MessageIcon,
  UserIcon,
} from "@/ui/icons";

/** Reuse the product's stroke icons; the adjacent destination name carries the meaning. */
export function NavigationIcon({ name }: { name: string }) {
  const Icon =
    {
      today: HomeIcon,
      inquiries: InboxIcon,
      cases: CaseIcon,
      inventory: BuildingIcon,
      calendar: CalendarIcon,
      tasks: DocumentIcon,
      contacts: UserIcon,
      butler: AssistIcon,
      moreTools: FolderIcon,
      imports: BuildingIcon,
      coverage: CaseIcon,
      inbound: InboxIcon,
      keys: LockIcon,
      complaints: MessageIcon,
      pages: DocumentIcon,
      team: UserIcon,
      system: LockIcon,
      jobs: HistoryIcon,
      history: HistoryIcon,
      privacy: LockIcon,
      alerts: MessageIcon,
      profile: UserIcon,
    }[name] ?? DocumentIcon;
  return <Icon />;
}
