/* ==========================================================
   render.ts  ―  記事ページを組み立てる
   ----------------------------------------------------------
   保存されているデータを読んで、画面に書き出すだけの担当。
   ここは「表示」だけを扱い、保存や通信はしません。
   ========================================================== */

import type { SectionId, Answer } from './types';
import { store, findQuestion } from './store';

const SECTIONS: SectionId[] = ['summary', 'timeline', 'episode', 'message'];

export const SECTION_LABEL: Record<SectionId, string> = {
  summary:  '概要',
  timeline: '年表',
  episode:  '思い出・エピソード',
  message:  '伝えたいこと',
};

/** 要素を取ってくる短縮形 */
const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

/** 入力文字をそのままHTMLに入れると危ないので無害化する */
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** 文末に「。」が無ければ付ける */
function period(t: string): string {
  const s = t.trim();
  return /[。．.!?！？」）)]$/.test(s) ? s : s + '。';
}


/* ----------------------------------------------------------
   概要の書き出し（Wikipediaの1行目に寄せる）
   ---------------------------------------------------------- */

function leadParagraph(): string {
  const i = store.info;
  if (!i.name) return '';

  let s = i.name;
  if (i.birth) s += `（${i.birth} - ）`;
  s += 'は、';

  if (i.place)  s += period(`${i.place}出身`);

  if (s.endsWith('は、')) s = s.slice(0, -2) + 'についての記録。';
  return s;
}


/* ----------------------------------------------------------
   どのセクションに入れるか
   AIの判断を優先し、無ければ質問の設定に従う
   ---------------------------------------------------------- */

export function sectionOf(a: Answer): SectionId {
  if (a.result) return a.result.section;
  return findQuestion(a.questionId)?.section ?? 'episode';
}

/** 記事に載せる文章 */
export function textOf(a: Answer): string {
  return a.result ? a.result.text : a.raw;
}

/** 文章ごとに付ける［編集］ボタン。
 *  押されたときにどの回答か分かるよう、store.answers の番号を持たせる */
function editButton(a: Answer): string {
  const idx = store.answers.indexOf(a);
  return `<button type="button" class="para-edit" data-answer-index="${idx}"`
    + ' aria-label="この文章を編集">編集</button>';
}


/* ----------------------------------------------------------
   本体
   ---------------------------------------------------------- */

export function render(highlightId?: string): void {
  const i = store.info;

  // --- タイトルと基礎情報 ---
  $('#page-title').textContent = i.name || '名前を入力してください';
  $('#info-name').textContent  = i.name || '—';
  $('#info-birth').textContent  = i.birth  || '—';
  $('#info-place').textContent  = i.place  || '—';
  $('#info-job').textContent    = i.job    || '—';
  $('#info-height').textContent = i.height || '—';
  $('#info-blood').textContent  = i.blood  || '—';

  // --- 写真 ---
  const slot = $('#photo-slot');
  if (store.photo) {
    slot.style.backgroundImage = `url(${store.photo})`;
    slot.classList.add('has-image');
  } else {
    // 消したときに前の写真が残らないよう、必ず戻す
    slot.style.backgroundImage = '';
    slot.classList.remove('has-image');
  }

  // --- 各セクション ---
  SECTIONS.forEach((sec) => {
    const box = $(`#body-${sec}`);

    const items = store.answers.filter((a) => {
      const q = findQuestion(a.questionId);
      return sectionOf(a) === sec && q?.infoOnly !== true;
    });

    const lead = sec === 'summary' ? leadParagraph() : '';

    if (items.length === 0 && lead === '') {
      box.innerHTML = '<p class="empty">まだ記録がありません。</p>';
      return;
    }

    if (sec === 'timeline') {
      box.innerHTML = renderTimeline(items, highlightId);
      return;
    }

    const parts: string[] = [];
    if (lead) parts.push(`<p>${esc(lead)}</p>`);

    items.forEach((a) => {
      const text = textOf(a);
      if (!text) return; // テキストが空（まとめ済みで隠されている等）のものは描画しない

      const hl = a.questionId === highlightId ? ' just-added' : '';
      parts.push(
        `<p class="para${hl}">${esc(text)}<span class="tag">[本人談]</span>${editButton(a)}</p>`,
      );
    });

    box.innerHTML = parts.join('');
  });

  // --- 下部の件数表示 ---
  const count = store.answers.length;
  $('#answer-count').textContent = String(count);

  const last = store.answers[count - 1];
  $('#last-updated').textContent = last ? last.savedAt.slice(0, 10) : '—';

  // タブに付く件数のしるし
  const badge = $('#tab-badge');
  badge.textContent = String(count);
  badge.hidden = count === 0;
}


/** 年表は古い順に並べてリストにする */
function renderTimeline(items: Answer[], highlightId?: string): string {
  const rows = items.map((a) => {
    let text = textOf(a);
    if (!text) return null;

    const year = a.result?.year ?? null;

    // 年が文頭にあると重複するので、助詞ごと外す
    if (year && text.startsWith(year)) {
      text = text.slice(year.length).replace(/^[、,\sにはのごろ頃くらい]+/, '');
    }

    return { a, year, text };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  rows.sort((x, y) => {
    const nx = Number(x.year?.match(/\d+/)?.[0] ?? 9999);
    const ny = Number(y.year?.match(/\d+/)?.[0] ?? 9999);
    return nx - ny;
  });

  const lis = rows.map(({ a, year, text }) => {
    const hl = a.questionId === highlightId ? ' just-added' : '';
    return `<li class="tl-item${hl}">`
      + `<span class="tl-year">${esc(year ?? '—')}</span>`
      + `<span class="tl-text">${esc(text)}${editButton(a)}</span>`
      + '</li>';
  });

  return `<ul class="timeline">${lis.join('')}</ul>`;
}
