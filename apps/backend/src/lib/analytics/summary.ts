import { prisma } from '../db/client.js';

export interface AnalyticsSummary {
  period: {
    from: string;
    to: string;
    timezone: string;
    daysCount: number;
  };
  appointments: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
    noShowRate: number; // %
    cancellationRate: number; // %
    channels: {
      vapiAi: number;
      panelManual: number;
    };
    dailyTrend: Array<{
      date: string;
      total: number;
      completed: number;
      cancelled: number;
      noShow: number;
      scheduled: number;
      vapiAi: number;
      panelManual: number;
    }>;
    doctors: Array<{
      id: string;
      name: string;
      specialty: string | null;
      totalAppointments: number;
      completed: number;
      cancelled: number;
      noShow: number;
      scheduled: number;
      totalAvailableSlots: number;
      occupancyRate: number; // %
    }>;
    busiestDays: Array<{
      dayOfWeek: number; // 0=Sunday, 1=Monday...
      dayName: string;
      count: number;
    }>;
    peakHours: Array<{
      hour: number;
      hourLabel: string;
      count: number;
    }>;
  };
  calls: {
    totalCalls: number;
    averageDurationSeconds: number;
    conversionRate: number; // % (vapi appointments / total calls)
    categories: Array<{
      category: string;
      count: number;
      percentage: number;
    }>;
    endedReasons: Array<{
      reason: string;
      count: number;
      percentage: number;
    }>;
    hourlyDistribution: Array<{
      hour: number;
      hourLabel: string;
      count: number;
    }>;
  };
}

const TURKISH_DAYS_MAP: Record<number, string> = {
  0: 'Pazar',
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
};

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Calculates doctor working days and slots count in the selected date range.
 */
function calculateDoctorAvailableSlots(
  workingHours: unknown,
  from: string,
  to: string,
): number {
  if (!workingHours || typeof workingHours !== 'object') {
    return 0;
  }

  const wh = workingHours as {
    start?: string;
    end?: string;
    slotDurationMinutes?: number;
    days?: string[];
  };

  const startHour = wh.start || '09:00';
  const endHour = wh.end || '17:00';
  const slotMinutes = wh.slotDurationMinutes || 30;
  const activeDays = (wh.days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']).map(
    (d) => d.toLowerCase(),
  );

  const [startH, startM] = startHour.split(':').map(Number);
  const [endH, endM] = endHour.split(':').map(Number);
  const totalDailyMinutes = Math.max(0, endH * 60 + endM - (startH * 60 + startM));
  const slotsPerDay = Math.floor(totalDailyMinutes / Math.max(1, slotMinutes));

  // Count active days in the range
  const startDate = new Date(`${from}T00:00:00Z`);
  const endDate = new Date(`${to}T00:00:00Z`);
  let matchingDays = 0;

  const current = new Date(startDate);
  while (current <= endDate) {
    const dayOfWeek = current.getUTCDay();
    const isWorkingDay = activeDays.some((d) => DAY_NAME_TO_INDEX[d] === dayOfWeek);
    if (isWorkingDay) {
      matchingDays++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return matchingDays * slotsPerDay;
}

/**
 * Generates an aggregated analytics summary for a clinic over a specified date range.
 * Respects clinic timezone and strictly prevents PII leakage (KVKK compliant).
 */
export async function getClinicAnalyticsSummary(
  clinicId: string,
  from: string,
  to: string,
): Promise<AnalyticsSummary> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, timezone: true },
  });

  if (!clinic) {
    throw new Error('CLINIC_NOT_FOUND');
  }

  const tz = clinic.timezone || 'Europe/Istanbul';

  // 1. Validate Date Range
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new Error('INVALID_DATE_FORMAT');
  }

  if (fromDate > toDate) {
    throw new Error('INVALID_DATE_RANGE');
  }

  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 366) {
    throw new Error('DATE_RANGE_EXCEEDS_MAX_LIMIT');
  }

  // 2. Fetch Status & Totals
  const statusStatsRaw: Array<{ status: string; count: number }> = await prisma.$queryRaw`
    SELECT
      status::text AS status,
      COUNT(*)::int AS count
    FROM appointments
    WHERE clinic_id = ${clinicId}
      AND starts_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND starts_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
  `;

  let scheduled = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;

  for (const row of statusStatsRaw) {
    if (row.status === 'SCHEDULED') scheduled = row.count;
    else if (row.status === 'COMPLETED') completed = row.count;
    else if (row.status === 'CANCELLED') cancelled = row.count;
    else if (row.status === 'NO_SHOW') noShow = row.count;
  }

  const totalAppointments = scheduled + completed + cancelled + noShow;
  const noShowDenom = completed + noShow;
  const noShowRate =
    noShowDenom > 0 ? Math.round((noShow / noShowDenom) * 1000) / 10 : 0;
  const cancellationRate =
    totalAppointments > 0 ? Math.round((cancelled / totalAppointments) * 1000) / 10 : 0;

  // 3. Channels (Vapi AI vs Panel Manuel)
  const channelStatsRaw: Array<{ channel: string; count: number }> = await prisma.$queryRaw`
    SELECT
      CASE WHEN created_via_call_id IS NOT NULL THEN 'VAPI' ELSE 'MANUAL' END AS channel,
      COUNT(*)::int AS count
    FROM appointments
    WHERE clinic_id = ${clinicId}
      AND starts_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND starts_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
  `;

  let vapiAiCount = 0;
  let panelManualCount = 0;

  for (const row of channelStatsRaw) {
    if (row.channel === 'VAPI') vapiAiCount = row.count;
    else if (row.channel === 'MANUAL') panelManualCount = row.count;
  }

  // 4. Daily Trend
  const dailyStatsRaw: Array<{
    date: string;
    total: number;
    completed: number;
    cancelled: number;
    no_show: number;
    scheduled: number;
    vapi_ai: number;
    panel_manual: number;
  }> = await prisma.$queryRaw`
    SELECT
      TO_CHAR((starts_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
      COUNT(*) FILTER (WHERE status = 'SCHEDULED')::int AS scheduled,
      COUNT(*) FILTER (WHERE created_via_call_id IS NOT NULL)::int AS vapi_ai,
      COUNT(*) FILTER (WHERE created_via_call_id IS NULL)::int AS panel_manual
    FROM appointments
    WHERE clinic_id = ${clinicId}
      AND starts_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND starts_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const dailyTrend = dailyStatsRaw.map((d) => ({
    date: d.date,
    total: d.total,
    completed: d.completed,
    cancelled: d.cancelled,
    noShow: d.no_show,
    scheduled: d.scheduled,
    vapiAi: d.vapi_ai,
    panelManual: d.panel_manual,
  }));

  // 5. Doctors & Occupancy
  const doctors = await prisma.doctor.findMany({
    where: { clinicId },
    select: { id: true, name: true, specialty: true, workingHours: true },
    orderBy: { name: 'asc' },
  });

  const doctorStatsRaw: Array<{
    doctorId: string;
    total: number;
    completed: number;
    cancelled: number;
    no_show: number;
    scheduled: number;
  }> = await prisma.$queryRaw`
    SELECT
      doctor_id AS "doctorId",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show,
      COUNT(*) FILTER (WHERE status = 'SCHEDULED')::int AS scheduled
    FROM appointments
    WHERE clinic_id = ${clinicId}
      AND starts_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND starts_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
  `;

  const doctorStatsMap = new Map(doctorStatsRaw.map((d) => [d.doctorId, d]));

  const doctorAnalytics = doctors.map((doc) => {
    const stats = doctorStatsMap.get(doc.id) || {
      total: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      scheduled: 0,
    };

    const availableSlots = calculateDoctorAvailableSlots(doc.workingHours, from, to);
    // Occupancy: booked slots excluding cancellations divided by total available slots
    const activeBookedSlots = Math.max(0, stats.total - stats.cancelled);
    const occupancyRate =
      availableSlots > 0
        ? Math.min(100, Math.round((activeBookedSlots / availableSlots) * 1000) / 10)
        : 0;

    return {
      id: doc.id,
      name: doc.name,
      specialty: doc.specialty,
      totalAppointments: stats.total,
      completed: stats.completed,
      cancelled: stats.cancelled,
      noShow: stats.no_show,
      scheduled: stats.scheduled,
      totalAvailableSlots: availableSlots,
      occupancyRate,
    };
  });

  // 6. Busiest Days (Day of week)
  const busiestDaysRaw: Array<{ dayOfWeek: number; count: number }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(DOW FROM (starts_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS "dayOfWeek",
      COUNT(*)::int AS count
    FROM appointments
    WHERE clinic_id = ${clinicId}
      AND starts_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND starts_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const busiestDaysMap = new Map(busiestDaysRaw.map((r) => [r.dayOfWeek, r.count]));
  // Order from Monday (1) to Sunday (0)
  const orderedDayIndices = [1, 2, 3, 4, 5, 6, 0];
  const busiestDays = orderedDayIndices.map((dayIdx) => ({
    dayOfWeek: dayIdx,
    dayName: TURKISH_DAYS_MAP[dayIdx] || 'Bilinmiyor',
    count: busiestDaysMap.get(dayIdx) || 0,
  }));

  // 7. Peak Hours (08:00 - 20:00)
  const peakHoursRaw: Array<{ hour: number; count: number }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(HOUR FROM (starts_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS hour,
      COUNT(*)::int AS count
    FROM appointments
    WHERE clinic_id = ${clinicId}
      AND starts_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND starts_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const peakHoursMap = new Map(peakHoursRaw.map((r) => [r.hour, r.count]));
  const peakHours = [];
  for (let h = 8; h <= 20; h++) {
    peakHours.push({
      hour: h,
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      count: peakHoursMap.get(h) || 0,
    });
  }

  // 8. Call Metrics (CallLog)
  const callTotalsRaw: Array<{
    totalCalls: number;
    averageDurationSeconds: number;
  }> = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS "totalCalls",
      COALESCE(ROUND(AVG(duration_seconds)), 0)::int AS "averageDurationSeconds"
    FROM call_logs
    WHERE clinic_id = ${clinicId}
      AND created_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND created_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
  `;

  const totalCalls = callTotalsRaw[0]?.totalCalls || 0;
  const averageDurationSeconds = callTotalsRaw[0]?.averageDurationSeconds || 0;
  const conversionRate =
    totalCalls > 0 ? Math.round((vapiAiCount / totalCalls) * 1000) / 10 : 0;

  // Categories Breakdown
  const categoriesRaw: Array<{ category: string; count: number }> = await prisma.$queryRaw`
    SELECT
      COALESCE(category, 'Genel Bilgi') AS category,
      COUNT(*)::int AS count
    FROM call_logs
    WHERE clinic_id = ${clinicId}
      AND created_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND created_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
    ORDER BY 2 DESC
  `;

  const categories = categoriesRaw.map((c) => ({
    category: c.category,
    count: c.count,
    percentage: totalCalls > 0 ? Math.round((c.count / totalCalls) * 1000) / 10 : 0,
  }));

  // Ended Reasons Breakdown
  const endedReasonsRaw: Array<{ reason: string; count: number }> = await prisma.$queryRaw`
    SELECT
      COALESCE(ended_reason, 'Belirtilmedi') AS reason,
      COUNT(*)::int AS count
    FROM call_logs
    WHERE clinic_id = ${clinicId}
      AND created_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND created_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
    ORDER BY 2 DESC
  `;

  const endedReasons = endedReasonsRaw.map((r) => ({
    reason: r.reason,
    count: r.count,
    percentage: totalCalls > 0 ? Math.round((r.count / totalCalls) * 1000) / 10 : 0,
  }));

  // Hourly Calls Distribution
  const hourlyCallsRaw: Array<{ hour: number; count: number }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS hour,
      COUNT(*)::int AS count
    FROM call_logs
    WHERE clinic_id = ${clinicId}
      AND created_at >= ((${from}::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
      AND created_at < (((${to}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const hourlyCallsMap = new Map(hourlyCallsRaw.map((r) => [r.hour, r.count]));
  const hourlyDistribution = [];
  for (let h = 8; h <= 20; h++) {
    hourlyDistribution.push({
      hour: h,
      hourLabel: `${String(h).padStart(2, '0')}:00`,
      count: hourlyCallsMap.get(h) || 0,
    });
  }

  return {
    period: {
      from,
      to,
      timezone: tz,
      daysCount: diffDays,
    },
    appointments: {
      total: totalAppointments,
      scheduled,
      completed,
      cancelled,
      noShow,
      noShowRate,
      cancellationRate,
      channels: {
        vapiAi: vapiAiCount,
        panelManual: panelManualCount,
      },
      dailyTrend,
      doctors: doctorAnalytics,
      busiestDays,
      peakHours,
    },
    calls: {
      totalCalls,
      averageDurationSeconds,
      conversionRate,
      categories,
      endedReasons,
      hourlyDistribution,
    },
  };
}

/**
 * Platform-wide analytics overview for Admin dashboard (last 30 days comparison).
 */
export async function getAdminClinicsAnalyticsOverview() {
  const clinics = await prisma.clinic.findMany({
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      createdAt: true,
      timezone: true,
      _count: {
        select: {
          doctors: true,
          patients: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const overview = await Promise.all(
    clinics.map(async (c) => {
      const [apptStats, callStats] = await Promise.all([
        prisma.appointment.aggregate({
          where: {
            clinicId: c.id,
            startsAt: { gte: thirtyDaysAgo },
          },
          _count: {
            id: true,
          },
        }),
        prisma.callLog.aggregate({
          where: {
            clinicId: c.id,
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: {
            id: true,
          },
        }),
      ]);

      const completedCount = await prisma.appointment.count({
        where: {
          clinicId: c.id,
          startsAt: { gte: thirtyDaysAgo },
          status: 'COMPLETED',
        },
      });

      return {
        id: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        doctorsCount: c._count.doctors,
        patientsCount: c._count.patients,
        appointmentsCountLast30Days: apptStats._count.id,
        completedAppointmentsCountLast30Days: completedCount,
        callsCountLast30Days: callStats._count.id,
        createdAt: c.createdAt.toISOString(),
      };
    }),
  );

  return { clinics: overview };
}
