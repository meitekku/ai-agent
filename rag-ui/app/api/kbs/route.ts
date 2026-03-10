import { listKBs, createKB } from "@/lib/rag-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const kbs = await listKBs();
    return Response.json({ knowledge_bases: kbs });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list KBs" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { slug, name, title, description } = body;
    if (!slug || !name) {
      return Response.json(
        { error: "slug and name are required" },
        { status: 400 },
      );
    }
    const result = await createKB({ slug, name, title, description });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create KB";
    const status = message.includes("already exists") ? 409 : 502;
    return Response.json({ error: message }, { status });
  }
}
