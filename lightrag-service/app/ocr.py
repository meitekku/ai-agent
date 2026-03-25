import asyncio
import time

import httpx

from . import config

OCR_CONCURRENCY = 5  # max concurrent Gemini Vision calls per PDF


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

    if config.USE_VERTEX_AI:
        client = genai.Client(
            vertexai=True,
            project=config.GCP_PROJECT_ID,
            location=config.GCP_LOCATION,
        )
    else:
        client = genai.Client(api_key=config.GEMINI_API_KEY)
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    sem = asyncio.Semaphore(OCR_CONCURRENCY)

    async def _ocr_page(page_num: int) -> dict:
        async with sem:
            t0 = time.time()
            page = doc[page_num]
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")

            resp = await client.aio.models.generate_content(
                model=config.GEMINI_MODEL,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    "このページの内容をMarkdown形式で正確に書き起こしてください。表はMarkdownテーブルに変換してください。画像の説明は不要です。テキストのみを出力してください。",
                ],
            )
            elapsed = round(time.time() - t0, 2)
            return {
                "page": page_num + 1,
                "text": resp.text or "",
                "elapsed": elapsed,
            }

    pages = await asyncio.gather(*[_ocr_page(i) for i in range(len(doc))])
    doc.close()
    return sorted(pages, key=lambda p: p["page"])


async def ocr_pdf(file_bytes: bytes, filename: str) -> list[dict]:
    """OCR_PROVIDER に基づいてPDFをMarkdownに変換。"""
    if config.OCR_PROVIDER == "gemini":
        return await _ocr_pdf_gemini(file_bytes, filename)
    return await _ocr_pdf_local(file_bytes, filename)
