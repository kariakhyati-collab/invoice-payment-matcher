import type { Invoice, Payment } from "../types";

let seq = 0;

/** Build an invoice; amounts are given in dollars for readability. */
export function inv(
  invoiceNo: string,
  customer: string,
  dollars: number,
  invoiceDate = "2026-09-01",
  dueDate = "2026-10-01",
): Invoice {
  seq++;
  return { id: `i${seq}`, row: seq + 1, invoiceNo, customer, invoiceDate, dueDate, amount: Math.round(dollars * 100) };
}

export function pay(payer: string, dollars: number, reference = "", date = "2026-10-15"): Payment {
  seq++;
  return { id: `p${seq}`, row: seq + 1, date, payer, amount: Math.round(dollars * 100), reference };
}
