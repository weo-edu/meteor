Timers = new Meteor.Collection(null);

///////////////////////////////////////////////////////////////////////////////

if (! Session.get("x")) {
  Session.set("x", 1);
}

if (! Session.get("y")) {
  Session.set("y", 1);
}

if (! Session.get("z")) {
  Session.set("z", 1);
}


Template.preserveDemo.x =
Template.constantDemo.x =
Template.stateDemo.x =
function () {
  return Session.get("x");
};

Template.timer.y = function () {
  return Session.get("y");
};

Template.stateDemo.z =
function () {
  return Session.get("z");
};

<<<<<<< HEAD

Template.page.events({
=======
<<<<<<< HEAD
Template.page.events = {
>>>>>>> 87bebaa50dc16e9b2df4fb78237421b9b44e4a32:examples/other/template-demo/client/template-demo.js
=======
Template.page.events({
>>>>>>> 9005cf34a0efeedfb339bbb7fd6ef7de6cb37def
>>>>>>> d6b9f4960f57f2e43e76bce760253958d48c289e
  'click input.x': function () {
    Session.set("x", Session.get("x") + 1);
  },

  'click input.y': function () {
    Session.set("y", Session.get("y") + 1);
  },

  'click input.z': function () {
    Session.set("z", Session.get("z") + 1);
  }
});

///////////////////////////////////////////////////////////////////////////////

if (typeof Session.get("spinForward") !== 'boolean') {
  Session.set("spinForward", true);
}

Template.preserveDemo.preserve([ '.spinner', '.spinforward' ]);

Template.preserveDemo.create = function() {
  if (typeof this.get("spinForward") !== 'boolean') {
    this.set("spinForward", true);
  }
}

Template.preserveDemo.spinForwardChecked = function () {
  return this.template.get('spinForward') ? 'checked="checked"' : '';
};

Template.preserveDemo.spinAnim = function () {
  return this.template.get('spinForward') ? 'spinForward' : 'spinBackward';
};

<<<<<<< HEAD

Template.preserveDemo.events({
  'change .spinforward' : function (event) {
    Session.set('spinForward', event.currentTarget.checked);
=======
<<<<<<< HEAD
Template.preserveDemo.events = {
  'change .spinforward' : function (event,template) {
    template.set('spinForward', event.currentTarget.checked);
=======
Template.preserveDemo.events({
  'change .spinforward' : function (event) {
    Session.set('spinForward', event.currentTarget.checked);
>>>>>>> 9005cf34a0efeedfb339bbb7fd6ef7de6cb37def
>>>>>>> d6b9f4960f57f2e43e76bce760253958d48c289e
  }
});

///////////////////////////////////////////////////////////////////////////////

Template.constantDemo.checked = function (which) {
  return Session.get('mapchecked' + which) ? 'checked="checked"' : '';
};

Template.constantDemo.show = function (which) {
  return ! Session.get('mapchecked' + which);
};

Template.constantDemo.events({
  'change .remove' : function (event) {
    var tgt = event.currentTarget;
    Session.set('mapchecked' + tgt.getAttribute("which"), tgt.checked);
  }
});

///////////////////////////////////////////////////////////////////////////////

Template.stateDemo.events({
  'click .create': function () {
    Timers.insert({});
  }
});

Template.stateDemo.timers = function () {
  return Timers.find();
};

Template.timer.events({
  'click .reset': function (event, template) {
    template.elapsed = 0;
    updateTimer(template);
  },
  'click .delete': function () {
    Timers.remove(this._id);
  }
});

var updateTimer = function (timer) {
  timer.node.innerHTML = timer.elapsed + " second" +
    ((timer.elapsed === 1) ? "" : "s");
};

Template.timer.created = function () {
  var self = this;
  self.elapsed = 0;
  self.node = null;
};

Template.timer.rendered = function () {
  var self = this;
  self.node = this.find(".elapsed");
  updateTimer(self);

  if (! self.timer) {
    var tick = function () {
      self.elapsed++;
      self.timer = setTimeout(tick, 1000);
      updateTimer(self);
    };
    tick();
  }
};

Template.timer.destroyed = function () {
  clearInterval(this.timer);
};

///////////////////////////////////////////////////////////////////////////////

// Run f(). Record its dependencies. Rerun it whenever the
// dependencies change.
//
// Returns an object with a stop() method. Call stop() to stop the
// rerunning.
//
// XXX this should go into Meteor core as Meteor.autorun
var autorun = function (f) {
  var ctx;
  var slain = false;
  var rerun = function () {
    if (slain)
      return;
    ctx = new Meteor.deps.Context;
    ctx.run(f);
    ctx.on_invalidate(rerun);
  };
  rerun();
  return {
    stop: function () {
      slain = true;
      ctx.invalidate();
    }
  };
};

Template.d3Demo.left = function () {
  return { group: "left" };
};

Template.d3Demo.right = function () {
  return { group: "right" };
};

<<<<<<< HEAD

Template.circles.events({
=======
<<<<<<< HEAD
Template.circles.events = {
<<<<<<< HEAD:examples/landmark-demo/client/landmark-demo.js
  'click circle': function (evt, template) {
    // XXX actually want to create a ReactiveVar on the template!
    // (but how will it be preserved across migration?)
    // (maybe template.get, template.set?? rather than form??)
    template.set("selectedCircle:" + this.group, evt.currentTarget.id);
    
=======
=======
Template.circles.events({
>>>>>>> 9005cf34a0efeedfb339bbb7fd6ef7de6cb37def
>>>>>>> d6b9f4960f57f2e43e76bce760253958d48c289e
  'mousedown circle': function (evt, template) {
    Session.set("selectedCircle:" + this.group, evt.currentTarget.id);
  },
  'click .add': function () {
    Circles.insert({x: Meteor.random(), y: Meteor.random(),
                    r: Meteor.random() * .1 + .02,
                    color: {
                      r: Meteor.random(),
                      g: Meteor.random(),
                      b: Meteor.random()
                    },
                    group: this.group
                   });
  },
  'click .remove': function (evt,template) {
    var selected = template.get("selectedCircle:" + this.group);
    if (selected) {
      Circles.remove(selected);
      template.set("selectedCircle:" + this.group, null);
    }
  },
  'click .scram': function () {
    Circles.find({group: this.group}).forEach(function (r) {
      Circles.update(r._id, {
        $set: {
          x: Meteor.random(), y: Meteor.random(), r: Meteor.random() * .1 + .02
        }
      });
    });
  }
});

var colorToString = function (color) {
  var f = function (x) { return Math.floor(x * 256); };
  return "rgb(" + f(color.r) + "," +
    + f(color.g) + "," + + f(color.b) + ")";
};

Template.circles.count = function (arg1,arg2) {
  return Circles.find({group: this.group}).count();
};

Template.circles.disabled = function () {
  return this.template.get("selectedCircle:" + this.group) ?
    '' : 'disabled="disabled"';
};

Template.circles.created = function () {
};

Template.circles.rendered = function () {
  var self = this;
  self.node = self.find("svg");

  var data = self.data;

  if (! self.handle) {
    d3.select(self.node).append("rect");
    self.handle = autorun(function () {
      var circle = d3.select(self.node).selectAll("circle")
        .data(Circles.find({group: data.group}).fetch(),
              function (d) { return d._id; });

      circle.enter().append("circle")
        .attr("id", function (d) {
          return d._id;
        })
        .attr("cx", function (d) {
          return d.x * 272;
        })
        .attr("cy", function (d) {
          return d.y * 272;
        })
        .attr("r", 50)
        .style("fill", function (d) {
          return colorToString(d.color);
        })
        .style("opacity", 0);

      circle.transition()
        .duration(250)
        .attr("cx", function (d) {
          return d.x * 272;
        })
        .attr("cy", function (d) {
          return d.y * 272;
        })
        .attr("r", function (d) {
          return d.r * 272;
        })
        .style("fill", function (d) {
          return colorToString(d.color);
        })
        .style("opacity", .9)
        .ease("cubic-out");

      circle.exit().transition()
        .duration(250)
        .attr("r", 0)
        .remove();

<<<<<<< HEAD:examples/landmark-demo/client/landmark-demo.js
      // XXX this doesn't animate as I'd hoped when you press Scram
      var selectionId = self.get("selectedCircle:" + data.group);
=======
      var selectionId = Session.get("selectedCircle:" + data.group);
>>>>>>> 87bebaa50dc16e9b2df4fb78237421b9b44e4a32:examples/other/template-demo/client/template-demo.js
      var s = selectionId && Circles.findOne(selectionId);
      var rect = d3.select(self.node).select("rect");
      if (s)
        rect.attr("x", (s.x - s.r) * 272)
        .attr("y", (s.y - s.r) * 272)
        .attr("width", s.r * 2 * 272)
        .attr("height", s.r * 2 * 272)
        .attr("display", '')
        .style("fill", "none")
        .style("stroke", "red")
        .style("stroke-width", 3);
      else
        rect.attr("display", 'none');
    });
  }
};

Template.circles.destroyed = function () {
  this.handle && this.handle.stop();
};
