import { Check, Minus } from 'lucide-react'

type Feature = { title: string; body: string; image: string; alt: string; phone?: boolean }

const FEATURES: readonly Feature[] = [
  {
    title: 'See the play through your own facemask',
    body: 'Every play replays in 3D from the helmet of the player who runs it. Switch to the broadcast or top-down view, slow it to quarter speed, and watch it against the defense you will face this week.',
    image: '/landing/pov.webp',
    alt: 'A play replayed in 3D from a receiver’s helmet, with POV, broadcast and top-down views',
  },
  {
    title: 'A playbook the whole staff works in',
    body: 'Draw plays with routes and blocks, file them in playbooks and opponent folders, and print play sheets. Coordinators edit their side of the ball.',
    image: '/landing/coach-home.webp',
    alt: 'Coach Home with scout tasks and links to the playbook, team, roster and depth chart',
  },
  {
    title: 'Scout packs for every opponent',
    body: 'Build the week’s opponent looks, split the work across position rooms, and turn them into plays your scout team can see.',
    image: '/landing/scout-pack.webp',
    alt: 'A scout pack board for the week, with looks grouped by room',
  },
  {
    title: 'Homework players actually do',
    body: 'Assign a play against a look. Players run it on their phone, you see who passed, who is late and who has not started.',
    image: '/landing/player-home.webp',
    alt: 'Player Home on a phone with homework due, overdue and passed',
    phone: true,
  },
]

type Plan = {
  name: string
  price: string
  note: string
  rows: readonly (string | { off: string })[]
  featured?: boolean
}

// From marketing/plans.md. Prices are US dollars per year.
const PLANS: readonly Plan[] = [
  {
    name: 'Starter',
    price: 'Free',
    note: 'Try it with a few plays',
    rows: [
      '1 coach, up to 25 players',
      '15 plays',
      '3D helmet-cam replay',
      'Draw plays, playbook, play sheets',
      { off: 'Homework and scout packs' },
      { off: 'Game film' },
    ],
  },
  {
    name: 'Team',
    price: '$499',
    note: 'One team: varsity, JV or youth',
    featured: true,
    rows: [
      'Unlimited coaches and players',
      'Unlimited plays',
      'Everything in Starter',
      'Homework and rep tracking',
      'Scout packs, depth chart, activity',
      '10 GB of game film',
    ],
  },
  {
    name: 'Program',
    price: '$899',
    note: 'Up to 4 teams in one program',
    rows: [
      'Everything in Team, for 4 teams',
      '10 GB of film per team',
      'Setup call with your staff',
    ],
  },
]

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'How do players get in?',
    a: 'Only by invite from their coach. There is no public sign-up for players and no way to find a team from outside it.',
  },
  {
    q: 'What about player privacy?',
    a: 'A coach confirms that a parent, guardian or school has consented before inviting a player. Players see only their own team. No ads, and we never sell data.',
  },
  {
    q: 'Can my school pay by invoice?',
    a: 'Yes. Plans are priced per year to fit school budgets, and we can invoice against a purchase order.',
  },
  {
    q: 'Does it replace our film service?',
    a: 'No. It sits next to it. Film breaks down what happened; POV Playbook is where players learn what to do.',
  },
]

const primary =
  'inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const secondary =
  'inline-flex h-11 items-center justify-center rounded-lg border border-border bg-secondary px-5 font-medium text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">
            P
          </span>
          <span>
            POV <span className="text-primary">Playbook</span>
          </span>
        </a>
        <a
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Log in
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[5fr_7fr] lg:pt-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-primary uppercase">
              For football coaches and their players
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Your playbook, seen from the helmet.
            </h1>
            <p className="mt-5 max-w-prose text-lg text-pretty text-muted-foreground">
              Draw a play once. Every player watches it in 3D from their own position, runs it as
              homework, and shows up knowing their assignment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/signup" className={primary}>
                Start free
              </a>
              <a href="/login" className={secondary}>
                Log in
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Free for one coach and 15 plays. No card needed.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/40">
            <video
              className="block aspect-video w-full"
              src="/landing/draw-a-play.mp4"
              poster="/landing/draw-a-play-poster.webp"
              controls
              muted
              playsInline
              preload="none"
              aria-label="Demo: drawing a play and adding it to a playbook"
            />
          </div>
        </section>

        <section className="border-t border-border bg-card/40" aria-labelledby="features">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="features" className="text-3xl font-semibold tracking-tight">
              What it does
            </h2>
            <div className="mt-10 grid gap-12">
              {FEATURES.map((f, i) => (
                <article key={f.title} className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
                  <div className={i % 2 === 1 ? 'md:order-2' : undefined}>
                    <h3 className="text-xl font-semibold">{f.title}</h3>
                    <p className="mt-3 text-pretty text-muted-foreground">{f.body}</p>
                  </div>
                  <img
                    src={f.image}
                    alt={f.alt}
                    loading="lazy"
                    className={
                      f.phone
                        ? 'mx-auto w-full max-w-[260px] rounded-2xl border border-border'
                        : 'w-full rounded-xl border border-border'
                    }
                  />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="who">
          <h2 id="who" className="text-3xl font-semibold tracking-tight">
            Who it’s for
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Coaches</h3>
              <p className="mt-2 text-muted-foreground">
                Install plays faster, run scout weeks without the whiteboard, and know before
                practice which players have learned the game plan.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">Players</h3>
              <p className="mt-2 text-muted-foreground">
                Open a play on your phone, watch it from your spot on the field, and rep it until it
                sticks. Your coach sends the invite; there is nothing to buy.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-card/40" aria-labelledby="plans">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="plans" className="text-3xl font-semibold tracking-tight">
              Plans
            </h2>
            <p className="mt-2 text-muted-foreground">Priced per year, the way schools budget.</p>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {PLANS.map((p) => (
                <div
                  key={p.name}
                  className={`flex flex-col rounded-xl border bg-card p-6 ${
                    p.featured ? 'border-primary' : 'border-border'
                  }`}
                >
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.note}</p>
                  <p className="mt-4 text-3xl font-semibold">
                    {p.price}
                    {p.price !== 'Free' ? (
                      <span className="text-base font-normal text-muted-foreground"> / year</span>
                    ) : null}
                  </p>
                  <ul className="mt-5 grid flex-1 content-start gap-2.5 text-sm">
                    {p.rows.map((row) =>
                      typeof row === 'string' ? (
                        <li key={row} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                          {row}
                        </li>
                      ) : (
                        <li key={row.off} className="flex gap-2 text-muted-foreground">
                          <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                          <span>
                            <span className="sr-only">Not included: </span>
                            {row.off}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                  <a href="/signup" className={`mt-6 ${p.featured ? primary : secondary}`}>
                    {p.price === 'Free' ? 'Start free' : `Start with ${p.name}`}
                  </a>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Need more film? Add 50 GB for $49 a year.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq">
          <h2 id="faq" className="text-3xl font-semibold tracking-tight">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-border border-y border-border">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span
                      className="text-muted-foreground transition-transform group-open:rotate-45"
                      aria-hidden
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-pretty text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            Put your next install in their helmets.
          </h2>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/signup" className={primary}>
              Start free
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} POV Playbook</span>
          <a href="/login" className="hover:text-foreground">
            Log in
          </a>
        </div>
      </footer>
    </div>
  )
}
