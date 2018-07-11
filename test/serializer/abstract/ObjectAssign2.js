let dims = {
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

if (global.__makeSimple) __makeSimple(dims);
if (global.__makePartial) __makePartial(dims);

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

// We also need to allow reading of well-defined properties after Object.assign
global.x = dimensions.window;
global.y = dimensions.screen;

inspect = function() {
  return JSON.stringify(global.x) + JSON.stringify(global.y);
};
