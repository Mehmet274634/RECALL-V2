import { useState, useEffect, useCallback } from 'react';
import { Phone, Calendar, RefreshCw, X, MessageSquare, Clock, ArrowRight, AlertCircle } from 'lucide-react';

import { api, ApiError, type CallLog } from '../../lib/api';
import { formatIstanbulDate } from '../../lib/date';

export default function CallsPage() {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);

  const loadData = useCallback(async () => {
    try {
      setAuthError(null);
      const data = await api.getCallLogs({
        date: selectedDate || undefined,
        limit: 50,
      });
      setCallLogs(data.callLogs);
    } catch (error: unknown) {
      console.error('Error loading call logs:', error);
      if (error instanceof ApiError && error.status === 403) {
        setAuthError(
          'Hesabınıza henüz bir klinik atanmamış. Lütfen yöneticinizle iletişime geçin veya Clerk profilinize klinik kimliği tanımlanmasını isteyin.',
        );
      } else if (error instanceof Error) {
        setAuthError(error.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getCategoryBadge = (summary: string | null) => {
    if (!summary) {
      return <span className="badge-pending px-2.5 py-0.5 rounded-full text-xs font-semibold">Genel Bilgi</span>;
    }
    if (summary.includes('Randevu Talebi')) {
      return <span className="badge-active px-2.5 py-0.5 rounded-full text-xs font-semibold">Randevu Talebi</span>;
    }
    if (summary.includes('İptal')) {
      return <span className="badge-escalated px-2.5 py-0.5 rounded-full text-xs font-semibold">Randevu İptali</span>;
    }
    if (summary.includes('Değişikliği')) {
      return <span className="badge-pending px-2.5 py-0.5 rounded-full text-xs font-semibold">Değişiklik</span>;
    }
    return <span className="bg-surface text-muted-foreground px-2.5 py-0.5 rounded-full text-xs font-semibold">Arama</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sesli Çağrı Kayıtları</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vapi yapay zeka asistanı tarafından karşılanan hasta telefon görüşmeleri
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-card hover:bg-surface text-foreground px-3.5 py-2 rounded-xl text-xs font-medium border border-border transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
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

      {/* Calls List */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="divide-y divide-border/60">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Çağrı kayıtları yükleniyor...
            </div>
          ) : callLogs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Henüz kayıtlı bir sesli arama bulunmuyor.
            </div>
          ) : (
            callLogs.map((call) => {
              const dateStr = formatIstanbulDate(call.createdAt, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
              const timeStr = formatIstanbulDate(call.createdAt, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });

              return (
                <div
                  key={call.id}
                  className="p-5 hover:bg-surface/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{dateStr} • {timeStr}</span>
                      </div>
                      {getCategoryBadge(call.summary)}
                      <span className="text-xs text-muted-foreground bg-surface px-2 py-0.5 rounded-md font-mono">
                        {call.endedReason || 'completed'}
                      </span>
                    </div>

                    <p className="text-sm text-foreground font-medium line-clamp-2">
                      {call.summary || 'Özet bulunmuyor.'}
                    </p>

                    {call.appointments && call.appointments.length > 0 && (
                      <div className="text-xs text-primary font-medium flex items-center gap-1.5 pt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Bağlı Randevu: {call.appointments[0].patient.fullName} — {call.appointments[0].doctor.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => setSelectedCall(call)}
                      className="flex items-center gap-2 bg-surface hover:bg-border text-foreground px-4 py-2 rounded-xl text-xs font-semibold transition-colors border border-border"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                      Transkripti İncele
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Transcript Modal */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden relative">
            {/* Modal Header */}
            <div className="p-6 border-b border-border bg-surface/40 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Phone className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Görüşme Kaydı ve Transkript</h2>
                </div>
                <div className="text-xs text-muted-foreground">
                  Çağrı ID: <span className="font-mono">{selectedCall.vapiCallId}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedCall(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Summary box */}
              <div className="bg-surface rounded-xl p-4 border border-border/80">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Yapay Zeka Görüşme Özeti
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {selectedCall.summary || 'Özet kaydedilmedi.'}
                </p>
              </div>

              {/* Recording link if present */}
              {selectedCall.recordingUrl && (
                <div className="bg-primary/5 rounded-xl p-3.5 border border-primary/20 flex items-center justify-between">
                  <span className="text-xs text-primary font-medium">Ses Kaydı Mevcut:</span>
                  <a
                    href={selectedCall.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    Dinle / İndir
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Transcript dialogue */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Konuşma Metni (Transkript)
                </div>

                {selectedCall.transcript ? (
                  <div className="space-y-3 bg-background rounded-xl p-4 border border-border">
                    {selectedCall.transcript.split('\n').map((line, idx) => {
                      const isAssistant =
                        line.toLowerCase().startsWith('asistan:') ||
                        line.toLowerCase().startsWith('ai:') ||
                        line.toLowerCase().startsWith('bot:');

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl text-xs leading-relaxed max-w-[88%] ${
                            isAssistant
                              ? 'bg-primary text-primary-foreground ml-auto'
                              : 'bg-surface text-foreground mr-auto border border-border/60'
                          }`}
                        >
                          {line}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Bu görüşme için metin transkripti bulunamadı.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-surface/30 flex justify-end">
              <button
                onClick={() => setSelectedCall(null)}
                className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
