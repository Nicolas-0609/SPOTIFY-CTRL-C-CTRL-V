import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA2kEum-WnerjXOQCp1g1IH78o9A3vpdZg",
  authDomain: "spotify-26.firebaseapp.com",
  databaseURL: "https://spotify-26-default-rtdb.firebaseio.com",
  projectId: "spotify-26",
  storageBucket: "spotify-26.firebasestorage.app",
  messagingSenderId: "457294970474",
  appId: "1:457294970474:web:fd7fcfdb10ee80a91cd413",
  measurementId: "G-5R30G5WL96"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const musicasRef = ref(db, 'musicas');