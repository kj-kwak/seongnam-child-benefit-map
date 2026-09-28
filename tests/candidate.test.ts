import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("identical collections close superseded PRs while retaining the matching open candidate", async () => {
  const root = resolve(".");
  const dir = await mkdtemp(join(tmpdir(), "candidate-review-"));
  try {
    await mkdir(join(dir, "bin"));
    await mkdir(join(dir, "data"));
    await mkdir(join(dir, "collection"));
    await writeFile(
      join(dir, "data/catalog.json"),
      JSON.stringify({ metadata: { version: "published" } }),
    );
    await writeFile(
      join(dir, "bin/gh"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[1] === 'list') process.stdout.write(process.env.TEST_PRS);
else if (args[1] === 'close') fs.appendFileSync('closed', args[2] + '\\n');
else throw new Error('Unexpected mutation: ' + args.join(' '));
`,
      { mode: 0o700 },
    );
    const older = {
      number: 6,
      headRefName: "codex/data-older",
      body: "<!-- data-version:older -->",
      state: "OPEN",
    };
    for (const scenario of [
      { version: "published", prs: [older], expected: "6\n" },
      {
        version: "known",
        prs: [
          older,
          {
            number: 7,
            headRefName: "codex/data-known",
            body: "<!-- data-version:known -->",
            state: "CLOSED",
          },
        ],
        expected: "6\n",
      },
      {
        version: "known",
        prs: [
          older,
          {
            number: 7,
            headRefName: "codex/data-known",
            body: "<!-- data-version:known -->",
            state: "OPEN",
          },
        ],
        expected: "6\n",
      },
    ]) {
      await writeFile(join(dir, "closed"), "");
      await writeFile(
        join(dir, "collection/review.json"),
        JSON.stringify({
          complete: true,
          errors: [],
          version: scenario.version,
        }),
      );
      execFileSync(
        process.execPath,
        [
          join(root, "node_modules/tsx/dist/cli.mjs"),
          join(root, "scripts/candidate.ts"),
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            PATH: `${join(dir, "bin")}:${process.env.PATH}`,
            COLLECT_OUTPUT: "collection",
            GITHUB_REPOSITORY: "test/repository",
            TEST_PRS: JSON.stringify(scenario.prs),
          },
        },
      );
      assert.equal(
        await readFile(join(dir, "closed"), "utf8"),
        scenario.expected,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
