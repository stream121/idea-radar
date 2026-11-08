import { NextRequest } from "next/server";
import { readNotes, writeNotes } from "@/lib/dashboard";
import type { NotesData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readNotes());
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<NotesData>;
    const current = await readNotes();
    const next: NotesData = {
      favorites: Array.isArray(body.favorites) ? body.favorites : current.favorites,
      notes: body.notes && typeof body.notes === "object" ? { ...current.notes, ...body.notes } : current.notes,
      statuses: body.statuses && typeof body.statuses === "object" ? { ...current.statuses, ...body.statuses } : current.statuses,
    };
    await writeNotes(next);
    return Response.json(next);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
