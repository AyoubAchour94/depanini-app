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
import './styles/theme.css';
import './styles/app.css';

const config = readConfig();
const auth = createFirebaseAuthService(config);
const api = createApiClient({ baseUrl: config.apiUrl, getToken: () => auth.getToken() });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider service={auth}>
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ApiProvider>
    </AuthProvider>
  </StrictMode>,
);
