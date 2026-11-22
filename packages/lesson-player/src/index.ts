/**
 * @openedu/lesson-player — trình phát bài giảng tương tác: tự học, HS trong lớp trực tiếp, TV, gói HTML5.
 * Props theo @openedu/contracts (component-api.ts). CSS được các component tự import.
 */
export { SlideView } from './SlideView';
export type { SlideViewProps, SlideContext, SlideActivityProps } from './SlideView';
export { SelfPacedPlayer } from './SelfPacedPlayer';
export { LiveStudentView } from './LiveStudentView';
export type { LiveStudentViewExtraProps } from './LiveStudentView';
export { BigScreenSlide } from './BigScreenSlide';
export { LiveResultsBar } from './LiveResultsBar';
export type { LiveResultsBarProps } from './LiveResultsBar';
export { PackageHost } from './PackageHost';
export { ActivityRunner, MAX_TRIES, MAX_HINTS } from './ActivityRunner';
export type { ActivityRunnerProps, ActivityOutcome, HintFn, HintRequest } from './ActivityRunner';
export { GameView, SpinWheel, DuckRace, TimeBomb } from './games';
export type { GameProps } from './games';
export { VideoBlock } from './VideoBlock';
export type { VideoBlockProps } from './VideoBlock';
export { EmbedBlock } from './EmbedBlock';
export { toEmbed, setEmbedOrigins, subscribeEmbedOrigins, embedOriginsVersion, EMBED_FRAME_ORIGINS, EMBED_PROVIDER_LABEL, type EmbedProvider, type EmbedResult } from './embed';
export { computeLiveStats, latestPerStudent } from './liveStats';
export type { LiveStats, LiveOptionStat } from './liveStats';
export { isBridgeMessage, launcherUrl, contentOrigin } from './bridge';
export type { BridgeMessage, BridgeMessageType } from './bridge';
export { slideSpeakText, resolveSlideItem, lessonMascot, youtubeId } from './util';
