'use client';

interface WelcomeHeroProps {
  name: string;
  /** One line under the greeting saying what this screen shows. */
  subtitle: string;
  lang: 'ar' | 'en';
  /** Right-hand slot — date range, refresh, quick actions. */
  actions?: React.ReactNode;
}

function greeting(lang: 'ar' | 'en'): string {
  // Cairo-local hour: every user of this app works on Cairo time.
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Cairo',
    }).format(new Date()),
  );

  if (hour < 12) return lang === 'ar' ? 'صباح الخير' : 'Good morning';
  if (hour < 18) return lang === 'ar' ? 'مساء الخير' : 'Good afternoon';
  return lang === 'ar' ? 'مساء الخير' : 'Good evening';
}

/** The greeting strip at the top of a user's landing screen. */
export default function WelcomeHero({ name, subtitle, lang, actions }: WelcomeHeroProps) {
  // Split on whitespace so "Mohamed Ahmed Ali" greets as "Mohamed".
  const firstName = (name || '').trim().split(/\s+/)[0] || (lang === 'ar' ? 'بك' : 'there');

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0D2137] md:text-3xl">
          {greeting(lang)}، {firstName} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
