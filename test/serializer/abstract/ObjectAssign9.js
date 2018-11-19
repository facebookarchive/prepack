var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
__evaluatePureFunction(() => {
  let dims = global.__abstract
    ? __abstract(
        {
          window: undefined,
          screen: undefined,
          windowPhysicalPixels: __abstract({
            width: __abstract("number", "/* windowPhysicalPixels.width = */ 1"),
            height: __abstract("number", "/* windowPhysicalPixels.height = */ 1"),
            scale: __abstract("number", "/* windowPhysicalPixels.scale = */ 2"),
            fontScale: __abstract("number", "/* windowPhysicalPixels.fontScale = */4"),
          }),
          screenPhysicalPixels: __abstract({
            width: __abstract("number", "/* screenPhysicalPixels.width = */ 1"),
            height: __abstract("number", "/* screenPhysicalPixels.height = */1"),
            scale: __abstract("number", "/* screenPhysicalPixels.scale = */ 2"),
            fontScale: __abstract("number", "/*screenPhysicalPixels.fontScale = */4"),
          }),
        },
        `({
    window: undefined,
    screen: undefined,
    windowPhysicalPixels: {
      width: 1,
      height: 1,
      scale: 2,
      fontScale: 4
    },
    screenPhysicalPixels: {
      width: 1,
      height: 1,
      scale: 2,
      fontScale: 4
    }
  })`
      )
    : {
        window: undefined,
        screen: undefined,
        windowPhysicalPixels: {
          width: 1,
          height: 1,
          scale: 2,
          fontScale: 4,
        },
        screenPhysicalPixels: {
          width: 1,
          height: 1,
          scale: 2,
          fontScale: 4,
        },
      };

  dims = JSON.parse(JSON.stringify(dims));
  // Note that the object returned by JSON.parse will never have getters, and it only has well-behaved properties.
  // Prepack already has some magic built-in to preserve the "template shape" when cloning an object via parse/stringify.

  let windowPhysicalPixels = dims.windowPhysicalPixels;
  dims.window = {
    width: windowPhysicalPixels.width / windowPhysicalPixels.scale,
    height: windowPhysicalPixels.height / windowPhysicalPixels.scale,
    scale: windowPhysicalPixels.scale,
    fontScale: windowPhysicalPixels.fontScale,
  };
  let screenPhysicalPixels = dims.screenPhysicalPixels;
  dims.screen = {
    width: screenPhysicalPixels.width / screenPhysicalPixels.scale,
    height: screenPhysicalPixels.height / screenPhysicalPixels.scale,
    scale: screenPhysicalPixels.scale,
    fontScale: screenPhysicalPixels.fontScale,
  };

  delete dims.screenPhysicalPixels;
  delete dims.windowPhysicalPixels;

  let dimensions = {};
  Object.assign(dimensions, dims);
  dimensions.extra = "hello";

  inspect = function() {
    return Object.keys(dimensions).join(",");
  };
});
