#!/usr/bin/env node
import { build as builder } from 'electron-builder'
import * as vars from './vars.mjs'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

const isTag = (process.env.GITHUB_REF || process.env.BUILD_SOURCEBRANCH || '').startsWith('refs/tags/')
const keypair = process.env.SM_KEYPAIR_ALIAS

process.env.ARCH = process.env.ARCH || process.arch

const projectRoot = process.cwd()
const baseConfigPath = path.join(projectRoot, 'electron-builder.yml')
const devConfigPath = path.join(projectRoot, 'electron-builder.dev.yml')

const baseConfig = yaml.load(fs.readFileSync(baseConfigPath, 'utf8'))
const devConfig = yaml.load(fs.readFileSync(devConfigPath, 'utf8'))
if (devConfig && typeof devConfig === 'object') {
    delete devConfig.extends
}

const mergeDeep = (target, source) => {
    if (Array.isArray(target) || Array.isArray(source)) {
        return source === undefined ? target : source
    }
    if (typeof target !== 'object' || target === null) {
        return source === undefined ? target : source
    }
    if (typeof source !== 'object' || source === null) {
        return source === undefined ? target : source
    }

    const result = { ...target }
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
            continue
        }
        result[key] = mergeDeep(target[key], value)
    }
    return result
}

const config = mergeDeep(baseConfig, devConfig)

console.log('Signing enabled:', !!keypair)
execSync('node scripts/prepackage-plugins.mjs', { stdio: 'inherit' })

builder({
    dir: true,
    win: ['nsis', 'zip'],
    arm64: process.env.ARCH === 'arm64',
    config: {
        ...config,
        extraMetadata: {
            ...(config.extraMetadata || {}),
            version: vars.version,
        },
        publish: process.env.KEYGEN_TOKEN ? [
            vars.keygenConfig,
            {
                provider: 'github',
                channel: `latest-${process.env.ARCH}`,
            },
        ] : undefined,
        forceCodeSigning: !!keypair,
        win: {
            ...(config.win || {}),
            signtoolOptions: {
                ...((config.win && config.win.signtoolOptions) || {}),
                certificateSha1: process.env.SM_CODE_SIGNING_CERT_SHA1_HASH,
                publisherName: process.env.SM_PUBLISHER_NAME,
                signingHashAlgorithms: ['sha256'],
                sign: keypair ? async function (configuration) {
                    console.log('Signing', configuration)
                    if (configuration.path) {
                        try {
                            const cmd = `smctl sign --keypair-alias=${keypair} --input "${String(configuration.path)}"`
                            console.log(cmd)
                            const out = execSync(cmd)
                            if (out.toString().includes('FAILED')) {
                                throw new Error(out.toString())
                            }
                            console.log(out.toString())
                        } catch (e) {
                            console.error(`Failed to sign ${configuration.path}`)
                            if (e.stdout) {
                                console.error('stdout:', e.stdout.toString())
                            }
                            if (e.stderr) {
                                console.error('stderr:', e.stderr.toString())
                            }
                            console.error(e)
                            process.exit(1)
                        }
                    }
                } : undefined,
            },
        },
    },

    publish: (process.env.KEYGEN_TOKEN && isTag) ? 'always' : 'never',
}).catch(e => {
    console.error(e)
    process.exit(1)
})
