import { getArtifactVersion } from "@/lib/artifact-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version } = await params;
  const v = parseInt(version, 10);
  if (isNaN(v)) {
    return Response.json({ error: "invalid version" }, { status: 400 });
  }
  try {
    const data = await getArtifactVersion(id, v);
    if (!data) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json(data);
  } catch (err) {
    console.error("[artifacts] GET version failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
