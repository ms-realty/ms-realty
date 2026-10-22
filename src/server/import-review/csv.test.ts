import { describe, expect, it } from "vitest";
import { CsvError, csvLimits, emptyMapping, parseCsv, previewRows, validateMapping } from "./csv";

const mapping = {
  ...emptyMapping(),
  reference: 0,
  title: 1,
  price: 2,
  currency: 3,
  area: 4,
  bedrooms: 5,
  sourceUrl: 6,
};
describe("W12 CSV preview source fidelity and bounds", () => {
  it("handles BOM, CRLF, semicolons, quoted delimiters/newlines and escaped quotes without changing source cells", () => {
    expect(
      parseCsv('\uFEFFreference;title\r\nMS-1;"Exact; title\r\nwith ""quote"""\r\n', ";"),
    ).toEqual({
      headers: ["reference", "title"],
      rows: [{ number: 2, cells: ["MS-1", 'Exact; title\r\nwith "quote"'] }],
    });
  });
  it.each([
    'reference,title\na,"unfinished',
    'reference,title\na,b"c',
    'reference,title\na,"b"junk',
  ])("rejects malformed quoting: %s", (source) =>
    expect(() => parseCsv(source, ",")).toThrow(CsvError),
  );
  it("rejects too many bytes, rows, columns, long cells, NUL and header-only files", () => {
    for (const source of [
      "я".repeat(csvLimits.bytes),
      `a\n${"x\n".repeat(csvLimits.rows + 1)}`,
      `${Array.from({ length: 33 }, () => "a").join(",")}\nx`,
      `a\n${"x".repeat(csvLimits.cell + 1)}`,
      "a\nx\0",
      "reference,title\n",
    ])
      expect(() => parseCsv(source, ",")).toThrow(CsvError);
  });
  it("rejects forged, missing, reused and out-of-range column mapping", () => {
    for (const value of [
      null,
      {},
      { ...mapping, reference: -1 },
      { ...mapping, title: 0 },
      { ...mapping, area: 99 },
      { ...mapping, publish: 1 },
    ])
      expect(() => validateMapping(value, 7)).toThrow(CsvError);
  });
  it("reports actual row issues, preserves exact values and treats formulas only as inert text", () => {
    const document = parseCsv(
      'reference,title,price,currency,area,bedrooms,sourceUrl\nMS-1,"  Exact name  ",1 200,eur,,2,https://example.test/a\nMS-1,=HYPERLINK(""bad""),100,EUR,70,2,javascript:alert(1)\nMS-3,,,EUR,unknown,2.5,\nMS-4,Safe,1200.50,EUR,72.2,2,https://example.test/b'.replace(
        '=HYPERLINK(""bad"")',
        "=1+1",
      ),
      ",",
    );
    const rows = previewRows(document, mapping);
    expect(rows[0]?.values).toMatchObject({
      title: "  Exact name  ",
      price: "1 200",
      currency: "eur",
    });
    expect(rows[0]?.issues).toEqual(
      expect.arrayContaining([
        { code: "number", field: "price" },
        { code: "currency", field: "currency" },
        { code: "duplicate", field: "reference" },
      ]),
    );
    expect(rows[1]?.values.title).toBe("=1+1");
    expect(rows[1]?.issues).toEqual(
      expect.arrayContaining([
        { code: "formula", column: 1 },
        { code: "url", field: "sourceUrl" },
      ]),
    );
    expect(rows[2]?.issues).toEqual(
      expect.arrayContaining([
        { code: "required", field: "title" },
        { code: "number", field: "area" },
        { code: "number", field: "bedrooms" },
      ]),
    );
    expect(rows[3]?.issues).toEqual([]);
  });
});
