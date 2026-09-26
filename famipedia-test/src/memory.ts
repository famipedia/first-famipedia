/* ==========================================================
   memory.ts  ―  思い出ページ（memory.html?id=...）
   ----------------------------------------------------------
   近所の公園や行きつけのお店など、Wikipediaには載っていない
   家族の思い出の場所・出来事を、Wikipedia風の1ページにします。
   ここで登録したタイトルと別の呼び名は、ほかの記事の本文に
   出てくると自動でこのページへのリンクになります（links.ts）。
   ========================================================== */

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { listPeople, loadMemory, saveMemory } from './db';
import { esc, linkify, setLinkTargets } from './links';
import { resizeImage } from './image';
import type { MemoryDoc, MemoryPhoto } from './types';

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

/** 写真は1枚あたり100KB前後に縮める。Firestoreの1ドキュメント1MBの
 *  上限に収まるよう、枚数にも上限を設けています */
const MAX_PHOTOS = 6;

/** 今開いている思い出 */
let memory: MemoryDoc | null = null;

/** ギャラリーで大きく出している写真の番号 */
let current = 0;


/* ----------------------------------------------------------
   表示
   ---------------------------------------------------------- */

function render(): void {
  if (!memory) return;
  const m = memory;
  const title = m.title || 'タイトル未入力';

  document.title = `${title} | ファミペディア`;
  $('#memory-title').textContent = title;
  $('#info-title').textContent = title;
  $('#info-kind').innerHTML = m.kind ? linkify(m.kind, m.id) : '—';
  $('#info-related').innerHTML = m.related ? linkify(m.related, m.id) : '—';

  const aliasRow = $('#info-aliases-row');
  aliasRow.hidden = m.aliases.length === 0;
  $('#info-aliases').textContent = m.aliases.join('、');

  renderGallery();
  renderBody();
}

/** 本文。1段落目の頭はWikipediaと同じく「太字のタイトル（よみ）」で始める */
function renderBody(): void {
  const m = memory!;
  const box = $('#memory-body');
  const paras = m.body.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);

  if (paras.length === 0) {
    box.innerHTML = '<p class="empty">まだ本文がありません。「編集する」から書けます。</p>';
    return;
  }

  box.innerHTML = paras.map((p, i) => {
    if (i === 0 && m.title && p.startsWith(m.title)) {
      const reading = m.reading ? `（${esc(m.reading)}）` : '';
      return `<p><b>${esc(m.title)}</b>${reading}${linkify(p.slice(m.title.length), m.id)}</p>`;
    }
    return `<p>${linkify(p, m.id)}</p>`;
  }).join('');
}

function renderGallery(): void {
  const photos = memory!.photos;
  const gallery = $('#gallery');
  const empty = $('#gallery-empty');

  gallery.hidden = photos.length === 0;
  empty.hidden = photos.length > 0;
  if (photos.length === 0) return;

  current = Math.min(current, photos.length - 1);
  const p = photos[current];
  const main = $<HTMLImageElement>('#gallery-main');
  main.src = p.src;
  main.alt = p.caption || memory!.title;
  $('#gallery-caption').textContent = p.caption;

  // 2枚以上あるときだけ、下に小さな写真を並べて切り替えられるようにする
  const thumbs = $('#gallery-thumbs');
  thumbs.hidden = photos.length < 2;
  thumbs.innerHTML = photos.map((ph, i) =>
    `<button type="button" class="gallery__thumb${i === current ? ' is-active' : ''}"`
    + ` data-index="${i}" aria-label="${i + 1}枚目の写真を見る"`
    + ` style="background-image:url(${ph.src})"></button>`,
  ).join('');
}

$('#gallery-thumbs').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.gallery__thumb');
  if (!btn) return;
  current = Number(btn.dataset.index);
  renderGallery();
});

// 写真がまだ無いときの「写真を追加」は、編集画面を開く
$('#gallery-empty').addEventListener('click', () => openEdit());


/* ----------------------------------------------------------
   編集モーダル
   ---------------------------------------------------------- */

const elModal = $<HTMLDivElement>('#memory-edit-modal');
const inTitle   = $<HTMLInputElement>('#me-title');
const inReading = $<HTMLInputElement>('#me-reading');
const inAliases = $<HTMLInputElement>('#me-aliases');
const inKind    = $<HTMLInputElement>('#me-kind');
const inRelated = $<HTMLInputElement>('#me-related');
const inBody    = $<HTMLTextAreaElement>('#me-body');
const elPhotos  = $<HTMLUListElement>('#photo-editor');
const elPhotoIn = $<HTMLInputElement>('#photo-input');

/** 編集中の写真（保存するまでは memory に反映しない） */
let draftPhotos: MemoryPhoto[] = [];

$('#photo-max').textContent = String(MAX_PHOTOS);

function openEdit(): void {
  if (!memory) return;
  inTitle.value = memory.title;
  inReading.value = memory.reading;
  inAliases.value = memory.aliases.join('、');
  inKind.value = memory.kind;
  inRelated.value = memory.related;
  inBody.value = memory.body;
  draftPhotos = memory.photos.map((p) => ({ ...p }));
  renderPhotoEditor();
  elModal.hidden = false;
  inTitle.focus();
}

function closeEdit(): void {
  elModal.hidden = true;
  draftPhotos = [];
}

function renderPhotoEditor(): void {
  elPhotos.replaceChildren();

  draftPhotos.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'photo-editor__item';

    const img = document.createElement('img');
    img.src = p.src;
    img.alt = '';

    const caption = document.createElement('input');
    caption.type = 'text';
    caption.className = 'edit-text';
    caption.placeholder = '写真の説明（省略可）';
    caption.value = p.caption;
    caption.addEventListener('input', () => { draftPhotos[i].caption = caption.value; });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-editor__remove';
    remove.textContent = '削除';
    remove.setAttribute('aria-label', `${i + 1}枚目の写真を削除`);
    remove.addEventListener('click', () => {
      draftPhotos.splice(i, 1);
      renderPhotoEditor();
    });

    li.append(img, caption, remove);
    elPhotos.append(li);
  });

  $<HTMLButtonElement>('#photo-add').hidden = draftPhotos.length >= MAX_PHOTOS;
}

$('#photo-add').addEventListener('click', () => elPhotoIn.click());

elPhotoIn.addEventListener('change', () => {
  const files = [...(elPhotoIn.files ?? [])];
  elPhotoIn.value = '';
  const room = MAX_PHOTOS - draftPhotos.length;
  if (files.length > room) toast(`写真は ${MAX_PHOTOS} 枚までです`);

  void Promise.all(files.slice(0, room).map((f) => resizeImage(f, 720, 0.7)))
    .then((srcs) => {
      srcs.forEach((src) => draftPhotos.push({ src, caption: '' }));
      renderPhotoEditor();
    })
    .catch((err) => {
      console.error(err);
      toast('写真の読み込みに失敗しました');
    });
});

$('#me-cancel').addEventListener('click', closeEdit);
elModal.addEventListener('click', (e) => {
  if (e.target === elModal) closeEdit();
});
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !elModal.hidden) closeEdit();
});

$('#btn-edit').addEventListener('click', openEdit);

$<HTMLButtonElement>('#me-save').addEventListener('click', (e) => {
  if (!memory) return;
  const btn = e.currentTarget as HTMLButtonElement;

  const title = inTitle.value.trim();
  if (title === '') {
    inTitle.focus();
    toast('タイトルを入力してください');
    return;
  }

  const next: MemoryDoc = {
    ...memory,
    title,
    reading: inReading.value.trim(),
    aliases: inAliases.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
    kind: inKind.value.trim(),
    related: inRelated.value.trim(),
    body: inBody.value.trim(),
    photos: draftPhotos,
  };

  btn.disabled = true;
  void saveMemory(next)
    .then(() => {
      memory = next;
      closeEdit();
      render();
      toast('保存しました');
    })
    .catch((err) => {
      console.error(err);
      const code = (err as { code?: string }).code ?? String(err);
      toast(`保存に失敗しました（${code}）`);
    })
    .finally(() => { btn.disabled = false; });
});


/* ----------------------------------------------------------
   短い通知
   ---------------------------------------------------------- */

const elToast = $<HTMLDivElement>('#toast');
let toastTimer: number | undefined;

function toast(message: string): void {
  elToast.textContent = message;
  elToast.hidden = false;
  elToast.classList.add('is-shown');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elToast.classList.remove('is-shown');
    window.setTimeout(() => { elToast.hidden = true; }, 300);
  }, 2200);
}


/* ----------------------------------------------------------
   ログアウト
   ---------------------------------------------------------- */

$('#btn-logout').addEventListener('click', () => {
  void signOut(auth).then(() => {
    location.href = './login.html';
  });
});


/* ----------------------------------------------------------
   起動
   ---------------------------------------------------------- */

const memoryId = new URLSearchParams(location.search).get('id');

if (!memoryId) {
  location.href = './people.html';
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      location.href = './login.html';
      return;
    }
    void boot(memoryId, user.uid);
  });
}

async function boot(id: string, uid: string): Promise<void> {
  // 本文の中のほかの思い出へのリンク用。失敗してもページは開く
  const linkTargets = listPeople(uid).then(setLinkTargets).catch((err) => {
    console.warn('思い出の一覧を読み込めませんでした', err);
  });

  try {
    const [m] = await Promise.all([loadMemory(id), linkTargets]);
    if (!m) throw new Error('思い出が見つかりません');
    memory = m;
  } catch (err) {
    console.error(err);
    alert('この思い出を開けませんでした。一覧画面に戻ります。');
    location.href = './people.html';
    return;
  }

  render();

  // 作ったばかりなら、すぐに編集画面を開く
  if (new URLSearchParams(location.search).get('new') === '1') openEdit();
}
