import type { ReactNode } from "react";
import { cx } from "@/ui/cx";
import styles from "./staff-ui.module.css";

/** Staff-only density primitives. Native controls, labels and semantics remain caller-owned. */
export const staffUi = styles;

export function StaffPage({
  title,
  lead,
  actions,
  reference,
  children,
  className,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  reference?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(styles.page, className)}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{title}</h1>
          {reference ? (
            <p data-workflow-reference>
              <bdi>{reference}</bdi>
            </p>
          ) : null}
          {lead ? <p>{lead}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.pageBody}>{children}</div>
    </div>
  );
}

export function StaffPanel({
  title,
  lead,
  actions,
  children,
  className,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(styles.panel, className)}>
      <header className={styles.panelHeader}>
        <div>
          <h2>{title}</h2>
          {lead ? <p>{lead}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

/** Visual grouping only: callers retain ordinary native navigation and form semantics. */
export function StaffToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.toolbar, className)}>{children}</div>;
}
