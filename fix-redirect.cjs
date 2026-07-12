const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const oldBlock = `      getRedirectResult(auth).then(async (redirectResult) => {
        if (redirectResult?.user) {
          console.log('[AuthListener] Login via redirect detectado:', redirectResult.user.email);
          const user = await buildUserObject(redirectResult.user);
          setUser(user);
          if (user.role === 'hospede' && !user.estadiaAtiva && location.pathname !== '/estadia') {
            navigate('/estadia', { replace: true });
          } else {
            navigate('/app', { replace: true });
          }
        }
      }).catch((err) => {
        console.log('[AuthListener] Sem redirect pendente:', err);
      });`;

const newBlock = `      getRedirectResult(auth).then(async (redirectResult) => {
        if (redirectResult?.user) {
          console.log('[AuthListener] Login via redirect detectado:', redirectResult.user.email);
          const user = await buildUserObject(redirectResult.user);
          setUser(user);
          // Verifica se é novo usuário (sem documento no Firestore)
          const { getDoc, doc } = await import('firebase/firestore');
          const { db } = await import('./lib/firebase');
          const userDoc = await getDoc(doc(db, 'users', redirectResult.user.uid));
          if (!userDoc.exists()) {
            navigate('/completar-perfil', { replace: true });
          } else if (user.role === 'hospede' && !user.estadiaAtiva && location.pathname !== '/estadia') {
            navigate('/estadia', { replace: true });
          } else {
            navigate('/app', { replace: true });
          }
        }
      }).catch((err) => {
        console.log('[AuthListener] Sem redirect pendente:', err);
      });`;

if (content.includes(oldBlock)) {
  const newContent = content.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.tsx', newContent);
  console.log('OK: replaced');
} else {
  console.log('NOT FOUND');
}
