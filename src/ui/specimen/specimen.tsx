"use client";

import { parseDate, parseZonedDateTime } from "@internationalized/date";
import { type ReactNode, useState } from "react";
import { localeEndonyms, type PublicLocale, publicLocales } from "@/i18n/config";
import { announce } from "../announce";
import { Breadcrumbs } from "../breadcrumbs";
import { Button } from "../button";
import { Checkbox, CheckboxGroup } from "../checkbox";
import { Chip, ChipList } from "../chip";
import { ComboBox } from "../combobox";
import { DateField, DatePicker } from "../date-picker";
import { Dialog, DialogTrigger } from "../dialog";
import { EmptyState } from "../empty-state";
import { ErrorSummary, type ErrorSummaryItem } from "../error-summary";
import { FactList, FactRow } from "../fact-row";
import { LanguageSwitcher } from "../language-switcher";
import { ExternalAppLink, Link } from "../link";
import { Banner, Notice } from "../notice";
import { NumberField } from "../number-field";
import { LoadMore, Pagination } from "../pagination";
import { Popover } from "../popover";
import { PriceDisplay } from "../price-display";
import { Progress } from "../progress";
import { PropertyCard } from "../property-card";
import { Radio, RadioGroup } from "../radio-group";
import { Receipt } from "../receipt";
import { Select } from "../select";
import { Sheet, useSheet } from "../sheet";
import { Skeleton, SkeletonRegion } from "../skeleton";
import { SkipLink } from "../skip-link";
import { StatusBadge } from "../status-badge";
import { Switch } from "../switch";
import { Table, type TableSort } from "../table";
import { Tabs } from "../tabs";
import { TaskList, TaskRow } from "../task-row";
import { TextArea, TextField } from "../text-field";
import { Timeline, TimelineItem } from "../timeline";
import { Tooltip } from "../tooltip";
import { specimenCopy } from "./copy";

const colourRoles = [
  "canvas",
  "surface",
  "subtle",
  "text",
  "text-muted",
  "border",
  "divider",
  "focus",
  "action",
  "action-hover",
  "action-pressed",
  "link-visited",
  "selected",
  "disabled",
  "success",
  "warning",
  "error",
  "info",
];

const typeRoles = [
  ["title", "text-title font-semibold"],
  ["heading", "text-heading font-semibold"],
  ["subheading", "text-subheading font-semibold"],
  ["body 18/28", "text-body"],
  ["compact 16/24", "text-compact"],
  ["operational 15/22", "text-operational"],
  ["dense 14/20", "text-dense"],
  ["caption 14/20", "text-caption text-text-muted"],
] as const;

// A flat neutral rectangle, clearly a placeholder: the specimen never shows fake property photos.
const placeholderPhoto =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#dfe6ec"/><path d="M0 230 L120 150 L200 205 L280 130 L400 220 L400 300 L0 300Z" fill="#c9d3dc"/></svg>',
  );

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6 border-t border-divider pt-8">
      <h2 id={id} className="text-heading font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Cell({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"}>
      <p className="text-caption font-semibold text-text-muted">{label}</p>
      {children}
    </div>
  );
}

const grid = "grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3";

export function Specimen({ locale }: { locale: PublicLocale }) {
  const copy = specimenCopy(locale);
  const sheet = useSheet();
  const [saved, setSaved] = useState(true);
  const [compared, setCompared] = useState(false);
  const [sort, setSort] = useState<TableSort>({ column: "updated", direction: "descending" });
  const [errors, setErrors] = useState<ErrorSummaryItem[]>([]);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");

  const places = [
    {
      id: "sandanski",
      name: copy.place.names[0],
      region: copy.place.regions[0],
      country: copy.place.country,
    },
    {
      id: "aleksandrovo-burgas",
      name: copy.place.names[1],
      region: copy.place.regions[1],
      country: copy.place.country,
    },
    {
      id: "aleksandrovo-lovech",
      name: copy.place.names[1],
      region: copy.place.regions[2],
      country: copy.place.country,
    },
  ];

  const tableRows = [
    {
      id: "1",
      reference: "MSR-EX-2041",
      place: copy.card.localities[0],
      price: 118000,
      updated: "2026-09-21",
    },
    {
      id: "2",
      reference: "MSR-EX-2042",
      place: copy.card.localities[1],
      price: 164500,
      updated: "2026-09-18",
    },
    {
      id: "3",
      reference: "MSR-EX-2043",
      place: copy.card.localities[2],
      price: 52000,
      updated: "2026-09-23",
    },
  ];
  const sortedRows = [...tableRows].sort((a, b) => {
    const key = sort.column as keyof (typeof tableRows)[number];
    const order = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
    return sort.direction === "ascending" ? order : -order;
  });
  const numberFormat = new Intl.NumberFormat(locale);

  function submitDemoForm() {
    const next: ErrorSummaryItem[] = [];
    if (!formName.trim())
      next.push({ fieldId: "specimen-name", message: copy.validation.nameError });
    if (!formEmail.trim())
      next.push({ fieldId: "specimen-email", message: copy.validation.emailError });
    setErrors(next);
  }

  const errorFor = (fieldId: string) => errors.find((error) => error.fieldId === fieldId)?.message;

  return (
    <div lang={copy.lang} className="text-text">
      <SkipLink targetId="specimen">{copy.skip}</SkipLink>
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-gutter py-3 lg:px-gutter-wide">
          <p className="text-compact font-semibold">MS Realty</p>
          <LanguageSwitcher
            label={copy.language}
            current={locale}
            options={publicLocales.map((l) => ({
              locale: l,
              endonym: localeEndonyms[l],
              href: `/${l}/design`,
            }))}
          />
        </div>
      </header>

      <main
        id="specimen"
        tabIndex={-1}
        className="mx-auto flex max-w-page flex-col gap-12 px-gutter py-10 outline-none lg:px-gutter-wide"
      >
        <div className="flex max-w-prose flex-col gap-3">
          <h1 className="text-title font-semibold">{copy.title}</h1>
          <p className="text-body text-text-muted">{copy.intro}</p>
        </div>

        <Section id="foundations" title={copy.sections.foundations}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" dir="ltr">
            {colourRoles.map((role) => (
              <li key={role} className="flex items-center gap-2 text-dense">
                <span
                  aria-hidden="true"
                  className="size-8 shrink-0 rounded-control border border-border"
                  style={{ backgroundColor: `var(--color-${role})` }}
                />
                <code>{role}</code>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3">
            {typeRoles.map(([name, className]) => (
              <div key={name} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-baseline">
                <p className="text-caption text-text-muted" dir="ltr">
                  {name}
                </p>
                <p className={className}>
                  {copy.card.titles[0]} · {copy.card.localities[0]}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="actions" title={copy.sections.actions}>
          <div className={grid}>
            <Cell label={copy.states.default}>
              <div className="flex flex-wrap gap-3">
                <Button>{copy.button.primary}</Button>
                <Button variant="secondary">{copy.button.secondary}</Button>
                <Button variant="tertiary">{copy.button.tertiary}</Button>
              </div>
            </Cell>
            <Cell label={copy.states.pending}>
              <div className="flex">
                <Button isPending pendingLabel={copy.button.pending}>
                  {copy.button.primary}
                </Button>
              </div>
            </Cell>
            <Cell label={copy.states.disabled}>
              <Button disabledReason={copy.button.disabledReason}>{copy.button.primary}</Button>
            </Cell>
            <Cell label={copy.button.destructive}>
              <DialogTrigger>
                <div className="flex">
                  <Button variant="destructive">{copy.button.destructive}</Button>
                </div>
                <Dialog
                  role="alertdialog"
                  title={copy.overlay.confirmTitle}
                  closeLabel={copy.overlay.close}
                >
                  {(close) => (
                    <>
                      <p className="text-compact">{copy.overlay.confirmBody}</p>
                      <div className="flex flex-wrap justify-end gap-3">
                        <Button variant="secondary" onPress={close}>
                          {copy.overlay.cancel}
                        </Button>
                        <Button variant="destructive" onPress={close}>
                          {copy.overlay.confirmAction}
                        </Button>
                      </div>
                    </>
                  )}
                </Dialog>
              </DialogTrigger>
            </Cell>
            <Cell label="Link">
              <p className="text-body">
                {copy.link.sentence[0]}
                <Link href="#actions">{copy.link.inline}</Link>
                {copy.link.sentence[1]}
              </p>
              <Link href="#property" variant="standalone">
                {copy.link.standalone}
              </Link>
            </Cell>
            <Cell label="ExternalAppLink">
              <ExternalAppLink
                href="https://wa.me/359879696870"
                appName={copy.external.app}
                handoffNote={copy.external.note}
              >
                {copy.external.label}
              </ExternalAppLink>
            </Cell>
          </div>
        </Section>

        <Section id="text" title={copy.sections.text}>
          <div className={grid}>
            <TextField label={copy.field.name} description={copy.field.nameHint} />
            <TextField label={copy.field.message} optionalLabel={copy.field.optional} />
            <TextField
              label={copy.field.email}
              type="email"
              inputDir="ltr"
              defaultValue="name@example"
              isInvalid
              errorMessage={copy.field.emailError}
            />
            <TextField
              label={copy.field.reference}
              inputDir="ltr"
              defaultValue="MSR-EX-2041"
              isReadOnly
              description={copy.states.readOnly}
            />
            <TextField label={copy.field.name} isDisabled description={copy.states.disabled} />
            <TextArea label={copy.field.message} optionalLabel={copy.field.optional} />
            <NumberField
              label={copy.field.area}
              unit="m²"
              description={copy.field.areaHint}
              defaultValue={70}
              minValue={0}
            />
            <NumberField
              label={copy.field.bedrooms}
              defaultValue={2}
              minValue={0}
              maxValue={10}
              isInvalid
              errorMessage={copy.field.bedroomsError}
            />
          </div>
        </Section>

        <Section id="choice" title={copy.sections.choice}>
          <div className={grid}>
            <Select
              label={copy.select.label}
              placeholder={copy.select.placeholder}
              options={copy.select.options.map((label, i) => ({ id: `type-${i}`, label }))}
            />
            <Select
              label={copy.select.label}
              placeholder={copy.select.placeholder}
              isInvalid
              errorMessage={copy.select.error}
              options={copy.select.options.map((label, i) => ({ id: `type-${i}`, label }))}
            />
            <ComboBox
              label={copy.place.label}
              description={copy.place.hint}
              ambiguousHint={copy.place.ambiguous}
              options={places}
            />
            <Cell label={copy.states.default}>
              <Checkbox>{copy.checks.single}</Checkbox>
              <Checkbox defaultSelected>{copy.states.selected}</Checkbox>
              <Checkbox isIndeterminate>{copy.states.indeterminate}</Checkbox>
              <Checkbox isDisabled>{copy.states.disabled}</Checkbox>
              <Checkbox isReadOnly defaultSelected>
                {copy.states.readOnly}
              </Checkbox>
            </Cell>
            <CheckboxGroup
              label={copy.checks.group}
              description={copy.checks.groupHint}
              isInvalid
              errorMessage={copy.checks.error}
            >
              {copy.checks.options.map((option) => (
                <Checkbox key={option} value={option}>
                  {option}
                </Checkbox>
              ))}
            </CheckboxGroup>
            <RadioGroup label={copy.checks.radio} defaultValue="buy">
              <Radio value="buy">{copy.checks.radioOptions[0]}</Radio>
              <Radio value="rent">{copy.checks.radioOptions[1]}</Radio>
              <Radio value="sell" isDisabled>
                {copy.checks.radioOptions[2]}
              </Radio>
            </RadioGroup>
            <Cell label="Switch">
              <Switch defaultSelected>{copy.checks.switchLabel}</Switch>
              <Switch>{copy.checks.switchLabel}</Switch>
              <Switch isDisabled>{copy.states.disabled}</Switch>
            </Cell>
          </div>
        </Section>

        <Section id="dates" title={copy.sections.dates}>
          <div className={grid}>
            <DateField
              label={copy.dates.date}
              timeZoneLabel={copy.dates.timeZone}
              defaultValue={parseDate("2026-11-02")}
            />
            <DatePicker
              label={copy.dates.viewing}
              description={copy.dates.dateHint}
              timeZoneLabel={copy.dates.timeZone}
              granularity="minute"
              defaultValue={parseZonedDateTime("2026-10-02T10:30[Europe/Sofia]")}
            />
            <DatePicker
              label={copy.dates.date}
              timeZoneLabel={copy.dates.timeZone}
              isInvalid
              errorMessage={copy.dates.dateError}
            />
          </div>
        </Section>

        <Section id="overlays" title={copy.sections.overlays}>
          <div className="flex flex-wrap items-start gap-4">
            <DialogTrigger>
              <Button variant="secondary">{copy.overlay.openDialog}</Button>
              <Dialog title={copy.overlay.dialogTitle} closeLabel={copy.overlay.close}>
                <p className="text-compact">{copy.overlay.dialogBody}</p>
                <TextField label={copy.field.email} type="email" inputDir="ltr" />
              </Dialog>
            </DialogTrigger>
            <Button variant="secondary" onPress={sheet.open}>
              {copy.overlay.openSheet}
            </Button>
            <DialogTrigger>
              <Button variant="tertiary">{copy.overlay.openPopover}</Button>
              <Popover title={copy.overlay.popoverTitle}>{copy.overlay.popoverBody}</Popover>
            </DialogTrigger>
            <Tooltip content={copy.overlay.tooltip}>
              <Button variant="secondary">{copy.overlay.tooltipTrigger}</Button>
            </Tooltip>
          </div>
          <Sheet
            state={sheet}
            title={copy.overlay.sheetTitle}
            closeLabel={copy.overlay.close}
            footer={
              <>
                <Button variant="tertiary" onPress={sheet.close}>
                  {copy.overlay.clear}
                </Button>
                <Button onPress={sheet.close}>{copy.overlay.apply}</Button>
              </>
            }
          >
            <div className="flex flex-col gap-6">
              <p className="text-compact">{copy.overlay.sheetBody}</p>
              <CheckboxGroup label={copy.checks.group}>
                {copy.checks.options.map((option) => (
                  <Checkbox key={option} value={option}>
                    {option}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            </div>
          </Sheet>
        </Section>

        <Section id="validation" title={copy.sections.validation}>
          <form
            noValidate
            className="flex max-w-xl flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              submitDemoForm();
            }}
          >
            <ErrorSummary title={copy.validation.summaryTitle} errors={errors} />
            <TextField
              id="specimen-name"
              label={copy.validation.formName}
              value={formName}
              onChange={setFormName}
              isRequired
              validationBehavior="aria"
              isInvalid={Boolean(errorFor("specimen-name"))}
              errorMessage={errorFor("specimen-name")}
            />
            <TextField
              id="specimen-email"
              label={copy.validation.formEmail}
              type="email"
              inputDir="ltr"
              value={formEmail}
              onChange={setFormEmail}
              isRequired
              validationBehavior="aria"
              isInvalid={Boolean(errorFor("specimen-email"))}
              errorMessage={errorFor("specimen-email")}
            />
            <div>
              <Button type="submit">{copy.validation.submit}</Button>
            </div>
          </form>
        </Section>

        <Section id="status" title={copy.sections.status}>
          <div className={grid}>
            <Cell label="availability">
              <StatusBadge
                family="availability"
                tone="positive"
                label={copy.status.availability[0]}
              />
              <StatusBadge
                family="availability"
                tone="attention"
                label={copy.status.availability[1]}
              />
              <StatusBadge family="availability" tone="info" label={copy.status.availability[2]} />
              <StatusBadge
                family="availability"
                tone="neutral"
                label={copy.status.availability[3]}
              />
            </Cell>
            <Cell label="approval">
              <StatusBadge family="approval" tone="positive" label={copy.status.approval[0]} />
              <StatusBadge family="approval" tone="pending" label={copy.status.approval[1]} />
              <StatusBadge family="approval" tone="attention" label={copy.status.approval[2]} />
            </Cell>
            <Cell label="delivery">
              <StatusBadge family="delivery" tone="positive" label={copy.status.delivery[0]} />
              <StatusBadge family="delivery" tone="info" label={copy.status.delivery[1]} />
              <StatusBadge family="delivery" tone="negative" label={copy.status.delivery[2]} />
              <StatusBadge family="delivery" tone="pending" label={copy.status.delivery[3]} />
            </Cell>
            <Cell label="assist">
              <StatusBadge family="approval" tone="draft" label={copy.criteria.draft} />
              <ChipList label={copy.criteria.label}>
                {copy.criteria.assist.map((label) => (
                  <Chip
                    key={label}
                    kind="assist"
                    label={label}
                    removeLabel={copy.criteria.remove}
                    onRemove={() => {}}
                  />
                ))}
                <Chip kind="question" label={copy.criteria.question} onPress={() => {}} />
                <Chip kind="add" label={copy.criteria.add} onPress={() => {}} />
              </ChipList>
            </Cell>
          </div>
          <div className="flex flex-col gap-3">
            <Notice tone="info" title={copy.status.notices.info} />
            <Notice tone="success" title={copy.status.notices.success} />
            <Notice tone="warning" title={copy.status.notices.warning} />
            <Notice
              tone="error"
              title={copy.status.notices.error}
              action={<Button variant="secondary">{copy.status.notices.action}</Button>}
            >
              {copy.status.notices.body}
            </Notice>
          </div>
          <Banner tone="warning" title={copy.status.banner}>
            {copy.status.bannerBody}
          </Banner>
          <div className="max-w-2xl">
            <Receipt
              title={copy.receipt.title}
              referenceLabel={copy.receipt.referenceLabel}
              reference="INQ-EX-58213"
              recordedAtLabel={copy.receipt.recordedAtLabel}
              recordedAt={{
                dateTime: "2026-09-24T14:05:00+03:00",
                label: copy.receipt.recordedAt,
              }}
              headingLevel={3}
              actions={
                <Link href="#property" variant="standalone">
                  {copy.receipt.action}
                </Link>
              }
            >
              <p>{copy.receipt.next}</p>
            </Receipt>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <EmptyState
              kind="new"
              headingLevel={3}
              title={copy.empty.newTitle}
              action={<Button>{copy.empty.newAction}</Button>}
            >
              {copy.empty.newBody}
            </EmptyState>
            <EmptyState
              kind="filtered"
              headingLevel={3}
              title={copy.empty.filteredTitle}
              criteria={copy.empty.filteredCriteria.map((criterion) => (
                <span
                  key={criterion}
                  className="rounded-control border border-border bg-surface px-2 py-0.5 text-caption"
                >
                  {criterion}
                </span>
              ))}
              action={<Button variant="secondary">{copy.empty.filteredAction}</Button>}
            >
              {copy.empty.filteredBody}
            </EmptyState>
            <EmptyState
              kind="failed"
              headingLevel={3}
              title={copy.empty.failedTitle}
              reference={copy.empty.failedReference}
              action={<Button variant="secondary">{copy.empty.failedAction}</Button>}
            >
              {copy.empty.failedBody}
            </EmptyState>
            <EmptyState
              kind="inaccessible"
              headingLevel={3}
              title={copy.empty.inaccessibleTitle}
              action={<Link href="#specimen">{copy.empty.inaccessibleAction}</Link>}
            >
              {copy.empty.inaccessibleBody}
            </EmptyState>
          </div>
          <div className={grid}>
            <Cell label="Skeleton">
              <SkeletonRegion label={copy.loading.skeleton}>
                <Skeleton className="aspect-[4/3] w-full rounded-card" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </SkeletonRegion>
            </Cell>
            <Cell label="Progress">
              <Progress
                label={copy.loading.progress}
                value={40}
                completeLabel={copy.loading.progressDone}
              />
              <Progress label={copy.loading.indeterminate} />
            </Cell>
            <Cell label="announce()">
              <div className="flex">
                <Button variant="secondary" onPress={() => announce(copy.loading.announced)}>
                  {copy.loading.announce}
                </Button>
              </div>
            </Cell>
          </div>
        </Section>

        <Section id="property" title={copy.sections.property}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <FactList>
              <FactRow
                label={copy.facts.area}
                value={numberFormat.format(86)}
                unit={copy.lang === "he" ? "מ״ר" : copy.lang === "bg" ? "м²" : "m²"}
                basis={copy.facts.areaBasis}
                provenance={copy.facts.areaSource}
                unknownLabel={copy.facts.unknown}
              />
              <FactRow
                label={copy.facts.bedrooms}
                value={numberFormat.format(2)}
                unknownLabel={copy.facts.unknown}
              />
              <FactRow
                label={copy.facts.lift}
                unknownLabel={copy.facts.unknown}
                confirmAction={<Link href="#validation">{copy.facts.ask}</Link>}
              />
            </FactList>
            <div className="flex flex-col gap-4">
              <PriceDisplay
                price={{ amountMinor: 11_800_000, currency: "EUR" }}
                locale={locale}
                basis={copy.price.vat}
                onRequestLabel={copy.price.onRequest}
                size="detail"
              />
              <PriceDisplay
                price={{ amountMinor: 45_050, currency: "EUR" }}
                locale={locale}
                periodLabel={copy.price.perMonth}
                onRequestLabel={copy.price.onRequest}
              />
              <PriceDisplay price={null} locale={locale} onRequestLabel={copy.price.onRequest} />
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <li>
              <PropertyCard
                href="#property"
                title={copy.card.titles[0]}
                price={
                  <PriceDisplay
                    price={{ amountMinor: 11_800_000, currency: "EUR" }}
                    locale={locale}
                    onRequestLabel={copy.price.onRequest}
                  />
                }
                locality={copy.card.localities[0]}
                facts={copy.card.facts[0]}
                meta={copy.card.meta[0]}
                availability={
                  <StatusBadge
                    family="availability"
                    tone="positive"
                    label={copy.card.availability[0]}
                  />
                }
                highlights={copy.card.highlights}
                image={
                  // biome-ignore lint/performance/noImgElement: an inline placeholder needs no optimisation.
                  <img src={placeholderPhoto} alt={copy.card.photoAlt} width={400} height={300} />
                }
                noPhotoLabel={copy.card.noPhoto}
                saveLabel={copy.card.save}
                compareLabel={copy.card.compare}
                isSaved={saved}
                onSavedChange={setSaved}
                isCompared={compared}
                onComparedChange={setCompared}
              />
            </li>
            <li>
              <PropertyCard
                href="#property"
                title={copy.card.titles[1]}
                price={
                  <PriceDisplay
                    price={null}
                    locale={locale}
                    onRequestLabel={copy.price.onRequest}
                  />
                }
                locality={copy.card.localities[1]}
                facts={copy.card.facts[1]}
                meta={copy.card.meta[1]}
                availability={
                  <StatusBadge
                    family="availability"
                    tone="attention"
                    label={copy.card.availability[1]}
                  />
                }
                noPhotoLabel={copy.card.noPhoto}
                saveLabel={copy.card.save}
                compareLabel={copy.card.compare}
              />
            </li>
            <li>
              <PropertyCard
                href="#property"
                title={copy.card.titles[2]}
                price={
                  <PriceDisplay
                    price={{ amountMinor: 45_050, currency: "EUR" }}
                    locale={locale}
                    periodLabel={copy.price.perMonth}
                    onRequestLabel={copy.price.onRequest}
                  />
                }
                locality={copy.card.localities[2]}
                facts={copy.card.facts[2]}
                meta={copy.card.meta[2]}
                noPhotoLabel={copy.card.noPhoto}
                saveLabel={copy.card.save}
                compareLabel={copy.card.compare}
              />
            </li>
          </ul>
        </Section>

        <Section id="work" title={copy.sections.work}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <TaskList label={copy.tasks.label}>
              <TaskRow
                href="#work"
                action={copy.tasks.rows[0]}
                reason={copy.tasks.reason}
                owner={copy.tasks.owner}
                due={{ dateTime: "2026-09-24T12:00:00+03:00", label: copy.tasks.due }}
                overdueLabel={copy.tasks.overdue}
                severity="due"
              />
              <TaskRow
                href="#work"
                action={copy.tasks.rows[1]}
                owner={copy.tasks.unassigned}
                isUnassigned
                severity="consequential"
              />
              <TaskRow
                href="#work"
                action={copy.tasks.rows[2]}
                owner={copy.tasks.owner}
                waitingFor={copy.tasks.waiting}
                status={
                  <StatusBadge family="approval" tone="pending" label={copy.status.approval[1]} />
                }
              />
              <TaskRow
                href="#work"
                action={copy.tasks.rows[3]}
                owner={copy.tasks.owner}
                completedEvidence={copy.tasks.done}
              />
            </TaskList>
            <Timeline label={copy.timeline.label}>
              <TimelineItem
                title={copy.timeline.events[0]}
                actor={copy.timeline.actor}
                source={copy.timeline.source}
                time={{ dateTime: "2026-09-24T09:12:00+03:00", label: copy.timeline.time }}
                consequence={<Link href="#work">{copy.timeline.consequence}</Link>}
              />
              <TimelineItem
                kind="correction"
                kindLabel={copy.timeline.kinds.correction}
                title={copy.timeline.events[1]}
                actor={copy.timeline.actor}
                time={{ dateTime: "2026-09-24T09:12:00+03:00", label: copy.timeline.time }}
              />
              <TimelineItem
                kind="restricted"
                kindLabel={copy.timeline.kinds.restricted}
                title={copy.timeline.events[2]}
                time={{ dateTime: "2026-09-24T09:12:00+03:00", label: copy.timeline.time }}
              />
              <TimelineItem
                kind="delayed"
                kindLabel={copy.timeline.kinds.delayed}
                title={copy.timeline.events[3]}
                time={{ dateTime: "2026-09-24T09:12:00+03:00", label: copy.timeline.time }}
              />
            </Timeline>
          </div>
        </Section>

        <Section id="navigation" title={copy.sections.navigation}>
          <Breadcrumbs
            label={copy.breadcrumbs.label}
            items={copy.breadcrumbs.items.map((label, i) => ({
              id: `crumb-${i}`,
              label,
              href: "#navigation",
            }))}
          />
          <Tabs
            label={copy.tabs.label}
            items={copy.tabs.items.map((label, i) => ({
              id: `tab-${i}`,
              label,
              content: <p>{copy.tabs.panels[i]}</p>,
            }))}
          />
          <Table
            caption={copy.table.caption}
            rowHeader="reference"
            sort={sort}
            onSortChange={setSort}
            columns={[
              { key: "reference", label: copy.table.columns[0] },
              { key: "place", label: copy.table.columns[1], isSortable: true },
              { key: "price", label: copy.table.columns[2], isSortable: true, isNumeric: true },
              { key: "updated", label: copy.table.columns[3], isSortable: true },
            ]}
            rows={sortedRows.map((row) => ({
              id: row.id,
              reference: <bdi>{row.reference}</bdi>,
              place: row.place,
              price: numberFormat.format(row.price),
              updated: (
                <time dateTime={row.updated}>
                  {new Date(`${row.updated}T12:00:00Z`).toLocaleDateString(locale, {
                    timeZone: "Europe/Sofia",
                  })}
                </time>
              ),
            }))}
          />
          <Pagination
            label={copy.pagination.label}
            page={3}
            pageCount={9}
            hrefFor={(page) => `?page=${page}`}
            previousLabel={copy.pagination.previous}
            nextLabel={copy.pagination.next}
            pageLabel={(page) => `${copy.pagination.page} ${page}`}
          />
          <LoadMore
            statusLabel={copy.loadMore.status}
            label={copy.loadMore.label}
            pendingLabel={copy.loadMore.pending}
            hasMore
            onLoadMore={() => {}}
          />
        </Section>
      </main>
    </div>
  );
}
