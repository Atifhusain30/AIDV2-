/**
 * G2 / G3 / G5: the native projects declare only the permissions AID uses, with honest usage
 * strings, plus the iOS privacy manifest and export-compliance flag. The checks live in
 * scripts/check-native-permissions.mjs (also runnable as `npm run check:native`); this test runs
 * them on the real files and proves each rule catches a regression.
 */
import { describe, expect, it } from 'vitest'
// @ts-ignore -- plain Node ESM script without type declarations
import { auditNative, readRepo, plistEntries } from '../scripts/check-native-permissions.mjs'

declare const process: { cwd(): string }
type Files = {
  packageJson: string; infoPlist: string; privacyManifest: string | null; pbxproj: string; androidManifest: string
}
const real = (): Files => readRepo(process.cwd())
const audit = (files: Files): string[] => auditNative(files)
const addPlistKey = (plist: string, xml: string) => plist.replace('</dict>\n</plist>', `${xml}\n</dict>\n</plist>`)
const addPermission = (manifest: string, name: string) =>
  manifest.replace('</manifest>', `    <uses-permission android:name="${name}" />\n</manifest>`)

describe('native permissions and privacy declarations', () => {
  it('the committed iOS and Android projects pass every rule', () => {
    expect(audit(real())).toEqual([])
  })

  it('iOS asks only for When-In-Use location, with a specific explanation for customers and drivers', () => {
    const plist = plistEntries(real().infoPlist)
    expect(plist.NSLocationWhenInUseUsageDescription).toMatch(/pickup/)
    expect(plist.NSLocationWhenInUseUsageDescription).toMatch(/driver/)
    for (const key of ['NSLocationAlwaysAndWhenInUseUsageDescription', 'NSLocationAlwaysUsageDescription', 'UIBackgroundModes',
      'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription']) {
      expect(plist, key).not.toHaveProperty(key)
    }
    expect(plist.ITSAppUsesNonExemptEncryption).toBe('<false/>')
  })

  it('fails when Always location or background location comes back', () => {
    const files = real()
    expect(audit({ ...files, infoPlist: addPlistKey(files.infoPlist, '\t<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n\t<string>x</string>') }).join())
      .toMatch(/NSLocationAlwaysAndWhenInUseUsageDescription/)
    expect(audit({ ...files, infoPlist: addPlistKey(files.infoPlist, '\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>') }).join())
      .toMatch(/UIBackgroundModes/)
    expect(audit({ ...files, androidManifest: addPermission(files.androidManifest, 'android.permission.ACCESS_BACKGROUND_LOCATION') }).join())
      .toMatch(/ACCESS_BACKGROUND_LOCATION/)
  })

  it('fails when a used plugin has no usage string, or an unused feature declares one', () => {
    const files = real()
    const noLocation = files.infoPlist.replace(/<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]*<\/string>/, '')
    expect(audit({ ...files, infoPlist: noLocation }).join()).toMatch(/NSLocationWhenInUseUsageDescription is missing/)
    expect(audit({ ...files, infoPlist: addPlistKey(files.infoPlist, '\t<key>NSCameraUsageDescription</key>\n\t<string>x</string>') }).join())
      .toMatch(/NSCameraUsageDescription declared but @capacitor\/camera is not used/)
    const withCamera = files.packageJson.replace('"dependencies": {', '"dependencies": {\n    "@capacitor/camera": "8.0.0",')
    expect(audit({ ...files, packageJson: withCamera }).join()).toMatch(/NSCameraUsageDescription is missing/)
  })

  it('fails when the privacy manifest is missing, not bundled, or claims tracking', () => {
    const files = real()
    expect(audit({ ...files, privacyManifest: null }).join()).toMatch(/PrivacyInfo.xcprivacy is missing/)
    expect(audit({ ...files, pbxproj: files.pbxproj.replace(/.*PrivacyInfo\.xcprivacy in Resources \*\/,\n/, '') }).join())
      .toMatch(/not in the App target Resources/)
    const tracking = files.privacyManifest!.replace(/<key>NSPrivacyTracking<\/key>\s*<false\/>/, '<key>NSPrivacyTracking</key>\n\t<true/>')
    expect(audit({ ...files, privacyManifest: tracking }).join()).toMatch(/NSPrivacyTracking must be false/)
  })

  it('Android: storage/camera permissions, backups and cleartext stay off', () => {
    const files = real()
    expect(audit({ ...files, androidManifest: addPermission(files.androidManifest, 'android.permission.READ_EXTERNAL_STORAGE') }).join())
      .toMatch(/READ_EXTERNAL_STORAGE/)
    expect(audit({ ...files, androidManifest: files.androidManifest.replace('android:allowBackup="false"', 'android:allowBackup="true"') }).join())
      .toMatch(/allowBackup/)
    expect(audit({ ...files, androidManifest: files.androidManifest.replace('android:usesCleartextTraffic="false"', '') }).join())
      .toMatch(/usesCleartextTraffic/)
    expect(audit({ ...files, androidManifest: files.androidManifest.replace(/.*SCHEDULE_EXACT_ALARM.*\n/, '') }).join())
      .toMatch(/SCHEDULE_EXACT_ALARM/)
  })

  it('Android: password-reset links (com.aid.roadside://auth/…) open the app', () => {
    expect(real().androidManifest).toMatch(/<data android:scheme="com\.aid\.roadside" android:host="auth" \/>/)
  })
})
