// additional functions
// abstract effects

var obj = global.__abstract && global.__makePartial ? __makePartial(__abstract({}, "({foo:1})")) : {foo:1};
var objSimple = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:2})"))) : {foo:2};

function additional1() {
  var o = Object.assign(obj, {get bar() {}});
  // Object.assign should fail by returning a non-simple AbstractObjectValue
  return global.__isAbstractObject && global.__isSimpleObject ?
    [__isAbstractObject(o), __isSimpleObject(o)] :
    [true, false];
}

function additional2() {
  var o = Object.assign(objSimple, global.__abstract ? __abstract("empty") : false);
  // Object.assign should fail by returning a simple AbstractObjectValue
  return global.__isAbstractObject && global.__isSimpleObject ?
    [__isAbstractObject(o), __isSimpleObject(o)] :
    [true, true];
}

inspect = function() {
  var res1 = additional1();
  var res2 = additional2();
  return JSON.stringify({
    res1,
    res2,
  });
}
