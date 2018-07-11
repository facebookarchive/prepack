var __abstract = global.__abstract
  ? global.__abstract
  : function() {
      return console.log;
    };

var obj = __abstract("function", "console.log");
var ident = 10;
obj("literal ", 5, ident);

inspect = function() {
  return 0;
};
