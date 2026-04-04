import {
  getArtifactByConversation,
  listArtifactsByConversation,
  getCurrentContent,
  listVersions,
} from "@/lib/artifact-db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const listAll = searchParams.get("list") === "true";
  if (!conversationId) {
    return Response.json({ error: "conversationId required" }, { status: 400 });
  }

  try {
    // List all artifacts for a conversation (for file list)
    if (listAll) {
      const artifacts = await listArtifactsByConversation(conversationId);
      return Response.json(artifacts);
    }

    // Get the latest artifact with content (for restore)
    const artifact = await getArtifactByConversation(conversationId);
    if (!artifact) {
      return Response.json(null, { status: 404 });
    }

    const [content, versions] = await Promise.all([
      getCurrentContent(artifact.id),
      listVersions(artifact.id),
    ]);

    return Response.json({
      ...artifact,
      content: content ?? "",
      versions,
    });
  } catch (err) {
    console.error("[artifacts] GET failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
