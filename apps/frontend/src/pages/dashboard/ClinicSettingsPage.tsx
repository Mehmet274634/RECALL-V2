import { useState, useEffect } from 'react';
import {
  Building2,
  Phone,
  Clock,
  Volume2,
  FileText,
  MessageSquare,
  AlertCircle,
  Users,
  Calendar,
  Sparkles,
} from 'lucide-react';

import { api, ApiError, type ClinicDetails } from '../../lib/api';

export default function ClinicSettingsPage() {
  const [clinic, setClinic] = useState<ClinicDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getClinic()
      .then((data) => setClinic(data.clinic))
      .catch((err: unknown) => {
        console.error(err);
        if (err instanceof ApiError && err.status === 403) {
          setAuthError(
            'Hesabınıza henüz bir klinik atanmamış. Lütfen yöneticinizle iletişime geçin.',
          );
        } else if (err instanceof Error) {
          setAuthError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Klinik Profili ve Asistan Ayarları</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Yapay zeka sesli asistanının bu klinik için kullandığı çalışma kuralları ve sistem parametreleri
        </p>
      </div>

      {/* Auth / Clinic Assignment Error Banner */}
      {authError && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Klinik Yetkilendirme Uyarısı</p>
            <p className="mt-0.5 text-xs opacity-90">{authError}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Klinik bilgileri yükleniyor...
        </div>
      ) : !clinic ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Klinik bilgisi bulunamadı.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info Card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{clinic.name}</h2>
                  <p className="text-xs text-muted-foreground font-mono">ID: {clinic.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="p-3.5 rounded-xl bg-surface border border-border/60">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                    <span>Santral Telefon Numarası</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground font-mono">
                    {clinic.phoneNumber}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface border border-border/60">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>İptal / Erteleme Politikası</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    En az {clinic.cancellationPolicyHours} saat önce
                  </div>
                </div>
              </div>

              {/* Greeting Message */}
              <div className="mb-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span>Sesli Asistan Karşılama Cümlesi</span>
                </div>
                <div className="p-4 rounded-xl bg-surface border border-border text-sm text-foreground italic">
                  "{clinic.greetingMessage || `Merhaba, ${clinic.name}'na hoş geldiniz. Size nasıl yardımcı olabilirim?`}"
                </div>
              </div>

              {/* Special Instructions */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Kliniğe Özel Kurallar ve Talimatlar (Prompt Ek Notu)</span>
                </div>
                <div className="p-4 rounded-xl bg-surface border border-border text-sm text-foreground whitespace-pre-line">
                  {clinic.specialInstructions || 'Kayıtlı özel talimat bulunmuyor.'}
                </div>
              </div>
            </div>
          </div>

          {/* Side Overview Card */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-4">Sistem & Ses Yapılandırması</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                  <Volume2 className="w-4 h-4 text-primary mt-0.5" />
                  <div className="text-xs">
                    <span className="font-semibold block text-foreground">Voice ID</span>
                    <span className="font-mono text-muted-foreground">
                      {clinic.voiceId || 'Varsayılan Asistan Sesi'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                  <div className="text-xs">
                    <span className="font-semibold block text-foreground">Saat Dilimi</span>
                    <span className="text-muted-foreground">{clinic.timezone}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-border">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Klinik Veri Özeti
                </h4>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-surface rounded-xl border border-border/50">
                    <Users className="w-4 h-4 text-primary mx-auto mb-1" />
                    <span className="text-lg font-bold text-foreground block">
                      {clinic.counts.doctors}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Aktif Hekim</span>
                  </div>
                  <div className="p-3 bg-surface rounded-xl border border-border/50">
                    <Calendar className="w-4 h-4 text-primary mx-auto mb-1" />
                    <span className="text-lg font-bold text-foreground block">
                      {clinic.counts.appointments}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Toplam Randevu</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
