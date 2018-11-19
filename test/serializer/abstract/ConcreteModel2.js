// emit concrete model

if (global.__assumeDataProperty) {
  __assumeDataProperty(global, "inspect", undefined);
  __assumeDataProperty(
    this,
    "nativeTraceBeginAsyncSection",
    function(tag, name, cookie) {
      if (global.__residual)
        return global.__residual(
          "void",
          function(tag, name, cookie, global) {
            return global.nativeTraceBeginAsyncSection(tag, name, cookie);
          },
          tag,
          name,
          cookie,
          global
        );
      else return this.nativeTraceBeginAsyncSection(tag, name, cookie);
    },
    "VALUE_DEFINED_INVARIANT"
  );
  __assumeDataProperty(
    this,
    "nativeModuleProxy",
    __abstract(
      {
        nativePerformanceNow: __abstract("function"),
        UIManager: __abstract({
          customBubblingEventTypes: __abstract("string"),
          customDirectEventTypes: __abstract(),
          AndroidLazyViewManagersEnabled: __abstract("boolean"),
          ViewManagerNames: undefined,
        }),
        DeviceInfo: __abstract({
          Dimensions: __abstract({
            window: undefined,
            screen: undefined,
            windowPhysicalPixels: __abstract({
              width: __abstract("number"),
            }),
          }),
        }),
      },
      "global.nativeModuleProxy"
    )
  );
} else {
  global.nativeTraceBeginAsyncSection = function(tag, name, cookie) {
    if (global.__residual)
      return global.__residual(
        "void",
        function(tag, name, cookie, global) {
          return global.nativeTraceBeginAsyncSection(tag, name, cookie);
        },
        tag,
        name,
        cookie,
        global
      );
    else return this.nativeTraceBeginAsyncSection(tag, name, cookie);
  };
  global.nativeModuleProxy = {
    nativePerformanceNow: function() {},
    UIManager: {
      customBubblingEventTypes: "__concreteModel",
      customDirectEventTypes: void 0,
      AndroidLazyViewManagersEnabled: false,
      ViewManagerNames: void 0,
    },
    DeviceInfo: {
      Dimensions: {
        window: void 0,
        screen: void 0,
        windowPhysicalPixels: {
          width: 42,
        },
      },
    },
  };
}
if (global.__makePartial) __makePartial(global);

inspect = function() {
  return (
    global.nativeTraceBeginAsyncSection !== undefined &&
    global.nativeModuleProxy.nativePerformanceNow() === undefined &&
    global.nativeModuleProxy.UIManager.customBubblingEventTypes !== undefined &&
    global.nativeModuleProxy.UIManager.AndroidLazyViewManagersEnabled !== undefined &&
    global.nativeModuleProxy.DeviceInfo.Dimensions.windowPhysicalPixels.width !== undefined
  );
};
