import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { Injectable } from '@angular/core'
import { Theme } from './api'

/** @hidden */
@Injectable({ providedIn: 'root' })
export class NewTheme extends Theme {
    name = _('Follow the color scheme')
    css = require('./theme.new.scss')
    terminalBackground = '#f7f1e0'
    followsColorScheme = true
}

/** @hidden */
@Injectable({ providedIn: 'root' })
export class HypeTheme extends Theme {
    name = _('Hype')
    css = require('./theme.hype.scss')
    terminalBackground = '#010101'
}
