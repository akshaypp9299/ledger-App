import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Building, Flat } from '../api/types'

/** Lets the Quick Add sheet deep-link into a page's form (e.g. /cashbook?add=entry). */
export function useAddParam(): [string | null, () => void] {
  const [sp, setSp] = useSearchParams()
  const value = sp.get('add')
  const clear = useCallback(() => { const n = new URLSearchParams(sp); n.delete('add'); setSp(n, { replace: true }) }, [sp, setSp])
  return [value, clear]
}

export const useFlats = () => useQuery({ queryKey: ['flats'], queryFn: () => api<Flat[]>('/flats') })
export const useBuildings = () => useQuery({ queryKey: ['buildings'], queryFn: () => api<Building[]>('/buildings'), staleTime: 5 * 60_000 })

export const flatLabel = (f: { building: string; flatNumber: string }) => `${f.building}-${f.flatNumber}`
