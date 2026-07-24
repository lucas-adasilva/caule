import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

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

// Proteger Analytics — pode falhar no WebView/Capacitor (localhost não é domínio válido)
try {
  getAnalytics(app);
} catch (e) {
  console.warn('[Firebase] Analytics não disponível neste ambiente:', e);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "southamerica-east1");

// Chave publica VAPID (Web Push) - gerar em: Console do Firebase > Configurações do projeto >
// Cloud Messaging > "Certificados push da Web" > "Gerar par de chaves". Sem essa chave real,
// getWebMessaging()/getToken() não funciona - fica só faltando colar o valor aqui.
export const VAPID_KEY = "";

// Push web só existe em navegador com suporte a Service Worker + Push API (não em todo
// WebView/iframe) - isSupported() confirma isso antes de tentar inicializar.
let messagingPromise: Promise<Messaging | null> | null = null;
export function getWebMessaging(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
}