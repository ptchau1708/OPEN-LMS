import { memo } from 'react';
import type { ContentPackage, Item, MascotId, Slide } from '@openedu/contracts';
import { SlideView } from '@openedu/lesson-player';
import { KidShell } from '@openedu/ui';

const W = 1280;
const H = 720;

/** Ảnh thu nhỏ "sống" của slide: SlideView 1280×720 thu nhỏ bằng transform. */
export const SlideThumb = memo(function SlideThumb({ slide, items, packages, mascot, width = 168 }: { slide: Slide; items: Record<string, Item>; packages?: Record<string, ContentPackage>; mascot?: MascotId; width?: number }) {
  const s = width / W;
  return (
    <div className="tc-thumb" style={{ width, height: H * s }} aria-hidden="true">
      <div className="tc-thumb__inner" style={{ width: W, height: H, transform: `scale(${s})` }}>
        <KidShell background="plain">
          <SlideView slide={slide} items={items} packages={packages} context="screen" interactive={false} mascot={mascot} sound={false} />
        </KidShell>
      </div>
    </div>
  );
});
