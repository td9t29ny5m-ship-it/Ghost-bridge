#!/usr/bin/env node
/*
 * Applies the store-required native settings to the generated Capacitor projects.
 * Safe to run repeatedly. Run after `npx cap add android|ios`.
 *
 * Set your real AdMob App IDs before a release build:
 *   ADMOB_ANDROID_APP_ID=ca-app-pub-xxx~yyy ADMOB_IOS_APP_ID=ca-app-pub-xxx~zzz node tools/configure-native.js
 * The defaults are Google's public TEST app IDs.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ANDROID_APP_ID = process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
const IOS_APP_ID = process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511';

function patchAndroid() {
  const file = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(file)) return console.log('android: not present, skipped');
  let xml = fs.readFileSync(file, 'utf8');

  const meta = 'com.google.android.gms.ads.APPLICATION_ID';
  if (xml.includes(meta)) {
    xml = xml.replace(new RegExp(`(android:name="${meta}"\\s+android:value=")[^"]*(")`), `$1${ANDROID_APP_ID}$2`);
  } else {
    xml = xml.replace(/(<application[^>]*>)/, `$1\n\n        <meta-data\n            android:name="${meta}"\n            android:value="${ANDROID_APP_ID}" />`);
  }
  if (!xml.includes('android:screenOrientation')) {
    xml = xml.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
  }
  if (!xml.includes('com.google.android.gms.permission.AD_ID')) {
    xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />',
      '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="com.google.android.gms.permission.AD_ID" />');
  }
  fs.writeFileSync(file, xml);
  console.log('android: AndroidManifest.xml configured (AdMob ' + ANDROID_APP_ID + ')');
}

function plistSet(xml, key, valueXml) {
  const re = new RegExp(`\\t<key>${key}</key>\\n\\t(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?\\n\\t</array>)`);
  const entry = `\t<key>${key}</key>\n\t${valueXml}`;
  if (re.test(xml)) return xml.replace(re, entry);
  return xml.replace(/\n<\/dict>\n<\/plist>\s*$/, `\n${entry}\n</dict>\n</plist>\n`);
}

function patchIOS() {
  const file = path.join(root, 'ios/App/App/Info.plist');
  if (!fs.existsSync(file)) return console.log('ios: not present, skipped');
  let xml = fs.readFileSync(file, 'utf8');
  xml = plistSet(xml, 'GADApplicationIdentifier', `<string>${IOS_APP_ID}</string>`);
  xml = plistSet(xml, 'NSUserTrackingUsageDescription',
    '<string>Your data is used to show more relevant ads for optional rewarded videos.</string>');
  xml = plistSet(xml, 'SKAdNetworkItems',
    '<array>\n\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>cstr6suwn9.skadnetwork</string>\n\t\t</dict>\n\t</array>');
  xml = plistSet(xml, 'ITSAppUsesNonExemptEncryption', '<false/>');
  xml = plistSet(xml, 'UIRequiresFullScreen', '<true/>');
  xml = plistSet(xml, 'UISupportedInterfaceOrientations',
    '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>');
  xml = plistSet(xml, 'UISupportedInterfaceOrientations~ipad',
    '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t</array>');
  xml = plistSet(xml, 'UIStatusBarStyle', '<string>UIStatusBarStyleLightContent</string>');
  fs.writeFileSync(file, xml);
  console.log('ios: Info.plist configured (AdMob ' + IOS_APP_ID + ')');
}

patchAndroid();
patchIOS();
