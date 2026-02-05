const fs = require('fs')
const path = require('path')
const { NtExecutable, NtExecutableResource } = require('pe-library')
const ResEdit = require('resedit')

module.exports = async function afterPack (context) {
    if (context.electronPlatformName !== 'win32') {
        return
    }

    const exeName = `${context.packager.appInfo.productFilename}.exe`
    const exePath = path.join(context.appOutDir, exeName)
    const projectDir = context.projectDir || context.packager?.projectDir || context.packager?.info?.projectDir || process.cwd()
    const iconPath = path.resolve(projectDir, 'build', 'windows', 'icon.ico')

    if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
        return
    }

    const data = fs.readFileSync(exePath)
    const exe = NtExecutable.from(data, { ignoreCert: true })
    const res = NtExecutableResource.from(exe)
    const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath))
    const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
    const lang = 1033
    const groupIds = iconGroups.length ? iconGroups.map(group => group.id) : [1]

    for (const id of groupIds) {
        ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
            res.entries,
            id,
            lang,
            iconFile.icons.map(item => item.data),
        )
    }

    res.outputResource(exe)
    fs.writeFileSync(exePath, Buffer.from(exe.generate()))
}
