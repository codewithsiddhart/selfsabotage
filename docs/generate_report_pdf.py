# -*- coding: utf-8 -*-
"""One-off: render docs/Self-Sabotage-Builder-Technical-Report.md to PDF (fpdf2)."""
from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent
MD_PATH = ROOT / "Self-Sabotage-Builder-Technical-Report.md"
OUT_PATH = ROOT / "Self-Sabotage-Builder-Technical-Report.pdf"


class ReportPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(80, 80, 80)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")


def ascii_safe(s: str) -> str:
    """Helvetica core fonts only support Latin-1; normalize punctuation."""
    return (
        s.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u00d7", "x")
        .replace("\u2026", "...")
        .replace("\u00a7", "Sec.")
        .replace("\u00b7", " - ")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2192", "->")
    )


def strip_md_bold(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = s.replace("`", "")
    return ascii_safe(s)


def add_wrapped(pdf: FPDF, text: str, size: int = 11, style: str = "") -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", style, size)
    pdf.set_text_color(20, 20, 22)
    t = strip_md_bold(text)
    pdf.multi_cell(pdf.epw, 5.5, t)
    pdf.ln(1)


def main() -> None:
    raw = MD_PATH.read_text(encoding="utf-8")
    lines = raw.splitlines()

    pdf = ReportPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(18, 18, 18)

    def x0() -> None:
        pdf.set_x(pdf.l_margin)

    in_table = False
    table_buf: list[str] = []

    def flush_table() -> None:
        nonlocal table_buf, in_table
        if not table_buf:
            in_table = False
            return
        pdf.set_font("Helvetica", "", 9)
        pdf.set_fill_color(245, 246, 248)
        for row in table_buf:
            if re.match(r"^\|?[\s\-:|]+\|?$", row):
                continue
            cells = [ascii_safe(c.strip()) for c in row.strip("|").split("|")]
            line = "  |  ".join(cells)
            x0()
            pdf.multi_cell(pdf.epw, 5, line)
        pdf.ln(2)
        table_buf = []
        in_table = False

    for line in lines:
        s = line.rstrip()
        if s.strip() == "---":
            flush_table()
            pdf.ln(2)
            continue
        if not s:
            flush_table()
            pdf.ln(1)
            continue

        if s.startswith("|"):
            in_table = True
            table_buf.append(s)
            continue
        if in_table:
            flush_table()

        if s.startswith("# "):
            pdf.ln(3)
            x0()
            pdf.set_font("Helvetica", "B", 18)
            pdf.set_text_color(15, 18, 35)
            pdf.multi_cell(pdf.epw, 8, strip_md_bold(s[2:]))
            pdf.ln(2)
            continue
        if s.startswith("## "):
            pdf.ln(2)
            x0()
            pdf.set_font("Helvetica", "B", 13)
            pdf.set_text_color(25, 35, 70)
            pdf.multi_cell(pdf.epw, 7, strip_md_bold(s[3:]))
            pdf.ln(1)
            continue
        if s.startswith("### "):
            pdf.ln(1)
            x0()
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(40, 45, 60)
            pdf.multi_cell(pdf.epw, 6, strip_md_bold(s[4:]))
            pdf.ln(1)
            continue
        if s.startswith("- "):
            x0()
            pdf.set_font("Helvetica", "", 10.5)
            pdf.set_text_color(25, 25, 28)
            t = strip_md_bold(s[2:])
            pdf.multi_cell(pdf.epw, 5.5, f"- {t}")
            continue
        if s.startswith("*Generated for internal"):
            add_wrapped(pdf, s.strip("*").strip(), 9, "I")
            continue

        add_wrapped(pdf, s, 10.5, "")

    flush_table()

    pdf.output(OUT_PATH.as_posix())
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
