import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RouteLoading } from "./route-loading";

afterEach(cleanup);
it.each([
  ["list", "Loading the list…"],
  ["record", "Loading the record…"],
  ["listing", "Loading the listing…"],
] as const)("shows one truthful %s loading status and no enabled consequences", (kind, status) => {
  const { container } = render(
    <RouteLoading locale="en" kind={kind} shape={{ frame: "px-gutter", heading: "h-10" }} />,
  );
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent(status);
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThan(3);
  expect(container.querySelector("button, input, form, img")).toBeNull();
  expect(container.textContent).not.toMatch(/MS-\d|€|0 results/);
});

it("keeps the inquiry list beside a loading inquiry on wide screens", () => {
  const { container } = render(
    <RouteLoading
      locale="bg"
      kind="record"
      shape={{ frame: "px-gutter", heading: "h-10", queue: true }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Зареждаме записа…");
  expect(
    container.querySelector(".lg\\:grid-cols-\\[17\\.5rem_minmax\\(0\\,1fr\\)\\]"),
  ).not.toBeNull();
});
