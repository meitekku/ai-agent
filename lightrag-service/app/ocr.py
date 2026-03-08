import time

import httpx

from . import config


async def _ocr_pdf_local(file_bytes: bytes, filename: str) -> list[dict]:
    """GLM-OCR でPDFを逐页 Markdown に変換。"""
    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            f"{config.GLM_OCR_URL}/ocr/text",
            files={"file": (filename, file_bytes, "application/pdf")},
        )
        resp.raise_for_status()
        return resp.json()["pages"]


async def _ocr_pdf_gemini(file_bytes: bytes, filename: str) -> list[dict]:
    """Gemini Vision でPDFを逐页 Markdown に変換。"""
    import fitz  # PyMuPDF
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = []

    for page_num in range(len(doc)):
        t0 = time.time()
        page = doc[page_num]
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")

        resp = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                "このページの内容をMarkdown形式で正確に書き起こしてください。表はMarkdownテーブルに変換してください。画像の説明は不要です。テキストのみを出力してください。",
            ],
        )
        elapsed = round(time.time() - t0, 2)
        pages.append({
            "page": page_num + 1,
            "text": resp.text or "",
            "elapsed": elapsed,
        })

    doc.close()
    return pages


async def ocr_pdf(file_bytes: bytes, filename: str) -> list[dict]:
    """OCR_PROVIDER に基づいてPDFをMarkdownに変換。"""
    if config.OCR_PROVIDER == "gemini":
        return await _ocr_pdf_gemini(file_bytes, filename)
    return await _ocr_pdf_local(file_bytes, filename)
