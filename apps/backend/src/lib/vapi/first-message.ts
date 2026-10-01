/**
 * Helpers for clinic first message, KVKK recording notices,
 * and special instructions sanitization / framing.
 */

export const RECORDING_NOTICE_KVKK = 'Görüşmemiz randevu işlemleri ve hizmet kalitesi amacıyla kaydedilmektedir.';
export const LEGACY_RECORDING_NOTICE = 'Görüşmelerimiz kalite ve hizmet standartları gereği kaydedilmektedir.';

export const CLINIC_NOTE_START_TAG = '[KLİNİK_NOTU_BAŞLANGIÇ]';
export const CLINIC_NOTE_END_TAG = '[KLİNİK_NOTU_BİTİŞ]';

export interface RecordingNoticeResult {
  text: string;
  added: boolean;
  toString(): string;
}

/**
 * Builds the assistant's First Message including KVKK audio recording notice.
 * Preserves the clinic's existing greeting while ensuring legal compliance across all clinics.
 * (Moved from sync-vapi.ts; behavior preserved).
 */
export function buildFirstMessage(clinic: { name: string; greetingMessage?: string | null }): string {
  const rawGreeting = clinic.greetingMessage?.trim();

  if (!rawGreeting) {
    return `Merhaba, ${clinic.name}'na hoş geldiniz. ${LEGACY_RECORDING_NOTICE} Size nasıl yardımcı olabilirim?`;
  }

  if (rawGreeting.includes('kaydedilmektedir') || rawGreeting.includes('kayıt')) {
    return rawGreeting;
  }

  // Check if greeting contains a closing question/offer like "nasıl yardımcı olabilirim" or "yardımcı olabilirim"
  const assistMatch = rawGreeting.match(/(?:Ben yapay zeka asistanınız,\s*)?(?:randevunuz için |size )?nasıl yardımcı olabilirim\??/i);
  if (assistMatch && assistMatch.index !== undefined) {
    const before = rawGreeting.slice(0, assistMatch.index).trim();
    const assistPhrase = rawGreeting.slice(assistMatch.index).trim();
    const cleanBefore = before.endsWith('.') || before.endsWith('!') ? before : `${before}.`;
    return `${cleanBefore} ${LEGACY_RECORDING_NOTICE} ${assistPhrase}`;
  }

  const cleanGreeting = rawGreeting.endsWith('.') || rawGreeting.endsWith('!') ? rawGreeting : `${rawGreeting}.`;
  return `${cleanGreeting} ${LEGACY_RECORDING_NOTICE}`;
}

/**
 * Ensures the KVKK recording notice is present in the greeting message.
 * Control is based strictly on "kaydedilmektedir" (or the exact notice), NOT the generic word "kayıt".
 * If absent, injects "Görüşmemiz randevu işlemleri ve hizmet kalitesi amacıyla kaydedilmektedir."
 */
export function ensureRecordingNotice(greeting: string): RecordingNoticeResult {
  const trimmed = (greeting || '').trim();

  // Control is based strictly on "kaydedilmektedir", not "kayıt"
  if (trimmed.includes('kaydedilmektedir')) {
    return {
      text: trimmed,
      added: false,
      toString() {
        return this.text;
      },
    };
  }

  const notice = RECORDING_NOTICE_KVKK;

  if (!trimmed) {
    return {
      text: notice,
      added: true,
      toString() {
        return this.text;
      },
    };
  }

  // Check if greeting contains a closing question/offer like "nasıl yardımcı olabilirim" or "yardımcı olabilirim"
  const assistMatch = trimmed.match(
    /(?:(?:Ben\s+)?yapay\s*zek[aâ]\s*(?:destekli\s*)?asistanınız(?:ım)?,\s*)?(?:randevunuz\s*için\s*|size\s*)?nasıl\s+yardımcı\s+olabilirim\??/i,
  );

  let newText: string;
  if (assistMatch && assistMatch.index !== undefined) {
    const before = trimmed.slice(0, assistMatch.index).trim();
    const assistPhrase = trimmed.slice(assistMatch.index).trim();
    const cleanBefore = before ? (before.endsWith('.') || before.endsWith('!') || before.endsWith('?') ? before : `${before}.`) : '';
    newText = cleanBefore ? `${cleanBefore} ${notice} ${assistPhrase}` : `${notice} ${assistPhrase}`;
  } else {
    const cleanGreeting =
      trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?') ? trimmed : `${trimmed}.`;
    newText = `${cleanGreeting} ${notice}`;
  }

  return {
    text: newText,
    added: true,
    toString() {
      return this.text;
    },
  };
}

/**
 * Sanitizes clinic special instructions:
 * 1. Normalizes curly/smart quotes to standard quotes.
 * 2. Reduces 3+ consecutive newlines to 2.
 * 3. Strips [KLİNİK_NOTU_BAŞLANGIÇ] and [KLİNİK_NOTU_BİTİŞ] markers (case-insensitive, Turkish-aware).
 * 4. Trims whitespace.
 * 5. Returns null if result is empty.
 */
export function sanitizeSpecialInstructions(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  let text = String(raw);

  // 1. Tırnakları normalize et:
  // Çift tırnaklar: “ ” „ « » -> "
  // Tek tırnaklar: ‘ ’ ‚ ‹ › -> '
  text = text
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚‹›]/g, "'");

  // 2. [KLİNİK_NOTU_BAŞLANGIÇ] ve [KLİNİK_NOTU_BİTİŞ] ayraçlarını (büyük/küçük harf duyarsız) metinden sil
  // Regex covers Turkish i/İ/ı/I and ş/Ş, ç/Ç variations
  text = text
    .replace(/\[\s*KL[İIıi]N[İIıi]K_NOTU_BA[ŞSşs]LANG[İIıi][ÇCçc]\s*\]/giu, '')
    .replace(/\[\s*KL[İIıi]N[İIıi]K_NOTU_B[İIıi]T[İIıi][ŞSşs]\s*\]/giu, '');

  // 3. 3+ yeni satırı 2'ye indir
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  // 4. Trim ve boş kontrolü
  text = text.trim();
  if (text.length === 0) {
    return null;
  }

  return text;
}
