export interface CrawlAccount {
  uid: number;
  name: string;
}

// TODO: 核实以下 B 站 uid 后替换 0
//   ASOUL_Official / 嘉然今天吃什么 / 贝拉kira / 乃琳Queen
// 可在对应 B 站个人空间页 URL 中获取 uid
export const ASOUL_ACCOUNTS: CrawlAccount[] = [
  { uid: 703007996, name: "ASOUL_Official" },
  { uid: 672328094, name: "嘉然今天吃什么" },
  { uid: 672353429, name: "贝拉kira" },
  { uid: 672342685, name: "乃琳Queen" },
];
