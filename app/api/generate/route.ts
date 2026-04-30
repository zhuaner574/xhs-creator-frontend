import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IdeaItem = {
  rank: number;
  hotword: string;
  matchScore: number;
  title: string;
  angle: string;
  outline: string[];
  coverText: string;
  whyItFits: string;
};

function normalizeIdea(item: Record<string, unknown>, index: number): IdeaItem {
  const score = Number(item?.matchScore ?? item?.score ?? 0);
  const outlineRaw = item?.outline;
  return {
    rank: Number(item?.rank) || index + 1,
    hotword: String(item?.hotword ?? item?.hotwordUsed ?? item?.keyword ?? "热点词"),
    matchScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    title: String(item?.title ?? item?.topicTitle ?? item?.titleText ?? "未返回标题"),
    angle: String(item?.angle ?? item?.contentAngle ?? "内容切入点待补充"),
    outline: Array.isArray(outlineRaw)
      ? outlineRaw.map((s) => String(s))
      : String(outlineRaw ?? "暂无大纲")
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean),
    coverText: String(item?.coverText ?? item?.coverCopy ?? "封面文案待补充"),
    whyItFits: String(item?.whyItFits ?? item?.fitReason ?? "与创作者画像匹配"),
  };
}

export async function POST(req: Request) {
  const frontendRoot = process.cwd();
  const projectRoot = path.resolve(frontendRoot, "..");
  const creatorProfilePath = path.join(projectRoot, "creator-profile.json");
  const hotwordsPath = path.join(projectRoot, "outputs", "hotwords-ai.json");

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY in environment variables.");
    }

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

    const hotwordsRaw = await fs.readFile(hotwordsPath, "utf-8");
    const hotwords = JSON.parse(hotwordsRaw);

    const prompt = `
你是一个专业的小红书内容策划助手。

创作者画像如下：
${JSON.stringify(creatorProfile, null, 2)}

今日热点词如下（最多80条）：
${JSON.stringify(Array.isArray(hotwords) ? hotwords.slice(0, 80) : [], null, 2)}

请生成 10 条最适合这个账号今天发布的小红书选题。
要求：
1) 不要机械套热点，要考虑赛道、受众、人设、风格与可执行性。
2) 标题贴近小红书真实语境，不要官话。
3) 输出必须是严格 JSON，不要 Markdown，不要额外说明。

输出格式（必须是数组）：
[
  {
    "rank": 1,
    "hotword": "热点词",
    "matchScore": 92,
    "title": "小红书标题",
    "angle": "内容切入点",
    "outline": ["开头钩子", "观点1", "观点2", "案例", "结尾互动"],
    "coverText": "封面文案",
    "whyItFits": "为什么适合该创作者"
  }
]
`;

    const deepseekResp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const deepseekData = await deepseekResp.json();
    if (!deepseekResp.ok) {
      const apiMessage =
        deepseekData?.error?.message ||
        deepseekData?.message ||
        `DeepSeek API request failed (${deepseekResp.status}).`;
      throw new Error(apiMessage);
    }

    const content = deepseekData?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("DeepSeek 返回内容为空。");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      throw new Error("DeepSeek 返回内容不是合法 JSON。");
    }

    if (!Array.isArray(parsed)) {
      throw new Error("DeepSeek 返回格式错误：顶层必须是数组。");
    }

    const ideas = parsed.slice(0, 10).map((item, idx) => normalizeIdea(item as Record<string, unknown>, idx));

    return NextResponse.json({
      ok: true,
      data: ideas,
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
