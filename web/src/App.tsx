import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  BusyIndicator,
  FlexBox,
  IllustratedMessage,
  Menu,
  MenuItem,
  ShellBar,
  ShellBarBranding,
  ShellBarItem,
  SideNavigation,
  SideNavigationItem,
} from '@ui5/webcomponents-react';
import { useAuth } from './auth/AuthContext.js';
import { NotificationBanner, NotificationProvider } from './components/NotificationProvider.js';
import { StatusTicker } from './components/StatusTicker.js';
import { useAppTheme } from './theme/ThemeContext.js';
import { initials } from './lib/format.js';
import type { ModuleKey } from './api/types.js';
import LoginPage from './pages/LoginPage.js';
import DashboardPage from './pages/DashboardPage.js';
import CustomersPage from './pages/CustomersPage.js';
import OpportunitiesPage from './pages/OpportunitiesPage.js';
import QuotesPage from './pages/QuotesPage.js';
import CatalogPage from './pages/CatalogPage.js';
import PricingPage from './pages/PricingPage.js';
import OrdersPage from './pages/OrdersPage.js';
import DocumentsPage from './pages/DocumentsPage.js';
import ContractsPage from './pages/ContractsPage.js';
import ServicePage from './pages/ServicePage.js';
import ReportsPage from './pages/ReportsPage.js';
import UsersPage from './pages/UsersPage.js';
import ChangePasswordDialog from './pages/ChangePasswordDialog.js';

interface NavEntry {
  route: string;
  text: string;
  icon: string;
  module: ModuleKey;
  element: React.ReactNode;
}

/** Sol menü - sistemin 12 sekmesi. Yetkilendirme bu anahtarlar üzerinden verilir. */
const NAV: NavEntry[] = [
  { route: '/gosterge-paneli', text: 'Gösterge Paneli', icon: 'business-objects-experience', module: 'GOSTERGE_PANELI', element: <DashboardPage /> },
  { route: '/musteriler', text: 'Müşteriler', icon: 'customer', module: 'MUSTERILER', element: <CustomersPage /> },
  { route: '/firsatlar', text: 'Fırsatlar', icon: 'opportunity', module: 'FIRSATLAR', element: <OpportunitiesPage /> },
  { route: '/teklifler', text: 'Teklifler (CPQ)', icon: 'sales-quote', module: 'TEKLIFLER', element: <QuotesPage /> },
  { route: '/urun-katalogu', text: 'Ürün Kataloğu', icon: 'product', module: 'URUN_KATALOGU', element: <CatalogPage /> },
  { route: '/fiyatlandirma', text: 'Fiyatlandırma', icon: 'money-bills', module: 'FIYATLANDIRMA', element: <PricingPage /> },
  { route: '/siparisler', text: 'Siparişler', icon: 'sales-order', module: 'SIPARISLER', element: <OrdersPage /> },
  { route: '/dokumanlar', text: 'Doküman & Şartname', icon: 'documents', module: 'DOKUMANLAR', element: <DocumentsPage /> },
  { route: '/sozlesmeler', text: 'Sözleşmeler', icon: 'signature', module: 'SOZLESMELER', element: <ContractsPage /> },
  { route: '/saha-servis', text: 'Saha Servis', icon: 'wrench', module: 'SAHA_SERVIS', element: <ServicePage /> },
  { route: '/raporlar', text: 'Raporlar', icon: 'bar-chart', module: 'RAPORLAR', element: <ReportsPage /> },
  { route: '/yetkilendirme', text: 'Yetkilendirme Paneli', icon: 'shield', module: 'YETKILENDIRME', element: <UsersPage /> },
];

function NoAccess() {
  return (
    <IllustratedMessage
      name="UnableToLoad"
      titleText="Bu sayfaya erişim yetkiniz yok"
      subtitleText="Yetki talebiniz için sistem yöneticinize başvurun."
    />
  );
}

/** Bilinmeyen adres — yetkisizlikle karıştırılmamalı. */
function NotFound() {
  return (
    <IllustratedMessage
      name="PageNotFound"
      titleText="Sayfa bulunamadı"
      subtitleText="Adres hatalı olabilir. Sol menüden bir sekme seçin."
    />
  );
}

/** Yetkisi olmayan kullanıcıya sayfayı açmaz. */
function Guard({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const { can } = useAuth();
  return can(module) ? <>{children}</> : <NoAccess />;
}

export default function App() {
  const { user, loading, logout, can } = useAuth();
  const { theme, toggleTheme } = useAppTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  /**
   * Profil menusunun tutunacagi oge.
   *
   * `useRef` ile tutuldugunda ilk cizimde `current` hala `null` oluyor ve menu
   * ilk acilisinda yanlis konumlaniyordu. Durum olarak tutmak, oge DOM'a
   * girdiginde bir kez yeniden cizim tetikleyip bagi dogru kurar.
   */
  const [avatarEl, setAvatarEl] = useState<HTMLDivElement | null>(null);

  if (loading) {
    return (
      <FlexBox justifyContent="Center" alignItems="Center" style={{ height: '100vh' }}>
        <BusyIndicator active size="L" text="Oturum kontrol ediliyor..." />
      </FlexBox>
    );
  }

  if (!user) return <LoginPage />;

  const visibleNav = NAV.filter((entry) => can(entry.module));
  const homeRoute = visibleNav[0]?.route ?? '/erisim-yok';

  return (
    <NotificationProvider>
      <div className="mp-shell">
        <ShellBar
          secondaryTitle={user.department ?? 'Marpol A.Ş.'}
          content={<StatusTicker />}
          branding={
            <ShellBarBranding
              logo={<img src="/marpol.svg" alt="Marpol" className="mp-shellbar__logo" />}
              onClick={() => navigate(homeRoute)}
            >
              Müşteri İlişkileri Yönetim Sistemi
            </ShellBarBranding>
          }
          profile={
            <div ref={setAvatarEl}>
              <Avatar initials={initials(user.fullName)} accessibleName={user.fullName} />
            </div>
          }
          onProfileClick={() => setMenuOpen(true)}
        >
          <ShellBarItem
            icon={theme === 'dark' ? 'light-mode' : 'dark-mode'}
            text={theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}
            onClick={toggleTheme}
          />
          <ShellBarItem icon="employee" text={user.fullName} onClick={() => setMenuOpen(true)} />
        </ShellBar>

        <Menu
          open={menuOpen}
          opener={avatarEl ?? undefined}
          onClose={() => setMenuOpen(false)}
          onItemClick={(e) => {
            const action = (e.detail.item as HTMLElement).dataset.action;
            setMenuOpen(false);
            if (action === 'password') setPwDialogOpen(true);
            if (action === 'theme') toggleTheme();
            if (action === 'logout') logout();
          }}
        >
          <MenuItem text={`${user.fullName}${user.title ? ` - ${user.title}` : ''}`} icon="employee" disabled />
          <MenuItem text="Şifre Değiştir" icon="key" data-action="password" />
          <MenuItem
            text={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
            icon={theme === 'dark' ? 'light-mode' : 'dark-mode'}
            data-action="theme"
          />
          <MenuItem text="Oturumu Kapat" icon="log" data-action="logout" />
        </Menu>

        {pwDialogOpen && <ChangePasswordDialog onClose={() => setPwDialogOpen(false)} />}

        {/* Hata seridi kabugun icinde durur; aksi halde 100vh'i tasirirdi. */}
        <NotificationBanner />

        <div className="mp-shell__body">
          <SideNavigation
            style={{ height: '100%' }}
            onSelectionChange={(e) => {
              const route = (e.detail.item as HTMLElement).dataset.route;
              if (route) navigate(route);
            }}
          >
            {visibleNav.map((entry) => (
              <SideNavigationItem
                key={entry.route}
                text={entry.text}
                icon={entry.icon}
                data-route={entry.route}
                selected={location.pathname.startsWith(entry.route)}
              />
            ))}
          </SideNavigation>

          <main className="mp-shell__content">
            <Routes>
              <Route path="/" element={<Navigate to={homeRoute} replace />} />
              {NAV.map((entry) => (
                <Route
                  key={entry.route}
                  path={entry.route}
                  element={<Guard module={entry.module}>{entry.element}</Guard>}
                />
              ))}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
