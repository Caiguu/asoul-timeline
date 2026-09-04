import type { DynamicType } from "@asoul-timeline/shared";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY ?? "";
const DOUBAO_BASE_URL =
  process.env.DOUBAO_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
const DOUBAO_MODEL = process.env.DOUBAO_MODEL ?? "doubao-seed-1-8-251228";

export async function classifyType(text: string): Promise<DynamicType> {
  if (!DEEPSEEK_API_KEY) return "normal";
  return "normal";
}

export interface OcrScheduleItem {
  date: string;
  time: string;
  title: string;
  type: string;
  participants: string[];
  roomOwner: string;
}

// 豆包识别日程表图片
export async function ocrScheduleImage(
  imageUrl: string,
): Promise<OcrScheduleItem[]> {
  if (!DOUBAO_API_KEY) {
    console.log("[llm] DOUBAO_API_KEY not set, skipping OCR");
    return [];
  }

  const prompt = `这是一个虚拟偶像团体A-SOUL的每周日程表图片。请仔细识别图片中的所有直播安排，并以JSON数组格式返回。每条直播安排包含以下字段：
- date: 日期，格式"MM-DD"
- time: 开始时间，格式"HH:mm"
- title: 直播标题（不含方括号等符号）
- type: 直播类型，"单播"(单人)、"双播"(双人)、"团播"(团体)
- participants: 参与成员名字数组，如["嘉然"]或["嘉然","贝拉"]
- roomOwner: 在谁的直播间直播，填成员名字（团播填"A-SOUL"）

成员名字参考：嘉然、贝拉、乃琳

只返回纯JSON数组，不要markdown代码块，不要其他文字。`;

  const res = await fetch(`${DOUBAO_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DOUBAO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DOUBAO_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: imageUrl },
            { type: "input_text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.log(`[llm] doubao OCR failed: HTTP ${res.status}`);
    return [];
  }

  const data = await res.json();

  // 找 message 类型的 output
  let text = "";
  for (const o of data.output ?? []) {
    if (o.type === "message" && o.content) {
      for (const c of o.content) {
        if (c.type === "output_text") text = c.text;
      }
    }
  }

  // 清理可能的 markdown 包裹
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    return JSON.parse(match[0]) as OcrScheduleItem[];
  } catch {
    console.log("[llm] failed to parse OCR JSON:", cleaned.slice(0, 200));
    return [];
  }
}