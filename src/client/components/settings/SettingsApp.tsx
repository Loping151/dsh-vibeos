/* Derived from VibeOS (https://github.com/benis-me/VibeOS) — apps/frontend/src/components/settings/SettingsApp.tsx.
 * Adapted for DeepSeek Harness (dsh-vibeos): the Providers category is gone (DSH owns routing), General
 * leads, and motion's AnimatePresence becomes a mount fade. Original license: MIT. */

import { useState, type ReactNode } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePresence, useReducedMotion, EASE_OUT } from '../../lib/anim';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { Boxes, Info, SlidersHorizontal, User } from '../../icons/uiIcons';
import { GeneralPane } from './GeneralPane';
import { ModelsPane } from './ModelsPane';
import { ProfilePane } from './ProfilePane';
import { AboutPane } from './AboutPane';

type CategoryId = 'general' | 'models' | 'profile' | 'about';

/**
 * Settings is the one app rendered natively (not AI-hallucinated): it controls
 * real system state. Laid out like macOS System Settings — a category sidebar
 * on the left, a scrollable detail pane on the right. Each pane lives in its own
 * file; shared building blocks are in ./primitives.
 */
export function SettingsApp() {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const [category, setCategory] = useState<CategoryId>('general');
  if (!settings) return null;

  const CATEGORIES: { id: CategoryId; icon: ReactNode; label: string }[] = [
    {
      id: 'general',
      icon: <SlidersHorizontal className="size-3.5" />,
      label: t('settings.cat.general'),
    },
    { id: 'models', icon: <Boxes className="size-3.5" />, label: t('settings.cat.models') },
    { id: 'profile', icon: <User className="size-3.5" />, label: t('settings.cat.profile') },
    { id: 'about', icon: <Info className="size-3.5" />, label: t('settings.cat.about') },
  ];

  return (
    <div className="flex h-full bg-background text-foreground">
      <nav className="flex w-52 shrink-0 flex-col gap-0.5 overflow-auto border-r bg-muted/30 px-2.5 py-4">
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                active ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/50',
              )}
            >
              <span
                className={cn(
                  'flex size-[22px] items-center justify-center rounded-[6px] transition-colors',
                  active
                    ? 'bg-brand text-brand-foreground shadow-sm'
                    : 'bg-foreground/[0.06] text-muted-foreground',
                )}
              >
                {c.icon}
              </span>
              {c.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-auto">
        <div className="px-7 py-6">
          <PaneFade key={category}>
            {category === 'general' && <GeneralPane />}
            {category === 'models' && <ModelsPane />}
            {category === 'profile' && <ProfilePane />}
            {category === 'about' && <AboutPane />}
          </PaneFade>
        </div>
      </div>
    </div>
  );
}

/** Remounted per category (keyed), so mounting IS the enter transition. */
function PaneFade({ children }: { children: ReactNode }) {
  const { entered } = usePresence(true);
  const reduced = useReducedMotion();
  return (
    <div
      style={
        reduced
          ? { opacity: entered ? 1 : 0, transition: 'opacity 0.12s' }
          : {
              opacity: entered ? 1 : 0,
              transform: entered ? 'translateY(0)' : 'translateY(4px)',
              transition: `opacity 0.15s ${EASE_OUT}, transform 0.15s ${EASE_OUT}`,
            }
      }
    >
      {children}
    </div>
  );
}
