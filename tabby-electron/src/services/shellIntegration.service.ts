import * as path from 'path'
import * as fs from 'mz/fs'
import { exec } from 'mz/child_process'
import { Injectable } from '@angular/core'
import { HostAppService, Platform } from 'tabby-core'
import { ElectronService } from '../services/electron.service'

/* eslint-disable block-scoped-var */

try {
    var wnr = require('windows-native-registry') // eslint-disable-line @typescript-eslint/no-var-requires, no-var
} catch (_) { }

@Injectable({ providedIn: 'root' })
export class ShellIntegrationService {
    private automatorWorkflows = ['Open Tabitha here.workflow', 'Paste path into Tabitha.workflow']
    private automatorWorkflowsLocation: string
    private automatorWorkflowsDestination: string
    private registryKeys = [
        {
            path: 'Software\\Classes\\Directory\\Background\\shell\\Tabitha',
            value: 'Open Tabitha here',
            command: 'open "%V"',
        },
        {
            path: 'SOFTWARE\\Classes\\Directory\\shell\\Tabitha',
            value: 'Open Tabitha here',
            command: 'open "%V"',
        },
        {
            path: 'Software\\Classes\\*\\shell\\Tabitha',
            value: 'Paste path into Tabitha',
            command: 'paste "%V"',
        },
    ]

    private constructor (
        private electron: ElectronService,
        private hostApp: HostAppService,
    ) {
        if (this.hostApp.platform === Platform.macOS) {
            this.automatorWorkflowsLocation = path.join(
                path.dirname(path.dirname(this.electron.app.getPath('exe'))),
                'Resources',
                'extras',
                'automator-workflows',
            )
            this.automatorWorkflowsDestination = path.join(process.env.HOME!, 'Library', 'Services')
        }
        this.updatePaths()
    }

    async isInstalled (): Promise<boolean> {
        if (this.hostApp.platform === Platform.macOS) {
            return fs.exists(path.join(this.automatorWorkflowsDestination, this.automatorWorkflows[0]))
        } else if (this.hostApp.platform === Platform.Windows) {
            if (!wnr) {
                return false
            }
            return !!wnr.getRegistryKey(wnr.HK.CU, this.registryKeys[0].path)
        }
        return true
    }

    async install (): Promise<void> {
        const exe: string = process.env.PORTABLE_EXECUTABLE_FILE ?? this.electron.app.getPath('exe')
        if (this.hostApp.platform === Platform.macOS) {
            for (const wf of this.automatorWorkflows) {
                await exec(`cp -r "${this.automatorWorkflowsLocation}/${wf}" "${this.automatorWorkflowsDestination}"`)
            }
        } else if (this.hostApp.platform === Platform.Windows) {
            if (!wnr) {
                return
            }
            for (const registryKey of this.registryKeys) {
                wnr.createRegistryKey(wnr.HK.CU, registryKey.path)
                wnr.createRegistryKey(wnr.HK.CU, registryKey.path + '\\command')
                wnr.setRegistryValue(wnr.HK.CU, registryKey.path, '', wnr.REG.SZ, registryKey.value)
                wnr.setRegistryValue(wnr.HK.CU, registryKey.path, 'Icon', wnr.REG.SZ, exe)
                wnr.setRegistryValue(wnr.HK.CU, registryKey.path + '\\command', '', wnr.REG.SZ, exe + ' ' + registryKey.command)
            }

            const legacyKeys = [
                'Software\\Classes\\Directory\\Background\\shell\\Open Tabby here',
                'Software\\Classes\\*\\shell\\Paste path into Tabby',
                'Software\\Classes\\Directory\\Background\\shell\\Tabby',
                'SOFTWARE\\Classes\\Directory\\shell\\Tabby',
                'Software\\Classes\\*\\shell\\Tabby',
            ]
            for (const legacyKey of legacyKeys) {
                if (wnr.getRegistryKey(wnr.HK.CU, legacyKey)) {
                    wnr.deleteRegistryKey(wnr.HK.CU, legacyKey)
                }
            }
        }
    }

    async remove (): Promise<void> {
        if (this.hostApp.platform === Platform.macOS) {
            for (const wf of this.automatorWorkflows) {
                await exec(`rm -rf "${this.automatorWorkflowsDestination}/${wf}"`)
            }
        } else if (this.hostApp.platform === Platform.Windows) {
            if (!wnr) {
                return
            }
            for (const registryKey of this.registryKeys) {
                wnr.deleteRegistryKey(wnr.HK.CU, registryKey.path)
            }
        }
    }

    private async updatePaths (): Promise<void> {
        // Update paths in case of an update
        if (this.hostApp.platform === Platform.Windows) {
            if (await this.isInstalled()) {
                await this.install()
            }
        }
    }
}
