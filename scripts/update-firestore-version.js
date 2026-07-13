import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Lê a service account da variável de ambiente
const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ Erro: SERVICE_ACCOUNT_JSON não definida.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error('❌ Erro: SERVICE_ACCOUNT_JSON não é um JSON válido.');
  process.exit(1);
}

// Lê a versão do package.json
let version = '0.0.0';
try {
  const pkg = await import('../package.json', { assert: { type: 'json' } });
  version = pkg.default.version || version;
} catch (e) {
  console.warn('[update-firestore-version] Não conseguiu ler package.json, usando 0.0.0');
}

// Monta a URL de download do release no GitHub
const downloadUrl = `https://github.com/lucas-adasilva/caule/releases/download/v${version}/app-release.apk`;

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

async function updateVersion() {
  const versionData = {
    latestVersion: version,
    downloadUrl: downloadUrl,
    releaseNotes: `Versão ${version} do Caule`,
    forceUpdate: false,
    updatedAt: new Date(),
  };

  await db.collection('appConfig').doc('version').set(versionData);
  console.log('✅ Documento appConfig/version atualizado:');
  console.log(JSON.stringify(versionData, null, 2));
  process.exit(0);
}

updateVersion().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
