"use client";

import Link from "next/link";
import { Zap, ChevronRight, Github, Globe } from "lucide-react";

const variants = [
  {
    id: "tribunus-iii",
    name: "Tribunus III",
    description: "Tribunus III series with SBEC/DOBC support",
    models: "6S-110A, 8S-120A, 8S-160A, 14S-150A, 14S-220A, 16S-200A, 16S-320A",
  },
  {
    id: "tribunus-ii",
    name: "Tribunus II",
    description: "Original Tribunus ESC series",
    models: "6S-120A, 12S-80A, 12S-130A, 14S-200A, 16S-300A",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Sproto Web Configurator</h1>
          </div>
          <a
            href="https://github.com/cmuav/sproto-web-configurator"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="View source on GitHub"
          >
            <Github className="h-5 w-5 text-muted-foreground" />
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-2xl mx-auto px-4 pt-12 pb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Configure Tribunus ESCs from your browser
        </h2>
        <p className="text-muted-foreground text-base max-w-xl leading-relaxed">
          Read, edit, and write ESC settings over WebUSB. No drivers or desktop software required.
        </p>
      </div>

      {/* Variant selection */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <p className="text-sm font-medium text-muted-foreground mb-3">Select your ESC:</p>
        <div className="flex flex-col gap-3">
          {variants.map((v) => (
            <Link
              key={v.id}
              href={`/${v.id}`}
              className="w-full text-left rounded-xl border border-border bg-card p-5 flex items-center gap-4 hover:bg-muted/40 active:bg-muted/60 active:scale-[0.99] transition-all"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">{v.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{v.models}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Requirements notice */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requirements</p>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <Globe className="h-4 w-4 shrink-0 mt-0.5" />
              <span><strong>Chrome or Edge</strong> with WebUSB support (not supported in Firefox or Safari)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
