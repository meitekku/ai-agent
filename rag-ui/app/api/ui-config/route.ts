import { getUiPreferences, updateUiPreferences } from "@/lib/ui-config-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prefs = await getUiPreferences();
    return Response.json(prefs);
  } catch (err) {
    console.error("[ui-config] GET failed:", err);
    return Response.json({}, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const updated = await updateUiPreferences(body);
    return Response.json(updated);
  } catch (err) {
    console.error("[ui-config] PUT failed:", err);
    return Response.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
