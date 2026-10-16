import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NativeForm } from "./native-form";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows progress on a slow native POST and prevents another submission", () => {
  document.documentElement.lang = "en";
  const { container } = render(
    <NativeForm action="/submit">
      <input name="reason" defaultValue="Keep this draft" />
      <button type="submit" name="intent" value="save">
        Save
      </button>
    </NativeForm>,
  );
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing form");
  const first = new Event("submit", { bubbles: true, cancelable: true });
  act(() => {
    form.dispatchEvent(first);
  });
  expect(first.defaultPrevented).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent("Submitting…");
  const duplicate = new Event("submit", { bubbles: true, cancelable: true });
  act(() => {
    form.dispatchEvent(duplicate);
  });
  expect(duplicate.defaultPrevented).toBe(true);
  expect(new FormData(form).get("reason")).toBe("Keep this draft");
  act(() => {
    window.dispatchEvent(new Event("pageshow"));
  });
  expect(screen.queryByRole("status")).toBeNull();
});
it("reports upload bytes and checking separately, and retains an uncertain result without retrying", () => {
  const requests: FakeRequest[] = [];
  class FakeRequest {
    upload = { onprogress: (_event: unknown) => {}, onload: () => {} };
    onerror = () => {};
    ontimeout = () => {};
    onload = () => {};
    open = vi.fn();
    send = vi.fn();
    abort = vi.fn();
    constructor() {
      requests.push(this);
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
  document.documentElement.lang = "en";
  const { container } = render(
    <NativeForm action="/upload" encType="multipart/form-data">
      <input name="intent" defaultValue="upload" />
      <button type="submit">Upload</button>
    </NativeForm>,
  );
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing upload form");
  fireEvent.submit(form);
  const request = requests[0];
  if (!request) throw new Error("Upload was not started");
  expect(request.send).toHaveBeenCalledOnce();
  const body = request.send.mock.calls[0]?.[0];
  if (!(body instanceof FormData)) throw new Error("Missing upload data");
  expect(body.get("intent")).toBe("upload");
  expect(screen.getByRole("button")).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();
  act(() => {
    request.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  });
  expect(screen.getByRole("progressbar")).toHaveValue(50);
  act(() => {
    request.upload.onload();
  });
  expect(screen.getByRole("status")).toHaveTextContent("Checking the file…");
  act(() => {
    request.onerror();
  });
  expect(screen.getByRole("status")).toHaveTextContent("could not confirm the result");
  expect(screen.getByRole("link", { name: "Check the record" })).toBeVisible();
  fireEvent.submit(form);
  expect(requests).toHaveLength(1);
});
