"use client";

export function PrintButton() {
  return (
    <button type="button" className="button-primary keep" onClick={() => window.print()}>
      طباعة أو حفظ PDF
    </button>
  );
}
