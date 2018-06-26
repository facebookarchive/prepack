/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

/* eslint-disable no-undef */

// $FlowFixMe: ignore line
require.requireActual("../node_modules/react-native/Libraries/polyfills/error-guard");
// $FlowFixMe: ignore line
jest.setMock("ErrorUtils", require.requireActual("../node_modules/react-native/Libraries/vendor/core/ErrorUtils.js"));

global.__DEV__ = true;

const mockNativeModules = {
  AlertManager: {
    alertWithArgs: jest.fn(),
  },
  AppState: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  AsyncLocalStorage: {
    multiGet: jest.fn((keys, callback) => process.nextTick(() => callback(null, []))),
    multiSet: jest.fn((entries, callback) => process.nextTick(() => callback(null))),
    multiRemove: jest.fn((keys, callback) => process.nextTick(() => callback(null))),
    multiMerge: jest.fn((entries, callback) => process.nextTick(() => callback(null))),
    clear: jest.fn(callback => process.nextTick(() => callback(null))),
    getAllKeys: jest.fn(callback => process.nextTick(() => callback(null, []))),
  },
  BuildInfo: {
    appVersion: "0",
    buildVersion: "0",
  },
  Clipboard: {
    setString: jest.fn(),
  },
  DataManager: {
    queryData: jest.fn(),
  },
  DeviceInfo: {
    Dimensions: {
      window: {
        fontScale: 2,
        height: 1334,
        scale: 2,
        width: 750,
      },
      screen: {
        fontScale: 2,
        height: 1334,
        scale: 2,
        width: 750,
      },
    },
  },
  FacebookSDK: {
    login: jest.fn(),
    logout: jest.fn(),
    queryGraphPath: jest.fn((path, method, params, callback) => callback()),
  },
  FbRelayNativeAdapter: {
    updateCLC: jest.fn(),
  },
  GraphPhotoUpload: {
    upload: jest.fn(),
  },
  I18n: {
    translationsDictionary: JSON.stringify({
      "Good bye, {name}!|Bye message": "\u{00A1}Adi\u{00F3}s {name}!",
    }),
  },
  ImageLoader: {
    getSize: jest.fn(url => Promise.resolve({ width: 320, height: 240 })),
    prefetchImage: jest.fn(),
  },
  ImageViewManager: {
    getSize: jest.fn((uri, success) => process.nextTick(() => success(320, 240))),
    prefetchImage: jest.fn(),
  },
  KeyboardObserver: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
    addEventListener: jest.fn(),
    getInitialURL: jest.fn(() => Promise.resolve()),
    removeEventListener: jest.fn(),
  },
  LocationObserver: {
    getCurrentPosition: jest.fn(),
    startObserving: jest.fn(),
    stopObserving: jest.fn(),
  },
  ModalFullscreenViewManager: {},
  NetInfo: {
    fetch: jest.fn(() => Promise.resolve()),
    getConnectionInfo: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    isConnected: {
      fetch: jest.fn(() => Promise.resolve()),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    isConnectionExpensive: jest.fn(() => Promise.resolve()),
  },
  Networking: {
    sendRequest: jest.fn(),
    abortRequest: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
  PushNotificationManager: {
    presentLocalNotification: jest.fn(),
    scheduleLocalNotification: jest.fn(),
    cancelAllLocalNotifications: jest.fn(),
    removeAllDeliveredNotifications: jest.fn(),
    getDeliveredNotifications: jest.fn(callback => process.nextTick(() => [])),
    removeDeliveredNotifications: jest.fn(),
    setApplicationIconBadgeNumber: jest.fn(),
    getApplicationIconBadgeNumber: jest.fn(callback => process.nextTick(() => callback(0))),
    cancelLocalNotifications: jest.fn(),
    getScheduledLocalNotifications: jest.fn(callback => process.nextTick(() => callback())),
    requestPermissions: jest.fn(() =>
      Promise.resolve({
        alert: true,
        badge: true,
        sound: true,
      })
    ),
    abandonPermissions: jest.fn(),
    checkPermissions: jest.fn(callback =>
      process.nextTick(() =>
        callback({
          alert: true,
          badge: true,
          sound: true,
        })
      )
    ),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
  SourceCode: {
    scriptURL: null,
  },
  StatusBarManager: {
    HEIGHT: 42,
    setColor: jest.fn(),
    setStyle: jest.fn(),
    setHidden: jest.fn(),
    setNetworkActivityIndicatorVisible: jest.fn(),
    setBackgroundColor: jest.fn(),
    setTranslucent: jest.fn(),
  },
  Timing: {
    createTimer: jest.fn(),
    deleteTimer: jest.fn(),
  },
  UIManager: {
    AndroidViewPager: {
      Commands: {
        setPage: jest.fn(),
        setPageWithoutAnimation: jest.fn(),
      },
    },
    blur: jest.fn(),
    createView: jest.fn(),
    dispatchViewManagerCommand: jest.fn(),
    focus: jest.fn(),
    setChildren: jest.fn(),
    manageChildren: jest.fn(),
    updateView: jest.fn(),
    removeSubviewsFromContainerWithID: jest.fn(),
    replaceExistingNonRootView: jest.fn(),
    customBubblingEventTypes: {},
    customDirectEventTypes: {},
    AndroidTextInput: {
      Commands: {},
    },
    ModalFullscreenView: {
      Constants: {},
    },
    ScrollView: {
      Constants: {},
    },
    View: {
      Constants: {},
    },
    // This was added in to make RCTVirtualText inline
    // so we also need this to ensure tests pass
    RCTVirtualText: {},
  },
  BlobModule: {
    BLOB_URI_SCHEME: "content",
    BLOB_URI_HOST: null,
    addNetworkingHandler: jest.fn(),
    enableBlobSupport: jest.fn(),
    disableBlobSupport: jest.fn(),
    createFromParts: jest.fn(),
    sendBlob: jest.fn(),
    release: jest.fn(),
  },
  WebSocketModule: {
    connect: jest.fn(),
    send: jest.fn(),
    sendBinary: jest.fn(),
    ping: jest.fn(),
    close: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
};

Object.keys(mockNativeModules).forEach(module => {
  try {
    jest.doMock(module, () => mockNativeModules[module]); // needed by FacebookSDK-test
  } catch (e) {
    jest.doMock(module, () => mockNativeModules[module], { virtual: true });
  }
});

jest.doMock("NativeModules", () => mockNativeModules);

// $FlowFixMe: ignore line
const StyleSheet = require.requireActual("../node_modules/react-native/Libraries/StyleSheet/StyleSheet.js");

jest.doMock("StyleSheet", () => Object.assign({}, StyleSheet, {
  create(obj) {
    return obj;
  },
}));
