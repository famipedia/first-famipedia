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

import type { GenerateRequest, GenerateResult, PersonInfo } from './types';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app } from './firebaseConfig';

/** true = 仮データで動く / false = 本物のサーバーを呼ぶ */
export const USE_MOCK = false;


// 追加質問（FollowUp）だけをAIに考えさせる
export async function generateFollowUp(
  req: GenerateRequest
): Promise<string | null> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.8-flash',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const prompt = `
あなたはインタビュアーです。
対象者: ${req.person?.name || '不明'} (${req.person?.birth || '不明'})
質問: ${req.question}
回答: ${req.answer}

この回答をさらに深掘りするための、短くて答えやすい追加質問を1つだけ考え、以下のJSON形式で返してください。
十分に話題が尽きている、または深掘り不要な場合は null を返してください。前後に説明を付けないこと。

{
  "followUp": "追加の質問"
}
  `.trim();

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const data = JSON.parse(text);
    return data.followUp || null;
  } catch (err) {
    console.error('FollowUp Error:', err);
    return null; // 失敗しても進行は妨げない
  }
}

// 複数のQ&A履歴から1つのまとめ記事を作らせる
export async function generateArticleSummary(
  history: { question: string; answer: string }[],
  person: PersonInfo
): Promise<GenerateResult> {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.8-flash',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const historyText = history.map(h => `【質問】${h.question}\n【回答】${h.answer}`).join('\n\n');

  const prompt = `
あなたは、家族の聞き書きをwikipediaの記事にまとめる編集者です。
対象者: ${person.name || '不明'} (${person.birth || '不明'})

以下は一連のインタビューのやり取りです：
${historyText}

これらをすべて踏まえて、1つのwikipediaの記述に整えてください。次の規則を守ること。
- 事実を足さない。答えに書かれていないことは絶対に書かない
- 話し言葉を書き言葉に直す。一人称は使わず、三人称で書く
- 1〜3文に収める
- 答えが曖昧なら、曖昧なまま書く（断定しない）
- 重要な固有名詞（地名、人名、歴史的な出来事など）は [[キーワード]] のように二重角括弧で囲んでください。（例: [[東京都]]で生まれた）

次のJSONだけを返してください。前後に説明を付けないこと。

{
  "section": "summary | timeline | episode | message のいずれか",
  "year": "答えに年が含まれていれば「1972年」の形。無ければ null",
  "text": "整えた本文",
  "followUp": null
}
  `.trim();

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const data = JSON.parse(text) as GenerateResult;
    return data;
  } catch (err) {
    console.error('Summary Error:', err);
    throw new Error('まとめ処理に失敗しました');
  }
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
