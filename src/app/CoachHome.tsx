import { Link } from 'react-router'
import {
  ArrowUpRight,
  BookOpen,
  ListOrdered,
  PenLine,
  Sheet as SheetIcon,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CoachLayout } from './CoachLayout'

interface Destination {
  to: string
  label: string
  blurb: string
  icon: LucideIcon
  dev?: boolean
}

/** Only places that exist. The draw board is a dev preview until C7 adds /plays/new. */
function destinations(dev: boolean): Destination[] {
  const list: Destination[] = [
    {
      to: '/playbook',
      label: 'Playbook',
      blurb: 'Plays, playbooks and opponent folders',
      icon: BookOpen,
    },
    { to: '/team', label: 'Team', blurb: 'Coaches, players and invites', icon: Users },
    {
      to: '/team/depth',
      label: 'Depth chart',
      blurb: 'Who starts at every position',
      icon: ListOrdered,
    },
    {
      to: '/team/roster',
      label: 'Roster sheet',
      blurb: 'Numbers, positions, sizes and notes',
      icon: SheetIcon,
    },
  ]
  if (dev) {
    list.push({
      to: '/dev/editor',
      label: 'Draw a play',
      blurb: 'Draw board preview',
      icon: PenLine,
      dev: true,
    })
  }
  return list
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function CoachHome({ name, dev = import.meta.env.DEV }: { name: string; dev?: boolean }) {
  const places = destinations(dev)
  const [feature, ...rest] = places
  return (
    <CoachLayout
      title={greeting(new Date().getHours())}
      eyebrow="Coach home"
      account={name}
      dev={dev}
    >
      <p className="mb-6 text-sm text-muted-foreground">Jump back into your playbook or team.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {feature ? (
          <li className="sm:col-span-2 lg:row-span-2 lg:col-span-1">
            <HomeCard place={feature} featured />
          </li>
        ) : null}
        {rest.map((place) => (
          <li key={place.to}>
            <HomeCard place={place} />
          </li>
        ))}
      </ul>
    </CoachLayout>
  )
}

function HomeCard({ place, featured = false }: { place: Destination; featured?: boolean }) {
  return (
    <Link
      to={place.to}
      className={cn(
        'group relative flex h-full min-h-28 flex-col justify-between gap-4 sm:gap-6 overflow-hidden rounded-xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:border-foreground/20 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring',
        featured &&
          'bg-gradient-to-br from-primary/20 via-card to-card hover:from-primary/25 lg:min-h-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'grid size-10 place-items-center rounded-lg bg-secondary text-foreground',
            featured && 'bg-primary text-primary-foreground',
          )}
        >
          <place.icon className="size-5" />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn('font-semibold tracking-tight', featured && 'text-lg')}>
            {place.label}
          </span>
          {place.dev ? (
            <Badge variant="outline" className="text-[0.65rem]">
              Dev
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{place.blurb}</p>
      </div>
    </Link>
  )
}
