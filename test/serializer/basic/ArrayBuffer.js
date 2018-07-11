var x = new ArrayBuffer(16);
// Two typed arrays over the same buffer should share the same buffer
var y = new Int8Array(x);
y[0] = 1;
var z = new Int16Array(x);
z[0] = 2;
var a = new DataView(x);
a.setInt8(2, 3);
inspect = function() {
  return x.byteLength + y[0] + z[0] + y[2];
};
