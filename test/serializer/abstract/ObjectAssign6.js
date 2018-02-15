// abstract effects
var a = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({bar: 2})"))) : {bar: 2};
var b;
var c;

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
__evaluatePureFunction(() => {
  b = {};
  Object.assign(b, a, {bar: 1});

  c = {};
  Object.assign(c, b);
});

inspect = function() {  
  return c.bar;
}
