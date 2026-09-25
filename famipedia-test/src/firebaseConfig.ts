// src/firebaseConfig.ts
// -----------------------------------------------------------
// Firebaseの初期化。ここで作った `auth` を、ログイン処理をする
// ファイル（auth.ts）や、他の画面から import して使います。
// -----------------------------------------------------------

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/** データベース(Firestore)の窓口。people.ts / db.ts から使います */
export const db = getFirestore(app);