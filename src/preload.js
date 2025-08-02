const { contextBridge, ipcRenderer } = require('electron')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

// Add helper function to check if file is an image
function isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff']
    return imageExtensions.includes(path.extname(filename).toLowerCase())
}

// Get XDG directories (Linux standard)
function getXDGDirectories() {
    const home = os.homedir()
    const xdgConfig = process.env.XDG_CONFIG_HOME || `${home}/.config`

    // Try to read user-dirs.dirs for custom XDG paths
    const userDirsPath = `${xdgConfig}/user-dirs.dirs`
    const defaultDirs = {
        desktop: `${home}/Desktop`,
        documents: `${home}/Documents`,
        downloads: `${home}/Downloads`,
        music: `${home}/Music`,
        pictures: `${home}/Pictures`,
        videos: `${home}/Videos`,
        templates: `${home}/Templates`,
        public: `${home}/Public`
    }

    // TODO: Could parse user-dirs.dirs file for custom paths
    // For now, return defaults
    return defaultDirs
}

// Check if a path exists and is accessible
async function pathExists(dirPath) {
    try {
        await fs.access(dirPath)
        return true
    } catch {
        return false
    }
}

contextBridge.exposeInMainWorld('fileManager', {
    readDirectory: async (dirPath) => {
        try {
            const files = await fs.readdir(dirPath, { withFileTypes: true })
            return Promise.all(files.map(async file => {
                const filePath = path.join(dirPath, file.name)
                const stats = await fs.stat(filePath)

                return {
                    name: file.name,
                    isDirectory: file.isDirectory(),
                                         isFile: file.isFile(),
                                         isImage: isImageFile(file.name),
                                         size: stats.size,
                                         mtime: stats.mtime,
                                         atime: stats.atime,
                                         ctime: stats.ctime,
                                         path: filePath,
                                         mode: stats.mode, // Linux file permissions
                                         uid: stats.uid,   // Owner user ID
                                         gid: stats.gid    // Owner group ID
                }
            }))
        } catch (error) {
            throw error
        }
    },

    getHomeDir: () => os.homedir(),

                                getCommonPath: async (location) => {
                                    const home = os.homedir()
                                    const xdgDirs = getXDGDirectories()

                                    const paths = {
                                        'home': home,
                                        'desktop': xdgDirs.desktop,
                                        'documents': xdgDirs.documents,
                                        'downloads': xdgDirs.downloads,
                                        'pictures': xdgDirs.pictures,
                                        'videos': xdgDirs.videos,
                                        'music': xdgDirs.music,
                                        'templates': xdgDirs.templates,
                                        'public': xdgDirs.public,
                                        'root': '/',
                                        'usr': '/usr',
                                        'opt': '/opt',
                                        'tmp': '/tmp',
                                        'var': '/var',
                                        'etc': '/etc',
                                        'mnt': '/mnt',
                                        'media': '/media',
                                        'run': '/run'
                                    }

                                    const requestedPath = paths[location]
                                    if (requestedPath) {
                                        // Only check if path exists for user directories, always return system paths
                                        if (requestedPath.startsWith('/') || await pathExists(requestedPath)) {
                                            return requestedPath
                                        }
                                    }
                                    return null
                                },

                                // Get mounted drives/devices
                                getMountedDevices: async () => {
                                    try {
                                        const mounts = []

                                        // Check /mnt, /media, and /run for mounted devices
                                        const checkDirs = ['/mnt', '/media', '/run/media']

                                        for (const dir of checkDirs) {
                                            if (await pathExists(dir)) {
                                                try {
                                                    const entries = await fs.readdir(dir, { withFileTypes: true })
                                                    for (const entry of entries) {
                                                        if (entry.isDirectory()) {
                                                            const mountPath = path.join(dir, entry.name)
                                                            // Skip if it's just an empty directory
                                                            try {
                                                                const mountContents = await fs.readdir(mountPath)
                                                                if (mountContents.length > 0) {
                                                                    mounts.push({
                                                                        name: entry.name,
                                                                        path: mountPath,
                                                                        type: dir.includes('run') ? 'user-media' :
                                                                        dir.includes('media') ? 'media' : 'mount'
                                                                    })
                                                                }
                                                            } catch (e) {
                                                                // Skip directories we can't read
                                                                continue
                                                            }
                                                        }
                                                    }
                                                } catch (e) {
                                                    // Skip directories we can't read
                                                    continue
                                                }
                                            }
                                        }

                                        return mounts
                                    } catch (error) {
                                        console.error('Error getting mounted devices:', error)
                                        return []
                                    }
                                },

                                // Enhanced thumbnail generation for images
                                getThumbnailUrl: async (filePath) => {
                                    if (!isImageFile(filePath)) return null

                                        try {
                                            const stats = await fs.stat(filePath)
                                            // Don't try to load very large images as thumbnails
                                            if (stats.size > 50 * 1024 * 1024) { // 50MB limit
                                                return null
                                            }

                                            const data = await fs.readFile(filePath)
                                            const base64 = Buffer.from(data).toString('base64')
                                            const ext = path.extname(filePath).slice(1).toLowerCase()

                                            // Handle SVG separately
                                            if (ext === 'svg') {
                                                return `data:image/svg+xml;base64,${base64}`
                                            }

                                            return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`
                                        } catch (error) {
                                            console.error('Error generating thumbnail:', error)
                                            return null
                                        }
                                },

                                openFile: async (filePath) => {
                                    try {
                                        const { shell } = require('electron')
                                        await shell.openPath(filePath)
                                    } catch (error) {
                                        throw error
                                    }
                                },

                                // New Linux-specific functions
                                getFilePermissions: async (filePath) => {
                                    try {
                                        const stats = await fs.stat(filePath)
                                        const mode = stats.mode

                                        // Convert to octal string (like 755, 644, etc.)
                                        const octal = (mode & 0o777).toString(8)

                                        // Convert to rwx format
                                        const permissions = {
                                            owner: {
                                                read: !!(mode & 0o400),
                                write: !!(mode & 0o200),
                                execute: !!(mode & 0o100)
                                            },
                                group: {
                                    read: !!(mode & 0o040),
                                write: !!(mode & 0o020),
                                execute: !!(mode & 0o010)
                                },
                                others: {
                                    read: !!(mode & 0o004),
                                write: !!(mode & 0o002),
                                execute: !!(mode & 0o001)
                                }
                                        }

                                        return { octal, permissions, uid: stats.uid, gid: stats.gid }
                                    } catch (error) {
                                        throw error
                                    }
                                },

                                // Check if running on Wayland (useful for Hyprland)
                                isWayland: () => {
                                    return process.env.WAYLAND_DISPLAY !== undefined
                                },

                                // Get desktop environment info
                                getDesktopInfo: () => {
                                    return {
                                        desktop: process.env.XDG_CURRENT_DESKTOP || 'unknown',
                                session: process.env.XDG_SESSION_TYPE || 'unknown',
                                wayland: process.env.WAYLAND_DISPLAY !== undefined,
                                compositor: process.env.HYPRLAND_INSTANCE_SIGNATURE ? 'hyprland' : 'unknown'
                                    }
                                }
})
