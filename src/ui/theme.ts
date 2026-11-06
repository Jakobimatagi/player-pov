import { alpha, createTheme } from '@mui/material/styles'

const BRAND = '#d7263d'
const GOLD = '#f5c542'
const INK = '#0e1116'
const SURFACE = '#161a22'
const LINE = 'rgba(255,255,255,0.08)'

/** The one MUI theme. Dark, team red, gold accents, 44px touch targets. */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: BRAND, contrastText: '#ffffff' },
    secondary: { main: GOLD, contrastText: INK },
    background: { default: INK, paper: SURFACE },
    text: { primary: '#f3f1ec', secondary: '#a8adb8' },
    divider: LINE,
    success: { main: '#3fb36b' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "'Inter Variable', 'Segoe UI', system-ui, sans-serif",
    h1: { fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.5rem', fontWeight: 750, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.2rem', fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 650 },
    overline: { fontWeight: 700, letterSpacing: '0.12em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: `radial-gradient(1200px 600px at 100% -10%, ${alpha(BRAND, 0.12)}, transparent 60%)`,
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44, borderRadius: 10, paddingInline: 18 } },
    },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiToggleButton: {
      styleOverrides: { root: { minHeight: 40, textTransform: 'none', paddingInline: 14 } },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      styleOverrides: { root: { border: `1px solid ${LINE}`, backgroundImage: 'none' } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(INK, 0.8),
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${LINE}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: '#11151b', borderRight: `1px solid ${LINE}` } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 10,
          marginInline: 8,
          '&.Mui-selected': {
            backgroundColor: alpha(BRAND, 0.16),
            color: '#ffffff',
            '& .MuiListItemIcon-root': { color: BRAND },
          },
          '&.Mui-selected:hover': { backgroundColor: alpha(BRAND, 0.24) },
        },
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 40 } } },
    MuiBottomNavigation: {
      styleOverrides: {
        root: { height: 64, backgroundColor: '#11151b', borderTop: `1px solid ${LINE}` },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 64, '&.Mui-selected': { color: BRAND } } },
    },
    MuiTextField: { defaultProps: { fullWidth: true } },
    MuiOutlinedInput: {
      styleOverrides: { root: { minHeight: 48, backgroundColor: alpha('#000', 0.2) } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTableCell: { styleOverrides: { root: { borderBottomColor: LINE } } },
  },
})
