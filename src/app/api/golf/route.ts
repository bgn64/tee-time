import { getSession } from "@/lib/session";
import { golfDb } from "@/lib/golf";
import { friendFeed, golfMutation, golfState, ownRounds, readRound, searchCourses, social, statistics } from "@/lib/golf-service.mts";
import { GolfError } from "@/lib/golf-validation.mts";

function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}
function failure(error: unknown) {
  if (error instanceof GolfError) return response({ error: error.message }, error.status);
  console.error("Golf request failed:", error);
  return response({ error: "The server could not complete this request. Please retry. If it persists, ask the administrator to check migrations and server logs." }, 500);
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return response({ error: "Sign in to continue." }, 401);
    const url = new URL(request.url), kind = url.searchParams.get("kind") ?? "state";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const id = url.searchParams.get("id") ?? "";
    switch (kind) {
      case "state": return response(golfState(golfDb, session.user));
      case "courses": return response(searchCourses(golfDb, session.user.id, url.searchParams.get("q") ?? "", offset));
      case "round": return response(readRound(golfDb, session.user.id, id));
      case "rounds": return response(ownRounds(golfDb, session.user.id, offset));
      case "feed": return response(friendFeed(golfDb, session.user.id, offset));
      case "social": return response(social(golfDb, session.user.id, id, offset));
      case "stats": return response(statistics(golfDb, session.user.id));
      default: throw new GolfError("Unknown resource.", 404);
    }
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return response({ error: "Sign in to continue." }, 401);
    if (request.headers.get("origin") !== process.env.BETTER_AUTH_URL) throw new GolfError("This request did not come from the configured app origin.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new GolfError("Send JSON.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new GolfError("A request body is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) { await reader.cancel(); throw new GolfError("This request is too large.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new GolfError("Malformed JSON."); }
    return response(golfMutation(golfDb, session.user, body));
  } catch (error) { return failure(error); }
}
