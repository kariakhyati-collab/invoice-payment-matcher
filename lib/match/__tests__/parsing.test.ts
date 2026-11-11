import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../csv";
import { addDays, daysBetween, parseDate } from "../dates";
import { centsToDecimal, formatMoney, parseAmount } from "../money";

describe("parseCsv", () => {
  it("parses simple rows and drops blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps commas, quotes and line breaks inside quoted fields", () => {
    const text = 'customer,amount,memo\n"Halcyon Dental Group, P.C.","$1,450.00","He said ""paid""\nline two"\n';
    expect(parseCsv(text)).toEqual([
      ["customer", "amount", "memo"],
      ["Halcyon Dental Group, P.C.", "$1,450.00", 'He said "paid"\nline two'],
    ]);
  });

  it("handles CRLF, a byte-order mark and a missing final newline", () => {
    expect(parseCsv("﻿date,amount\r\n2026-10-01,5\r\n2026-10-02,6")).toEqual([
      ["date", "amount"],
      ["2026-10-01", "5"],
      ["2026-10-02", "6"],
    ]);
  });

  it("detects semicolon- and tab-separated files", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a,b,c\n1,,3")[1]).toEqual(["1", "", "3"]);
  });
});

describe("toCsv", () => {
  it("quotes only when needed and round-trips through parseCsv", () => {
    const rows = [["name", "note"], ["Juniper & Vale, Inc.", 'said "hi"'], ["Plain", "multi\nline"]];
    const text = toCsv(rows);
    expect(text).toContain('"Juniper & Vale, Inc."');
    expect(parseCsv(text)).toEqual(rows);
  });

  it("neutralises spreadsheet formulas but leaves negative numbers alone", () => {
    expect(toCsv([["=HYPERLINK(1)", "-12.50", "+1"]])).toBe("'=HYPERLINK(1),-12.50,'+1\r\n");
  });
});

describe("parseAmount", () => {
  it.each([
    ["1234.56", 123456],
    ["$1,234.56", 123456],
    ["  USD 99 ", 9900],
    ["€12", 1200],
    ["1,000", 100000],
    [".5", 50],
    ["7.", 700],
    ["-25.10", -2510],
    ["(80.00)", -8000],
    ["$-3.00", -300],
    ["45.00-", -4500],
    ["0.005", 1],
    ["2.334", 233],
  ])("%s → %i cents", (raw, cents) => {
    expect(parseAmount(raw)).toBe(cents);
  });

  it.each(["", "abc", "12.3.4", "$", "1e5"])("rejects %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });

  it("never suffers float drift", () => {
    expect(parseAmount("0.10")! + parseAmount("0.20")!).toBe(parseAmount("0.30"));
    expect(parseAmount("1015.13")).toBe(101513); // 1015.13 * 100 = 101512.99999… as a float
  });
});

describe("money formatting", () => {
  it("formats cents with Intl", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(-500)).toBe("-$5.00");
  });

  it("renders plain decimals for export", () => {
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(123400)).toBe("1234.00");
    expect(centsToDecimal(-1999)).toBe("-19.99");
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-10-31", "2026-10-31"],
    ["2026-10-31T23:59:00Z", "2026-10-31"],
    ["2026/1/5", "2026-01-05"],
    ["10/31/2026", "2026-10-31"],
    ["1/5/26", "2026-01-05"],
    ["31-Oct-2026", "2026-10-31"],
    ["5 January 2026", "2026-01-05"],
    ["Oct 31, 2026", "2026-10-31"],
  ])("%s → %s", (raw, iso) => {
    expect(parseDate(raw)).toBe(iso);
  });

  it.each(["", "2026-02-30", "13/01/2026", "yesterday"])("rejects %j", (raw) => {
    expect(parseDate(raw)).toBeNull();
  });

  it("does day arithmetic in UTC", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
