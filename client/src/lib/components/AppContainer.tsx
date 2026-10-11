import React from 'react';

export interface AppContainerProps {
  children: React.ReactNode;
  defaultTheme?: string;
}

export const AppContainer: React.FC<AppContainerProps> = ({ children, defaultTheme = 'light' }) => {
  return (
    <div className="longpost-app min-h-screen text-foreground bg-background" data-theme={defaultTheme}>
      {children}
    </div>
  );
};
