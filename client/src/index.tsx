import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import { AppContainer } from '@/lib/components/AppContainer';
import { ErrorRender } from '@/lib/components/ErrorRender';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';

const CLIENT_BASE_PATH = process.env.CLIENT_BASE_PATH || '/';
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

const MainApp = () => {
  const Router = isFileProtocol ? HashRouter : BrowserRouter;
  const routerProps = isFileProtocol ? {} : { basename: CLIENT_BASE_PATH };

  return (
    <Router {...routerProps}>
      <AppContainer defaultTheme="light">
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorRender
              error={error as Error}
              resetErrorBoundary={resetErrorBoundary}
            />
          )}
        >
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </AppContainer>
    </Router>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
