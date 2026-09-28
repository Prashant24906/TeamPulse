import Link from 'next/link';
import {
  Users, FolderKanban, MessageSquare, Zap,
  CheckCircle2, ArrowRight, Shield, Globe, Bell,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import HeroCTA from '@/components/HeroCTA';

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="pt-32 pb-20 px-6 text-center bg-gradient-to-b from-emerald-50/40 via-gray-100 to-gray-100">
      <div className="max-w-4xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
          <Zap size={12} className="fill-emerald-600" />
          Real-time collaboration, reimagined
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
          The platform your team{' '}
          <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            actually wants
          </span>{' '}
          to use
        </h1>

        {/* Sub */}
        <p className="text-xl text-gray-500 leading-relaxed mb-10 max-w-2xl mx-auto">
          TeamPulse brings teams together with real-time chat, kanban project boards, task management, 
          and smart join requests — all in one beautiful platform.
        </p>

        {/* CTA row */}
        <HeroCTA />
      </div>

      {/* Dashboard Preview */}
      <div className="max-w-5xl mx-auto mt-16 relative">
        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-2xl shadow-gray-200/60">
          {/* Fake browser bar */}
          <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <div className="h-3 w-3 rounded-full bg-emerald-400" />
            <div className="flex-1 mx-4 bg-white border border-gray-200 rounded-md px-3 py-1 text-xs text-gray-400 text-center">
              app.teampulse.io/dashboard
            </div>
          </div>
          {/* Fake dashboard */}
          <div className="bg-gray-50 p-6 grid grid-cols-4 gap-4 min-h-[300px]">
            {/* Sidebar mockup */}
            <div className="col-span-1 bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
              <div className="text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent mb-4">TeamPulse</div>
              {['Dashboard', 'Teams', 'Projects', 'Settings'].map((item, i) => (
                <div key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${i === 0 ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-500'}`}>
                  <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  {item}
                </div>
              ))}
            </div>
            {/* Content mockup */}
            <div className="col-span-3 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-7 w-24 bg-emerald-100 rounded-lg" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'Backend API', role: 'OWNER', members: 5 },
                  { name: 'Design Team', role: 'MEMBER', members: 3 },
                  { name: 'DevOps', role: 'ADMIN', members: 4 },
                ].map((team) => (
                  <div key={team.name} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <div className="h-8 w-8 bg-emerald-50 rounded-lg mb-2 flex items-center justify-center">
                      <div className="h-3 w-3 bg-emerald-400 rounded" />
                    </div>
                    <div className="text-xs font-semibold text-gray-800">{team.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{team.members} members</div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                      team.role === 'OWNER' ? 'bg-amber-50 text-amber-600' :
                      team.role === 'ADMIN' ? 'bg-sky-50 text-sky-600' : 'bg-gray-100 text-gray-500'
                    }`}>{team.role}</span>
                  </div>
                ))}
              </div>
              {/* Kanban preview */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {['To Do', 'In Progress', 'Done'].map((col, ci) => (
                  <div key={col} className={`rounded-lg p-2 border ${ci === 0 ? 'border-gray-200 bg-gray-50' : ci === 1 ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'}`}>
                    <div className={`text-[9px] font-bold mb-1.5 ${ci === 0 ? 'text-gray-500' : ci === 1 ? 'text-amber-600' : 'text-emerald-600'}`}>{col}</div>
                    {[1, 2].map((t) => (
                      <div key={t} className="bg-white rounded-md p-1.5 mb-1 border border-gray-100 shadow-sm">
                        <div className="h-1.5 w-full bg-gray-200 rounded mb-1" />
                        <div className="h-1.5 w-2/3 bg-gray-100 rounded" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Glow */}
        <div className="absolute -inset-4 bg-gradient-to-r from-emerald-200/30 to-teal-200/30 rounded-3xl blur-2xl -z-10" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function Stats() {
  const stats = [
    { value: '10,000+', label: 'Active teams' },
    { value: '500K+',   label: 'Tasks completed' },
    { value: '2M+',     label: 'Messages sent' },
    { value: '99.9%',   label: 'Uptime SLA' },
  ];
  return (
    <section className="border-y border-gray-100 bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {stats.map(({ value, label }) => (
          <div key={label}>
            <div className="text-3xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">{value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: Users,
    color: 'bg-emerald-50 text-emerald-600',
    title: 'Team Management',
    description:
      'Create teams, invite members with granular roles (Owner, Admin, Member), and manage join requests — all from one place.',
  },
  {
    icon: FolderKanban,
    color: 'bg-teal-50 text-teal-600',
    title: 'Kanban Project Boards',
    description:
      'Organise work visually with drag-ready kanban boards. Create projects inside teams and move tasks across Todo, In Progress, and Done.',
  },
  {
    icon: MessageSquare,
    color: 'bg-sky-50 text-sky-600',
    title: 'Persistent Team Chat',
    description:
      'Built-in real-time chat for every team. Messages are stored forever — scroll back through history and never lose context again.',
  },
  {
    icon: Zap,
    color: 'bg-amber-50 text-amber-600',
    title: 'Real-Time Everything',
    description:
      'Powered by Socket.IO — see task updates, new messages, and team changes the moment they happen, without a single page reload.',
  },
  {
    icon: Bell,
    color: 'bg-rose-50 text-rose-600',
    title: 'Join Request Workflow',
    description:
      'Users can discover and request to join any team. Admins review and approve or reject requests in a dedicated inbox.',
  },
  {
    icon: Shield,
    color: 'bg-violet-50 text-violet-600',
    title: 'Role-Based Security',
    description:
      'Every API and WebSocket event is protected by JWT + role middleware. Only authorised members can read, write, or manage.',
  },
];

function Features() {
  return (
    <section id="features" className="py-24 px-6 bg-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-gray-900 mb-4">
            Everything your team needs
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            No juggling between apps. TeamPulse combines project management, 
            real-time chat and team discovery in one cohesive workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, color, title, description }) => (
            <div
              key={title}
              className="bg-white border border-gray-100 rounded-2xl p-7 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className={`h-11 w-11 rounded-xl ${color} flex items-center justify-center mb-5`}>
                <Icon size={20} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    step: '01',
    title: 'Create your team',
    desc: 'Sign up and create a team in seconds. Set a name, choose a max size, and invite your colleagues — or let them find you via team discovery.',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    step: '02',
    title: 'Build your projects',
    desc: 'Add projects to your team. Break each project into tasks with priority levels, due dates, and assignees. Visualise progress on the kanban board.',
    color: 'text-teal-600 bg-teal-50 border-teal-200',
  },
  {
    step: '03',
    title: 'Collaborate in real time',
    desc: 'Chat with your team inside TeamPulse. Get live updates as tasks move, members join, and work gets done — no refresh needed.',
    color: 'text-sky-600 bg-sky-50 border-sky-200',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-gray-900 mb-4">How it works</h2>
          <p className="text-lg text-gray-500">Get up and running in three simple steps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map(({ step, title, desc, color }) => (
            <div key={step} className="relative">
              <div className={`inline-flex items-center justify-center h-12 w-12 rounded-2xl border text-lg font-extrabold ${color} mb-5`}>
                {step}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why us
// ---------------------------------------------------------------------------

const WHY = [
  { icon: Globe,          text: 'Works from any browser, any device' },
  { icon: Zap,            text: 'Sub-100ms real-time updates via Socket.IO' },
  { icon: Shield,         text: 'JWT authentication with HttpOnly cookies' },
  { icon: CheckCircle2,   text: 'PostgreSQL-backed — your data never disappears' },
];

function WhyUs() {
  return (
    <section id="why-us" className="py-24 px-6 bg-gray-100">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-4xl font-extrabold text-gray-900 mb-5">
            Built for speed,<br />designed for teams
          </h2>
          <p className="text-gray-500 text-lg leading-relaxed mb-8">
            TeamPulse is engineered with a modern full-stack architecture — Next.js on the frontend, 
            Express + TypeScript on the backend, and PostgreSQL as the single source of truth. 
            Every interaction is instant.
          </p>
          <ul className="space-y-4">
            {WHY.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-gray-600">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-emerald-600" />
                </div>
                <span className="text-sm font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: checklist card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-lg shadow-gray-100">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-5">What&apos;s included</h3>
          <ul className="space-y-4">
            {[
              'Unlimited teams & projects',
              'Persistent team chat with history',
              'Kanban task boards',
              'Role-based access control',
              'Team discovery & join requests',
              'Real-time WebSocket events',
              'JWT auth with refresh tokens',
              'Background job processing (BullMQ)',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <span className="text-gray-700 text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA Banner
// ---------------------------------------------------------------------------

function CTABanner() {
  return (
    <section className="py-20 px-6 bg-gray-100">
      <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-emerald-600 to-teal-500 rounded-3xl p-14 shadow-2xl shadow-emerald-200">
        <h2 className="text-4xl font-extrabold text-white mb-4">
          Ready to bring your team together?
        </h2>
        <p className="text-emerald-100 text-lg mb-8">
          Create your workspace in less than 60 seconds. No credit card required.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-8 py-4 rounded-xl hover:bg-emerald-50 transition-colors shadow-lg"
        >
          Get started for free <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-100 py-10 px-6 text-center text-sm text-gray-400">
      <span className="font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent mr-2">
        TeamPulse
      </span>
      © {new Date().getFullYear()} · Built with Next.js, Express, PostgreSQL & Socket.IO
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <WhyUs />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
