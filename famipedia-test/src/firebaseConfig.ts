// src/firebaseConfig.ts
// -----------------------------------------------------------
// Firebaseの初期化。ここで作った `auth` を、ログイン処理をする
// ファイル（auth.ts）や、他の画面から import して使います。
// -----------------------------------------------------------

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA-h0_Ao8AjgS0z4uahBpdx2l8Mt3AvW4U",
  authDomain: "famipedia-58hack.firebaseapp.com",
  projectId: "famipedia-58hack",
  storageBucket: "famipedia-58hack.firebasestorage.app",
  messagingSenderId: "60640939430",
  appId: "1:60640939430:web:5194ec21b06cf396f3d367",
  measurementId: "G-GBSH1JFHX5",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/** データベース(Firestore)の窓口。people.ts / db.ts から使います */
export const db = getFirestore(app);
