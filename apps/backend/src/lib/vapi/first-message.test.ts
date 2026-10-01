import { describe, it, expect } from 'vitest';
import {
  ensureRecordingNotice,
  sanitizeSpecialInstructions,
  buildFirstMessage,
  RECORDING_NOTICE_KVKK,
  CLINIC_NOTE_START_TAG,
  CLINIC_NOTE_END_TAG,
} from './first-message.js';

describe('first-message & special-instructions module', () => {
  describe('ensureRecordingNotice', () => {
    it('adds KVKK notice when recording notice is missing and returns added: true', () => {
      const greeting = 'Merhaba, Güven Sağlık Kliniğine hoş geldiniz. Size nasıl yardımcı olabilirim?';
      const result = ensureRecordingNotice(greeting);

      expect(result.added).toBe(true);
      expect(result.text).toContain(RECORDING_NOTICE_KVKK);
      expect(result.text).toBe(
        `Merhaba, Güven Sağlık Kliniğine hoş geldiniz. ${RECORDING_NOTICE_KVKK} Size nasıl yardımcı olabilirim?`,
      );
    });

    it('adds KVKK notice at end when no closing offer phrase exists', () => {
      const greeting = 'Merhaba, Acıbadem Tıp Merkezi';
      const result = ensureRecordingNotice(greeting);

      expect(result.added).toBe(true);
      expect(result.text).toBe(`Merhaba, Acıbadem Tıp Merkezi. ${RECORDING_NOTICE_KVKK}`);
    });

    it('does NOT add KVKK notice when text already contains "kaydedilmektedir"', () => {
      const greeting =
        'Merhaba, Recall Sağlık Kliniği. Görüşmemiz randevu işlemleri ve hizmet kalitesi amacıyla kaydedilmektedir. Size nasıl yardımcı olabilirim?';
      const result = ensureRecordingNotice(greeting);

      expect(result.added).toBe(false);
      expect(result.text).toBe(greeting);
    });

    it('checks "kaydedilmektedir", NOT generic word "kayıt" (generic "kayıt" still gets notice added)', () => {
      // "kayıt" kelimesi tek başına KVKK uyarısı sayılmamalı
      const greeting = 'Merhaba, yeni hasta kaydı için kliniğimizi aradınız. Size nasıl yardımcı olabilirim?';
      const result = ensureRecordingNotice(greeting);

      expect(result.added).toBe(true);
      expect(result.text).toContain(RECORDING_NOTICE_KVKK);
      expect(result.text).toContain('kaydedilmektedir');
    });

    it('handles empty string by returning the KVKK notice directly', () => {
      const result = ensureRecordingNotice('');
      expect(result.added).toBe(true);
      expect(result.text).toBe(RECORDING_NOTICE_KVKK);
    });
  });

  describe('sanitizeSpecialInstructions', () => {
    it('normalizes curly double and single quotes to standard quotes', () => {
      const raw = 'Hastalar “TC Kimlik” kartını ve ‘tahlil’ sonuçlarını getirsin. «Girişte» danışmaya uğrayınız.';
      const sanitized = sanitizeSpecialInstructions(raw);

      expect(sanitized).toBe(
        'Hastalar "TC Kimlik" kartını ve \'tahlil\' sonuçlarını getirsin. "Girişte" danışmaya uğrayınız.',
      );
    });

    it('reduces 3 or more consecutive newlines to 2 newlines', () => {
      const raw = 'İlk kural: Randevudan 15 dk önce gelin.\n\n\n\n\nİkinci kural: Aç karnına geliniz.';
      const sanitized = sanitizeSpecialInstructions(raw);

      expect(sanitized).toBe(
        'İlk kural: Randevudan 15 dk önce gelin.\n\nİkinci kural: Aç karnına geliniz.',
      );
    });

    it('strips [KLİNİK_NOTU_BAŞLANGIÇ] and [KLİNİK_NOTU_BİTİŞ] markers regardless of casing and spaces', () => {
      const raw = `[KLİNİK_NOTU_BAŞLANGIÇ]
SGK anlaşmamız bulunmamaktadır.
[KLİNİK_NOTU_BİTİŞ]`;
      const sanitized = sanitizeSpecialInstructions(raw);

      expect(sanitized).toBe('SGK anlaşmamız bulunmamaktadır.');
      expect(sanitized).not.toContain(CLINIC_NOTE_START_TAG);
      expect(sanitized).not.toContain(CLINIC_NOTE_END_TAG);
    });

    it('strips lowercase and ascii variants of the tags', () => {
      const raw = '[klinik_notu_başlangıç] Lütfen randevu saatinde geliniz. [klinik_notu_bitiş]';
      const sanitized = sanitizeSpecialInstructions(raw);

      expect(sanitized).toBe('Lütfen randevu saatinde geliniz.');
    });

    it('returns null for null, undefined, empty string, or whitespace only', () => {
      expect(sanitizeSpecialInstructions(null)).toBeNull();
      expect(sanitizeSpecialInstructions(undefined)).toBeNull();
      expect(sanitizeSpecialInstructions('')).toBeNull();
      expect(sanitizeSpecialInstructions('   \n\n\t  ')).toBeNull();
    });

    it('returns null if text only contained stripped tags and whitespace', () => {
      const raw = '   [KLİNİK_NOTU_BAŞLANGIÇ]   [KLİNİK_NOTU_BİTİŞ]   ';
      expect(sanitizeSpecialInstructions(raw)).toBeNull();
    });
  });

  describe('buildFirstMessage (preserved behavior)', () => {
    it('builds fallback greeting when greetingMessage is null or empty', () => {
      const msg = buildFirstMessage({ name: 'Anadolu Kliniği', greetingMessage: null });
      expect(msg).toContain('Merhaba, Anadolu Kliniği\'na hoş geldiniz.');
      expect(msg).toContain('kaydedilmektedir');
    });

    it('preserves existing greeting when already containing recorded notice', () => {
      const existing = 'Merhaba, X Kliniği. Çağrılar kaydedilmektedir. Nasıl yardımcı olabilirim?';
      const msg = buildFirstMessage({ name: 'X Kliniği', greetingMessage: existing });
      expect(msg).toBe(existing);
    });
  });
});
