"""Multi-format text extraction.

Dispatch function `extract_text(file_bytes, filename)` returns `(markdown, page_count)`.
"""

import asyncio
import csv
import io
import os
import re
from xml.etree.ElementTree import Element

from .ocr import ocr_pdf


def _escape_pipe(text: str) -> str:
    """Escape pipe characters in table cell text."""
    return text.replace("|", "\\|")


def _md_table(rows: list[list[str]]) -> str:
    """Build a Markdown table from rows (first row = header). Handles pipe escaping."""
    if not rows:
        return ""
    ncols = max(len(r) for r in rows)
    lines = []
    # Header
    header = [_escape_pipe(c) for c in rows[0]] + [""] * (ncols - len(rows[0]))
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join("---" for _ in range(ncols)) + " |")
    # Data
    for row in rows[1:]:
        padded = [_escape_pipe(c) for c in row] + [""] * (ncols - len(row))
        lines.append("| " + " | ".join(padded[:ncols]) + " |")
    return "\n".join(lines)


async def extract_text(file_bytes: bytes, filename: str) -> tuple[str, int]:
    """Extract text from various file formats.

    Returns (markdown_text, page_count).
    """
    ext = os.path.splitext(filename)[1].lower()

    if ext == ".pdf":
        return await _extract_pdf(file_bytes, filename)
    elif ext in (".txt", ".md"):
        return _extract_text_plain(file_bytes)
    elif ext == ".csv":
        return await asyncio.to_thread(_extract_csv, file_bytes)
    elif ext == ".docx":
        return await asyncio.to_thread(_extract_docx, file_bytes)
    elif ext == ".xlsx":
        return await asyncio.to_thread(_extract_xlsx, file_bytes)
    elif ext == ".pptx":
        return await asyncio.to_thread(_extract_pptx, file_bytes)
    elif ext in (".html", ".htm"):
        return await asyncio.to_thread(_extract_html, file_bytes)
    elif ext in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        return await _extract_image(file_bytes, filename, ext)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


async def _extract_pdf(file_bytes: bytes, filename: str) -> tuple[str, int]:
    pages = await ocr_pdf(file_bytes, filename)
    page_count = len(pages)
    markdown = "\n\n".join(
        (
            f"## Page {p['page']}\n\n{p['text']}"
            if not re.match(r"^#{1,6}\s", p["text"].strip())
            else p["text"]
        )
        for p in pages
    )
    return markdown, page_count


def _extract_text_plain(file_bytes: bytes) -> tuple[str, int]:
    text = file_bytes.decode("utf-8", errors="replace")
    return text, 1


def _extract_csv(file_bytes: bytes) -> tuple[str, int]:
    text = file_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = [[c for c in row] for row in reader]
    if not rows:
        return "", 1
    return _md_table(rows), 1


def _extract_docx(file_bytes: bytes) -> tuple[str, int]:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(io.BytesIO(file_bytes))
    parts: list[str] = []

    # Walk body elements in document order to preserve paragraph/table interleaving
    for element in doc.element.body:
        tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag

        if tag == "p":
            para = Paragraph(element, doc)
            text = para.text.strip()
            if not text:
                continue
            if para.style and para.style.name and para.style.name.startswith("Heading"):
                try:
                    level = int(para.style.name.replace("Heading", "").strip())
                    parts.append(f"{'#' * level} {text}")
                except ValueError:
                    parts.append(text)
            else:
                parts.append(text)

        elif tag == "tbl":
            table = Table(element, doc)
            rows = []
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                rows.append(cells)
            if rows:
                parts.append(_md_table(rows))

    return "\n\n".join(parts), 1


def _extract_xlsx(file_bytes: bytes) -> tuple[str, int]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    parts: list[str] = []

    for sheet in wb.worksheets:
        parts.append(f"## {sheet.title}")
        rows = []
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(cells):  # skip completely empty rows
                rows.append(cells)
        if rows:
            parts.append(_md_table(rows))
        parts.append("")

    wb.close()
    return "\n\n".join(parts), 1


def _extract_pptx(file_bytes: bytes) -> tuple[str, int]:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(file_bytes))
    parts: list[str] = []

    for i, slide in enumerate(prs.slides, 1):
        slide_texts: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = para.text.strip()
                    if text:
                        slide_texts.append(text)
            if shape.has_table:
                table = shape.table
                rows = []
                for row in table.rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    rows.append(cells)
                if rows:
                    slide_texts.append(_md_table(rows))
        if slide_texts:
            parts.append(f"## Slide {i}\n\n" + "\n\n".join(slide_texts))

    return "\n\n".join(parts), len(prs.slides)


def _extract_html(file_bytes: bytes) -> tuple[str, int]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(file_bytes, "html.parser")

    # Remove script and style elements
    for tag in soup(["script", "style"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    # Clean up excessive whitespace
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)

    return text, 1


async def _extract_image(
    file_bytes: bytes, filename: str, ext: str
) -> tuple[str, int]:
    """Use Gemini Vision to extract text from images."""
    from . import config

    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    mime_type = mime_map.get(ext, "image/png")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    resp = await client.aio.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            "この画像の内容をMarkdown形式で正確に書き起こしてください。表はMarkdownテーブルに変換してください。テキストのみを出力してください。",
        ],
    )
    return resp.text or "", 1
