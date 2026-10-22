// Ambient types for APIs not yet in lib.dom

interface Navigator {
  /** true when opened from the iOS Home Screen (standalone web app) */
  readonly standalone?: boolean;
  setAppBadge?(count?: number): Promise<void>;
  clearAppBadge?(): Promise<void>;
}

interface Window {
  /** Declarative Web Push (iOS/iPadOS 18.4+) */
  pushManager?: PushManager;
}

interface UserActivation {
  readonly isActive: boolean;
  readonly hasBeenActive: boolean;
}

interface Navigator {
  readonly userActivation?: UserActivation;
}
