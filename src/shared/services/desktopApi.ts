export const getDesktopApi = (): DesktopApi | null => {
  if (typeof window === 'undefined') return null
  return window.desktopApi || null
}

export const isDesktopRuntime = () => getDesktopApi() !== null

