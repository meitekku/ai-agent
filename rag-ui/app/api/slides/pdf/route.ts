import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { title, pngs } = (await req.json()) as {
      title: string;
      pngs: string[];
    };

    if (!pngs || pngs.length === 0) {
      return Response.json(
        { error: "pngs array is required" },
        { status: 400 },
      );
    }

    // Dynamic import to avoid SSR issues
    const { jsPDF } = await import("jspdf");

    // Landscape 16:9
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [1280, 720],
    });

    for (let i = 0; i < pngs.length; i++) {
      if (i > 0) pdf.addPage([1280, 720], "landscape");

      const dataUrl = pngs[i];
      const imgType = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      pdf.addImage(dataUrl, imgType, 0, 0, 1280, 720);
    }

    const pdfBuffer = pdf.output("arraybuffer");

    const safeTitle = (title || "slides").replace(
      /[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff _-]/g,
      "_",
    );

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[slides/pdf] error:", err);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
