////////// Requires //////////

require("fibers");

var fs = require("fs");
var path = require("path");

var express = require('express');
var gzippo = require('gzippo');
var argv = require('optimist').argv;
var mime = require('mime');
var handlebars = require('handlebars');
var useragent = require('useragent');
//var bundler = require(path.resolve('lib/bundler'));

// this is a copy of underscore that will be shipped just for use by
// this file, server.js.
var _ = require('./underscore.js');

// Keepalives so that when the outer server dies unceremoniously and
// doesn't kill us, we quit ourselves. A little gross, but better than
// pidfiles.
var init_keepalive = function () {
  var keepalive_count = 0;

  process.stdin.on('data', function (data) {
    keepalive_count = 0;
  });

  process.stdin.resume();

  setInterval(function () {
    keepalive_count ++;
    if (keepalive_count >= 2) {
      console.log("Failed to receive keepalive! Exiting.");
      process.exit(1);
    }
  }, 3000);
};

var supported_browser = function (user_agent) {
  return true;

  // For now, we don't actually deny anyone. The unsupported browser
  // page isn't very good.
  //
  // var agent = useragent.lookup(user_agent);
  // return !(agent.family === 'IE' && +agent.major <= 5);
};

var buildRouteTable = function(){
  var dirs = fs.readdirSync('.');
  if(dirs && dirs.length > 0){
    var routes = {};

    // Collect folder -> route mappings
    _.each(dirs, function(val){
      if(val[0] != '.'){
        routes[val] = val;
      }
    });

    //  Collect route aliases/overrides
    var app_dir = path.join(__dirname, '../../../..');
    var routesPath = path.join(app_dir, '.meteor/routes');
    if(path.existsSync(routesPath)){
      var aliases = fs.readFileSync(path.join(app_dir, '.meteor/routes'));
      aliases = JSON.parse(aliases);

      _.each(aliases, function(val, key){
        routes[key] = val;
      });

      //  Validate routes, ensure the folder exists and is a meteor app
      _.each(routes, function(val, key){
        if(!path.existsSync(path.join('./', val)) || !path.existsSync(path.join('./', val, '.meteor'))){
          throw new Error("Route file contains a path that does not exist");
        }
      });
    }

    return routes;
  }
};

var get_html = function(app, bundle_dir) {
  var app_html = fs.readFileSync(path.join(bundle_dir, 'app.html'));
  var unsupported_html = fs.readFileSync(path.join(bundle_dir, 'unsupported.html'));
  return {app: app_html, unsupported: unsupported_html };
}


function serveRoute(req, res, bundle){
    res.writeHead(200, {'Content-Type': 'text/html'});
    if (supported_browser(req.headers['user-agent']))
      res.write(bundle.app);
    else
      res.write(bundle.unsupported);
    res.end();
}

var run = function (bundle_dir) {
  var routes = buildRouteTable();

  var bundle_dir = path.join(__dirname, '..');
  if(routes){
    bundle_dir = getBundleDir(routes.root);
    //delete routes.root;
  }

  // check environment
  var port = process.env.PORT ? parseInt(process.env.PORT) : 80;

  // webserver
  var app = express.createServer();
  var staticPath = path.join(__dirname, '..', 'static');
  app.use(express.bodyParser());
  _.each(routes, function(val, key){
    staticPath = path.join(getBundleDir(val), 'static');
    app.use('/' + val + '/', gzippo.staticGzip(staticPath));
  });
  app.use(app.router);

  var rootBundle = get_html(app, bundle_dir);
  app.use(function (req, res) {
    // prevent favicon.ico and robots.txt from returning app_html
    if (_.indexOf(['/favicon.ico', '/robots.txt'], req.url) !== -1) {
      res.writeHead(404);
      res.end();
      return;
    }

    serveRoute(req, res, rootBundle);
  });

  __meteor_bootstrap__ = {require: require, startup_hooks: [], app: app};
    // start up app
  var mongo_url = process.env.MONGO_URL;
  if (!mongo_url)
    throw new Error("MONGO_URL must be set in environment");

  if(routes){
    _.each(routes, function(val, key){
      var bundle = get_html(app, getBundleDir(val));
      app.get('/' + val + '/*', function(req, res){
        serveRoute(req, res, bundle);
      });
    })
  }

  Fiber(function () {
    // (put in a fiber to let Meteor.db operations happen during loading)

    // pass in database info
    __meteor_bootstrap__.mongo_url = mongo_url;
    runServerCode(app, bundle_dir);

    if(routes){
      _.each(routes, function(val, key){
        runServerCode(app, getBundleDir(val));
      });
    }

    // run the user startup hooks.
    _.each(__meteor_bootstrap__.startup_hooks, function (x) { x(); });

    // only start listening after all the startup code has run.
    app.listen(port, function() {
      if (argv.keepalive)
        console.log("LISTENING"); // must match run.js
    });
  }).run();


  if (argv.keepalive)
    init_keepalive();
};


function runServerCode(app, bundle_dir){
    // read bundle config file
  var info_raw =
    fs.readFileSync(path.join(bundle_dir, 'app.json'), 'utf8');
  var info = JSON.parse(info_raw);

  var vm = require('vm');
  var ctx = vm.createContext(
    {
      console: console,
      process: process,
      setInterval: setInterval,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      Fiber: Fiber,
      __meteor_bootstrap__: __meteor_bootstrap__
    }
  );

  // load app code
  _.each(info.load, function (filename) {
    var code = fs.readFileSync(path.join(bundle_dir, filename));
    vm.runInContext(code, ctx, filename, true);
  });
}


function getBundleDir(subapp){
  return bundle_dir = path.join(__dirname, '../../../..', subapp, '.meteor/local/build');
}

run();
