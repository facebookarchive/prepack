node Stacktrace.js.new2.js 2>&1 >/dev/null | grep "Stacktrace.js:2" > /dev/null
X=$?
rm Stacktrace.js.new1.js
rm Stacktrace.js.new1.js.map
rm Stacktrace.js.new2.js
rm Stacktrace.js.new2.js.map
exit $X
