import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Tenta usar a conta de serviço do Firebase
let serviceAccount;
try {
  const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (e) {
  console.error('❌ Erro: Crie o arquivo serviceAccountKey.json na raiz do projeto.');
  console.error('   Como obter: Firebase Console → Project Settings → Service Accounts → Generate new private key');
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);

async function updateVersion() {
  const versionData = {
    latestVersion: '1.0.0',
    downloadUrl: 'https://github.com/lucas-adasilva/caule/releases/download/v1.0.0/app-release.apk',
    releaseNotes: 'Primeira versão oficial do Caule',
    forceUpdate: false,
    updatedAt: new Date()
  };

  await db.collection('appConfig').doc('version').set(versionData);
  console.log('✅ Documento appConfig/version criado/atualizado:');
  console.log(JSON.stringify(versionData, null, 2));
  process.exit(0);
}

updateVersion().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
