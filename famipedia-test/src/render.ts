/* ==========================================================
   render.ts  ―  記事ページを組み立てる
   ----------------------------------------------------------
   保存されているデータを読んで、画面に書き出すだけの担当。
   ここは「表示」だけを扱い、保存や通信はしません。
   ========================================================== */

import type { SectionId, Answer } from './types';
import { store, findQuestion } from './store';
import { linkify } from './links';

export const SECTIONS: SectionId[] = ['summary', 'timeline', 'episode'];

export const SECTION_LABEL: Record<SectionId, string> = {
  summary:  '概要',
  timeline: '来歴・生涯',
  episode:  '人物・エピソード',
};

/** 要素を取ってくる短縮形 */
const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

/** 入力文字を無害化し、リンクを付ける。
 *  思い出に登録した言葉は Famipedia 内へ、それ以外の [[キーワード]] は
 *  Wikipedia へのリンクになる（詳しくは links.ts） */
const esc = (s: string): string => linkify(s);

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
    
    // 両方とも年号があればそれで比較
    if (nx !== 9999 && ny !== 9999) return nx - ny;
    
    // なければ期間の並び順で比較
    const getOrder = (a: typeof x) => {
      const p = a.a.result?.period || getPeriod(Number(a.year?.match(/\d+/)?.[0] ?? null));
      if (p.includes('幼少') || p.includes('少年')) return 10;
      if (p.includes('青年')) return 20;
      if (p.includes('壮年')) return 40;
      if (p.includes('高年') || p.includes('晩年')) return 60;
      return nx !== 9999 ? nx : 999;
    };
    
    return getOrder(x) - getOrder(y);
  });

  const birthYearMatch = store.info.birth?.match(/\d+/);
  const birthYear = birthYearMatch ? Number(birthYearMatch[0]) : null;

  function getPeriod(y: number | null): string {
    if (y === null) return '時期不明';
    if (birthYear === null) {
      const decade = Math.floor(y / 10) * 10;
      return `${decade}年代`;
    }
    const age = y - birthYear;
    if (age <= 15) return '幼少・少年期';
    if (age <= 29) return '青年期';
    if (age <= 49) return '壮年期';
    return '高年期';
  }

  let currentPeriod = '';
  const htmlParts: string[] = [];

  rows.forEach(({ a, year, text }) => {
    const yNum = year ? Number(year.match(/\d+/)?.[0]) : null;
    const period = a.result?.period || getPeriod(yNum);

    if (period !== currentPeriod) {
      if (currentPeriod !== '') {
        htmlParts.push('</ul>');
      }
      htmlParts.push(`<h3>${period}</h3>`);
      htmlParts.push('<ul class="timeline">');
      currentPeriod = period;
    }

    const hl = a.questionId === highlightId ? ' just-added' : '';
    htmlParts.push(
      `<li class="tl-item${hl}">`
      + `<span class="tl-year">${esc(year ?? '—')}</span>`
      + `<span class="tl-text">${esc(text)}${editButton(a)}</span>`
      + '</li>'
    );
  });

  if (currentPeriod !== '') {
    htmlParts.push('</ul>');
  }

  return htmlParts.join('');
}
