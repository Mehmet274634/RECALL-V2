# Recall — Design System

Bu belge, mevcut frontend uygulamasında kullanılan görsel tasarım ve stil kurallarını tanımlar. Ürün metinleri, pazarlama içeriği ve sayfa içeriği bu kapsamın dışındadır.

## Teknoloji ve Stil Katmanı

- React + TypeScript + Vite
- Tailwind CSS
- Framer Motion / `motion`
- `lucide-react` ikonları
- Radix UI tabanlı bileşen altyapısı
- Tema token’ları: `apps/frontend/src/index.css`
- Tailwind eşlemeleri: `apps/frontend/tailwind.config.js`

## Renk Sistemi

Uygulama HSL tabanlı CSS değişkenleri kullanır. Tailwind sınıfları bu token’lar üzerinden çalışır.

| Token | Değer | Kullanım |
|---|---|---|
| `background` | `0 0% 100%` | Ana beyaz arka plan |
| `foreground` | `220 25% 12%` | Ana metin, koyu lacivert-charcoal |
| `primary` | `218 68% 22%` | Marka rengi, sidebar, birincil butonlar |
| `primary-foreground` | `0 0% 100%` | Primary zemin üzerindeki metin ve ikonlar |
| `accent` | `34 72% 50%` | Amber vurgu, aktif aksiyonlar ve ikonlar |
| `accent-foreground` | `0 0% 100%` | Amber zemin üzerindeki metin |
| `surface` | `216 20% 96%` | Panel zemini, ikincil yüzeyler |
| `surface-dark` | `218 68% 22%` | Koyu yüzey eşlemesi |
| `muted` | `216 20% 96%` | Soluk arka planlar |
| `muted-foreground` | `220 12% 52%` | İkincil metinler |
| `border` | `216 18% 88%` | Kenarlıklar ve ayırıcılar |
| `card` | `0 0% 100%` | Kart zemini |
| `destructive` | `0 84% 60%` | Hata ve kritik durumlar |
| `ring` | `218 68% 22%` | Focus ring |

### Özel Renkler

- WhatsApp başlığı: `#075E54`
- WhatsApp konuşma zemini: `#ECE5DD`
- Hasta mesaj balonu: `#DCF8C6`
- Kritik eskalasyon rozeti: `red-500`
- Durum renkleri: amber, red, green ve blue tonları

## Tipografi

- Font ailesi: **Plus Jakarta Sans**
- Font kaynağı: Google Fonts
- Gövde varsayılan ağırlığı: `300`
- Başlık ağırlığı: `700`
- Vurgu başlıkları ve ana hero başlıkları: `800`
- Etiket ve buton ağırlığı: `500–600`
- Yardımcı metinler: `300–400`
- Genel metin yumuşatması: `-webkit-font-smoothing: antialiased`

### Tipografik Ölçek

- Büyük hero başlığı: `clamp(40px, 5vw, 68px)`, `1.1` satır yüksekliği
- Bölüm başlıkları: çoğunlukla `font-bold` / `font-extrabold`
- Normal metin: `text-sm`–`text-lg`
- Yardımcı metin: `text-xs`
- Küçük açıklamalar: `10px–11px`
- Etiket/badge: `10px`, `font-semibold`, `uppercase`, `letter-spacing: 0.12em`

## Geometrik Dil

- Temel radius token’ı: `0.5rem`
- Tailwind eşlemeleri:
  - `rounded-sm`: `calc(var(--radius) - 4px)`
  - `rounded-md`: `calc(var(--radius) - 2px)`
  - `rounded-lg`: `var(--radius)`
- Uygulamadaki yaygın radius’lar:
  - Form alanları ve küçük kontroller: `rounded-lg`
  - Butonlar: `rounded-lg` veya `rounded-xl`
  - Kartlar: `rounded-2xl`
  - Büyük görsel yüzeyler: `rounded-3xl`
  - Chip ve sayaçlar: `rounded-full`
  - Avatarlar: `rounded-full`

## Sayfa Zeminleri ve Yerleşim

### Genel Uygulama

- Ana gövde: beyaz arka plan ve koyu foreground metni
- Sekreter paneli: `bg-surface`
- Ana panel içeriği: sabit sidebar’dan sonra kalan esnek alan
- İçerik genişliği: `max-w-5xl`
- İçerik iç boşluğu: `p-8`

### Landing Sayfası

- Üst navigasyon: sabit (`fixed`), beyaz zemin, yüksek z-index
- Navigasyon yüksekliği: `h-16`
- İçerik genişliği: `max-w-6xl`
- Yatay iç boşluk: `px-6`
- Hero düzeni: masaüstünde `55fr / 45fr` iki kolon
- Hero kolon aralığı: `gap-12`
- Bölümler: geniş beyaz yüzeyler ve ihtiyaç halinde `surface` arka planları

### Sekreter Paneli

- Sidebar: sabit, solda, `w-60`, tam ekran yüksekliği
- Sidebar zemini: `bg-primary`
- Ana içerik sol ofseti: `ml-60`
- Sidebar katmanı: `z-30`
- İçerik kartları: beyaz zemin, ince border, hafif shadow

## Marka İşareti ve İkonografi

- İkon kütüphanesi: `lucide-react`
- İkon çizgileri ince ve arayüz metriklerine uyumludur
- Logo işareti:
  - Lacivert veya amber zeminli kare kapsayıcı
  - `rounded-lg` / `rounded-xl`
  - Beyaz `Stethoscope` ikonu
- İkon boyutları:
  - Navigasyon: `16px`
  - Küçük aksiyonlar: `14px–16px`
  - Marka işareti: `16px–20px`
- İkonlar metnin anlamını destekler; tek başına renk kodu olarak kullanılmaz.

## Bileşen Stilleri

### Butonlar

- Primary buton: lacivert zemin, beyaz metin, `font-semibold`
- Accent buton: amber zemin, beyaz metin
- Secondary/outline buton: lacivert border, lacivert metin
- Genel yükseklik ve boşluk: `py-2.5`, yatayda `px-4–6`
- Radius: `rounded-lg` veya `rounded-xl`
- Hover: zemin koyulaşması, border/metin rengi değişimi veya hafif shadow
- Geçiş: `transition-colors` veya `transition-all duration-200`
- Disabled: `opacity-60`

### Form Alanları

- Beyaz zemin
- `border-border`
- `rounded-lg`
- Küçük/orta metin ölçüsü
- Dikey padding: `py-2.5`
- Focus:
  - `focus:outline-none`
  - `focus:ring-2`
  - primary renkli düşük opaklıklı ring
  - primary border
- Şifre alanlarında sağda ikon tabanlı görünürlük kontrolü bulunur.

### Kartlar

- Beyaz zemin
- İnce `border-border`
- `rounded-2xl`
- Genellikle `shadow-sm`
- İç boşluklar içerik yoğunluğuna göre `p-4–8`
- Kart içi başlıklar foreground, açıklamalar muted-foreground kullanır.

### Badge, Chip ve Durum Etiketleri

- Küçük metin, yüksek kontrast ve kompakt padding
- Chip’ler: soluk surface zemini, border ve `rounded-full`
- Kritik rozet: kırmızı zemin, beyaz metin, `animate-pulse`
- Tanımlı durum yardımcı sınıfları:
  - `.badge-pending`: amber zemin/metin ve amber border
  - `.badge-escalated`: kırmızı zemin/metin ve kırmızı border
  - `.badge-completed`: yeşil zemin/metin ve yeşil border
  - `.badge-active`: mavi zemin/metin ve mavi border

### Navigasyon

- Sidebar navigasyon öğeleri: ikon + metin, `gap-3`
- Öğeler: `px-3 py-2.5`, `rounded-lg`
- Aktif durum: `bg-white/15 text-white`
- Pasif durum: `text-white/60`
- Hover: `text-white hover:bg-white/10`
- Sidebar ayırıcıları: `bg-white/10`

### Mesaj Balonları

- Maksimum genişlik: `%85`
- Sistem mesajı: beyaz zemin, sol üst köşe düzleştirilmiş
- Hasta mesajı: açık yeşil zemin, sağ üst köşe düzleştirilmiş
- Metin: küçük ölçü, `leading-relaxed`
- Zaman bilgisi: sağa hizalı, `10px`, muted ton
- Balonlar: küçük shadow ve `rounded-xl`

## Durum ve Geri Bildirim Renkleri

- Bekleyen: amber
- Kritik / eskalasyon: red
- Tamamlandı: green
- Aktif: blue
- Hata mesajı: `red-50` zemin, `red-200` border, `red-700` metin
- Uyarı kartları: amber’in düşük opaklıklı zemin ve border varyantları

## Hareket ve Geçişler

- Genel hover geçişleri: yaklaşık `0.2s ease`
- Landing giriş animasyonları: opacity + dikey translate
- Scroll görünürlük animasyonları: Framer Motion `useInView`
- Fade-up başlangıcı: yaklaşık `opacity: 0`, `translateY(28px)`
- Fade-up süresi: `0.55s`
- Amber kural animasyonu: yatay scale, `0.5s`, soldan sağa
- Mobil menü: opacity + yukarıdan aşağı kısa geçiş
- Accordion: `0.2s ease-out` yükseklik animasyonu
- Loading göstergesi: dönen border spinner
- Kritik eskalasyonlarda pulse animasyonu, ses ve masaüstü bildirimi ile desteklenir.

## Scrollbar

WebKit tabanlı tarayıcılarda özel scrollbar kullanılır:

- Genişlik: `6px`
- Track: `surface`
- Thumb: `border`
- Thumb radius: `3px`
- Hover thumb: `muted-foreground`

## Responsive Davranış

- Masaüstü navigasyon ve CTA’lar `md` breakpoint’inde görünür.
- Mobilde hamburger menü kullanılır.
- Mobil navigasyon beyaz, üstten açılan ve border ile ayrılan bir yüzeydir.
- Landing hero masaüstünde iki kolon, küçük ekranlarda tek kolondur.
- Hero görsel/mockup’ı küçük ekranlarda gizlenir.
- Landing içerikleri yatay `px-6` boşlukla korunur.
- Sekreter panelinin sidebar’ı mevcut yerleşimde sabit `w-60` olarak çalışır; ana içerik `ml-60` ile ayrılır.

## Tasarım Ayrımı

### Landing yüzeyi

- Pazarlama odaklı, daha geniş tipografik ölçek
- Daha görünür Framer Motion animasyonları
- Büyük hero görsel/mockup alanları
- Navbar, bölüm geçişleri, CTA ve responsive mobil menü

### Sekreter paneli

- İş odaklı, yoğunluğu kontrollü arayüz
- Sabit lacivert sidebar
- Daha küçük metin ölçekleri ve kompakt kontroller
- Durum renkleri, eskalasyon rozetleri ve bildirim geri bildirimleri
- Animasyonlar işlevsel seviyede tutulur; toast/fade/pulse gibi kısa geri bildirimler kullanılır.

## Kaynak Dosyalar

- `apps/frontend/src/index.css`
- `apps/frontend/tailwind.config.js`
- `apps/frontend/src/pages/landing/LandingPage.tsx`
- `apps/frontend/src/pages/LoginPage.tsx`
- `apps/frontend/src/components/layout/SecretaryLayout.tsx`
