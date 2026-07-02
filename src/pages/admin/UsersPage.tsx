import { Sidebar } from '../../components/Sidebar';

export function UsersPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Sidebar />

      <div className="flex-1 p-6 overflow-auto flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20" />
              <path d="M12 8c-2.5 0-4-1.5-4-4" />
              <path d="M12 12c2.5 0 4 1.5 4 4" />
              <path d="M12 16c-2 0-3 1-3 3" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-400 mb-2">Ramos</h1>
          <p className="text-gray-500 max-w-md mx-auto">
            A gestão de moradores foi movida para <strong>Caule — Configurações</strong>.
          </p>
          <p className="text-gray-600 text-sm mt-4">
            Use a navegação lateral para acessar a administração completa da casa.
          </p>
        </div>
      </div>
    </div>
  );
}