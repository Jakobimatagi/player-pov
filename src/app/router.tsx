import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router'
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
} from '../auth/pages'
import { HomePage, SessionLayout, WatchPage } from './HomeGate'
import { ChartImportPage } from '../film/ChartImportPage'
import { FilmPage } from '../film/FilmPage'
import { PlaybookPage } from '../playbook/PlaybookPage'
import { PlaySheetPage } from '../playsheet/PlaySheetPage'
import { HomeworkPage } from '../reps/HomeworkPage'
import { RepsPage } from '../reps/RepsPage'
import { ActivityPage } from '../team/ActivityPage'
import { BillingPage } from '../team/BillingPage'
import { DepthChartPage } from '../team/DepthChartPage'
import { RosterSheetPage } from '../team/RosterSheetPage'
import { TeamPage } from '../team/TeamPage'

/** The old SVG draw board lived at /dev/editor and /draw. Both now open the diagram editor. */
function ToDiagram() {
  const { search } = useLocation()
  return <Navigate to={`/diagram${search}`} replace />
}

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
      { path: '/team/roster', element: <RosterSheetPage /> },
      { path: '/team/depth', element: <DepthChartPage /> },
      { path: '/team/activity', element: <ActivityPage /> },
      { path: '/team/billing', element: <BillingPage /> },
      { path: '/playbook', element: <PlaybookPage /> },
      { path: '/film', element: <FilmPage /> },
      { path: '/chart', element: <ChartImportPage /> },
      { path: '/plays/:playId', element: <PlaySheetPage /> },
      { path: '/plays/:playId/reps', element: <RepsPage /> },
      { path: '/homework/:assignmentId', element: <HomeworkPage /> },
      // Draw a play, optionally into a playbook: /diagram?playbook=<folder id>.
      {
        path: '/diagram',
        lazy: async () => {
          const { DiagramEditorPage } = await import('../diagram/DiagramEditorPage')
          return { Component: DiagramEditorPage }
        },
      },
      { path: '/draw', element: <ToDiagram /> },
      { path: '/dev/editor', element: <ToDiagram /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
