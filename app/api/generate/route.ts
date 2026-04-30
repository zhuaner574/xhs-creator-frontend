export const runtime = "nodejs";

type CreatorProfile = Record<string, unknown>;

const mockHotwords = [
  "AI效率工具",
  "大学生实习",
  "论文写作",
  "校招准备",
  "期末复习",
  "时间管理",
  "职场新人",
  "自我成长",
  "小红书运营",
  "内容创作"
];

function extractJsonArray(text: string) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1) {
    throw new Error("No JSON array found in AI response");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      console.error("Missing DEEPSEEK_API_KEY");
      return Response.json(
        { error: "Missing DEEPSEEK_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const creatorProfile: CreatorProfile =
      body.creatorProfile || body.profile || body.formData || body || {};

    console.log("calling deepseek");

    const prompt = `
你是一个专业的小红书内容策略助手。

创作者画像：
${JSON.stringify(creatorProfile, null, 2)}

今日热点词：
${JSON.stringify(mockHotwords, null, 2)}

请结合创作者画像和热点词，生成 10 个适合小红书发布的选题。

要求：
1. 标题要像真实小红书标题，有情绪、有具体场景。
2. 不要泛泛而谈，要结合创作者身份、赛道、过往标题风格。
3. 输出必须是严格 JSON 数组，不要 Markdown，不要解释。

字段必须使用：
[
  {
    "rank": 1,
    "hotword": "热点词",
    "matchScore": 90,
    "title": "小红书标题",
    "angle": "内容切入点",
    "outline": ["开头钩子", "观点1", "观点2", "个人经历", "结尾互动"],
    "coverText": "封面文案",
    "whyItFits": "为什么适合这个创作者"
  }
]
`;

    const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    if (!deepseekRes.ok) {
      const errorText = await deepseekRes.text();
      console.error("DeepSeek API error:", errorText);
      return Response.json(
        { error: "DeepSeek API error", detail: errorText },
        { status: 500 }
      );
    }

    const result = await deepseekRes.json();
    const content = result?.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content from DeepSeek:", result);
      return Response.json(
        { error: "No content from DeepSeek", raw: result },
        { status: 500 }
      );
    }

    const ideas = extractJsonArray(content);

    return Response.json({
      ideas,
      data: ideas
    });
  } catch (error) {
    console.error("Generate route error:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error"
      },
      { status: 500 }
    );
  }
}