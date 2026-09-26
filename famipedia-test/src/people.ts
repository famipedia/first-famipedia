/* ==========================================================
   people.ts  ―  記録一覧（プロフィール帳のトップ）
   ----------------------------------------------------------
   ログイン中のアカウントが持っている記録を一覧にして、
   選んだ記録の index.html?person=... を開きます。
   ========================================================== */

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { listPeople, createPerson, createMemory, deletePerson } from './db';
import { memoryUrl } from './links';
import type { PersonSummary, RecordType } from './types';

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel)!;

const elList = $<HTMLDivElement>('#people-list');
const elForm = $<HTMLFormElement>('#new-person-form');
const elNameInput = $<HTMLInputElement>('#new-person-name');


/* ----------------------------------------------------------
   ログイン確認 → 一覧の読み込み
   ---------------------------------------------------------- */

onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = './login.html';
    return;
  }
  void loadList(user.uid);
});

async function loadList(uid: string): Promise<void> {
  try {
    const people = await listPeople(uid);
    renderList(people);
  } catch (err) {
    console.error(err);
    // 原因を調べやすいよう、Firebaseのエラーコード（permission-denied など）も出す
    const code = (err as { code?: string }).code ?? String(err);
    elList.innerHTML =
      '<p class="empty">読み込みに失敗しました。ページを再読み込みしてください。'
      + `<br><small>（${escapeHtml(code)}）</small></p>`;
  }
}

/** 今表示している一覧。メニューや削除で名前などを引くのに使う */
let currentPeople: PersonSummary[] = [];

function renderList(people: PersonSummary[]): void {
  currentPeople = people;

  if (people.length === 0) {
    elList.innerHTML =
      '<p class="empty">まだ記録がありません。さっそく上から作ってみましょう！</p>';
    return;
  }

  // 人物と思い出を分けて並べる。片方しか無ければ小見出しは出さない
  const persons  = people.filter((p) => p.type === 'person');
  const memories = people.filter((p) => p.type === 'memory');
  const grouped = persons.length > 0 && memories.length > 0;

  elList.innerHTML = [
    grouped && '<h2 class="people-group-title">人物</h2>',
    ...persons.map(card),
    grouped && '<h2 class="people-group-title">思い出</h2>',
    ...memories.map(card),
  ].filter(Boolean).join('');
}

/** 記録1件ぶんのカード */
function card(p: PersonSummary): string {
  const photoStyle = p.photo
    ? ` style="background-image:url(${p.photo})"`
    : '';
  const href = p.type === 'memory'
    ? memoryUrl(p.id)
    : `./index.html?person=${encodeURIComponent(p.id)}`;
  const meta = p.type === 'memory'
    ? `思い出 ／ 最終更新 ${escapeHtml(p.updatedAt.slice(0, 10))}`
    : `記録 ${p.answerCount} 件 ／ 最終更新 ${escapeHtml(p.updatedAt.slice(0, 10))}`;

  return `
    <div class="person-item">
      <a class="person-card" href="${href}">
        <span class="person-card__photo"${photoStyle}>${p.photo ? '' : '？'}</span>
        <span class="person-card__body">
          <span class="person-card__name">${escapeHtml(p.name)}</span>
          <span class="person-card__meta">${meta}</span>
        </span>
      </a>
      <button type="button" class="person-menu-btn" data-person-id="${escapeHtml(p.id)}"
        aria-haspopup="menu" aria-expanded="false"
        aria-label="${escapeHtml(p.name)}の操作">⋯</button>
    </div>
  `;
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}


/* ----------------------------------------------------------
   ⋯ メニュー（共有 / 削除）
   メニューは1つだけ用意し、押された ⋯ の下に動かして使い回す
   ---------------------------------------------------------- */

const elMenu = $<HTMLDivElement>('#person-menu');

/** メニューを開いている記録のid */
let menuPersonId: string | null = null;
let menuButton: HTMLButtonElement | null = null;

function openMenu(btn: HTMLButtonElement): void {
  closeMenu();
  menuPersonId = btn.dataset.personId ?? null;
  menuButton = btn;
  btn.setAttribute('aria-expanded', 'true');

  // ボタンの右下にそろえて出す（画面の右端からはみ出さないように）
  const r = btn.getBoundingClientRect();
  elMenu.hidden = false;
  elMenu.style.top = `${r.bottom + window.scrollY + 4}px`;
  elMenu.style.left =
    `${Math.max(8, r.right + window.scrollX - elMenu.offsetWidth)}px`;
  elMenu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
}

function closeMenu(): void {
  elMenu.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton = null;
}

// 一覧は描き直すたびに中身が入れ替わるので、外側でまとめてクリックを拾う
elList.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.person-menu-btn');
  if (!btn) return;
  if (menuButton === btn) {
    closeMenu();
  } else {
    openMenu(btn);
  }
});

// メニューの外を押したら閉じる
document.addEventListener('click', (e) => {
  if (elMenu.hidden) return;
  const t = e.target as HTMLElement;
  if (!elMenu.contains(t) && !t.closest('.person-menu-btn')) closeMenu();
});

// 共有：記事ページ（思い出なら思い出ページ）を開き、そこでスクショを撮る
$('#menu-share').addEventListener('click', () => {
  if (!menuPersonId) return;
  const target = currentPeople.find((p) => p.id === menuPersonId);
  location.href = target?.type === 'memory'
    ? `${memoryUrl(menuPersonId)}&shot=1`
    : `./index.html?person=${encodeURIComponent(menuPersonId)}&shot=1`;
});

$('#menu-delete').addEventListener('click', () => {
  const id = menuPersonId;
  closeMenu();
  if (id) openDeleteModal(id);
});


/* ----------------------------------------------------------
   削除の確認ダイアログ
   ---------------------------------------------------------- */

const elDeleteModal = $<HTMLDivElement>('#delete-modal');
const elDeleteText  = $<HTMLParagraphElement>('#delete-text');
const elDeleteOk    = $<HTMLButtonElement>('#delete-ok');

/** 削除しようとしている記録のid */
let deletingId: string | null = null;

function openDeleteModal(id: string): void {
  const p = currentPeople.find((x) => x.id === id);
  if (!p) return;

  deletingId = id;
  elDeleteText.textContent =
    `『${p.name}』の記録を削除します。`
    + '削除した記録は元に戻せません。本当に削除しますか？';
  elDeleteOk.disabled = false;
  elDeleteOk.textContent = '削除する';
  elDeleteModal.hidden = false;
  $<HTMLButtonElement>('#delete-cancel').focus();
}

function closeDeleteModal(): void {
  elDeleteModal.hidden = true;
  deletingId = null;
}

$('#delete-cancel').addEventListener('click', closeDeleteModal);

elDeleteModal.addEventListener('click', (e) => {
  if (e.target === elDeleteModal) closeDeleteModal();
});

elDeleteOk.addEventListener('click', () => {
  const id = deletingId;
  if (!id) return;

  elDeleteOk.disabled = true;
  elDeleteOk.textContent = '削除しています…';

  void deletePerson(id)
    .then(() => {
      closeDeleteModal();
      renderList(currentPeople.filter((p) => p.id !== id));
    })
    .catch((err) => {
      console.error(err);
      const code = (err as { code?: string }).code ?? String(err);
      alert(`削除に失敗しました。（${code}）`);
      elDeleteOk.disabled = false;
      elDeleteOk.textContent = '削除する';
    });
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (!elDeleteModal.hidden) closeDeleteModal();
  if (!elMenu.hidden) {
    const btn = menuButton;
    closeMenu();
    btn?.focus();
  }
});


/* ----------------------------------------------------------
   新しく記録を作る
   ---------------------------------------------------------- */

/** 新規登録で選ばれている種類（人物 / 思い出） */
function selectedType(): RecordType {
  const checked = elForm.querySelector<HTMLInputElement>('input[name="record-type"]:checked');
  return checked?.value === 'memory' ? 'memory' : 'person';
}

// 種類に合わせて、入力欄の例とボタンの文言を変える
elForm.querySelectorAll<HTMLInputElement>('input[name="record-type"]').forEach((r) => {
  r.addEventListener('change', () => {
    const memory = selectedType() === 'memory';
    elNameInput.placeholder = memory
      ? '例：市民会館（あとで変えられます）'
      : '例：田中 一郎（あとで変えられます）';
    $('#new-person-label').textContent = memory
      ? '新しく記録する思い出のタイトル'
      : '新しく記録する人の名前';
    $('#new-person-submit').textContent = memory
      ? '＋ 新しく思い出を記録する'
      : '＋ 新しく記録する';
  });
});

elForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return;

  const name = elNameInput.value.trim();
  const submitBtn = elForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submitBtn.disabled = true;

  const created = selectedType() === 'memory'
    ? createMemory(user.uid, name).then((id) => `${memoryUrl(id)}&new=1`)
    : createPerson(user.uid, name).then(
        (id) => `./index.html?person=${encodeURIComponent(id)}&new=1`);

  void created
    .then((url) => {
      location.href = url;
    })
    .catch((err) => {
      console.error(err);
      alert('作成に失敗しました。もう一度お試しください。');
      submitBtn.disabled = false;
    });
});


/* ----------------------------------------------------------
   ログアウト
   ---------------------------------------------------------- */

$('#btn-logout').addEventListener('click', () => {
  void signOut(auth).then(() => {
    location.href = './login.html';
  });
});
