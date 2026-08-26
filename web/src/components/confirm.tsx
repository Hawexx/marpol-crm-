import { useCallback, useState, type ReactNode } from 'react';
import { MessageBox, MessageBoxAction, MessageBoxType } from '@ui5/webcomponents-react';

export interface ConfirmRequest {
  /** Diyalog başlığı — ör. "Kalemi sil" */
  title: string;
  /** Ne olacağını anlatan tek cümle. Silinen kaydın adını içermelidir. */
  text: ReactNode;
  /** Onay düğmesinin metni — varsayılan "Sil" */
  confirmLabel?: string;
  /** Yıkıcı olmayan onaylarda `Confirm` kullanılır. */
  type?: MessageBoxType;
  onConfirm: () => void;
}

/**
 * Geri alınamaz işlemler için tek noktadan onay.
 *
 * Silme düğmelerinin çoğu tek tıkla, sorusuz siliyordu; kalan tek soru da
 * tarayıcının yerel `confirm()` kutusuydu ve uygulamanın geri kalanına hiç
 * benzemiyordu. Bu kanca (hook), her yerde aynı SAP diyaloğunu üretir.
 *
 * Kullanım:
 *   const { confirm, confirmDialog } = useConfirm();
 *   <Button onClick={() => confirm({ title: 'Kalemi sil', text: `"${x}" silinecek.`, onConfirm: () => m.mutate(id) })} />
 *   {confirmDialog}
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);

  const confirmDialog = request ? (
    <MessageBox
      open
      type={request.type ?? MessageBoxType.Warning}
      titleText={request.title}
      actions={[request.confirmLabel ?? 'Sil', MessageBoxAction.Cancel]}
      emphasizedAction={request.confirmLabel ?? 'Sil'}
      // ESC ya da "Vazgeç" hiçbir şey yapmadan kapatır; yalnızca onay düğmesi işler.
      initialFocus={MessageBoxAction.Cancel}
      onClose={(action) => {
        const accepted = action === (request.confirmLabel ?? 'Sil');
        setRequest(null);
        if (accepted) request.onConfirm();
      }}
    >
      {request.text}
    </MessageBox>
  ) : null;

  return { confirm, confirmDialog };
}
