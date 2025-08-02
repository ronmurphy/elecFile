// main.js
const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
                               hardResetMethod: 'exit'
    })
}

let mainWindow

function createWindow() {
    // Get display info for better window sizing on Linux
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    mainWindow = new BrowserWindow({
        width: Math.min(1200, Math.floor(width * 0.8)),
                                   height: Math.min(800, Math.floor(height * 0.8)),
                                   minWidth: 800,
                                   minHeight: 600,
                                   show: false, // Don't show until ready
                                   icon: path.join(__dirname, 'build', 'icon.png'), // Linux app icon
                                   webPreferences: {
                                       nodeIntegration: false,
                                       contextIsolation: true,
                                       preload: path.join(__dirname, 'src', 'preload.js'),
                                   enableRemoteModule: false,
                                   sandbox: false // Needed for file system access
                                   },
                                   titleBarStyle: 'default', // Use system title bar on Linux
                                   frame: true,
                                   autoHideMenuBar: true, // Hide menu bar by default (F10 to show)
    backgroundColor: '#1E1E1E' // Dark background for better loading
    })

    // Load the app
    mainWindow.loadFile('src/index.html')

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()

        // Focus window (helpful for tiling WMs)
        if (process.platform === 'linux') {
            mainWindow.focus()
        }
    })

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null
    })

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools()
    }

    // Linux-specific: Handle session restore
    if (process.platform === 'linux') {
        // Try to restore window position from previous session
        try {
            const configPath = path.join(os.homedir(), '.config', 'hyprland-file-manager')
            const windowStatePath = path.join(configPath, 'window-state.json')

            if (fs.existsSync(windowStatePath)) {
                const windowState = JSON.parse(fs.readFileSync(windowStatePath, 'utf8'))
                if (windowState.bounds) {
                    mainWindow.setBounds(windowState.bounds)
                }
                if (windowState.isMaximized) {
                    mainWindow.maximize()
                }
            }
        } catch (error) {
            console.log('Could not restore window state:', error.message)
        }

        // Save window state on close
        mainWindow.on('close', () => {
            try {
                const configPath = path.join(os.homedir(), '.config', 'hyprland-file-manager')
                if (!fs.existsSync(configPath)) {
                    fs.mkdirSync(configPath, { recursive: true })
                }

                const windowState = {
                    bounds: mainWindow.getBounds(),
                      isMaximized: mainWindow.isMaximized()
                }

                fs.writeFileSync(
                    path.join(configPath, 'window-state.json'),
                                 JSON.stringify(windowState, null, 2)
                )
            } catch (error) {
                console.log('Could not save window state:', error.message)
            }
        })
    }
}

// Create application menu for Linux
function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Window',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => createWindow()
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit()
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload',
                    accelerator: 'F5',
                    click: () => {
                        if (mainWindow) mainWindow.reload()
                    }
                },
                {
                    label: 'Force Reload',
                    accelerator: 'CmdOrCtrl+F5',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.reloadIgnoringCache()
                    }
                },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: 'F12',
                    click: () => {
                        if (mainWindow) mainWindow.webContents.toggleDevTools()
                    }
                },
                { type: 'separator' },
                { role: 'resetzoom' },
                { role: 'zoomin' },
                { role: 'zoomout' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Hyprland File Manager',
                            message: 'Hyprland File Manager',
                            detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode.js: ${process.versions.node}\nPlatform: ${process.platform}`
                        })
                    }
                },
                {
                    label: 'Keyboard Shortcuts',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Keyboard Shortcuts',
                            message: 'Keyboard Shortcuts',
                            detail: `Ctrl+H: Toggle hidden files
                            Ctrl+1: List view
                            Ctrl+2: Grid view
                            Ctrl+T: Toggle theme
                            F5: Refresh
                            Alt+Left: Back
                            Alt+Up: Parent directory
                            Ctrl+/: Show shortcuts
                            F10: Toggle menu bar
                            F11: Toggle fullscreen`
                        })
                    }
                }
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

// App event handlers
app.whenReady().then(() => {
    createWindow()
    createMenu()

    // Handle app activation (Linux/Windows don't really use this like macOS)
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })

    // Linux-specific: Handle protocol for opening directories
    if (process.platform === 'linux') {
        // Register as default application for directories
        app.setAsDefaultProtocolClient('file')

        // Handle command line arguments for opening specific directories
        if (process.argv.length > 1) {
            const targetPath = process.argv[process.argv.length - 1]
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                // Send path to renderer when ready
                mainWindow.webContents.once('dom-ready', () => {
                    mainWindow.webContents.send('open-directory', targetPath)
                })
            }
        }
    }
})

// Handle all windows closed
app.on('window-all-closed', () => {
    // On Linux/Windows, quit when all windows are closed
    // (macOS apps typically stay running)
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// Linux-specific: Handle second instance (single instance application)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
                mainWindow.focus()

                // Handle opening directory from second instance
                const targetPath = commandLine[commandLine.length - 1]
                if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                    mainWindow.webContents.send('open-directory', targetPath)
                }
        }
    })
}

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault()
        shell.openExternal(navigationUrl)
    })
})

// Handle certificate errors (for HTTPS requests if any)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault()
    callback(false) // Don't trust invalid certificates
})

// Linux-specific: Better integration with desktop environment
if (process.platform === 'linux') {
    // Set app user model ID for proper taskbar integration
    app.setAppUserModelId('com.hyprland.filemanager')

    // Handle desktop notification clicks
    app.on('browser-window-created', (event, window) => {
        // Additional Linux-specific window setup could go here
    })
}

// IPC handlers for file operations
ipcMain.handle('show-save-dialog', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save File',
        buttonLabel: 'Save',
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    })
    return result
})

ipcMain.handle('show-open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open File',
        buttonLabel: 'Open',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    })
    return result
})

// Export for testing
module.exports = { createWindow }
