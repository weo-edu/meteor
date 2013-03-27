Tinytest.add("routepolicy", function (test) {
  var policy = new Meteor.__RoutePolicyConstructor();

  policy.declare('/sockjs/', 'network');
  policy.declare('/bigphoto.jpg', 'static-online');
  policy.declare('/anotherphoto.png', 'static-online');

  test.equal(policy.classify('/'), null);
  test.equal(policy.classify('/foo'), null);
  test.equal(policy.classify('/sockjs'), null);

  test.equal(policy.classify('/sockjs/'), 'network');
  test.equal(policy.classify('/sockjs/foo'), 'network');

  test.equal(policy.classify('/bigphoto.jpg'), 'static-online');
  test.equal(policy.classify('/bigphoto.jpg.orig'), 'static-online');

  test.equal(policy.urlPrefixesFor('network'), ['/sockjs/']);
  test.equal(
    policy.urlPrefixesFor('static-online'),
    ['/anotherphoto.png', '/bigphoto.jpg']
  );
});

Tinytest.add("routepolicy - static conflicts", function (test) {
  var manifest = [
    {
      "path": "static/sockjs/socks-are-comfy.jpg",
      "type": "static",
      "where": "client",
      "url": "/sockjs/socks-are-comfy.jpg"
    },
    {
      "path": "static/bigphoto.jpg",
      "type": "static",
      "where": "client",
      "url": "/bigphoto.jpg"
    }
  ];
  var policy = new Meteor.__RoutePolicyConstructor();

  test.equal(
    policy.checkForConflictWithStatic('/sockjs/', 'network', manifest),
    "static resource /sockjs/socks-are-comfy.jpg conflicts with network route /sockjs/"
  );

  test.equal(
    policy.checkForConflictWithStatic('/bigphoto.jpg', 'static-online', manifest),
    null
  );
});
