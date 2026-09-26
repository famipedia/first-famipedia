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
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from './firebaseConfig';

/** true = 仮データで動く / false = 本物のサーバーを呼ぶ */
export const USE_MOCK = false;


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

  // Firebase AI Logics の初期化
  const ai = getAI(app, {
    backend: new GoogleAIBackend()
  });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.7-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
あなたは、家族の聞き書きをwikipediaの記事にまとめる編集者です。

【対象者】
名前: ${req.person?.name || '不明'}
生年: ${req.person?.birth || '不明'}
出身: ${req.person?.place || '不明'}

【質問】
${req.question}

【本人の答え（話し言葉のまま）】
${req.answer}

この答えを、wikipediaの記述に整えてください。次の規則を守ること。

- 事実を足さない。答えに書かれていないことは絶対に書かない
- 話し言葉を書き言葉に直す。一人称は使わず、三人称で書く
- 1〜3文に収める
- 答えが曖昧なら、曖昧なまま書く（断定しない）

次のJSONだけを返してください。前後に説明を付けないこと。

{
  "section": "summary | timeline | episode | message のいずれか",
  "year": "答えに年が含まれていれば「1972年」の形。無ければ null",
  "text": "整えた本文",
  "followUp": "もう一歩踏み込むための質問を1つ。不要なら null"
}
  `.trim();

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = JSON.parse(text) as GenerateResult;

    if (typeof data.text !== 'string') {
      throw new Error('返ってきたデータの形が想定と違います');
    }

    return data;
  } catch (err) {
    console.error('AI Error:', err);
    throw new Error('AIの処理に失敗しました');
  }
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
