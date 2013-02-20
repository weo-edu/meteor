// Give a sort spec, which can be in any of these forms:
//   {"key1": 1, "key2": -1}
//   [["key1", "asc"], ["key2", "desc"]]
//   ["key1", ["key2", "desc"]]
//
// (.. with the first form being dependent on the key enumeration
// behavior of your javascript VM, which usually does what you mean in
// this case if the key names don't look like integers ..)
//
// return a function that takes two objects, and returns -1 if the
// first object comes first in order, 1 if the second object comes
// first, or 0 if neither object comes before the other.

// XXX sort does not yet support subkeys ('a.b') .. fix that!

LocalCollection._compileSort = function (spec) {
  var keys = [];
  var asc = [];

  if (spec instanceof Array) {
    spec.push(['_id', 'asc']);
    for (var i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "string") {
        keys.push(spec[i]);
        asc.push(true);
      } else {
        keys.push(spec[i][0]);
        asc.push(spec[i][1] !== "desc");
      }
    }
  } else if (typeof spec === "object") {
    if(! spec['_id']) spec['_id'] = 1;

    for (key in spec) {
      keys.push(key);
      asc.push(!(spec[key] < 0));
    }
  } else {
    throw Error("Bad sort specification: ", JSON.stringify(spec));
  }

  if (keys.length === 0)
    return function () {return 0;};

  // eval() does not return a value in IE8, nor does the spec say it
  // should. Assign to a local to get the value, instead.
  var _func;
  var code = "_func = (function(c){return function(a,b){var x;";
  for (var i = 0; i < keys.length; i++) {
    if (i !== 0)
      code += "if(x!==0)return x;";
    code += "x=" + (asc[i] ? "" : "-") +
      "c("+LocalCollection._getter('a', keys[i])+','+LocalCollection._getter('b', keys[i])+");";
  }
  code += "return x; };})";
  eval(code);
  return _func(LocalCollection._f._cmp);
};

LocalCollection.compileSort = _.memoize(LocalCollection._compileSort, function(spec) {
  return JSON.stringify(spec);
});

LocalCollection._getter = function(v, s) {
  if(! s) return v;
  var parts = s.split('.');
  var arr = [v];
  var path = '';
  for(var i in parts) {
    path += '["'+parts[i]+'"]';
    arr.push(v+path);
  }
  return arr.join(' && ');
}
LocalCollection._bracketize = function(s){
  return _.reduce(s.split('.'), function(memo, val){
    return memo += '[' + JSON.stringify(val) + ']';
  }, '');
}