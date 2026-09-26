/* ==========================================================
   people.ts  ―  記録一覧（プロフィール帳のトップ）
   ----------------------------------------------------------
   ログイン中のアカウントが持っている記録を一覧にして、
   選んだ記録の index.html?person=... を開きます。
   ========================================================== */

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { listPeople, createPerson } from './db';
import type { PersonSummary } from './types';

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

function renderList(people: PersonSummary[]): void {
  if (people.length === 0) {
    elList.innerHTML =
      '<p class="empty">まだ記録がありません。下から新しく始めましょう。</p>';
    return;
  }

  elList.innerHTML = people.map((p) => {
    const photoStyle = p.photo
      ? ` style="background-image:url(${p.photo})"`
      : '';
    return `
      <a class="person-card" href="./index.html?person=${encodeURIComponent(p.id)}">
        <span class="person-card__photo"${photoStyle}>${p.photo ? '' : '？'}</span>
        <span class="person-card__body">
          <span class="person-card__name">${escapeHtml(p.name)}</span>
          <span class="person-card__meta">記録 ${p.answerCount} 件 ／ 最終更新 ${escapeHtml(p.updatedAt.slice(0, 10))}</span>
        </span>
      </a>
    `;
  }).join('');
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}


/* ----------------------------------------------------------
   新しく記録を作る
   ---------------------------------------------------------- */

elForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return;

  const name = elNameInput.value.trim();
  const submitBtn = elForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submitBtn.disabled = true;

  void createPerson(user.uid, name)
    .then((id) => {
      location.href = `./index.html?person=${encodeURIComponent(id)}&new=1`;
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
