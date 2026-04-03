import { useCallback, useState } from "react";
import {
  fetchSlideDeckDetail,
  fetchSlidesAtVersion,
  restoreSlideVersion,
} from "@/lib/slide-api";
import type { GeneratedSlide } from "./types";

interface UseSlideVersionsParams {
  currentDeckId: number | null;
  setGeneratedSlides: React.Dispatch<React.SetStateAction<GeneratedSlide[]>>;
  setDeckTitle: (t: string) => void;
  setActiveIndex: (i: number) => void;
  setError: (e: string | null) => void;
  setSaved: (s: boolean) => void;
  storeSetCachedSlides: (
    slides: { index: number; title: string; html: string; type: string }[],
    title: string,
  ) => void;
}

export function useSlideVersions({
  currentDeckId,
  setGeneratedSlides,
  setDeckTitle,
  setActiveIndex,
  setError,
  setSaved,
  storeSetCachedSlides,
}: UseSlideVersionsParams) {
  const [currentVersion, setCurrentVersion] = useState(1);
  const [maxVersion, setMaxVersion] = useState(1);
  const [browsingVersion, setBrowsingVersion] = useState<number | null>(null);
  const [versionSlides, setVersionSlides] = useState<GeneratedSlide[] | null>(
    null,
  );
  const [restoringVersion, setRestoringVersion] = useState(false);

  const isBrowsingHistory = browsingVersion !== null;

  const handleBrowseVersion = useCallback(
    async (direction: "prev" | "next") => {
      if (!currentDeckId) return;
      const target = browsingVersion ?? currentVersion;
      const newTarget = direction === "prev" ? target - 1 : target + 1;
      if (newTarget < 1 || newTarget > maxVersion) return;

      if (newTarget === currentVersion) {
        setBrowsingVersion(null);
        setVersionSlides(null);
        return;
      }

      try {
        const slides = await fetchSlidesAtVersion(currentDeckId, newTarget);
        setBrowsingVersion(newTarget);
        setVersionSlides(
          slides.map((s) => ({
            index: s.slide_index,
            title: s.title,
            html: s.html,
            type: s.slide_type,
          })),
        );
        setActiveIndex(0);
      } catch (e) {
        console.error("[slide-panel] browse version failed:", e);
      }
    },
    [currentDeckId, browsingVersion, currentVersion, maxVersion, setActiveIndex],
  );

  const handleRestoreVersion = useCallback(async () => {
    if (!currentDeckId || !browsingVersion) return;
    setRestoringVersion(true);
    try {
      const { version: newVer } = await restoreSlideVersion(
        currentDeckId,
        browsingVersion,
      );
      const detail = await fetchSlideDeckDetail(currentDeckId);
      const slides = detail.slides.map((s) => ({
        index: s.slide_index,
        title: s.title,
        html: s.html,
        type: s.slide_type,
      }));
      setGeneratedSlides(slides);
      setDeckTitle(detail.title);
      setCurrentVersion(newVer);
      setMaxVersion(newVer);
      setBrowsingVersion(null);
      setVersionSlides(null);
      storeSetCachedSlides(slides, detail.title);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringVersion(false);
    }
  }, [
    currentDeckId,
    browsingVersion,
    setGeneratedSlides,
    setDeckTitle,
    setError,
    setSaved,
    storeSetCachedSlides,
  ]);

  return {
    currentVersion,
    setCurrentVersion,
    maxVersion,
    setMaxVersion,
    browsingVersion,
    setBrowsingVersion,
    versionSlides,
    setVersionSlides,
    restoringVersion,
    isBrowsingHistory,
    handleBrowseVersion,
    handleRestoreVersion,
  };
}
