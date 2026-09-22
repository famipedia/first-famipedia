/* ==========================================================
   api.ts  ―  AI（サーバー）とのやり取りをまとめた場所
   ----------------------------------------------------------
   ★ ここがチームの合流点です。
     ・画面担当は generateArticle() を呼ぶだけでよい
     ・サーバー担当は /api/generate を作るだけでよい
     両方が同時に進められるよう、今は仮データで動いています。

   サーバーが完成したら USE_MOCK を false にするだけ。
   画面側のコードは一行も変えなくて済みます。
   ========================================================== */

import type { GenerateRequest, GenerateResult, SectionId } from './types';
import mockData from './mockData.json';

/** true = 仮データで動く / false = 本物のサーバーを呼ぶ */
export const USE_MOCK = true;

/** 本物のサーバーの窓口 */
const API_ENDPOINT = '/api/generate';


/* ----------------------------------------------------------
   外から呼ぶのはこの関数だけです
   ---------------------------------------------------------- */

export async function generateArticle(
  questionId: string,
  req: GenerateRequest,
): Promise<GenerateResult> {

  if (USE_MOCK) {
    return mockGenerate(questionId, req);
  }

  // ---- ここから下が本番用 ----
  //
  // ※ APIキーはこのファイルに絶対に書かないでください。
  //    ブラウザの開発者ツールから誰でも読めてしまいます。
  //    キーはサーバー側の環境変数に置き、サーバーがAIを呼びます。

  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`サーバーから ${res.status} が返ってきました`);
  }

  const data = await res.json() as GenerateResult;

  // 返ってきた中身が想定どおりか、軽く確かめる
  if (typeof data.text !== 'string') {
    throw new Error('返ってきたデータの形が想定と違います');
  }

  return data;
}


/* ----------------------------------------------------------
   仮の返事を作る部分（サーバーができたら使われなくなります）
   ---------------------------------------------------------- */

type MockEntry = {
  section: string;
  template: string;
  followUp: string | null;
};

const table = mockData.byQuestion as Record<string, MockEntry>;

async function mockGenerate(
  questionId: string,
  req: GenerateRequest,
): Promise<GenerateResult> {

  // 本物のサーバーは一瞬では返りません。
  // 待ち時間の見た目を確かめられるよう、わざと少し遅らせています。
  await sleep(600 + Math.random() * 500);

  const entry = table[questionId] ?? (mockData.fallback as MockEntry);
  const answer = tidy(req.answer);

  return {
    section: entry.section as SectionId,
    year: extractYear(answer),
    text: entry.template.replace('{answer}', answer),
    followUp: entry.followUp,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/* ----------------------------------------------------------
   文章の下ごしらえ
   （本番ではAI側がやる仕事ですが、仮版では手前で処理します）
   ---------------------------------------------------------- */

/** 改行や余分な空白をならして1行にする */
export function tidy(s: string): string {
  return s.trim().replace(/\s*\n+\s*/g, ' ');
}

/** 文中から「1972年」「昭和30年」のような年の表記を探す */
export function extractYear(text: string): string | null {
  const m = text.match(/((?:19|20)\d{2}|[昭平令][和成])\s*\d{0,2}年?/);
  if (!m) return null;
  return m[0].replace(/年?$/, '年');
}
