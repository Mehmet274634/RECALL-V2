import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Phone,
  Users,
  CheckCircle,
  Plus,
  RefreshCw,
  Search,
  Check,
  X,
  AlertCircle,
  CalendarClock,
} from 'lucide-react';

import { api, ApiError, type Appointment, type Doctor, type DashboardStats } from '../../lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newDoctorId, setNewDoctorId] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newTime, setNewTime] = useState('10:00');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reschedule Modal State
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('10:00');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setAuthError(null);
      const [statsData, apptsData, docsData] = await Promise.all([
        api.getStats(),
        api.getAppointments({
          date: selectedDate || undefined,
          doctorId: selectedDoctorId || undefined,
          status: selectedStatus || undefined,
        }),
        api.getDoctors(),
      ]);

      setStats(statsData.stats);
      setAppointments(apptsData.appointments);
      setDoctors(docsData.doctors);
      if (docsData.doctors.length > 0 && !newDoctorId) {
        setNewDoctorId(docsData.doctors[0].id);
      }
    } catch (error: unknown) {
      console.error('Error loading dashboard data:', error);
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
  }, [selectedDate, selectedDoctorId, selectedStatus, newDoctorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleStatusUpdate = async (
    id: string,
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
  ) => {
    try {
      await api.updateAppointment(id, { status });
      await loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const startsAt = `${newDate}T${newTime}:00`;
      await api.createAppointment({
        patientName: newPatientName,
        patientPhone: newPatientPhone,
        doctorId: newDoctorId,
        startsAt,
        durationMinutes: 30,
      });

      setCreateModalOpen(false);
      setNewPatientName('');
      setNewPatientPhone('');
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError('Randevu oluşturulamadı');
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openRescheduleModal = (appt: Appointment) => {
    setRescheduleAppt(appt);
    setRescheduleDoctorId(appt.doctorId);
    const starts = new Date(appt.startsAt);
    const yyyy = starts.getFullYear();
    const mm = String(starts.getMonth() + 1).padStart(2, '0');
    const dd = String(starts.getDate()).padStart(2, '0');
    setRescheduleDate(`${yyyy}-${mm}-${dd}`);
    const hh = String(starts.getHours()).padStart(2, '0');
    const min = String(starts.getMinutes()).padStart(2, '0');
    setRescheduleTime(`${hh}:${min}`);
    setRescheduleError(null);
    setRescheduleModalOpen(true);
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleAppt) return;
    setRescheduleSubmitting(true);
    setRescheduleError(null);

    try {
      const startsAt = `${rescheduleDate}T${rescheduleTime}:00`;
      await api.updateAppointment(rescheduleAppt.id, {
        doctorId: rescheduleDoctorId,
        startsAt,
      });

      setRescheduleModalOpen(false);
      setRescheduleAppt(null);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setRescheduleError('Bu saatte doktorun başka bir randevusu var, lütfen farklı bir saat seçin.');
      } else if (err instanceof Error) {
        setRescheduleError(err.message);
      } else {
        setRescheduleError('Randevu güncellenemedi.');
      }
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const filteredAppointments = appointments.filter((appt) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      appt.patient.fullName.toLowerCase().includes(q) ||
      appt.patient.phoneNumber.includes(q) ||
      appt.doctor.name.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return <span className="badge-active px-2.5 py-1 rounded-full text-xs font-semibold">Planlandı</span>;
      case 'COMPLETED':
        return <span className="badge-completed px-2.5 py-1 rounded-full text-xs font-semibold">Tamamlandı</span>;
      case 'CANCELLED':
        return <span className="badge-escalated px-2.5 py-1 rounded-full text-xs font-semibold">İptal Edildi</span>;
      case 'NO_SHOW':
        return <span className="badge-pending px-2.5 py-1 rounded-full text-xs font-semibold">Gelmedi</span>;
      default:
        return <span className="bg-muted text-muted-foreground px-2.5 py-1 rounded-full text-xs">{status}</span>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Randevu Yönetim Paneli</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kliniğinizin günlük randevu akışı ve sesli asistan kayıtları
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-surface hover:bg-border text-foreground px-4 py-2 rounded-xl text-sm font-medium border border-border transition-colors duration-200"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Yeni Randevu
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Bugünkü Randevular
            </span>
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {loading ? '-' : stats?.todayAppointments ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Planlanmış aktif randevu</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tamamlanan
            </span>
            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {loading ? '-' : stats?.todayCompleted ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Bugün gerçekleşen muayene</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Gelen Çağrılar
            </span>
            <div className="w-9 h-9 bg-accent/10 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-accent" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {loading ? '-' : stats?.todayCalls ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Yapay zeka asistanı karşılaması</div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Kayıtlı Hastalar
            </span>
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {loading ? '-' : stats?.totalPatients ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Klinik hasta havuzu</div>
        </div>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Filter Controls */}
        <div className="p-5 border-b border-border bg-surface/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Quick date buttons */}
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedDate === new Date().toISOString().split('T')[0]
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-surface'
              }`}
            >
              Bugün
            </button>

            <button
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setSelectedDate(tomorrow.toISOString().split('T')[0]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                (() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return selectedDate === tomorrow.toISOString().split('T')[0];
                })()
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-surface'
              }`}
            >
              Yarın
            </button>

            <button
              onClick={() => setSelectedDate('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedDate === ''
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-foreground hover:bg-surface'
              }`}
            >
              Tüm Tarihler
            </button>

            {/* Custom Date Input */}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Doctor Filter */}
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Tüm Doktorlar</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.specialty ? `(${d.specialty})` : ''}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Tüm Durumlar</option>
              <option value="SCHEDULED">Planlandı</option>
              <option value="COMPLETED">Tamamlandı</option>
              <option value="CANCELLED">İptal Edildi</option>
              <option value="NO_SHOW">Gelmedi</option>
            </select>
          </div>

          {/* Search box */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Hasta adı, telefon ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-lg py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Appointments Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/20 text-xs font-semibold text-muted-foreground">
                <th className="py-3 px-5">Tarih & Saat</th>
                <th className="py-3 px-5">Hasta</th>
                <th className="py-3 px-5">Doktor & Branş</th>
                <th className="py-3 px-5">Kanal</th>
                <th className="py-3 px-5">Durum</th>
                <th className="py-3 px-5 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                    Randevular yükleniyor...
                  </td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                    Kriterlere uygun randevu kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((appt) => {
                  const starts = new Date(appt.startsAt);
                  const dateStr = starts.toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                  });
                  const timeStr = `${starts.getHours().toString().padStart(2, '0')}:${starts.getMinutes().toString().padStart(2, '0')}`;

                  return (
                    <tr key={appt.id} className="hover:bg-surface/30 transition-colors">
                      <td className="py-3.5 px-5 font-medium text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{timeStr}</span>
                          <span className="text-xs text-muted-foreground font-normal">({dateStr})</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-foreground">{appt.patient.fullName}</div>
                        <div className="text-xs text-muted-foreground">{appt.patient.phoneNumber}</div>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-medium text-foreground">{appt.doctor.name}</div>
                        <div className="text-xs text-muted-foreground">{appt.doctor.specialty || 'Genel'}</div>
                      </td>

                      <td className="py-3.5 px-5">
                        {appt.createdViaCallId ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-accent font-medium bg-accent/10 px-2 py-0.5 rounded-md">
                            <Phone className="w-3 h-3" />
                            Vapi AI
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Panel Manuel</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5">{getStatusBadge(appt.status)}</td>

                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {appt.status === 'SCHEDULED' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openRescheduleModal(appt)}
                              title="Randevuyu yeniden planla"
                              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                            >
                              <CalendarClock className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(appt.id, 'COMPLETED')}
                              title="Tamamlandı olarak işaretle"
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(appt.id, 'CANCELLED')}
                              title="Randevuyu iptal et"
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Create Appointment Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-xl p-6 relative">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-foreground mb-1">Yeni Randevu Oluştur</h2>
            <p className="text-xs text-muted-foreground mb-5">
              Sekreter manuel randevu kayıt formu
            </p>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Hasta Adı Soyadı
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Ayşe Demir"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Hasta Telefon Numarası
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Örn: +905321234567"
                  value={newPatientPhone}
                  onChange={(e) => setNewPatientPhone(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Doktor Seçimi
                </label>
                <select
                  required
                  value={newDoctorId}
                  onChange={(e) => setNewDoctorId(e.target.value)}
                  disabled={doctors.length === 0}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
                >
                  {doctors.length === 0 ? (
                    <option value="">
                      {authError ? 'Klinik yetkisi eksik (doktorlar yüklenemedi)' : 'Kayıtlı doktor bulunamadı'}
                    </option>
                  ) : (
                    doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} {doc.specialty ? `— ${doc.specialty}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Tarih</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Saat</label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-surface"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {createSubmitting ? 'Kaydediliyor...' : 'Randevuyu Onayla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Appointment Modal */}
      {rescheduleModalOpen && rescheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl p-6 relative">
            <button
              onClick={() => setRescheduleModalOpen(false)}
              className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
                <CalendarClock className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Randevuyu Yeniden Planla</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Randevu saatini veya hekimini güncelleyin
            </p>

            {/* Readonly current appointment details */}
            <div className="bg-surface rounded-xl p-3.5 mb-4 border border-border/80 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Hasta:</span>
                <span className="font-semibold text-foreground">{rescheduleAppt.patient.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Telefon:</span>
                <span className="font-mono text-foreground">{rescheduleAppt.patient.phoneNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Mevcut Randevu:</span>
                <span className="font-semibold text-primary">
                  {new Date(rescheduleAppt.startsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} • {new Date(rescheduleAppt.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ({rescheduleAppt.doctor.name})
                </span>
              </div>
            </div>

            {rescheduleError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-800">
                {rescheduleError}
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Doktor Değiştir / Seç
                </label>
                <select
                  required
                  value={rescheduleDoctorId}
                  onChange={(e) => setRescheduleDoctorId(e.target.value)}
                  disabled={doctors.length === 0}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
                >
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} {doc.specialty ? `— ${doc.specialty}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Yeni Tarih</label>
                  <input
                    type="date"
                    required
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Yeni Saat</label>
                  <input
                    type="time"
                    required
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setRescheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-surface"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={rescheduleSubmitting}
                  className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {rescheduleSubmitting ? 'Güncelleniyor...' : 'Yeni Saati Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
