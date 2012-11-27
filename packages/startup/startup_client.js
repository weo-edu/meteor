(function() {
  var queue = [];
  Meteor.loaded = document.readyState === "loaded" ||
    document.readyState == "complete";

  var ready = function() {
    Meteor.loaded = true;
    while (queue.length)
      (queue.shift())();
  };

  if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', ready, false);
    window.addEventListener('load', ready, false);
  } else {
    document.attachEvent('onreadystatechange', function () {
      if (document.readyState === "complete")
        ready();
    });
    window.attachEvent('load', ready);
  }

  Meteor.startup = function (cb) {
    //  Make sure each startup function is only
    //  called one time, regardless of how many
    //  times meteor thinks it has initialized
    cb = _.once(cb);

    var doScroll = !document.addEventListener &&
      document.documentElement.doScroll;

    if (!doScroll || window !== top) {
      if (Meteor.loaded)
        cb();
      else
        queue.push(cb);
    } else {
      try { doScroll('left'); }
      catch (e) {
        setTimeout(function() { Meteor.startup(cb); }, 50);
        return;
      };
      cb();
    }
  };
})();
