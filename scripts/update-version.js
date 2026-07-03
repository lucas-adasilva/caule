const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCGq_xmat1l1JQkO1Ay1i9iIw0z6WvuyKQ",
  authDomain: "caule-c064f.firebaseapp.com",
  projectId: "caule-c064f",
  storageBucket: "caule-c064f.appspot.com",
  messagingSenderId: "106735404676",
  appId: "1:106735404676:web:1b0dc97ba8f0b40a408ee5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateVersion() {
  const versionDoc = doc(db, 'appConfig', 'version');
  
  const versionData = {
    latestVersion: '1.0.0',
    downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/caule-c064f.appspot.com/o/releases%2Fcaule-v1.0.0.apk?alt=media',
    releaseNotes: 'Primeira versão oficial do Caule',
    forceUpdate: false,
    updatedAt: new Date()
  };
  
  await setDoc(versionDoc, versionData);
  console.log('Version config updated:', versionData);
}

updateVersion().catch(console.error);
