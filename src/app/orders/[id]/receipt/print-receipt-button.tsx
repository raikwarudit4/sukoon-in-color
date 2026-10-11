"use client";

export function PrintReceiptButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#a15e61] px-4 py-2 text-sm font-semibold text-white hover:bg-[#884d50] print:hidden">
    Print / Save as PDF
  </button>;
}
