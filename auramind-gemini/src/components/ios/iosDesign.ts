import { createContext, useContext } from "react";

/**
 * True inside the iPhone app's shell (and its preview). Pages that have an
 * iOS-designed view (chat, study) read it to choose that view; everywhere
 * else it is false and the web or Android view renders unchanged.
 */
export const IOSDesignContext = createContext(false);

export function useIOSDesign(): boolean {
  return useContext(IOSDesignContext);
}
