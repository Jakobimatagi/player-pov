import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import {
  ArrowLeft,
  BookOpen,
  House,
  ListOrdered,
  PenLine,
  Sheet as SheetIcon,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AccountMenu } from './AccountMenu'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match the path exactly (Home and Team members). */
  end?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

/** The one coach nav. Every coach page renders it, so links can't drift apart again. */
function coachSections(dev: boolean): NavSection[] {
  const sections: NavSection[] = [
    {
      label: 'Coach',
      items: [
        { to: '/', label: 'Home', icon: House, end: true },
        { to: '/playbook', label: 'Playbook', icon: BookOpen },
      ],
    },
    {
      label: 'Team',
      items: [
        { to: '/team', label: 'Team', icon: Users, end: true },
        { to: '/team/roster', label: 'Roster sheet', icon: SheetIcon },
        { to: '/team/depth', label: 'Depth chart', icon: ListOrdered },
      ],
    },
  ]
  if (dev) {
    sections.push({
      label: 'Tools',
      items: [{ to: '/dev/editor', label: 'Draw a play', icon: PenLine }],
    })
  }
  return sections
}

/** Phone tab bar: top-level places only. Team stays lit on its sub-pages. */
function tabItems(dev: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/playbook', label: 'Playbook', icon: BookOpen },
    { to: '/team', label: 'Team', icon: Users },
  ]
  if (dev) items.push({ to: '/dev/editor', label: 'Draw', icon: PenLine })
  return items
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function Brand() {
  return (
    <Link
      to="/"
      className="flex h-12 items-center gap-2.5 rounded-lg px-2 text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:px-0"
      aria-label="POV Playbook home"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-[0_6px_16px_-6px] shadow-primary">
        P
      </span>
      <span className="truncate font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
        POV <span className="text-primary">Playbook</span>
      </span>
    </Link>
  )
}

function CoachSidebar({ account, dev }: { account: string; dev: boolean }) {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const close = () => {
    if (isMobile) setOpenMobile(false)
  }
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Coach">
          {coachSections(dev).map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const active = isActive(pathname, item)
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className="h-9 data-active:[&_svg]:text-primary"
                        >
                          <Link
                            to={item.to}
                            aria-current={active ? 'page' : undefined}
                            onClick={close}
                          >
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu name={account} variant="sidebar" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function TabBar({ dev }: { dev: boolean }) {
  return (
    <nav
      aria-label="Coach"
      className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {tabItems(dev).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive: on }) =>
            cn(
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium text-muted-foreground transition-colors',
              on && 'text-foreground [&_svg]:text-primary',
            )
          }
        >
          <item.icon className="size-5" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function CoachLayout({
  title,
  eyebrow,
  back,
  actions,
  account,
  nav = true,
  wide = false,
  className,
  subnav,
  children,
  dev = import.meta.env.DEV,
}: {
  title: ReactNode
  /** Small label above the title. */
  eyebrow?: ReactNode
  back?: { to: string; label: string }
  /** Buttons on the right of the top bar. */
  actions?: ReactNode
  /** Name or email shown in the account menu. */
  account: string
  /** Players get no coach nav. */
  nav?: boolean
  wide?: boolean
  className?: string
  /** Tabs under the title (Team pages). */
  subnav?: ReactNode
  children: ReactNode
  dev?: boolean
}) {
  const header = (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur-md">
      <div
        className={cn(
          'mx-auto flex w-full items-center gap-3 px-4 py-3 md:px-6',
          !wide && 'max-w-6xl',
        )}
      >
        {nav ? (
          <>
            <SidebarTrigger className="-ml-1 size-9 text-muted-foreground" />
            <Separator orientation="vertical" className="mr-1 hidden h-5 md:block" />
          </>
        ) : null}
        <div className="min-w-0 flex-1">
          {back ? (
            <Link
              to={back.to}
              className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {back.label}
            </Link>
          ) : eyebrow ? (
            <p className="mb-0.5 text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <div className={nav ? 'md:hidden' : undefined}>
            <AccountMenu name={account} />
          </div>
        </div>
      </div>
      {subnav ? (
        <div className={cn('mx-auto w-full px-4 md:px-6', !wide && 'max-w-6xl')}>{subnav}</div>
      ) : null}
    </header>
  )

  const content = (
    <main
      className={cn(
        'mx-auto w-full flex-1 px-4 pt-5 pb-24 md:px-6 md:pb-10',
        !wide && 'max-w-6xl',
        className,
      )}
    >
      {children}
    </main>
  )

  if (!nav) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        {header}
        {content}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <CoachSidebar account={account} dev={dev} />
        <SidebarInset className="min-w-0 md:border md:border-sidebar-border">
          {header}
          {content}
        </SidebarInset>
        <TabBar dev={dev} />
      </SidebarProvider>
    </TooltipProvider>
  )
}
