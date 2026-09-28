import catalog from "../../../../../data/catalog.json";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(catalog.metadata, {
    headers: { "Cache-Control": "no-store" },
  });
}
