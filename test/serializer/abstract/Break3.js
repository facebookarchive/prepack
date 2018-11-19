let foo = global.__abstract ? __abstract("boolean", "true") : true;

var y = eval(`
    do {
      if (foo) {
	x = 1;
	break;
      } else {
	x = 2;
	break;
      }
    } while (true);`);

inspect = function() {
  return y;
};
