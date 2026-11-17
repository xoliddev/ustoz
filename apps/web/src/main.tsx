import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './styles/base.css';
import './styles/shell.css';
import './styles/admin.css';
import './styles/mini.css';
import './styles/chat.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider } from './api/context';
import { createHttpApi, createLocalApi } from './api/clients';
import { App } from './App';
import { LocaleProvider } from './i18n';
import { ToastHost } from './ui/kit';

// Demo build: the whole backend runs in a Web Worker. Otherwise: the real API (token from Telegram login).
const client = import.meta.env.VITE_TARGET === 'demo'
  ? createLocalApi()
  : createHttpApi(import.meta.env.VITE_API_URL, () => sessionStorage.getItem('ustoz.token'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <ApiProvider client={client}>
        <ToastHost>
          <App />
        </ToastHost>
      </ApiProvider>
    </LocaleProvider>
  </StrictMode>,
);
