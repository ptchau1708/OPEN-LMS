/**
 * @openedu/ui — bộ giao diện dùng chung. API công khai dưới đây là hợp đồng: giữ nguyên tên và props.
 * Nhập CSS một lần ở gốc app: import '@openedu/ui/tokens.css'; import '@openedu/ui/kid.css';
 */
export { speak, stopSpeaking, hasVoice, voicesReady, findVoice } from './speech';
export type { SpeakLang, SpeakOptions } from './speech';
export { sfx, unlockAudio, setSoundEnabled, isSoundEnabled } from './sfx';

export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';
export { Card } from './components/Card';
export type { CardProps } from './components/Card';
export { Icon, ICON_NAMES } from './components/Icon';
export type { IconName, IconProps } from './components/Icon';
export { Mascot, MascotBubble } from './mascots/Mascot';
export type { MascotProps, MascotBubbleProps } from './mascots/Mascot';
export { Media } from './components/Media';
export type { MediaProps } from './components/Media';
export { SpeakButton } from './components/SpeakButton';
export type { SpeakButtonProps } from './components/SpeakButton';
export { StarCount, StarBurst, StarShape } from './components/Stars';
export type { StarCountProps, StarBurstProps } from './components/Stars';
export { Confetti } from './components/Confetti';
export type { ConfettiProps } from './components/Confetti';
export { ProgressDots, ProgressBar } from './components/Progress';
export type { ProgressDotsProps, ProgressBarProps } from './components/Progress';
export { TabBar } from './components/TabBar';
export type { TabBarProps, TabItem } from './components/TabBar';
export { SubjectBadge } from './components/SubjectBadge';
export { KidShell } from './components/KidShell';
export type { KidShellProps } from './components/KidShell';
export { Sheet } from './components/Sheet';
export type { SheetProps } from './components/Sheet';
export { TimerRing } from './components/TimerRing';
export type { TimerRingProps } from './components/TimerRing';
export { QrCode } from './components/QrCode';
export type { QrCodeProps } from './components/QrCode';
export { useLongPress, usePrefersReducedMotion } from './hooks';
export { UiGallery } from './gallery/UiGallery';
// Phase 6 — trang phục linh vật, huy hiệu, cây Vườn lớp (CSS riêng: import '@openedu/ui/rewards.css' trong trang dùng tới).
export type { MascotWear } from './mascots/Mascot';
export { DressedMascot, OutfitItemArt, outfitWear, outfitAnchor } from './outfits/outfits';
export type { DressedMascotProps } from './outfits/outfits';
export { BadgeArt } from './badges/BadgeArt';
export type { BadgeArtProps } from './badges/BadgeArt';
export { Plant } from './garden/Plant';
export type { PlantProps } from './garden/Plant';
export { GardenScene } from './garden/GardenScene';
export type { GardenSceneProps } from './garden/GardenScene';
export { ErrorBoundary, ErrorScreen } from './components/ErrorBoundary';
export type { ErrorBoundaryProps, ErrorScreenProps } from './components/ErrorBoundary';
