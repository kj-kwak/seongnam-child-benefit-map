import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
let text = await readFile(".env.local", "utf8").catch(() => "");
const values: Record<string, string> = {};
for (const key of ["ADMIN_ENTRY_SECRET", "ADMIN_SESSION_SECRET"]) {
  const current = text.match(
    new RegExp(`^${key}=["']?([a-f0-9]{64})["']?$`, "m"),
  )?.[1];
  values[key] = current || randomBytes(32).toString("hex");
  if (!current) {
    text = text.replace(new RegExp(`^${key}=.*\\n?`, "gm"), "");
    text += `\n${key}=${values[key]}\n`;
  }
}
await writeFile(".env.local", text, { mode: 0o600 });
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/admin-access.txt",
  `관리자 비밀 링크 (공유 금지)\n\n로컬: http://localhost:3000/${values.ADMIN_ENTRY_SECRET}/enter\n운영: https://seongnam-child-benefit-map.vercel.app/${values.ADMIN_ENTRY_SECRET}/enter\n\n운영 링크는 동일한 관리자 환경변수를 Vercel Production에 설정하고 재배포한 뒤 사용할 수 있습니다.\n`,
  { mode: 0o600 },
);
console.log(
  "관리자 비밀값을 .env.local에 준비했습니다. 링크는 artifacts/admin-access.txt에서 확인하세요.",
);
