import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Plus,
  Trash2,
  Send,
  CheckCircle,
  ArrowLeft,
  AlertCircle,
  Mail,
} from 'lucide-react';

import { api, type AdminDoctorInput, type AdminClinicItem } from '../../lib/api';

export default function AdminNewClinicPage() {

  // Form State
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [cancellationPolicyHours, setCancellationPolicyHours] = useState(2);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [voiceId, setVoiceId] = useState('EXAVITQu4vr4xnSDxMaL');

  // Doctor List (At least 1 required)
  const [doctors, setDoctors] = useState<AdminDoctorInput[]>([
    {
      name: '',
      specialty: '',
      startHour: '09:00',
      endHour: '17:00',
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      complaints: '',
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success Step State (Created Clinic & Invite Secretary)
  const [createdClinic, setCreatedClinic] = useState<AdminClinicItem | null>(null);
  const [secretaryEmail, setSecretaryEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleAddDoctor = () => {
    setDoctors([
      ...doctors,
      {
        name: '',
        specialty: '',
        startHour: '09:00',
        endHour: '17:00',
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        complaints: '',
      },
    ]);
  };

  const handleRemoveDoctor = (index: number) => {
    if (doctors.length <= 1) {
      setError('Kliniğe en az 1 doktor tanımlanmalıdır.');
      return;
    }
    setError(null);
    setDoctors(doctors.filter((_, i) => i !== index));
  };

  const handleDoctorChange = (index: number, field: keyof AdminDoctorInput, value: string) => {
    const updated = [...doctors];
    updated[index] = { ...updated[index], [field]: value };
    setDoctors(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend validation: At least 1 doctor with name and specialty
    const validDoctors = doctors.filter((d) => d.name.trim() && d.specialty.trim());
    if (validDoctors.length === 0) {
      setError('Klinik oluşturmak için en az 1 hekimin adını ve branşını eksiksiz girmelisiniz.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await api.createAdminClinic({
        name: name.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        greetingMessage: greetingMessage.trim() || undefined,
        cancellationPolicyHours: Number(cancellationPolicyHours) || 2,
        specialInstructions: specialInstructions.trim() || undefined,
        voiceId: voiceId || undefined,
        doctors: validDoctors,
      });

      setCreatedClinic(res.clinic);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Klinik oluşturulurken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdClinic || !secretaryEmail.trim()) return;

    setInviting(true);
    setInviteResult(null);

    try {
      const res = await api.inviteSecretary(createdClinic.id, secretaryEmail.trim());
      setInviteResult({
        success: true,
        message: `${res.invitation.emailAddress} adresine sekreter daveti başarıyla iletildi. Kullanıcı daveti kabul ettiğinde bu kliniğe otomatik bağlanacaktır.`,
      });
      setSecretaryEmail('');
    } catch (err: unknown) {
      setInviteResult({
        success: false,
        message: err instanceof Error ? err.message : 'Davet gönderilemedi.',
      });
    } finally {
      setInviting(false);
    }
  };

  // If clinic is successfully created, render Success & Secretary Invitation Flow
  if (createdClinic) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">Klinik Başarıyla Oluşturuldu!</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {createdClinic.name} sisteme kaydedildi ve santral hattı tanımlandı.
            </p>
          </div>

          <div className="bg-surface rounded-xl p-4 border border-border text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Klinik ID:</span>
              <span className="font-mono font-semibold text-foreground">{createdClinic.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Santral Telefonu:</span>
              <span className="font-mono font-semibold text-foreground">{createdClinic.phoneNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanımlı Doktor:</span>
              <span className="font-semibold text-foreground">{createdClinic._count?.doctors || createdClinic.doctors?.length || 0} Hekim</span>
            </div>
          </div>
        </div>

        {/* Secretary Invite Form */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Sekreter Kullanıcı Daveti Gönder</h2>
              <p className="text-xs text-muted-foreground">
                Kullanıcı daveti kabul ettiğinde Clerk metadata'sına otomatik olarak bu klinik atanır.
              </p>
            </div>
          </div>

          {inviteResult && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium border flex items-start gap-2 ${
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

          <form onSubmit={handleSendInvite} className="flex gap-3">
            <input
              type="email"
              required
              placeholder="sekreterin-epostasi@klinik.com"
              value={secretaryEmail}
              onChange={(e) => setSecretaryEmail(e.target.value)}
              className="flex-1 bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
            <button
              type="submit"
              disabled={inviting || !secretaryEmail.trim()}
              className="bg-violet-600 text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              {inviting ? 'Gönderiliyor...' : 'Davet Gönder'}
            </button>
          </form>

          <div className="pt-4 border-t border-border flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                setCreatedClinic(null);
                setName('');
                setPhoneNumber('');
                setGreetingMessage('');
                setSpecialInstructions('');
                setDoctors([
                  {
                    name: '',
                    specialty: '',
                    startHour: '09:00',
                    endHour: '17:00',
                    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    complaints: '',
                  },
                ]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              + Başka Bir Klinik Ekle
            </button>

            <Link
              to="/admin"
              className="bg-surface hover:bg-border text-foreground px-4 py-2 rounded-xl text-xs font-semibold border border-border transition-colors flex items-center gap-1.5"
            >
              Klinikler Listesine Dön
              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Klinikler
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground mt-1">Yeni Klinik Tanımla</h1>
          <p className="text-sm text-muted-foreground">
            Sağlık merkezi profilini, sesli asistan parametrelerini ve hekim kadrosunu belirleyin
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Clinic Profile */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Building2 className="w-5 h-5 text-violet-600" />
            <h2 className="text-base font-bold text-foreground">Klinik Temel Bilgileri</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Klinik Tam Adı *
              </label>
              <input
                type="text"
                required
                placeholder="Örn: Marmara Fizik Tedavi Merkezi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Santral Telefon Numarası
              </label>
              <input
                type="text"
                placeholder="Boş bırakılırsa güvenli placeholder atanır"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Netgsm hattı hazır olunca güncellenebilir (+90000XXXXXXX tahsis edilir).
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Sesli Karşılama Cümlesi (Opsiyonel)
            </label>
            <input
              type="text"
              placeholder={`Merhaba, ${name || 'Kliniğimize'} hoş geldiniz. Size nasıl yardımcı olabilirim?`}
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                İptal / Erteleme Minimum Süresi (Saat)
              </label>
              <input
                type="number"
                min="0"
                max="72"
                value={cancellationPolicyHours}
                onChange={(e) => setCancellationPolicyHours(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Vapi / ElevenLabs Ses Kimliği (Voice ID)
              </label>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              >
                <option value="EXAVITQu4vr4xnSDxMaL">Sarah (Doğal Kadın Sesi — EXAVITQu4vr4xnSDxMaL)</option>
                <option value="nPczCjzI2devNBz1zQrb">Brian (Güven Veren Erkek Sesi — nPczCjzI2devNBz1zQrb)</option>
                <option value="">Vapi Varsayılan Sesi</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Kliniğe Özel Kurallar ve Duyurular (Opsiyonel)
            </label>
            <textarea
              rows={2}
              placeholder="Örn: SGK anlaşmalıdır. TC kimlik ve varsa eski röntgenleri yanınızda getiriniz. Otopark mevcuttur."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            />
          </div>
        </div>

        {/* Section 2: Doctors Roster (At least 1 required) */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="text-base font-bold text-foreground">Hekim Kadrosu</h2>
                <span className="text-[11px] text-muted-foreground">
                  (En az 1 hekim zorunludur — yapay zeka bu kadroya göre randevu oluşturur)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddDoctor}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Doktor Ekle
            </button>
          </div>

          <div className="space-y-4">
            {doctors.map((doctor, index) => (
              <div
                key={index}
                className="bg-surface rounded-xl p-4 border border-border/80 space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    Doktor #{index + 1}
                  </span>

                  {doctors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDoctor(index)}
                      className="text-red-500 hover:text-red-700 p-1 rounded-lg"
                      title="Bu hekimi kaldır"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Adı Soyadı *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Dr. Hakan Demir"
                      value={doctor.name}
                      onChange={(e) => handleDoctorChange(index, 'name', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Uzmanlık Branşı *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Fiziksel Tıp ve Rehabilitasyon"
                      value={doctor.specialty}
                      onChange={(e) => handleDoctorChange(index, 'specialty', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    İlgilendiği Şikayetler / Belirtiler (Opsiyonel)
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Bel fıtığı, kireçlenme, boyun ağrısı, inme rehabilitasyonu"
                    value={doctor.complaints || ''}
                    onChange={(e) => handleDoctorChange(index, 'complaints', e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Mesai Başlangıç
                    </label>
                    <input
                      type="time"
                      value={doctor.startHour || '09:00'}
                      onChange={(e) => handleDoctorChange(index, 'startHour', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Mesai Bitiş
                    </label>
                    <input
                      type="time"
                      value={doctor.endHour || '17:00'}
                      onChange={(e) => handleDoctorChange(index, 'endHour', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to="/admin"
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-surface border border-border transition-colors"
          >
            İptal
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="bg-violet-600 text-white px-6 py-2.5 rounded-xl text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 shadow-md shadow-violet-600/30 transition-all"
          >
            {submitting ? 'Klinik Kaydediliyor...' : 'Kliniği ve Hekimleri Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
