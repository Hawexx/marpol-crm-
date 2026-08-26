import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input, Label, MessageStrip } from '@ui5/webcomponents-react';
import { useAuth } from '../auth/AuthContext.js';
import { errorMessage } from '../api/client.js';

/** Giriş ekranında oynatılan tanıtım videosunun hızı. */
const INTRO_SPEED = 2.5;

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-login">
      {!introDone && <IntroVideo onFinish={() => setIntroDone(true)} />}

      <form className="mp-login__panel" onSubmit={submit}>
        <img className="mp-login__logo" src="/marpol.svg" alt="Marpol" />
        <h1 className="mp-login__title">Müşteri İlişkileri Yönetim Sistemi</h1>
        <p className="mp-login__sub">Devam etmek için kurumsal hesabınızla giriş yapın.</p>

        {error && (
          <div style={{ marginBottom: '1rem' }} role="alert">
            <MessageStrip design="Negative" hideCloseButton>
              {error}
            </MessageStrip>
          </div>
        )}

        <div className="mp-login__field">
          <Label for="username" required showColon>
            Kullanıcı Adı
          </Label>
          <Input
            id="username"
            // UI5 Input `autocomplete`i prop olarak açmıyor; `name` en azından
            // form ilişkilendirmesini ve şifre yöneticisi eşleşmesini sağlar.
            name="username"
            style={{ width: '100%' }}
            value={username}
            onInput={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="mp-login__field" style={{ marginBottom: '1.25rem' }}>
          <Label for="password" required showColon>
            Şifre
          </Label>
          <Input
            id="password"
            name="password"
            type="Password"
            style={{ width: '100%' }}
            value={password}
            onInput={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
          />
          {capsLock && (
            <div className="mp-hint" role="status">
              Caps Lock açık.
            </div>
          )}
        </div>

        <Button
          design="Emphasized"
          style={{ width: '100%' }}
          onClick={() => submit()}
          disabled={busy || !username || !password}
        >
          {busy ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </Button>
        {/* Enter tuşuyla gönderim için gizli submit */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" />

        <div className="mp-login__footer">
          Marpol A.Ş. &middot; Müşteri İlişkileri Yönetim Sistemi v1.0
        </div>
      </form>
    </div>
  );
}

/**
 * Giriş paneline gelindiğinde tam ekran oynayan tanıtım videosu.
 * 2.5x hızda oynar; bitince (ya da atlanınca) kaybolur ve giriş formu görünür.
 */
function IntroVideo({ onFinish }: { onFinish: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [closing, setClosing] = useState(false);

  // Kapanış animasyonunu bekleyip formu göster.
  function finish() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onFinish, 450);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // playbackRate her yüklemede sıfırlanır; metadata gelince yeniden uygulanır.
    const applySpeed = () => {
      video.playbackRate = INTRO_SPEED;
    };
    applySpeed();
    video.addEventListener('loadedmetadata', applySpeed);

    // Tarayıcı otomatik oynatmayı engellerse videoyu bekletmeden geç.
    video.play().catch(() => finish());

    return () => video.removeEventListener('loadedmetadata', applySpeed);
    // finish/onFinish kimlikleri değişse de efektin tekrar çalışması istenmiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`mp-intro${closing ? ' mp-intro--closing' : ''}`}
      onClick={finish}
      role="presentation"
    >
      <video
        ref={videoRef}
        className="mp-intro__video"
        src="/marpol_giris.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      <button
        type="button"
        className="mp-intro__skip"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
      >
        Geç &rsaquo;
      </button>
    </div>
  );
}
