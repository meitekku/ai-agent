"use client";

import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { XIcon, DownloadIcon } from "lucide-react";

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
        className="max-w-fit sm:max-w-fit w-auto border-none bg-transparent shadow-none ring-0 p-0 gap-0"
      >
        <DialogTitle className="sr-only">{alt ?? "画像プレビュー"}</DialogTitle>
        <DialogDescription className="sr-only">
          画像の拡大表示
        </DialogDescription>
        <div className="group/lb relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? "image"}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
          />
          {/* Controls — float on the image, visible on hover */}
          <div className="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover/lb:opacity-100">
            <a
              href={`${src}${src.includes("?") ? "&" : "?"}dl=1`}
              download
              className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              <DownloadIcon className="size-4" />
              <span className="sr-only">ダウンロード</span>
            </a>
            <DialogClose className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60">
              <XIcon className="size-4" />
              <span className="sr-only">閉じる</span>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
