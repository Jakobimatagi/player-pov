import { createBrowserRouter, RouterProvider } from 'react-router'
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
} from '../auth/pages'
import { HomePage, SessionLayout, WatchPage } from './HomeGate'

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
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
