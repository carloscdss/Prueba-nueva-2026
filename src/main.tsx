import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface RootErrorState {
  error: Error | null;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorState> {
  state: RootErrorState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error crítico en Planta Viva:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#090d16] p-6 text-center text-slate-100">
          <div className="max-w-md rounded-lg border border-rose-800/70 bg-[#0f1626] p-5 shadow-xl">
            <h1 className="text-sm font-semibold text-rose-300">
              No se pudo iniciar la interfaz de Planta Viva
            </h1>
            <p className="mt-2 font-mono text-xs text-slate-300 break-words">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-[42px] rounded-md bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
