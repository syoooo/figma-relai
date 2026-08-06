import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Nav } from './components/landing/Nav';
import { Hero } from './components/landing/Hero';
import { Belief } from './components/landing/Belief';
import { Workflows } from './components/landing/Workflows';
import { Law } from './components/landing/Law';
import { Instrument } from './components/landing/Instrument';
import { Changes } from './components/landing/Changes';
import { Craft } from './components/landing/Craft';
import { Outlook } from './components/landing/Outlook';
import { GetStarted } from './components/landing/GetStarted';
import { Faq } from './components/landing/Faq';
import { CtaFooter } from './components/landing/CtaFooter';

export function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div className="dark min-h-full w-full bg-background text-foreground antialiased">
      <Nav />
      <main id="main">
        <Hero />
        <Belief />
        <Law />
        <Instrument />
        <Workflows />
        <Changes />
        <Craft />
        <Outlook />
        <GetStarted />
        <Faq />
      </main>
      <CtaFooter />
      <Analytics />
    </div>
  );
}
