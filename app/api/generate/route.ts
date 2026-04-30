import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execAsync = promisify(exec);

export const runtime = "nodejs";

export async function POST(req: Request) {
  const frontendRoot = process.cwd();
  const projectRoot = path.resolve(frontendRoot, "..");
  const creatorProfilePath = path.join(projectRoot, "creator-profile.json");
  const ideaScriptPath = path.join(projectRoot, "idea-generate.js");
  const ideasOutputPath = path.join(projectRoot, "outputs", "daily-ideas.json");

  try {
    const body = await req.json();
    const creatorProfile = body?.creatorProfile;

    if (!creatorProfile || typeof creatorProfile !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid payload: `creatorProfile` must be an object.",
        },
        { status: 400 },
      );
    }

    await fs.writeFile(
      creatorProfilePath,
      `${JSON.stringify(creatorProfile, null, 2)}\n`,
      "utf-8",
    );

    // Run generation script from frontend directory, matching: node ../idea-generate.js
    const { stdout, stderr } = await execAsync(`node "${ideaScriptPath}"`, {
      cwd: frontendRoot,
      timeout: 120_000,
      windowsHide: true,
    });

    const ideasRaw = await fs.readFile(ideasOutputPath, "utf-8");
    const ideas = JSON.parse(ideasRaw);

    return NextResponse.json({
      ok: true,
      data: ideas,
      meta: {
        stdout: stdout?.trim() || "",
        stderr: stderr?.trim() || "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate daily ideas.",
        message,
      },
      { status: 500 },
    );
  }
}
