/* ==========================================================
   サーバー側の雛形（Node.js + Express）
   ----------------------------------------------------------
   AI担当の人が、このファイルを出発点にしてください。
   フロント側は src/api.ts から /api/generate を呼ぶだけなので、
   このファイルが完成すれば USE_MOCK を false にするだけで繋がります。

   使い方：
     npm init -y
     npm i express @anthropic-ai/sdk
     export ANTHROPIC_API_KEY=xxxxx      ← 環境変数に置く
     node server/index.example.js
   ========================================================== */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.json());

// ★ APIキーは必ず環境変数から読む。コードに直接書かないこと
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * フロントから来るもの（types.ts の GenerateRequest）
 *   { question, answer, person: { name, birth, place, job, family } }
 *
 * 返すもの（types.ts の GenerateResult）
 *   { section, year, text, followUp }
 */
app.post('/api/generate', async (req, res) => {
  const { question, answer, person } = req.body ?? {};

  if (typeof answer !== 'string' || answer.trim() === '') {
    return res.status(400).json({ message: 'answer が空です' });
  }

  const prompt = `
あなたは、家族の聞き書きをwikipediaの記事にまとめる編集者です。

【対象者】
名前: ${person?.name || '不明'}
生年: ${person?.birth || '不明'}
出身: ${person?.place || '不明'}

【質問】
${question}

【本人の答え（話し言葉のまま）】
${answer}

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
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';

    // AIがJSON以外を混ぜてくることがあるので、{ } の範囲だけ取り出す
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('JSONが見つかりませんでした');
    }

    const parsed = JSON.parse(raw.slice(start, end + 1));

    // 形が想定どおりか確かめてから返す
    res.json({
      section: ['summary', 'timeline', 'episode', 'message']
        .includes(parsed.section) ? parsed.section : 'episode',
      year: typeof parsed.year === 'string' ? parsed.year : null,
      text: String(parsed.text ?? answer),
      followUp: typeof parsed.followUp === 'string' ? parsed.followUp : null,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'AIの処理に失敗しました' });
  }
});

app.listen(3000, () => {
  console.log('http://localhost:3000 で待機中');
});
