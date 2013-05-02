Package.describe({
  summary: 'Expressive, dynamic, robust CSS.'
});

var stylus = require('stylus');
var nib = require('nib');
var fs = require('fs');
var crypto = require('crypto');
var path = require('path');

var total = 0;
Package.register_extension(
  'styl', function(bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path, 'utf8');
    var hash = crypto.createHash('sha1').update(contents).digest('hex');
    var oldFile = path.join(bundle.build_path, 'static', serve_path);
    if(bundle.cache(source_path) === hash
      && fs.existsSync(oldFile)) {
      bundle.add_resource({
        type: 'css',
        path: serve_path,
        source_file: oldFile,
        where: where
      });
    } else {
      bundle.cache(source_path, hash);

      var start = +new Date;
      stylus(contents)
      .use(nib())
      .set('filename', source_path)
      .render(function(err, css) {
        if (err) {
          bundle.error('Stylus compiler error: ' + err.message);
          return;
        }
        console.log('stylus time', serve_path, +new Date - start, total += (+new Date - start));
        bundle.add_resource({
          type: 'css',
          path: serve_path,
          data: new Buffer(css),
          where: where
        });
      });
    }
  }
);

Package.on_test(function (api) {
  api.add_files(['stylus_tests.styl', 'stylus_tests.js'], 'client');
});
