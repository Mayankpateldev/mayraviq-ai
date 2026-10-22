import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../apps/api/src/platform/migrations.ts";
import { importLegacy } from "../../apps/api/src/platform/legacy-import.ts";
test("Legacy import preserves designs and notes and refuses a nonempty target", async () => {
  const folder = await mkdtemp(join(tmpdir(), "mayraviq-import-")),
    source = join(folder, "legacy.sqlite");
  const sqlite = new DatabaseSync(source);
  sqlite.exec(
    "CREATE TABLE workspaces(id text,owner_id text,name text,created_at text);CREATE TABLE projects(id text,workspace_id text,title text,description text,color text,created_at text);CREATE TABLE sessions(id text,project_id text,title text,scheduled_at text,notes text);CREATE TABLE canvases(project_id text,nodes text,edges text,version integer)",
  );
  sqlite
    .prepare("INSERT INTO workspaces VALUES(?,?,?,?)")
    .run("workspace", "owner", "Private team", "2026-10-10T00:00:00Z");
  sqlite
    .prepare("INSERT INTO projects VALUES(?,?,?,?,?,?)")
    .run("project", "workspace", "Design", "", "blue", "2026-10-10T00:00:00Z");
  sqlite
    .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
    .run(
      "session",
      "project",
      "Review",
      "2026-10-10T00:00:00Z",
      "Keep these notes",
    );
  sqlite
    .prepare("INSERT INTO canvases VALUES(?,?,?,?)")
    .run(
      "project",
      JSON.stringify([
        { id: "shape", text: "Saved design", x: 10, y: 20, color: "blue" },
      ]),
      "[]",
      4,
    );
  sqlite.close();
  const pg = new PGlite();
  await pg.waitReady;
  try {
    await migrate(pg, resolve("apps/api/migrations"));
    await importLegacy(pg, source);
    assert.equal(
      (await pg.query("SELECT notes FROM sessions")).rows[0].notes,
      "Keep these notes",
    );
    const canvas = (await pg.query("SELECT nodes,version FROM canvases"))
      .rows[0];
    assert.equal(JSON.parse(canvas.nodes)[0].text, "Saved design");
    assert.equal(canvas.version, 4);
    await assert.rejects(importLegacy(pg, source), /empty target/);
    assert.equal(
      (await pg.query("SELECT count(*) AS n FROM projects")).rows[0].n,
      1,
    );
    const original = new DatabaseSync(source, { readOnly: true });
    assert.equal(
      original.prepare("SELECT version FROM canvases").get().version,
      4,
    );
    original.close();
  } finally {
    await pg.close();
    await rm(folder, { recursive: true, force: true });
  }
});
