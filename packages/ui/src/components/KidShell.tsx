import type { ReactNode } from 'react';

export interface KidShellProps { children: ReactNode; bigText?: boolean; reducedMotion?: boolean; className?: string; background?: 'sky' | 'lilac' | 'plain' }

/** Gốc giao diện trẻ em: nền trời có đốm mây mềm, font, chữ to (.k-big), giảm chuyển động (.k-reduced). */
export function KidShell({ children, bigText, reducedMotion, className, background = 'sky' }: KidShellProps) {
  return (
    <div className={`k-shell k-shell--${background}${bigText ? ' k-big' : ''}${reducedMotion ? ' k-reduced' : ''}${className ? ' ' + className : ''}`}>
      {children}
    </div>
  );
}
