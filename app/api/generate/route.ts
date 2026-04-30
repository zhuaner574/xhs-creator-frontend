export async function POST(req: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing DEEPSEEK_API_KEY" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const creatorProfile = body?.creatorProfile ?? {};
  const hotwords = ["留学申请", "论文写作", "自律生活"];

  const prompt = `
你是小红书创作助手。请基于创作者画像和热点词，生成 10 条选题灵感。

创作者画像：
${JSON.stringify(creatorProfile, null, 2)}

热点词：
${JSON.stringify(hotwords, null, 2)}

请严格返回 JSON 数组，不要 markdown，不要任何解释。格式如下：
[
  {
    "title": "...",
    "angle": "...",
    "outline": "...",
    "coverText": "...",
    "whyItFits": "..."
  }
]
`;

  console.log("calling deepseek");

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

  const deepseekData = await deepseekResp.json().catch(() => ({}));
  const content = deepseekData?.choices?.[0]?.message?.content ?? "";

  let ideas: unknown;
  try {
    ideas = JSON.parse(String(content).trim());
  } catch {
    return Response.json(
      {
        error: "AI parse failed",
        raw: content,
      },
      { status: 500 },
    );
  }

  return Response.json({ ideas });
}
