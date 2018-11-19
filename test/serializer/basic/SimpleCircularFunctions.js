let cond = 0;

function a() {
  cond += 1;
  b();
}
function b() {
  if (cond < 2) a();
}

inspect = function() {
  a();
  return cond;
};
