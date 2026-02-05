import * as path from 'path'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

import config from '../webpack.plugin.config.mjs'

export default () => {
    const cfg = config({
        name: 'theme-hype',
        dirname: __dirname,
    })
    cfg.resolve = cfg.resolve ?? {}
    cfg.resolve.modules = [
        ...(cfg.resolve.modules || []),
        path.resolve(__dirname, '../tabby-core/node_modules'),
    ]
    return cfg
}
