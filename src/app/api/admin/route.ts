import { cookies } from "next/headers";
import {
  AdminError,
  COOKIE,
  validSession,
  assertOrigin,
  assertWritable,
  privateHeaders,
} from "@/lib/admin-auth";
import { getStatus, applyAction } from "@/lib/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function authorized() {
  if (!validSession((await cookies()).get(COOKIE)?.value))
    throw new AdminError(
      "관리자 세션이 만료되었습니다. 비밀 링크로 다시 접속해주세요.",
      401,
    );
}
function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof AdminError
          ? e.message
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
    },
    {
      status: e instanceof AdminError ? e.status : 500,
      headers: privateHeaders,
    },
  );
}
export async function GET(request: Request) {
  try {
    await authorized();
    const params = new URL(request.url).searchParams;
    const page = (name: string) =>
      Math.min(
        10000,
        Math.max(0, Number.parseInt(params.get(name) || "0", 10) || 0),
      );
    return Response.json(
      await getStatus(
        (params.get("query") || "").slice(0, 200),
        page("page"),
        page("failurePage"),
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await authorized();
    assertOrigin(request);
    assertWritable();
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AdminError("JSON 요청이 필요합니다.", 415);
    const text = await request.text();
    if (text.length > 2048) throw new AdminError("요청이 너무 큽니다.", 413);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new AdminError("JSON 형식이 잘못되었습니다.");
    }
    if (!input || typeof input !== "object")
      throw new AdminError("요청 형식이 잘못되었습니다.");
    return Response.json(await applyAction(input), { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
