import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
} from '../auth/pages'
import { HomePage, SessionLayout, WatchPage } from './HomeGate'
import { PlaybookRoute } from '../playbook/PlaybookRoute'
import { TeamPage } from '../team/TeamPage'

/** Dev-only editor harness (C5). Production builds drop it. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/editor',
        lazy: async () => {
          const { EditorPreviewPage } = await import('../editor/EditorPreviewPage')
          return { Component: EditorPreviewPage }
        },
      },
    ]
  : []

const router = createBrowserRouter([
  {
    element: <SessionLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/accept-invite', element: <AcceptInvitePage /> },
      { path: '/watch/draft/:draftKey', element: <WatchPage /> },
      { path: '/watch/:playId', element: <WatchPage /> },
      { path: '/team', element: <TeamPage /> },
      { path: '/playbook', element: <PlaybookRoute /> },
      ...devRoutes,
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
