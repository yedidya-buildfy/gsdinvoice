"use client"

import { useEffect, useRef } from 'react'
import Viewer from 'viewerjs'
import 'viewerjs/dist/viewer.css'

interface ImageViewerProps {
  url: string
  alt?: string
}

export function ImageViewer({ url, alt }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    viewerRef.current = new Viewer(containerRef.current, {
      inline: true,
      navbar: false,
      title: false,
      toolbar: {
        zoomIn: 1,
        zoomOut: 1,
        oneToOne: 1,
        reset: 1,
        prev: 0,
        play: 0,
        next: 0,
        rotateLeft: 1,
        rotateRight: 1,
        flipHorizontal: 1,
        flipVertical: 1,
      },
      className: 'viewer-dark',
      backdrop: false,
      button: false,
      container: containerRef.current,
      minZoomRatio: 0.1,
      maxZoomRatio: 10,
      zoomRatio: 0.2,
      initialCoverage: 0.9,
    })

    return () => {
      viewerRef.current?.destroy()
    }
  }, [])

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.update()
    }
  }, [url])

  return (
    <div className="h-full bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full [&_.viewer-container]:!bg-gray-950 [&_.viewer-canvas]:!bg-gray-950 [&_.viewer-toolbar]:!bg-gray-800/90 [&_.viewer-toolbar]:!backdrop-blur-sm [&_.viewer-toolbar>ul>li]:!text-gray-400 [&_.viewer-toolbar>ul>li:hover]:!text-white [&_.viewer-toolbar>ul>li::before]:!bg-current"
      >
        <img
          src={url}
          alt={alt ?? 'Document image'}
          className="hidden"
        />
      </div>
    </div>
  )
}
