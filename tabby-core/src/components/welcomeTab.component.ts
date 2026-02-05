/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Injector } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import { BaseTabComponent } from './baseTab.component'
import { ConfigService } from '../services/config.service'
import { LocaleService } from '../services/locale.service'

/** @hidden */
@Component({
    selector: 'welcome-page',
    templateUrl: './welcomeTab.component.pug',
    styleUrls: ['./welcomeTab.component.scss'],
})
export class WelcomeTabComponent extends BaseTabComponent {
    enableGlobalHotkey = true
    allLanguages = LocaleService.allLanguages
    logoSvg: any

    constructor (
        public config: ConfigService,
        public locale: LocaleService,
        private domSanitizer: DomSanitizer,
        translate: TranslateService,
        injector: Injector,
    ) {
        super(injector)
        this.logoSvg = this.domSanitizer.bypassSecurityTrustHtml(require('../assets/logo.svg'))
        this.setTitle(translate.instant('Welcome'))
    }

    async closeAndDisable () {
        this.config.store.enableWelcomeTab = false
        this.config.store.pluginBlacklist = []
        if (!this.enableGlobalHotkey) {
            this.config.store.hotkeys['toggle-window'] = []
        }
        await this.config.save()
        this.destroy()
    }
}
