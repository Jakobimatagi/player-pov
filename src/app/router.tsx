import { createBrowserRouter, RouterProvider } from 'react-router'
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
} from '../auth/pages'
import { HomePage, SessionLayout, WatchPage } from './HomeGate'
import { TeamPage } from '../team/TeamPage'

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
      { path: '/watch/:playId', element: <WatchPage /> },
      { path: '/team', element: <TeamPage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
