import { getKbConfig, upsertKbConfig } from "@/lib/kb-config-db";

export async function GET() {
  try {
    const config = await getKbConfig();
    return Response.json(config ?? { title: "", description: "" });
  } catch (err) {
    console.error("[kb-config] GET error:", err);
    return Response.json({ error: "Failed to fetch KB config" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { title, description } = await req.json();
    if (typeof title !== "string" || typeof description !== "string") {
      return Response.json({ error: "title and description are required" }, { status: 400 });
    }
    await upsertKbConfig(title, description);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[kb-config] PUT error:", err);
    return Response.json({ error: "Failed to update KB config" }, { status: 500 });
  }
}
