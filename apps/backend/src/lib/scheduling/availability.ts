import { prisma } from '../db/client.js';
import { getDefaultClinic } from '../db/clinic.js';
import { getIstanbulDayRange, parseIstanbulDate } from '../date-utils.js';

export interface CheckAvailabilityParams {
  clinicId?: string;
  doctorName?: string;
  doctorId?: string;
  specialty?: string;
  date?: string; // YYYY-MM-DD or ISO string
  time?: string; // HH:mm or H:mm
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
 * Normalizes input time string to standard "HH:mm" format.
 * Trims whitespace, parses "9:30" -> "09:30", "09:30:00" -> "09:30".
 * Returns null if invalid.
 */
export function normalizeTimeInput(timeStr?: string): string | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Finds up to `limit` available slots closest in time to `targetTime`.
 * Returned slots are sorted chronologically.
 */
export function findNearestAvailableSlots(
  availableSlots: string[],
  targetTime: string,
  limit = 2,
): string[] {
  const [tH, tM] = targetTime.split(':').map(Number);
  const targetMins = tH * 60 + tM;

  const toMins = (slot: string) => {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m;
  };

  const sorted = [...availableSlots].sort((a, b) => {
    const diffA = Math.abs(toMins(a) - targetMins);
    const diffB = Math.abs(toMins(b) - targetMins);
    if (diffA !== diffB) {
      return diffA - diffB;
    }
    return toMins(a) - toMins(b);
  });

  const nearest = sorted.slice(0, limit);
  nearest.sort((a, b) => toMins(a) - toMins(b));
  return nearest;
}

/**
 * Checks doctor/clinic slot availability for a given date.
 */
export async function checkAvailability(
  params: CheckAvailabilityParams,
): Promise<AvailableSlotResult> {
  const clinicId = params.clinicId || (await getDefaultClinic()).id;

  // 1. Resolve Target Date (default to tomorrow if not specified or invalid)
  let targetDate: Date;
  let dateStr: string;

  if (params.date) {
    try {
      targetDate = parseIstanbulDate(params.date);
      dateStr = params.date.trim().includes('T')
        ? params.date.trim().split('T')[0]
        : params.date.trim().slice(0, 10);
    } catch {
      targetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const dIso = new Date(targetDate.getTime() + 3 * 60 * 60 * 1000).toISOString();
      dateStr = dIso.split('T')[0];
    }
  } else {
    targetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dIso = new Date(targetDate.getTime() + 3 * 60 * 60 * 1000).toISOString();
    dateStr = dIso.split('T')[0];
  }

  // Calculate day name in Europe/Istanbul (+03:00)
  const istanbulDateObj = new Date(targetDate.getTime() + 3 * 60 * 60 * 1000);
  const dayName = DAYS_MAP[istanbulDateObj.getUTCDay()];

  // 2. Find Doctor
  let doctor = null;

  if (params.doctorId) {
    doctor = await prisma.doctor.findFirst({
      where: { id: params.doctorId, clinicId },
    });
  }

  if (!doctor && params.doctorName) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId,
        name: { contains: params.doctorName, mode: 'insensitive' },
      },
    });
  }

  if (!doctor && params.specialty) {
    doctor = await prisma.doctor.findFirst({
      where: {
        clinicId,
        specialty: { contains: params.specialty, mode: 'insensitive' },
      },
    });
  }

  if (!doctor) {
    // If no specific doctor matched, pick the first doctor in clinic
    doctor = await prisma.doctor.findFirst({
      where: { clinicId },
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

  // 4. Fetch non-cancelled appointments overlapping with this day in Istanbul timezone
  const { startOfDay, endOfDay } = getIstanbulDayRange(dateStr);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      clinicId,
      doctorId: doctor.id,
      status: { not: 'CANCELLED' },
      startsAt: { lte: endOfDay },
      endsAt: { gte: startOfDay },
    },
  });

  // 5. Generate and test candidate slots against real endsAt intervals
  const availableSlots: string[] = [];
  const startMinutes = startH * 60 + startM;
  const finishMinutes = endH * 60 + endM;
  const now = new Date();

  for (let m = startMinutes; m + slotDuration <= finishMinutes; m += slotDuration) {
    const slotHour = Math.floor(m / 60).toString().padStart(2, '0');
    const slotMinute = (m % 60).toString().padStart(2, '0');
    const timeStr = `${slotHour}:${slotMinute}`;

    const slotStart = parseIstanbulDate(`${dateStr}T${timeStr}:00`);
    const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

    // Skip if in the past
    if (slotStart.getTime() <= now.getTime()) {
      continue;
    }

    // Interval overlap check: [slotStart, slotEnd) vs any non-cancelled appointment [appt.startsAt, appt.endsAt)
    const hasOverlap = existingAppointments.some((appt) => {
      return appt.startsAt < slotEnd && appt.endsAt > slotStart;
    });

    if (!hasOverlap) {
      availableSlots.push(timeStr);
    }
  }

  const normalizedTime = normalizeTimeInput(params.time);

  if (availableSlots.length === 0) {
    const noSlotsMessage = normalizedTime
      ? `${normalizedTime} dolu. ${doctor.name} için ${dateStr} tarihinde başka müsait saat bulunmamaktadır.`
      : `${doctor.name} için ${dateStr} tarihinde müsait randevu saati kalmamıştır. Başka bir gün için kontrol edebiliriz.`;

    return {
      success: true,
      doctorId: doctor.id,
      doctorName: doctor.name,
      specialty: doctor.specialty || undefined,
      date: dateStr,
      availableSlots: [],
      message: noSlotsMessage,
    };
  }

  let message: string;

  if (normalizedTime) {
    if (availableSlots.includes(normalizedTime)) {
      message = `${doctor.name} için ${dateStr} saat ${normalizedTime} müsait.`;
    } else {
      const nearest = findNearestAvailableSlots(availableSlots, normalizedTime, 2);
      if (nearest.length > 0) {
        const label = nearest.length === 1 ? 'En yakın müsait saat' : 'En yakın müsait saatler';
        message = `${normalizedTime} dolu. ${label}: ${nearest.join(', ')}.`;
      } else {
        message = `${normalizedTime} dolu. ${doctor.name} için ${dateStr} tarihinde başka müsait saat bulunmamaktadır.`;
      }
    }
  } else {
    // Select 3 sample slots spread across the day
    const proposedSlots = availableSlots.slice(0, 3);
    const slotsText = proposedSlots.join(', ');
    const specialtyText = doctor.specialty ? ` (${doctor.specialty})` : '';
    message = `${doctor.name}${specialtyText} için ${dateStr} tarihinde müsait saatler: ${slotsText}.`;
  }

  return {
    success: true,
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialty: doctor.specialty || undefined,
    date: dateStr,
    availableSlots,
    message,
  };
}
