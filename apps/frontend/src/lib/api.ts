/**
 * RECALL API Client
 * Talks to apps/backend REST endpoints.
 */

import { getUserRole } from './auth';
import { captureFrontendException } from './sentry';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

async function getAuthHeader(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  try {
    // Only send mock role header during local development/testing; never in production
    if (import.meta.env.DEV) {
      const role = getUserRole();
      headers['x-mock-role'] = role;
    }

    const clerk = (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }).Clerk;
    if (clerk?.session) {
      const token = await clerk.session.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {
    // Ignore in dev
  }
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...options.headers,
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP Error: ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) errorMsg = data.error;
      } catch {
        // ignore
      }

      const apiError = new ApiError(errorMsg, res.status);

      // Report 5xx server errors to Sentry
      if (res.status >= 500) {
        captureFrontendException(apiError, {
          endpoint,
          status: res.status,
          method: options.method || 'GET',
        });
      }

      throw apiError;
    }

    return res.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network errors (Failed to fetch, connectivity failures, etc.)
    captureFrontendException(error, {
      endpoint,
      method: options.method || 'GET',
      type: 'NetworkError',
    });

    throw error;
  }
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string | null;
  workingHours?: Record<string, unknown>;
  todayAppointmentsCount?: number;
}

export interface Patient {
  id: string;
  fullName: string;
  phoneNumber: string;
}

export interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  createdViaCallId?: string | null;
  doctor: {
    id: string;
    name: string;
    specialty: string | null;
  };
  patient: {
    id: string;
    fullName: string;
    phoneNumber: string;
  };
}

export interface CallLog {
  id: string;
  vapiCallId: string;
  transcript: string | null;
  recordingUrl: string | null;
  summary: string | null;
  endedReason: string | null;
  createdAt: string;
  appointments?: Array<{
    id: string;
    startsAt: string;
    status: string;
    doctor: { name: string };
    patient: { fullName: string };
  }>;
}

export interface DashboardStats {
  todayAppointments: number;
  todayCompleted: number;
  todayCalls: number;
  totalPatients: number;
}

export interface ClinicDetails {
  id: string;
  name: string;
  phoneNumber: string;
  timezone: string;
  greetingMessage?: string | null;
  specialInstructions?: string | null;
  cancellationPolicyHours: number;
  voiceId?: string | null;
  createdAt: string;
  counts: {
    doctors: number;
    patients: number;
    appointments: number;
    callLogs: number;
  };
}

export const api = {
  getStats: () => request<{ stats: DashboardStats }>('/api/stats/dashboard'),

  getClinic: () => request<{ clinic: ClinicDetails }>('/api/clinic/current'),

  getAppointments: (params?: { doctorId?: string; date?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.doctorId) query.set('doctorId', params.doctorId);
    if (params?.date) query.set('date', params.date);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return request<{ appointments: Appointment[] }>(`/api/appointments${qs ? `?${qs}` : ''}`);
  },

  createAppointment: (data: {
    patientName: string;
    patientPhone: string;
    doctorId: string;
    startsAt: string;
    durationMinutes?: number;
  }) =>
    request<{ appointment: Appointment }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAppointment: (
    id: string,
    data: {
      status?: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
      startsAt?: string;
      endsAt?: string;
      durationMinutes?: number;
      doctorId?: string;
    },
  ) =>
    request<{ appointment: Appointment }>(`/api/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getCallLogs: (params?: { limit?: number; date?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.date) query.set('date', params.date);
    const qs = query.toString();
    return request<{ callLogs: CallLog[] }>(`/api/call-logs${qs ? `?${qs}` : ''}`);
  },

  getDoctors: () => request<{ doctors: Doctor[] }>('/api/doctors'),

  // --- Admin API ---
  getAdminClinics: () => request<{ clinics: AdminClinicItem[] }>('/api/admin/clinics'),

  createAdminClinic: (data: AdminCreateClinicInput) =>
    request<{ clinic: AdminClinicItem }>('/api/admin/clinics', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  addDoctorToClinic: (clinicId: string, data: AdminDoctorInput) =>
    request<{ doctor: Doctor }>(`/api/admin/clinics/${clinicId}/doctors`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  inviteSecretary: (clinicId: string, email: string) =>
    request<{
      success: boolean;
      message: string;
      invitation: { id: string; emailAddress: string; status: string };
    }>(`/api/admin/clinics/${clinicId}/invite-secretary`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  // Analytics endpoints
  getAnalyticsSummary: (params?: { from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.append('from', params.from);
    if (params?.to) searchParams.append('to', params.to);
    const queryString = searchParams.toString();
    return request<AnalyticsSummary>(`/api/analytics/summary${queryString ? `?${queryString}` : ''}`);
  },

  getAdminClinicsAnalytics: () =>
    request<AdminClinicsAnalyticsOverview>('/api/admin/analytics/clinics-overview'),
};

export interface AdminDoctorInput {
  name: string;
  specialty: string;
  startHour?: string;
  endHour?: string;
  days?: string[];
  complaints?: string;
}

export interface AdminCreateClinicInput {
  name: string;
  phoneNumber?: string;
  greetingMessage?: string;
  cancellationPolicyHours?: number;
  specialInstructions?: string;
  voiceId?: string;
  doctors?: AdminDoctorInput[];
}

export interface AdminClinicItem {
  id: string;
  name: string;
  phoneNumber: string;
  timezone: string;
  greetingMessage?: string | null;
  specialInstructions?: string | null;
  cancellationPolicyHours: number;
  voiceId?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    doctors: number;
    patients: number;
    appointments: number;
    callLogs: number;
  };
  doctors: Array<{
    id: string;
    name: string;
    specialty: string | null;
    workingHours: unknown;
  }>;
}

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
    noShowRate: number;
    cancellationRate: number;
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
      occupancyRate: number;
    }>;
    busiestDays: Array<{
      dayOfWeek: number;
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
    conversionRate: number;
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

export interface AdminClinicsAnalyticsOverview {
  clinics: Array<{
    id: string;
    name: string;
    phoneNumber: string;
    doctorsCount: number;
    patientsCount: number;
    appointmentsCountLast30Days: number;
    completedAppointmentsCountLast30Days: number;
    callsCountLast30Days: number;
    createdAt: string;
  }>;
}

