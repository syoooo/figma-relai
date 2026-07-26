import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { LanguageProvider } from './lib/i18n';
import { Nav } from './components/landing/Nav';
import { Hero } from './components/landing/Hero';
import { Belief } from './components/landing/Belief';
import { Ledger } from './components/landing/Ledger';
import { Workflows } from './components/landing/Workflows';
import { Law } from './components/landing/Law';
import { Changes } from './components/landing/Changes';
import { Craft } from './components/landing/Craft';
import { FieldNotes } from './components/landing/FieldNotes';
import { GetStarted } from './components/landing/GetStarted';
import { Faq } from './components/landing/Faq';
import { CtaFooter } from './components/landing/CtaFooter';

export function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  return (
    <LanguageProvider>
      <div className="dark min-h-full w-full bg-background text-foreground antialiased">
        <Nav />
        <main id="main">
          <Hero />
          <Belief />
          <Ledger />
          <Workflows />
          <Law />
          <Changes />
          <Craft />
          <FieldNotes />
          <GetStarted />
          <Faq />
        </main>
        <CtaFooter />
        <Analytics />
      </div>
    </LanguageProvider>
  );
}
