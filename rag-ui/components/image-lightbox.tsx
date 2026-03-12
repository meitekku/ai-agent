"use client";

import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { XIcon } from "lucide-react";

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[95vw] sm:max-w-[95vw] w-auto border-none bg-black/90 shadow-2xl ring-0 p-2 gap-0 rounded-2xl"
      >
        <DialogTitle className="sr-only">
          {alt ?? "画像プレビュー"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          画像の拡大表示
        </DialogDescription>
        <DialogClose className="absolute top-3 right-3 z-10 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
          <XIcon className="size-4" />
          <span className="sr-only">閉じる</span>
        </DialogClose>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? "image"}
          className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
