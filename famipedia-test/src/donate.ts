/* ==========================================================
   donate.ts  ―  支援ページ（Wikipediaの寄付ページのパロディ）
   ----------------------------------------------------------
   流れ：金額と決済アプリを選ぶ → 確認 → 完了（またはキャンセル）
   通信も保存もしません。1ページの中で表示を切り替えるだけです。
   ========================================================== */

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const VIEWS = ['view-select', 'view-confirm', 'view-done', 'view-cancel'] as const;
type View = (typeof VIEWS)[number];

const state = {
  freq: '毎年',
  amount: 2500,
  fee: false,
  app: '',
};

function show(view: View): void {
  VIEWS.forEach((v) => { $(v).hidden = v !== view; });
  window.scrollTo(0, 0);
}

const yen = (n: number): string => '¥' + n.toLocaleString('ja-JP');
const total = (): number => state.amount + (state.fee ? 100 : 0);
const refNo = (): string =>
  'FP-' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');


/* ----------------------------------------------------------
   ① 頻度・金額を選ぶ
   ---------------------------------------------------------- */

/** グループの中で押したボタンだけを選択状態にする */
function bindChoice(groupId: string, onPick: (btn: HTMLButtonElement) => void): void {
  const buttons = $(groupId).querySelectorAll<HTMLButtonElement>('button');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      onPick(btn);
    });
  });
}

bindChoice('freq', (btn) => { state.freq = btn.dataset.freq ?? state.freq; });
bindChoice('amounts', (btn) => { state.amount = Number(btn.dataset.amount); });

$<HTMLInputElement>('fee').addEventListener('change', (e) => {
  state.fee = (e.target as HTMLInputElement).checked;
});


/* ----------------------------------------------------------
   ② 決済アプリを選ぶ → 確認画面
   ---------------------------------------------------------- */

$('pay-list').querySelectorAll<HTMLButtonElement>('.pay-btn').forEach((btn) => {
  btn.addEventListener('click', () => openConfirm(btn));
});

function openConfirm(source: HTMLButtonElement): void {
  state.app = source.dataset.app ?? '';

  // 選んだアプリの見た目のまま、「〇〇で支援する」ボタンにする
  const btn = source.cloneNode(true) as HTMLButtonElement;
  btn.querySelector('.pay-label')!.textContent = `${state.app}で支援する`;
  btn.addEventListener('click', openDone);
  $('c-btn-slot').replaceChildren(btn);

  $('c-amount').textContent = yen(total());
  $('c-freq').textContent =
    state.freq === '今回のみ' ? '今回のみの支援' : `${state.freq}の支援`;

  show('view-confirm');
}

$('c-back').addEventListener('click', () => show('view-select'));

$('c-cancel').addEventListener('click', () => {
  $('x-ref').textContent = refNo();
  show('view-cancel');
});


/* ----------------------------------------------------------
   ③ 完了 / ④ キャンセルから戻る
   ---------------------------------------------------------- */

function openDone(): void {
  $('d-amount').textContent = yen(total());
  $('d-app').textContent = state.app;
  $('d-ref').textContent = refNo();
  show('view-done');
}

$('x-back').addEventListener('click', () => show('view-confirm'));
