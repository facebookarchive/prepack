let dims = global.__abstract ? __abstract({
  window: undefined,
  screen: undefined,
  windowPhysicalPixels: __abstract({
    width: __abstract("number", "1"),
    height: __abstract("number", "1"),
    scale: __abstract("number", "2"),
    fontScale: __abstract("number", "4"),
  }),
  screenPhysicalPixels: __abstract({
    width: __abstract("number", "1"),
    height: __abstract("number", "1"),
    scale: __abstract("number", "2"),
    fontScale: __abstract("number", "4"),
  }),
}, `({
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
})`) :
{
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
// Object.assign currently triggers introspection error. We need to support this.
Object.assign(dimensions, dims);

// We also need to allow reading of well-defined properties after Object.assign
global.x = dimensions.window;
global.y = dimensions.screen;

inspect = function() { return JSON.stringify(x) + JSON.stringify(y);  }
