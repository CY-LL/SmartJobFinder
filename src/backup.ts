// Backup files: everything the app keeps in this browser, saved to a file on the user's computer and
// restored from it after browser data is cleared, or on another device.

import { DEFAULTS } from './store'
import type { Settings } from './store'

const MARK = 'SmartJobFinder backup'
const VERSION = 1

/** Downloads a backup of every setting, job and application, and returns when it was made. */
export function saveBackup(s: Settings): string {
  const at = new Date().toISOString()
  const { lastBackup: _ignored, ...rest } = s
  const file = JSON.stringify({ app: MARK, version: VERSION, savedAt: at, settings: rest }, null, 1)
  const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `smartjobfinder-backup-${at.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  return at
}

/** Reads a backup file into settings, or throws with a message the user can act on. */
export async function readBackup(file: File): Promise<Settings> {
  if (file.size > 50 * 1024 * 1024) throw new Error('That file is too big to be a SmartJobFinder backup.')
  let data: { app?: string; version?: number; savedAt?: string; settings?: Partial<Settings> }
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('That file isn’t a SmartJobFinder backup. Choose the smartjobfinder-backup-….json file you saved.')
  }
  if (data.app !== MARK || !data.settings || typeof data.settings !== 'object') throw new Error('That file isn’t a SmartJobFinder backup. Choose the smartjobfinder-backup-….json file you saved.')
  if ((data.version ?? 0) > VERSION) throw new Error('That backup was made by a newer version of SmartJobFinder. Reload the app and try again.')
  const settings = { ...DEFAULTS, ...data.settings } as Settings
  // The restored state counts as backed up as of the file's date.
  return { ...settings, lastBackup: { at: data.savedAt ?? new Date().toISOString(), apps: settings.apps.length } }
}
