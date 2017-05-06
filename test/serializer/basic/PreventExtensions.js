let obj = {x:1};
Object.preventExtensions(obj);
inspect = function() {
  obj.y = 1;
  return obj.y;
}
