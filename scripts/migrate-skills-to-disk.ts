#!/usr/bin/env bun
/**
 * Migration: Move existing skill content from DB to disk.
 *
 * Usage:
 *   SKILLS_DIR=data/skills DATABASE_URL=postgresql://... bun run scripts/migrate-skills-to-disk.ts
 *
 * In Docker:
 *   docker exec rag-ui bun run scripts/migrate-skills-to-disk.ts
 *
 * Safe to run multiple times — skips skills that already have content_dir.
 * Does NOT delete DB content column data (backward compat).
 */

import pg from "pg";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/lightrag";
const SKILLS_DIR = process.env.SKILLS_DIR || join(process.cwd(), "data", "skills");

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  try {
    // Find skills that haven't been migrated yet
    const { rows: skills } = await pool.query(
      `SELECT id, name, content FROM skills WHERE content_dir IS NULL AND content IS NOT NULL AND content != ''`,
    );

    if (skills.length === 0) {
      console.log("No skills to migrate.");
      return;
    }

    console.log(`Found ${skills.length} skills to migrate...`);

    let migrated = 0;
    let skipped = 0;

    for (const skill of skills) {
      const dir = join(SKILLS_DIR, String(skill.id));
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "SKILL.md"), skill.content, "utf-8");
        await pool.query(
          `UPDATE skills SET content_dir = $1 WHERE id = $2`,
          [String(skill.id), skill.id],
        );
        migrated++;
        console.log(`  ✓ ${skill.name} (id=${skill.id}) → ${dir}/SKILL.md`);
      } catch (e) {
        skipped++;
        console.error(`  ✗ ${skill.name} (id=${skill.id}):`, e);
      }
    }

    console.log(`\nDone: ${migrated} migrated, ${skipped} skipped.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
