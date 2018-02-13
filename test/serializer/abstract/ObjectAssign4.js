var obj = global.__abstract && global.__makePartial ? __makePartial(__abstract({}, "obj")) : {};
var copyOfObj = Object.assign({}, obj);

inspect = function() {
  return copyOfObj;
}
