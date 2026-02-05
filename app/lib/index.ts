import { app, ipcMain, Menu, dialog } from 'electron'

// set userData Path on portable version
import './portable'

const DEFAULT_APP_NAME = 'Tabitha'
const runtimeName = app.getName() || DEFAULT_APP_NAME
const appName = process.env.TABITHA_APP_NAME || runtimeName
if (appName !== runtimeName) {
    app.setName(appName)
}
const isDevVariant = appName.toLowerCase().includes('dev')
const appId = process.env.TABITHA_APP_ID || (isDevVariant ? 'com.avalonreset.tabitha.dev' : 'com.avalonreset.tabitha')
if (process.platform === 'win32') {
    app.setAppUserModelId(appId)
}
if (app.isPackaged) {
    delete process.env.TABBY_DEV
    process.env.TABBY_FORCE_ANGULAR_PROD = '1'
}

// set defaults of environment variables
import 'dotenv/config'
process.env.TABBY_PLUGINS ??= ''
process.env.TABBY_CONFIG_DIRECTORY ??= app.getPath('userData')


import 'v8-compile-cache'
import 'source-map-support/register'
import './sentry'
import './lru'
import { parseArgs } from './cli'
import { Application } from './app'
import electronDebug from 'electron-debug'
import { loadConfig } from './config'


const argv = parseArgs(process.argv, process.cwd())

// eslint-disable-next-line @typescript-eslint/init-declarations
let configStore: any

try {
    configStore = loadConfig()
} catch (err) {
    dialog.showErrorBox('Could not read config', err.message)
    app.exit(1)
}

process.mainModule = module

const application = new Application(configStore)

const protocolScheme = isDevVariant ? 'tabitha-dev' : 'tabitha'
// Register tabitha:// URL scheme
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [process.argv[1]])
    }
} else {
    app.setAsDefaultProtocolClient(protocolScheme)
}

ipcMain.on('app:new-window', () => {
    application.newWindow()
})

process.on('uncaughtException' as any, err => {
    console.log(err)
    application.broadcast('uncaughtException', err)
})

if (argv.d) {
    electronDebug({
        isEnabled: true,
        showDevTools: true,
        devToolsMode: 'undocked',
    })
}

app.on('activate', async () => {
    if (!application.hasWindows()) {
        application.newWindow()
    } else {
        application.focus()
    }
})

// Handle URL scheme on macOS
app.on('open-url', async (event, url) => {
    event.preventDefault()
    console.log('Received open-url event:', url)
    if (!application.hasWindows()) {
        process.argv.push(url)
    } else {
        await app.whenReady()
        application.handleSecondInstance([url], process.cwd())
    }
})

app.on('second-instance', async (_event, newArgv, cwd) => {
    application.handleSecondInstance(newArgv, cwd)
})

if (!app.requestSingleInstanceLock()) {
    app.quit()
    app.exit(0)
}

app.on('ready', async () => {
    if (process.platform === 'darwin') {
        app.dock.setMenu(Menu.buildFromTemplate([
            {
                label: 'New window',
                click () {
                    this.app.newWindow()
                },
            },
        ]))
    }

    application.init()

    const window = await application.newWindow({ hidden: argv.hidden })
    await window.ready
    window.passCliArguments(process.argv, process.cwd(), false)
    window.focus()
})
