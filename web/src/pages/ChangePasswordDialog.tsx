import { useState } from 'react';
import { Bar, Button, Dialog, Input, Label, MessageStrip } from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useNotify } from '../components/NotificationProvider.js';

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useNotify();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (newPassword !== repeat) {
      setError('Yeni şifreler eşleşmiyor.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast('Şifreniz güncellendi.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      headerText="Şifre Değiştir"
      onClose={onClose}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button
                design="Emphasized"
                onClick={submit}
                disabled={busy || !currentPassword || newPassword.length < 6}
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', width: '340px', padding: '0.5rem 0' }}>
        {error && (
          <MessageStrip design="Negative" hideCloseButton>
            {error}
          </MessageStrip>
        )}
        <div>
          <Label required showColon>
            Mevcut Şifre
          </Label>
          <Input
            type="Password"
            style={{ width: '100%' }}
            value={currentPassword}
            onInput={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div>
          <Label required showColon>
            Yeni Şifre
          </Label>
          <Input
            type="Password"
            style={{ width: '100%' }}
            value={newPassword}
            onInput={(e) => setNew(e.target.value)}
          />
        </div>
        <div>
          <Label required showColon>
            Yeni Şifre (tekrar)
          </Label>
          <Input
            type="Password"
            style={{ width: '100%' }}
            value={repeat}
            onInput={(e) => setRepeat(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
