;(function() {
  Package.describe({
    summary: "HTML enhanced for web apps!",
  });

  Package.on_use(function (api) {
    api.use('jquery');
    api.add_files(['angular.js', 'angular-mocks.js'], 'client');
    api.add_files('server.js', 'server');
    api.add_files(['services.js', 'startup.js'], ['client', 'server']);
  });

  var fs = require('fs');
  var path = require('path');
  var _ = require('lodash');

  Package.register_extension(
    "html", function (bundle, source_path, serve_path, where) {
      if (where !== "client")
        // XXX might be nice to throw an error here, but then we'd have
        // to make it so that packages.js ignores html files that appear
        // in the server directories in an app tree.. or, it might be
        // nice to make html files actually work on the server (against
        // jsdom or something)
        return;

      // XXX the way we deal with encodings here is sloppy .. should get
      // religion on that
      var contents = fs.readFileSync(source_path);

      // XXX super lame! we actually have to give paths relative to
      // app/inner/app.js, since that's who's evaling us.
      var html_scanner = require(path.join('..', '..', 'packages', 'angular', 'html_scanner.js'));
      var results = html_scanner.scan(contents.toString('utf8'), source_path);

      if (results.head)
        bundle.add_resource({
          type: "head",
          data: results.head,
          where: where
        });

      if (results.body)
        bundle.add_resource({
          type: "body",
          data: results.body,
          where: where
        });
      var js = '';

      var path_part = path.dirname(serve_path);
      if (path_part === '.')
        path_part = '';
      if (path_part.length && path_part !== path.sep)
        path_part = path_part + path.sep;
      var ext = path.extname(source_path);
      var basename = path.basename(serve_path, ext);
      var template_path = path_part + basename;
      _.each(results.templates, function(contents, name) {
      	name = name === 'index' ?  template_path : template_path + '.' + name;
      	js += "Meteor._def_angular_template('" + name+ "', " + JSON.stringify(contents) + ");";
      });

      if (js) {
        
        serve_path = path_part + "template." + basename + ".js";

      	bundle.add_resource({
          type: "js",
          path: serve_path,
          data: new Buffer(js),
          source_file: source_path,
          where: where
        });
      }
    }
  );
})();