/**
 * ReplayEventBridge — zero-render helper that subscribes to the
 * `bonamind:open-replay` window event and forwards each fire to a parent
 * callback. Used by AIChatPage to receive replay-open requests from
 * ConversationHistory (or any embedded surface) WITHOUT prop-drilling an
 * `onOpenReplay` prop through every conversation toolbar.
 *
 * The component renders nothing — it's a side-effect-only listener kept in
 * the React tree so cleanup happens automatically when the page unmounts
 * (rather than leaking if the event were attached at module top-level).
 */
import { useEffect } from 'react';

interface Props {
  onOpen: () => void;
}

export default function ReplayEventBridge({ onOpen }: Props) {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener('bonamind:open-replay', handler);
    return () => window.removeEventListener('bonamind:open-replay', handler);
  }, [onOpen]);
  return null;
}
