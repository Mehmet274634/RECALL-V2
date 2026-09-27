import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Stethoscope,
  Phone,
  Calendar,
  Clock,
  Shield,
  BarChart3,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Design System tokens are applied via Tailwind classes referencing  */
/*  CSS variables from index.css — no ad-hoc color values.            */
/* ------------------------------------------------------------------ */

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---- Navbar ---- */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">RECALL</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
              Özellikler
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
              Nasıl Çalışır
            </a>
            <a href="#contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
              İletişim
            </a>
            <Link
              to="/login"
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-all duration-200"
            >
              Giriş Yap
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menüyü aç/kapat"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-background border-b border-border px-6 py-4 flex flex-col gap-4"
          >
            <a href="#features" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              Özellikler
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              Nasıl Çalışır
            </a>
            <a href="#contact" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              İletişim
            </a>
            <Link
              to="/login"
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-semibold text-sm text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Giriş Yap
            </Link>
          </motion.div>
        )}
      </nav>

      {/* ---- Hero Section ---- */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-[55fr_45fr] gap-12 items-center">
          <FadeUp>
            <div>
              <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-[0.12em] mb-6">
                <Phone className="w-3.5 h-3.5" />
                Yapay Zeka Destekli
              </div>
              <h1
                className="font-extrabold text-foreground leading-[1.1] mb-6"
                style={{ fontSize: 'clamp(40px, 5vw, 68px)' }}
              >
                Kliniğinizin{' '}
                <span className="text-primary">Telefon Asistanı</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                RECALL, hastalarınızın aramalarını yapay zeka ile karşılar. Randevu alma, iptal ve
                değişiklik işlemlerini 7/24 otomatik olarak yönetir.
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="#contact"
                  className="bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all duration-200 flex items-center gap-2"
                >
                  Demo Talep Et
                  <ChevronRight className="w-4 h-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="border border-primary text-primary px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                >
                  Nasıl Çalışır?
                </a>
              </div>
            </div>
          </FadeUp>

          {/* Hero visual placeholder — hidden on mobile per Design System */}
          <FadeUp delay={0.15}>
            <div className="hidden md:flex items-center justify-center">
              <div className="w-full max-w-sm bg-surface rounded-3xl p-8 border border-border shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">RECALL Asistan</div>
                    <div className="text-xs text-muted-foreground">Aktif • 7/24</div>
                  </div>
                </div>
                {/* Mock conversation */}
                <div className="space-y-3">
                  <div className="bg-background rounded-xl rounded-tl-none p-3 text-sm text-foreground shadow-sm max-w-[85%]">
                    Merhaba, Dr. Yılmaz için randevu almak istiyorum.
                  </div>
                  <div className="bg-[#DCF8C6] rounded-xl rounded-tr-none p-3 text-sm text-foreground shadow-sm max-w-[85%] ml-auto">
                    Tabii! 15 Ekim Pazartesi, saat 10:00 müsait. Uygun mu?
                  </div>
                  <div className="bg-background rounded-xl rounded-tl-none p-3 text-sm text-foreground shadow-sm max-w-[85%]">
                    Evet, harika. Onaylayalım.
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ---- Amber Rule Line ---- */}
      <motion.div
        className="h-1 bg-accent mx-auto max-w-6xl rounded-full"
        initial={{ scaleX: 0, originX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      />

      {/* ---- Features Section ---- */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Neden RECALL?
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Kliniğinizin telefon trafiğini akıllı bir şekilde yönetin, personel yükünü azaltın.
              </p>
            </div>
          </FadeUp>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Phone,
                title: '7/24 Telefon Karşılama',
                desc: 'Mesai saatleri dışında bile hastalarınızın aramaları yanıtsız kalmaz.',
              },
              {
                icon: Calendar,
                title: 'Otomatik Randevu Yönetimi',
                desc: 'Randevu alma, iptal ve değiştirme işlemleri tamamen otomatik.',
              },
              {
                icon: Clock,
                title: 'Zaman Tasarrufu',
                desc: 'Personelin telefon başında harcadığı süreyi %80\'e kadar azaltın.',
              },
              {
                icon: Shield,
                title: 'Güvenli ve Uyumlu',
                desc: 'Hasta verileri şifreli olarak saklanır, KVKK uyumlu altyapı.',
              },
              {
                icon: BarChart3,
                title: 'Detaylı Raporlar',
                desc: 'Arama istatistikleri, randevu dönüşüm oranları ve daha fazlası.',
              },
              {
                icon: Stethoscope,
                title: 'Çoklu Doktor Desteği',
                desc: 'Her doktorun müsaitlik takvimini ayrı ayrı yönetin.',
              },
            ].map((feature, i) => (
              <FadeUp key={feature.title} delay={i * 0.1}>
                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How It Works ---- */}
      <section id="how-it-works" className="py-20 px-6 bg-surface">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Nasıl Çalışır?
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Üç adımda kliniğinizi RECALL ile donatın.
              </p>
            </div>
          </FadeUp>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Kliniğinizi Tanımlayın',
                desc: 'Doktorlar, çalışma saatleri ve randevu sürelerini sisteme girin.',
              },
              {
                step: '02',
                title: 'Telefon Hattını Bağlayın',
                desc: 'Mevcut klinik numaranızı veya yeni bir numara alarak bağlayın.',
              },
              {
                step: '03',
                title: 'Asistan Çalışsın',
                desc: 'RECALL aramalarınızı karşılar, randevuları yönetir, siz panelden takip edin.',
              },
            ].map((item, i) => (
              <FadeUp key={item.step} delay={i * 0.12}>
                <div className="text-center">
                  <div className="text-5xl font-extrabold text-accent/20 mb-4">{item.step}</div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA Section ---- */}
      <section id="contact" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <div className="bg-primary rounded-3xl p-12 md:p-16 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                Kliniğinizi Geleceğe Taşıyın
              </h2>
              <p className="text-primary-foreground/70 max-w-lg mx-auto mb-8">
                RECALL ile randevu yönetimini otomatikleştirin. Demo hesabınızı hemen oluşturun.
              </p>
              <a
                href="mailto:info@recall.health"
                className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-8 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-all duration-200"
              >
                Bize Ulaşın
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold text-foreground">RECALL</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} RECALL. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  );
}
