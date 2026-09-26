/* ==========================================================
   render.ts  ―  記事ページを組み立てる
   ----------------------------------------------------------
   保存されているデータを読んで、画面に書き出すだけの担当。
   ここは「表示」だけを扱い、保存や通信はしません。
   ========================================================== */

import type { SectionId, Answer } from './types';
import { store, findQuestion } from './store';
import { updateDonateBanner } from './donateBanner';
import { linkify } from './links';

export const SECTIONS: SectionId[] = ['summary', 'timeline'];

export const SECTION_LABEL: Record<SectionId, string> = {
  summary:  '概要',
  timeline: '来歴・生涯',
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

export function getBirthYear(): number | null {
  const match = store.info.birth?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function getPeriod(y: number | null, birthYear: number | null): string {
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

export function mapToOfficialPeriod(p: string, y?: string): string {
  const s = p || '';
  const ys = y || '';

  // AIの判定ミス（例：子どもの頃なのに高年期と判定されているなど）を補正
  if (ys === '子どもの頃' || ys.includes('幼少') || ys === '子供の頃') return '幼少・少年期';
  if (ys === '学生時代' || ys.includes('大学時代') || ys.includes('高校時代')) return '青年期';

  if (s.includes('幼少') || s.includes('少年') || s.includes('子供') || s.includes('子ども')) return '幼少・少年期';
  if (s.includes('青年') || s.includes('大学') || s.includes('高校') || s.includes('学生') || s.includes('10代') || s.includes('20代')) return '青年期';
  if (s.includes('壮年') || s.includes('社会人') || s.includes('中年') || s.includes('30') || s.includes('40')) return '壮年期';
  if (s.includes('高年') || s.includes('晩年') || s.includes('老後') || s.includes('50') || s.includes('60') || s.includes('定年')) return '高年期';
  return '時期不明'; // どれにも当てはまらない場合は時期不明とする
}

export function sectionOf(a: Answer): SectionId {
  // 以前の「人物・エピソード」「伝えたいこと」など、summary以外のものは一旦すべてタイムライン扱いにする
  const sec = a.result?.section ?? findQuestion(a.questionId)?.section;
  const baseSec = sec === 'summary' ? 'summary' : 'timeline';

  if (baseSec === 'timeline') {
    const y = a.result?.year || '';
    let p = a.result?.period || '';
    
    // 期間が明示されていない場合、年号などから推測
    if (!p) {
      const yNum = y ? Number(y.match(/\d+/)?.[0]) : null;
      if (yNum !== null) p = getPeriod(yNum, getBirthYear());
      else if (y && y !== '時期不明' && y !== '不明') p = y;
      else p = '時期不明';
    }

    // 4つの時期のどれにも分類できない場合は概要に入れる
    if (mapToOfficialPeriod(p, y) === '時期不明') {
      return 'summary';
    }
  }

  return baseSec;
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

  // 記録が2件たまったら、ヘッダーの下に寄付の帯を出す
  updateDonateBanner(count);
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

  const birthYear = getBirthYear();

  rows.sort((x, y) => {
    const nx = Number(x.year?.match(/\d+/)?.[0] ?? 9999);
    const ny = Number(y.year?.match(/\d+/)?.[0] ?? 9999);
    
    // 両方とも年号があればそれで比較
    if (nx !== 9999 && ny !== 9999) return nx - ny;
    
    // なければ期間の並び順で比較
    const getOrder = (a: typeof x) => {
      let p = a.a.result?.period;
      if (!p) {
        const yNum = a.year ? Number(a.year.match(/\d+/)?.[0]) : null;
        if (yNum !== null) p = getPeriod(yNum, birthYear);
        else if (a.year && a.year !== '時期不明' && a.year !== '不明') p = a.year;
        else p = '時期不明';
      }
      
      const official = mapToOfficialPeriod(p, a.year ?? '');
      if (official === '幼少・少年期') return 10;
      if (official === '青年期') return 20;
      if (official === '壮年期') return 40;
      if (official === '高年期') return 60;
      return 20;
    };
    
    return getOrder(x) - getOrder(y);
  });


  let currentPeriod = '';
  const htmlParts: string[] = [];

  rows.forEach(({ a, year, text }) => {
    const yNum = year ? Number(year.match(/\d+/)?.[0]) : null;
    let period = a.result?.period;
    if (!period) {
      if (yNum !== null) period = getPeriod(yNum, birthYear);
      else if (year && year !== '時期不明' && year !== '不明') period = year;
      else period = '時期不明';
    }
    // 見出しを強制的に4つのいずれかに限定
    period = mapToOfficialPeriod(period, year ?? '');

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
