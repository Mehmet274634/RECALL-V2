import { useState, useEffect } from 'react';
import { Stethoscope, Clock, Calendar, CheckCircle2 } from 'lucide-react';

import { api, type Doctor } from '../../lib/api';

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDoctors()
      .then((data) => setDoctors(data.doctors))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Klinik Doktor Kadrosu</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Asistanın randevu oluşturabileceği aktif hekimler ve çalışma saatleri
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-muted-foreground text-sm">
            Doktor listesi yükleniyor...
          </div>
        ) : doctors.length === 0 ? (
          <div className="col-span-full py-16 text-center text-muted-foreground text-sm">
            Kayıtlı doktor bulunamadı.
          </div>
        ) : (
          doctors.map((doctor) => {
            const wh = (doctor.workingHours || {}) as Record<string, unknown>;
            const start = (wh.start as string) || '09:00';
            const end = (wh.end as string) || '17:00';
            const duration = (wh.slotDurationMinutes as number) || 30;

            return (
              <div
                key={doctor.id}
                className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                      <Stethoscope className="w-6 h-6 text-primary" />
                    </div>
                    <span className="badge-active px-2.5 py-1 rounded-full text-xs font-semibold">
                      Aktif Kabul
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-1">{doctor.name}</h3>
                  <div className="text-xs font-medium text-accent inline-block bg-accent/10 px-2.5 py-0.5 rounded-md mb-5">
                    {doctor.specialty || 'Genel Hekim'}
                  </div>

                  <div className="space-y-2.5 text-xs text-muted-foreground border-t border-border pt-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span>
                        Mesai: <strong className="text-foreground">{start} - {end}</strong> ({duration} dk slot)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span>Hafta İçi: Pazartesi — Cuma</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Bugünkü Randevu:</span>
                  <div className="flex items-center gap-1.5 font-bold text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>{doctor.todayAppointmentsCount ?? 0} hasta</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
