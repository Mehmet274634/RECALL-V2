import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';

export interface CheckAvailabilityParams {
  doctorName?: string;
  doctorId?: string;
  specialty?: string;
  date?: string; // YYYY-MM-DD or ISO string
}

export interface AvailableSlotResult {
  success: boolean;
  doctorId?: string;
  doctorName?: string;
  specialty?: string;
  date: string;
  availableSlots: string[]; // ["09:00", "09:30", "14:00"]
  message: string;
}

const DAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Checks doctor/clinic slot availability for a given date.
 */
export async function checkAvailability(
  params: CheckAvailabilityParams,
): Promise<AvailableSlotResult> {
  const clinic = await getDefaultClinic();

  // 1. Resolve Target Date (default to tomorrow if not specified or invalid)
  let targetDate: Date;
  if (params.date) {
    targetDate = new Date(params.date);
    if (isNaN(targetDate.getTime())) {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
    }
  } else {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const dateStr = targetDate.toISOString().split('T')[0];
  const dayName = DAYS_MAP[targetDate.getDay()];

  // 2. Find Doctor
  let doctor = null;

  if (params.doctorId) {
    doctor = await prisma.doctor.findFirst({
      where: { id: params.doctorId, clinicId: clinic.id },
    });
  }

  if (!doctor && params.doctorName) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId: clinic.id,
        name: { contains: params.doctorName, mode: 'insensitive' },
      },
    });
  }

  if (!doctor && params.specialty) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId: clinic.id,
        specialty: { contains: params.specialty, mode: 'insensitive' },
      },
    });
  }

  if (!doctor) {
    // If no specific doctor matched, pick the first doctor in clinic
    doctor = await prisma.doctor.findFirst({
      where: { clinicId: clinic.id },
    });
  }

  if (!doctor) {
    return {
      success: false,
      date: dateStr,
      availableSlots: [],
      message: 'Kliniğimizde kayıtlı doktor bulunamadı.',
    };
  }

  // 3. Parse Working Hours (default 09:00 - 17:00, 30 min slots, weekdays)
  const workingHours = (doctor.workingHours as Record<string, unknown>) || {};
  const activeDays = (workingHours.days as string[]) || [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
  ];

  if (!activeDays.includes(dayName)) {
    return {
      success: false,
      doctorId: doctor.id,
      doctorName: doctor.name,
      specialty: doctor.specialty || undefined,
      date: dateStr,
      availableSlots: [],
      message: `${doctor.name}, ${dateStr} tarihinde (hafta sonu/izinli) hasta kabul etmemektedir. Lütfen hafta içi bir tarih seçiniz.`,
    };
  }

  const startHourStr = (workingHours.start as string) || '09:00';
  const endHourStr = (workingHours.end as string) || '17:00';
  const slotDuration = (workingHours.slotDurationMinutes as number) || 30;

  const [startH, startM] = startHourStr.split(':').map(Number);
  const [endH, endM] = endHourStr.split(':').map(Number);

  // 4. Fetch existing scheduled appointments on this date
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      clinicId: clinic.id,
      doctorId: doctor.id,
      status: 'SCHEDULED',
      startsAt: { gte: dayStart, lte: dayEnd },
    },
  });

  const bookedTimes = new Set(
    existingAppointments.map((a) => {
      const h = a.startsAt.getHours().toString().padStart(2, '0');
      const m = a.startsAt.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    }),
  );

  // 5. Generate slots
  const availableSlots: string[] = [];
  const currentSlot = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), startH, startM, 0);
  const finishTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), endH, endM, 0);

  const now = new Date();

  while (currentSlot < finishTime) {
    const timeStr = `${currentSlot.getHours().toString().padStart(2, '0')}:${currentSlot.getMinutes().toString().padStart(2, '0')}`;

    // Skip if in the past
    const isPast = currentSlot.getTime() <= now.getTime();
    if (!isPast && !bookedTimes.has(timeStr)) {
      availableSlots.push(timeStr);
    }

    currentSlot.setMinutes(currentSlot.getMinutes() + slotDuration);
  }

  if (availableSlots.length === 0) {
    return {
      success: true,
      doctorId: doctor.id,
      doctorName: doctor.name,
      specialty: doctor.specialty || undefined,
      date: dateStr,
      availableSlots: [],
      message: `${doctor.name} için ${dateStr} tarihinde müsait randevu saati kalmamıştır. Başka bir gün için kontrol edebiliriz.`,
    };
  }

  // Select 3 sample slots spread across the day (morning, afternoon)
  const proposedSlots = availableSlots.slice(0, 3);
  const slotsText = proposedSlots.join(', ');

  const specialtyText = doctor.specialty ? ` (${doctor.specialty})` : '';
  const message = `${doctor.name}${specialtyText} için ${dateStr} tarihinde müsait saatler: ${slotsText}. Bu saatlerden hangisi sizin için uygundur?`;

  return {
    success: true,
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialty: doctor.specialty || undefined,
    date: dateStr,
    availableSlots: proposedSlots,
    message,
  };
}
