import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Plus,
  Users,
  Phone,
  Calendar,
  Clock,
  Mail,
  RefreshCw,
  Search,
  CheckCircle,
  X,
  Send,
  AlertCircle,
  Activity,
} from 'lucide-react';

import { api, type AdminClinicItem, type AdminClinicsAnalyticsOverview } from '../../lib/api';

export default function AdminClinicsPage() {
  const [clinics, setClinics] = useState<AdminClinicItem[]>([]);
  const [analyticsOverview, setAnalyticsOverview] = useState<AdminClinicsAnalyticsOverview['clinics']>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Secretary Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<AdminClinicItem | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadClinics = useCallback(async () => {
    try {
      setError(null);
      const [data, analyticsData] = await Promise.all([
        api.getAdminClinics(),
        api.getAdminClinicsAnalytics().catch((e) => {
          console.warn('[admin] Analytics overview load failed:', e);
          return { clinics: [] };
        }),
      ]);
      setClinics(data.clinics);
      setAnalyticsOverview(analyticsData.clinics);
    } catch (err: unknown) {
      console.error('Error fetching admin clinics:', err);
      setError(err instanceof Error ? err.message : 'Klinikler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadClinics();
  };

  const openInviteModal = (clinic: AdminClinicItem) => {
    setSelectedClinic(clinic);
    setInviteEmail('');
    setInviteResult(null);
    setInviteModalOpen(true);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClinic || !inviteEmail.trim()) return;

    setInviting(true);
    setInviteResult(null);

    try {
      const res = await api.inviteSecretary(selectedClinic.id, inviteEmail.trim());
      setInviteResult({
        success: true,
        message: `${res.invitation.emailAddress} adresine sekreter daveti gönderildi. Otomatik olarak ${selectedClinic.name} kliniğine bağlandı.`,
      });
      setInviteEmail('');
    } catch (err: unknown) {
      setInviteResult({
        success: false,
        message: err instanceof Error ? err.message : 'Davet gönderilemedi.',
      });
    } finally {
      setInviting(false);
    }
  };

  const filteredClinics = clinics.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phoneNumber.includes(q) || c.id.includes(q);
  });

  const totalDoctors = clinics.reduce((acc, c) => acc + (c._count?.doctors || 0), 0);
  const totalAppointments = clinics.reduce((acc, c) => acc + (c._count?.appointments || 0), 0);
  const totalCalls = clinics.reduce((acc, c) => acc + (c._count?.callLogs || 0), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sistem Klinikleri</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RECALL platformuna kayıtlı tüm sağlık merkezleri ve sekreter yönetim akışı
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-card hover:bg-surface text-foreground px-3.5 py-2.5 rounded-xl text-xs font-medium border border-border transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>

          <Link
            to="/admin/new"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Yeni Klinik Ekle
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Kayıtlı Klinikler</span>
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">{clinics.length}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Aktif multi-tenant merkez</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Toplam Hekim</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">{totalDoctors}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Tanımlı doktor kadrosu</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Toplam Randevu</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">{totalAppointments}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Planlanan & tamamlanan</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Yapay Zeka Çağrıları</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Phone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">{totalCalls}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Vapi santral görüşmesi</p>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 30-Day Platform Analytics Comparison */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-5 border-b border-border bg-surface/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-600" />
              Klinik Aktivite Karşılaştırması (Son 30 Gün)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Platform geneli randevu ve çağrı hacmi — hangi kliniğin sistemi aktif kullandığı özeti
            </p>
          </div>
          <span className="text-[11px] font-mono bg-surface px-2.5 py-1 rounded-full border border-border text-muted-foreground self-start sm:self-auto">
            Son 30 Gün
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/30 text-xs font-semibold text-muted-foreground">
                <th className="py-3 px-5">Klinik Adı</th>
                <th className="py-3 px-5">Santral Numarası</th>
                <th className="py-3 px-5">Doktor</th>
                <th className="py-3 px-5">Randevu Hacmi</th>
                <th className="py-3 px-5">Tamamlanan</th>
                <th className="py-3 px-5">Yapay Zeka Çağrısı</th>
                <th className="py-3 px-5 text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs">
                    Analitik verileri yükleniyor...
                  </td>
                </tr>
              ) : analyticsOverview.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs">
                    Henüz aktivite verisi bulunmuyor.
                  </td>
                </tr>
              ) : (
                analyticsOverview.map((item) => {
                  const totalActivity = item.appointmentsCountLast30Days + item.callsCountLast30Days;
                  let statusBadge = (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      Yüksek Aktif
                    </span>
                  );
                  if (totalActivity === 0) {
                    statusBadge = (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-surface text-muted-foreground border border-border">
                        Yeni / Hareketsiz
                      </span>
                    );
                  } else if (totalActivity < 10) {
                    statusBadge = (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        Orta Seviye
                      </span>
                    );
                  }

                  return (
                    <tr key={item.id} className="hover:bg-surface/30 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-foreground text-xs">
                        {item.name}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-muted-foreground font-mono">
                        {item.phoneNumber}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-foreground">
                        {item.doctorsCount}
                      </td>
                      <td className="py-3.5 px-5 text-xs font-semibold text-foreground">
                        {item.appointmentsCountLast30Days}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-green-600 font-medium">
                        {item.completedAppointmentsCountLast30Days}
                      </td>
                      <td className="py-3.5 px-5 text-xs font-semibold text-violet-600">
                        {item.callsCountLast30Days}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {statusBadge}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-card rounded-2xl border border-border p-4 shadow-sm flex items-center gap-3">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Klinik adı, telefon veya kimlik ile filtrele..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>

      {/* Clinics Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/30 text-xs font-semibold text-muted-foreground">
                <th className="py-3 px-5">Klinik Adı & ID</th>
                <th className="py-3 px-5">Santral Telefonu</th>
                <th className="py-3 px-5">Hekim Kadrosu</th>
                <th className="py-3 px-5">İptal Politikası</th>
                <th className="py-3 px-5">Kayıt Tarihi</th>
                <th className="py-3 px-5 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                    Klinikler yükleniyor...
                  </td>
                </tr>
              ) : filteredClinics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                    Kriterlere uygun klinik bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredClinics.map((clinic) => {
                  const isPlaceholder = clinic.phoneNumber.startsWith('+90000');
                  const dateStr = new Date(clinic.createdAt).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <tr key={clinic.id} className="hover:bg-surface/20 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-violet-600" />
                          <span>{clinic.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {clinic.id}
                        </div>
                      </td>

                      <td className="py-4 px-5">
                        <div className="text-xs font-mono font-medium text-foreground">
                          {clinic.phoneNumber}
                        </div>
                        {isPlaceholder ? (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full border border-amber-500/20">
                            Geçici (Placeholder)
                          </span>
                        ) : (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Tahsisli Hat
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-500" />
                          <span>{clinic._count?.doctors || 0} Hekim</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                          {clinic.doctors.map((d) => d.name).join(', ') || 'Hekim kaydı yok'}
                        </div>
                      </td>

                      <td className="py-4 px-5">
                        <div className="text-xs font-medium text-foreground flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{clinic.cancellationPolicyHours} saat önceden</span>
                        </div>
                      </td>

                      <td className="py-4 px-5 text-xs text-muted-foreground whitespace-nowrap">
                        {dateStr}
                      </td>

                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openInviteModal(clinic)}
                          className="inline-flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Sekreter Davet Et
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Secretary Invite Modal */}
      {inviteModalOpen && selectedClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl p-6 relative">
            <button
              onClick={() => setInviteModalOpen(false)}
              className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600">
                <Mail className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Sekreter Kullanıcı Daveti</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Kullanıcı daveti Clerk API üzerinden gönderilir ve otomatik olarak bu kliniğe atanır.
            </p>

            {/* Selected Clinic Card */}
            <div className="bg-surface rounded-xl p-3 mb-4 border border-border/80 text-xs">
              <div className="font-semibold text-foreground">{selectedClinic.name}</div>
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Klinik ID: {selectedClinic.id}
              </div>
            </div>

            {inviteResult && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-medium border flex items-start gap-2 ${
                  inviteResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {inviteResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{inviteResult.message}</span>
              </div>
            )}

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Sekreter E-Posta Adresi
                </label>
                <input
                  type="email"
                  required
                  placeholder="sekreter@klinik.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-surface"
                >
                  Kapat
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="bg-violet-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  {inviting ? 'Davet Ediliyor...' : 'Davet Gönder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
