import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (fn: (...args: any[]) => any, ...args: any[]) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

const mountApp = () => createRoot(document.getElementById('root')!).render(<App />);
if ((import.meta as any).env?.VITE_SHOWCASE_BUILD === 'true') {
  import('../showcase/demo/patch').then((m) => m.bootstrapDemoMode()).finally(mountApp);
} else {
  mountApp();
}
