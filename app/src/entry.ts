import 'zone.js'
import 'core-js/proposals/reflect-metadata'
import 'rxjs'

import './global.scss'
import './toastr.scss'

// Importing before @angular/*
import { findPlugins, initModuleLookup, loadPlugins } from './plugins'

import { enableProdMode, NgModuleRef, ApplicationRef } from '@angular/core'
import { enableDebugTools } from '@angular/platform-browser'
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'
import { ipcRenderer } from 'electron'

import { getRootModule } from './app.module'
import { BootstrapData, BOOTSTRAP_DATA, PluginInfo } from '../../tabby-core/src/api/mainProcess'
import { AppService } from '../../tabby-core/src/services/app.service'
import { ProfilesService } from '../../tabby-core/src/services/profiles.service'
import { ConfigService } from '../../tabby-core/src/services/config.service'
import { LogService } from '../../tabby-core/src/services/log.service'

// Always land on the start view
location.hash = ''

;(process as any).enablePromiseAPI = true

window.addEventListener('error', (event: ErrorEvent) => {
    const err = event.error as any
    const details = err?.stack ?? err ?? event.message
    console.error('window.error', details)
})

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = (event as any).reason
    const details = reason?.stack ?? reason
    console.error('unhandledrejection', details)
})

const originalConsoleError = console.error.bind(console)
console.error = (...args: any[]) => {
    originalConsoleError(...args)
    if (args[0] === 'ERROR' && args[1]?.stack) {
        originalConsoleError('ERROR_STACK', args[1].stack)
    }
}

if (process.platform === 'win32' && !('HOME' in process.env)) {
    process.env.HOME = `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
}

if (process.env.TABBY_DEV && !process.env.TABBY_FORCE_ANGULAR_PROD) {
    console.warn('Running in debug mode')
} else {
    enableProdMode()
}

async function bootstrap (bootstrapData: BootstrapData, plugins: PluginInfo[], safeMode = false): Promise<NgModuleRef<any>> {
    if (safeMode) {
        plugins = plugins.filter(x => x.isBuiltin)
    }

    const pluginModules = await loadPlugins(plugins, (current, total) => {
        (document.querySelector('.progress .bar') as HTMLElement).style.width = `${100 * current / total}%` // eslint-disable-line
    })

    window['pluginModules'] = pluginModules

    const module = getRootModule(pluginModules)
    const moduleRef = await platformBrowserDynamic([
        { provide: BOOTSTRAP_DATA, useValue: bootstrapData },
    ]).bootstrapModule(module)
    if (process.env.TABBY_DEV) {
        const applicationRef = moduleRef.injector.get(ApplicationRef)
        const componentRef = applicationRef.components[0]
        enableDebugTools(componentRef)
    }
    return moduleRef
}

let resolveModuleRef: ((m: NgModuleRef<any>) => void) | null = null
const moduleRefPromise = new Promise<NgModuleRef<any>>(resolve => {
    resolveModuleRef = resolve
})

const runSelfTest = async () => {
    const moduleRef = await moduleRefPromise
    const app = moduleRef.injector.get(AppService)
    const profiles = moduleRef.injector.get(ProfilesService)
    const config = moduleRef.injector.get(ConfigService)
    const log = moduleRef.injector.get(LogService).create('selftest')

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    const allProfiles = await profiles.getProfiles()
    let profile = allProfiles.find(x => x.id === config.store.terminal.profile)
    if (!profile) {
        profile = allProfiles.find(x => x.type === 'local')
    }

    const tab1 = profile ? await profiles.openNewTabForProfile(profile) : null
    const tab2 = profile ? await profiles.openNewTabForProfile(profile) : null
    const tabs = [tab1, tab2].filter(Boolean)

    if (!tabs.length) {
        log.error('self-test: no tabs created')
        ipcRenderer.send('app:self-test-result', { ok: false, reason: 'no-tabs' })
        return
    }

    for (let i = 0; i < 2; i++) {
        const tab = tabs[i % tabs.length] as any
        app.selectTab(tab)
        await sleep(1200)

        const frontend = tab.frontend
        if (frontend?.ensureRendererAlive) {
            frontend.ensureRendererAlive()
        }

        await sleep(500)
        const element = frontend?.xterm?.element as HTMLElement | undefined
        const canvas = element?.querySelector('canvas') as HTMLCanvasElement | null
        const ok = !!(element && canvas && canvas.width > 0 && canvas.height > 0)

        log.info('self-test check', {
            ok,
            canvasWidth: canvas?.width,
            canvasHeight: canvas?.height,
        })

        if (!ok) {
            ipcRenderer.send('app:self-test-result', { ok: false, reason: 'blank-canvas', step: i })
            return
        }

        // Wait long enough to cross the 30s idle threshold
        await sleep(35000)
    }

    ipcRenderer.send('app:self-test-result', { ok: true })
}

window['tabithaSelfTestRun'] = runSelfTest
ipcRenderer.on('host:self-test', runSelfTest)

ipcRenderer.once('start', async (_$event, bootstrapData: BootstrapData) => {
    console.log('Window bootstrap data:', bootstrapData)

    initModuleLookup(bootstrapData.userPluginsPath)

    let plugins = await findPlugins()
    bootstrapData.installedPlugins = plugins
    if (bootstrapData.config.pluginBlacklist) {
        plugins = plugins.filter(x => !bootstrapData.config.pluginBlacklist.includes(x.name))
    }
    plugins = plugins.filter(x => x.name !== 'web')

    console.log('Starting with plugins:', plugins)
    try {
        const moduleRef = await bootstrap(bootstrapData, plugins)
        resolveModuleRef?.(moduleRef)
    } catch (error) {
        console.error('Angular bootstrapping error:', error)
        console.warn('Trying safe mode')
        window['safeModeReason'] = error
        try {
            const moduleRef = await bootstrap(bootstrapData, plugins, true)
            resolveModuleRef?.(moduleRef)
        } catch (error2) {
            console.error('Bootstrap failed:', error2)
        }
    }
})

ipcRenderer.send('ready')
