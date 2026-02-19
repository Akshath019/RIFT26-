/**
 * DropZone — Drag-and-drop image upload component
 * Uses HTML5 drag events + click-to-upload. No external libraries.
 */

import React, { useCallback, useRef, useState } from 'react'

interface DropZoneProps {
  onImageSelected: (file: File) => void
  disabled?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
const MAX_FILE_SIZE_MB = 10

export default function DropZone({ onImageSelected, disabled = false }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragError, setDragError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Please upload a JPEG, PNG, WebP, or GIF image.'
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File size must be under ${MAX_FILE_SIZE_MB}MB.`
    }
    return null
  }, [])

  const handleFile = useCallback(
    (file: File) => {
      setDragError('')
      const error = validateFile(file)
      if (error) {
        setDragError(error)
        return
      }
      onImageSelected(file)
    },
    [validateFile, onImageSelected],
  )

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set isDragging=false when leaving the dropzone entirely
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (disabled) return

      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      handleFile(files[0])
    },
    [disabled, handleFile],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // Reset input so same file can be re-selected
      e.target.value = ''
    },
    [handleFile],
  )

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick],
  )

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload image for verification"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative w-full min-h-[220px] rounded-2xl border-2 border-dashed transition-all duration-200
          flex flex-col items-center justify-center gap-4 cursor-pointer select-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${
            isDragging
              ? 'border-indigo-400 bg-indigo-50 scale-[1.01]'
              : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
          }
        `}
      >
        {/* Upload icon */}
        <div
          className={`p-4 rounded-2xl transition-all ${isDragging ? 'bg-indigo-100' : 'bg-slate-100'}`}
        >
          <svg
            className={`w-8 h-8 ${isDragging ? 'text-indigo-600' : 'text-slate-400'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        {/* Text */}
        <div className="text-center px-6">
          <p className={`font-semibold text-base ${isDragging ? 'text-indigo-700' : 'text-slate-700'}`}>
            {isDragging ? 'Drop image here' : 'Drag & drop your image here'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            or <span className="text-indigo-600 font-medium">browse to upload</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">JPEG, PNG, WebP, GIF up to 10MB</p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Error message */}
      {dragError && (
        <p className="mt-2 text-sm text-red-600 text-center">{dragError}</p>
      )}
    </div>
  )
}
