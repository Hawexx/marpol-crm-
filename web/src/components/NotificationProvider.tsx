import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { MessageStrip, Toast } from '@ui5/webcomponents-react';

interface NotifyContextValue {
  /** Kisa sureli basari/bilgi mesaji. */
  toast: (message: string) => void;
  /** Ekranin ustunde kalici hata seridi. */
  error: (message: string) => void;
  clearError: () => void;
  errorMessage: string | null;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const toast = useCallback((text: string) => {
    setMessage(text);
    setToastOpen(false);
    // Ayni mesaj tekrar gonderildiginde de yeniden acilsin.
    requestAnimationFrame(() => setToastOpen(true));
  }, []);

  const error = useCallback((text: string) => setErrorText(text), []);
  const clearError = useCallback(() => setErrorText(null), []);

  const value = useMemo(
    () => ({ toast, error, clearError, errorMessage: errorText }),
    [toast, error, clearError, errorText],
  );

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Toast open={toastOpen} duration={3500} onClose={() => setToastOpen(false)}>
        {message}
      </Toast>
    </NotifyContext.Provider>
  );
}

/**
 * Hata seridi.
 *
 * Bilerek saglayicinin disinda, uygulama kabugunun **icinde** basilir.
 * Saglayicinin kendisi bunu `children`dan once render ettiginde, serit
 * `height: 100vh` olan kabugun uzerine ekleniyor ve sayfayi goruntu alanindan
 * tasirip bir kaydirma cubugu olusturuyordu.
 */
export function NotificationBanner() {
  const { errorMessage, clearError } = useNotify();
  if (!errorMessage) return null;

  return (
    <div className="mp-shell__alert" role="alert" aria-live="assertive">
      <MessageStrip design="Negative" onClose={clearError}>
        {errorMessage}
      </MessageStrip>
    </div>
  );
}

export function useNotify(): NotifyContextValue {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify yalnizca NotificationProvider icinde kullanilabilir.');
  return ctx;
}
