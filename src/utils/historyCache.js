// Simple localStorage-backed history cache
const STORAGE_KEY = 'cheeseswap_history_cache_v1'

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    console.warn('Failed to read history cache', e)
    return {}
  }
}

function writeStore(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    return true
  } catch (e) {
    console.warn('Failed to write history cache', e)
    return false
  }
}

export function load(key) {
  const store = readStore()
  return store[key]
}

export function save(key, value) {
  const store = readStore()
  store[key] = value
  return writeStore(store)
}

export function remove(key) {
  const store = readStore()
  delete store[key]
  return writeStore(store)
}

export function exportAll() {
  const store = readStore()
  try {
    return JSON.stringify(store)
  } catch (e) {
    console.warn('Failed to serialize history cache', e)
    return null
  }
}

export function importAll(jsonString, overwrite = false) {
  try {
    const parsed = JSON.parse(jsonString)
    if (!overwrite) {
      const store = readStore()
      const merged = { ...store, ...parsed }
      return writeStore(merged)
    }
    return writeStore(parsed)
  } catch (e) {
    console.warn('Failed to import history cache', e)
    return false
  }
}

export default { load, save, remove, exportAll, importAll }
