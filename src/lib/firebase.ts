import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBtv6kvVpVfzN05dHMXiSu15PEE7VwAi0k",
  authDomain: "caule-c064f.firebaseapp.com",
  projectId: "caule-c064f",
  storageBucket: "caule-c064f.firebasestorage.app",
  messagingSenderId: "480280627243",
  appId: "1:480280627243:web:c42590a6f3f15465fc826e",
  measurementId: "G-CDNLS8PXM5"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "southamerica-east1");