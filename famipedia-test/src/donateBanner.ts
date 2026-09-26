/* ==========================================================
   donateBanner.ts  ―  ヘッダーの下に出る「孫を支援する」帯
   ----------------------------------------------------------
   Wikipediaの募金バナーのパロディ。記録が2件たまったら出す。
   × で閉じると、そのタブを閉じるまでは出さない。
   ========================================================== */

/** この件数から帯を出す */
const SHOW_FROM = 2;

const CLOSED_KEY = 'famipedia:donate-banner-closed';

const elBanner = document.getElementById('donate-banner') as HTMLElement;
const elCount  = document.getElementById('donate-banner-count') as HTMLElement;

function isClosed(): boolean {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** 記録の件数に合わせて、帯を出す・隠す */
export function updateDonateBanner(answerCount: number): void {
  elCount.textContent = String(answerCount);
  elBanner.hidden = answerCount < SHOW_FROM || isClosed();
}

document.getElementById('donate-banner-close')!.addEventListener('click', () => {
  elBanner.hidden = true;
  try {
    sessionStorage.setItem(CLOSED_KEY, '1');
  } catch {
    // 保存できない環境でも、今の画面からは消えるので問題ない
  }
});
