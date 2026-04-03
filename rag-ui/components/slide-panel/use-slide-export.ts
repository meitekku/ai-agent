import { useCallback, useState } from "react";
import { slideSrcDoc } from "./utils";
import { buildPresentationHtml } from "./html-presentation";
import type { GeneratedSlide } from "./types";

export function useSlideExport(
  generatedSlides: GeneratedSlide[],
  deckTitle: string,
  setError: (e: string | null) => void,
) {
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  /** Render a slide iframe to PNG data URL via html2canvas. */
  const captureSlideAsPng = useCallback(
    async (
      html2canvas: (
        element: HTMLElement,
        options?: Record<string, unknown>,
      ) => Promise<HTMLCanvasElement>,
      slideHtml: string,
      slideTitle: string,
    ): Promise<string> => {
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;top:0;left:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;z-index:-9999;";
      document.body.appendChild(container);

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "width:1280px;height:720px;border:none;";
      container.appendChild(iframe);
      iframe.srcdoc = slideSrcDoc(slideHtml);

      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
      });
      try {
        await iframe.contentDocument!.fonts.ready;
      } catch {
        /* fonts API not available */
      }
      await new Promise((r) => setTimeout(r, 1500));

      let png: string;
      try {
        const iframeBody = iframe.contentDocument!.body;
        const canvas = await html2canvas(iframeBody, {
          width: 1280,
          height: 720,
          scale: 2,
          useCORS: true,
          backgroundColor: null,
        });
        png = canvas.toDataURL("image/png");
      } catch {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 40px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(slideTitle || "Slide", 640, 360);
        png = canvas.toDataURL("image/png");
      }
      document.body.removeChild(container);
      return png;
    },
    [],
  );

  const handleExport = useCallback(async () => {
    const validSlides = generatedSlides.filter((s) => !s.failed);
    if (validSlides.length === 0) return;
    setExporting(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const pngs: string[] = [];

      for (let i = 0; i < validSlides.length; i++) {
        const png = await captureSlideAsPng(
          html2canvas,
          validSlides[i].html,
          validSlides[i].title,
        );
        pngs.push(png);
      }

      const res = await fetch("/api/slides/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: deckTitle || "slides", pngs }),
      });
      if (!res.ok) throw new Error(`PPTX export failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(deckTitle || "slides").replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g, "_")}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [generatedSlides, deckTitle, captureSlideAsPng, setError]);

  const handlePdfExport = useCallback(async () => {
    const validSlides = generatedSlides.filter((s) => !s.failed);
    if (validSlides.length === 0) return;
    setExportingPdf(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const SLIDE_W_MM = 338.67;
      const SLIDE_H_MM = 190.5;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [SLIDE_W_MM, SLIDE_H_MM],
      });

      for (let i = 0; i < validSlides.length; i++) {
        const png = await captureSlideAsPng(
          html2canvas,
          validSlides[i].html,
          validSlides[i].title,
        );
        if (i > 0) doc.addPage([SLIDE_W_MM, SLIDE_H_MM], "landscape");
        const base64 = png.includes(",") ? png.split(",")[1] : png;
        doc.addImage(base64, "PNG", 0, 0, SLIDE_W_MM, SLIDE_H_MM);
      }

      const safeName = (deckTitle || "slides").replace(
        /[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g,
        "_",
      );
      doc.save(`${safeName}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  }, [generatedSlides, deckTitle, captureSlideAsPng, setError]);

  const handleHtmlExport = useCallback(() => {
    const validSlides = generatedSlides.filter((s) => !s.failed);
    if (validSlides.length === 0) return;

    const html = buildPresentationHtml(
      validSlides.map((s) => ({ title: s.title, html: s.html })),
      deckTitle || "slides",
    );
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (deckTitle || "slides").replace(
      /[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g,
      "_",
    );
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }, [generatedSlides, deckTitle]);

  return {
    exporting,
    exportingPdf,
    handleExport,
    handlePdfExport,
    handleHtmlExport,
  };
}
