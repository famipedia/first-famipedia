/* ==========================================================
   links.ts  ―  本文の中の言葉をリンクにする
   ----------------------------------------------------------
   リンク先の優先順位：
     1. Famipedia に登録した「思い出」のタイトル・別の呼び名
        → Famipedia 内の思い出ページ（memory.html?id=...）
     2. AIが [[キーワード]] で囲んだ固有名詞のうち、1に無いもの
        → これまでどおり Wikipedia

   また、[[ ]] で囲まれていなくても、本文の中に 1 の言葉が
   出てきたら自動でリンクにします。

   保存されている文章そのものは書き換えません。表示するたびに
   ここでリンクを決めるので、思い出を登録した時点で、
   これまでの記録にも自動でリンクが付きます。
   ========================================================== */

import type { PersonSummary } from './types';

/** リンクにする言葉 → 思い出のid */
let keywordToId = new Map<string, string>();

/** 本文から言葉を探す正規表現（長い言葉を優先）。言葉が無ければ null */
let keywordPattern: RegExp | null = null;

/** 記録の一覧から、リンクにする言葉を登録し直す */
export function setLinkTargets(records: PersonSummary[]): void {
  keywordToId = new Map();

  records
    .filter((r) => r.type === 'memory')
    .forEach((m) => {
      [m.name, ...m.aliases]
        .map((w) => w.trim())
        // 1文字の言葉は、関係ないところまでリンクになりやすいので除く
        .filter((w) => w.length >= 2)
        .forEach((w) => {
          if (!keywordToId.has(w)) keywordToId.set(w, m.id);
        });
    });

  // 「市民会館ホール」と「市民会館」なら、長い方を先に当てる
  const words = [...keywordToId.keys()].sort((a, b) => b.length - a.length);
  keywordPattern = words.length > 0
    ? new RegExp(words.map(escapeRegExp).join('|'), 'g')
    : null;
}

/** 思い出ページへのURL */
export function memoryUrl(id: string): string {
  return `./memory.html?id=${encodeURIComponent(id)}`;
}

/** 文章を、リンク付きの安全なHTMLにする
 *  @param selfId 今開いている思い出のid。自分自身へのリンクは付けない */
export function linkify(text: string, selfId?: string): string {
  const out: string[] = [];
  let last = 0;

  // まず [[ ]] で囲まれた部分と、その間の普通の文章に分ける
  for (const m of text.matchAll(/\[\[(.*?)\]\]/g)) {
    out.push(autoLink(text.slice(last, m.index), selfId));
    out.push(bracketLink(m[1], selfId));
    last = m.index + m[0].length;
  }
  out.push(autoLink(text.slice(last), selfId));

  return out.join('');
}

/** [[キーワード]] の部分。思い出に登録があればそちら、無ければWikipedia */
function bracketLink(word: string, selfId?: string): string {
  const id = keywordToId.get(word.trim());
  if (id) {
    return id === selfId ? esc(word) : internalLink(word, id);
  }
  return `<a href="https://ja.wikipedia.org/wiki/${encodeURIComponent(word)}"`
    + ' target="_blank" class="wiki-link" rel="noopener noreferrer">'
    + `${esc(word)}</a>`;
}

/** 普通の文章の中から、登録された言葉を見つけてリンクにする */
function autoLink(text: string, selfId?: string): string {
  if (!keywordPattern || text === '') return esc(text);

  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(keywordPattern)) {
    const id = keywordToId.get(m[0])!;
    out.push(esc(text.slice(last, m.index)));
    out.push(id === selfId ? esc(m[0]) : internalLink(m[0], id));
    last = m.index + m[0].length;
  }
  out.push(esc(text.slice(last)));
  return out.join('');
}

function internalLink(word: string, id: string): string {
  return `<a href="${memoryUrl(id)}" class="wiki-link">${esc(word)}</a>`;
}

/** 入力文字をそのままHTMLに入れると危ないので無害化する */
export function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
