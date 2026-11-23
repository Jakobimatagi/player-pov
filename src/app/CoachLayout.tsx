import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { BrandMark } from '@/components/brand/Wordmark'
import { BRAND } from '@/lib/brand'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Clapperboard,
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
function coachSections(): NavSection[] {
  const sections: NavSection[] = [
    {
      label: 'Coach',
      items: [
        { to: '/', label: 'Home', icon: House, end: true },
        { to: '/playbook', label: 'Playbook', icon: BookOpen },
        { to: '/film', label: 'Game film', icon: Clapperboard },
      ],
    },
    {
      label: 'Team',
      items: [
        { to: '/team', label: 'Team', icon: Users, end: true },
        { to: '/team/roster', label: 'Roster sheet', icon: SheetIcon },
        { to: '/team/depth', label: 'Depth chart', icon: ListOrdered },
        { to: '/team/activity', label: 'Activity', icon: Activity },
      ],
    },
  ]
  sections.push({
    label: 'Tools',
    items: [{ to: '/diagram', label: 'Draw a play', icon: PenLine }],
  })
  return sections
}

/** Phone tab bar: top-level places only. Team stays lit on its sub-pages. */
function tabItems(): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/playbook', label: 'Playbook', icon: BookOpen },
    { to: '/team', label: 'Team', icon: Users },
  ]
  items.push({ to: '/diagram', label: 'Draw', icon: PenLine })
  return items
}

/** Each page mounts its own layout, so read back the collapsed state the sidebar saves. */
function sidebarWasOpen(): boolean {
  if (typeof document === 'undefined') return true
  return !document.cookie.split('; ').includes('sidebar_state=false')
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
      aria-label={`${BRAND.name} home`}
    >
      <BrandMark />
      <span className="truncate font-display text-xl leading-none font-extrabold tracking-wide uppercase group-data-[collapsible=icon]:hidden">
        {BRAND.wordmark.lead} <span className="text-primary">{BRAND.wordmark.accent}</span>
      </span>
    </Link>
  )
}

function CoachSidebar({ account }: { account: string }) {
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
          {coachSections().map((section) => (
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

function TabBar() {
  return (
    <nav
      aria-label="Coach"
      className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {tabItems().map((item) => (
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
}) {
  // Wide pages (roster, depth chart, play sheet) still stop at 1400px.
  const width = wide ? 'max-w-[1400px]' : 'max-w-6xl'
  // SidebarInset is already the <main> landmark when the nav is on.
  const Content = nav ? 'div' : 'main'
  const header = (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur-md">
      <div className={cn('mx-auto flex w-full items-center gap-3 px-4 py-3 md:px-6', width)}>
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
          <h1 className="truncate font-display text-2xl font-extrabold tracking-wide uppercase md:text-3xl">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <div className={nav ? 'md:hidden' : undefined}>
            <AccountMenu name={account} />
          </div>
        </div>
      </div>
      {subnav ? <div className={cn('mx-auto w-full px-4 md:px-6', width)}>{subnav}</div> : null}
    </header>
  )

  const content = (
    <Content
      className={cn('mx-auto w-full flex-1 px-4 pt-5 pb-24 md:px-6 md:pb-10', width, className)}
    >
      {children}
    </Content>
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
      <SidebarProvider defaultOpen={sidebarWasOpen()}>
        <CoachSidebar account={account} />
        <SidebarInset className="min-w-0 md:border md:border-sidebar-border">
          {header}
          {content}
        </SidebarInset>
        <TabBar />
      </SidebarProvider>
    </TooltipProvider>
  )
}
