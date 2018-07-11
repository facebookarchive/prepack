let obj = global.__makePartial ? __makeSimple(__makePartial({})) : {};
x = obj[5];

inspect = function() {
  return global.x === undefined;
};
