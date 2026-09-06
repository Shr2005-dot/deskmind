"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AppLogo } from "@/components/branding/AppLogo";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#use-cases", label: "Use Cases" },
];

const FEATURES = [
  {
    title: "AI Customer Support",
    description:
      "Answer customer questions instantly with an AI assistant trained on your business knowledge.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: "PDF Knowledge",
    description:
      "Upload PDFs, manuals, and documents. DeskMind extracts and indexes the content for accurate answers.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Website Knowledge",
    description:
      "Add website URLs and DeskMind automatically ingests pages, blogs, and help centers into your knowledge base.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
      </svg>
    ),
  },
  {
    title: "Hybrid RAG Search",
    description:
      "Combines vector similarity and keyword search to find the most relevant information for every question.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    title: "Grounded Answers",
    description:
      "Answers are generated only from your knowledge base, reducing hallucinations and improving trust.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: "Source Citations",
    description:
      "Show visitors where answers come from, building transparency and trust in every response.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    title: "I Don't Know Refusal",
    description:
      "When the answer isn't in your knowledge base, the bot honestly says so instead of guessing.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Conversation-Aware Chat",
    description:
      "Understands follow-up questions and remembers context across the conversation for natural dialogue.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
  },
  {
    title: "Lead Capture",
    description:
      "Automatically collect visitor emails when they show interest, turning conversations into opportunities.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    title: "Analytics",
    description:
      "Understand what your customers are asking with conversation analytics and top questions.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: "Embeddable Widget",
    description:
      "Add the chatbot to any website with a simple embed code. Works on any site with full customization.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
];

const USE_CASES = [
  {
    title: "E-commerce",
    description:
      "Answer product questions, return policies, and order status without human support.",
  },
  {
    title: "SaaS Companies",
    description:
      "Help users with onboarding, features, and troubleshooting using your documentation.",
  },
  {
    title: "Restaurants",
    description:
      "Share menus, hours, reservations, and catering info automatically.",
  },
  {
    title: "Service Businesses",
    description:
      "Answer FAQs about pricing, scheduling, and service areas 24/7.",
  },
  {
    title: "Educational Organizations",
    description:
      "Help students and parents with admissions, courses, and campus information.",
  },
  {
    title: "Support Teams",
    description:
      " deflect common tickets and let agents focus on complex issues.",
  },
];

const STEPS = [
  {
    title: "Add Knowledge",
    description: "Upload PDFs or add website URLs to build your knowledge base.",
  },
  {
    title: "DeskMind Processes It",
    description: "Content is cleaned, chunked, and converted into searchable representations.",
  },
  {
    title: "Customer Asks a Question",
    description: "A visitor interacts with the chatbot on your website.",
  },
  {
    title: "DeskMind Finds Relevant Info",
    description: "Searches your knowledge base using hybrid retrieval.",
  },
  {
    title: "AI Generates the Answer",
    description: "The answer is grounded in retrieved information from your docs.",
  },
  {
    title: "Sources Are Shown",
    description: "Visitors can see where the answer came from for full transparency.",
  },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold },
    );

    observer.observe(el);

    // Fallback: if already in view, show immediately
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < windowHeight && rect.bottom > 0) {
      el.classList.add("is-visible");
      observer.disconnect();
    }

    return () => observer.disconnect();
  }, [threshold]);
  return ref;
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{title}</h2>
      {subtitle && <p className="mt-3 text-base text-gray-600">{subtitle}</p>}
    </div>
  );
}

export default function Home() {
  const inViewRefs = [
    useInView(),
    useInView(),
    useInView(),
    useInView(),
    useInView(),
    useInView(),
    useInView(),
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-24 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center">
                <AppLogo className="h-10 w-auto" priority />
              </Link>
              <div className="hidden md:flex items-center gap-6 text-base">
                {NAV_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-base font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="text-base font-medium rounded-lg bg-primary-600 px-5 py-2.5 text-white hover:bg-primary-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50/60 to-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-100/60 via-transparent to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="animate-fade-in">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
                Turn your business knowledge into an AI support agent.
              </h1>
              <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
                DeskMind lets you upload PDFs and websites, then creates an intelligent chatbot that answers customer questions using your own content — accurate, grounded, and trustworthy.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
                >
                  Get Started
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  See How It Works
                </a>
              </div>
              <p className="mt-4 text-xs text-gray-500">Free to start. No credit card required.</p>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-border bg-white shadow-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-gray-50/50">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  <div className="ml-2 h-5 w-40 rounded-md bg-white border border-border" />
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 rounded-xl rounded-tl-none border border-border bg-gray-50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-900">How do I return an item?</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Order #1234 · 2 min ago</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="max-w-[80%] rounded-xl rounded-tr-none bg-primary-600 px-3 py-2">
                      <p className="text-xs font-medium text-white">You can return items within 30 days of purchase if they’re unused and in original packaging.</p>
                      <p className="text-[11px] text-primary-200 mt-1">Source: Refund Policy · Page 2</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 rounded-xl rounded-tl-none border border-border bg-gray-50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-900">What are your support hours?</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Just now</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What is DeskMind */}
      <section className="py-16 lg:py-20 border-t border-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">What is DeskMind?</p>
          <h2 className="mt-3 text-3xl font-bold text-gray-900">Your knowledge, conversational.</h2>
          <p className="mt-4 text-base text-gray-600 leading-relaxed">
            DeskMind is an AI-powered customer support chatbot builder. You connect your own knowledge — PDFs, websites, docs — and DeskMind creates an assistant that answers questions using that content. No generic chatbot. No guessing. Just grounded answers with sources.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 lg:py-24 bg-gray-50/60 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="How it works" title="From documents to answers in minutes." />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, idx) => (
              <div
                key={step.title}
                ref={inViewRefs[idx] as React.RefObject<HTMLDivElement>}
                className="reveal-item rounded-xl border border-border bg-white p-6 shadow-sm"
                style={{ transitionDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700">
                    {idx + 1}
                  </span>
                  <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 lg:py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Features" title="Built for support teams that need trustworthy answers." />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="animate-fade-in rounded-xl border border-border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trustworthy AI */}
      <section className="py-16 lg:py-24 bg-gray-50/60 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">Trustworthy AI</p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900">Not a generic chatbot. A grounded assistant.</h2>
              <p className="mt-4 text-base text-gray-600 leading-relaxed">
                DeskMind searches your business knowledge base, grounds answers in retrieved information, and refuses unsupported questions. It also shows sources, protects against prompt injection in documents, and uses hybrid retrieval for better accuracy.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-700">
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Searches your own knowledge, not the open web</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Refuses unsupported questions honestly</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Shows source citations for every answer</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Protects against hidden instructions in documents</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Uses vector + keyword hybrid search</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 shadow-lg">
              <div className="rounded-xl border border-border bg-gray-50/70 p-4">
                <p className="text-sm font-medium text-gray-900 mb-2">Answer</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Based on your documentation, your refund window is 14 days from purchase. If the item is unused and in original packaging, we’ll process a refund to the original payment method within 5–7 business days.
                </p>
                <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-white p-3">
                  <p className="text-xs font-medium text-gray-500">Sources</p>
                  <p className="text-xs text-gray-600 mt-1">Refund Policy — Page 3</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Knowledge */}
      <section className="py-16 lg:py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Knowledge" title="Bring your own knowledge sources." />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: "PDFs", description: "Upload manuals, policies, and reports." },
              { title: "Websites", description: "Add URLs and we’ll ingest pages automatically." },
              { title: "Text & Markdown", description: "Structured content becomes searchable answers." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lead Generation */}
      <section className="py-16 lg:py-24 bg-gray-50/60 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">Lead Generation</p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900">Turn questions into leads.</h2>
              <p className="mt-4 text-base text-gray-600 leading-relaxed">
                When visitors show interest, DeskMind can prompt for an email and save the lead for follow-up. View captured leads in your dashboard with questions, timestamps, and source context.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 shadow-lg">
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-gray-50/70 p-3">
                  <p className="text-xs text-gray-500">Visitor asks</p>
                  <p className="text-sm text-gray-800">“Are there any discounts available?”</p>
                </div>
                <div className="rounded-lg border border-border bg-primary-50/70 p-3">
                  <p className="text-xs text-primary-700">Bot answers</p>
                  <p className="text-sm text-gray-800">“Yes — enter your email and we’ll send the latest offers.”</p>
                </div>
                <div className="rounded-lg border border-border bg-gray-50/70 p-3">
                  <p className="text-xs text-gray-500">Captured lead</p>
                  <p className="text-sm text-gray-800">alex@example.com — “Are there any discounts available?”</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Analytics */}
      <section className="py-16 lg:py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Analytics" title="Understand what customers are asking." />
          <p className="mt-4 text-base text-gray-600 max-w-2xl mx-auto">
            Track message volume, top questions, and conversations over time. Use real usage data to improve your knowledge base.
          </p>
          <div className="mt-10 rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-gray-50/70 p-4">
                <p className="text-xs text-gray-500">Total conversations</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">1,284</p>
              </div>
              <div className="rounded-xl border border-border bg-gray-50/70 p-4">
                <p className="text-xs text-gray-500">Total messages</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">8,492</p>
              </div>
              <div className="rounded-xl border border-border bg-gray-50/70 p-4">
                <p className="text-xs text-gray-500">Top question</p>
                <p className="mt-1 text-sm font-medium text-gray-900">“What are your pricing plans?”</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Embeddable Widget */}
      <section className="py-16 lg:py-24 bg-gray-50/60 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">Embeddable Widget</p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900">Add DeskMind to any website.</h2>
              <p className="mt-4 text-base text-gray-600 leading-relaxed">
                Create a bot, add knowledge, customize the widget, copy the embed code, and add it to your site. The widget matches your brand and works on any page.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-700">
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Create your bot</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Add knowledge</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Customize widget</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Copy embed code</li>
                <li className="flex gap-3"><span className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" /> Paste into your website</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 shadow-lg">
              <div className="rounded-xl border border-border bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50/50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Widget Preview</p>
                    <p className="text-xs text-gray-500">Floating chat button</p>
                  </div>
                  <span className="h-8 w-8 rounded-full bg-primary-600 text-white text-xs font-medium flex items-center justify-center">Chat</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 rounded-xl rounded-tl-none border border-border bg-gray-50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-900">Do you offer free trials?</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-tr-none bg-primary-600 px-3 py-2">
                      <p className="text-xs font-medium text-white">Yes — we offer a 14-day free trial with full access.</p>
                      <p className="text-[11px] text-primary-200 mt-1">Source: Pricing Page</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-tr-none bg-primary-50 border border-primary-100 px-3 py-2">
                      <p className="text-[11px] font-medium text-primary-700">Anything else I can help with?</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-16 lg:py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Use Cases" title="Built for every business that wants better support." />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((item) => (
              <div
                key={item.title}
                className="animate-fade-in rounded-xl border border-border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why DeskMind */}
      <section className="py-16 lg:py-24 bg-gray-50/60 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Why DeskMind" title="Accuracy, transparency, and control." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Grounded answers", description: "Every answer is tied to your actual documents, not generic training data." },
              { title: "Source citations", description: "Show customers exactly where information came from." },
              { title: "Honest refusal", description: "If the answer isn't known, the bot says so instead of making it up." },
              { title: "Prompt injection protection", description: "Ignores hidden instructions inside documents to keep responses safe." },
              { title: "Hybrid retrieval", description: "Combines vector search and keyword matching for better relevance." },
              { title: "Conversation memory", description: "Understands follow-ups and maintains context across the chat." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Account options */}
      <section id="accounts" className="py-16 lg:py-24 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Account Options"
            title="Two ways to create your account."
            subtitle="Sign up with Google for unlimited bots, or start instantly as a guest — no Google account required."
          />
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {/* Google account */}
            <div className="relative rounded-xl border border-primary-100 bg-white p-8 shadow-sm">
              <span className="absolute -top-3 right-6 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white">
                Recommended
              </span>
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-gray-50">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Google Account</h3>
                  <p className="text-2xl font-bold text-gray-900">Unlimited bots</p>
                </div>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-gray-600">
                {[
                  "Create unlimited bots and knowledge bases",
                  "One-click sign-in with your Google account",
                  "Best for businesses ready to go live",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                Sign up with Google
              </Link>
            </div>

            {/* Guest account */}
            <div className="rounded-xl border border-border bg-white p-8 shadow-sm">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-gray-50">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM19 7V1m-3 3h6" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Guest Account</h3>
                  <p className="text-2xl font-bold text-gray-900">Up to 2 bots</p>
                </div>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-gray-600">
                {[
                  "Sign up with just your name, email, and password",
                  "Try DeskMind instantly with up to 2 bots",
                  "Upgrade to Google anytime to unlock unlimited bots",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-8 inline-flex w-full items-center justify-center rounded-lg border border-border bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Create Guest Account
              </Link>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            Start as a guest and continue with Google later — your bots stay with you.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="py-16 lg:py-24 border-t border-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">Your knowledge already exists. Now make it conversational.</h2>
          <p className="mt-4 text-base text-gray-600">Create your first bot, add your knowledge, and start answering customer questions automatically.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
              Get Started
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Already have an account? Log in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Product</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-gray-900">How It Works</a></li>
                <li><a href="#use-cases" className="hover:text-gray-900">Use Cases</a></li>
                <li><Link href="/signup" className="hover:text-gray-900">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Account</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li><Link href="/login" className="hover:text-gray-900">Login</Link></li>
                <li><Link href="/signup" className="hover:text-gray-900">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Company</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900">About</a></li>
                <li><a href="#how-it-works" className="hover:text-gray-900">Documentation</a></li>
                <li><a href="#use-cases" className="hover:text-gray-900">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-border pt-6 text-xs text-gray-500">
            © {new Date().getFullYear()} DeskMind. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}
