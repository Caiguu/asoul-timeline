export interface MemberInfo {
  uid: number;
  name: string;
  keywords: string[];
  roomId: number;
}

export const MEMBER_MAP: MemberInfo[] = [
  {
    uid: 672328094,
    name: "嘉然今天吃什么",
    keywords: ["嘉然", "嘉然今天吃什么"],
    roomId: 22637261,
  },
  {
    uid: 672353429,
    name: "贝拉kira",
    keywords: ["贝拉", "贝拉kira"],
    roomId: 22632424,
  },
  {
    uid: 672342685,
    name: "乃琳Queen",
    keywords: ["乃琳", "乃琳Queen"],
    roomId: 22625027,
  },
];

export function findMember(text: string): MemberInfo | null {
  for (const m of MEMBER_MAP) {
    for (const kw of m.keywords) {
      if (text.includes(kw)) return m;
    }
  }
  return null;
}

export function findMembers(texts: (string | undefined)[]): MemberInfo[] {
  const found: MemberInfo[] = [];
  for (const t of texts) {
    if (!t) continue;
    const m = findMember(t);
    if (m && !found.some((f) => f.uid === m.uid)) found.push(m);
  }
  return found;
}

export function roomUrlForMember(member: MemberInfo | null): string | null {
  if (!member) return null;
  return `https://live.bilibili.com/${member.roomId}`;
}