// stdout: "Result: no no\n"

(function() {
  let getchar = __abstract(":integral", "getchar");
  let puts = __abstract(':integral', 'puts');

  function print(str) {
    // Print null terminated string to stdout
    puts(str + '\u0000');
  }

  let y = ('y'.charCodeAt(0) | 0);
  let result = 'Result: ';
  if (getchar() === y) {
    result += 'Yes ';
  } else {
    result += 'no ';
  }
  if (getchar() === y) {
    result += 'Yes';
  } else {
    result += 'no';
  }
  if (result === 'Result: Yes Yes') {
    print('Yea!');
  } else {
    print(result);
  }
})();
