/* ==========================================================
   redlinks.ts  ―  Wikipediaに無い言葉を「赤リンク」にする
   ----------------------------------------------------------
   AIが [[ ]] で囲んだ言葉でも、Wikipediaに記事があるとは限りません。
   表示したあとにWikipediaへ問い合わせて、記事が無い言葉は本家と
   同じく赤で表示します。赤リンクを押すと「思い出として作りますか？」
   と聞き、その場で同じ名前の思い出ページを作れます。

   ・問い合わせ結果は覚えておくので、同じ言葉は2回聞きません
   ・問い合わせに失敗したときは、これまでどおり青いままにします
   ========================================================== */

import { auth } from './firebaseConfig';
import { createMemory } from './db';
import { memoryUrl } from './links';

/** 言葉 → Wikipediaに記事があるか */
const exists = new Map<string, boolean>();

/** Wikipediaのリンク（links.ts が data-wiki-title を付けたもの）を調べて色を付ける */
export async function markMissingWikiLinks(root: ParentNode = document): Promise<void> {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('a[data-wiki-title]')];
  if (links.length === 0) return;

  const unknown = [...new Set(links.map((a) => a.dataset.wikiTitle!))]
    .filter((t) => !exists.has(t));

  try {
    // Wikipediaの問い合わせは1回に50語まで
    for (let i = 0; i < unknown.length; i += 50) {
      await lookup(unknown.slice(i, i + 50));
    }
  } catch (err) {
    console.warn('Wikipediaに問い合わせできませんでした', err);
    return;
  }

  // 問い合わせ中に描き直されていても、今ある要素に付け直す
  root.querySelectorAll<HTMLAnchorElement>('a[data-wiki-title]').forEach((a) => {
    const missing = exists.get(a.dataset.wikiTitle!) === false;
    a.classList.toggle('is-new', missing);
    if (missing) {
      a.title = `「${a.dataset.wikiTitle}」はWikipediaにありません。押すと思い出ページを作れます`;
    }
  });
}

/** Wikipediaに記事があるかをまとめて問い合わせる */
async function lookup(titles: string[]): Promise<void> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    origin: '*',
    titles: titles.join('|'),
  });
  const res = await fetch(`https://ja.wikipedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json() as {
    query?: {
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
      pages?: { title: string; missing?: boolean; invalid?: boolean }[];
    };
  };
  const q = data.query ?? {};

  // 「東京 都」→「東京都」のような正規化や、転送ページをたどって元の言葉と結びつける
  const normalized = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redirects = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
  const pageMissing = new Map(
    (q.pages ?? []).map((p) => [p.title, p.missing === true || p.invalid === true]),
  );

  titles.forEach((t) => {
    let title = normalized.get(t) ?? t;
    title = redirects.get(title) ?? title;
    const missing = pageMissing.get(title);
    // 答えが見つからない言葉は、念のため「ある」扱い（青のまま）にする
    exists.set(t, missing !== true);
  });
}


/* ----------------------------------------------------------
   赤リンクを押したとき：思い出ページを作るか聞く
   ---------------------------------------------------------- */

let dialog: HTMLDivElement | null = null;

document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.wiki-link.is-new');
  if (!a) return;
  e.preventDefault();
  openCreateDialog(a.dataset.wikiTitle ?? a.textContent ?? '');
});

function openCreateDialog(title: string): void {
  dialog ??= buildDialog();
  dialog.querySelector('#redlink-text')!.textContent =
    `「${title}」はWikipediaにまだ記事がありません。`
    + '家族の思い出として、ファミペディアにページを作りますか？';
  dialog.dataset.title = title;

  const ok = dialog.querySelector<HTMLButtonElement>('#redlink-ok')!;
  ok.disabled = false;
  ok.textContent = '思い出ページを作る';
  dialog.hidden = false;
  ok.focus();
}

function closeDialog(): void {
  if (dialog) dialog.hidden = true;
}

/** ダイアログは使うときに1回だけ作る（どのページに置いても動くように） */
function buildDialog(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'modal';
  el.hidden = true;
  el.innerHTML = `
    <div class="modal-box wiki-dialog" role="dialog" aria-modal="true"
      aria-labelledby="redlink-title" aria-describedby="redlink-text">
      <p class="wiki-dialog__title" id="redlink-title">ページがありません</p>
      <p class="wiki-dialog__text" id="redlink-text"></p>
      <div class="wiki-dialog__actions">
        <button type="button" class="wiki-btn" id="redlink-cancel">キャンセル</button>
        <button type="button" class="wiki-btn wiki-btn--progressive" id="redlink-ok">思い出ページを作る</button>
      </div>
    </div>`;
  document.body.append(el);

  el.addEventListener('click', (e) => {
    if (e.target === el) closeDialog();
  });
  el.querySelector('#redlink-cancel')!.addEventListener('click', closeDialog);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) closeDialog();
  });

  const ok = el.querySelector<HTMLButtonElement>('#redlink-ok')!;
  ok.addEventListener('click', () => {
    const user = auth.currentUser;
    const title = el.dataset.title ?? '';
    if (!user) return;

    ok.disabled = true;
    ok.textContent = '作っています…';
    createMemory(user.uid, title)
      .then((id) => {
        location.href = `${memoryUrl(id)}&new=1`;
      })
      .catch((err) => {
        console.error(err);
        const code = (err as { code?: string }).code ?? String(err);
        alert(`作成に失敗しました。（${code}）`);
        ok.disabled = false;
        ok.textContent = '思い出ページを作る';
      });
  });

  return el;
}
