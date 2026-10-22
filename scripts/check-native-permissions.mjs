#!/usr/bin/env node
/**
 * G2/G3/G5 guard: native permissions and privacy declarations must match what AID actually does.
 *
 * - iOS: only "When In Use" location (no Always location, no background location mode); every
 *   used plugin has its usage string; no usage strings for features AID doesn't use (camera,
 *   photo library — documents come from PHPicker/Files, which need no permission);
 *   ITSAppUsesNonExemptEncryption = false; PrivacyInfo.xcprivacy exists, says "no tracking" and is
 *   bundled (listed in the Xcode project's Resources phase).
 * - Android: fine + coarse location, POST_NOTIFICATIONS, no background location / storage / media /
 *   camera permissions, SCHEDULE_EXACT_ALARM removed, backups off, cleartext off.
 *
 * Usage: node scripts/check-native-permissions.mjs   (also run by src/nativePermissions.test.ts)
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const stripXmlComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '')

/** Top-level-ish plist reader: returns { key: rawValueXml } for every <key> in the file. */
export function plistEntries(xml) {
  const body = stripXmlComments(xml)
  const entries = {}
  const re = /<key>([^<]+)<\/key>\s*(<string>([\s\S]*?)<\/string>|<true\/>|<false\/>|<array\/>|<array>[\s\S]*?<\/array>|<dict>[\s\S]*?<\/dict>)/g
  let m
  while ((m = re.exec(body))) entries[m[1]] = m[3] !== undefined ? m[3] : m[2]
  return entries
}

const IOS_USAGE_BY_PLUGIN = {
  '@capacitor/geolocation': ['NSLocationWhenInUseUsageDescription'],
  '@capacitor/camera': ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription'],
}
const IOS_FORBIDDEN_KEYS = [
  'NSLocationAlwaysUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
]
const IOS_UNUSED_UNLESS_PLUGIN = {
  NSCameraUsageDescription: '@capacitor/camera',
  NSPhotoLibraryUsageDescription: '@capacitor/camera',
  NSMicrophoneUsageDescription: '@capacitor/camera',
}

const ANDROID_REQUIRED_BY_PLUGIN = {
  '@capacitor/geolocation': ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
  '@capacitor/local-notifications': ['android.permission.POST_NOTIFICATIONS'],
}
const ANDROID_FORBIDDEN = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.CAMERA',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
]

/** Pure check over file contents. Returns a list of human-readable problems (empty = OK). */
export function auditNative({ packageJson, infoPlist, privacyManifest, pbxproj, androidManifest }) {
  const errors = []
  const pkg = JSON.parse(packageJson)
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  const uses = (name) => Object.prototype.hasOwnProperty.call(deps, name)

  // ---- iOS Info.plist
  const plist = plistEntries(infoPlist)
  for (const [plugin, keys] of Object.entries(IOS_USAGE_BY_PLUGIN)) {
    if (!uses(plugin)) continue
    for (const key of keys) {
      const value = plist[key]
      if (typeof value !== 'string' || value.trim().length < 40) errors.push(`iOS: ${plugin} is used but ${key} is missing or too short to explain why`)
    }
  }
  for (const key of IOS_FORBIDDEN_KEYS) if (key in plist) errors.push(`iOS: ${key} must not be declared (AID has no background location / never saves photos)`)
  for (const [key, plugin] of Object.entries(IOS_UNUSED_UNLESS_PLUGIN)) {
    if (key in plist && !uses(plugin)) errors.push(`iOS: ${key} declared but ${plugin} is not used`)
  }
  if (/<string>location<\/string>/.test(plist.UIBackgroundModes || '')) errors.push('iOS: UIBackgroundModes must not include location')
  if (plist.ITSAppUsesNonExemptEncryption !== '<false/>') errors.push('iOS: ITSAppUsesNonExemptEncryption must be false')
  if (/armv7/.test(plist.UIRequiredDeviceCapabilities || '')) errors.push('iOS: UIRequiredDeviceCapabilities must be arm64, not armv7')

  // ---- iOS privacy manifest
  if (!privacyManifest) {
    errors.push('iOS: ios/App/App/PrivacyInfo.xcprivacy is missing')
  } else {
    const pm = plistEntries(privacyManifest)
    if (pm.NSPrivacyTracking !== '<false/>') errors.push('iOS privacy manifest: NSPrivacyTracking must be false')
    if (!/NSPrivacyCollectedDataTypePreciseLocation/.test(privacyManifest)) errors.push('iOS privacy manifest: precise location must be declared')
    if (/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/.test(privacyManifest)) errors.push('iOS privacy manifest: no data type may be used for tracking')
    if (uses('@capawesome/capacitor-file-picker') && !/NSPrivacyAccessedAPICategoryFileTimestamp/.test(privacyManifest)) {
      errors.push('iOS privacy manifest: file picker reads file timestamps — declare NSPrivacyAccessedAPICategoryFileTimestamp')
    }
  }
  if (!/PrivacyInfo\.xcprivacy in Resources \*\/,/.test(pbxproj)) errors.push('iOS: PrivacyInfo.xcprivacy is not in the App target Resources build phase (it would not ship)')

  // ---- Android manifest
  const manifest = stripXmlComments(androidManifest)
  const declared = new Set()
  const removed = new Set()
  for (const m of manifest.matchAll(/<uses-permission\b([^>]*)\/?>/g)) {
    const name = /android:name="([^"]+)"/.exec(m[1])?.[1]
    if (!name) continue
    if (/tools:node="remove"/.test(m[1])) removed.add(name)
    else declared.add(name)
  }
  for (const [plugin, perms] of Object.entries(ANDROID_REQUIRED_BY_PLUGIN)) {
    if (!uses(plugin)) continue
    for (const p of perms) if (!declared.has(p)) errors.push(`Android: ${plugin} is used but ${p} is not declared`)
  }
  for (const p of ANDROID_FORBIDDEN) if (declared.has(p)) errors.push(`Android: ${p} must not be declared`)
  if (uses('@capacitor/local-notifications') && !removed.has('android.permission.SCHEDULE_EXACT_ALARM')) {
    errors.push('Android: remove the plugin-merged SCHEDULE_EXACT_ALARM with tools:node="remove"')
  }
  const app = /<application\b([^>]*)>/.exec(manifest)?.[1] || ''
  if (!/android:allowBackup="false"/.test(app)) errors.push('Android: android:allowBackup must be "false"')
  if (!/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(app)) errors.push('Android: dataExtractionRules must exclude everything')
  if (!/android:usesCleartextTraffic="false"/.test(app)) errors.push('Android: android:usesCleartextTraffic must be "false"')
  return errors
}

export function readRepo(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8')
  const pmPath = join(root, 'ios/App/App/PrivacyInfo.xcprivacy')
  return {
    packageJson: read('package.json'),
    infoPlist: read('ios/App/App/Info.plist'),
    privacyManifest: existsSync(pmPath) ? readFileSync(pmPath, 'utf8') : null,
    pbxproj: read('ios/App/App.xcodeproj/project.pbxproj'),
    androidManifest: read('android/app/src/main/AndroidManifest.xml'),
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const errors = auditNative(readRepo(root))
  if (errors.length) {
    console.error(`Native permission check failed (${errors.length}):\n- ${errors.join('\n- ')}`)
    process.exit(1)
  }
  console.log('Native permission check passed (iOS Info.plist, PrivacyInfo.xcprivacy, AndroidManifest.xml).')
}
