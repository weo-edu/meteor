
Tinytest.add("templating - assembly", function (test) {

  // Test for a bug that made it to production -- after a replacement,
  // we need to also check the newly replaced node for replacements
  var frag = Meteor.render(Template.test_assembly_a0);
  test.equal(canonicalizeHtml(DomUtils.fragmentToHtml(frag)),
               "Hi");

  // Another production bug -- we must use LiveRange to replace the
  // placeholder, or risk breaking other LiveRanges
  Session.set("stuff", true); // XXX bad form to use Session in a test?
  Template.test_assembly_b1.stuff = function () {
    return Session.get("stuff");
  };
  var onscreen = DIV({style: "display: none"}, [
    Meteor.render(Template.test_assembly_b0)]);
  document.body.appendChild(onscreen);
  test.equal(canonicalizeHtml(onscreen.innerHTML), "xyhi");
  Session.set("stuff", false);
  Meteor.flush();
  test.equal(canonicalizeHtml(onscreen.innerHTML), "x<!---->hi");
  document.body.removeChild(onscreen);
  Meteor.flush();
});

// Test that if a template throws an error, then pending_partials is
// cleaned up properly (that template rendering doesn't break..)






Tinytest.add("templating - table assembly", function(test) {
  var childWithTag = function(node, tag) {
    return _.find(node.childNodes, function(n) {
      return n.nodeName === tag;
    });
  };

  var table;

  table = childWithTag(Meteor.render(Template.test_table_a0), "TABLE");

  // table.rows is a great test, as it fails not only when TR/TD tags are
  // stripped due to improper html-to-fragment, but also when they are present
  // but don't show up because we didn't create a TBODY for IE.
  test.equal(table.rows.length, 3);

  // this time with an explicit TBODY
  table = childWithTag(Meteor.render(Template.test_table_b0), "TABLE");
  test.equal(table.rows.length, 3);

  var c = new LocalCollection();
  c.insert({bar:'a'});
  c.insert({bar:'b'});
  c.insert({bar:'c'});
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(
    Meteor.render(_.bind(Template.test_table_each, null, {foo: c.find()})));
  document.body.appendChild(onscreen);
  table = childWithTag(onscreen, "TABLE");

  test.equal(table.rows.length, 3, table.parentNode.innerHTML);
  var tds = onscreen.getElementsByTagName("TD");
  test.equal(tds.length, 3);
  test.equal(tds[0].innerHTML, "a");
  test.equal(tds[1].innerHTML, "b");
  test.equal(tds[2].innerHTML, "c");


  document.body.removeChild(onscreen);
  Meteor.flush();
});

Tinytest.add("templating - event handler this", function(test) {

  Template.test_event_data_with.ONE = {str: "one"};
  Template.test_event_data_with.TWO = {str: "two"};
  Template.test_event_data_with.THREE = {str: "three"};

  var event_buf = [];
  var tmpl = OnscreenDiv(
    Meteor.render(function () {
      var html = Template.test_event_data_with(
        Template.test_event_data_with.ONE);
      html = Spark.attachEvents({
        'click': function() {
          test.isTrue(this.str);
          event_buf.push(this.str);
        }
      }, html);
      return html;
    }));

  var divs = tmpl.node().getElementsByTagName("div");
  test.equal(3, divs.length);

  clickElement(divs[0]);
  test.equal(event_buf, ['one']);
  event_buf.length = 0;

  clickElement(divs[1]);
  test.equal(event_buf, ['two']);
  event_buf.length = 0;

  clickElement(divs[2]);
  test.equal(event_buf, ['three']);
  event_buf.length = 0;

  tmpl.kill();
  Meteor.flush();
});

Tinytest.add("templating - safestring", function(test) {

  Template.test_safestring_a.foo = function() {
    return "1<2";
  };
  Template.test_safestring_a.bar = function() {
    return new Handlebars.SafeString("3<4");
  };

  var obj = {fooprop: "1<2",
             barprop: new Handlebars.SafeString("3<4")};

  test.equal(Template.test_safestring_a(obj).replace(/\s+/g, ' '),
             "1&lt;2 1<2 3<4 3<4 1<2 3<4 "+
             "1&lt;2 1<2 3<4 3<4 1<2 3<4");

});

Tinytest.add("templating - helpers and dots", function(test) {
  Handlebars.registerHelper("platypus", function() {
    return "eggs";
  });
  Handlebars.registerHelper("watermelon", function() {
    return "seeds";
  });

  Handlebars.registerHelper("daisygetter", function() {
    return this.daisy;
  });

  // XXX for debugging
  Handlebars.registerHelper("debugger", function() {
    debugger;
  });

  var getFancyObject = function() {
    return {
      foo: 'bar',
      apple: {banana: 'smoothie'},
      currentFruit: function() {
        return 'guava';
      },
      currentCountry: function() {
        return {name: 'Iceland',
                _pop: 321007,
                population: function() {
                  return this._pop;
                },
                unicorns: 0, // falsy value
                daisyGetter: function() {
                  return this.daisy;
                }
               };
      }
    };
  };

  Handlebars.registerHelper("fancyhelper", getFancyObject);

  Template.test_helpers_a.platypus = 'bill';
  Template.test_helpers_a.warthog = function() {
    return 'snout';
  };

  var listFour = function(a, b, c, d, options) {
    var keywordArgs = _.map(_.keys(options.hash), function(k) {
      return k+':'+options.hash[k];
    });
    return [a, b, c, d].concat(keywordArgs).join(' ');
  };

  var dataObj = {
    zero: 0,
    platypus: 'weird',
    watermelon: 'rind',
    daisy: 'petal',
    tree: function() { return 'leaf'; },
    thisTest: function() { return this.tree(); },
    fancy: getFancyObject(),
    methodListFour: listFour
  };

  test.equal(Template.test_helpers_a(dataObj).match(/\S+/g), [
    'platypus=bill', // helpers on Template object take first priority
    'watermelon=seeds', // global helpers take second priority
    'daisy=petal', // unshadowed object property
    'tree=leaf', // function object property
    'warthog=snout' // function Template property
  ]);

  test.equal(Template.test_helpers_b(dataObj).match(/\S+/g), [
    // unknown properties silently fail
    'unknown=',
    // falsy property comes through
    'zero=0'
  ]);

  test.equal(Template.test_helpers_c(dataObj).match(/\S+/g), [
    // property gets are supposed to silently fail
    'platypus.X=',
    'watermelon.X=',
    'daisy.X=',
    'tree.X=',
    'warthog.X='
  ]);

  test.equal(Template.test_helpers_d(dataObj).match(/\S+/g), [
    // helpers should get current data context in `this`
    'daisygetter=petal',
    // object methods should get object in `this`
    'thisTest=leaf',
    // nesting inside {{#with fancy}} shouldn't affect
    // method
    '../thisTest=leaf',
    // combine .. and .
    '../fancy.currentFruit=guava'
  ]);

  test.equal(Template.test_helpers_e(dataObj).match(/\S+/g), [
    'fancy.foo=bar',
    'fancy.apple.banana=smoothie',
    'fancy.currentFruit=guava',
    'fancy.currentCountry.name=Iceland',
    'fancy.currentCountry.population=321007',
    'fancy.currentCountry.unicorns=0'
  ]);

  test.equal(Template.test_helpers_f(dataObj).match(/\S+/g), [
    'fancyhelper.foo=bar',
    'fancyhelper.apple.banana=smoothie',
    'fancyhelper.currentFruit=guava',
    'fancyhelper.currentCountry.name=Iceland',
    'fancyhelper.currentCountry.population=321007',
    'fancyhelper.currentCountry.unicorns=0'
  ]);

  // test significance of 'this', which prevents helper from
  // shadowing property
  test.equal(Template.test_helpers_g(dataObj).match(/\S+/g), [
    'platypus=eggs',
    'this.platypus=weird'
  ]);

  // test interpretation of arguments

  Template.test_helpers_h.helperListFour = listFour;

  var trials =
        Template.test_helpers_h(dataObj).match(/\(.*?\)/g);
  test.equal(trials[0],
             '(methodListFour 6 7 8 9=6 7 8 9)');
  test.equal(trials[1],
             '(methodListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns=eggs leaf guava 0)');
  test.equal(trials[2],
             '(methodListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns a=platypus b=thisTest c=fancyhelper.currentFruit d=fancyhelper.currentCountry.unicorns=eggs leaf guava 0 a:eggs b:leaf c:guava d:0)');
  test.equal(trials[3],
             '(helperListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns=eggs leaf guava 0)');
  test.equal(trials[4],
             '(helperListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns a=platypus b=thisTest c=fancyhelper.currentFruit d=fancyhelper.currentCountry.unicorns=eggs leaf guava 0 a:eggs b:leaf c:guava d:0)');
  test.equal(trials.length, 5);

  // test interpretation of block helper invocation

  Template.test_helpers_i.uppercase = function(fn) {
    return fn().toUpperCase();
  };
  Template.test_helpers_i.tr = function(options) {
    var str = options.fn();
    _.each(options.hash, function(v,k) {
      str = str.replace(new RegExp(k, 'g'), v);
    });
    return str;
  };
  Template.test_helpers_i.arg_and_dict = function(arg, options) {
    if (typeof options.hash !== "object")
      throw new Error();
    return _.keys(options.hash).length;
  };
  Template.test_helpers_i.get_arg = function(arg) {
    return arg;
  };
  Template.test_helpers_i.two_args = function(arg1, arg2) {
    return [typeof arg1 === "string",
            typeof arg2 === "string"].join();
  };
  Template.test_helpers_i.helperListFour = listFour;

  trials =
        Template.test_helpers_i(dataObj).match(/\(.*?\)/g);
  test.equal(trials[0], "(uppercase apple=APPLE)");
  test.equal(trials[1], "(altered banana=bododo)");
  // presence of arg should prevent keyword arguments from
  // being passed to block helper, whether or not the arg
  // is a function.
  test.equal(trials[2], "(nokeys=0)");
  test.equal(trials[3], "(nokeys=0)");
  test.equal(trials[4],
             '(biggie=eggs leaf guava 0 a:eggs b:leaf c:guava d:0)');
  // can't pass > 1 positional arg to block helper
  test.equal(trials[5], "(twoArgBlock=true,false)");
  test.equal(trials.length, 6);
});


Tinytest.add("templating - rendered template", function(test) {
  var R = ReactiveVar('foo');
  Template.test_render_a.foo = function() {
    R.get();
    return this.x + 1;
  };

  Template.test_render_a.preserve = ['br'];

  var div = OnscreenDiv(
    Meteor.render(function () {
      return Template.test_render_a({ x: 123 });
    }));

  test.equal(div.text().match(/\S+/)[0], "124");

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  R.set('bar');
  Meteor.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Meteor.flush();

  /////

  R = ReactiveVar('foo');

  Template.test_render_b.foo = function() {
    R.get();
    return (+this) + 1;
  };
  Template.test_render_b.preserve = ['br'];

  div = OnscreenDiv(
    Meteor.render(function () {
      return Template.test_render_b({ x: 123 });
    }));

  test.equal(div.text().match(/\S+/)[0], "201");

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  R.set('bar');
  Meteor.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Meteor.flush();

  /////

  var stuff = new LocalCollection();
  stuff.insert({foo:'bar'});

  Template.test_render_c.preserve = ['br'];

  div = OnscreenDiv(
    Meteor.renderList(
      stuff.find(), function (data) {
        return Template.test_render_c(data, 'blah');
      }));

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  stuff.update({foo:'bar'}, {$set: {foo: 'baz'}});
  Meteor.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Meteor.flush();

  /////

  var stuff = new LocalCollection();
  stuff.insert({foo:'bar'});

  Template.test_render_c.preserve = ['br'];

  div = OnscreenDiv(Meteor.renderList(stuff.find(),
                                      Template.test_render_c));

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  stuff.update({foo:'bar'}, {$set: {foo: 'baz'}});
  Meteor.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Meteor.flush();

});

Tinytest.add("templating - branch labels", function(test) {
  var R = ReactiveVar('foo');
  Template.test_branches_a['var'] = function () {
    return R.get();
  };

  var elems = [];

  // use constant landmarks to test that each
  // block helper invocation gets a different label
  Template.test_branches_a.myConstant = function (options) {
    var data = this;
    var firstRender = true;
    return Spark.createLandmark({ constant: true,
                                  render: function () {
                                    if (! firstRender)
                                      return;
                                    firstRender = false;
                                    var hr = this.find('hr');
                                    hr.myIndex = elems.length;
                                    elems.push(this.find('hr'));
                                  }},
                                function () {
                                  return options.fn(data);
                                });
  };

  var div = OnscreenDiv(Meteor.render(Template.test_branches_a));
  Meteor.flush();
  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'foo');
  test.equal(elems.length, 3);

  R.set('bar');
  Meteor.flush();
  var elems2 = DomUtils.findAll(div.node(), 'hr');
  elems2.sort(function(a, b) { return a.myIndex - b.myIndex; });
  test.equal(elems[0], elems2[0]);
  test.equal(elems[1], elems2[1]);
  test.equal(elems[2], elems2[2]);
  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'bar');

  div.kill();
  Meteor.flush();
});

Tinytest.add("templating - matching in list", function (test) {
  var c = new LocalCollection();
  c.insert({letter:'a'});
  c.insert({letter:'b'});
  c.insert({letter:'c'});

  _.extend(Template.test_listmatching_a0, {
    'var': function () { return R.get(); },
    c: function () { return c.find(); }
  });

  var buf = [];
  _.extend(Template.test_listmatching_a1, {
    create: function () { buf.push('+'); },
    render: function () {
      var letter = DomUtils.rangeToHtml(this.firstNode,
                                        this.lastNode).match(/\S+/)[0];
      buf.push('*'+letter);
    },
    destroy: function () { buf.push('-'); }
  });

  var R = ReactiveVar('foo');
  var div = OnscreenDiv(Spark.render(Template.test_listmatching_a0));
  Meteor.flush();

  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'foo');
  test.equal(div.html().match(/<p>(.*?)<\/p>/)[1].match(/\S+/g), ['a','b','c']);
  test.equal(buf.join(''), '+++*a*b*c');

  buf.length = 0;
  R.set('bar');
  Meteor.flush();
  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'bar');
  test.equal(div.html().match(/<p>(.*?)<\/p>/)[1].match(/\S+/g), ['a','b','c']);
  test.equal(buf.join(''), '*a*b*c');

  div.kill();
  Meteor.flush();

});

Tinytest.add("templating - isolate helper", function (test) {
  var Rs = _.map(_.range(4), function () { return ReactiveVar(1); });
  var touch = function (n) { Rs[n-1].get(); };
  var bump = function (n) { Rs[n-1].set(Rs[n-1].get() + 1); };
  var counts = _.map(_.range(4), function () { return 0; });
  var tally = function (n) { return ++counts[n-1]; };

  _.extend(Template.test_isolate_a, {
    helper: function (n) {
      touch(n);
      return tally(n);
    }
  });

  var div = OnscreenDiv(Meteor.render(Template.test_isolate_a));

  var getTallies = function () {
    return _.map(div.html().match(/\S+/g), Number);
  };
  var expect = function(str) {
    test.equal(getTallies().join(','), str);
  };

  Meteor.flush();
  expect("1,1,1,1");
  bump(1);  Meteor.flush();  expect("2,2,2,2");
  bump(2);  Meteor.flush();  expect("2,3,3,3");
  bump(3);  Meteor.flush();  expect("2,3,4,4");
  bump(4);  Meteor.flush();  expect("2,3,4,5");
  Meteor.flush(); expect("2,3,4,5");
  bump(3);  Meteor.flush();  expect("2,3,5,6");
  bump(2);  Meteor.flush();  expect("2,4,6,7");
  bump(1);  Meteor.flush();  expect("3,5,7,8");

  div.kill();
  Meteor.flush();

});

Tinytest.add("templating - template arg", function (test) {
  Template.test_template_arg_a.events = {
    click: function (event, template) {
      template.firstNode.innerHTML = 'Hello';
      template.lastNode.innerHTML = 'World';
      template.find('i').innerHTML =
        (template.findAll('*').length)+"-element";
      template.lastNode.innerHTML += ' (the secret is '+
        template.secret+')';
    }
  };

  Template.test_template_arg_a.create = function() {
    var self = this;
    test.isFalse(self.firstNode);
    test.isFalse(self.lastNode);
    test.throws(function () { return self.find("*"); });
    test.throws(function () { return self.findAll("*"); });
  };

  Template.test_template_arg_a.render = function () {
    var template = this;
    template.firstNode.innerHTML = 'Greetings';
    template.lastNode.innerHTML = 'Line';
    template.find('i').innerHTML =
      (template.findAll('b').length)+"-bold";
    template.secret = "strawberry "+template.data.food;
  };

  Template.test_template_arg_a.destroy = function() {
    var self = this;
    test.isFalse(self.firstNode);
    test.isFalse(self.lastNode);
    test.throws(function () { return self.find("*"); });
    test.throws(function () { return self.findAll("*"); });
  };

  var div = OnscreenDiv(Spark.render(function () {
    return Template.test_template_arg_a({food: "pie"});
  }));

  test.equal(div.text(), "Foo Bar Baz");
  Meteor.flush();
  test.equal(div.text(), "Greetings 1-bold Line");
  clickElement(DomUtils.find(div.node(), 'i'));
  test.equal(div.text(), "Hello 3-element World (the secret is strawberry pie)");

  div.kill();
  Meteor.flush();
});
