import { createContext } from 'react';
import type { Card, Deck } from '../../types';

/**
 * Sample data for StudyModePage in the iOS preview screens
 * (components/ios/IOSVisualPreview). When set, the page shows these cards
 * instead of loading the signed-in user's deck. Nothing else provides it.
 */
export const StudyPreviewContext = createContext<{ deck: Deck; cards: Card[] } | null>(null);
