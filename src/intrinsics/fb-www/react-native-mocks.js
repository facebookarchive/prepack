/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import { AbstractValue, ECMAScriptSourceFunctionValue, ObjectValue, StringValue } from "../../values/index.js";
import { Environment } from "../../singletons.js";
import invariant from "../../invariant.js";
import { parseExpression } from "@babel/parser";
import { createOperationDescriptor } from "../../utils/generator.js";

let reactNativeCode = `
  function createReactNative(React, reactNameRequireName) {
    var Platform = __abstract("object", 'require("' + reactNameRequireName + '").Platform');

    var NativeModules = __abstract({
      nativePerformanceNow: __abstract("function"),
      nativeTraceBeginAsyncSection: __abstract("function"),
      nativeTraceEndAsyncSection: __abstract("function"),
      UIManager: __abstract({
        customBubblingEventTypes: __abstract(),
        customDirectEventTypes: __abstract(),
        ViewManagerNames: __abstract(),
        __takeSnapshot: undefined,
        takeSnapshot: undefined,
        RCTVirtualText: null,
      }),
      DeviceInfo: __abstract({
        Dimensions: __abstract({
          window: undefined,
          screen: undefined,
          windowPhysicalPixels: __abstract({
            width: __abstract("number"),
            height: __abstract("number"),
            scale: __abstract("number"),
            fontScale: __abstract("number"),
          }),
          screenPhysicalPixels: __abstract({
            width: __abstract("number"),
            height: __abstract("number"),
            scale: __abstract("number"),
            fontScale: __abstract("number"),
          }),
        }),
      }),
      I18n: __abstract({
        localeCountryCode: __abstract(),
        localeIdentifier: __abstract(),
        fbLocaleIdentifier: __abstract(),
        AdsCountriesConfig: __abstract({}),
        exports: __abstract({}),
      }),
      I18nManager: __abstract({
        isRTL: __abstract("boolean"),
        isRTLForced: __abstract("boolean"),
        doLeftAndRightSwapInRTL: __abstract("boolean"),
        allowRTL: function(allowRTL) {
          return __residual("void", function(allowRTL, global) {
            global.nativeModuleProxy.I18nManager.allowRTL(allowRTL);
          }, allowRTL, global);
        },
        forceRTL: function(forceRTL) {
          return __residual("void", function(forceRTL, global) {
            global.nativeModuleProxy.I18nManager.forceRTL(forceRTL);
          }, forceRTL, global);
        },
        swapLeftAndRightInRTL: function(flipStyles) {
          return __residual("void", function(flipStyles, global) {
            global.nativeModuleProxy.I18nManager.swapLeftAndRightInRTL(flipStyles);
          }, flipStyles, global);
        },
        exports: __abstract({}),
      }),
      DeviceEventManager: __abstract({}),
      Timing: __abstract({
        createTimer: function(id, duration, time, recurring) {
          return __residual("object", function(id, duration, time, recurring, global, Object) {
            global.nativeModuleProxy.Timing.createTimer(id, duration, time, recurring);
            return Object.create(null);
          }, id, duration, time, recurring, global, Object);
        }
      }),
      ExceptionsManager: __abstract({
        reportFatalException: function(message, stack, id) {
          console.log("nativeModuleProxy.ExceptionsManager.reportFatalException");
          console.log(message);
          for (var i = 0; i < stack.length; i++) {
            var s = stack[i];
            console.log("  at " + s.methodName + " (" + s.file + ":" + s.lineNumber + ":" + s.column + ")");
          }
        }
      }),
      PlatformConstants: __abstract({
        isTesting: false,
        reactNativeVersion: __abstract({
          major: 0,
          minor: 0,
          patch: 0,
          prerelease: null,
        }),
        Version: __abstract("number"),
        forceTouchAvailable: undefined,
        uiMode: __abstract(),
      }),
      RelayAPIConfig: __abstract({
        graphBatchURI: __abstract(),
      }),
      SourceCode: __abstract({
        scriptURL: __abstract("string"),
      }),
    }, 'require("' + reactNameRequireName + '").NativeModules');

    const {UIManager} = NativeModules;

    const ReactNativeViewAttributes = {};
    const viewConfigCallbacks = new Map();

    const TextAncestor = React.createContext(false);

    const ReactNativeStyleAttributes = {};

    const dummySize = {width: undefined, height: undefined};

    const sizesDiffer = function(one, two) {
      one = one || dummySize;
      two = two || dummySize;
      return one !== two && (one.width !== two.width || one.height !== two.height);
    };

    ReactNativeStyleAttributes.transform = {process: processTransform};
    ReactNativeStyleAttributes.shadowOffset = {diff: sizesDiffer};

    const colorAttributes = {process: processColor};
    ReactNativeStyleAttributes.backgroundColor = colorAttributes;
    ReactNativeStyleAttributes.borderBottomColor = colorAttributes;
    ReactNativeStyleAttributes.borderColor = colorAttributes;
    ReactNativeStyleAttributes.borderLeftColor = colorAttributes;
    ReactNativeStyleAttributes.borderRightColor = colorAttributes;
    ReactNativeStyleAttributes.borderTopColor = colorAttributes;
    ReactNativeStyleAttributes.borderStartColor = colorAttributes;
    ReactNativeStyleAttributes.borderEndColor = colorAttributes;
    ReactNativeStyleAttributes.color = colorAttributes;
    ReactNativeStyleAttributes.shadowColor = colorAttributes;
    ReactNativeStyleAttributes.textDecorationColor = colorAttributes;
    ReactNativeStyleAttributes.tintColor = colorAttributes;
    ReactNativeStyleAttributes.textShadowColor = colorAttributes;
    ReactNativeStyleAttributes.overlayColor = colorAttributes;

    ReactNativeViewAttributes.UIView = {
      pointerEvents: true,
      accessible: true,
      accessibilityActions: true,
      accessibilityLabel: true,
      accessibilityComponentType: true,
      accessibilityLiveRegion: true,
      accessibilityRole: true,
      accessibilityStates: true,
      accessibilityTraits: true,
      importantForAccessibility: true,
      nativeID: true,
      testID: true,
      renderToHardwareTextureAndroid: true,
      shouldRasterizeIOS: true,
      onLayout: true,
      onAccessibilityAction: true,
      onAccessibilityTap: true,
      onMagicTap: true,
      collapsable: true,
      needsOffscreenAlphaCompositing: true,
      style: ReactNativeStyleAttributes,
    };

    ReactNativeViewAttributes.RCTView = Object.assign({},
      ReactNativeViewAttributes.UIView,
      { removeClippedSubviews: true }
    );

    var viewConfig = {
      validAttributes: Object.assign({}, ReactNativeViewAttributes.UIView, {
        isHighlighted: true,
        numberOfLines: true,
        ellipsizeMode: true,
        allowFontScaling: true,
        disabled: true,
        selectable: true,
        selectionColor: true,
        adjustsFontSizeToFit: true,
        minimumFontScale: true,
        textBreakStrategy: true
      }),
      uiViewClassName: 'RCTText'
    };

    var MatrixMath = {
      createIdentityMatrix: function() {
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      },

      createCopy: function(m) {
        return [
          m[0],
          m[1],
          m[2],
          m[3],
          m[4],
          m[5],
          m[6],
          m[7],
          m[8],
          m[9],
          m[10],
          m[11],
          m[12],
          m[13],
          m[14],
          m[15],
        ];
      },

      createOrthographic: function(left, right, bottom, top, near, far) {
        const a = 2 / (right - left);
        const b = 2 / (top - bottom);
        const c = -2 / (far - near);

        const tx = -(right + left) / (right - left);
        const ty = -(top + bottom) / (top - bottom);
        const tz = -(far + near) / (far - near);

        return [a, 0, 0, 0, 0, b, 0, 0, 0, 0, c, 0, tx, ty, tz, 1];
      },

      createFrustum: function(left, right, bottom, top, near, far) {
        const r_width = 1 / (right - left);
        const r_height = 1 / (top - bottom);
        const r_depth = 1 / (near - far);
        const x = 2 * (near * r_width);
        const y = 2 * (near * r_height);
        const A = (right + left) * r_width;
        const B = (top + bottom) * r_height;
        const C = (far + near) * r_depth;
        const D = 2 * (far * near * r_depth);
        return [x, 0, 0, 0, 0, y, 0, 0, A, B, C, -1, 0, 0, D, 0];
      },

      /**
       * This create a perspective projection towards negative z
       * Clipping the z range of [-near, -far]
       *
       * @param fovInRadians - field of view in randians
       */
      createPerspective: function(fovInRadians, aspect, near, far) {
        const h = 1 / Math.tan(fovInRadians / 2);
        const r_depth = 1 / (near - far);
        const C = (far + near) * r_depth;
        const D = 2 * (far * near * r_depth);
        return [h / aspect, 0, 0, 0, 0, h, 0, 0, 0, 0, C, -1, 0, 0, D, 0];
      },

      createTranslate2d: function(x, y) {
        const mat = MatrixMath.createIdentityMatrix();
        MatrixMath.reuseTranslate2dCommand(mat, x, y);
        return mat;
      },

      reuseTranslate2dCommand: function(matrixCommand, x, y) {
        matrixCommand[12] = x;
        matrixCommand[13] = y;
      },

      reuseTranslate3dCommand: function(matrixCommand, x, y, z) {
        matrixCommand[12] = x;
        matrixCommand[13] = y;
        matrixCommand[14] = z;
      },

      createScale: function(factor) {
        const mat = MatrixMath.createIdentityMatrix();
        MatrixMath.reuseScaleCommand(mat, factor);
        return mat;
      },

      reuseScaleCommand: function(matrixCommand, factor) {
        matrixCommand[0] = factor;
        matrixCommand[5] = factor;
      },

      reuseScale3dCommand: function(matrixCommand, x, y, z) {
        matrixCommand[0] = x;
        matrixCommand[5] = y;
        matrixCommand[10] = z;
      },

      reusePerspectiveCommand: function(matrixCommand, p) {
        matrixCommand[11] = -1 / p;
      },

      reuseScaleXCommand(matrixCommand, factor) {
        matrixCommand[0] = factor;
      },

      reuseScaleYCommand(matrixCommand, factor) {
        matrixCommand[5] = factor;
      },

      reuseScaleZCommand(matrixCommand, factor) {
        matrixCommand[10] = factor;
      },

      reuseRotateXCommand: function(matrixCommand, radians) {
        matrixCommand[5] = Math.cos(radians);
        matrixCommand[6] = Math.sin(radians);
        matrixCommand[9] = -Math.sin(radians);
        matrixCommand[10] = Math.cos(radians);
      },

      reuseRotateYCommand: function(matrixCommand, amount) {
        matrixCommand[0] = Math.cos(amount);
        matrixCommand[2] = -Math.sin(amount);
        matrixCommand[8] = Math.sin(amount);
        matrixCommand[10] = Math.cos(amount);
      },

      // http://www.w3.org/TR/css3-transforms/#recomposing-to-a-2d-matrix
      reuseRotateZCommand: function(matrixCommand, radians) {
        matrixCommand[0] = Math.cos(radians);
        matrixCommand[1] = Math.sin(radians);
        matrixCommand[4] = -Math.sin(radians);
        matrixCommand[5] = Math.cos(radians);
      },

      createRotateZ: function(radians) {
        const mat = MatrixMath.createIdentityMatrix();
        MatrixMath.reuseRotateZCommand(mat, radians);
        return mat;
      },

      reuseSkewXCommand: function(matrixCommand, radians) {
        matrixCommand[4] = Math.tan(radians);
      },

      reuseSkewYCommand: function(matrixCommand, radians) {
        matrixCommand[1] = Math.tan(radians);
      },

      multiplyInto: function(out, a, b) {
        const a00 = a[0],
          a01 = a[1],
          a02 = a[2],
          a03 = a[3],
          a10 = a[4],
          a11 = a[5],
          a12 = a[6],
          a13 = a[7],
          a20 = a[8],
          a21 = a[9],
          a22 = a[10],
          a23 = a[11],
          a30 = a[12],
          a31 = a[13],
          a32 = a[14],
          a33 = a[15];

        let b0 = b[0],
          b1 = b[1],
          b2 = b[2],
          b3 = b[3];
        out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[4];
        b1 = b[5];
        b2 = b[6];
        b3 = b[7];
        out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[8];
        b1 = b[9];
        b2 = b[10];
        b3 = b[11];
        out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[12];
        b1 = b[13];
        b2 = b[14];
        b3 = b[15];
        out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      },

      determinant(matrix) {
        const [
          m00,
          m01,
          m02,
          m03,
          m10,
          m11,
          m12,
          m13,
          m20,
          m21,
          m22,
          m23,
          m30,
          m31,
          m32,
          m33,
        ] = matrix;
        return (
          m03 * m12 * m21 * m30 -
          m02 * m13 * m21 * m30 -
          m03 * m11 * m22 * m30 +
          m01 * m13 * m22 * m30 +
          m02 * m11 * m23 * m30 -
          m01 * m12 * m23 * m30 -
          m03 * m12 * m20 * m31 +
          m02 * m13 * m20 * m31 +
          m03 * m10 * m22 * m31 -
          m00 * m13 * m22 * m31 -
          m02 * m10 * m23 * m31 +
          m00 * m12 * m23 * m31 +
          m03 * m11 * m20 * m32 -
          m01 * m13 * m20 * m32 -
          m03 * m10 * m21 * m32 +
          m00 * m13 * m21 * m32 +
          m01 * m10 * m23 * m32 -
          m00 * m11 * m23 * m32 -
          m02 * m11 * m20 * m33 +
          m01 * m12 * m20 * m33 +
          m02 * m10 * m21 * m33 -
          m00 * m12 * m21 * m33 -
          m01 * m10 * m22 * m33 +
          m00 * m11 * m22 * m33
        );
      },

      /**
       * Inverse of a matrix. Multiplying by the inverse is used in matrix math
       * instead of division.
       *
       * Formula from:
       * http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
       */
      inverse(matrix: Array<number>): Array<number> {
        const det = MatrixMath.determinant(matrix);
        if (!det) {
          return matrix;
        }
        const [
          m00,
          m01,
          m02,
          m03,
          m10,
          m11,
          m12,
          m13,
          m20,
          m21,
          m22,
          m23,
          m30,
          m31,
          m32,
          m33,
        ] = matrix;
        return [
          (m12 * m23 * m31 -
            m13 * m22 * m31 +
            m13 * m21 * m32 -
            m11 * m23 * m32 -
            m12 * m21 * m33 +
            m11 * m22 * m33) /
            det,
          (m03 * m22 * m31 -
            m02 * m23 * m31 -
            m03 * m21 * m32 +
            m01 * m23 * m32 +
            m02 * m21 * m33 -
            m01 * m22 * m33) /
            det,
          (m02 * m13 * m31 -
            m03 * m12 * m31 +
            m03 * m11 * m32 -
            m01 * m13 * m32 -
            m02 * m11 * m33 +
            m01 * m12 * m33) /
            det,
          (m03 * m12 * m21 -
            m02 * m13 * m21 -
            m03 * m11 * m22 +
            m01 * m13 * m22 +
            m02 * m11 * m23 -
            m01 * m12 * m23) /
            det,
          (m13 * m22 * m30 -
            m12 * m23 * m30 -
            m13 * m20 * m32 +
            m10 * m23 * m32 +
            m12 * m20 * m33 -
            m10 * m22 * m33) /
            det,
          (m02 * m23 * m30 -
            m03 * m22 * m30 +
            m03 * m20 * m32 -
            m00 * m23 * m32 -
            m02 * m20 * m33 +
            m00 * m22 * m33) /
            det,
          (m03 * m12 * m30 -
            m02 * m13 * m30 -
            m03 * m10 * m32 +
            m00 * m13 * m32 +
            m02 * m10 * m33 -
            m00 * m12 * m33) /
            det,
          (m02 * m13 * m20 -
            m03 * m12 * m20 +
            m03 * m10 * m22 -
            m00 * m13 * m22 -
            m02 * m10 * m23 +
            m00 * m12 * m23) /
            det,
          (m11 * m23 * m30 -
            m13 * m21 * m30 +
            m13 * m20 * m31 -
            m10 * m23 * m31 -
            m11 * m20 * m33 +
            m10 * m21 * m33) /
            det,
          (m03 * m21 * m30 -
            m01 * m23 * m30 -
            m03 * m20 * m31 +
            m00 * m23 * m31 +
            m01 * m20 * m33 -
            m00 * m21 * m33) /
            det,
          (m01 * m13 * m30 -
            m03 * m11 * m30 +
            m03 * m10 * m31 -
            m00 * m13 * m31 -
            m01 * m10 * m33 +
            m00 * m11 * m33) /
            det,
          (m03 * m11 * m20 -
            m01 * m13 * m20 -
            m03 * m10 * m21 +
            m00 * m13 * m21 +
            m01 * m10 * m23 -
            m00 * m11 * m23) /
            det,
          (m12 * m21 * m30 -
            m11 * m22 * m30 -
            m12 * m20 * m31 +
            m10 * m22 * m31 +
            m11 * m20 * m32 -
            m10 * m21 * m32) /
            det,
          (m01 * m22 * m30 -
            m02 * m21 * m30 +
            m02 * m20 * m31 -
            m00 * m22 * m31 -
            m01 * m20 * m32 +
            m00 * m21 * m32) /
            det,
          (m02 * m11 * m30 -
            m01 * m12 * m30 -
            m02 * m10 * m31 +
            m00 * m12 * m31 +
            m01 * m10 * m32 -
            m00 * m11 * m32) /
            det,
          (m01 * m12 * m20 -
            m02 * m11 * m20 +
            m02 * m10 * m21 -
            m00 * m12 * m21 -
            m01 * m10 * m22 +
            m00 * m11 * m22) /
            det,
        ];
      },

      /**
       * Turns columns into rows and rows into columns.
       */
      transpose(m: Array<number>): Array<number> {
        return [
          m[0],
          m[4],
          m[8],
          m[12],
          m[1],
          m[5],
          m[9],
          m[13],
          m[2],
          m[6],
          m[10],
          m[14],
          m[3],
          m[7],
          m[11],
          m[15],
        ];
      },

      /**
       * Based on: http://tog.acm.org/resources/GraphicsGems/gemsii/unmatrix.c
       */
      multiplyVectorByMatrix(v: Array<number>, m: Array<number>): Array<number> {
        const [vx, vy, vz, vw] = v;
        return [
          vx * m[0] + vy * m[4] + vz * m[8] + vw * m[12],
          vx * m[1] + vy * m[5] + vz * m[9] + vw * m[13],
          vx * m[2] + vy * m[6] + vz * m[10] + vw * m[14],
          vx * m[3] + vy * m[7] + vz * m[11] + vw * m[15],
        ];
      },

      /**
       * From: https://code.google.com/p/webgl-mjs/source/browse/mjs.js
       */
      v3Length(a: Array<number>): number {
        return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
      },

      /**
       * Based on: https://code.google.com/p/webgl-mjs/source/browse/mjs.js
       */
      v3Normalize(vector: Array<number>, v3Length: number): Array<number> {
        const im = 1 / (v3Length || MatrixMath.v3Length(vector));
        return [vector[0] * im, vector[1] * im, vector[2] * im];
      },

      /**
       * The dot product of a and b, two 3-element vectors.
       * From: https://code.google.com/p/webgl-mjs/source/browse/mjs.js
       */
      v3Dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      },

      /**
       * From:
       * http://www.opensource.apple.com/source/WebCore/WebCore-514/platform/graphics/transforms/TransformationMatrix.cpp
       */
      v3Combine(
        a: Array<number>,
        b: Array<number>,
        aScale: number,
        bScale: number,
      ): Array<number> {
        return [
          aScale * a[0] + bScale * b[0],
          aScale * a[1] + bScale * b[1],
          aScale * a[2] + bScale * b[2],
        ];
      },

      /**
       * From:
       * http://www.opensource.apple.com/source/WebCore/WebCore-514/platform/graphics/transforms/TransformationMatrix.cpp
       */
      v3Cross(a: Array<number>, b: Array<number>): Array<number> {
        return [
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ];
      },

      /**
       * Based on:
       * http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToEuler/
       * and:
       * http://quat.zachbennett.com/
       *
       * Note that this rounds degrees to the thousandth of a degree, due to
       * floating point errors in the creation of the quaternion.
       *
       * Also note that this expects the qw value to be last, not first.
       *
       * Also, when researching this, remember that:
       * yaw   === heading            === z-axis
       * pitch === elevation/attitude === y-axis
       * roll  === bank               === x-axis
       */
      quaternionToDegreesXYZ(q: Array<number>, matrix, row): Array<number> {
        const [qx, qy, qz, qw] = q;
        const qw2 = qw * qw;
        const qx2 = qx * qx;
        const qy2 = qy * qy;
        const qz2 = qz * qz;
        const test = qx * qy + qz * qw;
        const unit = qw2 + qx2 + qy2 + qz2;
        const conv = 180 / Math.PI;

        if (test > 0.49999 * unit) {
          return [0, 2 * Math.atan2(qx, qw) * conv, 90];
        }
        if (test < -0.49999 * unit) {
          return [0, -2 * Math.atan2(qx, qw) * conv, -90];
        }

        return [
          MatrixMath.roundTo3Places(
            Math.atan2(2 * qx * qw - 2 * qy * qz, 1 - 2 * qx2 - 2 * qz2) * conv,
          ),
          MatrixMath.roundTo3Places(
            Math.atan2(2 * qy * qw - 2 * qx * qz, 1 - 2 * qy2 - 2 * qz2) * conv,
          ),
          MatrixMath.roundTo3Places(Math.asin(2 * qx * qy + 2 * qz * qw) * conv),
        ];
      },

      /**
       * Based on:
       * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
       */
      roundTo3Places(n: number): number {
        const arr = n.toString().split('e');
        return Math.round(arr[0] + 'e' + (arr[1] ? +arr[1] - 3 : 3)) * 0.001;
      },

      /**
       * Decompose a matrix into separate transform values, for use on platforms
       * where applying a precomposed matrix is not possible, and transforms are
       * applied in an inflexible ordering (e.g. Android).
       *
       * Implementation based on
       * http://www.w3.org/TR/css3-transforms/#decomposing-a-2d-matrix
       * http://www.w3.org/TR/css3-transforms/#decomposing-a-3d-matrix
       * which was based on
       * http://tog.acm.org/resources/GraphicsGems/gemsii/unmatrix.c
       */
      decomposeMatrix(transformMatrix: Array<number>): ?Object {

        // output values
        var perspective = [];
        const quaternion = [];
        const scale = [];
        const skew = [];
        const translation = [];

        // create normalized, 2d array matrix
        // and normalized 1d array perspectiveMatrix with redefined 4th column
        if (!transformMatrix[15]) {
          return;
        }
        const matrix = [];
        const perspectiveMatrix = [];
        for (var i = 0; i < 4; i++) {
          matrix.push([]);
          for (let j = 0; j < 4; j++) {
            const value = transformMatrix[i * 4 + j] / transformMatrix[15];
            matrix[i].push(value);
            perspectiveMatrix.push(j === 3 ? 0 : value);
          }
        }
        perspectiveMatrix[15] = 1;

        // test for singularity of upper 3x3 part of the perspective matrix
        if (!MatrixMath.determinant(perspectiveMatrix)) {
          return;
        }

        // isolate perspective
        if (matrix[0][3] !== 0 || matrix[1][3] !== 0 || matrix[2][3] !== 0) {
          // rightHandSide is the right hand side of the equation.
          // rightHandSide is a vector, or point in 3d space relative to the origin.
          const rightHandSide = [
            matrix[0][3],
            matrix[1][3],
            matrix[2][3],
            matrix[3][3],
          ];

          // Solve the equation by inverting perspectiveMatrix and multiplying
          // rightHandSide by the inverse.
          const inversePerspectiveMatrix = MatrixMath.inverse(perspectiveMatrix);
          const transposedInversePerspectiveMatrix = MatrixMath.transpose(
            inversePerspectiveMatrix,
          );
          var perspective = MatrixMath.multiplyVectorByMatrix(
            rightHandSide,
            transposedInversePerspectiveMatrix,
          );
        } else {
          // no perspective
          perspective[0] = perspective[1] = perspective[2] = 0;
          perspective[3] = 1;
        }

        // translation is simple
        for (var i = 0; i < 3; i++) {
          translation[i] = matrix[3][i];
        }

        // Now get scale and shear.
        // 'row' is a 3 element array of 3 component vectors
        const row = [];
        for (i = 0; i < 3; i++) {
          row[i] = [matrix[i][0], matrix[i][1], matrix[i][2]];
        }

        // Compute X scale factor and normalize first row.
        scale[0] = MatrixMath.v3Length(row[0]);
        row[0] = MatrixMath.v3Normalize(row[0], scale[0]);

        // Compute XY shear factor and make 2nd row orthogonal to 1st.
        skew[0] = MatrixMath.v3Dot(row[0], row[1]);
        row[1] = MatrixMath.v3Combine(row[1], row[0], 1.0, -skew[0]);

        // Compute XY shear factor and make 2nd row orthogonal to 1st.
        skew[0] = MatrixMath.v3Dot(row[0], row[1]);
        row[1] = MatrixMath.v3Combine(row[1], row[0], 1.0, -skew[0]);

        // Now, compute Y scale and normalize 2nd row.
        scale[1] = MatrixMath.v3Length(row[1]);
        row[1] = MatrixMath.v3Normalize(row[1], scale[1]);
        skew[0] /= scale[1];

        // Compute XZ and YZ shears, orthogonalize 3rd row
        skew[1] = MatrixMath.v3Dot(row[0], row[2]);
        row[2] = MatrixMath.v3Combine(row[2], row[0], 1.0, -skew[1]);
        skew[2] = MatrixMath.v3Dot(row[1], row[2]);
        row[2] = MatrixMath.v3Combine(row[2], row[1], 1.0, -skew[2]);

        // Next, get Z scale and normalize 3rd row.
        scale[2] = MatrixMath.v3Length(row[2]);
        row[2] = MatrixMath.v3Normalize(row[2], scale[2]);
        skew[1] /= scale[2];
        skew[2] /= scale[2];

        // At this point, the matrix (in rows) is orthonormal.
        // Check for a coordinate system flip.  If the determinant
        // is -1, then negate the matrix and the scaling factors.
        const pdum3 = MatrixMath.v3Cross(row[1], row[2]);
        if (MatrixMath.v3Dot(row[0], pdum3) < 0) {
          for (i = 0; i < 3; i++) {
            scale[i] *= -1;
            row[i][0] *= -1;
            row[i][1] *= -1;
            row[i][2] *= -1;
          }
        }

        // Now, get the rotations out
        quaternion[0] =
          0.5 * Math.sqrt(Math.max(1 + row[0][0] - row[1][1] - row[2][2], 0));
        quaternion[1] =
          0.5 * Math.sqrt(Math.max(1 - row[0][0] + row[1][1] - row[2][2], 0));
        quaternion[2] =
          0.5 * Math.sqrt(Math.max(1 - row[0][0] - row[1][1] + row[2][2], 0));
        quaternion[3] =
          0.5 * Math.sqrt(Math.max(1 + row[0][0] + row[1][1] + row[2][2], 0));

        if (row[2][1] > row[1][2]) {
          quaternion[0] = -quaternion[0];
        }
        if (row[0][2] > row[2][0]) {
          quaternion[1] = -quaternion[1];
        }
        if (row[1][0] > row[0][1]) {
          quaternion[2] = -quaternion[2];
        }

        // correct for occasional, weird Euler synonyms for 2d rotation
        let rotationDegrees;
        if (
          quaternion[0] < 0.001 &&
          quaternion[0] >= 0 &&
          quaternion[1] < 0.001 &&
          quaternion[1] >= 0
        ) {
          // this is a 2d rotation on the z-axis
          rotationDegrees = [
            0,
            0,
            MatrixMath.roundTo3Places(
              Math.atan2(row[0][1], row[0][0]) * 180 / Math.PI,
            ),
          ];
        } else {
          rotationDegrees = MatrixMath.quaternionToDegreesXYZ(
            quaternion,
            matrix,
            row,
          );
        }

        // expose both base data and convenience names
        return {
          rotationDegrees,
          perspective,
          quaternion,
          scale,
          skew,
          translation,

          rotate: rotationDegrees[2],
          rotateX: rotationDegrees[0],
          rotateY: rotationDegrees[1],
          scaleX: scale[0],
          scaleY: scale[1],
          translateX: translation[0],
          translateY: translation[1],
        };
      },
    };

    function _multiplyTransform(result, matrixMathFunction, args): void {
      const matrixToApply = MatrixMath.createIdentityMatrix();
      const argsWithIdentity = [matrixToApply].concat(args);
      matrixMathFunction.apply(this, argsWithIdentity);
      MatrixMath.multiplyInto(result, result, matrixToApply);
    }

    function _convertToRadians(value: string): number {
      const floatValue = parseFloat(value);
      return value.indexOf('rad') > -1 ? floatValue : floatValue * Math.PI / 180;
    }

    function processTransform(transform) {
      // Android & iOS implementations of transform property accept the list of
      // transform properties as opposed to a transform Matrix. This is necessary
      // to control transform property updates completely on the native thread.
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        return transform;
      }

      const result = MatrixMath.createIdentityMatrix();

      transform.forEach(transformation => {
        const key = Object.keys(transformation)[0];
        const value = transformation[key];

        switch (key) {
          case 'matrix':
            MatrixMath.multiplyInto(result, result, value);
            break;
          case 'perspective':
            _multiplyTransform(result, MatrixMath.reusePerspectiveCommand, [value]);
            break;
          case 'rotateX':
            _multiplyTransform(result, MatrixMath.reuseRotateXCommand, [
              _convertToRadians(value),
            ]);
            break;
          case 'rotateY':
            _multiplyTransform(result, MatrixMath.reuseRotateYCommand, [
              _convertToRadians(value),
            ]);
            break;
          case 'rotate':
          case 'rotateZ':
            _multiplyTransform(result, MatrixMath.reuseRotateZCommand, [
              _convertToRadians(value),
            ]);
            break;
          case 'scale':
            _multiplyTransform(result, MatrixMath.reuseScaleCommand, [value]);
            break;
          case 'scaleX':
            _multiplyTransform(result, MatrixMath.reuseScaleXCommand, [value]);
            break;
          case 'scaleY':
            _multiplyTransform(result, MatrixMath.reuseScaleYCommand, [value]);
            break;
          case 'translate':
            _multiplyTransform(result, MatrixMath.reuseTranslate3dCommand, [
              value[0],
              value[1],
              value[2] || 0,
            ]);
            break;
          case 'translateX':
            _multiplyTransform(result, MatrixMath.reuseTranslate2dCommand, [
              value,
              0,
            ]);
            break;
          case 'translateY':
            _multiplyTransform(result, MatrixMath.reuseTranslate2dCommand, [
              0,
              value,
            ]);
            break;
          case 'skewX':
            _multiplyTransform(result, MatrixMath.reuseSkewXCommand, [
              _convertToRadians(value),
            ]);
            break;
          case 'skewY':
            _multiplyTransform(result, MatrixMath.reuseSkewYCommand, [
              _convertToRadians(value),
            ]);
            break;
          default:
            throw new Error('Invalid transform name: ' + key);
        }
      });

      return result;
    }

    function register(name, callback) {
      viewConfigCallbacks.set(name, callback);
      return name;
    };

    const createReactNativeComponentClass = function(name, callback) {
      return register(name, callback);
    };

    const RCTText = createReactNativeComponentClass(
      viewConfig.uiViewClassName,
      function () { return viewConfig }
    );

    const RCTVirtualText = UIManager.RCTVirtualText == null
      ? RCTText
      : createReactNativeComponentClass('RCTVirtualText', () => ({
            validAttributes: Object.assign({},
              ReactNativeViewAttributes.UIView,
              { isHighlighted: true }
            ),
            uiViewClassName: 'RCTVirtualText',
          }));

    function normalizeColor(color) {
      const matchers = getMatchers();
      let match;

      if (typeof color === 'number') {
        if (color >>> 0 === color && color >= 0 && color <= 0xffffffff) {
          return color;
        }
        return null;
      }

      // Ordered based on occurrences on Facebook codebase
      if ((match = matchers.hex6.exec(color))) {
        return parseInt(match[1] + 'ff', 16) >>> 0;
      }

      if (names.hasOwnProperty(color)) {
        return names[color];
      }

      if ((match = matchers.rgb.exec(color))) {
        return (
          // b
          ((parse255(match[1]) << 24) | // r
          (parse255(match[2]) << 16) | // g
            (parse255(match[3]) << 8) |
            0x000000ff) >>> // a
          0
        );
      }

      if ((match = matchers.rgba.exec(color))) {
        return (
          // b
          ((parse255(match[1]) << 24) | // r
          (parse255(match[2]) << 16) | // g
            (parse255(match[3]) << 8) |
            parse1(match[4])) >>> // a
          0
        );
      }

      if ((match = matchers.hex3.exec(color))) {
        return (
          parseInt(
            match[1] +
            match[1] + // r
            match[2] +
            match[2] + // g
            match[3] +
            match[3] + // b
              'ff', // a
            16,
          ) >>> 0
        );
      }

      // https://drafts.csswg.org/css-color-4/#hex-notation
      if ((match = matchers.hex8.exec(color))) {
        return parseInt(match[1], 16) >>> 0;
      }

      if ((match = matchers.hex4.exec(color))) {
        return (
          parseInt(
            match[1] +
            match[1] + // r
            match[2] +
            match[2] + // g
            match[3] +
            match[3] + // b
              match[4] +
              match[4], // a
            16,
          ) >>> 0
        );
      }

      if ((match = matchers.hsl.exec(color))) {
        return (
          (hslToRgb(
            parse360(match[1]), // h
            parsePercentage(match[2]), // s
            parsePercentage(match[3]), // l
          ) |
            0x000000ff) >>> // a
          0
        );
      }

      if ((match = matchers.hsla.exec(color))) {
        return (
          (hslToRgb(
            parse360(match[1]), // h
            parsePercentage(match[2]), // s
            parsePercentage(match[3]), // l
          ) |
            parse1(match[4])) >>> // a
          0
        );
      }

      return null;
    }

    function hue2rgb(p, q, t) {
      if (t < 0) {
        t += 1;
      }
      if (t > 1) {
        t -= 1;
      }
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }
      if (t < 1 / 2) {
        return q;
      }
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }
      return p;
    }

    function hslToRgb(h, s, l) {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = hue2rgb(p, q, h + 1 / 3);
      const g = hue2rgb(p, q, h);
      const b = hue2rgb(p, q, h - 1 / 3);

      return (
        (Math.round(r * 255) << 24) |
        (Math.round(g * 255) << 16) |
        (Math.round(b * 255) << 8)
      );
    }

    // var INTEGER = '[-+]?\\d+';
    const NUMBER = '[-+]?\\d*\\.?\\d+';
    const PERCENTAGE = NUMBER + '%';

    function call(...args) {
      return '\\(\\s*(' + args.join(')\\s*,\\s*(') + ')\\s*\\)';
    }

    function getMatchers() {
      var cachedMatchers = {
          rgb: new RegExp('rgb' + call(NUMBER, NUMBER, NUMBER)),
          rgba: new RegExp('rgba' + call(NUMBER, NUMBER, NUMBER, NUMBER)),
          hsl: new RegExp('hsl' + call(NUMBER, PERCENTAGE, PERCENTAGE)),
          hsla: new RegExp('hsla' + call(NUMBER, PERCENTAGE, PERCENTAGE, NUMBER)),
          hex3: /^#([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
          hex4: /^#([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
          hex6: /^#([0-9a-fA-F]{6})$/,
          hex8: /^#([0-9a-fA-F]{8})$/,
        };
      return cachedMatchers;
    }

    function parse255(str) {
      const int = parseInt(str, 10);
      if (int < 0) {
        return 0;
      }
      if (int > 255) {
        return 255;
      }
      return int;
    }

    function parse360(str) {
      const int = parseFloat(str);
      return (((int % 360) + 360) % 360) / 360;
    }

    function parse1(str) {
      const num = parseFloat(str);
      if (num < 0) {
        return 0;
      }
      if (num > 1) {
        return 255;
      }
      return Math.round(num * 255);
    }

    function parsePercentage(str) {
      // parseFloat conveniently ignores the final %
      const int = parseFloat(str);
      if (int < 0) {
        return 0;
      }
      if (int > 100) {
        return 1;
      }
      return int / 100;
    }

    const names = {
      transparent: 0x00000000,

      // http://www.w3.org/TR/css3-color/#svg-color
      aliceblue: 0xf0f8ffff,
      antiquewhite: 0xfaebd7ff,
      aqua: 0x00ffffff,
      aquamarine: 0x7fffd4ff,
      azure: 0xf0ffffff,
      beige: 0xf5f5dcff,
      bisque: 0xffe4c4ff,
      black: 0x000000ff,
      blanchedalmond: 0xffebcdff,
      blue: 0x0000ffff,
      blueviolet: 0x8a2be2ff,
      brown: 0xa52a2aff,
      burlywood: 0xdeb887ff,
      burntsienna: 0xea7e5dff,
      cadetblue: 0x5f9ea0ff,
      chartreuse: 0x7fff00ff,
      chocolate: 0xd2691eff,
      coral: 0xff7f50ff,
      cornflowerblue: 0x6495edff,
      cornsilk: 0xfff8dcff,
      crimson: 0xdc143cff,
      cyan: 0x00ffffff,
      darkblue: 0x00008bff,
      darkcyan: 0x008b8bff,
      darkgoldenrod: 0xb8860bff,
      darkgray: 0xa9a9a9ff,
      darkgreen: 0x006400ff,
      darkgrey: 0xa9a9a9ff,
      darkkhaki: 0xbdb76bff,
      darkmagenta: 0x8b008bff,
      darkolivegreen: 0x556b2fff,
      darkorange: 0xff8c00ff,
      darkorchid: 0x9932ccff,
      darkred: 0x8b0000ff,
      darksalmon: 0xe9967aff,
      darkseagreen: 0x8fbc8fff,
      darkslateblue: 0x483d8bff,
      darkslategray: 0x2f4f4fff,
      darkslategrey: 0x2f4f4fff,
      darkturquoise: 0x00ced1ff,
      darkviolet: 0x9400d3ff,
      deeppink: 0xff1493ff,
      deepskyblue: 0x00bfffff,
      dimgray: 0x696969ff,
      dimgrey: 0x696969ff,
      dodgerblue: 0x1e90ffff,
      firebrick: 0xb22222ff,
      floralwhite: 0xfffaf0ff,
      forestgreen: 0x228b22ff,
      fuchsia: 0xff00ffff,
      gainsboro: 0xdcdcdcff,
      ghostwhite: 0xf8f8ffff,
      gold: 0xffd700ff,
      goldenrod: 0xdaa520ff,
      gray: 0x808080ff,
      green: 0x008000ff,
      greenyellow: 0xadff2fff,
      grey: 0x808080ff,
      honeydew: 0xf0fff0ff,
      hotpink: 0xff69b4ff,
      indianred: 0xcd5c5cff,
      indigo: 0x4b0082ff,
      ivory: 0xfffff0ff,
      khaki: 0xf0e68cff,
      lavender: 0xe6e6faff,
      lavenderblush: 0xfff0f5ff,
      lawngreen: 0x7cfc00ff,
      lemonchiffon: 0xfffacdff,
      lightblue: 0xadd8e6ff,
      lightcoral: 0xf08080ff,
      lightcyan: 0xe0ffffff,
      lightgoldenrodyellow: 0xfafad2ff,
      lightgray: 0xd3d3d3ff,
      lightgreen: 0x90ee90ff,
      lightgrey: 0xd3d3d3ff,
      lightpink: 0xffb6c1ff,
      lightsalmon: 0xffa07aff,
      lightseagreen: 0x20b2aaff,
      lightskyblue: 0x87cefaff,
      lightslategray: 0x778899ff,
      lightslategrey: 0x778899ff,
      lightsteelblue: 0xb0c4deff,
      lightyellow: 0xffffe0ff,
      lime: 0x00ff00ff,
      limegreen: 0x32cd32ff,
      linen: 0xfaf0e6ff,
      magenta: 0xff00ffff,
      maroon: 0x800000ff,
      mediumaquamarine: 0x66cdaaff,
      mediumblue: 0x0000cdff,
      mediumorchid: 0xba55d3ff,
      mediumpurple: 0x9370dbff,
      mediumseagreen: 0x3cb371ff,
      mediumslateblue: 0x7b68eeff,
      mediumspringgreen: 0x00fa9aff,
      mediumturquoise: 0x48d1ccff,
      mediumvioletred: 0xc71585ff,
      midnightblue: 0x191970ff,
      mintcream: 0xf5fffaff,
      mistyrose: 0xffe4e1ff,
      moccasin: 0xffe4b5ff,
      navajowhite: 0xffdeadff,
      navy: 0x000080ff,
      oldlace: 0xfdf5e6ff,
      olive: 0x808000ff,
      olivedrab: 0x6b8e23ff,
      orange: 0xffa500ff,
      orangered: 0xff4500ff,
      orchid: 0xda70d6ff,
      palegoldenrod: 0xeee8aaff,
      palegreen: 0x98fb98ff,
      paleturquoise: 0xafeeeeff,
      palevioletred: 0xdb7093ff,
      papayawhip: 0xffefd5ff,
      peachpuff: 0xffdab9ff,
      peru: 0xcd853fff,
      pink: 0xffc0cbff,
      plum: 0xdda0ddff,
      powderblue: 0xb0e0e6ff,
      purple: 0x800080ff,
      rebeccapurple: 0x663399ff,
      red: 0xff0000ff,
      rosybrown: 0xbc8f8fff,
      royalblue: 0x4169e1ff,
      saddlebrown: 0x8b4513ff,
      salmon: 0xfa8072ff,
      sandybrown: 0xf4a460ff,
      seagreen: 0x2e8b57ff,
      seashell: 0xfff5eeff,
      sienna: 0xa0522dff,
      silver: 0xc0c0c0ff,
      skyblue: 0x87ceebff,
      slateblue: 0x6a5acdff,
      slategray: 0x708090ff,
      slategrey: 0x708090ff,
      snow: 0xfffafaff,
      springgreen: 0x00ff7fff,
      steelblue: 0x4682b4ff,
      tan: 0xd2b48cff,
      teal: 0x008080ff,
      thistle: 0xd8bfd8ff,
      tomato: 0xff6347ff,
      turquoise: 0x40e0d0ff,
      violet: 0xee82eeff,
      wheat: 0xf5deb3ff,
      white: 0xffffffff,
      whitesmoke: 0xf5f5f5ff,
      yellow: 0xffff00ff,
      yellowgreen: 0x9acd32ff,
    };

    function processColor(color) {
      if (color === undefined || color === null) {
        return color;
      }

      var int32Color = normalizeColor(color);
      if (int32Color === null || int32Color === undefined) {
        return undefined;
      }

      // Converts 0xrrggbbaa into 0xaarrggbb
      int32Color = ((int32Color << 24) | (int32Color >>> 8)) >>> 0;

      if (Platform.OS === 'android') {
        // Android use 32 bit *signed* integer to represent the color
        // We utilize the fact that bitwise operations in JS also operates on
        // signed 32 bit integers, so that we can use those to convert from
        // *unsigned* to *signed* 32bit int that way.
        int32Color = int32Color | 0x0;
      }
      return int32Color;
    }

    const isTouchable = props =>
      props.onPress != null ||
      props.onLongPress != null ||
      props.onStartShouldSetResponder != null;

    // this is not a full implementation, but just for a hack
    function TouchableText(props) {
      var newProps = props;
      if (isTouchable(newProps)) {
        throw new Error("TODO: mocked TouchableText does not handle touch events");
      }
      if (props.selectionColor != null) {
        newProps = Object.assign({}, props, {
          selectionColor: processColor(props.selectionColor)
        });
      }
      return (
        React.createElement(
          TextAncestor.Consumer,
          null,
          function (hasTextAncestor) {
            return (
              hasTextAncestor ? (
                React.createElement(
                  RCTVirtualText,
                  Object.assign(
                    {},
                    newProps,
                    { ref: newProps.forwardedRef }
                  )
                )
              ) : (
                React.createElement(
                  TextAncestor.Provider,
                  { value: true },
                  React.createElement(
                    RCTText,
                    Object.assign(
                      {},
                      newProps,
                      { ref: newProps.forwardedRef }
                    )
                  )
                )
              )
            );
          }
        )
      );
    }

    TouchableText.defaultProps = {
      accessible: true,
      allowFontScaling: true,
      ellipsizeMode: 'tail',
    };

    function getDifferForType(typeName: string) {
      switch (typeName) {
        // iOS Types
        case 'CATransform3D':
          return matricesDiffer;
        case 'CGPoint':
          return pointsDiffer;
        case 'CGSize':
          return sizesDiffer;
        case 'UIEdgeInsets':
          return insetsDiffer;
        // Android Types
        // (not yet implemented)
      }
      return null;
    }

    function getProcessorForType(typeName) {
      switch (typeName) {
        // iOS Types
        case 'CGColor':
        case 'UIColor':
          return processColor;
        case 'CGColorArray':
        case 'UIColorArray':
          return processColorArray;
        case 'CGImage':
        case 'UIImage':
        case 'RCTImageSource':
          return resolveAssetSource;
        // Android Types
        case 'Color':
          return processColor;
        case 'ColorArray':
          return processColorArray;
      }
      return null;
    }

    function merge(destination, source) {
      if (!source) {
        return destination;
      }
      if (!destination) {
        return source;
      }

      for (const key in source) {
        if (!source.hasOwnProperty(key)) {
          continue;
        }

        let sourceValue = source[key];
        if (destination.hasOwnProperty(key)) {
          const destinationValue = destination[key];
          if (
            typeof sourceValue === 'object' &&
            typeof destinationValue === 'object'
          ) {
            sourceValue = merge(destinationValue, sourceValue);
          }
        }
        destination[key] = sourceValue;
      }
      return destination;
    }

    function requireNativeComponent(uiViewClassName) {
      return createReactNativeComponentClass(uiViewClassName, function() {
        const viewConfig = UIManager[viewName];

        let {baseModuleName, bubblingEventTypes, directEventTypes} = viewConfig;
        let nativeProps = viewConfig.NativeProps;

        while (baseModuleName) {
          const baseModule = UIManager[baseModuleName];
          if (!baseModule) {
            baseModuleName = null;
          } else {
            bubblingEventTypes = Object.assign({}, baseModule.bubblingEventTypes, bubblingEventTypes);
            directEventTypes = Object.assign({}, baseModule.directEventTypes, directEventTypes);
            nativeProps = Object.assign({}, baseModule.NativeProps, nativeProps);
            baseModuleName = baseModule.baseModuleName;
          }
        }

        const viewAttributes = {};

        for (const key in nativeProps) {
          const typeName = nativeProps[key];
          const diff = getDifferForType(typeName);
          const process = getProcessorForType(typeName);

          viewAttributes[key] =
            diff == null && process == null ? true : {diff, process};
        }
        viewAttributes.style = ReactNativeStyleAttributes;

        Object.assign(viewConfig, {
          uiViewClassName: viewName,
          validAttributes: viewAttributes,
          bubblingEventTypes,
          directEventTypes,
        });

        if (!hasAttachedDefaultEventTypes) {
          attachDefaultEventTypes(viewConfig);
          hasAttachedDefaultEventTypes = true;
        }

        return viewConfig;
      });
    }

    var hasAttachedDefaultEventTypes = false;

    function attachDefaultEventTypes(viewConfig) {
      // This is supported on UIManager platforms (ex: Android),
      // as lazy view managers are not implemented for all platforms.
      // See [UIManager] for details on constants and implementations.
      if (UIManager.ViewManagerNames) {
        // Lazy view managers enabled.
        viewConfig = merge(viewConfig, UIManager.getDefaultEventTypes());
      } else {
        viewConfig.bubblingEventTypes = merge(
          viewConfig.bubblingEventTypes,
          UIManager.genericBubblingEventTypes,
        );
        viewConfig.directEventTypes = merge(
          viewConfig.directEventTypes,
          UIManager.genericDirectEventTypes,
        );
      }
    }

    const Text = React.forwardRef(function(props, ref) {
      return React.createElement(
        TouchableText,
        Object.assign(
          {},
          props
          // { forwardedRef: ref }
        )
      );
    });

    const StyleSheet = {
      create(obj){
        return obj;
      },
    };

    const RCTView = requireNativeComponent(
      'RCTView',
      {},
      {
        nativeOnly: {
          nativeBackgroundAndroid: true,
          nativeForegroundAndroid: true,
        },
      },
    );

    return {
      StyleSheet,
      Text,
      View: RCTView,
    };
  }
`;

let reactNativeAst = parseExpression(reactNativeCode, { plugins: ["flow"] });

export function createMockReactNative(realm: Realm, reactNativeRequireName: string): ObjectValue {
  let reactNativeFactory = Environment.GetValue(realm, realm.$GlobalEnv.evaluate(reactNativeAst, false));
  invariant(reactNativeFactory instanceof ECMAScriptSourceFunctionValue);
  let factory = reactNativeFactory.$Call;
  invariant(factory !== undefined);

  let RCTViewDerivedReference = AbstractValue.createTemporalFromBuildFunction(
    realm,
    StringValue,
    [new StringValue(realm, "RCTView")],
    createOperationDescriptor("REACT_NATIVE_STRING_LITERAL"),
    { skipInvariant: true, isPure: true }
  );
  invariant(RCTViewDerivedReference instanceof AbstractValue);
  realm.react.reactElementStringTypeReferences.set("RCTView", RCTViewDerivedReference);

  let RCTTextDerivedReference = AbstractValue.createTemporalFromBuildFunction(
    realm,
    StringValue,
    [new StringValue(realm, "RCTText")],
    createOperationDescriptor("REACT_NATIVE_STRING_LITERAL"),
    { skipInvariant: true, isPure: true }
  );
  invariant(RCTTextDerivedReference instanceof AbstractValue);
  realm.react.reactElementStringTypeReferences.set("RCTText", RCTTextDerivedReference);

  let RCTActivityIndicatorViewDerivedReference = AbstractValue.createTemporalFromBuildFunction(
    realm,
    StringValue,
    [new StringValue(realm, "RCTActivityIndicatorView")],
    createOperationDescriptor("REACT_NATIVE_STRING_LITERAL"),
    { skipInvariant: true, isPure: true }
  );
  invariant(RCTActivityIndicatorViewDerivedReference instanceof AbstractValue);
  realm.react.reactElementStringTypeReferences.set(
    "RCTActivityIndicatorView",
    RCTActivityIndicatorViewDerivedReference
  );

  let reactLibrary = realm.fbLibraries.react;
  invariant(
    reactLibrary !== undefined,
    "Could not find React library in sourcecode. Ensure React is bundled or required."
  );
  let reactNativeValue = factory(realm.intrinsics.undefined, [
    reactLibrary,
    new StringValue(realm, reactNativeRequireName),
  ]);
  invariant(reactNativeValue instanceof ObjectValue);
  reactNativeValue.refuseSerialization = true;

  reactNativeValue.intrinsicName = `require("${reactNativeRequireName}")`;

  reactNativeValue.refuseSerialization = false;
  return reactNativeValue;
}
