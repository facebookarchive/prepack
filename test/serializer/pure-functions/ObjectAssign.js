// additional functions
// abstract effects

var obj = global.__abstract && global.__makePartial ? __makePartial(__abstract({}, "({foo:1})")) : {foo:1};

function additional1() {
  return Object.assign({}, obj);
}

function additional2() {
  return Object.assign(obj, {bar:1});
}

inspect = function() {
  var obj1 = additional1();
  var obj2 = additional2();
  return JSON.stringify({ obj1, obj2 });
}
