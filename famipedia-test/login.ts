// login.ts
// -----------------------------------------------------------
// login.html の動作をまとめたファイルです。
//   1. 「ログイン」「新規登録」タブの切り替え
//   2. パスワードの表示/非表示ボタン
//   3. Firebase Authentication を使ったログイン・新規登録
//
// 使う前に:
//   - `npm install firebase` を実行してください
//   - src/firebaseConfig.ts の中の値を、自分のFirebaseプロジェクトの
//     ものに書き換えてください
// -----------------------------------------------------------

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type AuthError,
} from "firebase/auth";
import { auth } from "./src/firebaseConfig";

// ---------- 要素の取得 ----------

const tabsEl = document.querySelector<HTMLDivElement>(".auth-tabs");
const tabLogin = document.getElementById("tab-login") as HTMLButtonElement;
const tabRegister = document.getElementById(
  "tab-register"
) as HTMLButtonElement;
const panelLogin = document.getElementById("panel-login") as HTMLFormElement;
const panelRegister = document.getElementById(
  "panel-register"
) as HTMLFormElement;
const errorEl = document.getElementById("auth-error") as HTMLParagraphElement;

// ---------- タブ切り替え（ログイン ⇄ 新規登録） ----------

type AuthMode = "login" | "register";

function setMode(mode: AuthMode): void {
  const isRegister = mode === "register";

  // auth.css 側で .auth-tabs.is-register のときにインジケーターが
  // 右に移動するようになっているので、そのクラスを付け外しするだけでOK
  tabsEl?.classList.toggle("is-register", isRegister);

  tabLogin.classList.toggle("is-active", !isRegister);
  tabLogin.setAttribute("aria-selected", String(!isRegister));

  tabRegister.classList.toggle("is-active", isRegister);
  tabRegister.setAttribute("aria-selected", String(isRegister));

  panelLogin.hidden = isRegister;
  panelRegister.hidden = !isRegister;

  clearError();
}

tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));

// ---------- パスワードの表示/非表示 ----------

document
  .querySelectorAll<HTMLButtonElement>(".auth-password-toggle")
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      if (!targetId) return;

      const input = document.getElementById(
        targetId
      ) as HTMLInputElement | null;
      if (!input) return;

      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";

      btn.setAttribute("aria-pressed", String(willShow));
      btn.setAttribute(
        "aria-label",
        willShow ? "パスワードを非表示にする" : "パスワードを表示する"
      );

      // login.html側で用意されている2種類のアイコンを、hidden属性で
      // 出し分けています
      btn.querySelector(".icon-eye")?.toggleAttribute("hidden", willShow);
      btn
        .querySelector(".icon-eye-off")
        ?.toggleAttribute("hidden", !willShow);
    });
  });

// ---------- エラー表示 ----------

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(): void {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

// Firebaseのエラーコードを、日本語のメッセージに変換する
function messageFromAuthError(error: AuthError): string {
  switch (error.code) {
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "auth/email-already-in-use":
      return "そのメールアドレスはすでに登録されています。";
    case "auth/weak-password":
      return "パスワードは6文字以上で設定してください。";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらくしてからもう一度お試しください。";
    case "auth/network-request-failed":
      return "通信に失敗しました。ネットワークの状態を確認してください。";
    default:
      return "エラーが発生しました。もう一度お試しください。";
  }
}

// ---------- 送信中はボタンを無効化して連打を防ぐ ----------

async function withSubmitting<T>(
  button: HTMLButtonElement,
  loadingText: string,
  task: () => Promise<T>
): Promise<T> {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// ---------- ログインフォーム ----------

panelLogin.addEventListener("submit", (event) => {
  event.preventDefault();
  clearError();

  const email = (
    document.getElementById("login-email") as HTMLInputElement
  ).value.trim();
  const password = (
    document.getElementById("login-password") as HTMLInputElement
  ).value;
  const submitBtn = panelLogin.querySelector<HTMLButtonElement>(
    ".auth-submit"
  )!;

  if (!email || !password) {
    showError("メールアドレスとパスワードを入力してください。");
    return;
  }

  withSubmitting(submitBtn, "ログイン中…", () =>
    signInWithEmailAndPassword(auth, email, password)
  )
    .then(() => {
      // ログイン成功。記録一覧に移動する
      window.location.href = "./people.html";
    })
    .catch((error: AuthError) => {
      showError(messageFromAuthError(error));
    });
});

// ---------- 新規登録フォーム ----------

panelRegister.addEventListener("submit", (event) => {
  event.preventDefault();
  clearError();

  const email = (
    document.getElementById("register-email") as HTMLInputElement
  ).value.trim();
  const password = (
    document.getElementById("register-password") as HTMLInputElement
  ).value;
  const submitBtn = panelRegister.querySelector<HTMLButtonElement>(
    ".auth-submit"
  )!;

  if (!email || !password) {
    showError("メールアドレスとパスワードを入力してください。");
    return;
  }
  if (password.length < 6) {
    showError("パスワードは6文字以上で設定してください。");
    return;
  }

  withSubmitting(submitBtn, "登録中…", () =>
    createUserWithEmailAndPassword(auth, email, password)
  )
    .then(() => {
      // 登録成功。記録一覧に移動する
      window.location.href = "./people.html";
    })
    .catch((error: AuthError) => {
      showError(messageFromAuthError(error));
    });
});