import { ChevronsUpDown, LogOut, MonitorOff } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '../auth/session'

function initialsOf(name: string): string {
  const base = name.includes('@') ? (name.split('@')[0] ?? name) : name
  return (
    base
      .split(/[\s._-]+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '•'
  )
}

export function AccountMenu({
  name,
  variant = 'avatar',
}: {
  name: string
  /** `sidebar` is the full-width row at the bottom of the side nav. */
  variant?: 'avatar' | 'sidebar'
}) {
  const navigate = useNavigate()
  const initials = initialsOf(name)

  async function out(scope: 'local' | 'global') {
    await signOut(scope)
    navigate('/login?signedout=1', { replace: true })
  }

  const avatar = (
    <Avatar className="size-8 rounded-lg">
      <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
        {initials}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <DropdownMenu>
      {variant === 'sidebar' ? (
        <DropdownMenuTrigger
          aria-label="Account"
          className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
        >
          {avatar}
          <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">Signed in</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label="Account"
          className="grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatar}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align="end"
        side={variant === 'sidebar' ? 'top' : 'bottom'}
        className="w-60"
      >
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void out('local')}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void out('global')}>
          <MonitorOff />
          Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
