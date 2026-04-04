import { getArtifact, getCurrentContent, listVersions } from "@/lib/artifact-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const [artifact, versions, content] = await Promise.all([
      getArtifact(id),
      listVersions(id),
      getCurrentContent(id),
    ]);
    if (!artifact) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json({ ...artifact, versions, content: content ?? "" });
  } catch (err) {
    console.error("[artifacts] GET [id] failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
