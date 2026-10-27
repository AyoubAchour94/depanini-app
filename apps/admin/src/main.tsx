import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { ApiProvider } from './api/ApiProvider';
import { createApiClient } from './api/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { createFirebaseAuthService } from './auth/firebase-service';
import { readConfig } from './config';
import { useTranslation } from './i18n';
import { LanguageProvider } from './i18n/language';
import { ErrorBoundary, initSentry } from './observability/sentry';
import './styles/theme.css';
import './styles/app.css';

// First, so errors raised while the app starts are reported too. No-op without VITE_SENTRY_DSN.
initSentry();

const config = readConfig();
const auth = createFirebaseAuthService(config);
const api = createApiClient({ baseUrl: config.apiUrl, getToken: () => auth.getToken() });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function ErrorFallback() {
  const { t } = useTranslation();
  return <p role="alert">{t('common:somethingWentWrong')}</p>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <AuthProvider service={auth}>
          <ApiProvider client={api}>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </QueryClientProvider>
          </ApiProvider>
        </AuthProvider>
      </ErrorBoundary>
    </LanguageProvider>
  </StrictMode>,
);
