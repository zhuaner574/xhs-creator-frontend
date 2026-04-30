"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type CreatorProfile = {
  identity: string;
  niche: string;
  targetAudience: string;
  persona: string;
  contentStyle: string;
  pastTitles: string;
  avoidTopics: string;
  freeformInfo: string;
};

type HotwordCard = {
  hotword: string;
  matchScore: number;
  angle: string;
};

type TopicIdea = {
  matchScore: number; // 0-100
  hotword: string;
  title: string;
  angle: string;
  outline: string;
  coverText: string;
  whyItFits: string;
};

type GenerateApiResponse = {
  ok?: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

type DbCreatorProfileRow = {
  identity: string | null;
  niche: string | null;
  target_audience: string | null;
  persona: string | null;
  content_style: string | null;
  past_titles: string | null;
  avoid_topics: string | null;
  freeform_info: string | null;
};

type AuthUser = {
  id: string;
  email?: string;
};

type IdeaGenerationHistoryRow = {
  id: string;
  created_at: string;
  ideas: unknown;
};

const PROFILE_STORAGE_KEY = "xhs_creator_profile";
const LOADING_STEPS = [
  "正在读取你的创作者画像...",
  "正在匹配今日热点词...",
  "正在生成小红书选题...",
  "正在整理标题、封面和大纲...",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mergeProfile(base: CreatorProfile, incoming: Partial<CreatorProfile>): CreatorProfile {
  return {
    identity: String(incoming.identity ?? base.identity),
    niche: String(incoming.niche ?? base.niche),
    targetAudience: String(incoming.targetAudience ?? base.targetAudience),
    persona: String(incoming.persona ?? base.persona),
    contentStyle: String(incoming.contentStyle ?? base.contentStyle),
    pastTitles: String(incoming.pastTitles ?? base.pastTitles),
    avoidTopics: String(incoming.avoidTopics ?? base.avoidTopics),
    freeformInfo: String(incoming.freeformInfo ?? base.freeformInfo),
  };
}

function profileFromDbRow(row: DbCreatorProfileRow): Partial<CreatorProfile> {
  return {
    identity: row.identity ?? "",
    niche: row.niche ?? "",
    targetAudience: row.target_audience ?? "",
    persona: row.persona ?? "",
    contentStyle: row.content_style ?? "",
    pastTitles: row.past_titles ?? "",
    avoidTopics: row.avoid_topics ?? "",
    freeformInfo: row.freeform_info ?? "",
  };
}

function formatDateTime(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function hashString(input: string) {
  // Simple deterministic hash for mock generation.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseAvoidTokens(avoidTopics: string) {
  return avoidTopics
    .split(/[\n,，;；、]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function generateMockIdeas(profile: CreatorProfile, seedSalt: number): TopicIdea[] {
  const rand = mulberry32(hashString(`${profile.identity}|${profile.niche}|${seedSalt}`));
  const avoidTokens = parseAvoidTokens(profile.avoidTopics);

  const hotwordPools = [
    { hotword: "熬夜修复精华", category: "护肤" },
    { hotword: "屏障修护面霜", category: "敏感肌" },
    { hotword: "维C淡斑精华", category: "美白" },
    { hotword: "氨基酸洗面奶", category: "清洁" },
    { hotword: "防晒不搓泥", category: "防晒" },
    { hotword: "玻尿酸补水套装", category: "补水保湿" },
    { hotword: "痘肌控油水乳", category: "控油祛痘" },
    { hotword: "医美术后修复", category: "修复" },
    { hotword: "隔离妆前乳", category: "底妆" },
    { hotword: "身体乳速吸收", category: "身体护理" },
    { hotword: "护发精油修复", category: "发品" },
    { hotword: "睡眠面膜续航", category: "睡眠护理" },
  ];

  const angleTemplates = [
    "用「真实使用一周」的视角，拆穿你以为的效果差异",
    "从“适合/不适合”的边界切入，比种草更有说服力",
    "把成分故事翻译成日常可执行的护肤步骤",
    "用对比表格的思路：质地、肤感、耐受度一次说清",
    "按预算分层：同路线不同价位怎么选",
    "用“避雷清单”反向种草，降低你踩坑成本",
    "围绕痛点（暗沉/泛红/干痒）给出可复用流程",
    "以“懒人也能做”为目标，把步骤压到最短",
  ];

  const outlineTemplates = [
    "① 开场：你的画像 & 这次为什么选它\n② 成分/肤感速览（30秒读懂）\n③ 一周变化：早晚对比\n④ 不适配提醒：谁该绕开\n⑤ 最后：给你一套可复用护肤流程",
    "① 先问：你有没有同款困扰\n② 质地上脸（上妆/不搓泥场景）\n③ 真实效果：主观感受 + 可观察指标\n④ 搭配建议：和你现有产品怎么组合\n⑤ 适用人群与替代方案",
    "① 先做选择题：你是敏感优先还是效果优先\n② 3点复盘：耐受、保湿、稳定性\n③ 误区拆解：你为什么会“越用越糟”\n④ 我会怎么继续用（下一步计划）\n⑤ 总结：一句话结论 + 覆盖人群",
  ];

  const coverTextTemplates = [
    "一周见分晓",
    "别再踩雷了",
    "肤感/耐受实测",
    "同路线不同价",
    "敏感肌友好？",
    "上脸不翻车",
    "最该被看见的对比",
    "懒人护肤流程",
    "把成分讲明白",
    "你的肤况适不适合",
  ];

  const whyFitsTemplates = [
    `你的内容风格是“${profile.contentStyle}”，这条用「短结论 + 过程复盘」更容易被收藏`,
    `你的人设是“${profile.persona}”，选题切入边界（适合/不适合）更符合可信度表达`,
    `你的目标用户是“${profile.targetAudience}”，这条围绕痛点给出可执行流程，减少筛选成本`,
    `你过往笔记标题偏向“${profile.niche}”主题，这条把热点词转成“账号可复用结构”`,
  ];

  const nicheHint = profile.niche.toLowerCase();
  const identityHint = profile.identity.toLowerCase();

  const used = new Set<string>();
  const results: TopicIdea[] = [];

  while (results.length < 10) {
    const pick = hotwordPools[Math.floor(rand() * hotwordPools.length)];
    if (used.has(pick.hotword)) continue;
    used.add(pick.hotword);

    const nicheBoost =
      (nicheHint.includes("护肤") && pick.category === "护肤") ||
      (nicheHint.includes("敏感") && pick.category === "敏感肌") ||
      (nicheHint.includes("美白") && pick.category === "美白") ||
      (nicheHint.includes("防晒") && pick.category === "防晒") ||
      (nicheHint.includes("控油") && pick.category === "控油祛痘")
        ? 12
        : 6;

    const identityBoost = identityHint.includes("新手")
      ? 8
      : identityHint.includes("测评") || identityHint.includes("评测")
        ? 10
        : 7;

    const avoidPenalty = avoidTokens.reduce((acc, token) => {
      if (!token) return acc;
      return pick.hotword.includes(token) || profile.niche.includes(token) ? acc + 18 : acc;
    }, 0);

    const base = 58 + nicheBoost + identityBoost + Math.floor(rand() * 14) - avoidPenalty * 0.35;
    const matchScore = clamp(Math.round(base), 45, 98);

    const angle = angleTemplates[Math.floor(rand() * angleTemplates.length)];
    const outline = outlineTemplates[Math.floor(rand() * outlineTemplates.length)];
    const coverText = coverTextTemplates[Math.floor(rand() * coverTextTemplates.length)];
    const whyItFits = whyFitsTemplates[Math.floor(rand() * whyFitsTemplates.length)];

    // Title structure: 小红书友好的“场景 + 结论/差异”
    const titleVariants = [
      `同是${profile.niche}，为什么“${pick.hotword}”更适合${profile.targetAudience}？`,
      `我把「${pick.hotword}」拆成3个关键：你关心的都在这`,
      `别急着下单：${pick.hotword}到底值不值（按肤况讲清楚）`,
      `一周真实复盘：${pick.hotword}对我这种“${profile.identity}”是什么效果？`,
      `避雷思路：${pick.hotword}怎么用才不翻车？`,
    ];

    const title = titleVariants[Math.floor(rand() * titleVariants.length)];

    results.push({
      matchScore,
      hotword: pick.hotword,
      title,
      angle,
      outline,
      coverText,
      whyItFits,
    });
  }

  // Sort by match score to feel “top matches first”
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-600">匹配度</span>
        <span className="text-xs font-semibold text-zinc-900">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/60 ring-1 ring-black/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b7e]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<"structured" | "freeform">(
    "structured",
  );
  const defaultProfile: CreatorProfile = {
    identity: "小红书新手博主",
    niche: "护肤测评 / 敏感肌友好",
    targetAudience: "25-35岁敏感肌女生",
    persona: "温柔理性种草官（少废话）",
    contentStyle: "干净清爽 + 数据对比",
    pastTitles:
      "敏感肌用完不闷痘的精华：我坚持用了30天\n30秒看懂护肤成分对不对：对比真实肤况\n同价位里我最愿意回购的那一瓶：上脸细节",
    avoidTopics: "夸大疗效、开箱难用、含激素恐慌、极端对比言论",
    freeformInfo: "",
  };
  const [profile, setProfile] = useState<CreatorProfile>(defaultProfile);

  const mockHotwords: HotwordCard[] = useMemo(
    () => [
      { hotword: "熬夜修复精华", matchScore: 88, angle: "从熬夜后暗沉场景切入，对比早晚使用体验" },
      { hotword: "屏障修护面霜", matchScore: 84, angle: "敏感期能不能用，按肤况给出适配边界" },
      { hotword: "维C淡斑精华", matchScore: 82, angle: "以耐受度和提亮节奏做分阶段复盘" },
      { hotword: "防晒不搓泥", matchScore: 81, angle: "通勤底妆场景实测，讲清成膜和搓泥差异" },
      { hotword: "氨基酸洗面奶", matchScore: 79, angle: "清洁力和洗后紧绷感做横向比较" },
      { hotword: "玻尿酸补水套装", matchScore: 78, angle: "按预算分层，给出保湿路线搭配建议" },
    ],
    [],
  );

  const [seedSalt, setSeedSalt] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const progressTimerRef = useRef<number | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  const saveMessageTimerRef = useRef<number | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0);
  const [authMessage, setAuthMessage] = useState("");
  const [profileSaveMessage, setProfileSaveMessage] = useState("");
  const [historyRecords, setHistoryRecords] = useState<IdeaGenerationHistoryRow[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<TopicIdea[]>(() => generateMockIdeas(defaultProfile, 1));

  useEffect(() => {
    const timerId = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let timerId: number | null = null;
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CreatorProfile>;
      timerId = window.setTimeout(() => {
        setProfile((prev) => ({
          identity: String(parsed.identity ?? prev.identity),
          niche: String(parsed.niche ?? prev.niche),
          targetAudience: String(parsed.targetAudience ?? prev.targetAudience),
          persona: String(parsed.persona ?? prev.persona),
          contentStyle: String(parsed.contentStyle ?? prev.contentStyle),
          pastTitles: String(parsed.pastTitles ?? prev.pastTitles),
          avoidTopics: String(parsed.avoidTopics ?? prev.avoidTopics),
          freeformInfo: String(parsed.freeformInfo ?? prev.freeformInfo),
        }));
      }, 0);
    } catch {
      // Ignore invalid localStorage data.
    }

    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [mounted, profile]);

  useEffect(() => {
    if (!mounted) return;

    const loadSessionAndProfile = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return;

      const authUser = data.session?.user;
      if (!authUser) return;
      setUser({
        id: authUser.id,
        email: authUser.email ?? "",
      });

      const { data: dbProfile, error: dbError } = await supabase
        .from("creator_profiles")
        .select(
          "identity,niche,target_audience,persona,content_style,past_titles,avoid_topics,freeform_info",
        )
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!dbError && dbProfile) {
        setProfile((prev) => mergeProfile(prev, profileFromDbRow(dbProfile as DbCreatorProfileRow)));
      }
    };

    void loadSessionAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user;
      if (!authUser) {
        setUser(null);
        return;
      }
      setUser({
        id: authUser.id,
        email: authUser.email ?? "",
      });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !user) return;

    const timerId = window.setTimeout(async () => {
      const { error } = await supabase.from("creator_profiles").upsert({
        user_id: user.id,
        identity: profile.identity,
        niche: profile.niche,
        target_audience: profile.targetAudience,
        persona: profile.persona,
        content_style: profile.contentStyle,
        past_titles: profile.pastTitles,
        avoid_topics: profile.avoidTopics,
        freeform_info: profile.freeformInfo,
      });

      if (saveMessageTimerRef.current) {
        window.clearTimeout(saveMessageTimerRef.current);
      }

      if (error) {
        setProfileSaveMessage("保存失败请稍后重试");
        return;
      }

      setProfileSaveMessage("画像已自动保存");
      saveMessageTimerRef.current = window.setTimeout(() => {
        setProfileSaveMessage("");
      }, 1800);
    }, 500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [mounted, profile, user]);

  useEffect(() => {
    if (!mounted) return;

    if (!user) {
      const timerId = window.setTimeout(() => {
        setHistoryRecords([]);
        setExpandedHistoryId(null);
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    const loadHistory = async () => {
      const { data, error } = await supabase
        .from("idea_generations")
        .select("id,created_at,ideas")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error || !data) return;
      setHistoryRecords(data as IdeaGenerationHistoryRow[]);
    };

    void loadHistory();
  }, [mounted, user]);

  useEffect(() => {
    return () => {
      if (saveMessageTimerRef.current) window.clearTimeout(saveMessageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (magicLinkCooldown <= 0) return;
    const timerId = window.setTimeout(() => {
      setMagicLinkCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timerId);
  }, [magicLinkCooldown]);

  function updateProfile<K extends keyof CreatorProfile>(key: K, value: CreatorProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function toTopicIdea(raw: unknown): TopicIdea {
    const item = raw as Record<string, unknown>;
  
    const rawScore = item?.matchScore || item?.score || 0;
  
    const matchScore = Number(rawScore);
  
    const rawTitle = item?.title || item?.topicTitle || item?.titleText || "未返回标题";
  
    const rawHotword = item?.hotword || item?.hotwordUsed || item?.keyword || "热词";
  
    const rawAngle =
      item?.angle ??
      item?.contentAngle ??
      item?.rewriteLogic ??
      item?.direction;
  
    const rawOutline =
      item?.outline ??
      item?.structure ??
      item?.contentStructure;
  
    const rawCoverText =
      item?.coverText ??
      item?.coverCopy ??
      item?.coverTitle ??
      item?.cover;
  
    const rawWhyItFits =
      item?.whyItFits ??
      item?.fitReason ??
      item?.whySuitable ??
      item?.reason;
  
    const outlineText = Array.isArray(rawOutline)
      ? rawOutline.join("\n")
      : String(rawOutline ?? "暂未返回大纲");
  
    return {
      matchScore: Number.isFinite(matchScore)
        ? clamp(Math.round(matchScore), 0, 100)
        : 0,
      hotword: String(rawHotword),
      title: String(rawTitle),
      angle: String(rawAngle ?? "暂未返回选题角度"),
      outline: outlineText,
      coverText: String(rawCoverText ?? "封面文案待补充"),
      whyItFits: String(rawWhyItFits ?? "该选题与当前创作者画像较为匹配"),
    };
  }

  async function onGenerate() {
    if (isGenerating) return;
    setErrorMessage("");
    setIsGenerating(true);
    setLoadingProgress(0);
    setLoadingStepIndex(0);

    progressTimerRef.current = window.setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 90) return 90;
        const delta = Math.max(1, Math.round((90 - prev) * 0.08));
        return Math.min(90, prev + delta);
      });
    }, 180);

    stepTimerRef.current = window.setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 1400);

    const nextSeed = seedSalt + 1;
    setSeedSalt(nextSeed);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creatorProfile: profile,
        }),
      });

      const payload = (await resp.json().catch(() => ({}))) as GenerateApiResponse;
      if (!resp.ok || payload.ok === false) {
        throw new Error(payload.message || payload.error || `请求失败（${resp.status}）`);
      }

      if (!Array.isArray(payload.data)) {
        throw new Error("返回结果格式错误：data 不是数组");
      }

      const nextIdeas = payload.data.slice(0, 10).map((item) => toTopicIdea(item));
      if (!nextIdeas.length) {
        throw new Error("未生成可展示的选题");
      }

      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setLoadingProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 240));
      setIdeas(nextIdeas);
      if (user) {
        try {
          const { error: insertError } = await supabase.from("idea_generations").insert({
            user_id: user.id,
            creator_profile_snapshot: profile,
            hotwords_snapshot: nextIdeas.map((i) => i.hotword || "热词"),
            ideas: nextIdeas,
          });
          if (insertError) {
            throw insertError;
          }

          const { data: historyData } = await supabase
            .from("idea_generations")
            .select("id,created_at,ideas")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5);
          if (historyData) {
            setHistoryRecords(historyData as IdeaGenerationHistoryRow[]);
          }
        } catch (e) {
          console.error("保存历史失败", e);
        }
      }
      setHasGenerated(true);
    } catch (error) {
      console.error("Failed to generate ideas:", error);
      setErrorMessage("生成失败，请检查 API Key 或稍后重试");
      setLoadingProgress(0);
      // API failure fallback: keep experience usable with local mock ideas.
      setIdeas(generateMockIdeas(profile, nextSeed));
      setHasGenerated(false);
    } finally {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (stepTimerRef.current) {
        window.clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
      if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    };
  }, []);

  const hotwordCards = useMemo<HotwordCard[]>(() => {
    if (!hasGenerated || ideas.length === 0) return mockHotwords;
    return ideas
      .slice(0, 12)
      .map((idea) => ({
        hotword: idea.hotword || "热词",
        matchScore: Number.isFinite(idea.matchScore) ? idea.matchScore : 0,
        angle: idea.angle || "选题角度待补充",
      }));
  }, [hasGenerated, ideas, mockHotwords]);

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? "" : prev));
      }, 1200);
    } catch {
      setErrorMessage("复制失败，请手动复制内容");
    }
  }

  async function sendMagicLink() {
    if (!authEmail.trim() || isSendingLink || magicLinkCooldown > 0) return;
    setAuthMessage("");
    setIsSendingLink(true);
    setMagicLinkCooldown(60);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
      });
      if (error) {
        console.error("Magic link send failed:", error);
        if ((error.message || "").toLowerCase().includes("email rate limit exceeded")) {
          setAuthMessage("发送过于频繁，请稍后再试");
        } else {
          setAuthMessage(error.message || "发送失败，请稍后重试");
        }
      } else {
        setAuthMessage("登录链接已发送，请检查邮箱");
      }
    } catch (e) {
      console.error("Magic link send crashed:", e);
      setAuthMessage("发送失败，请稍后重试");
    }
    setIsSendingLink(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthMessage("");
  }

  const gradientRing =
    "before:absolute before:inset-0 before:rounded-[22px] before:bg-gradient-to-b before:from-[#ff2442]/25 before:to-transparent before:pointer-events-none";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ffe6ea] via-[#fff5f8] to-white text-zinc-900 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-28 -left-28 h-72 w-72 rounded-full bg-[#ff2442]/10 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -right-24 h-80 w-80 rounded-full bg-[#ff2442]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-white/50 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Hero */}
        <section className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 ring-1 ring-black/[0.04] px-4 py-2 backdrop-blur">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#ff2442]" />
            <span className="text-xs font-medium text-zinc-700">今日热点选题生成器</span>
            <span className="text-xs text-zinc-500">•</span>
            <span className="text-xs font-medium text-zinc-700">SaaS Dashboard 体验</span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px] lg:items-end">
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold leading-tight tracking-tight">
                <span className="bg-gradient-to-r from-[#ff2442] to-[#ff6b7e] bg-clip-text text-transparent">
                  小红书创作助手
                </span>
              </h1>
              <p className="mt-3 text-zinc-600 leading-relaxed">
                把每日热点，变成适合你账号风格的爆款选题
              </p>
            </div>

            <div className="lg:justify-self-end space-y-3 w-full">
              <div className="rounded-2xl bg-white/70 backdrop-blur ring-1 ring-black/[0.05] p-3 shadow-[0_8px_22px_rgba(0,0,0,0.06)]">
                {user ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-zinc-600 truncate">已登录：{user.email || "当前用户"}</div>
                    <button
                      type="button"
                      onClick={signOut}
                      className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-black/[0.06] hover:bg-zinc-50 transition"
                    >
                      退出登录
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="输入邮箱接收登录链接"
                      className="w-full rounded-xl bg-white/90 ring-1 ring-black/[0.06] px-3 py-2 text-xs outline-none focus:ring-[#ff2442]/30"
                    />
                    <button
                      type="button"
                      onClick={sendMagicLink}
                      disabled={isSendingLink || magicLinkCooldown > 0}
                      className="w-full rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#b3122a] ring-1 ring-[#ff2442]/20 hover:bg-[#fff5f7] transition disabled:opacity-60"
                    >
                      {isSendingLink
                        ? "发送中..."
                        : magicLinkCooldown > 0
                          ? `请等待 ${magicLinkCooldown} 秒`
                          : "发送登录链接"}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating}
                className="group relative inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff2442] text-white shadow-[0_14px_40px_rgba(255,36,66,0.28)] ring-1 ring-white/30 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_54px_rgba(255,36,66,0.34)]"
              >
                <span className="text-sm font-semibold">
                  {isGenerating ? "生成中..." : "生成今日选题"}
                </span>
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full bg-white/90 transition-opacity duration-200 ${
                    isGenerating ? "opacity-80" : "opacity-100"
                  }`}
                />
              </button>
              <div className="mt-2 text-xs text-zinc-500 text-center lg:text-right">
                基于你的“画像”生成结果（已接入 /api/generate）
              </div>
            </div>
          </div>
          {authMessage ? (
            <div className="mt-3 rounded-2xl bg-white/80 text-zinc-700 ring-1 ring-black/[0.05] px-4 py-3 text-sm">
              {authMessage}
            </div>
          ) : null}
          {profileSaveMessage ? (
            <div className="mt-3 rounded-2xl bg-white/80 text-zinc-700 ring-1 ring-black/[0.05] px-4 py-3 text-sm">
              {profileSaveMessage}
            </div>
          ) : null}
          {isGenerating ? (
            <div className="mt-4 rounded-2xl bg-white/70 ring-1 ring-black/[0.05] p-4 backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">
                  {LOADING_STEPS[loadingStepIndex]}
                </span>
                <span className="text-xs font-semibold text-[#b3122a]">{loadingProgress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#ff2442]/10 overflow-hidden ring-1 ring-[#ff2442]/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b7e] transition-[width] duration-300 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mt-3 rounded-2xl bg-rose-50/90 text-rose-700 ring-1 ring-rose-200 px-4 py-3 text-sm">
              {errorMessage}
            </div>
          ) : null}
        </section>

        {/* Content */}
        <section className="grid gap-6 lg:grid-cols-[420px_1fr] items-start">
          {/* Left: Creator profile */}
          <aside
            className={`relative rounded-3xl bg-white/55 backdrop-blur ${gradientRing} shadow-[0_10px_30px_rgba(255,36,66,0.10)] ring-1 ring-white/60 overflow-hidden`}
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">创作者画像</h2>
                  <p className="text-sm text-zinc-600 mt-1">把你的账号习惯告诉我（越具体越好）</p>
                </div>
                <div className="hidden sm:flex items-center justify-center h-10 w-10 rounded-2xl bg-white/70 ring-1 ring-black/[0.04]">
                  <span className="text-xl">✦</span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-white/70 ring-1 ring-black/[0.05] p-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveProfileTab("structured")}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    activeProfileTab === "structured"
                      ? "bg-gradient-to-r from-[#ff2442] to-[#ff6b7e] text-white shadow-[0_10px_20px_rgba(255,36,66,0.24)]"
                      : "text-zinc-600 hover:bg-white/70"
                  }`}
                >
                  结构化填写
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileTab("freeform")}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    activeProfileTab === "freeform"
                      ? "bg-gradient-to-r from-[#ff2442] to-[#ff6b7e] text-white shadow-[0_10px_20px_rgba(255,36,66,0.24)]"
                      : "text-zinc-600 hover:bg-white/70"
                  }`}
                >
                  自由补充
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {activeProfileTab === "structured" ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">身份标签</label>
                        <span className="text-[11px] text-zinc-500">identity</span>
                      </div>
                      <input
                        value={profile.identity}
                        onChange={(e) => updateProfile("identity", e.target.value)}
                        className="w-full rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition"
                        placeholder="例如：新手博主/测评达人/带货型账号"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">赛道</label>
                        <span className="text-[11px] text-zinc-500">niche</span>
                      </div>
                      <input
                        value={profile.niche}
                        onChange={(e) => updateProfile("niche", e.target.value)}
                        className="w-full rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition"
                        placeholder="例如：护肤测评 / 敏感肌友好"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">目标用户</label>
                        <span className="text-[11px] text-zinc-500">targetAudience</span>
                      </div>
                      <input
                        value={profile.targetAudience}
                        onChange={(e) => updateProfile("targetAudience", e.target.value)}
                        className="w-full rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition"
                        placeholder="例如：25-35岁敏感肌女生"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">人设</label>
                        <span className="text-[11px] text-zinc-500">persona</span>
                      </div>
                      <input
                        value={profile.persona}
                        onChange={(e) => updateProfile("persona", e.target.value)}
                        className="w-full rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition"
                        placeholder="例如：温柔理性种草官（少废话）"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">内容风格</label>
                        <span className="text-[11px] text-zinc-500">contentStyle</span>
                      </div>
                      <input
                        value={profile.contentStyle}
                        onChange={(e) => updateProfile("contentStyle", e.target.value)}
                        className="w-full rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition"
                        placeholder="例如：干净清爽 + 数据对比"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">过往笔记标题</label>
                        <span className="text-[11px] text-zinc-500">pastTitles</span>
                      </div>
                      <textarea
                        value={profile.pastTitles}
                        onChange={(e) => updateProfile("pastTitles", e.target.value)}
                        className="w-full min-h-[96px] rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition resize-none"
                        placeholder="多行：粘贴你最常用的爆款标题结构"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700">避免内容</label>
                        <span className="text-[11px] text-zinc-500">avoidTopics</span>
                      </div>
                      <textarea
                        value={profile.avoidTopics}
                        onChange={(e) => updateProfile("avoidTopics", e.target.value)}
                        className="w-full min-h-[84px] rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition resize-none"
                        placeholder="例如：夸大疗效、极端言论、重复模板"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-700">自由补充信息</label>
                      <span className="text-[11px] text-zinc-500">freeformInfo</span>
                    </div>
                    <div className="text-xs text-zinc-500 leading-relaxed">
                      你可以粘贴主页简介、过往笔记标题、评论区反馈、账号定位、最近想做的方向，AI 会自动整理成创作者画像。
                    </div>
                    <textarea
                      value={profile.freeformInfo}
                      onChange={(e) => updateProfile("freeformInfo", e.target.value)}
                      className="w-full min-h-[260px] rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-3 text-sm outline-none focus:ring-[#ff2442]/30 focus:border-[#ff2442]/40 transition resize-y"
                      placeholder="例如：主页简介、评论区用户高频问题、最近 10 条笔记标题、近期想突破的方向..."
                    />
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700">提示：</span>
                  你改完画像后，点一次主按钮即可刷新选题。
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff2442]" />
                  <span className="text-xs font-semibold text-zinc-700">Smart Match</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Right: Ideas */}
          <div
            className="relative rounded-3xl bg-white/55 backdrop-blur shadow-[0_10px_30px_rgba(0,0,0,0.06)] ring-1 ring-white/60 overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-black/[0.04]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">今日选题灵感</h2>
                  <p className="text-sm text-zinc-600 mt-1">共 10 条，按匹配度从高到低</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 rounded-2xl bg-white/70 ring-1 ring-black/[0.04] px-3 py-2">
                  <span className="text-xs text-zinc-500">主色</span>
                  <span className="text-xs font-semibold text-[#ff2442]">#ff2442</span>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ideas.map((it, idx) => (
                  <article
                    key={`${it.hotword}-${idx}`}
                    className="group rounded-3xl bg-white/70 backdrop-blur ring-1 ring-black/[0.04] p-4 shadow-[0_10px_24px_rgba(255,36,66,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(255,36,66,0.16)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-8 w-8 rounded-2xl bg-gradient-to-br from-[#ff2442]/15 to-[#ff6b7e]/15 ring-1 ring-[#ff2442]/20 flex items-center justify-center text-[#ff2442] text-sm font-semibold">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-medium text-zinc-700">热词</span>
                      </div>
                      <div className="px-3 py-1 rounded-full bg-[#ff2442]/10 ring-1 ring-[#ff2442]/15 text-xs font-semibold text-[#b3122a]">
                        {it.hotword}
                      </div>
                    </div>

                    <div className="mt-3">
                      <ProgressBar value={it.matchScore} />
                    </div>

                    <h3 className="mt-4 text-sm font-semibold leading-snug text-zinc-900 group-hover:text-[#b3122a] transition">
                      {it.title}
                    </h3>

                    <div className="mt-3 text-xs text-zinc-700">
                      <div className="font-semibold text-zinc-800">角度</div>
                      <div className="mt-1 leading-relaxed">{it.angle}</div>
                    </div>

                    <div className="mt-3 text-xs text-zinc-700">
                      <div className="font-semibold text-zinc-800">大纲</div>
                      <pre className="mt-1 whitespace-pre-wrap font-sans leading-relaxed text-zinc-700">
                        {it.outline}
                      </pre>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/80 ring-1 ring-black/[0.04] px-3 py-1 text-xs font-semibold text-zinc-800">
                        封面：{it.coverText}
                      </span>
                    </div>

                    <div className="mt-3 text-xs text-zinc-600 leading-relaxed">
                      <span className="font-semibold text-zinc-800">为什么适合你：</span>
                      {it.whyItFits}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(it.title, `title-${idx}`)}
                        className="rounded-xl bg-white/85 px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-black/[0.06] transition hover:bg-white"
                      >
                        {copiedKey === `title-${idx}` ? "已复制标题" : "复制标题"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            `标题：${it.title}\n热词：${it.hotword}\n匹配度：${it.matchScore}%\n角度：${it.angle}\n大纲：${it.outline}\n封面文案：${it.coverText}\n为什么适合你：${it.whyItFits}`,
                            `full-${idx}`,
                          )
                        }
                        className="rounded-xl bg-[#ff2442]/10 px-3 py-1.5 text-xs font-semibold text-[#b3122a] ring-1 ring-[#ff2442]/20 transition hover:bg-[#ff2442]/15"
                      >
                        {copiedKey === `full-${idx}` ? "已复制完整选题" : "复制完整选题"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 text-xs text-zinc-500">
                小提示：如果你希望“更像测评/更像科普/更像带货”，可以在画像里改“人设 + 内容风格”。
              </div>
            </div>
          </div>
        </section>

        {/* Bottom: Hotword tags */}
        {mounted ? (
          <section className="mt-6">
            <div className="rounded-3xl bg-white/55 backdrop-blur shadow-[0_10px_30px_rgba(0,0,0,0.06)] ring-1 ring-white/60 overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-black/[0.04]">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">今日热点词</h2>
                    <p className="text-sm text-zinc-600 mt-1">
                      {hasGenerated ? "基于本次生成结果提取（最多 12 个）" : "尚未生成，先展示 mock 占位"}
                    </p>
                  </div>
                  <div className="text-xs text-zinc-500">
                    每个卡片展示：hotword、matchScore、angle 摘要
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {hotwordCards.map((t, idx) => (
                    <div
                      key={`${t.hotword}-${idx}`}
                      className="rounded-3xl bg-white/70 ring-1 ring-black/[0.04] px-4 py-4 shadow-[0_10px_24px_rgba(255,36,66,0.10)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-[#b3122a] bg-[#ff2442]/10 ring-1 ring-[#ff2442]/15 px-3 py-1 rounded-full">
                          热词
                        </div>
                        <div className="text-xs font-semibold text-zinc-600">{t.matchScore}% 匹配</div>
                      </div>
                      <div className="mt-3 text-sm font-semibold text-zinc-900 leading-snug">
                        {t.hotword}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {(t.angle || "").slice(0, 48)}
                        {(t.angle || "").length > 48 ? "..." : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <div className="rounded-3xl bg-white/55 backdrop-blur shadow-[0_10px_30px_rgba(0,0,0,0.06)] ring-1 ring-white/60 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-black/[0.04]">
              <h2 className="text-base font-semibold">历史生成记录</h2>
            </div>
            <div className="p-5 sm:p-6 space-y-3">
              {!user ? (
                <div className="rounded-2xl bg-white/80 ring-1 ring-black/[0.05] px-4 py-4 text-sm text-zinc-600">
                  登录后可查看历史生成记录。
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="rounded-2xl bg-white/80 ring-1 ring-black/[0.05] px-4 py-4 text-sm text-zinc-600">
                  你还没有生成过选题，快试试吧～
                </div>
              ) : (
                historyRecords.map((record) => {
                  const recordIdeasRaw = Array.isArray(record.ideas) ? record.ideas : [];
                  const recordIdeas = recordIdeasRaw.map((item) => toTopicIdea(item));
                  const expanded = expandedHistoryId === record.id;
                  return (
                    <div
                      key={record.id}
                      className="rounded-2xl bg-white/80 ring-1 ring-black/[0.05] shadow-[0_8px_22px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]"
                    >
                      <div className="px-4 py-4 flex items-center justify-between gap-3">
                        <div className="text-sm text-zinc-700">
                          <div className="font-medium">{formatDateTime(record.created_at)}</div>
                          <div className="text-xs text-zinc-500 mt-1">选题数量：{recordIdeas.length}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(expanded ? null : record.id)}
                          className="rounded-xl bg-[#ff2442]/10 px-3 py-1.5 text-xs font-semibold text-[#b3122a] ring-1 ring-[#ff2442]/20 transition hover:bg-[#ff2442]/15"
                        >
                          {expanded ? "收起" : "查看"}
                        </button>
                      </div>

                      {expanded ? (
                        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {recordIdeas.map((it, idx) => (
                            <article
                              key={`${record.id}-${it.hotword}-${idx}`}
                              className="group rounded-2xl bg-white/90 ring-1 ring-black/[0.04] p-4 shadow-[0_10px_24px_rgba(255,36,66,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(255,36,66,0.16)]"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-medium text-zinc-700">热词</span>
                                <div className="px-3 py-1 rounded-full bg-[#ff2442]/10 ring-1 ring-[#ff2442]/15 text-xs font-semibold text-[#b3122a]">
                                  {it.hotword}
                                </div>
                              </div>
                              <div className="mt-3">
                                <ProgressBar value={it.matchScore} />
                              </div>
                              <h3 className="mt-4 text-sm font-semibold leading-snug text-zinc-900 group-hover:text-[#b3122a] transition">
                                {it.title}
                              </h3>
                              <div className="mt-2 text-xs text-zinc-600 leading-relaxed line-clamp-2">
                                {it.angle}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <footer className="mt-8 pb-10 text-center text-xs text-zinc-500">
          小红书创作助手（Mock UI）— Next.js App Router + Tailwind CSS
        </footer>
      </div>
    </div>
  );
}
