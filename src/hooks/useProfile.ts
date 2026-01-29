import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile, ProfileUpdate } from '@/types/database'

/**
 * Compress an image file to target size using Canvas API
 * - Resizes to max dimensions
 * - Re-encodes as JPEG (strips all metadata)
 * - Adjusts quality to meet target size
 */
async function compressImage(
  file: File,
  maxWidth = 512,
  maxHeight = 512,
  targetSizeKB = 900
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Failed to get canvas context'))
      return
    }

    img.onload = () => {
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      canvas.width = width
      canvas.height = height

      // Draw image (this strips all metadata)
      ctx.drawImage(img, 0, 0, width, height)

      // Try different quality levels to get under target size
      const tryCompress = (quality: number): void => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }

            const sizeKB = blob.size / 1024

            // If under target or quality is already very low, use this result
            if (sizeKB <= targetSizeKB || quality <= 0.3) {
              const compressedFile = new File([blob], 'avatar.jpg', {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              // Try lower quality
              tryCompress(quality - 0.1)
            }
          },
          'image/jpeg',
          quality
        )
      }

      // Start with high quality
      tryCompress(0.9)
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

interface UseProfileReturn {
  profile: Profile | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<unknown>
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  // PGRST116 = no rows returned, which is fine for a new user
  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data
}

export function useProfile(): UseProfileReturn {
  const { user } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
    staleTime: 60000, // 1 minute
  })

  return {
    profile: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

/**
 * Hook for creating or updating a user profile (upsert)
 */
export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Omit<ProfileUpdate, 'user_id' | 'id'>) => {
      if (!user) throw new Error('User not authenticated')

      // First try to get existing profile
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        // Update existing profile
        const { data, error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('user_id', user.id)
          .select()
          .single()

        if (error) throw new Error(`Failed to update profile: ${error.message}`)
        return data
      } else {
        // Create new profile
        const { data, error } = await supabase
          .from('profiles')
          .insert({ user_id: user.id, ...updates })
          .select()
          .single()

        if (error) throw new Error(`Failed to create profile: ${error.message}`)
        return data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

/**
 * Hook for uploading an avatar image
 */
export function useUploadAvatar() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('User not authenticated')

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.')
      }

      // Validate file size (5MB max before compression)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File too large. Maximum size is 5MB.')
      }

      // Compress image: resize to 512x512 max, convert to JPEG, strip metadata
      const compressedFile = await compressImage(file, 512, 512, 900)

      // Generate unique filename (always .jpg after compression)
      const fileName = `${user.id}/avatar-${Date.now()}.jpg`

      // Delete old avatar if exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .single()

      if (existingProfile?.avatar_url) {
        // Extract the path from the URL
        const urlParts = existingProfile.avatar_url.split('/avatars/')
        if (urlParts[1]) {
          await supabase.storage.from('avatars').remove([urlParts[1]])
        }
      }

      // Upload compressed avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) {
        throw new Error(`Failed to upload avatar: ${uploadError.message}`)
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      const avatarUrl = urlData.publicUrl

      // Update profile with new avatar URL
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        await supabase
          .from('profiles')
          .update({ avatar_url: avatarUrl })
          .eq('user_id', user.id)
      } else {
        await supabase
          .from('profiles')
          .insert({ user_id: user.id, avatar_url: avatarUrl })
      }

      return avatarUrl
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

/**
 * Hook for removing the avatar
 */
export function useRemoveAvatar() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated')

      // Get current avatar URL
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .single()

      if (profile?.avatar_url) {
        // Extract the path from the URL
        const urlParts = profile.avatar_url.split('/avatars/')
        if (urlParts[1]) {
          await supabase.storage.from('avatars').remove([urlParts[1]])
        }

        // Update profile to remove avatar URL
        await supabase
          .from('profiles')
          .update({ avatar_url: null })
          .eq('user_id', user.id)
      }

      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
