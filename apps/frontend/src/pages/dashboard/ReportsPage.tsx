import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  UserX,
  PhoneCall,
  CalendarCheck2,
  Clock,
  UserCheck,
  Building2,
  Filter,
  Activity,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { api, ApiError, type AnalyticsSummary } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: '#3b82f6', // blue
  COMPLETED: '#10b981', // green
  NO_SHOW: '#f59e0b',   // amber
  CANCELLED: '#ef4444', // red
};

const CHANNEL_COLORS = {
  vapiAi: '#8b5cf6',      // purple
  panelManual: '#0284c7', // sky
};

const PIE_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

export default function ReportsPage() {
  const [selectedRange, setSelectedRange] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate default dates
  const calculateDates = useCallback(() => {
    const today = new Date();
    const toStr = today.toISOString().split('T')[0];

    if (selectedRange === 'custom') {
      return {
        from: customFrom || toStr,
        to: customTo || toStr,
      };
    }

    const days = parseInt(selectedRange, 10);
    const fromDate = new Date();
    fromDate.setDate(today.getDate() - days);
    const fromStr = fromDate.toISOString().split('T')[0];

    return { from: fromStr, to: toStr };
  }, [selectedRange, customFrom, customTo]);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const { from, to } = calculateDates();

    try {
      const summary = await api.getAnalyticsSummary({ from, to });
      setData(summary);
    } catch (err: unknown) {
      console.error('[reports] Error fetching analytics:', err);
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError('Klinik yetkilendirmesi bulunamadı veya oturumunuz bu veriye erişim için yetkili değil.');
        } else {
          setError(err.message || 'Analitik verileri yüklenirken bir hata oluştu.');
        }
      } else {
        setError('Sunucu bağlantısı sağlanamadı. Lütfen daha sonra tekrar deneyin.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [calculateDates]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRangeChange = (range: '7' | '30' | '90' | 'custom') => {
    setSelectedRange(range);
    if (range !== 'custom') {
      // Dates update automatically via calculateDates
    }
  };

  const handleCustomApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (customFrom && customTo) {
      fetchAnalytics();
    }
  };

  const statusDonutData = data
    ? [
        { name: 'Planlandı', value: data.appointments.scheduled, color: STATUS_COLORS.SCHEDULED },
        { name: 'Tamamlandı', value: data.appointments.completed, color: STATUS_COLORS.COMPLETED },
        { name: 'Gelmedi (No-Show)', value: data.appointments.noShow, color: STATUS_COLORS.NO_SHOW },
        { name: 'İptal Edildi', value: data.appointments.cancelled, color: STATUS_COLORS.CANCELLED },
      ].filter((item) => item.value > 0)
    : [];

  const channelDonutData = data
    ? [
        { name: 'Vapi AI Sesli Asistan', value: data.appointments.channels.vapiAi, color: CHANNEL_COLORS.vapiAi },
        { name: 'Panel Manuel', value: data.appointments.channels.panelManual, color: CHANNEL_COLORS.panelManual },
      ].filter((item) => item.value > 0)
    : [];

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Klinik Raporları & Analitik</h1>
            {data?.period?.timezone && (
              <span className="text-xs bg-surface px-2.5 py-0.5 rounded-full border border-border text-muted-foreground font-mono">
                {data.period.timezone}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Randevu akışları, no-show analizleri, doluluk oranları ve yapay zeka çağrı performansı
          </p>
        </div>

        {/* Date Filter Quick Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-surface p-1 rounded-xl border border-border flex items-center gap-1 text-xs font-medium">
            <button
              onClick={() => handleRangeChange('7')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedRange === '7'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Son 7 Gün
            </button>
            <button
              onClick={() => handleRangeChange('30')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedRange === '30'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Son 30 Gün
            </button>
            <button
              onClick={() => handleRangeChange('90')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedRange === '90'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Son 90 Gün
            </button>
            <button
              onClick={() => handleRangeChange('custom')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedRange === 'custom'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Özel Aralık
            </button>
          </div>

          <button
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 bg-surface hover:bg-border/60 text-foreground px-3.5 py-2 rounded-xl text-xs font-medium border border-border transition-colors duration-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker Accordion */}
      {selectedRange === 'custom' && (
        <form
          onSubmit={handleCustomApply}
          className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4 text-xs"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground">Özel Tarih Aralığı:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Başlangıç:</label>
            <input
              type="date"
              required
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-background border border-border rounded-lg px-2.5 py-1 text-foreground"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Bitiş:</label>
            <input
              type="date"
              required
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-background border border-border rounded-lg px-2.5 py-1 text-foreground"
            />
          </div>

          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            Uygula
          </button>
        </form>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-4 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Rapor Verisi Alınamadı</p>
            <p className="mt-0.5 text-xs opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* KPI Cards (4 Top Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Appointments */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Toplam Randevu
            </p>
            <h3 className="text-2xl font-bold text-foreground mt-1">
              {loading ? '...' : (data?.appointments.total ?? 0)}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-green-600 font-medium">
                {data?.appointments.completed ?? 0}
              </span>{' '}
              tamamlandı
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
            <CalendarCheck2 className="w-6 h-6" />
          </div>
        </div>

        {/* No-Show Rate */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              No-Show Oranı
            </p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">
              {loading ? '...' : `%${(data?.appointments.noShowRate ?? 0).toFixed(1)}`}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.appointments.noShow ?? 0} randevuya gelinmedi
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <UserX className="w-6 h-6" />
          </div>
        </div>

        {/* Cancellation Rate */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              İptal Oranı
            </p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">
              {loading ? '...' : `%${(data?.appointments.cancellationRate ?? 0).toFixed(1)}`}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.appointments.cancelled ?? 0} randevu iptal edildi
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Call to Appointment Conversion */}
        <div className="bg-card p-5 rounded-2xl border border-border flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Çağrı Randevu Dönüşümü
            </p>
            <h3 className="text-2xl font-bold text-purple-600 mt-1">
              {loading ? '...' : `%${(data?.calls.conversionRate ?? 0).toFixed(1)}`}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.appointments.channels.vapiAi ?? 0} AI randevusu / {data?.calls.totalCalls ?? 0} çağrı
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
            <PhoneCall className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Charts Row 1: Daily Trend & Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Area Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Günlük Randevu Trendi</h2>
              <p className="text-xs text-muted-foreground">
                Seçilen aralıktaki günlük toplam, tamamlanan ve iptal randevu seyrini gösterir
              </p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="h-72 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Grafik yükleniyor...
              </div>
            ) : !data || data.appointments.dailyTrend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-1">
                <Calendar className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <span>Bu tarih aralığında randevu verisi bulunamadı.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.appointments.dailyTrend}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 18% 88% / 0.5)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                    tickFormatter={(val) => {
                      const parts = val.split('-');
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : val;
                    }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(0 0% 100%)',
                      borderColor: 'hsl(216 18% 88%)',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Toplam Randevu"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Tamamlanan"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCompleted)"
                  />
                  <Area
                    type="monotone"
                    dataKey="noShow"
                    name="Gelmedi"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    fill="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="cancelled"
                    name="İptal"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status Distribution Pie Chart (1 Col) */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Durum Dağılımı</h2>
              <p className="text-xs text-muted-foreground">Tüm randevuların nihai durumları</p>
            </div>
            <Filter className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="h-72 w-full flex flex-col items-center justify-center">
            {loading ? (
              <span className="text-muted-foreground text-xs">Yükleniyor...</span>
            ) : statusDonutData.length === 0 ? (
              <span className="text-muted-foreground text-xs">Kayıtlı randevu bulunamadı.</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDonutData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusDonutData.map((entry, index) => (
                      <Cell key={`status-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Doctor Occupancy & Channel Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctor Occupancy Rate & Volume Bar Chart (2 cols) */}
        <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Doktor Doluluk Oranları & Randevu Hacmi</h2>
              <p className="text-xs text-muted-foreground">
                Doktor çalışma saatlerindeki toplam müsait slotlara göre doluluk (%) ve randevu sayısı
              </p>
            </div>
            <UserCheck className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="h-72 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Yükleniyor...
              </div>
            ) : !data || data.appointments.doctors.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Doktor randevu verisi bulunamadı.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.appointments.doctors}
                  margin={{ top: 10, right: 20, left: -20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 18% 88% / 0.5)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                    label={{ value: 'Randevu', angle: -90, position: 'insideLeft', fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                    tickFormatter={(v) => `%${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => {
                      if (name === 'Doluluk Oranı') return [`%${Number(value).toFixed(1)}`, name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="totalAppointments"
                    name="Toplam Randevu"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="completed"
                    name="Tamamlanan"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="occupancyRate"
                    name="Doluluk Oranı"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Channel Breakdown Donut (1 col) */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Kanal Dağılımı</h2>
              <p className="text-xs text-muted-foreground">Vapi AI Asistan vs Sekreter Manuel</p>
            </div>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="h-72 w-full flex flex-col items-center justify-center">
            {loading ? (
              <span className="text-muted-foreground text-xs">Yükleniyor...</span>
            ) : channelDonutData.length === 0 ? (
              <span className="text-muted-foreground text-xs">Kanal verisi bulunamadı.</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelDonutData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {channelDonutData.map((entry, index) => (
                      <Cell key={`channel-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Peak Hours & Peak Days */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peak Hours Distribution */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">En Yoğun Randevu Saatleri</h2>
              <p className="text-xs text-muted-foreground">Kliniğin gün içi randevu yoğunluğu (08:00 - 20:00)</p>
            </div>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="h-64 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Yükleniyor...
              </div>
            ) : !data || data.appointments.peakHours.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Saatlik veri bulunamadı.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.appointments.peakHours}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 18% 88% / 0.5)" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 10, fill: 'hsl(220 12% 52%)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Randevu Sayısı"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Peak Days of Week */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Haftanın En Yoğun Günleri</h2>
              <p className="text-xs text-muted-foreground">Haftalık günlere göre randevu dağılımı</p>
            </div>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="h-64 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Yükleniyor...
              </div>
            ) : !data || data.appointments.busiestDays.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Günlük veri bulunamadı.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.appointments.busiestDays}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 18% 88% / 0.5)" vertical={false} />
                  <XAxis
                    dataKey="dayName"
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Randevu Sayısı"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Call Metrics Deep Dive */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-primary" />
              Yapay Zeka Çağrı Metrikleri Detayı
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vapi sesli asistan arama süreleri, arama sebepleri ve saatlik çağrı trafiği
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="bg-surface px-3 py-1.5 rounded-xl border border-border">
              <span className="text-muted-foreground">Toplam Çağrı: </span>
              <span className="font-bold text-foreground">{data?.calls.totalCalls ?? 0}</span>
            </div>
            <div className="bg-surface px-3 py-1.5 rounded-xl border border-border">
              <span className="text-muted-foreground">Ortalama Süre: </span>
              <span className="font-bold text-foreground">
                {Math.floor((data?.calls.averageDurationSeconds ?? 0) / 60)} dk{' '}
                {(data?.calls.averageDurationSeconds ?? 0) % 60} sn
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Call Hourly Distribution (2 cols) */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Klinik Ne Zaman En Çok Aranıyor? (Saatlik Çağrı Dağılımı)
            </h3>
            <div className="h-56 w-full">
              {loading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                  Yükleniyor...
                </div>
              ) : !data || data.calls.hourlyDistribution.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                  Çağrı kaydı bulunamadı.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.calls.hourlyDistribution}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 18% 88% / 0.5)" vertical={false} />
                    <XAxis
                      dataKey="hourLabel"
                      tick={{ fontSize: 10, fill: 'hsl(220 12% 52%)' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(220 12% 52%)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        borderColor: '#e2e8f0',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Gelen Çağrı"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Call Categories Breakdown */}
          <div className="flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Arama Nedenleri (Kategori Dağılımı)
              </h3>
              {loading ? (
                <span className="text-xs text-muted-foreground">Yükleniyor...</span>
              ) : !data || data.calls.categories.length === 0 ? (
                <span className="text-xs text-muted-foreground">Veri yok</span>
              ) : (
                <div className="space-y-2 mt-3">
                  {data.calls.categories.map((cat, i) => (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">{cat.category}</span>
                        <span className="text-muted-foreground">
                          {cat.count} (%{cat.percentage.toFixed(0)})
                        </span>
                      </div>
                      <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-border/40">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${cat.percentage}%`,
                            backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ended Reasons */}
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Çağrı Sonlanma Durumları
              </h3>
              {loading ? (
                <span className="text-xs text-muted-foreground">Yükleniyor...</span>
              ) : !data || data.calls.endedReasons.length === 0 ? (
                <span className="text-xs text-muted-foreground">Veri yok</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.calls.endedReasons.map((er) => (
                    <span
                      key={er.reason}
                      className="text-xs bg-surface border border-border px-2.5 py-1 rounded-lg text-foreground font-mono"
                    >
                      {er.reason}: <strong>{er.count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
