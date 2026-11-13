"use client";

import Image from "next/image";
import Link from "next/link";
import notFoundIllustration from "./404-svg.png";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-600">
          Page 404
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          This page took a wrong turn.
        </h1>
        <Image
          src={notFoundIllustration}
          alt="404 page not found"
          priority
          className="mt-6 h-auto w-full max-w-sm sm:max-w-md"
          sizes="(max-width: 640px) 90vw, 448px"
        />
        <p className="mt-5 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
          The link may be out of date, or the page may have moved. You can try
          again or head back to DeskMind.
        </p>
        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Reload page
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-700"
          >
            Return to home
          </Link>
        </div>
      </div>
    </main>
  );
}
